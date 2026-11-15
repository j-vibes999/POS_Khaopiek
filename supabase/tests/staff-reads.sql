-- Fixtures for the disposable database only.
begin;
insert into auth.users (id,email,email_confirmed_at) values
 ('98000000-0000-4000-8000-000000000001','staff-read-owner@example.test',now()),
 ('98000000-0000-4000-8000-000000000002','staff-read-cashier@example.test',now()),
 ('98000000-0000-4000-8000-000000000042','staff-read-manager@example.test',now());
insert into public.restaurants (id,name) values
 ('98000000-0000-4000-8000-000000000003','Staff read shop'),
 ('98000000-0000-4000-8000-000000000004','Other staff read shop');
insert into public.restaurant_memberships (id,restaurant_id,user_id,display_name,role) values
 ('98000000-0000-4000-8000-000000000005','98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000001','Owner','owner'),
 ('98000000-0000-4000-8000-000000000006','98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000002','Cashier','cashier'),
 ('98000000-0000-4000-8000-000000000043','98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000042','Manager','manager');
insert into private.pos_devices (id,credential_hash,restaurant_id,membership_id)
values ('98000000-0000-4000-8000-000000000040',encode(sha256(convert_to(repeat('8',64),'UTF8')),'hex'),
 '98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000005');
insert into public.dining_tables (id,restaurant_id,table_number)
values ('98000000-0000-4000-8000-000000000007','98000000-0000-4000-8000-000000000003',9);
insert into public.menu_items (id,restaurant_id,code,name_lo,category,image_path,price)
values ('98000000-0000-4000-8000-000000000008','98000000-0000-4000-8000-000000000003','read-test','Live menu name','drinks','/images/menu-placeholder.svg',100);
insert into public.shifts (id,restaurant_id,opened_by,opened_at,opening_cash)
values ('98000000-0000-4000-8000-000000000009','98000000-0000-4000-8000-000000000003',
 '98000000-0000-4000-8000-000000000005',date_trunc('day',now(),'Asia/Vientiane'),500);
insert into public.shifts (id,restaurant_id,opened_by,opened_at,opening_cash,
 closed_by,closed_at,counted_cash,cash_sales,transfer_sales,order_count,expected_cash,difference)
select format('98000000-0000-4000-8000-%s',lpad((10+n)::text,12,'0'))::uuid,
 '98000000-0000-4000-8000-000000000003'::uuid,
 format('98000000-0000-4000-8000-%s',lpad((5+n%2)::text,12,'0'))::uuid,
 now()-(n+10)*interval '1 day',500,
 '98000000-0000-4000-8000-000000000005'::uuid,now()-(n+9)*interval '1 day',
 500,0,0,0,500,0
from generate_series(0,2) n;

-- The table was renumbered to 9. Archived and active orders retain table 3.
with start as (select date_trunc('day',now(),'Asia/Vientiane') t)
insert into public.orders (id,restaurant_id,order_number,table_id,table_number_at_order,requested_method,status,paid,paid_at,created_at)
select format('98000000-0000-4000-8000-%s',lpad(n::text,12,'0'))::uuid,
 '98000000-0000-4000-8000-000000000003'::uuid,n,'98000000-0000-4000-8000-000000000007'::uuid,3,
 method,status,paid,case when paid then t+delta end,t+delta-interval '1 second'
from start cross join (values
 (21,'cash','completed',true,interval '-7 days'),
 (22,'transfer','completed',true,interval '-6 days'),
 (23,'cash','completed',true,interval '-1 second'),
 (24,'cash','completed',true,interval '0'),
 (25,'cash','rejected',false,interval '1 second'),
 (26,'cash','pending',false,interval '2 seconds'),
 (27,'transfer','served',true,interval '3 seconds')
) as fixtures(n,method,status,paid,delta);
insert into public.order_items (restaurant_id,order_id,menu_item_id,line_number,name_lo,category,unit_price,quantity)
select restaurant_id,id,case when order_number=21 then null else '98000000-0000-4000-8000-000000000008'::uuid end,1,
 case when order_number=27 then 'Historical receipt name' else 'Earlier receipt name' end,'drinks',order_number*10,2
from public.orders where restaurant_id='98000000-0000-4000-8000-000000000003';
insert into public.payments (restaurant_id,order_id,shift_id,confirmed_by,amount,method,cash_received,idempotency_key)
select restaurant_id,id,
 case when order_number=24 then '98000000-0000-4000-8000-000000000009'::uuid else '98000000-0000-4000-8000-000000000010'::uuid end,
 '98000000-0000-4000-8000-000000000005'::uuid,order_number*20,'cash',order_number*20,gen_random_uuid()
from public.orders where restaurant_id='98000000-0000-4000-8000-000000000003' and order_number in (23,24);
insert into public.activity_log (id,restaurant_id,order_id,event_type,details)
values ('98000000-0000-4000-8000-000000000030','98000000-0000-4000-8000-000000000003',
 '98000000-0000-4000-8000-000000000024','order.close','{}'),
 ('98000000-0000-4000-8000-000000000031','98000000-0000-4000-8000-000000000003',
 '98000000-0000-4000-8000-000000000023','order.pay','{"orderNumber":999}');

select set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
declare r jsonb; rid uuid:='98000000-0000-4000-8000-000000000003';
begin
 if public.pos_setup_status()->>'staffReadsReady' is distinct from 'true' then raise exception 'Staff read readiness missing'; end if;
 if public.pos_setup_status()->>'staffPermissionsReady' is distinct from 'true' then raise exception 'Staff permissions readiness missing'; end if;
 if (select count(*) from public.shifts) is distinct from 4
  or (select count(*) from public.payments) is distinct from 2
  or (select count(*) from public.activity_log) is distinct from 2
 then raise exception 'Owner Data API history no longer complete'; end if;
 r:=public.pos_staff_read(rid,'operational','{}');
 if r->>'readOptimized' is distinct from 'true'
  or jsonb_path_query_array(r,'$.orders[*].order_number') is distinct from '[27,26]'::jsonb
  or jsonb_array_length(r->'shifts') is distinct from 1
  or jsonb_path_query_array(r,'$.payments[*].amount') is distinct from '[480]'::jsonb
  or r->'activity_log' is distinct from '[]'::jsonb
  or r->'kitchen_print_jobs' is distinct from '[]'::jsonb
  or r->>'historyRevision' is distinct from '98000000-0000-4000-8000-000000000031'
 then raise exception 'Operational snapshot omitted active data or included history'; end if;
 if jsonb_array_length(public.pos_staff_snapshot(rid)->'orders') is distinct from 7 then raise exception 'Legacy snapshot changed'; end if;
 r:=public.pos_staff_read(rid,'orders','{"limit":2,"offset":1,"query":"3"}');
 if jsonb_path_query_array(r,'$.rows[*].order_number') is distinct from '[24,23]'::jsonb
  or r->>'hasMore' is distinct from 'true' or r->>'total' is distinct from '5'
 then raise exception 'Archive pagination lost historical table matching or stable order'; end if;
 r:=public.pos_staff_read(rid,'orders','{"query":"24"}');
 if r->>'total' is distinct from '1' then raise exception 'Archive search did not match receipt number'; end if;
 r:=public.pos_staff_read(rid,'orders','{"query":"%"}');
 if r->>'total' is distinct from '0' then raise exception 'Archive search interpreted wildcard'; end if;
 r:=public.pos_staff_read(rid,'activity','{"limit":1}');
 if r->>'hasMore' is distinct from 'true' or r->'rows'->0->'details'->>'orderNumber' is distinct from '999'
 then raise exception 'Activity rewrote saved order number'; end if;
 r:=public.pos_staff_read(rid,'activity','{"limit":1,"offset":1}');
 if r->>'hasMore' is distinct from 'false' or r->'rows'->0->'details'->>'orderNumber' is distinct from '24'
 then raise exception 'Activity did not resolve historical order number'; end if;
 r:=public.pos_staff_read(rid,'shifts','{"limit":1}');
 if r->>'total' is distinct from '3' or r->>'hasMore' is distinct from 'true'
 then raise exception 'Owner shift history omitted a closed shift'; end if;
 r:=public.pos_staff_read(rid,'reports','{"range":"today"}');
 if r->>'total' is distinct from '1020' or r->>'cash' is distinct from '480'
  or r->>'transfer' is distinct from '540' or r->>'cashCount' is distinct from '1'
  or r->>'transferCount' is distinct from '1' or r->>'orderCount' is distinct from '2'
  or r->'items'->0->>'quantity' is distinct from '4'
  or r->'items'->0->>'name_lo' is distinct from 'Historical receipt name'
 then raise exception 'Today report differs from paid receipts at Laos midnight'; end if;
 r:=public.pos_staff_read(rid,'reports','{"range":"week"}');
 if r->>'total' is distinct from '1920' or r->>'orderCount' is distinct from '4'
 then raise exception 'Week report missed an inclusive Laos midnight boundary'; end if;
 r:=public.pos_staff_read(rid,'reports','{"range":"all"}');
 if r->>'total' is distinct from '2340' or r->>'orderCount' is distinct from '5'
  or jsonb_array_length(r->'items') is distinct from 2
 then raise exception 'All-time report lost legacy item or accumulated sales'; end if;
 begin
  perform public.pos_staff_read('98000000-0000-4000-8000-000000000004','operational','{}');
  raise exception 'Cross-tenant read succeeded';
 exception when sqlstate 'P0001' then if sqlerrm<>'access-denied' then raise; end if; end;
 begin
  perform public.pos_device_read(repeat('8',64),'operational','{}');
  raise exception 'Signed-in identity used a device credential';
 exception when sqlstate 'P0001' then if sqlerrm<>'device-denied' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000002',true);
do $$
declare r jsonb; view_name text;
begin
 if (select count(*) from public.shifts) is distinct from 2
  or (select count(*) from public.payments) is distinct from 1
  or exists(select 1 from public.activity_log)
 then raise exception 'Cashier Data API exposed protected shift, payment or activity history'; end if;
 r:=public.pos_staff_snapshot(null);
 if jsonb_array_length(r->'shifts') is distinct from 2
  or jsonb_path_query_array(r,'$.payments[*].amount') is distinct from '[480]'::jsonb
  or r->'activity_log' is distinct from '[]'::jsonb
  or jsonb_array_length(r->'orders') is distinct from 7
 then raise exception 'Cashier legacy snapshot leaked protected history or lost order recovery data'; end if;
 r:=public.pos_staff_read(null,'shifts','{"limit":1}');
 if r->>'total' is distinct from '1' or r->>'hasMore' is distinct from 'false'
  or r->'rows'->0->>'opened_by' is distinct from '98000000-0000-4000-8000-000000000006'
 then raise exception 'Cashier page filtered after pagination or exposed another user''s shifts'; end if;
 foreach view_name in array array['reports','activity'] loop
  begin
   perform public.pos_staff_read(null,view_name,'{}');
   raise exception 'Cashier accessed a restricted view';
  exception when sqlstate 'P0001' then if sqlerrm<>'access-denied' then raise; end if; end;
 end loop;
end $$;

select set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000042',true);
do $$ declare r jsonb; begin
 r:=public.pos_staff_snapshot(null);
 if (select count(*) from public.shifts) is distinct from 4
  or (select count(*) from public.payments) is distinct from 2
  or exists(select 1 from public.activity_log)
  or jsonb_array_length(r->'shifts') is distinct from 4
  or jsonb_array_length(r->'payments') is distinct from 2
  or r->'activity_log' is distinct from '[]'::jsonb
  or public.pos_staff_read(null,'reports','{"range":"all"}')->>'total' is distinct from '2340'
 then raise exception 'Manager roles differ between protected reads'; end if;
 begin
  perform public.pos_staff_read(null,'activity','{}');
  raise exception 'Manager accessed owner activity';
 exception when sqlstate 'P0001' then if sqlerrm<>'access-denied' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub','',true);
reset role;
do $$
begin
 if has_function_privilege('anon','public.pos_staff_read(uuid,text,jsonb)','EXECUTE')
  or has_function_privilege('anon','private.pos_staff_read_data(public.restaurant_memberships,text,jsonb)','EXECUTE')
  or has_function_privilege('authenticated','private.pos_staff_read_data(public.restaurant_memberships,text,jsonb)','EXECUTE')
  or has_function_privilege('anon','private.pos_set_device_cashier_access(uuid,boolean)','EXECUTE')
  or has_function_privilege('authenticated','private.pos_set_device_cashier_access(uuid,boolean)','EXECUTE')
  or has_function_privilege('anon','private.pos_staff_command_transaction(uuid,text,jsonb)','EXECUTE')
  or has_function_privilege('authenticated','private.pos_staff_command_transaction(uuid,text,jsonb)','EXECUTE')
 then raise exception 'Staff read privilege expanded'; end if;
end $$;
set local role anon;
do $$
declare r jsonb;
begin
 r:=public.pos_device_read(repeat('8',64),'orders','{"limit":1}');
 if r->>'total' is distinct from '5' or jsonb_array_length(r->'rows') is distinct from 1
  or coalesce(current_setting('pos.device_key',true),'')<>''
 then raise exception 'Device read failed or leaked its context'; end if;
 begin
  perform public.pos_device_read(repeat('9',64),'operational','{}');
  raise exception 'Invalid device key read staff data';
 exception when sqlstate 'P0001' then if sqlerrm<>'device-denied' then raise; end if; end;
end $$;
reset role;

-- Enable cashier access only after verifying an active account owner. The
-- failed conversion leaves the original device binding usable.
update auth.users set email_confirmed_at=null where id='98000000-0000-4000-8000-000000000001';
do $$ begin
 begin
  perform private.pos_set_device_cashier_access('98000000-0000-4000-8000-000000000040',true);
  raise exception 'Cashier conversion succeeded before owner verification';
 exception when raise_exception then
  if sqlerrm<>'Verify an owner account for this shop before enabling cashier access' then raise; end if;
 end;
end $$;
update auth.users set email_confirmed_at=now() where id='98000000-0000-4000-8000-000000000001';
do $$ begin
 if private.pos_set_device_cashier_access('98000000-0000-4000-8000-000000000040',true) is distinct from 'cashier' then
  raise exception 'Cashier conversion failed';
 end if;
 perform set_config('test.cashier_device_member',(
  select cashier_membership_id::text from private.pos_devices where id='98000000-0000-4000-8000-000000000040'
 ),true);
end $$;
set local role anon;
do $$
declare r jsonb; received integer; oid uuid:='98000000-0000-4000-8000-000000000026';
begin
 r:=public.pos_device_read(repeat('8',64),'operational','{}');
 if r->'membership'->>'role' is distinct from 'cashier'
  or r->'membership'->>'id' is distinct from current_setting('test.cashier_device_member')
  or r->'membership'->>'user_id' is not null
  or jsonb_array_length(r->'orders') is distinct from 2
  or jsonb_path_query_array(r,'$.payments[*].amount') is distinct from '[480]'::jsonb
 then raise exception 'Cashier device lost daily operations or kept owner permissions'; end if;
 r:=public.pos_device_snapshot(repeat('8',64));
 if r->'activity_log' is distinct from '[]'::jsonb
  or jsonb_array_length(r->'shifts') is distinct from 1
  or jsonb_path_query_array(r,'$.payments[*].amount') is distinct from '[480]'::jsonb
  or r->'membership'->>'role' is distinct from 'cashier'
 then raise exception 'Cashier device legacy snapshot leaked protected history'; end if;
 begin perform public.pos_device_read(repeat('8',64),'reports','{}'); raise exception 'Cashier device accessed reports';
 exception when sqlstate 'P0001' then if sqlerrm<>'access-denied' then raise; end if; end;
 begin perform public.pos_device_read(repeat('8',64),'activity','{}'); raise exception 'Cashier device accessed activity';
 exception when sqlstate 'P0001' then if sqlerrm<>'access-denied' then raise; end if; end;
 begin perform public.pos_device_command(repeat('8',64),'settings.save','{}'); raise exception 'Cashier device wrote settings';
 exception when sqlstate 'P0001' then if sqlerrm<>'access-denied' then raise; end if; end;
 begin perform public.pos_device_command(repeat('8',64),'staff.save','{}'); raise exception 'Cashier device wrote roles';
 exception when sqlstate 'P0001' then if sqlerrm<>'access-denied' then raise; end if; end;
 begin perform public.pos_device_menu_upload_ticket(repeat('8',64)); raise exception 'Cashier device obtained a menu upload ticket';
 exception when sqlstate 'P0001' then if sqlerrm<>'access-denied' then raise; end if; end;
 r:=public.pos_device_command(repeat('8',64),'order.pay',jsonb_build_object('id',oid,'revision',1,'method','cash','received',520,'idempotencyKey',oid));
 if r->>'commandChanged' is distinct from 'true'
  or r->'activity_log' is distinct from '[]'::jsonb
  or r->>'historyRevision' is null
  or jsonb_path_query_first(r,'$.payments[*] ? (@.amount == 520).confirmed_by')#>>'{}' is distinct from current_setting('test.cashier_device_member')
  or jsonb_array_length(r->'payments') is distinct from 2
  or jsonb_array_length(r->'shifts') is distinct from 1
 then raise exception 'Cashier payment ACK leaked history or lost transaction details'; end if;
 r:=public.pos_device_command(repeat('8',64),'order.pay',jsonb_build_object('id',oid,'revision',1,'method','cash','received',520,'idempotencyKey',oid));
 if r->>'commandChanged' is distinct from 'false' or jsonb_array_length(r->'payments') is distinct from 2 then
  raise exception 'Cashier payment retry duplicated a payment';
 end if;
 perform public.pos_device_command(repeat('8',64),'order.kitchen-sent',jsonb_build_object('id',oid,'revision',2));
 perform public.pos_device_command(repeat('8',64),'order.serve',jsonb_build_object('id',oid,'revision',3));
 r:=public.pos_device_command(repeat('8',64),'order.close',jsonb_build_object('id',oid,'revision',4));
 if jsonb_path_query_first(r,'$.orders[*] ? (@.order_number == 26).status') is distinct from '"completed"'::jsonb
  or r->'activity_log' is distinct from '[]'::jsonb
 then raise exception 'Cashier close ACK lost the completed order or leaked activity'; end if;
 perform public.pos_device_command(repeat('8',64),'shift.close',
   '{"id":"98000000-0000-4000-8000-000000000009","expectedCash":1500,"countedCash":1500}');
 foreach received in array array[520,521] loop
  begin
   perform public.pos_device_command(repeat('8',64),'order.pay',jsonb_build_object('id',oid,'revision',1,'method','cash','received',received,'idempotencyKey',oid));
   raise exception 'Cashier guessed a closed-shift payment amount';
  exception when sqlstate 'P0001' then if sqlerrm<>'already-paid' then raise; end if; end;
 end loop;
end $$;
reset role;

select set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ declare received integer; oid uuid:='98000000-0000-4000-8000-000000000026'; begin
 foreach received in array array[520,521] loop
  begin
   perform public.pos_staff_command(null,'order.pay',jsonb_build_object('id',oid,'revision',1,'method','cash','received',received,'idempotencyKey',oid));
   raise exception 'Cashier account guessed a closed-shift payment amount';
  exception when sqlstate 'P0001' then if sqlerrm<>'already-paid' then raise; end if; end;
 end loop;
end $$;
select set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000001',true);
do $$ declare r jsonb; oid uuid:='98000000-0000-4000-8000-000000000026'; begin
 r:=public.pos_staff_command(null,'order.pay',jsonb_build_object('id',oid,'revision',1,'method','cash','received',520,'idempotencyKey',oid));
 if r->>'commandChanged' is distinct from 'false' then raise exception 'Owner payment replay lost its acknowledgement'; end if;
 begin
  perform public.pos_staff_command(null,'staff.save',jsonb_build_object('id',current_setting('test.cashier_device_member'),'name','Changed device','role','cashier','active',false));
  raise exception 'Employee editor altered a dedicated device identity';
 exception when sqlstate 'P0001' then if sqlerrm<>'access-denied' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','',true);
reset role;

do $$ begin
 if private.pos_set_device_cashier_access('98000000-0000-4000-8000-000000000040',false) is distinct from 'owner' then
  raise exception 'Device owner access could not be restored';
 end if;
end $$;
set local role anon;
do $$ declare r jsonb; begin
 r:=public.pos_device_snapshot(repeat('8',64));
 if r->'membership'->>'role' is distinct from 'owner'
  or r->'membership'->>'id' is distinct from '98000000-0000-4000-8000-000000000005'
  or jsonb_array_length(r->'activity_log') is distinct from 7
 then raise exception 'Original device owner or its audit data did not survive rollback'; end if;
end $$;
reset role;
do $$ begin
 perform private.pos_set_device_cashier_access('98000000-0000-4000-8000-000000000040',true);
 if (select cashier_membership_id::text from private.pos_devices where id='98000000-0000-4000-8000-000000000040')
  is distinct from current_setting('test.cashier_device_member')
 then raise exception 'A second conversion lost the existing cashier history identity'; end if;
end $$;
update private.pos_devices set enabled=false where membership_id='98000000-0000-4000-8000-000000000005';
set local role anon;
do $$
begin
 begin
  perform public.pos_device_read(repeat('8',64),'operational','{}');
  raise exception 'Revoked device key read staff data';
 exception when sqlstate 'P0001' then if sqlerrm<>'device-denied' then raise; end if; end;
end $$;
reset role;
select 'PASS: staff reads, role-scoped history, cashier device conversion/rollback, payment and kitchen ACKs.';
rollback;
