-- Disposable PostgreSQL/Supabase test database only; all fixtures roll back.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if public.pos_setup_status()->>'schemaVersion' is distinct from '2'
    or public.pos_setup_status()->>'guestOrdersReady' is distinct from 'true'
    or public.pos_setup_status()->>'paymentsReady' is distinct from 'true' then raise exception 'Transactional cloud workflow RPCs are missing'; end if;
end $$;
insert into auth.users(id,email,email_confirmed_at) values
 ('01000000-0000-4000-8000-000000000001','owner@example.test',now()),
 ('01000000-0000-4000-8000-000000000002','cashier@example.test',now()),
 ('01000000-0000-4000-8000-000000000003','other@example.test',now()),
 ('01000000-0000-4000-8000-000000000004','darkside404404@gmail.com',null),
 ('01000000-0000-4000-8000-000000000005','new@example.test',now());
insert into public.restaurants(id,name) values('11000000-0000-4000-8000-000000000001','Real One'),('11000000-0000-4000-8000-000000000002','Real Two');
insert into public.restaurant_memberships(id,restaurant_id,user_id,display_name,role) values
 ('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','01000000-0000-4000-8000-000000000001','Owner','owner'),
 ('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','01000000-0000-4000-8000-000000000002','Cashier','cashier'),
 ('21000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000002','01000000-0000-4000-8000-000000000003','Other','owner');
insert into public.dining_tables(id,restaurant_id,table_number,public_key) values
 ('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',1,'32000000-0000-4000-8000-000000000001'),
 ('31000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000002',1,'32000000-0000-4000-8000-000000000002');
insert into public.menu_items(id,restaurant_id,code,name_lo,name_th,price,category,image_path) values
 ('41000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','soup','Soup','Soup Thai',35000,'khao','/images/khao-piak.jpg'),
 ('41000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000002','drink','Other drink','',15000,'drinks','/images/drink.jpg');

set local role anon;
do $$ declare result jsonb; cart jsonb; response jsonb; id uuid; n integer; fn text; begin
  cart:=jsonb_build_array((public.pos_get_menu('32000000-0000-4000-8000-000000000001')->'menu'->0)||'{"quantity":2,"size":"large","price":45000,"noHerbs":true,"customizationNote":"less salt"}'::jsonb);
  perform set_config('test.cart',cart::text,true);
  response:=public.pos_guest_submit('32000000-0000-4000-8000-000000000001',repeat('a',48),repeat('b',48),cart,'cash',jsonb_build_array(1,cart,'cash')::text);
  id:=(response->>'orderId')::uuid; perform set_config('test.order',id::text,true);
  if response->>'orderNumber'<>'1' then raise exception 'Unexpected order number'; end if;
  if public.pos_guest_submit('32000000-0000-4000-8000-000000000001',repeat('a',48),repeat('b',48),cart,'cash',jsonb_build_array(1,cart,'cash')::text)<>response then raise exception 'Guest retry is not idempotent'; end if;
  result:=public.pos_guest_orders('32000000-0000-4000-8000-000000000001',repeat('a',48),repeat('b',48));
  if jsonb_array_length(result->'orders')<>1 or result->'matchedOrder'->>'id'<>id::text or result->'orders'->0->>'table_number'<>'1'
    or result->'orders'->0->'order_items'->0->>'unit_price'<>'45000' then raise exception 'Guest snapshot missing server quote: %',result; end if;
  if result::text like '%token_hash%' or result::text like '%idempotency_key%' or result ? 'payments' then raise exception 'Guest response leaked private values'; end if;
  if jsonb_array_length(public.pos_guest_orders('32000000-0000-4000-8000-000000000001',repeat('c',48))->'orders')<>0 then raise exception 'Another guest read an order'; end if;
  if public.pos_guest_orders('32000000-0000-4000-8000-000000000002',repeat('a',48),repeat('b',48))->'matchedOrder'<>'null'::jsonb then raise exception 'Another table read an order'; end if;
  begin perform public.pos_guest_cancel('32000000-0000-4000-8000-000000000001',repeat('c',48),id); raise exception 'Other guest canceled order'; exception when sqlstate 'P0001' then if sqlerrm<>'access-denied' then raise; end if; end;
  begin perform public.pos_guest_submit('32000000-0000-4000-8000-000000000001',repeat('a',48),repeat('b',48),cart,'transfer',jsonb_build_array(1,cart,'transfer')::text); raise exception 'Changed immutable request accepted'; exception when sqlstate 'P0001' then if sqlerrm<>'request-conflict' then raise; end if; end;
  begin perform public.pos_guest_submit('32000000-0000-4000-8000-000000000001',repeat('a',48),repeat('d',48),jsonb_set(cart,'{0,price}','1'),'cash',jsonb_build_array(1,jsonb_set(cart,'{0,price}','1'),'cash')::text); raise exception 'Forged quote accepted'; exception when sqlstate 'P0001' then if sqlerrm<>'menu-changed' then raise; end if; end;
  begin perform public.pos_guest_submit('32000000-0000-4000-8000-000000000001',repeat('a',48),repeat('d',48),jsonb_set(cart,'{0,lo}','"Forged"'),'cash',jsonb_build_array(1,jsonb_set(cart,'{0,lo}','"Forged"'),'cash')::text); raise exception 'Forged name accepted'; exception when sqlstate 'P0001' then if sqlerrm<>'menu-changed' then raise; end if; end;
  begin perform public.pos_guest_submit('32000000-0000-4000-8000-000000000001',repeat('a',48),repeat('d',48),cart,'cash','[]'); raise exception 'Changed review accepted'; exception when sqlstate 'P0001' then if sqlerrm<>'cart-changed' then raise; end if; end;
  begin perform public.pos_staff_snapshot(null); raise exception 'Anonymous staff snapshot'; exception when insufficient_privilege then null; end;
  begin perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','order.pay','{}'); raise exception 'Anonymous payment'; exception when insufficient_privilege then null; end;
  begin perform private.pos_order_json(id); raise exception 'Anonymous private helper'; exception when insufficient_privilege then null; end;
  begin perform 1 from private.order_submissions; raise exception 'Anonymous private submissions'; exception when insufficient_privilege then null; end;
  perform public.pos_guest_call('32000000-0000-4000-8000-000000000001',repeat('a',48),true);
  begin perform public.pos_guest_call('32000000-0000-4000-8000-000000000001',repeat('c',48),false); raise exception 'Other guest canceled call'; exception when sqlstate 'P0001' then if sqlerrm<>'access-denied' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','01000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ declare result jsonb; id uuid:=current_setting('test.order')::uuid; begin
  result:=public.pos_staff_snapshot(null);
  if result->>'restaurantId'<>'11000000-0000-4000-8000-000000000001' or jsonb_array_length(result->'orders')<>1 or result::text like '%Other drink%' then raise exception 'Staff tenant snapshot failed'; end if;
  begin perform public.pos_staff_snapshot('11000000-0000-4000-8000-000000000002'); raise exception 'Staff cross-tenant read'; exception when sqlstate 'P0001' then if sqlerrm<>'access-denied' then raise; end if; end;
  begin perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','menu.remove','{"id":"41000000-0000-4000-8000-000000000001"}'); raise exception 'Cashier removed menu'; exception when sqlstate 'P0001' then if sqlerrm<>'access-denied' then raise; end if; end;
  begin perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','order.pay',jsonb_build_object('id',id,'revision',1,'method','cash','received',90000,'idempotencyKey','71000000-0000-4000-8000-000000000001')); raise exception 'Payment without shift'; exception when sqlstate 'P0001' then if sqlerrm<>'shift-required' then raise; end if; end;
  perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','shift.open','{"openingCash":100000}');
  begin perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','shift.open','{"openingCash":100000}'); raise exception 'Second open shift'; exception when sqlstate 'P0001' then if sqlerrm<>'shift-open' then raise; end if; end;
  begin perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','order.pay',jsonb_build_object('id',id,'revision',2,'method','cash','received',90000,'idempotencyKey','71000000-0000-4000-8000-000000000001')); raise exception 'Stale payment review'; exception when sqlstate 'P0001' then if sqlerrm<>'changed' then raise; end if; end;
  begin perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','order.pay',jsonb_build_object('id',id,'revision',1,'method','cash','received',1,'idempotencyKey','71000000-0000-4000-8000-000000000001')); raise exception 'Insufficient cash'; exception when sqlstate 'P0001' then if sqlerrm<>'amount' then raise; end if; end;
  result:=public.pos_staff_command('11000000-0000-4000-8000-000000000001','order.pay',jsonb_build_object('id',id,'revision',1,'method','cash','received',100000,'idempotencyKey','71000000-0000-4000-8000-000000000001'));
  if jsonb_array_length(result->'payments')<>1 or result->'payments'->0->>'amount'<>'90000' or jsonb_array_length(result->'kitchen_print_jobs')<>1 or result->'orders'->0->>'status'<>'queued' then raise exception 'Payment/kitchen atomic transaction failed'; end if;
  perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','order.pay',jsonb_build_object('id',id,'revision',1,'method','cash','received',100000,'idempotencyKey','71000000-0000-4000-8000-000000000001'));
  begin perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','order.pay',jsonb_build_object('id',id,'revision',1,'method','cash','received',100001,'idempotencyKey','71000000-0000-4000-8000-000000000001')); raise exception 'Changed idempotent cash retry'; exception when sqlstate 'P0001' then if sqlerrm<>'request-conflict' then raise; end if; end;
  begin perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','order.reject',jsonb_build_object('id',id,'revision',2)); raise exception 'Paid order rejected'; exception when sqlstate 'P0001' then if sqlerrm<>'transition' then raise; end if; end;
  begin perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','order.serve',jsonb_build_object('id',id,'revision',2)); raise exception 'Unsent order served'; exception when sqlstate 'P0001' then if sqlerrm<>'transition' then raise; end if; end;
  result:=public.pos_staff_command('11000000-0000-4000-8000-000000000001','order.kitchen-sent',jsonb_build_object('id',id,'revision',2));
  if result->'orders'->0->>'status'<>'cooking' or result->'orders'->0->>'kitchen_pending'<>'false' then raise exception 'Kitchen acknowledgement failed'; end if;
  perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','order.kitchen-sent',jsonb_build_object('id',id,'revision',2));
  perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','order.serve',jsonb_build_object('id',id,'revision',3));
  perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','order.close',jsonb_build_object('id',id,'revision',4));
  result:=public.pos_staff_snapshot(null);
  begin perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','shift.close',jsonb_build_object('id',result->'shifts'->0->>'id','countedCash',190000,'expectedCash',100000)); raise exception 'Stale shift review accepted'; exception when sqlstate 'P0001' then if sqlerrm<>'changed' then raise; end if; end;
  perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','shift.close',jsonb_build_object('id',result->'shifts'->0->>'id','countedCash',190000,'expectedCash',190000));
  result:=public.pos_staff_snapshot(null);
  if result->'shifts'->0->>'cash_sales'<>'90000' or result->'shifts'->0->>'expected_cash'<>'190000' or result->'shifts'->0->>'difference'<>'0' or result->'shifts'->0->>'order_count'<>'1' then raise exception 'Shift totals failed'; end if;
end $$;
reset role;
set local role anon;
do $$ declare cart jsonb:=current_setting('test.cart')::jsonb; n integer; begin
  if jsonb_array_length(public.pos_guest_orders('32000000-0000-4000-8000-000000000001',repeat('a',48))->'orders')<>1 or public.pos_guest_orders('32000000-0000-4000-8000-000000000001',repeat('a',48))->'orders'->0->>'status'<>'completed' then raise exception 'Completed receipt disappeared before the next visit'; end if;
  -- Exact retry survives a completed visit and never creates a duplicate.
  if public.pos_guest_submit('32000000-0000-4000-8000-000000000001',repeat('a',48),repeat('b',48),cart,'cash',jsonb_build_array(1,cart,'cash')::text)->>'orderId'<>current_setting('test.order') then raise exception 'Closed visit retry duplicated order'; end if;
  for n in 1..4 loop perform public.pos_guest_submit('32000000-0000-4000-8000-000000000001',repeat('a',48),lpad(n::text,48,'0'),cart,'cash',jsonb_build_array(1,cart,'cash')::text); end loop;
  if jsonb_array_length(public.pos_guest_orders('32000000-0000-4000-8000-000000000001',repeat('a',48))->'orders')<>4 then raise exception 'New visit retained previous receipts'; end if;
  begin perform public.pos_guest_submit('32000000-0000-4000-8000-000000000001',repeat('a',48),repeat('e',48),cart,'cash',jsonb_build_array(1,cart,'cash')::text); raise exception 'Guest rate limit missing'; exception when sqlstate 'P0001' then if sqlerrm<>'rate-limit' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','01000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare result jsonb; cart jsonb:=current_setting('test.cart')::jsonb; payload jsonb; begin
  payload:=jsonb_build_object('lo','Real new dish','price',12000,'category','other','image','javascript:alert(1)');
  begin perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','menu.save',payload); raise exception 'Unsafe menu image accepted'; exception when sqlstate 'P0001' then if sqlerrm<>'invalid' then raise; end if; end;
  payload:=jsonb_set(payload,'{image}','"/images/khao-piak.jpg"');
  perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','menu.save',payload);
  perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','table.add','{"number":2,"seats":6,"zone":"Patio"}');
  result:=public.pos_staff_snapshot(null);
  perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','table.remove',jsonb_build_object('id',result->'dining_tables'->1->>'id'));
  perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','table.add','{"number":2,"seats":4,"zone":"Again"}');
  perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','settings.save','{"name":"Changed real shop","branch":"Main","phone":"123","methods":["cash"]}');
  perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','staff.save','{"authUserId":"01000000-0000-4000-8000-000000000005","name":"New staff","role":"manager","active":true}');
  begin perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','staff.save','{"id":"21000000-0000-4000-8000-000000000001","name":"Changed owner","role":"cashier","active":false}'); raise exception 'Owner self-demotion accepted'; exception when sqlstate 'P0001' then if sqlerrm<>'access-denied' then raise; end if; end;
  perform public.pos_staff_command('11000000-0000-4000-8000-000000000001','menu.availability','{"id":"41000000-0000-4000-8000-000000000001","available":false}');
end $$;
reset role;
set local role anon;
do $$ declare cart jsonb:=current_setting('test.cart')::jsonb; begin
  begin perform public.pos_guest_submit('32000000-0000-4000-8000-000000000001',repeat('c',48),repeat('e',48),cart,'cash',jsonb_build_array(1,cart,'cash')::text); raise exception 'Sold out quote accepted'; exception when sqlstate 'P0001' then if sqlerrm<>'sold-out' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','01000000-0000-4000-8000-000000000004',true);
set local role authenticated;
do $$ begin
  begin perform public.pos_claim_owner('New real shop'); raise exception 'Unverified owner enrolled'; exception when sqlstate 'P0001' then if sqlerrm<>'owner-not-authorized' then raise; end if; end;
  begin perform public.pos_staff_snapshot(null); raise exception 'Unenrolled identity read shop'; exception when sqlstate 'P0001' then if sqlerrm<>'no-membership' then raise; end if; end;
end $$;
reset role;
update auth.users set email_confirmed_at=now() where id='01000000-0000-4000-8000-000000000004';
set local role authenticated;
do $$ declare result jsonb; rid text; begin
  result:=public.pos_claim_owner('My actual restaurant'); rid:=result->>'restaurantId';
  if result->'restaurants'->>'name'<>'My actual restaurant' or jsonb_array_length(result->'menu_items')<>0 or jsonb_array_length(result->'dining_tables')<>0 or jsonb_array_length(result->'orders')<>0 or jsonb_array_length(result->'members')<>1 then raise exception 'Owner enrollment installed examples'; end if;
  if public.pos_claim_owner('Another name')->>'restaurantId'<>rid then raise exception 'Owner enrolled twice'; end if;
end $$;
reset role;
-- ACL and fixed search paths are part of the contract, including future helpers.
do $$ declare fn record; begin
  for fn in select p.oid,p.proname,p.proconfig,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='private' and p.proname like 'pos_%') or (n.nspname='public' and p.proname in('pos_staff_snapshot','pos_staff_command','pos_claim_owner','pos_guest_orders','pos_guest_submit','pos_guest_cancel','pos_guest_call')) loop
    if not ('search_path=""'=any(fn.proconfig)) then raise exception 'Unfixed search path: %',fn.proname; end if;
    if fn.nspname='private' and (has_function_privilege('anon',fn.oid,'EXECUTE') or has_function_privilege('authenticated',fn.oid,'EXECUTE')) then raise exception 'Private helper executable: %',fn.proname; end if;
  end loop;
  if (select count(*) from public.payments where restaurant_id='11000000-0000-4000-8000-000000000001')<>1 or (select count(*) from public.kitchen_print_jobs where restaurant_id='11000000-0000-4000-8000-000000000001')<>1 then raise exception 'Retry duplicated financial records'; end if;
end $$;

reset role;
insert into auth.users(id,email,email_confirmed_at) values('01000000-0000-4000-8000-000000000006','staff@qa.example',now());
select set_config('request.jwt.claim.sub','01000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare result jsonb; begin
 result:=public.pos_staff_command('11000000-0000-4000-8000-000000000001','staff.save','{"authEmail":"staff@qa.example","name":"Staff by email","role":"cashier","active":true}');
 if not exists(select 1 from jsonb_array_elements(result->'members') m where m->>'display_name'='Staff by email' and m->>'email'='staff@qa.example') then raise exception 'Staff email enrollment failed'; end if;
end $$;
reset role;
rollback;
select 'workflow SQL checks passed' as result;
