-- Optional trusted-computer access. The private device key stays in the local
-- gateway; it is never bundled into the browser, table QR or public menu.
-- Installing this migration enrolls no devices and creates no shop data.
begin;

-- A device owner is a real shop principal without an invented email/Auth user.
-- Account-backed staff keep their existing Auth identity and RLS policy.
alter table public.restaurant_memberships alter column user_id drop not null;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.restaurant_memberships'::regclass and conname='device_owner_or_auth_user') then
  alter table public.restaurant_memberships add constraint device_owner_or_auth_user check(user_id is not null or role='owner');
 end if;
end $$;

create table if not exists private.pos_devices (
 id uuid primary key default gen_random_uuid(),
 credential_hash text not null unique check(credential_hash ~ '^[0-9a-f]{64}$'),
 enabled boolean not null default true,
 restaurant_id uuid references public.restaurants(id) on delete restrict,
 membership_id uuid unique,
 created_at timestamptz not null default now(),
 check((restaurant_id is null)=(membership_id is null)),
 foreign key(restaurant_id,membership_id) references public.restaurant_memberships(restaurant_id,id) on delete restrict
);
alter table private.pos_devices enable row level security;
revoke all on private.pos_devices from public,anon,authenticated;

create or replace function private.pos_device_authorize(p_device_key text)
returns private.pos_devices language plpgsql volatile security definer set search_path = '' as $$
declare device private.pos_devices;
begin
 -- Device gateways use the publishable/anon role. Never combine one person's
 -- JWT identity with a different principal carried by a device credential.
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
 return device;
end $$;

create or replace function private.pos_member(p_restaurant_id uuid default null)
returns public.restaurant_memberships language plpgsql stable security definer set search_path = '' as $$
declare result public.restaurant_memberships; device private.pos_devices;
begin
 if auth.uid() is not null then
  -- Preserve normal account authorization. A device GUC never overrides a JWT.
  select m.* into result from public.restaurant_memberships m join public.restaurants r on r.id=m.restaurant_id
   where m.user_id=auth.uid() and m.active and r.enabled and (p_restaurant_id is null or m.restaurant_id=p_restaurant_id)
   order by m.created_at,m.id limit 1;
  if result.id is null then
   raise exception using message=case when p_restaurant_id is null then 'no-membership' else 'access-denied' end,errcode='P0001';
  end if;
  return result;
 end if;
 -- The full private credential is revalidated; a forged device ID/GUC alone
 -- cannot provide shop access. Wrappers restore this transaction-local value.
 if coalesce(pg_catalog.current_setting('pos.device_key',true),'')='' then
  raise exception using message='session-expired',errcode='P0001';
 end if;
 device:=private.pos_device_authorize(pg_catalog.current_setting('pos.device_key',true));
 if device.membership_id is null then raise exception using message='no-membership',errcode='P0001'; end if;
 if p_restaurant_id is not null and device.restaurant_id<>p_restaurant_id then
  raise exception using message='access-denied',errcode='P0001';
 end if;
 select m.* into result from public.restaurant_memberships m where m.id=device.membership_id and m.restaurant_id=device.restaurant_id;
 return result;
end $$;

create or replace function public.pos_device_snapshot(p_device_key text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare device private.pos_devices; previous_key text; result jsonb;
begin
 device:=private.pos_device_authorize(p_device_key);
 if device.membership_id is null then raise exception using message='no-membership',errcode='P0001'; end if;
 previous_key:=pg_catalog.current_setting('pos.device_key',true);
 perform pg_catalog.set_config('pos.device_key',p_device_key,true);
 begin
  result:=public.pos_staff_snapshot(device.restaurant_id);
 exception when others then
  perform pg_catalog.set_config('pos.device_key',coalesce(previous_key,''),true); raise;
 end;
 perform pg_catalog.set_config('pos.device_key',coalesce(previous_key,''),true);
 return result;
end $$;

create or replace function public.pos_device_setup(p_device_key text,p_shop_name text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare device private.pos_devices; rid uuid; mid uuid; previous_key text; result jsonb;
begin
 device:=private.pos_device_authorize(p_device_key);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('device:'||device.id::text,0));
 device:=private.pos_device_authorize(p_device_key);
 if device.membership_id is null then
  if p_shop_name is null or char_length(btrim(p_shop_name)) not between 1 and 40 then
   raise exception using message='shop-name',errcode='P0001';
  end if;
  insert into public.restaurants(name) values(btrim(p_shop_name)) returning id into rid;
  insert into public.restaurant_memberships(restaurant_id,user_id,display_name,role)
   values(rid,null,'ເຈົ້າຂອງຮ້ານ','owner') returning id into mid;
  update private.pos_devices set restaurant_id=rid,membership_id=mid where id=device.id;
 else
  rid:=device.restaurant_id;
  perform private.pos_lock(rid);
  device:=private.pos_device_authorize(p_device_key);
  if device.restaurant_id<>rid then raise exception using message='device-denied',errcode='P0001'; end if;
 end if;
 previous_key:=pg_catalog.current_setting('pos.device_key',true);
 perform pg_catalog.set_config('pos.device_key',p_device_key,true);
 begin
  result:=public.pos_staff_snapshot(rid);
 exception when others then
  perform pg_catalog.set_config('pos.device_key',coalesce(previous_key,''),true); raise;
 end;
 perform pg_catalog.set_config('pos.device_key',coalesce(previous_key,''),true);
 return result;
end $$;

create or replace function public.pos_device_command(p_device_key text,p_action text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare device private.pos_devices; rid uuid; previous_key text; result jsonb;
begin
 device:=private.pos_device_authorize(p_device_key);
 if device.membership_id is null then raise exception using message='no-membership',errcode='P0001'; end if;
 rid:=device.restaurant_id;
 perform private.pos_lock(rid);
 -- Recheck after any wait. Revocation must apply before a command can mutate.
 device:=private.pos_device_authorize(p_device_key);
 if device.restaurant_id<>rid then raise exception using message='device-denied',errcode='P0001'; end if;
 previous_key:=pg_catalog.current_setting('pos.device_key',true);
 perform pg_catalog.set_config('pos.device_key',p_device_key,true);
 begin
  result:=public.pos_staff_command(rid,p_action,p_payload);
 exception when others then
  perform pg_catalog.set_config('pos.device_key',coalesce(previous_key,''),true); raise;
 end;
 perform pg_catalog.set_config('pos.device_key',coalesce(previous_key,''),true);
 return result;
end $$;

-- The configured verified owner can adopt the same device-owned membership
-- when account login is enabled later. This never opens general shop claiming.
create or replace function public.pos_claim_owner(p_shop_name text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare rid uuid; mid uuid; uid uuid:=auth.uid();
begin
 if uid is null then raise exception using message='session-expired',errcode='P0001'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner:'||uid::text,0));
 if not exists(select 1 from auth.users where id=uid and lower(email)='darkside404404@gmail.com' and email_confirmed_at is not null) then
  raise exception using message='owner-not-authorized',errcode='P0001';
 end if;
 select restaurant_id into rid from public.restaurant_memberships where user_id=uid and active order by created_at,id limit 1;
 if rid is not null then return public.pos_staff_snapshot(rid); end if;
 -- A previously disabled account enrollment cannot manufacture a new shop or
 -- take over a device shop to evade its existing membership restriction.
 if exists(select 1 from public.restaurant_memberships where user_id=uid) then raise exception using message='access-denied',errcode='P0001'; end if;
 select m.restaurant_id,m.id into rid,mid from private.pos_devices d
  join public.restaurant_memberships m on m.id=d.membership_id and m.restaurant_id=d.restaurant_id
  join public.restaurants r on r.id=m.restaurant_id
  where d.enabled and m.active and m.role='owner' and m.user_id is null and r.enabled
  order by d.created_at,d.id limit 1;
 if mid is not null then
  perform private.pos_lock(rid);
  -- An enrollment, revocation or email change during a lock wait must apply.
  if not exists(select 1 from auth.users where id=uid and lower(email)='darkside404404@gmail.com' and email_confirmed_at is not null) then
   raise exception using message='owner-not-authorized',errcode='P0001';
  end if;
  if exists(select 1 from public.restaurant_memberships where user_id=uid) then
   return public.pos_staff_snapshot(null);
  end if;
  perform 1 from public.restaurant_memberships m join public.restaurants r on r.id=m.restaurant_id
   where m.id=mid and m.restaurant_id=rid and m.user_id is null and m.active and m.role='owner' and r.enabled
    and exists(select 1 from private.pos_devices d where d.membership_id=m.id and d.restaurant_id=rid and d.enabled)
   for update of m;
  if not found then raise exception using message='access-denied',errcode='P0001'; end if;
  update public.restaurant_memberships set user_id=uid where id=mid;
  return public.pos_staff_snapshot(rid);
 end if;
 if p_shop_name is null or char_length(btrim(p_shop_name)) not between 1 and 40 then
  raise exception using message='shop-name',errcode='P0001';
 end if;
 insert into public.restaurants(name) values(btrim(p_shop_name)) returning id into rid;
 insert into public.restaurant_memberships(restaurant_id,user_id,display_name,role) values(rid,uid,'Owner','owner');
 return public.pos_staff_snapshot(rid);
end $$;
revoke all on function public.pos_claim_owner(text) from public,anon,authenticated;
grant execute on function public.pos_claim_owner(text) to authenticated;

revoke all on function private.pos_device_authorize(text),private.pos_member(uuid) from public,anon,authenticated;
revoke all on function public.pos_device_snapshot(text),public.pos_device_setup(text,text),public.pos_device_command(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_device_snapshot(text),public.pos_device_setup(text,text),public.pos_device_command(text,text,jsonb) to anon,authenticated;
-- Direct staff RPCs and table RLS retain their account-only grants. Device
-- requests can use only the wrappers above, with their revocable private key.

create or replace function public.pos_setup_status()
returns jsonb language sql immutable set search_path = '' as $$
 select jsonb_build_object('schemaVersion',2,'publicMenuReady',true,'guestOrdersReady',true,'paymentsReady',true,'deviceAccessReady',true);
$$;
revoke all on function public.pos_setup_status() from public,anon,authenticated;
grant execute on function public.pos_setup_status() to anon,authenticated;
commit;
