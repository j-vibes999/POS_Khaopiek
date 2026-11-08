-- Isolated database regressions only. Never installs fixtures in a real shop.
begin;
insert into auth.users(id,email,email_confirmed_at)
 values('96000000-0000-4000-8000-000000000001','integrity@example.test',now());
insert into public.restaurants(id,name)
 values('96000000-0000-4000-8000-000000000002','Integrity test shop');
insert into public.restaurant_memberships(id,restaurant_id,user_id,display_name,role)
 values('96000000-0000-4000-8000-000000000003','96000000-0000-4000-8000-000000000002','96000000-0000-4000-8000-000000000001','Integrity owner','owner');
insert into public.dining_tables(id,restaurant_id,table_number,public_key)
 values('96000000-0000-4000-8000-000000000004','96000000-0000-4000-8000-000000000002',1,'96000000-0000-4000-8000-000000000005');
insert into public.menu_items(id,restaurant_id,code,name_lo,price,category,image_path,available)
 values('96000000-0000-4000-8000-000000000006','96000000-0000-4000-8000-000000000002','existing','Existing dish',35000,'khao','/images/menu-placeholder.svg',false);

select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare
 rid uuid:='96000000-0000-4000-8000-000000000002';
 dish_id uuid:='96000000-0000-4000-8000-000000000006';
 payload jsonb; order_payload jsonb; payment_payload jsonb; result jsonb; cart jsonb; oid uuid; created_id uuid; facts jsonb; failures text[]:='{}';
begin
 payload:='{"creationId":"96000000-0000-4000-8000-000000000007","lo":"Retry dish","price":45000,"category":"khao"}';
 perform public.pos_staff_command(rid,'menu.save',payload);
 select id into created_id from public.menu_items where restaurant_id=rid and name_lo='Retry dish';
 perform public.pos_staff_command(rid,'menu.save',payload);
 if (select count(*) from public.menu_items where restaurant_id=rid and name_lo='Retry dish')<>1 then
  failures:=array_append(failures,'menu creation retry duplicated the dish');
 end if;
 if not exists(select 1 from public.menu_items where id=created_id and code='menu-96000000-0000-4000-8000-000000000007') then
  failures:=array_append(failures,'stable creation ID was not retained');
 end if;
 payload:=jsonb_set(payload,'{lo}','"Retry updated dish"');
 perform public.pos_staff_command(rid,'menu.save',payload);
 if not exists(select 1 from public.menu_items where id=created_id and name_lo='Retry updated dish')
  or (select count(*) from public.menu_items where restaurant_id=rid)<>2 then
  failures:=array_append(failures,'retry edits did not update the original creation');
 end if;

 perform public.pos_staff_command(rid,'menu.save',jsonb_build_object('id',dish_id,'lo','Edited dish','price',35000,'category','khao','available',true));
 if (select available from public.menu_items where id=dish_id) then
  failures:=array_append(failures,'editing menu details restored sold-out availability');
 end if;
 perform public.pos_staff_command(rid,'menu.remove',jsonb_build_object('id',created_id));
 begin
  perform public.pos_staff_command(rid,'menu.save',payload||jsonb_build_object('id',created_id));
  failures:=array_append(failures,'stale menu edit resurrected a removed dish');
 exception when sqlstate 'P0001' then if sqlerrm<>'changed' then raise; end if; end;
 -- A create retry arriving after deletion must also leave the dish archived.
 begin
  perform public.pos_staff_command(rid,'menu.save',payload);
  failures:=array_append(failures,'late creation retry resurrected a removed dish');
 exception when sqlstate 'P0001' then if sqlerrm<>'changed' then raise; end if; end;

 perform public.pos_staff_command(rid,'menu.availability',jsonb_build_object('id',dish_id,'available',true));
 select details into facts from public.activity_log where restaurant_id=rid and event_type='menu.availability';
 if facts->>'itemId' is distinct from dish_id::text or facts->'available' is distinct from 'true'::jsonb then
  failures:=array_append(failures,'availability activity omitted its dish or actual availability');
 end if;
 perform public.pos_staff_command(rid,'shift.open','{"openingCash":100000}');
 select details into facts from public.activity_log where restaurant_id=rid and event_type='shift.open';
 if facts->>'amount' is distinct from '100000' then failures:=array_append(failures,'shift activity omitted opening cash'); end if;
 cart:=jsonb_build_array((public.pos_get_menu('96000000-0000-4000-8000-000000000005')->'menu'->0)||'{"quantity":1}'::jsonb);
 order_payload:=jsonb_build_object('table',1,'cart',cart,'method','transfer',
  'requestId','96000000-0000-4000-8000-000000000008','reviewedKey',jsonb_build_array(1,cart,'transfer')::text);
 result:=public.pos_staff_command(rid,'order.create',order_payload);
 oid:=(result->>'commandOrderId')::uuid;
 perform public.pos_staff_command(rid,'order.create',order_payload);
 if (select count(*) from public.activity_log where order_id=oid and event_type='order.create')<>1 then
  failures:=array_append(failures,'order creation activity was duplicated');
 end if;
 select details into facts from public.activity_log where order_id=oid and event_type='order.create';
 if facts->>'table' is distinct from '1' then failures:=array_append(failures,'order creation activity omitted the table'); end if;
 payment_payload:=jsonb_build_object('id',oid,'revision',1,'method','transfer','idempotencyKey','96000000-0000-4000-8000-000000000009');
 perform public.pos_staff_command(rid,'order.pay',payment_payload);
 perform public.pos_staff_command(rid,'order.pay',payment_payload);
 if (select count(*) from public.activity_log where order_id=oid and event_type='order.pay')<>1 then
  failures:=array_append(failures,'payment replay duplicated financial activity');
 end if;
 select details into facts from public.activity_log where order_id=oid and event_type='order.pay';
 if facts->>'amount' is distinct from '35000' or facts->>'method' is distinct from 'transfer' or facts->>'table' is distinct from '1' then
  failures:=array_append(failures,'payment activity omitted the real amount, method, or table');
 end if;
 perform public.pos_staff_command(rid,'order.kitchen-sent',jsonb_build_object('id',oid,'revision',2));
 perform public.pos_staff_command(rid,'order.serve',jsonb_build_object('id',oid,'revision',3));
 perform public.pos_staff_command(rid,'order.close',jsonb_build_object('id',oid,'revision',4));
 if exists(select 1 from public.activity_log where order_id=oid and event_type in('order.kitchen-sent','order.serve','order.close') and details->>'table' is distinct from '1') then
  failures:=array_append(failures,'order transition activity omitted the original table');
 end if;
 result:=public.pos_staff_command(rid,'table.update','{"id":"96000000-0000-4000-8000-000000000004","number":2,"seats":4}');
 if result->'orders'->0->>'table_number' is distinct from '1' then
  failures:=array_append(failures,'renumbering a table rewrote a completed order receipt');
 end if;
 if exists(select 1 from public.activity_log where order_id=oid and details->>'table' is distinct from '1') then
  failures:=array_append(failures,'renumbering a table rewrote immutable activity facts');
 end if;
 perform public.pos_staff_command(rid,'shift.close',jsonb_build_object('id',result->'shifts'->0->>'id','expectedCash',100000,'countedCash',90000));
 select details into facts from public.activity_log where restaurant_id=rid and event_type='shift.close';
 if facts->>'difference' is distinct from '-10000' then failures:=array_append(failures,'shift close activity omitted the real cash difference'); end if;
 result:=public.pos_staff_command(rid,'order.create',jsonb_build_object('table',2,'cart',cart,'method','cash',
  'requestId','96000000-0000-4000-8000-000000000010','reviewedKey',jsonb_build_array(2,cart,'cash')::text));
 oid:=(result->>'commandOrderId')::uuid;
 perform public.pos_staff_command(rid,'order.reject',jsonb_build_object('id',oid,'revision',1));
 select details into facts from public.activity_log where order_id=oid and event_type='order.reject';
 if facts->>'table' is distinct from '2' or facts->>'orderNumber' is distinct from '2' then
  failures:=array_append(failures,'rejection activity omitted the original order and table');
 end if;
 if public.pos_setup_status()->'integrityReady' is distinct from 'true'::jsonb then
  failures:=array_append(failures,'integrity readiness is missing');
 end if;
 if cardinality(failures)>0 then raise exception 'Integrity regressions: %',array_to_string(failures,'; '); end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.pos_staff_command(uuid,text,jsonb)','EXECUTE')
  or has_function_privilege('anon','private.pos_insert_order(uuid,uuid,text,uuid,jsonb,text,uuid)','EXECUTE')
  or has_function_privilege('anon','private.pos_order_json(uuid)','EXECUTE') then
  raise exception 'Integrity migration expanded anonymous staff access';
 end if;
end $$;
select 'PASS: menu retries and archives, event facts, and historical table receipts preserve integrity.';
rollback;
