-- Requires existing POS migrations 1-5. Run this entire file once.
-- Preserves real shop data; corrects menu retries, audit facts and receipt history.

-- Preserve immutable receipts and audit facts; make lost-response menu creates safe.
-- Requires migrations 1..5. No fixture data or authorization grants are added.
begin;

do $$ begin
 if pg_catalog.to_regprocedure('public.pos_device_menu_upload_ticket(text)') is null
  or pg_catalog.to_regprocedure('public.pos_guest_submit(uuid,text,text,jsonb,text,text)') is null then
  raise exception 'Run supabase/upgrade.sql to install the prior POS migrations first';
 end if;
end $$;

alter table public.orders add column if not exists table_number_at_order smallint;
-- Older history can preserve only the table number still known at upgrade time.
update public.orders o set table_number_at_order=t.table_number
 from public.dining_tables t where t.id=o.table_id and t.restaurant_id=o.restaurant_id and o.table_number_at_order is null;
alter table public.orders alter column table_number_at_order set not null;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='orders_table_number_at_order_check') then
  alter table public.orders add constraint orders_table_number_at_order_check check(table_number_at_order between 1 and 60);
 end if;
end $$;

create or replace function private.pos_order_json(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select (to_jsonb(o)-'request_key'-'table_number_at_order') || jsonb_build_object('table_number',o.table_number_at_order,'order_items',coalesce((
    select jsonb_agg(to_jsonb(i) order by i.line_number) from public.order_items i where i.order_id=o.id
  ),'[]'::jsonb)) from public.orders o where o.id=p_order_id;
$$;

create or replace function private.pos_insert_order(p_restaurant_id uuid,p_table_id uuid,p_source text,p_member_id uuid,
  p_cart jsonb,p_method text,p_request_uuid uuid default null)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare result public.orders; quote jsonb; next_number bigint; table_number smallint; total bigint;
begin
  select t.table_number into table_number from public.dining_tables t
    where t.id=p_table_id and t.restaurant_id=p_restaurant_id and t.enabled;
  if table_number is null then raise exception using message='table',errcode='P0001'; end if;
  quote:=private.pos_quote(p_restaurant_id,p_cart);
  if not exists (select 1 from public.restaurants where id=p_restaurant_id and enabled and p_method=any(payment_methods)) then
    raise exception using message='method',errcode='P0001'; end if;
  select coalesce(max(order_number),0)+1 into next_number from public.orders where restaurant_id=p_restaurant_id;
  insert into public.orders(restaurant_id,order_number,table_id,table_number_at_order,source,created_by,requested_method,request_key)
    values(p_restaurant_id,next_number,p_table_id,table_number,p_source,p_member_id,p_method,p_request_uuid) returning * into result;
  insert into public.order_items(restaurant_id,order_id,menu_item_id,line_number,name_lo,name_th,name_en,name_zh,name_ko,name_ja,
    detail_lo,detail_th,category,image_path,size,no_herbs,customization_note,unit_price,quantity)
    select p_restaurant_id,result.id,x.menu_item_id,x.line_number,x.name_lo,x.name_th,x.name_en,x.name_zh,x.name_ko,x.name_ja,
      x.detail_lo,x.detail_th,x.category,x.image_path,x.size,x.no_herbs,x.customization_note,x.unit_price,x.quantity
    from jsonb_to_recordset(quote) as x(menu_item_id uuid,line_number smallint,name_lo text,name_th text,name_en text,name_zh text,
      name_ko text,name_ja text,detail_lo text,detail_th text,category text,image_path text,size text,no_herbs boolean,
      customization_note text,unit_price bigint,quantity smallint);
  select sum(i.line_total) into total from public.order_items i where i.order_id=result.id;
  insert into public.activity_log(restaurant_id,actor_membership_id,order_id,event_type,details)
    values(p_restaurant_id,p_member_id,result.id,'order.create',jsonb_build_object('table',table_number,'orderNumber',next_number,'amount',total,'method',p_method));
  return result;
end;
$$;

create or replace function public.pos_staff_command(p_restaurant_id uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare member public.restaurant_memberships; rid uuid; oid uuid; target public.orders; old_payment public.payments;
  shift_row public.shifts; staff_row public.restaurant_memberships; table_row public.dining_tables; result_order public.orders;
  method text; received bigint; total bigint; revision bigint; key uuid; row_id uuid; names text[];
  staff_uid uuid; cash_total bigint; transfer_total bigint; count_total integer; quote_key jsonb; previous private.order_submissions;
  creation_id uuid; menu_row public.menu_items; event_details jsonb:='{}';
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
    creation_id:=nullif(p_payload->>'creationId','')::uuid;
    -- The restaurant lock serializes a lost-response retry with its first create.
    if row_id is null and creation_id is not null then
      select m.* into menu_row from public.menu_items m where m.restaurant_id=rid and m.code='menu-'||creation_id::text;
      if menu_row.id is not null then
        if not menu_row.enabled then raise exception using message='changed',errcode='P0001'; end if;
        row_id:=menu_row.id;
      end if;
    end if;
    if row_id is not null and not exists(select 1 from public.menu_items where id=row_id and restaurant_id=rid and enabled) then raise exception using message='changed',errcode='P0001'; end if;
    if row_id is null then
      insert into public.menu_items(restaurant_id,code,name_lo,name_th,name_en,name_zh,name_ko,name_ja,detail_lo,detail_th,price,category,image_path,popular,available)
      values(rid,coalesce('menu-'||creation_id::text,gen_random_uuid()::text),btrim(p_payload->>'lo'),coalesce(p_payload->>'th',''),coalesce(p_payload->>'en',''),coalesce(p_payload->>'zh',''),coalesce(p_payload->>'ko',''),coalesce(p_payload->>'ja',''),coalesce(p_payload->>'detailLo',''),coalesce(p_payload->>'detailTh',''),(p_payload->>'price')::bigint,p_payload->>'category',coalesce(nullif(p_payload->>'image',''),'/images/menu-placeholder.svg'),coalesce((p_payload->>'popular')::boolean,false),coalesce((p_payload->>'available')::boolean,true)) returning * into menu_row;
    else
      update public.menu_items set name_lo=btrim(p_payload->>'lo'),name_th=coalesce(p_payload->>'th',''),name_en=coalesce(p_payload->>'en',''),name_zh=coalesce(p_payload->>'zh',''),name_ko=coalesce(p_payload->>'ko',''),name_ja=coalesce(p_payload->>'ja',''),detail_lo=coalesce(p_payload->>'detailLo',''),detail_th=coalesce(p_payload->>'detailTh',''),price=(p_payload->>'price')::bigint,category=p_payload->>'category',image_path=coalesce(nullif(p_payload->>'image',''),'/images/menu-placeholder.svg'),popular=coalesce((p_payload->>'popular')::boolean,false) where id=row_id and restaurant_id=rid and enabled returning * into menu_row;
      if not found then raise exception using message='changed',errcode='P0001'; end if;
    end if;
    event_details:=jsonb_build_object('itemId',menu_row.id,'name',menu_row.name_lo);
  elsif p_action in ('menu.remove','menu.availability') then
    update public.menu_items set enabled=case when p_action='menu.remove' then false else enabled end,
      available=case when p_action='menu.availability' then (p_payload->>'available')::boolean else available end where id=(p_payload->>'id')::uuid and restaurant_id=rid and enabled returning * into menu_row;
    if not found then raise exception using message='changed',errcode='P0001'; end if;
    event_details:=jsonb_build_object('itemId',menu_row.id,'name',menu_row.name_lo,'available',menu_row.available);
  elsif p_action in ('table.add','table.update') then
    if p_action='table.add' then
      insert into public.dining_tables(restaurant_id,table_number,seats,zone) values(rid,(p_payload->>'number')::smallint,coalesce((p_payload->>'seats')::smallint,4),coalesce(p_payload->>'zone',''))
      on conflict(restaurant_id,table_number) do update set enabled=true,seats=excluded.seats,zone=excluded.zone,public_key=gen_random_uuid() where not dining_tables.enabled returning * into table_row;
      if not found then raise exception using message='invalid',errcode='P0001'; end if;
    else
      select * into table_row from public.dining_tables where id=(p_payload->>'id')::uuid and restaurant_id=rid and enabled;
      if table_row.id is null then raise exception using message='changed',errcode='P0001'; end if;
      if exists(select 1 from public.orders where table_id=table_row.id and status not in ('completed','rejected')) and table_row.table_number<>(p_payload->>'number')::smallint then raise exception using message='table-busy',errcode='P0001'; end if;
      update public.dining_tables set table_number=(p_payload->>'number')::smallint,seats=(p_payload->>'seats')::smallint,zone=coalesce(p_payload->>'zone','') where id=table_row.id returning * into table_row;
    end if;
    event_details:=jsonb_build_object('table',table_row.table_number);
  elsif p_action='table.remove' then
    row_id:=(p_payload->>'id')::uuid;
    if exists(select 1 from public.orders where table_id=row_id and restaurant_id=rid and status not in ('completed','rejected')) then raise exception using message='table-busy',errcode='P0001'; end if;
    update public.dining_tables set enabled=false where id=row_id and restaurant_id=rid and enabled returning * into table_row;
    if not found then raise exception using message='changed',errcode='P0001'; end if;
    update private.table_visits set closed_at=now() where table_id=row_id and closed_at is null;
    update public.guest_calls set active=false,revision=guest_calls.revision+1 where table_id=row_id;
    event_details:=jsonb_build_object('table',table_row.table_number);
  elsif p_action='settings.save' then
    select array_agg(value) into names from jsonb_array_elements_text(p_payload->'methods');
    update public.restaurants set name=btrim(p_payload->>'name'),branch=coalesce(p_payload->>'branch',''),phone=coalesce(p_payload->>'phone',''),payment_methods=names where id=rid;
    event_details:=jsonb_build_object('name',btrim(p_payload->>'name'));
  elsif p_action='staff.save' then
    row_id:=nullif(p_payload->>'id','')::uuid;
    if p_payload->>'role' not in ('manager','cashier','owner') then raise exception using message='invalid',errcode='P0001'; end if;
    if row_id is not null then
      select * into staff_row from public.restaurant_memberships where id=row_id and restaurant_id=rid;
      if staff_row.id is null then raise exception using message='changed',errcode='P0001'; end if;
      if staff_row.role='owner' or (p_payload->>'role')='owner' or row_id=member.id then raise exception using message='access-denied',errcode='P0001'; end if;
      update public.restaurant_memberships set display_name=btrim(p_payload->>'name'),role=p_payload->>'role',active=coalesce((p_payload->>'active')::boolean,true) where id=row_id returning * into staff_row;
    else
      select id into staff_uid from auth.users where email_confirmed_at is not null and ((p_payload->>'authEmail' is not null and lower(email)=lower(btrim(p_payload->>'authEmail'))) or (p_payload->>'authEmail' is null and id=nullif(p_payload->>'authUserId','')::uuid));
      if p_payload->>'role'='owner' or staff_uid is null then raise exception using message='staff-account',errcode='P0001'; end if;
      insert into public.restaurant_memberships(restaurant_id,user_id,display_name,role,active) values(rid,staff_uid,btrim(p_payload->>'name'),p_payload->>'role',coalesce((p_payload->>'active')::boolean,true)) returning * into staff_row;
    end if;
    event_details:=jsonb_build_object('name',staff_row.display_name,'role',staff_row.role,'active',staff_row.active);
  elsif p_action='shift.open' then
    if exists(select 1 from public.shifts where restaurant_id=rid and closed_at is null) then raise exception using message='shift-open',errcode='P0001'; end if;
    insert into public.shifts(restaurant_id,opened_by,opening_cash) values(rid,member.id,(p_payload->>'openingCash')::bigint) returning * into shift_row;
    event_details:=jsonb_build_object('shiftId',shift_row.id,'amount',shift_row.opening_cash);
  elsif p_action='shift.close' then
    select * into shift_row from public.shifts where id=(p_payload->>'id')::uuid and restaurant_id=rid and closed_at is null;
    if shift_row.id is null then raise exception using message='shift-closed',errcode='P0001'; end if;
    select coalesce(sum(amount) filter(where p.method='cash'),0),coalesce(sum(amount) filter(where p.method='transfer'),0),count(*) into cash_total,transfer_total,count_total from public.payments p where p.shift_id=shift_row.id;
    if (p_payload->>'expectedCash')::bigint is distinct from shift_row.opening_cash+cash_total then raise exception using message='changed',errcode='P0001'; end if;
    update public.shifts set closed_by=member.id,closed_at=now(),counted_cash=(p_payload->>'countedCash')::bigint,
      cash_sales=cash_total,transfer_sales=transfer_total,order_count=count_total,expected_cash=opening_cash+cash_total,
      difference=(p_payload->>'countedCash')::bigint-opening_cash-cash_total where id=shift_row.id;
    event_details:=jsonb_build_object('shiftId',shift_row.id,'amount',(p_payload->>'countedCash')::bigint,'difference',(p_payload->>'countedCash')::bigint-shift_row.opening_cash-cash_total);
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
    event_details:=jsonb_build_object('table',target.table_number_at_order,'orderNumber',target.order_number);
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
      event_details:=event_details||jsonb_build_object('amount',total,'method',method,'cashReceived',case when method='cash' then received else null end,'shiftId',shift_row.id);
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
    event_details:=jsonb_build_object('table',(p_payload->>'table')::smallint);
  else raise exception using message='action',errcode='P0001'; end if;
  if p_action<>'order.create' then insert into public.activity_log(restaurant_id,actor_membership_id,order_id,event_type,details) values(rid,member.id,oid,p_action,event_details); end if;
  return public.pos_staff_snapshot(rid)||jsonb_build_object('commandChanged',true,'commandOrderId',oid);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or unique_violation or foreign_key_violation then
  raise exception using message='invalid',errcode='P0001';
end;
$$;

-- CREATE OR REPLACE retains the existing account-only/private function grants.
revoke all on function private.pos_order_json(uuid),private.pos_insert_order(uuid,uuid,text,uuid,jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.pos_staff_command(uuid,text,jsonb) from public,anon;

create or replace function public.pos_setup_status()
returns jsonb language sql immutable set search_path = '' as $$
 select jsonb_build_object('schemaVersion',2,'publicMenuReady',true,'guestOrdersReady',true,'paymentsReady',true,'deviceAccessReady',true,'menuImagesReady',true,'integrityReady',true);
$$;
revoke all on function public.pos_setup_status() from public,anon,authenticated;
grant execute on function public.pos_setup_status() to anon,authenticated;
commit;

select public.pos_setup_status() as setup_status;
