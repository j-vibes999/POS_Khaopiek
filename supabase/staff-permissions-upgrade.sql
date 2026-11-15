-- Limit protected history at the database boundary and allow an existing
-- trusted counter to use cashier access. Installation changes no device's role.
begin;

do $$ begin
  if pg_catalog.to_regprocedure('public.pos_device_read(text,text,jsonb)') is null then
    raise exception 'Install the earlier POS migrations, including staff reads, first';
  end if;
end $$;

-- Keep the original owner binding for owner adoption and rollback. The
-- separate cashier identity owns new activity and remains valid in history.
alter table private.pos_devices
  add column if not exists cashier_only boolean not null default false,
  add column if not exists cashier_membership_id uuid;

-- Retain the existing constraint name so older setup scripts do not replace it.
alter table public.restaurant_memberships
  drop constraint if exists device_owner_or_auth_user,
  add constraint device_owner_or_auth_user check(user_id is not null or role in ('owner','cashier'));
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='private.pos_devices'::regclass and conname='pos_devices_cashier_membership_fk') then
    alter table private.pos_devices add constraint pos_devices_cashier_membership_fk
      foreign key(restaurant_id,cashier_membership_id)
      references public.restaurant_memberships(restaurant_id,id) on delete restrict;
    alter table private.pos_devices add constraint pos_devices_cashier_membership_check
      check (
        (cashier_membership_id is null or (membership_id is not null and cashier_membership_id<>membership_id))
        and (not cashier_only or cashier_membership_id is not null)
      );
  end if;
end $$;
create unique index if not exists pos_devices_cashier_membership_uidx
  on private.pos_devices(cashier_membership_id) where cashier_membership_id is not null;

-- Called by the SQL Editor administrator after verifying owner sign-in on the
-- same shop. No browser role can use this function, including account owners.
create or replace function private.pos_set_device_cashier_access(p_device_id uuid,p_cashier_only boolean)
returns text language plpgsql volatile set search_path = '' as $$
declare device private.pos_devices; rid uuid; cashier_id uuid;
begin
  if p_device_id is null or p_cashier_only is null then raise exception 'Device ID and cashier mode are required'; end if;
  select d.restaurant_id into rid from private.pos_devices d where d.id=p_device_id and d.enabled;
  if rid is null then raise exception 'An active registered shop device is required'; end if;
  perform private.pos_lock(rid);
  select d.* into device from private.pos_devices d where d.id=p_device_id and d.restaurant_id=rid and d.enabled for update;
  if device.id is null or not exists (
    select 1 from public.restaurant_memberships m join public.restaurants r on r.id=m.restaurant_id
    where m.restaurant_id=rid and m.id=device.membership_id and m.active and m.role='owner' and r.enabled
  ) then raise exception 'An active registered shop device with an owner is required'; end if;

  if not p_cashier_only then
    update private.pos_devices set cashier_only=false where id=device.id;
    return 'owner';
  end if;

  if not exists (
    select 1 from public.restaurant_memberships m join auth.users u on u.id=m.user_id
    where m.restaurant_id=rid and m.active and m.role='owner' and u.email_confirmed_at is not null
  ) then raise exception 'Verify an owner account for this shop before enabling cashier access'; end if;

  cashier_id:=device.cashier_membership_id;
  if cashier_id is null then
    insert into public.restaurant_memberships(restaurant_id,user_id,display_name,role)
      values(rid,null,'ຈຸດຮັບເງິນ','cashier') returning id into cashier_id;
  elsif not exists(
    select 1 from public.restaurant_memberships m
    where m.restaurant_id=rid and m.id=cashier_id and m.active and m.role='cashier' and m.user_id is null
  ) then raise exception 'The counter cashier identity is inactive or has changed'; end if;

  update private.pos_devices set cashier_only=true,cashier_membership_id=cashier_id where id=device.id;
  return 'cashier';
end $$;
revoke all on function private.pos_set_device_cashier_access(uuid,boolean) from public,anon,authenticated;

-- Return the effective membership to existing gateway wrappers. The stored
-- owner binding still authorizes the device and supports account adoption.
create or replace function private.pos_device_authorize(p_device_key text)
returns private.pos_devices language plpgsql volatile security definer set search_path = '' as $$
declare device private.pos_devices;
begin
  if auth.uid() is not null or p_device_key is null or p_device_key !~ '^[0-9a-f]{64}$' then
    raise exception using message='device-denied',errcode='P0001';
  end if;
  select d.* into device from private.pos_devices d
    where d.credential_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_device_key,'UTF8')),'hex') and d.enabled;
  if device.id is null then raise exception using message='device-denied',errcode='P0001'; end if;
  if device.membership_id is not null and not exists(
    select 1 from public.restaurant_memberships m join public.restaurants r on r.id=m.restaurant_id
    where m.id=device.membership_id and m.restaurant_id=device.restaurant_id and m.active and m.role='owner' and r.enabled
  ) then raise exception using message='device-denied',errcode='P0001'; end if;
  if device.cashier_only then
    if not exists (
      select 1 from public.restaurant_memberships m
      where m.id=device.cashier_membership_id and m.restaurant_id=device.restaurant_id
        and m.active and m.role='cashier' and m.user_id is null
    ) then raise exception using message='device-denied',errcode='P0001'; end if;
    device.membership_id:=device.cashier_membership_id;
  end if;
  return device;
end $$;
revoke all on function private.pos_device_authorize(text) from public,anon,authenticated;

create or replace function public.pos_device_read(p_device_key text,p_view text,p_params jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare device private.pos_devices; member public.restaurant_memberships;
begin
  device:=private.pos_device_authorize(p_device_key);
  if device.membership_id is null then raise exception using message='no-membership',errcode='P0001'; end if;
  select m.* into member from public.restaurant_memberships m join public.restaurants r on r.id=m.restaurant_id
  where m.restaurant_id=device.restaurant_id and m.id=device.membership_id and m.active and r.enabled
    and m.role=case when device.cashier_only then 'cashier' else 'owner' end;
  if member.id is null then raise exception using message='device-denied',errcode='P0001'; end if;
  return private.pos_staff_read_data(member,p_view,p_params);
end;
$$;
revoke all on function public.pos_device_read(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_device_read(text,text,jsonb) to anon,authenticated;

-- Existing upload tickets from this device stop authorizing new uploads when
-- it becomes a cashier. Account-bound owner and manager tickets still work.
create or replace function public.pos_can_upload_menu_image(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from private.menu_image_tickets ticket
    join public.restaurant_memberships member on member.id=ticket.membership_id and member.restaurant_id=ticket.restaurant_id
    join public.restaurants restaurant on restaurant.id=ticket.restaurant_id
    where ticket.path=p_name and ticket.expires_at>pg_catalog.statement_timestamp()
      and member.active and member.role in ('owner','manager') and restaurant.enabled
      and (ticket.device_id is null or (member.role='owner' and exists(
        select 1 from private.pos_devices device
        where device.id=ticket.device_id and device.enabled and not device.cashier_only
          and device.restaurant_id=ticket.restaurant_id and device.membership_id=ticket.membership_id
      )))
  );
$$;
revoke all on function public.pos_can_upload_menu_image(text) from public,anon,authenticated;
grant execute on function public.pos_can_upload_menu_image(text) to anon,authenticated;

-- RLS receives only the caller's role/ID for the selected shop. It does not
-- depend on an untrusted user ID or token supplied to the read.
create or replace function private.current_restaurant_access(p_restaurant_id uuid)
returns table(id uuid,role text) language sql stable security definer set search_path = '' as $$
  select m.id,m.role from public.restaurant_memberships m
  join public.restaurants r on r.id=m.restaurant_id
  where m.restaurant_id=p_restaurant_id and m.user_id=(select auth.uid()) and m.active and r.enabled;
$$;
revoke all on function private.current_restaurant_access(uuid) from public,anon,authenticated;
grant execute on function private.current_restaurant_access(uuid) to authenticated;

drop policy if exists tenant_member_read on public.shifts;
create policy tenant_member_read on public.shifts for select to authenticated
using (exists (
  select 1 from private.current_restaurant_access(shifts.restaurant_id) m
  where m.role in ('owner','manager') or shifts.closed_at is null or shifts.opened_by=m.id
));

drop policy if exists tenant_member_read on public.payments;
create policy tenant_member_read on public.payments for select to authenticated
using (exists (
  select 1 from private.current_restaurant_access(payments.restaurant_id) m
  where m.role in ('owner','manager') or exists (
    select 1 from public.shifts s
    where s.restaurant_id=payments.restaurant_id and s.id=payments.shift_id and s.closed_at is null
  )
));

drop policy if exists tenant_member_read on public.activity_log;
create policy tenant_member_read on public.activity_log for select to authenticated
using (exists (
  select 1 from private.current_restaurant_access(activity_log.restaurant_id) m where m.role='owner'
));

-- The legacy snapshot is also returned by staff/device write commands.
-- Keep its order shape for lost-response recovery and the archived orders UI.
create or replace function public.pos_staff_snapshot(p_restaurant_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare member public.restaurant_memberships; rid uuid;
begin
  member:=private.pos_member(p_restaurant_id);
  rid:=member.restaurant_id;
  return jsonb_build_object(
    'restaurantId',rid,'membership',to_jsonb(member),
    'restaurants',(select to_jsonb(r) from public.restaurants r where r.id=rid),
    'members',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object(
      'email',case when member.role in ('owner','manager') then (select u.email from auth.users u where u.id=m.user_id) end
    ) order by m.created_at,m.id) from public.restaurant_memberships m where m.restaurant_id=rid),'[]'::jsonb),
    'menu_items',coalesce((select jsonb_agg(to_jsonb(m) order by m.sort_order,m.created_at,m.id)
      from public.menu_items m where m.restaurant_id=rid and m.enabled),'[]'::jsonb),
    'dining_tables',coalesce((select jsonb_agg(to_jsonb(t) order by t.table_number)
      from public.dining_tables t where t.restaurant_id=rid and t.enabled),'[]'::jsonb),
    'orders',coalesce((select jsonb_agg(private.pos_order_json(o.id) order by o.created_at desc,o.id)
      from public.orders o where o.restaurant_id=rid),'[]'::jsonb),
    'shifts',coalesce((select jsonb_agg(to_jsonb(s) order by s.opened_at desc)
      from public.shifts s where s.restaurant_id=rid
        and (member.role in ('owner','manager') or s.closed_at is null or s.opened_by=member.id)),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.confirmed_at desc)
      from public.payments p join public.shifts s on s.restaurant_id=p.restaurant_id and s.id=p.shift_id
      where p.restaurant_id=rid and (member.role in ('owner','manager') or s.closed_at is null)),'[]'::jsonb),
    'kitchen_print_jobs',coalesce((select jsonb_agg(to_jsonb(k) order by k.requested_at desc)
      from public.kitchen_print_jobs k where k.restaurant_id=rid),'[]'::jsonb),
    'activity_log',case when member.role='owner' then coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id desc)
      from public.activity_log a where a.restaurant_id=rid),'[]'::jsonb) else '[]'::jsonb end,
    'historyRevision',(select a.id from public.activity_log a where a.restaurant_id=rid order by a.created_at desc,a.id desc limit 1),
    'calls',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('table_number',t.table_number))
      from public.guest_calls c join public.dining_tables t on t.id=c.table_id and t.restaurant_id=c.restaurant_id
      where c.restaurant_id=rid and c.active),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.pos_staff_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.pos_staff_snapshot(uuid) to authenticated;

-- Keep the existing transaction implementation private. Reinstalling the
-- migration keeps that implementation and replaces only its public wrapper.
do $$ begin
  if pg_catalog.to_regprocedure('private.pos_staff_command_transaction(uuid,text,jsonb)') is null then
    alter function public.pos_staff_command(uuid,text,jsonb) set schema private;
    alter function private.pos_staff_command(uuid,text,jsonb) rename to pos_staff_command_transaction;
  end if;
end $$;
revoke all on function private.pos_staff_command_transaction(uuid,text,jsonb) from public,anon,authenticated;

create or replace function public.pos_staff_command(p_restaurant_id uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare member public.restaurant_memberships; rid uuid; target_id uuid;
begin
  if p_action in ('order.pay','staff.save') and jsonb_typeof(p_payload)='object' and octet_length(p_payload::text)<=120000 then
    member:=private.pos_member(p_restaurant_id);
    rid:=member.restaurant_id;
    perform private.pos_lock(rid);
    member:=private.pos_member(rid);
    if p_action='order.pay' and member.role='cashier' then
      target_id:=(p_payload->>'id')::uuid;
      -- Return the same terminal response for every retry. A caller must not
      -- infer closed-shift cash tender by guessing the original payment inputs.
      if exists (
        select 1 from public.payments p join public.shifts s on s.id=p.shift_id and s.restaurant_id=p.restaurant_id
        where p.restaurant_id=rid and p.order_id=target_id and s.closed_at is not null
      ) then raise exception using message='already-paid',errcode='P0001'; end if;
    elsif p_action='staff.save' and member.role in ('owner','manager') then
      target_id:=nullif(p_payload->>'id','')::uuid;
      -- Device access is managed through its registration, not through the
      -- editor for employee accounts.
      if exists(select 1 from private.pos_devices d where d.restaurant_id=rid and d.cashier_membership_id=target_id) then
        raise exception using message='access-denied',errcode='P0001';
      end if;
    end if;
  end if;
  return private.pos_staff_command_transaction(p_restaurant_id,p_action,p_payload);
exception when invalid_text_representation then
  raise exception using message='invalid',errcode='P0001';
end;
$$;
revoke all on function public.pos_staff_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_staff_command(uuid,text,jsonb) to authenticated;

create or replace function public.pos_setup_status()
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'schemaVersion',2,'publicMenuReady',true,'guestOrdersReady',true,'paymentsReady',true,
    'deviceAccessReady',true,'menuImagesReady',true,'integrityReady',true,'staffReadsReady',true,
    'staffPermissionsReady',true
  );
$$;
revoke all on function public.pos_setup_status() from public,anon,authenticated;
grant execute on function public.pos_setup_status() to anon,authenticated;

notify pgrst, 'reload schema';
commit;

select public.pos_setup_status() as setup_status;
