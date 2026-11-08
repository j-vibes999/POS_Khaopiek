-- Transactional cloud POS. Requires 202611070001_pos_foundation.sql.
-- No menu, table, staff, payment, PIN, or sales fixtures are installed here.
begin;

alter table public.payments add column if not exists reviewed_revision bigint check (reviewed_revision>0);

create table if not exists private.table_visits (
  id uuid primary key default gen_random_uuid(),
  visit_number bigint generated always as identity,
  restaurant_id uuid not null references public.restaurants(id),
  table_id uuid not null references public.dining_tables(id),
  started_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index if not exists table_visits_one_open on private.table_visits(table_id) where closed_at is null;
create table if not exists private.guest_identities (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id),
  table_id uuid not null references public.dining_tables(id),
  visit_id uuid not null references private.table_visits(id),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique(visit_id,token_hash)
);
create table if not exists private.order_submissions (
  order_id uuid primary key references public.orders(id),
  restaurant_id uuid not null references public.restaurants(id),
  table_id uuid not null references public.dining_tables(id),
  guest_id uuid references private.guest_identities(id),
  actor_key text not null,
  request_id text not null,
  reviewed_key jsonb not null,
  created_at timestamptz not null default now(),
  unique(restaurant_id,table_id,actor_key,request_id)
);
create index if not exists order_submissions_rate_idx on private.order_submissions(restaurant_id,created_at desc);
create table if not exists public.guest_calls (
  table_id uuid primary key references public.dining_tables(id),
  restaurant_id uuid not null references public.restaurants(id),
  active boolean not null default true,
  reason text not null default 'help' check (reason='help'),
  created_at timestamptz not null default now(),
  revision bigint not null default 1
);
create table if not exists private.guest_call_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id),
  table_id uuid not null references public.dining_tables(id),
  token_hash text not null,
  created_at timestamptz not null default now()
);
revoke all on all tables in schema private from public,anon,authenticated;
alter table private.table_visits enable row level security;
alter table private.guest_identities enable row level security;
alter table private.order_submissions enable row level security;
alter table private.guest_call_events enable row level security;
alter table public.guest_calls enable row level security;
revoke all on public.guest_calls from public,anon,authenticated;
grant select on public.guest_calls to authenticated;
drop policy if exists tenant_member_read on public.guest_calls;
create policy tenant_member_read on public.guest_calls for select to authenticated using (private.can_access_restaurant(restaurant_id));

create or replace function private.pos_lock(p_restaurant_id uuid)
returns void language sql security definer set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_restaurant_id::text,0));
$$;
create or replace function private.pos_member(p_restaurant_id uuid default null)
returns public.restaurant_memberships language plpgsql stable security definer set search_path = '' as $$
declare result public.restaurant_memberships;
begin
  if auth.uid() is null then raise exception using message='session-expired',errcode='P0001'; end if;
  select m.* into result from public.restaurant_memberships m join public.restaurants r on r.id=m.restaurant_id
    where m.user_id=auth.uid() and m.active and r.enabled and (p_restaurant_id is null or m.restaurant_id=p_restaurant_id)
    order by m.created_at,m.id limit 1;
  if result.id is null then
    raise exception using message=case when p_restaurant_id is null then 'no-membership' else 'access-denied' end,errcode='P0001';
  end if;
  return result;
end;
$$;
create or replace function private.pos_order_json(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select (to_jsonb(o)-'request_key') || jsonb_build_object('table_number',t.table_number,'order_items',coalesce((
    select jsonb_agg(to_jsonb(i) order by i.line_number) from public.order_items i where i.order_id=o.id
  ),'[]'::jsonb)) from public.orders o join public.dining_tables t on t.id=o.table_id where o.id=p_order_id;
$$;

-- Validate a complete immutable quote. Never trust client names or prices.
create or replace function private.pos_quote(p_restaurant_id uuid,p_cart jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare line jsonb; item public.menu_items; result jsonb := '[]'; n integer := 0; portions integer := 0;
  quantity integer; unit_price bigint; item_size text; herbs boolean; note text; f text; expected text;
begin
  if p_cart is null or jsonb_typeof(p_cart)<>'array' or jsonb_array_length(p_cart) not between 1 and 30
    or octet_length(p_cart::text)>100000 then raise exception using message='cart',errcode='P0001'; end if;
  for line in select value from jsonb_array_elements(p_cart) loop
    n:=n+1;
    if jsonb_typeof(line)<>'object' or coalesce(line->>'id','') !~ '^[0-9a-fA-F-]{36}$' then raise exception using message='cart',errcode='P0001'; end if;
    select * into item from public.menu_items where id=(line->>'id')::uuid and restaurant_id=p_restaurant_id and enabled;
    if item.id is null then raise exception using message='menu-changed',errcode='P0001'; end if;
    if not item.available then raise exception using message='sold-out',errcode='P0001'; end if;
    foreach f in array array['category','lo','th','en','zh','ko','ja','detailLo','detailTh'] loop
      expected:=case f when 'category' then item.category when 'lo' then item.name_lo
        when 'th' then coalesce(nullif(item.name_th,''),item.name_lo) when 'en' then item.name_en
        when 'zh' then item.name_zh when 'ko' then item.name_ko when 'ja' then item.name_ja
        when 'detailLo' then item.detail_lo when 'detailTh' then item.detail_th end;
      if coalesce(line->>f,'') is distinct from expected then raise exception using message='menu-changed',errcode='P0001'; end if;
    end loop;
    item_size:=coalesce(line->>'size','regular');
    if item_size not in ('regular','large') or (line ? 'noHerbs' and jsonb_typeof(line->'noHerbs')<>'boolean')
      or jsonb_typeof(line->'quantity') is distinct from 'number' or coalesce(line->>'quantity','') !~ '^[0-9]{1,2}$'
      or jsonb_typeof(line->'price') is distinct from 'number' or coalesce(line->>'price','') !~ '^[0-9]{1,10}$'
      then raise exception using message='cart',errcode='P0001'; end if;
    herbs:=coalesce((line->>'noHerbs')::boolean,false);
    quantity:=(line->>'quantity')::integer; portions:=portions+quantity;
    note:=btrim(coalesce(line->>'customizationNote',''));
    if quantity not between 1 and 30 or portions>60 or char_length(note)>150
      or (line ? 'customizationNote' and jsonb_typeof(line->'customizationNote')<>'string')
      or (item.category='drinks' and (item_size<>'regular' or herbs)) then raise exception using message='cart',errcode='P0001'; end if;
    unit_price:=item.price+case when item_size='large' then 10000 else 0 end;
    if (line->>'price')::bigint<>unit_price then raise exception using message='menu-changed',errcode='P0001'; end if;
    result:=result||jsonb_build_array(jsonb_build_object('menu_item_id',item.id,'line_number',n,
      'name_lo',item.name_lo,'name_th',coalesce(nullif(item.name_th,''),item.name_lo),'name_en',item.name_en,'name_zh',item.name_zh,
      'name_ko',item.name_ko,'name_ja',item.name_ja,'detail_lo',item.detail_lo,'detail_th',item.detail_th,
      'category',item.category,'image_path',item.image_path,'size',item_size,'no_herbs',herbs,
      'customization_note',note,'unit_price',unit_price,'quantity',quantity));
  end loop;
  return result;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using message='cart',errcode='P0001';
end;
$$;

create or replace function private.pos_insert_order(p_restaurant_id uuid,p_table_id uuid,p_source text,p_member_id uuid,
  p_cart jsonb,p_method text,p_request_uuid uuid default null)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare result public.orders; quote jsonb; next_number bigint;
begin
  quote:=private.pos_quote(p_restaurant_id,p_cart);
  if not exists (select 1 from public.restaurants where id=p_restaurant_id and enabled and p_method=any(payment_methods)) then
    raise exception using message='method',errcode='P0001'; end if;
  select coalesce(max(order_number),0)+1 into next_number from public.orders where restaurant_id=p_restaurant_id;
  insert into public.orders(restaurant_id,order_number,table_id,source,created_by,requested_method,request_key)
    values(p_restaurant_id,next_number,p_table_id,p_source,p_member_id,p_method,p_request_uuid) returning * into result;
  insert into public.order_items(restaurant_id,order_id,menu_item_id,line_number,name_lo,name_th,name_en,name_zh,name_ko,name_ja,
    detail_lo,detail_th,category,image_path,size,no_herbs,customization_note,unit_price,quantity)
    select p_restaurant_id,result.id,x.menu_item_id,x.line_number,x.name_lo,x.name_th,x.name_en,x.name_zh,x.name_ko,x.name_ja,
      x.detail_lo,x.detail_th,x.category,x.image_path,x.size,x.no_herbs,x.customization_note,x.unit_price,x.quantity
    from jsonb_to_recordset(quote) as x(menu_item_id uuid,line_number smallint,name_lo text,name_th text,name_en text,name_zh text,
      name_ko text,name_ja text,detail_lo text,detail_th text,category text,image_path text,size text,no_herbs boolean,
      customization_note text,unit_price bigint,quantity smallint);
  insert into public.activity_log(restaurant_id,actor_membership_id,order_id,event_type) values(p_restaurant_id,p_member_id,result.id,'order.create');
  return result;
end;
$$;

create or replace function public.pos_staff_snapshot(p_restaurant_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare member public.restaurant_memberships; rid uuid;
begin
  member:=private.pos_member(p_restaurant_id); rid:=member.restaurant_id;
  return jsonb_build_object('restaurantId',rid,'membership',to_jsonb(member),
    'restaurants',(select to_jsonb(r) from public.restaurants r where r.id=rid),
    'members',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('email',case when member.role in ('owner','manager') then (select u.email from auth.users u where u.id=m.user_id) else null end) order by m.created_at,m.id) from public.restaurant_memberships m where m.restaurant_id=rid),'[]'::jsonb),
    'menu_items',coalesce((select jsonb_agg(to_jsonb(m) order by m.sort_order,m.created_at,m.id) from public.menu_items m where m.restaurant_id=rid and m.enabled),'[]'::jsonb),
    'dining_tables',coalesce((select jsonb_agg(to_jsonb(t) order by t.table_number) from public.dining_tables t where t.restaurant_id=rid and t.enabled),'[]'::jsonb),
    'orders',coalesce((select jsonb_agg(private.pos_order_json(o.id) order by o.created_at desc,o.id) from public.orders o where o.restaurant_id=rid),'[]'::jsonb),
    'shifts',coalesce((select jsonb_agg(to_jsonb(s) order by s.opened_at desc) from public.shifts s where s.restaurant_id=rid),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.confirmed_at desc) from public.payments p where p.restaurant_id=rid),'[]'::jsonb),
    'kitchen_print_jobs',coalesce((select jsonb_agg(to_jsonb(k) order by k.requested_at desc) from public.kitchen_print_jobs k where k.restaurant_id=rid),'[]'::jsonb),
    'activity_log',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.activity_log a where a.restaurant_id=rid),'[]'::jsonb),
    'calls',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('table_number',t.table_number)) from public.guest_calls c
      join public.dining_tables t on t.id=c.table_id where c.restaurant_id=rid and c.active),'[]'::jsonb));
end;
$$;

-- This one account may enroll itself after Supabase verifies its email. All other
-- staff need an owner/manager-created membership bound to a real Auth UUID.
create or replace function public.pos_claim_owner(p_shop_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare rid uuid; uid uuid:=auth.uid();
begin
  if uid is null then raise exception using message='session-expired',errcode='P0001'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner:'||uid::text,0));
  if not exists(select 1 from auth.users where id=uid and lower(email)='darkside404404@gmail.com' and email_confirmed_at is not null) then
    raise exception using message='owner-not-authorized',errcode='P0001'; end if;
  select restaurant_id into rid from public.restaurant_memberships where user_id=uid and active order by created_at limit 1;
  if rid is not null then return public.pos_staff_snapshot(rid); end if;
  -- A disabled enrollment cannot be used to manufacture another shop.
  if exists(select 1 from public.restaurant_memberships where user_id=uid) then raise exception using message='access-denied',errcode='P0001'; end if;
  if p_shop_name is null or char_length(btrim(p_shop_name)) not between 1 and 40 then raise exception using message='shop-name',errcode='P0001'; end if;
  insert into public.restaurants(name) values(btrim(p_shop_name)) returning id into rid;
  insert into public.restaurant_memberships(restaurant_id,user_id,display_name,role) values(rid,uid,'Owner','owner');
  return public.pos_staff_snapshot(rid);
end;
$$;

create or replace function public.pos_staff_command(p_restaurant_id uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare member public.restaurant_memberships; rid uuid; oid uuid; target public.orders; old_payment public.payments;
  shift_row public.shifts; staff_row public.restaurant_memberships; table_row public.dining_tables; result_order public.orders;
  method text; received bigint; total bigint; revision bigint; key uuid; row_id uuid; names text[];
  staff_uid uuid; cash_total bigint; transfer_total bigint; count_total integer; quote_key jsonb; previous private.order_submissions;
begin
  member:=private.pos_member(p_restaurant_id); rid:=member.restaurant_id;
  perform private.pos_lock(rid);
  -- Recheck after the lock: another administrator may have deactivated the actor.
  member:=private.pos_member(rid);
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>120000 then raise exception using message='invalid',errcode='P0001'; end if;
  if (p_action like 'menu.%' and p_action<>'menu.availability') or p_action like 'table.%' or p_action in ('settings.save','staff.save') then
    if member.role not in ('owner','manager') then raise exception using message='access-denied',errcode='P0001'; end if;
  end if;
  if p_action='settings.save' and member.role<>'owner' then raise exception using message='access-denied',errcode='P0001'; end if;
  if p_action='menu.save' then
    if coalesce(nullif(p_payload->>'image',''),'/images/menu-placeholder.svg') !~ '^(/images/[A-Za-z0-9][A-Za-z0-9._/-]*|https://[A-Za-z0-9][A-Za-z0-9.:-]*(/[^[:space:]<>]*)?)$' or coalesce(p_payload->>'image','') ~ '(\.\.|%[25][EeFfCc]|\\)' then raise exception using message='invalid',errcode='P0001'; end if;
    row_id:=nullif(p_payload->>'id','')::uuid;
    if row_id is not null and not exists(select 1 from public.menu_items where id=row_id and restaurant_id=rid) then raise exception using message='changed',errcode='P0001'; end if;
    if row_id is null then
      insert into public.menu_items(restaurant_id,code,name_lo,name_th,name_en,name_zh,name_ko,name_ja,detail_lo,detail_th,price,category,image_path,popular,available)
      values(rid,gen_random_uuid()::text,btrim(p_payload->>'lo'),coalesce(p_payload->>'th',''),coalesce(p_payload->>'en',''),coalesce(p_payload->>'zh',''),coalesce(p_payload->>'ko',''),coalesce(p_payload->>'ja',''),coalesce(p_payload->>'detailLo',''),coalesce(p_payload->>'detailTh',''),(p_payload->>'price')::bigint,p_payload->>'category',coalesce(nullif(p_payload->>'image',''),'/images/menu-placeholder.svg'),coalesce((p_payload->>'popular')::boolean,false),coalesce((p_payload->>'available')::boolean,true));
    else
      update public.menu_items set name_lo=btrim(p_payload->>'lo'),name_th=coalesce(p_payload->>'th',''),name_en=coalesce(p_payload->>'en',''),name_zh=coalesce(p_payload->>'zh',''),name_ko=coalesce(p_payload->>'ko',''),name_ja=coalesce(p_payload->>'ja',''),detail_lo=coalesce(p_payload->>'detailLo',''),detail_th=coalesce(p_payload->>'detailTh',''),price=(p_payload->>'price')::bigint,category=p_payload->>'category',image_path=coalesce(nullif(p_payload->>'image',''),'/images/menu-placeholder.svg'),popular=coalesce((p_payload->>'popular')::boolean,false),available=coalesce((p_payload->>'available')::boolean,true),enabled=true where id=row_id and restaurant_id=rid;
    end if;
  elsif p_action in ('menu.remove','menu.availability') then
    update public.menu_items set enabled=case when p_action='menu.remove' then false else enabled end,
      available=case when p_action='menu.availability' then (p_payload->>'available')::boolean else available end where id=(p_payload->>'id')::uuid and restaurant_id=rid and enabled;
    if not found then raise exception using message='changed',errcode='P0001'; end if;
  elsif p_action in ('table.add','table.update') then
    if p_action='table.add' then
      insert into public.dining_tables(restaurant_id,table_number,seats,zone) values(rid,(p_payload->>'number')::smallint,coalesce((p_payload->>'seats')::smallint,4),coalesce(p_payload->>'zone',''))
      on conflict(restaurant_id,table_number) do update set enabled=true,seats=excluded.seats,zone=excluded.zone,public_key=gen_random_uuid() where not dining_tables.enabled;
      if not found then raise exception using message='invalid',errcode='P0001'; end if;
    else
      select * into table_row from public.dining_tables where id=(p_payload->>'id')::uuid and restaurant_id=rid and enabled;
      if table_row.id is null then raise exception using message='changed',errcode='P0001'; end if;
      if exists(select 1 from public.orders where table_id=table_row.id and status not in ('completed','rejected')) and table_row.table_number<>(p_payload->>'number')::smallint then raise exception using message='table-busy',errcode='P0001'; end if;
      update public.dining_tables set table_number=(p_payload->>'number')::smallint,seats=(p_payload->>'seats')::smallint,zone=coalesce(p_payload->>'zone','') where id=table_row.id;
    end if;
  elsif p_action='table.remove' then
    row_id:=(p_payload->>'id')::uuid;
    if exists(select 1 from public.orders where table_id=row_id and restaurant_id=rid and status not in ('completed','rejected')) then raise exception using message='table-busy',errcode='P0001'; end if;
    update public.dining_tables set enabled=false where id=row_id and restaurant_id=rid and enabled;
    if not found then raise exception using message='changed',errcode='P0001'; end if;
    update private.table_visits set closed_at=now() where table_id=row_id and closed_at is null;
    update public.guest_calls set active=false,revision=guest_calls.revision+1 where table_id=row_id;
  elsif p_action='settings.save' then
    select array_agg(value) into names from jsonb_array_elements_text(p_payload->'methods');
    update public.restaurants set name=btrim(p_payload->>'name'),branch=coalesce(p_payload->>'branch',''),phone=coalesce(p_payload->>'phone',''),payment_methods=names where id=rid;
  elsif p_action='staff.save' then
    row_id:=nullif(p_payload->>'id','')::uuid;
    if p_payload->>'role' not in ('manager','cashier','owner') then raise exception using message='invalid',errcode='P0001'; end if;
    if row_id is not null then
      select * into staff_row from public.restaurant_memberships where id=row_id and restaurant_id=rid;
      if staff_row.id is null then raise exception using message='changed',errcode='P0001'; end if;
      if staff_row.role='owner' or (p_payload->>'role')='owner' or row_id=member.id then raise exception using message='access-denied',errcode='P0001'; end if;
      update public.restaurant_memberships set display_name=btrim(p_payload->>'name'),role=p_payload->>'role',active=coalesce((p_payload->>'active')::boolean,true) where id=row_id;
    else
      select id into staff_uid from auth.users where email_confirmed_at is not null and ((p_payload->>'authEmail' is not null and lower(email)=lower(btrim(p_payload->>'authEmail'))) or (p_payload->>'authEmail' is null and id=nullif(p_payload->>'authUserId','')::uuid));
      if p_payload->>'role'='owner' or staff_uid is null then raise exception using message='staff-account',errcode='P0001'; end if;
      insert into public.restaurant_memberships(restaurant_id,user_id,display_name,role,active) values(rid,staff_uid,btrim(p_payload->>'name'),p_payload->>'role',coalesce((p_payload->>'active')::boolean,true));
    end if;
  elsif p_action='shift.open' then
    if exists(select 1 from public.shifts where restaurant_id=rid and closed_at is null) then raise exception using message='shift-open',errcode='P0001'; end if;
    insert into public.shifts(restaurant_id,opened_by,opening_cash) values(rid,member.id,(p_payload->>'openingCash')::bigint);
  elsif p_action='shift.close' then
    select * into shift_row from public.shifts where id=(p_payload->>'id')::uuid and restaurant_id=rid and closed_at is null;
    if shift_row.id is null then raise exception using message='shift-closed',errcode='P0001'; end if;
    select coalesce(sum(amount) filter(where p.method='cash'),0),coalesce(sum(amount) filter(where p.method='transfer'),0),count(*) into cash_total,transfer_total,count_total from public.payments p where p.shift_id=shift_row.id;
    if (p_payload->>'expectedCash')::bigint is distinct from shift_row.opening_cash+cash_total then raise exception using message='changed',errcode='P0001'; end if;
    update public.shifts set closed_by=member.id,closed_at=now(),counted_cash=(p_payload->>'countedCash')::bigint,
      cash_sales=cash_total,transfer_sales=transfer_total,order_count=count_total,expected_cash=opening_cash+cash_total,
      difference=(p_payload->>'countedCash')::bigint-opening_cash-cash_total where id=shift_row.id;
  elsif p_action='order.create' then
    select * into table_row from public.dining_tables where restaurant_id=rid and table_number=(p_payload->>'table')::smallint and enabled;
    if table_row.id is null then raise exception using message='table',errcode='P0001'; end if;
    key:=(p_payload->>'requestId')::uuid;
    if key is null then raise exception using message='request-id',errcode='P0001'; end if;
    quote_key:=(p_payload->>'reviewedKey')::jsonb;
    if quote_key is distinct from jsonb_build_array(table_row.table_number,p_payload->'cart',p_payload->>'method') then raise exception using message='cart-changed',errcode='P0001'; end if;
    select * into previous from private.order_submissions where restaurant_id=rid and table_id=table_row.id and actor_key='staff:'||member.id::text and request_id=key::text;
    if previous.order_id is not null then
      if previous.reviewed_key<>quote_key then raise exception using message='request-conflict',errcode='P0001'; end if;
      return public.pos_staff_snapshot(rid)||jsonb_build_object('commandChanged',false,'commandOrderId',previous.order_id);
    end if;
    result_order:=private.pos_insert_order(rid,table_row.id,'cashier',member.id,p_payload->'cart',p_payload->>'method',key);
    oid:=result_order.id;
    insert into private.order_submissions(order_id,restaurant_id,table_id,actor_key,request_id,reviewed_key) values(result_order.id,rid,table_row.id,'staff:'||member.id::text,key::text,quote_key);
  elsif p_action like 'order.%' then
    oid:=(p_payload->>'id')::uuid;
    select * into target from public.orders where id=oid and restaurant_id=rid;
    if target.id is null then raise exception using message='changed',errcode='P0001'; end if;
    revision:=(p_payload->>'revision')::bigint;
    if p_action='order.pay' then
      key:=(p_payload->>'idempotencyKey')::uuid; method:=p_payload->>'method'; received:=(p_payload->>'received')::bigint;
      if key is null then raise exception using message='request-id',errcode='P0001'; end if;
      select * into old_payment from public.payments where restaurant_id=rid and idempotency_key=key;
      if old_payment.id is not null then
        if old_payment.order_id<>oid or old_payment.reviewed_revision is distinct from revision or old_payment.method is distinct from method or old_payment.cash_received is distinct from (case when method='cash' then received else null end) then raise exception using message='request-conflict',errcode='P0001'; end if;
        return public.pos_staff_snapshot(rid)||jsonb_build_object('commandChanged',false,'commandOrderId',oid);
      end if;
      if target.paid or target.status<>'pending' then raise exception using message='already-paid',errcode='P0001'; end if;
      if revision is distinct from target.revision then raise exception using message='changed',errcode='P0001'; end if;
      if not exists(select 1 from public.restaurants where id=rid and method=any(payment_methods)) then raise exception using message='method',errcode='P0001'; end if;
      select * into shift_row from public.shifts where restaurant_id=rid and closed_at is null;
      if shift_row.id is null then raise exception using message='shift-required',errcode='P0001'; end if;
      select sum(line_total) into total from public.order_items where order_id=oid;
      if total is null or (method='cash' and (received is null or received<total or received>10000000000)) then raise exception using message='amount',errcode='P0001'; end if;
      update public.orders set paid=true,paid_at=now(),status='queued',kitchen_pending=true,requested_method=method,revision=target.revision+1 where id=oid;
      insert into public.payments(restaurant_id,order_id,shift_id,confirmed_by,amount,method,cash_received,idempotency_key,reviewed_revision) values(rid,oid,shift_row.id,member.id,total,method,case when method='cash' then received else null end,key,revision);
      insert into public.kitchen_print_jobs(restaurant_id,order_id,requested_by,idempotency_key) values(rid,oid,member.id,key);
    elsif p_action='order.kitchen-sent' then
      if target.paid and target.kitchen_sent_at is not null then return public.pos_staff_snapshot(rid); end if;
      if revision is distinct from target.revision then raise exception using message='changed',errcode='P0001'; end if;
      if not target.paid or target.status<>'queued' or not target.kitchen_pending then raise exception using message='transition',errcode='P0001'; end if;
      update public.orders set status='cooking',kitchen_pending=false,kitchen_sent_at=now(),revision=target.revision+1 where id=oid;
      update public.kitchen_print_jobs set status='dispatched',dispatched_at=now(),attempts=attempts+1 where order_id=oid and kind='original' and status<>'dispatched';
    else
      if revision is distinct from target.revision then raise exception using message='changed',errcode='P0001'; end if;
      if p_action='order.reject' and target.status='pending' and not target.paid then
        update public.orders set status='rejected',revision=target.revision+1 where id=oid;
        if not exists(select 1 from public.orders where table_id=target.table_id and status not in ('completed','rejected')) then update private.table_visits set closed_at=now() where table_id=target.table_id and closed_at is null; end if;
      elsif p_action='order.serve' and target.paid and not target.kitchen_pending and target.status in ('queued','cooking','ready') then
        update public.orders set status='served',revision=target.revision+1 where id=oid;
      elsif p_action='order.close' and target.paid and target.status='served' then
        update public.orders set status='completed',revision=target.revision+1 where id=oid;
        if not exists(select 1 from public.orders where table_id=target.table_id and status not in ('completed','rejected')) then
          update private.table_visits set closed_at=now() where table_id=target.table_id and closed_at is null;
          update public.guest_calls set active=false,revision=guest_calls.revision+1 where table_id=target.table_id;
        end if;
      else raise exception using message='transition',errcode='P0001'; end if;
    end if;
  elsif p_action='call.answer' then
    update public.guest_calls set active=false,revision=guest_calls.revision+1 where restaurant_id=rid and table_id in(select id from public.dining_tables where restaurant_id=rid and table_number=(p_payload->>'table')::smallint);
  else raise exception using message='action',errcode='P0001'; end if;
  if p_action<>'order.create' then insert into public.activity_log(restaurant_id,actor_membership_id,order_id,event_type) values(rid,member.id,oid,p_action); end if;
  return public.pos_staff_snapshot(rid)||jsonb_build_object('commandChanged',true,'commandOrderId',oid);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or unique_violation or foreign_key_violation then
  raise exception using message='invalid',errcode='P0001';
end;
$$;

create table if not exists private.guest_call_owners (
  table_id uuid primary key references public.dining_tables(id), token_hash text not null
);
alter table private.guest_call_owners enable row level security;
revoke all on private.guest_call_owners from public,anon,authenticated;

create or replace function public.pos_guest_orders(p_table_key uuid,p_guest_token text,p_request_id text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare dining public.dining_tables; identity_id uuid; hashed text; matched uuid;
begin
  if p_guest_token is null or p_guest_token !~ '^[0-9a-f]{48}$' or (p_request_id is not null and p_request_id !~ '^[0-9a-f]{48}$') then raise exception using message='guest-token',errcode='P0001'; end if;
  select t.* into dining from public.dining_tables t join public.restaurants r on r.id=t.restaurant_id where t.public_key=p_table_key and t.enabled and r.enabled;
  if dining.id is null then raise exception using message='table',errcode='P0001'; end if;
  hashed:=encode(sha256(convert_to(p_guest_token,'UTF8')),'hex');
  select g.id into identity_id from private.guest_identities g join private.table_visits v on v.id=g.visit_id
    where g.table_id=dining.id and g.token_hash=hashed and v.id=(select latest.id from private.table_visits latest where latest.table_id=dining.id order by latest.visit_number desc limit 1);
  if p_request_id is not null then
    select s.order_id into matched from private.order_submissions s where s.restaurant_id=dining.restaurant_id and s.table_id=dining.id and s.actor_key='guest:'||hashed and s.request_id=p_request_id;
  end if;
  return jsonb_build_object('orders',coalesce((select jsonb_agg(private.pos_order_json(s.order_id) order by s.created_at desc) from private.order_submissions s where s.guest_id=identity_id),'[]'::jsonb),
    'matchedOrder',private.pos_order_json(matched), 'call',(select jsonb_build_object('reason',c.reason,'created_at',c.created_at) from public.guest_calls c join private.guest_call_owners own on own.table_id=c.table_id where c.table_id=dining.id and c.active and own.token_hash=hashed));
end;
$$;

create or replace function public.pos_guest_submit(p_table_key uuid,p_guest_token text,p_request_id text,p_cart jsonb,p_method text,p_reviewed_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare dining public.dining_tables; hashed text; visit uuid; identity_id uuid; quote_key jsonb; previous private.order_submissions; result public.orders;
begin
  if p_guest_token is null or p_guest_token !~ '^[0-9a-f]{48}$' or p_request_id is null or p_request_id !~ '^[0-9a-f]{48}$' then raise exception using message='guest-token',errcode='P0001'; end if;
  select t.* into dining from public.dining_tables t join public.restaurants r on r.id=t.restaurant_id where t.public_key=p_table_key and t.enabled and r.enabled;
  if dining.id is null then raise exception using message='table',errcode='P0001'; end if;
  perform private.pos_lock(dining.restaurant_id);
  select t.* into dining from public.dining_tables t join public.restaurants r on r.id=t.restaurant_id where t.public_key=p_table_key and t.enabled and r.enabled;
  if dining.id is null then raise exception using message='table',errcode='P0001'; end if;
  hashed:=encode(sha256(convert_to(p_guest_token,'UTF8')),'hex');
  if p_reviewed_key is null or octet_length(p_reviewed_key)>100000 then raise exception using message='cart-changed',errcode='P0001'; end if;
  quote_key:=p_reviewed_key::jsonb;
  if quote_key is distinct from jsonb_build_array(dining.table_number,p_cart,p_method) then raise exception using message='cart-changed',errcode='P0001'; end if;
  select * into previous from private.order_submissions where restaurant_id=dining.restaurant_id and table_id=dining.id and actor_key='guest:'||hashed and request_id=p_request_id;
  if previous.order_id is not null then
    if previous.reviewed_key<>quote_key then raise exception using message='request-conflict',errcode='P0001'; end if;
    select * into result from public.orders where id=previous.order_id;
    return jsonb_build_object('orderId',result.id,'orderNumber',result.order_number);
  end if;
  if (select count(*) from private.order_submissions where restaurant_id=dining.restaurant_id and actor_key='guest:'||hashed and created_at>now()-interval '1 minute')>=5
    or (select count(*) from private.order_submissions where table_id=dining.id and actor_key like 'guest:%' and created_at>now()-interval '1 minute')>=12
    or (select count(*) from private.order_submissions where restaurant_id=dining.restaurant_id and actor_key like 'guest:%' and created_at>now()-interval '1 minute')>=60 then raise exception using message='rate-limit',errcode='P0001'; end if;
  select id into visit from private.table_visits where table_id=dining.id and closed_at is null;
  if visit is null then insert into private.table_visits(restaurant_id,table_id) values(dining.restaurant_id,dining.id) returning id into visit; end if;
  insert into private.guest_identities(restaurant_id,table_id,visit_id,token_hash) values(dining.restaurant_id,dining.id,visit,hashed) on conflict(visit_id,token_hash) do nothing;
  select id into identity_id from private.guest_identities where visit_id=visit and token_hash=hashed;
  result:=private.pos_insert_order(dining.restaurant_id,dining.id,'qr',null,p_cart,p_method);
  insert into private.order_submissions(order_id,restaurant_id,table_id,guest_id,actor_key,request_id,reviewed_key)
    values(result.id,dining.restaurant_id,dining.id,identity_id,'guest:'||hashed,p_request_id,quote_key);
  return jsonb_build_object('orderId',result.id,'orderNumber',result.order_number);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception using message='cart',errcode='P0001';
end;
$$;

create or replace function public.pos_guest_cancel(p_table_key uuid,p_guest_token text,p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare dining public.dining_tables; hashed text; target public.orders;
begin
  if p_guest_token is null or p_guest_token !~ '^[0-9a-f]{48}$' then raise exception using message='guest-token',errcode='P0001'; end if;
  select t.* into dining from public.dining_tables t join public.restaurants r on r.id=t.restaurant_id where t.public_key=p_table_key and t.enabled and r.enabled;
  if dining.id is null then raise exception using message='table',errcode='P0001'; end if;
  perform private.pos_lock(dining.restaurant_id);
  select t.* into dining from public.dining_tables t join public.restaurants r on r.id=t.restaurant_id where t.public_key=p_table_key and t.enabled and r.enabled;
  if dining.id is null then raise exception using message='table',errcode='P0001'; end if;
  hashed:=encode(sha256(convert_to(p_guest_token,'UTF8')),'hex');
  select o.* into target from public.orders o join private.order_submissions s on s.order_id=o.id
    where o.id=p_order_id and s.table_id=dining.id and s.actor_key='guest:'||hashed;
  if target.id is null then raise exception using message='access-denied',errcode='P0001'; end if;
  if target.paid or target.status not in ('pending','rejected') then raise exception using message='transition',errcode='P0001'; end if;
  if target.status='pending' then
    update public.orders set status='rejected',revision=orders.revision+1 where id=target.id;
    if not exists(select 1 from public.orders where table_id=target.table_id and status not in ('completed','rejected')) then update private.table_visits set closed_at=now() where table_id=target.table_id and closed_at is null; end if;
    insert into public.activity_log(restaurant_id,order_id,event_type) values(dining.restaurant_id,target.id,'order.guest-cancel');
  end if;
  return public.pos_guest_orders(p_table_key,p_guest_token);
end;
$$;

create or replace function public.pos_guest_call(p_table_key uuid,p_guest_token text,p_active boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare dining public.dining_tables; hashed text;
begin
  if p_guest_token is null or p_guest_token !~ '^[0-9a-f]{48}$' or p_active is null then raise exception using message='guest-token',errcode='P0001'; end if;
  select t.* into dining from public.dining_tables t join public.restaurants r on r.id=t.restaurant_id where t.public_key=p_table_key and t.enabled and r.enabled;
  if dining.id is null then raise exception using message='table',errcode='P0001'; end if;
  perform private.pos_lock(dining.restaurant_id);
  select t.* into dining from public.dining_tables t join public.restaurants r on r.id=t.restaurant_id where t.public_key=p_table_key and t.enabled and r.enabled;
  if dining.id is null then raise exception using message='table',errcode='P0001'; end if;
  hashed:=encode(sha256(convert_to(p_guest_token,'UTF8')),'hex');
  if p_active then
    if (select count(*) from private.guest_call_events where restaurant_id=dining.restaurant_id and token_hash=hashed and created_at>now()-interval '1 minute')>=5
      or (select count(*) from private.guest_call_events where table_id=dining.id and created_at>now()-interval '1 minute')>=12
      or (select count(*) from private.guest_call_events where restaurant_id=dining.restaurant_id and created_at>now()-interval '1 minute')>=60 then raise exception using message='rate-limit',errcode='P0001'; end if;
    insert into private.guest_call_events(restaurant_id,table_id,token_hash) values(dining.restaurant_id,dining.id,hashed);
    insert into private.guest_call_owners(table_id,token_hash) values(dining.id,hashed) on conflict(table_id) do update set token_hash=excluded.token_hash;
    insert into public.guest_calls(table_id,restaurant_id) values(dining.id,dining.restaurant_id)
      on conflict(table_id) do update set active=true,created_at=now(),revision=guest_calls.revision+1;
    insert into public.activity_log(restaurant_id,event_type,details) values(dining.restaurant_id,'call',jsonb_build_object('table',dining.table_number));
  elsif exists(select 1 from private.guest_call_owners where table_id=dining.id and token_hash=hashed) then
    update public.guest_calls set active=false,revision=guest_calls.revision+1 where table_id=dining.id;
  else raise exception using message='access-denied',errcode='P0001'; end if;
  return jsonb_build_object('active',p_active);
end;
$$;

-- Every helper remains private even if a project changed its default privileges.
revoke all on function private.pos_lock(uuid),private.pos_member(uuid),private.pos_order_json(uuid),private.pos_quote(uuid,jsonb),private.pos_insert_order(uuid,uuid,text,uuid,jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.pos_staff_snapshot(uuid),public.pos_claim_owner(text),public.pos_staff_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_staff_snapshot(uuid),public.pos_claim_owner(text),public.pos_staff_command(uuid,text,jsonb) to authenticated;
revoke all on function public.pos_guest_orders(uuid,text,text),public.pos_guest_submit(uuid,text,text,jsonb,text,text),public.pos_guest_cancel(uuid,text,uuid),public.pos_guest_call(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.pos_guest_orders(uuid,text,text),public.pos_guest_submit(uuid,text,text,jsonb,text,text),public.pos_guest_cancel(uuid,text,uuid),public.pos_guest_call(uuid,text,boolean) to anon,authenticated;

-- Realtime only publishes rows already guarded by membership RLS. Private guest
-- identities, token hashes and immutable request records are never published.
do $$ declare table_name text; begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach table_name in array array['orders','payments','menu_items','dining_tables','shifts','restaurant_memberships','activity_log','guest_calls','restaurants','kitchen_print_jobs'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name) then
        execute format('alter publication supabase_realtime add table public.%I',table_name);
      end if;
    end loop;
  end if;
end $$;

create or replace function public.pos_setup_status()
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('schemaVersion',2,'publicMenuReady',true,'guestOrdersReady',true,'paymentsReady',true);
$$;
revoke all on function public.pos_setup_status() from public,anon,authenticated;
grant execute on function public.pos_setup_status() to anon,authenticated;
comment on function public.pos_setup_status() is 'Transactional guest and authenticated staff RPCs installed; no sample data is installed.';
commit;
