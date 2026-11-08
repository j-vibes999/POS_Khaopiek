-- Run only against a disposable test database as its administrative owner.
-- The local harness supplies auth.users, auth.uid(), anon and authenticated.
-- No auth stubs belong in the production migration. All fixture data rolls back.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if to_regclass('public.restaurants') is null then
    raise exception 'Foundation is missing: restaurants must exist';
  end if;
end $$;

insert into auth.users (id) values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003');
insert into public.restaurants (id, name) values
 ('10000000-0000-4000-8000-000000000001', 'Shop One'),
 ('10000000-0000-4000-8000-000000000002', 'Shop Two');
insert into public.restaurant_memberships (id, restaurant_id, user_id, display_name, role, active) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Owner One','owner',true),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Owner Two','owner',true),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','Disabled','cashier',false);
insert into public.dining_tables (id, restaurant_id, table_number, public_key) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'31000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',1,'31000000-0000-4000-8000-000000000002');
insert into public.menu_items (id, restaurant_id, code, name_lo, name_th, price, category, image_path, available) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','test-soup','Original soup','Soup Thai',35000,'khao','/images/khao-piak.jpg',false),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','test-drink','Other shop drink','Drink Thai',15000,'drinks','/images/drink.jpg',true);
insert into public.menu_items (restaurant_id,code,name_lo,price,category,image_path,enabled)
values ('10000000-0000-4000-8000-000000000001','archived','Archived item',10000,'other','/images/drink.jpg',false);
insert into public.shifts (id, restaurant_id, opened_by, opening_cash) values
 ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',100000),
 ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',100000);
insert into public.orders (id, restaurant_id, order_number, table_id, requested_method) values
 ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'30000000-0000-4000-8000-000000000001','cash'),
 ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',1,'30000000-0000-4000-8000-000000000002','transfer');
insert into public.order_items (restaurant_id, order_id, menu_item_id, line_number, name_lo, unit_price, quantity, category) values
 ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',1,'Original soup',35000,2,'khao'),
 ('10000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002',1,'Other shop drink',15000,1,'drinks');

-- Database constraints enforce tenant integrity even for privileged writers.
do $$ begin
  begin
    insert into public.orders (restaurant_id,order_number,table_id,requested_method)
    values ('10000000-0000-4000-8000-000000000001',2,'30000000-0000-4000-8000-000000000002','cash');
    raise exception 'Cross-tenant table reference succeeded';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.order_items (restaurant_id,order_id,menu_item_id,line_number,name_lo,unit_price,quantity,category)
    values ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002',2,'Wrong shop',1,1,'other');
    raise exception 'Cross-tenant menu reference succeeded';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.payments (restaurant_id,order_id,shift_id,confirmed_by,amount,method,cash_received,idempotency_key)
    values ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',70000,'cash',70000,gen_random_uuid());
    raise exception 'Cross-tenant shift reference succeeded';
  exception when foreign_key_violation then null; end;
  begin
    update public.orders set paid=true where id='60000000-0000-4000-8000-000000000001';
    raise exception 'Pending order accepted paid=true without paid_at';
  exception when check_violation then null; end;
  begin
    update public.orders set kitchen_pending=true where id='60000000-0000-4000-8000-000000000001';
    raise exception 'Unpaid order accepted kitchen handoff';
  exception when check_violation then null; end;
  begin
    insert into public.restaurants (name) values ('   ');
    raise exception 'Blank restaurant name succeeded';
  exception when check_violation then null; end;
  begin
    insert into public.shifts (restaurant_id,opened_by,opening_cash)
    values ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',0);
    raise exception 'Second open shift succeeded';
  exception when unique_violation then null; end;
end $$;

update public.orders set paid=true,paid_at=now(),status='queued',kitchen_pending=true
where id in ('60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002');
insert into public.payments (restaurant_id,order_id,shift_id,confirmed_by,amount,method,cash_received,idempotency_key) values
 ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',70000,'cash',100000,'70000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',15000,'transfer',null,'70000000-0000-4000-8000-000000000002');
insert into public.kitchen_print_jobs (restaurant_id,order_id,requested_by,idempotency_key) values
 ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000002');
insert into public.activity_log (restaurant_id,actor_membership_id,order_id,event_type) values
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','payment'),
 ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002','payment');
do $$ begin
  begin
    insert into public.payments (restaurant_id,order_id,shift_id,confirmed_by,amount,method,cash_received,idempotency_key)
    values ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',70000,'cash',70000,gen_random_uuid());
    raise exception 'Duplicate full payment succeeded';
  exception when unique_violation then null; end;
  begin
    insert into public.kitchen_print_jobs (restaurant_id,order_id,requested_by,idempotency_key)
    values ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',gen_random_uuid());
    raise exception 'Duplicate original kitchen print succeeded';
  exception when unique_violation then null; end;
  begin
    insert into public.kitchen_print_jobs (restaurant_id,order_id,requested_by,kind,idempotency_key)
    values ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','reprint','80000000-0000-4000-8000-000000000001');
    raise exception 'Repeated kitchen idempotency key succeeded';
  exception when unique_violation then null; end;
  begin
    update public.orders set status='rejected',kitchen_pending=false where id='60000000-0000-4000-8000-000000000001';
    raise exception 'Paid order became rejected';
  exception when check_violation then null; end;
end $$;
update public.menu_items set name_lo='Changed soup',price=45000 where id='40000000-0000-4000-8000-000000000001';
do $$ begin
  if not exists (select 1 from public.order_items where name_lo='Original soup' and unit_price=35000 and line_total=70000) then
    raise exception 'Menu edit rewrote a historical order snapshot';
  end if;
  begin
    delete from public.menu_items where id='40000000-0000-4000-8000-000000000001';
    raise exception 'Historical menu reference was deleted';
  exception when foreign_key_violation then null; end;
end $$;

set local role anon;
do $$ declare result jsonb; table_name text; begin
  if public.pos_setup_status()->>'schemaVersion' is distinct from '1' then raise exception 'Incorrect schema status'; end if;
  if public.pos_setup_status()->>'guestOrdersReady' is distinct from 'false' or public.pos_setup_status()->>'paymentsReady' is distinct from 'false' then
    raise exception 'Foundation incorrectly advertises order/payment readiness';
  end if;
  result := public.pos_get_menu('31000000-0000-4000-8000-000000000001');
  if result is null or jsonb_typeof(result) is distinct from 'object'
    or result->>'table' is distinct from '1' or result->>'shopName' is distinct from 'Shop One'
    or result->'methods' is distinct from '["transfer","cash"]'::jsonb
    or jsonb_array_length(result->'menu') is distinct from 1
    or result->'menu'->0->>'lo' is distinct from 'Changed soup'
    or result->'menu'->0->>'price' is distinct from '45000'
    or result->'menu'->0->>'available' is distinct from 'false' then
    raise exception 'Scoped public menu contract failed: %', result;
  end if;
  if result::text like '%Other shop%' or result ? 'memberships' then raise exception 'Public menu leaked private/other-shop data'; end if;
  if public.pos_get_menu('ffffffff-ffff-4fff-8fff-ffffffffffff') is not null then raise exception 'Unknown table exposed menu'; end if;
  foreach table_name in array array['restaurants','restaurant_memberships','menu_items','dining_tables','shifts','orders','order_items','payments','kitchen_print_jobs','activity_log'] loop
    begin
      execute format('select * from public.%I',table_name);
      raise exception 'Anon read private table %',table_name;
    exception when insufficient_privilege then null; end;
  end loop;
  begin
    update public.orders set paid=true,paid_at=now(),status='queued' where id='60000000-0000-4000-8000-000000000001';
    raise exception 'Anon marked an order paid';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.payments (restaurant_id,order_id,shift_id,confirmed_by,amount,method,cash_received,idempotency_key)
    values ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',70000,'cash',70000,gen_random_uuid());
    raise exception 'Anon inserted payment';
  exception when insufficient_privilege then null; end;
  begin
    perform private.can_access_restaurant('10000000-0000-4000-8000-000000000001');
    raise exception 'Anon executed membership helper';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.dining_tables set enabled=false where id='30000000-0000-4000-8000-000000000001';
set local role anon;
do $$ begin
  if public.pos_get_menu('31000000-0000-4000-8000-000000000001') is not null then raise exception 'Disabled table exposed menu'; end if;
end $$;
reset role;
update public.dining_tables set enabled=true where id='30000000-0000-4000-8000-000000000001';
update public.restaurants set enabled=false where id='10000000-0000-4000-8000-000000000001';
set local role anon;
do $$ begin
  if public.pos_get_menu('31000000-0000-4000-8000-000000000001') is not null then raise exception 'Disabled restaurant exposed menu'; end if;
end $$;
reset role;
update public.restaurants set enabled=true where id='10000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare table_name text; begin
  if (select count(*) from public.restaurants) <> 1 or (select min(name) from public.restaurants)<>'Shop One' then raise exception 'Restaurant isolation failed'; end if;
  if (select count(*) from public.orders)<>1 or (select count(*) from public.menu_items)<>2
    or (select count(*) from public.dining_tables)<>1 or (select count(*) from public.shifts)<>1
    or (select count(*) from public.order_items)<>1 or (select count(*) from public.payments)<>1
    or (select count(*) from public.kitchen_print_jobs)<>1 or (select count(*) from public.activity_log)<>1 then raise exception 'Child isolation failed'; end if;
  if (select count(*) from public.restaurant_memberships)<>2 then raise exception 'Staff membership visibility failed'; end if;
  foreach table_name in array array['restaurants','restaurant_memberships','menu_items','dining_tables','shifts','orders','order_items','payments','kitchen_print_jobs','activity_log'] loop
    if has_table_privilege(current_user,'public.'||table_name,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception 'Authenticated has write privilege on %',table_name; end if;
  end loop;
  begin
    update public.restaurant_memberships set role='owner' where user_id=auth.uid();
    raise exception 'Membership can self-escalate';
  exception when insufficient_privilege then null; end;
  begin
    update public.orders set paid=true,paid_at=now(),status='queued';
    raise exception 'Authenticated direct payment write succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.restaurants)<>0 or (select count(*) from public.orders)<>0 or (select count(*) from public.restaurant_memberships)<>0 then raise exception 'Inactive membership grants private access'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.restaurants)<>0 then raise exception 'Missing identity grants private access'; end if;
end $$;
reset role;

-- A later function must not silently become callable by anonymous clients.
create function public.pos_foundation_acl_probe() returns boolean language sql as $$ select true $$;
do $$ declare table_name text; begin
  foreach table_name in array array['restaurants','restaurant_memberships','menu_items','dining_tables','shifts','orders','order_items','payments','kitchen_print_jobs','activity_log'] loop
    if not (select relrowsecurity from pg_class where oid=('public.'||table_name)::regclass) then raise exception 'RLS missing on %',table_name; end if;
  end loop;
  if has_function_privilege('anon','private.can_access_restaurant(uuid)','EXECUTE') then raise exception 'Anon has helper execute'; end if;
  if has_function_privilege('anon','public.pos_foundation_acl_probe()','EXECUTE') then raise exception 'New functions inherit PUBLIC execution'; end if;
  if has_function_privilege('authenticated','public.pos_foundation_acl_probe()','EXECUTE') then raise exception 'New functions inherit authenticated execution'; end if;
end $$;
rollback;
select 'foundation SQL checks passed' as result;
