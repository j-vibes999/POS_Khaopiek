-- Keep daily polling small. Legacy snapshots and write RPCs stay available.
begin;

do $$ begin
  if pg_catalog.to_regprocedure('private.pos_device_authorize(text)') is null
    or pg_catalog.to_regprocedure('private.pos_order_json(uuid)') is null
    or not exists (
      select 1 from pg_catalog.pg_attribute
      where attrelid='public.orders'::regclass and attname='table_number_at_order' and not attisdropped
    ) then
    raise exception 'Run the earlier POS migrations before installing staff reads';
  end if;
end $$;

create index if not exists orders_staff_active_idx
  on public.orders (restaurant_id,created_at desc,id desc)
  where status not in ('completed','rejected');
create index if not exists orders_staff_history_idx
  on public.orders (restaurant_id,created_at desc,id desc)
  where status in ('completed','rejected');
create index if not exists orders_staff_paid_date_idx
  on public.orders (restaurant_id,(coalesce(paid_at,created_at)))
  where paid;
create index if not exists shifts_staff_history_idx
  on public.shifts (restaurant_id,opened_at desc,id desc)
  where closed_at is not null;

-- The two public wrappers obtain the member from Auth or the trusted device.
-- Clients cannot choose a restaurant or role by supplying a membership row.
create or replace function private.pos_staff_read_data(
  p_member public.restaurant_memberships, p_view text, p_params jsonb
)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  rid uuid := p_member.restaurant_id;
  open_shift uuid;
  page_limit integer;
  page_offset bigint;
  query text;
  shift_owner uuid;
  report_range text;
  start_at timestamptz;
  result jsonb;
begin
  if p_view is null or p_view not in ('operational','orders','shifts','activity','reports')
    or jsonb_typeof(p_params) is distinct from 'object' or octet_length(p_params::text)>4096 then
    raise exception using message='invalid',errcode='P0001';
  end if;

  if p_view='operational' then
    select s.id into open_shift from public.shifts s where s.restaurant_id=rid and s.closed_at is null;
    return jsonb_build_object(
      'restaurantId',rid,'membership',to_jsonb(p_member),'readOptimized',true,
      'restaurants',(select to_jsonb(r) from public.restaurants r where r.id=rid),
      'members',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object(
        'email',case when p_member.role in ('owner','manager') then (select u.email from auth.users u where u.id=m.user_id) end
      ) order by m.created_at,m.id) from public.restaurant_memberships m where m.restaurant_id=rid),'[]'::jsonb),
      'menu_items',coalesce((select jsonb_agg(to_jsonb(m) order by m.sort_order,m.created_at,m.id)
        from public.menu_items m where m.restaurant_id=rid and m.enabled),'[]'::jsonb),
      'dining_tables',coalesce((select jsonb_agg(to_jsonb(t) order by t.table_number)
        from public.dining_tables t where t.restaurant_id=rid and t.enabled),'[]'::jsonb),
      'orders',coalesce((select jsonb_agg(private.pos_order_json(o.id) order by o.created_at desc,o.id desc)
        from public.orders o where o.restaurant_id=rid and o.status not in ('completed','rejected')),'[]'::jsonb),
      'shifts',coalesce((select jsonb_agg(to_jsonb(s))
        from public.shifts s where s.restaurant_id=rid and s.id=open_shift),'[]'::jsonb),
      'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.confirmed_at desc,p.id desc)
        from public.payments p where p.restaurant_id=rid and p.shift_id=open_shift),'[]'::jsonb),
      'activity_log','[]'::jsonb,'kitchen_print_jobs','[]'::jsonb,
      'historyRevision',(select a.id from public.activity_log a where a.restaurant_id=rid order by a.created_at desc,a.id desc limit 1),
      'calls',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('table_number',t.table_number) order by t.table_number)
        from public.guest_calls c join public.dining_tables t on t.id=c.table_id and t.restaurant_id=c.restaurant_id
        where c.restaurant_id=rid and c.active),'[]'::jsonb)
    );
  end if;

  if p_view='reports' then
    if p_member.role not in ('owner','manager') then
      raise exception using message='access-denied',errcode='P0001';
    end if;
    report_range:=coalesce(p_params->>'range','today');
    if report_range not in ('today','week','all') then raise exception using message='invalid',errcode='P0001'; end if;
    if report_range<>'all' then
      -- Laos has a fixed UTC+7 day boundary. The seven-day range includes today.
      start_at:=date_trunc('day',now(),'Asia/Vientiane')-
        case when report_range='week' then interval '144 hours' else interval '0' end;
    end if;
    with paid_orders as materialized (
      select o.id,o.requested_method,o.created_at from public.orders o
      where o.restaurant_id=rid and o.paid and (start_at is null or coalesce(o.paid_at,o.created_at)>=start_at)
    ), lines as materialized (
      select i.menu_item_id,i.line_number,i.name_lo,i.name_th,i.image_path,i.quantity,i.line_total,
        o.id as order_id,o.requested_method,o.created_at
      from paid_orders o join public.order_items i on i.order_id=o.id and i.restaurant_id=rid
    ), line_totals as (
      select coalesce(sum(line_total),0) as total,
        coalesce(sum(line_total) filter (where requested_method='cash'),0) as cash,
        coalesce(sum(line_total) filter (where requested_method='transfer'),0) as transfer
      from lines
    ), order_counts as (
      select count(*) as total,count(*) filter(where requested_method='cash') as cash,
        count(*) filter(where requested_method='transfer') as transfer
      from paid_orders
    ), item_totals as (
      select menu_item_id,sum(quantity) as quantity,sum(line_total) as amount from lines group by menu_item_id
    ), newest_item_names as (
      -- Match the existing report: labels come from the newest paid receipt.
      select distinct on (menu_item_id) menu_item_id,name_lo,name_th,image_path
      from lines order by menu_item_id,created_at desc,order_id desc,line_number
    )
    select jsonb_build_object(
      'total',lt.total,'orderCount',oc.total,'cash',lt.cash,'transfer',lt.transfer,
      'cashCount',oc.cash,'transferCount',oc.transfer,
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'id',i.menu_item_id,'name_lo',n.name_lo,'name_th',n.name_th,'image_path',n.image_path,
        'quantity',i.quantity,'amount',i.amount
      ) order by i.quantity desc,i.menu_item_id)
        from item_totals i join newest_item_names n on n.menu_item_id is not distinct from i.menu_item_id
      ),'[]'::jsonb)
    ) into result from line_totals lt cross join order_counts oc;
    return result;
  end if;

  if p_view='activity' and p_member.role<>'owner' then
    raise exception using message='access-denied',errcode='P0001';
  end if;
  if (p_params ? 'limit' and (
        jsonb_typeof(p_params->'limit') is distinct from 'number' or p_params->>'limit' !~ '^[1-9][0-9]?$'
      ))
    or (p_params ? 'offset' and (
        jsonb_typeof(p_params->'offset') is distinct from 'number' or p_params->>'offset' !~ '^[0-9]{1,10}$'
      )) then
    raise exception using message='invalid',errcode='P0001';
  end if;
  page_limit:=least(50,coalesce((p_params->>'limit')::integer,case when p_view='activity' then 50 else 25 end));
  page_offset:=coalesce((p_params->>'offset')::bigint,0);

  if p_view='orders' then
    query:=left(coalesce(p_params->>'query',''),64);
    -- Apply the receipt/table search before selecting a page. strpos keeps
    -- user-entered percent signs and underscores literal.
    with matches as not materialized (
      select o.id,o.created_at from public.orders o
      where o.restaurant_id=rid and o.status in ('completed','rejected')
        and (query='' or strpos(o.order_number::text,query)>0 or
          strpos(lpad(o.table_number_at_order::text,greatest(2,char_length(o.table_number_at_order::text)),'0'),
            lpad(query,greatest(2,char_length(query)),'0'))>0)
    ), page as (
      select * from matches order by created_at desc,id desc limit page_limit offset page_offset
    ), tally as (select count(*) total from matches)
    select jsonb_build_object(
      'rows',coalesce((select jsonb_agg(private.pos_order_json(id) order by created_at desc,id desc) from page),'[]'::jsonb),
      'total',total,'hasMore',total>page_offset+page_limit
    ) into result from tally;
  elsif p_view='shifts' then
    if p_member.role='cashier' or p_params->'ownOnly'='true'::jsonb then shift_owner:=p_member.id; end if;
    with matches as not materialized (
      select s.* from public.shifts s where s.restaurant_id=rid and s.closed_at is not null
        and (shift_owner is null or s.opened_by=shift_owner)
    ), page as (
      select * from matches order by opened_at desc,id desc limit page_limit offset page_offset
    ), tally as (select count(*) total from matches)
    select jsonb_build_object(
      'rows',coalesce((select jsonb_agg(to_jsonb(page) order by opened_at desc,id desc) from page),'[]'::jsonb),
      'total',total,'hasMore',total>page_offset+page_limit
    ) into result from tally;
  else
    with page as (
      select a.* from public.activity_log a where a.restaurant_id=rid
      order by a.created_at desc,a.id desc limit page_limit offset page_offset
    ), tally as (select count(*) total from public.activity_log a where a.restaurant_id=rid)
    select jsonb_build_object(
      'rows',coalesce((select jsonb_agg(
        to_jsonb(a)||jsonb_build_object('details',a.details||
          case when a.details->>'orderNumber' is null and o.order_number is not null
            then jsonb_build_object('orderNumber',o.order_number) else '{}'::jsonb end)
        order by a.created_at desc,a.id desc)
        from page a left join public.orders o on o.id=a.order_id and o.restaurant_id=rid
      ),'[]'::jsonb),
      'total',total,'hasMore',total>page_offset+page_limit
    ) into result from tally;
  end if;
  return result;
end;
$$;

create or replace function public.pos_staff_read(p_restaurant_id uuid,p_view text,p_params jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare member public.restaurant_memberships;
begin
  -- An authenticated call can only act as its own account.
  if auth.uid() is null then raise exception using message='session-expired',errcode='P0001'; end if;
  member:=private.pos_member(p_restaurant_id);
  return private.pos_staff_read_data(member,p_view,p_params);
end;
$$;

create or replace function public.pos_device_read(p_device_key text,p_view text,p_params jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare device private.pos_devices; member public.restaurant_memberships;
begin
  device:=private.pos_device_authorize(p_device_key);
  if device.membership_id is null then raise exception using message='no-membership',errcode='P0001'; end if;
  select m.* into member from public.restaurant_memberships m join public.restaurants r on r.id=m.restaurant_id
  where m.restaurant_id=device.restaurant_id and m.id=device.membership_id and m.role='owner' and m.active and r.enabled;
  if member.id is null then raise exception using message='device-denied',errcode='P0001'; end if;
  return private.pos_staff_read_data(member,p_view,p_params);
end;
$$;

revoke all on function private.pos_staff_read_data(public.restaurant_memberships,text,jsonb) from public,anon,authenticated;
revoke all on function public.pos_staff_read(uuid,text,jsonb),public.pos_device_read(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_staff_read(uuid,text,jsonb) to authenticated;
grant execute on function public.pos_device_read(text,text,jsonb) to anon,authenticated;

create or replace function public.pos_setup_status()
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'schemaVersion',2,'publicMenuReady',true,'guestOrdersReady',true,'paymentsReady',true,
    'deviceAccessReady',true,'menuImagesReady',true,'integrityReady',true,'staffReadsReady',true
  );
$$;
revoke all on function public.pos_setup_status() from public,anon,authenticated;
grant execute on function public.pos_setup_status() to anon,authenticated;

notify pgrst, 'reload schema';
commit;
