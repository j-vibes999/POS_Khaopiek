-- Khao Piek POS: schema foundation only. Run in the Supabase SQL Editor.
-- Rerunnable first-stage migration; does not import browser/LAN data or demo PINs.
-- Existing app stays local. No guest order, payment, staff login or mutation RPC
-- exists here. Real authenticated transactional commands are a later stage.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
-- New functions must never inherit PostgreSQL's default PUBLIC execution grant.
-- The built-in PUBLIC grant is global: a schema-only REVOKE cannot remove it.
alter default privileges revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  branch text not null default '' check (char_length(branch) <= 40),
  phone text not null default '' check (char_length(phone) <= 30),
  currency text not null default 'LAK' check (currency = 'LAK'),
  timezone text not null default 'Asia/Vientiane' check (timezone = 'Asia/Vientiane'),
  payment_methods text[] not null default array['transfer','cash']::text[]
    check (cardinality(payment_methods) between 1 and 2
      and array_position(payment_methods, null) is null
      and payment_methods <@ array['cash','transfer']::text[]),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- A Supabase Auth identity is necessary for membership. PINs, PIN hashes and
-- user_metadata role claims are deliberately absent from this database stage.
create table if not exists public.restaurant_memberships (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  role text not null check (role in ('owner','manager','cashier')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, id),
  unique (restaurant_id, user_id)
);
create index if not exists restaurant_memberships_user_active_idx
  on public.restaurant_memberships (user_id, restaurant_id) where active;

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,100}$'),
  name_lo text not null check (char_length(btrim(name_lo)) between 1 and 40),
  name_th text not null default '' check (char_length(name_th) <= 40),
  name_en text not null default '' check (char_length(name_en) <= 40),
  name_zh text not null default '' check (char_length(name_zh) <= 40),
  name_ko text not null default '' check (char_length(name_ko) <= 40),
  name_ja text not null default '' check (char_length(name_ja) <= 40),
  detail_lo text not null default '' check (char_length(detail_lo) <= 120),
  detail_th text not null default '' check (char_length(detail_th) <= 120),
  price bigint not null check (price between 0 and 10000000),
  category text not null check (category in ('khao','pho','drinks','other')),
  image_path text not null check (char_length(btrim(image_path)) between 1 and 512),
  popular boolean not null default false,
  available boolean not null default true,
  enabled boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (restaurant_id, id),
  unique (restaurant_id, code)
);

create table if not exists public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  table_number smallint not null check (table_number between 1 and 60),
  seats smallint not null default 4 check (seats between 1 and 30),
  zone text not null default '' check (char_length(zone) <= 24),
  enabled boolean not null default true,
  -- This unguessable key exposes only the public menu. It is NOT order access,
  -- guest identity, payment authorization, or a replacement for authentication.
  public_key uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  unique (restaurant_id, id),
  unique (restaurant_id, table_number)
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  opened_by uuid not null,
  opened_at timestamptz not null default now(),
  opening_cash bigint not null check (opening_cash between 0 and 10000000000),
  closed_by uuid,
  closed_at timestamptz,
  counted_cash bigint check (counted_cash between 0 and 10000000000),
  cash_sales bigint check (cash_sales between 0 and 10000000000),
  transfer_sales bigint check (transfer_sales between 0 and 10000000000),
  order_count integer check (order_count >= 0),
  expected_cash bigint check (expected_cash between 0 and 20000000000),
  difference bigint,
  unique (restaurant_id, id),
  foreign key (restaurant_id, opened_by) references public.restaurant_memberships(restaurant_id,id) on delete restrict,
  foreign key (restaurant_id, closed_by) references public.restaurant_memberships(restaurant_id,id) on delete restrict,
  check ((closed_at is null and closed_by is null and counted_cash is null and cash_sales is null
      and transfer_sales is null and order_count is null and expected_cash is null and difference is null)
    or (closed_at is not null and closed_at >= opened_at and closed_by is not null and counted_cash is not null
      and cash_sales is not null and transfer_sales is not null and order_count is not null
      and expected_cash = opening_cash + cash_sales and difference = counted_cash - expected_cash
      and expected_cash is not null and difference is not null))
);
create unique index if not exists shifts_one_open_per_restaurant_idx
  on public.shifts (restaurant_id) where closed_at is null;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  -- Generated by a future transactional server command, never browser MAX()+1.
  order_number bigint not null check (order_number > 0),
  table_id uuid not null,
  source text not null default 'cashier' check (source in ('qr','cashier')),
  created_by uuid,
  requested_method text not null check (requested_method in ('cash','transfer')),
  status text not null default 'pending'
    check (status in ('pending','queued','cooking','ready','served','completed','rejected')),
  paid boolean not null default false,
  paid_at timestamptz,
  kitchen_pending boolean not null default false,
  kitchen_sent_at timestamptz,
  created_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0),
  request_key uuid,
  unique (restaurant_id, id),
  unique (restaurant_id, order_number),
  unique (restaurant_id, request_key),
  foreign key (restaurant_id, table_id) references public.dining_tables(restaurant_id,id) on delete restrict,
  foreign key (restaurant_id, created_by) references public.restaurant_memberships(restaurant_id,id) on delete restrict,
  check (paid = (paid_at is not null)),
  check (paid_at is null or paid_at >= created_at),
  check ((status in ('pending','rejected') and not paid)
    or (status in ('queued','cooking','ready','served','completed') and paid)),
  check (not kitchen_pending or (paid and status='queued')),
  check (kitchen_sent_at is null or (paid and kitchen_sent_at >= paid_at))
);
create index if not exists orders_restaurant_created_idx on public.orders (restaurant_id,created_at desc);
create index if not exists orders_restaurant_table_status_idx on public.orders (restaurant_id,table_id,status);

-- Values below are historical quoted snapshots, not live joins to menu prices.
-- Menu and table rows should be archived; referenced financial history cannot
-- cascade away. The future order command must validate prices/options/totals.
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  order_id uuid not null,
  menu_item_id uuid,
  line_number smallint not null check (line_number between 1 and 30),
  name_lo text not null check (char_length(btrim(name_lo)) between 1 and 40),
  name_th text not null default '' check (char_length(name_th) <= 40),
  name_en text not null default '' check (char_length(name_en) <= 40),
  name_zh text not null default '' check (char_length(name_zh) <= 40),
  name_ko text not null default '' check (char_length(name_ko) <= 40),
  name_ja text not null default '' check (char_length(name_ja) <= 40),
  detail_lo text not null default '' check (char_length(detail_lo) <= 120),
  detail_th text not null default '' check (char_length(detail_th) <= 120),
  category text not null check (category in ('khao','pho','drinks','other')),
  image_path text not null default '' check (char_length(image_path) <= 512),
  size text not null default 'regular' check (size in ('regular','large')),
  no_herbs boolean not null default false,
  customization_note text not null default '' check (char_length(customization_note) <= 150),
  unit_price bigint not null check (unit_price between 0 and 10010000),
  quantity smallint not null check (quantity between 1 and 30),
  line_total bigint generated always as (unit_price * quantity) stored,
  unique (restaurant_id,id),
  unique (restaurant_id,order_id,line_number),
  foreign key (restaurant_id,order_id) references public.orders(restaurant_id,id) on delete restrict,
  foreign key (restaurant_id,menu_item_id) references public.menu_items(restaurant_id,id) on delete restrict,
  check (category <> 'drinks' or (size='regular' and not no_herbs))
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  order_id uuid not null,
  shift_id uuid not null,
  confirmed_by uuid not null,
  amount bigint not null check (amount between 0 and 10000000000),
  method text not null check (method in ('cash','transfer')),
  cash_received bigint check (cash_received between 0 and 10000000000),
  confirmed_at timestamptz not null default now(),
  idempotency_key uuid not null,
  unique (restaurant_id,id),
  unique (restaurant_id,order_id),
  unique (restaurant_id,idempotency_key),
  foreign key (restaurant_id,order_id) references public.orders(restaurant_id,id) on delete restrict,
  foreign key (restaurant_id,shift_id) references public.shifts(restaurant_id,id) on delete restrict,
  foreign key (restaurant_id,confirmed_by) references public.restaurant_memberships(restaurant_id,id) on delete restrict,
  check ((method='cash' and cash_received is not null and cash_received >= amount)
    or (method='transfer' and cash_received is null))
);
create index if not exists payments_restaurant_shift_idx on public.payments(restaurant_id,shift_id);
-- This table alone does not validate payment/order totals or closed-shift rules.
-- A future locked transaction must own confirmation, handoff and reversals.

create table if not exists public.kitchen_print_jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  order_id uuid not null,
  requested_by uuid not null,
  kind text not null default 'original' check (kind in ('original','reprint')),
  status text not null default 'pending' check (status in ('pending','dispatched','failed')),
  idempotency_key uuid not null,
  requested_at timestamptz not null default now(),
  dispatched_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text not null default '' check (char_length(last_error) <= 240),
  unique (restaurant_id,id),
  unique (restaurant_id,idempotency_key),
  foreign key (restaurant_id,order_id) references public.orders(restaurant_id,id) on delete restrict,
  foreign key (restaurant_id,requested_by) references public.restaurant_memberships(restaurant_id,id) on delete restrict,
  check ((status='dispatched') = (dispatched_at is not null)),
  check (dispatched_at is null or dispatched_at >= requested_at)
);
create unique index if not exists kitchen_print_jobs_one_original_idx
  on public.kitchen_print_jobs(restaurant_id,order_id) where kind='original';
-- Dispatch acknowledgement means a dialog/ticket was opened, not proof of paper.

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  actor_membership_id uuid,
  order_id uuid,
  event_type text not null check (char_length(btrim(event_type)) between 1 and 80),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details)='object' and octet_length(details::text) <= 16384),
  created_at timestamptz not null default now(),
  foreign key (restaurant_id,actor_membership_id) references public.restaurant_memberships(restaurant_id,id) on delete restrict,
  foreign key (restaurant_id,order_id) references public.orders(restaurant_id,id) on delete restrict
);
create index if not exists activity_log_restaurant_created_idx on public.activity_log(restaurant_id,created_at desc);
comment on column public.activity_log.details is 'Event facts only: never store PINs, auth tokens, passwords, or full browser/LAN storage.';

-- SECURITY DEFINER avoids recursively querying the memberships RLS policy.
-- It uses the verified Auth subject, not a user ID supplied by the caller.
create or replace function private.can_access_restaurant(p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.restaurant_memberships membership
    where membership.restaurant_id=p_restaurant_id
      and membership.user_id=(select auth.uid()) and membership.active
  );
$$;
revoke all on function private.can_access_restaurant(uuid) from public,anon,authenticated;
grant execute on function private.can_access_restaurant(uuid) to authenticated;

do $$ declare table_name text; tenant_column text; begin
  foreach table_name in array array['restaurants','restaurant_memberships','menu_items','dining_tables','shifts','orders','order_items','payments','kitchen_print_jobs','activity_log'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on table public.%I from public,anon,authenticated',table_name);
    execute format('grant select on table public.%I to authenticated',table_name);
    execute format('drop policy if exists tenant_member_read on public.%I',table_name);
    tenant_column := case when table_name='restaurants' then 'id' else 'restaurant_id' end;
    execute format('create policy tenant_member_read on public.%I for select to authenticated using (private.can_access_restaurant(%I))',table_name,tenant_column);
  end loop;
end $$;

-- Safe verification endpoint: does not expose shop, user, payment or order data.
create or replace function public.pos_setup_status()
returns jsonb language sql immutable set search_path = ''
as $$
  select jsonb_build_object('schemaVersion',1,'publicMenuReady',true,'guestOrdersReady',false,'paymentsReady',false);
$$;
revoke all on function public.pos_setup_status() from public,anon,authenticated;
grant execute on function public.pos_setup_status() to anon,authenticated;

-- Public projection only. No guest order/payment RPC exists in this foundation.
-- Invalid, disabled or unknown table keys return JSON null (SQL NULL).
-- Names and price keys match the current browser menu data shape. UUID id values
-- are intentional: the app is not switched to this data source in this stage.
create or replace function public.pos_get_menu(p_table_key uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'table', dining.table_number,
    'shopName', restaurant.name,
    'methods', to_jsonb(restaurant.payment_methods),
    'menu', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',item.id::text,'lo',item.name_lo,'th',coalesce(nullif(item.name_th,''),item.name_lo),
        'en',item.name_en,'zh',item.name_zh,'ko',item.name_ko,'ja',item.name_ja,
        'detailLo',item.detail_lo,'detailTh',item.detail_th,'price',item.price,
        'category',item.category,'image',item.image_path,'popular',item.popular,'available',item.available
      ) order by item.sort_order,item.created_at,item.id)
      from public.menu_items item where item.restaurant_id=restaurant.id and item.enabled
    ),'[]'::jsonb)
  )
  from public.dining_tables dining
  join public.restaurants restaurant on restaurant.id=dining.restaurant_id
  where dining.public_key=p_table_key and dining.enabled and restaurant.enabled;
$$;
revoke all on function public.pos_get_menu(uuid) from public,anon,authenticated;
grant execute on function public.pos_get_menu(uuid) to anon,authenticated;

comment on function public.pos_setup_status() is 'Schema foundation probe. Orders and payments are not enabled.';
comment on function public.pos_get_menu(uuid) is 'Public menu projection for one enabled table and restaurant; grants no access to orders, staff, shifts or payments.';
commit;
