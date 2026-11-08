-- Isolated PostgreSQL database only. Trusted-device fixtures never reach a shop.
\set ON_ERROR_STOP on
begin;
insert into private.pos_devices(id,credential_hash) values
 ('91000000-0000-4000-8000-000000000001',encode(sha256(convert_to(repeat('a',64),'UTF8')),'hex')),
 ('91000000-0000-4000-8000-000000000002',encode(sha256(convert_to(repeat('b',64),'UTF8')),'hex'));
set local role anon;
do $$ declare bad text; result jsonb; begin
 foreach bad in array array[null,'',repeat('c',64),repeat('a',63),repeat('A',64)] loop
  begin perform public.pos_device_snapshot(bad); raise exception 'Unknown device credential accepted'; exception when sqlstate 'P0001' then if sqlerrm<>'device-denied' then raise; end if; end;
 end loop;
 begin perform public.pos_device_snapshot(repeat('a',64)); raise exception 'Unenrolled device received a shop'; exception when sqlstate 'P0001' then if sqlerrm<>'no-membership' then raise; end if; end;
 begin perform public.pos_device_setup(repeat('a',64),''); raise exception 'Empty shop name accepted'; exception when sqlstate 'P0001' then if sqlerrm<>'shop-name' then raise; end if; end;
 result:=public.pos_device_setup(repeat('a',64),'Device shop');
 perform set_config('test.device.restaurant',result->>'restaurantId',true);
 perform set_config('test.device.member',result->'membership'->>'id',true);
 if result->'restaurants'->>'name'<>'Device shop' or result->'membership'->>'role'<>'owner'
  or result->'membership'->>'user_id' is not null or jsonb_array_length(result->'members')<>1
  or jsonb_array_length(result->'menu_items')<>0 or jsonb_array_length(result->'dining_tables')<>0
  or jsonb_array_length(result->'orders')<>0 or jsonb_array_length(result->'payments')<>0 then raise exception 'Device onboarding installed accounts or business fixtures'; end if;
 if result::text like '%credential_hash%' or result::text like '%'||repeat('a',64)||'%' or result::text like '%device_key%' then raise exception 'Device snapshot leaked its private credential'; end if;
 if public.pos_device_setup(repeat('a',64),'Another name')->>'restaurantId'<>result->>'restaurantId' then raise exception 'Repeated device setup created another shop'; end if;
 if coalesce(current_setting('pos.device_key',true),'')<>'' then raise exception 'Device credential leaked into caller SQL context'; end if;
 begin perform public.pos_staff_snapshot(null); raise exception 'Anon acquired direct staff read'; exception when insufficient_privilege then null; end;
 begin perform public.pos_staff_command(current_setting('test.device.restaurant')::uuid,'shift.open','{"openingCash":0}'); raise exception 'Anon acquired direct staff command'; exception when insufficient_privilege then null; end;
 begin perform 1 from private.pos_devices; raise exception 'Anon read credential hashes'; exception when insufficient_privilege then null; end;
 begin perform 1 from public.restaurant_memberships; raise exception 'Anon read private shop members'; exception when insufficient_privilege then null; end;
 result:=public.pos_device_setup(repeat('b',64),'Other device shop');
 perform set_config('test.device.other.restaurant',result->>'restaurantId',true);
end $$;
reset role;
do $$ begin
 if (select count(*) from public.restaurants where name in('Device shop','Other device shop'))<>2 then raise exception 'Device setup was not idempotent'; end if;
 if exists(select 1 from auth.users) then raise exception 'Device setup created a synthetic Auth account'; end if;
end $$;
set local role anon;
do $$ declare result jsonb; cart jsonb; oid uuid; mid uuid; tid uuid; begin
 perform public.pos_device_command(repeat('a',64),'table.add','{"number":1,"seats":4,"zone":""}');
 result:=public.pos_device_command(repeat('a',64),'menu.save','{"lo":"Real dish","th":"อาหารจริง","price":35000,"category":"khao","image":""}');
 mid:=(result->'menu_items'->0->>'id')::uuid;
 tid:=(result->'dining_tables'->0->>'public_key')::uuid;
 perform set_config('test.device.menu',mid::text,true);
 cart:=jsonb_build_array((public.pos_get_menu(tid)->'menu'->0)||'{"quantity":1,"size":"regular","price":35000,"noHerbs":false,"customizationNote":""}'::jsonb);
 result:=public.pos_device_command(repeat('a',64),'shift.open','{"openingCash":100000}');
 result:=public.pos_device_command(repeat('a',64),'order.create',jsonb_build_object('table',1,'cart',cart,'method','cash','requestId','92000000-0000-4000-8000-000000000001','reviewedKey',jsonb_build_array(1,cart,'cash')::text));
 oid:=(result->>'commandOrderId')::uuid;
 result:=public.pos_device_command(repeat('a',64),'order.pay',jsonb_build_object('id',oid,'revision',1,'method','cash','received',35000,'idempotencyKey',oid));
 if result->'payments'->0->>'amount'<>'35000' or result->'payments'->0->>'confirmed_by'<>current_setting('test.device.member') or jsonb_array_length(result->'kitchen_print_jobs')<>1 then raise exception 'Device payment lost audit identity or atomic print'; end if;
 result:=public.pos_device_command(repeat('a',64),'order.pay',jsonb_build_object('id',oid,'revision',1,'method','cash','received',35000,'idempotencyKey',oid));
 if result->>'commandChanged'<>'false' or jsonb_array_length(result->'payments')<>1 then raise exception 'Device payment retry duplicated a payment'; end if;
 result:=public.pos_device_command(repeat('a',64),'order.kitchen-sent',jsonb_build_object('id',oid,'revision',2));
 if result->'orders'->0->>'status'<>'cooking' then raise exception 'Device kitchen handoff failed'; end if;
 begin perform public.pos_device_command(repeat('b',64),'menu.remove',jsonb_build_object('id',mid)); raise exception 'Device crossed restaurant menu boundary'; exception when sqlstate 'P0001' then if sqlerrm<>'changed' then raise; end if; end;
 begin perform public.pos_device_command(repeat('b',64),'order.pay',jsonb_build_object('id',oid,'revision',1,'method','cash','received',35000,'idempotencyKey',oid)); raise exception 'Device crossed restaurant payment boundary'; exception when sqlstate 'P0001' then if sqlerrm<>'changed' then raise; end if; end;
 if coalesce(current_setting('pos.device_key',true),'')<>'' then raise exception 'Device credential context survived wrapper error'; end if;
end $$;
reset role;
-- Revoking the device, its membership or its shop must revoke every wrapper.
update private.pos_devices set enabled=false where id='91000000-0000-4000-8000-000000000001';
set local role anon;
do $$ begin
 begin perform public.pos_device_snapshot(repeat('a',64)); raise exception 'Revoked device read shop'; exception when sqlstate 'P0001' then if sqlerrm<>'device-denied' then raise; end if; end;
 begin perform public.pos_device_setup(repeat('a',64),'Renamed'); raise exception 'Revoked device reenrolled'; exception when sqlstate 'P0001' then if sqlerrm<>'device-denied' then raise; end if; end;
 begin perform public.pos_device_command(repeat('a',64),'table.add','{"number":2}'); raise exception 'Revoked device mutated shop'; exception when sqlstate 'P0001' then if sqlerrm<>'device-denied' then raise; end if; end;
end $$;
reset role;
update private.pos_devices set enabled=true where id='91000000-0000-4000-8000-000000000001';
update public.restaurant_memberships set active=false where id=current_setting('test.device.member')::uuid;
set local role anon;
do $$ begin
 begin perform public.pos_device_snapshot(repeat('a',64)); raise exception 'Inactive member read through device'; exception when sqlstate 'P0001' then if sqlerrm<>'device-denied' then raise; end if; end;
end $$;
reset role;
update public.restaurant_memberships set active=true where id=current_setting('test.device.member')::uuid;
update public.restaurants set enabled=false where id=current_setting('test.device.restaurant')::uuid;
set local role anon;
do $$ begin
 begin perform public.pos_device_snapshot(repeat('a',64)); raise exception 'Disabled shop read through device'; exception when sqlstate 'P0001' then if sqlerrm<>'device-denied' then raise; end if; end;
end $$;
reset role;
update public.restaurants set enabled=true where id=current_setting('test.device.restaurant')::uuid;
-- A regular Auth identity must retain its own membership even if SQL context is forged.
insert into auth.users(id,email,email_confirmed_at) values('93000000-0000-4000-8000-000000000001','real-device-test@example.invalid',now());
insert into public.restaurant_memberships(restaurant_id,user_id,display_name,role)
 values(current_setting('test.device.other.restaurant')::uuid,'93000000-0000-4000-8000-000000000001','Actual staff','cashier');
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
select set_config('pos.device_key',repeat('a',64),true);
set local role authenticated;
do $$ declare result jsonb; begin
 result:=public.pos_staff_snapshot(null);
 if result->>'restaurantId'<>current_setting('test.device.other.restaurant') then raise exception 'Device context overrode authenticated membership'; end if;
 begin perform public.pos_staff_snapshot(current_setting('test.device.restaurant')::uuid); raise exception 'Device context escalated authenticated member'; exception when sqlstate 'P0001' then if sqlerrm<>'access-denied' then raise; end if; end;
 begin perform public.pos_device_snapshot(repeat('a',64)); raise exception 'Authenticated identity mixed into device wrapper'; exception when sqlstate 'P0001' then if sqlerrm<>'device-denied' then raise; end if; end;
 if (select count(*) from public.orders)<>0 then raise exception 'Auth RLS leaked other device shop'; end if;
end $$;
reset role;
-- Switching from temporary computer access to the verified shop owner keeps
-- the same business history and membership, rather than creating another shop.
set local role authenticated;
do $$ begin
 begin perform public.pos_claim_owner('Unrelated account'); raise exception 'Wrong email claimed device shop'; exception when sqlstate 'P0001' then if sqlerrm<>'owner-not-authorized' then raise; end if; end;
end $$;
reset role;
insert into auth.users(id,email,email_confirmed_at) values('95000000-0000-4000-8000-000000000001','darkside404404@gmail.com',null);
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
 begin perform public.pos_claim_owner('Unverified account'); raise exception 'Unverified email claimed device shop'; exception when sqlstate 'P0001' then if sqlerrm<>'owner-not-authorized' then raise; end if; end;
end $$;
reset role;
update auth.users set email_confirmed_at=now() where id='95000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare result jsonb; begin
 result:=public.pos_claim_owner('Do not create this extra shop');
 if result->>'restaurantId'<>current_setting('test.device.restaurant')
  or result->'membership'->>'id'<>current_setting('test.device.member')
  or result->'membership'->>'user_id'<>'95000000-0000-4000-8000-000000000001'
  or result->'restaurants'->>'name'<>'Device shop'
  or jsonb_array_length(result->'menu_items')<>1 or jsonb_array_length(result->'orders')<>1
  or jsonb_array_length(result->'payments')<>1 or result->'orders'->0->>'status'<>'cooking' then raise exception 'Owner login did not preserve the device shop and its transactions'; end if;
 if public.pos_claim_owner('Still not another shop')->>'restaurantId'<>current_setting('test.device.restaurant') then raise exception 'Owner attachment was not idempotent'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('pos.device_key','',true);
set local role anon;
do $$ declare result jsonb; begin
 result:=public.pos_device_snapshot(repeat('a',64));
 if result->'membership'->>'id'<>current_setting('test.device.member')
  or result->'membership'->>'user_id'<>'95000000-0000-4000-8000-000000000001'
  or jsonb_array_length(result->'orders')<>1 then raise exception 'Device access broke after owner attachment'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.restaurants)<>2 then raise exception 'Owner login created an extra restaurant'; end if;
end $$;
do $$ declare fn record; begin
 for fn in select p.oid,p.proname,p.proconfig,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like 'pos_device_%' loop
  if not ('search_path=""'=any(fn.proconfig)) then raise exception 'Device function has unsafe search_path: %',fn.proname; end if;
  if fn.nspname='private' and (has_function_privilege('anon',fn.oid,'EXECUTE') or has_function_privilege('authenticated',fn.oid,'EXECUTE')) then raise exception 'Device helper is public'; end if;
 end loop;
 if has_function_privilege('anon','public.pos_staff_snapshot(uuid)','EXECUTE') or has_function_privilege('anon','public.pos_staff_command(uuid,text,jsonb)','EXECUTE') then raise exception 'Device migration granted anon staff access'; end if;
 if public.pos_setup_status()->>'deviceAccessReady'<>'true' then raise exception 'Device setup status missing'; end if;
end $$;
rollback;
select 'trusted device SQL checks passed' as result;
