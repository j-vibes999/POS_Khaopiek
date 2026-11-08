-- Menu photography uses the Storage API, with short-lived, single-object upload
-- capabilities. Public reading is intentional: these are customer menu photos.
-- No images, device keys or shop fixtures are installed by this migration.
begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('pos-menu-images','pos-menu-images',true,2097152,array['image/webp']::text[])
 on conflict(id) do nothing;
do $$ begin
 if not exists(select 1 from storage.buckets where id='pos-menu-images' and public
  and file_size_limit=2097152 and allowed_mime_types=array['image/webp']::text[]) then
  raise exception 'The pos-menu-images bucket has incompatible existing settings';
 end if;
end $$;

create table if not exists private.menu_image_tickets (
 path text primary key check(path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'),
 restaurant_id uuid not null references public.restaurants(id) on delete restrict,
 membership_id uuid not null,
 device_id uuid references private.pos_devices(id) on delete restrict,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default(now()+interval '3 minutes'),
 foreign key(restaurant_id,membership_id) references public.restaurant_memberships(restaurant_id,id) on delete restrict
);
create index if not exists menu_image_tickets_rate_idx on private.menu_image_tickets(restaurant_id,created_at desc);
alter table private.menu_image_tickets enable row level security;
revoke all on private.menu_image_tickets from public,anon,authenticated;

create or replace function public.pos_menu_upload_ticket(p_restaurant_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare member public.restaurant_memberships; did uuid; object_path text;
begin
 member:=private.pos_member(p_restaurant_id);
 perform private.pos_lock(member.restaurant_id);
 member:=private.pos_member(member.restaurant_id);
 if member.role not in('owner','manager') then raise exception using message='access-denied',errcode='P0001'; end if;
 if auth.uid() is null then
  select d.id into did from private.pos_devices d where d.restaurant_id=member.restaurant_id and d.membership_id=member.id and d.enabled
   and d.credential_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.current_setting('pos.device_key',true),'UTF8')),'hex');
  if did is null then raise exception using message='device-denied',errcode='P0001'; end if;
 end if;
 if (select count(*) from private.menu_image_tickets where restaurant_id=member.restaurant_id and created_at>now()-interval '5 minutes')>=20 then
  raise exception using message='image-rate-limit',errcode='P0001';
 end if;
 -- Only expired internal upload capabilities are retired, never stored photos.
 delete from private.menu_image_tickets where restaurant_id=member.restaurant_id and created_at<now()-interval '1 day';
 object_path:=member.restaurant_id::text||'/'||pg_catalog.gen_random_uuid()::text||'.webp';
 insert into private.menu_image_tickets(path,restaurant_id,membership_id,device_id) values(object_path,member.restaurant_id,member.id,did);
 return jsonb_build_object('bucket','pos-menu-images','path',object_path);
end $$;

-- The path is a random short-lived capability, not a restaurant/table identifier.
-- Existing objects cannot be overwritten: no update/delete policy is granted and
-- Storage enforces a unique bucket/name key. The caller must upload without upsert.
create or replace function public.pos_can_upload_menu_image(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(
  select 1 from private.menu_image_tickets ticket
  join public.restaurant_memberships member on member.id=ticket.membership_id and member.restaurant_id=ticket.restaurant_id
  join public.restaurants restaurant on restaurant.id=ticket.restaurant_id
  where ticket.path=p_name and ticket.expires_at>pg_catalog.statement_timestamp()
   and member.active and member.role in('owner','manager') and restaurant.enabled
   and (ticket.device_id is null or (member.role='owner' and exists(select 1 from private.pos_devices device
    where device.id=ticket.device_id and device.enabled and device.restaurant_id=ticket.restaurant_id and device.membership_id=ticket.membership_id)))
 );
$$;
revoke all on function public.pos_can_upload_menu_image(text) from public,anon,authenticated;
grant execute on function public.pos_can_upload_menu_image(text) to anon,authenticated;
drop policy if exists pos_menu_images_ticket_insert on storage.objects;
create policy pos_menu_images_ticket_insert on storage.objects for insert to anon,authenticated
 with check(bucket_id='pos-menu-images' and public.pos_can_upload_menu_image(name));

create or replace function public.pos_device_menu_upload_ticket(p_device_key text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare device private.pos_devices; rid uuid; previous_key text; result jsonb;
begin
 device:=private.pos_device_authorize(p_device_key);
 if device.membership_id is null then raise exception using message='no-membership',errcode='P0001'; end if;
 rid:=device.restaurant_id;
 perform private.pos_lock(rid);
 device:=private.pos_device_authorize(p_device_key);
 if device.restaurant_id<>rid then raise exception using message='device-denied',errcode='P0001'; end if;
 previous_key:=pg_catalog.current_setting('pos.device_key',true);
 perform pg_catalog.set_config('pos.device_key',p_device_key,true);
 begin
  result:=public.pos_menu_upload_ticket(rid);
 exception when others then
  perform pg_catalog.set_config('pos.device_key',coalesce(previous_key,''),true); raise;
 end;
 perform pg_catalog.set_config('pos.device_key',coalesce(previous_key,''),true);
 return result;
end $$;
revoke all on function public.pos_menu_upload_ticket(uuid),public.pos_device_menu_upload_ticket(text) from public,anon,authenticated;
grant execute on function public.pos_menu_upload_ticket(uuid) to authenticated;
grant execute on function public.pos_device_menu_upload_ticket(text) to anon,authenticated;

create or replace function public.pos_setup_status()
returns jsonb language sql immutable set search_path = '' as $$
 select jsonb_build_object('schemaVersion',2,'publicMenuReady',true,'guestOrdersReady',true,'paymentsReady',true,'deviceAccessReady',true,'menuImagesReady',true);
$$;
revoke all on function public.pos_setup_status() from public,anon,authenticated;
grant execute on function public.pos_setup_status() to anon,authenticated;
commit;
