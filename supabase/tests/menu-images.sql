-- Disposable PostgreSQL only: exercise upload capability and Storage RLS.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('a5000000-0000-4000-8000-000000000001','photos-owner@test.invalid',now()),
 ('a5000000-0000-4000-8000-000000000002','photos-manager@test.invalid',now()),
 ('a5000000-0000-4000-8000-000000000003','photos-cashier@test.invalid',now()),
 ('a5000000-0000-4000-8000-000000000004','photos-other@test.invalid',now());
insert into public.restaurants(id,name) values('b5000000-0000-4000-8000-000000000001','Photo shop'),('b5000000-0000-4000-8000-000000000002','Other photo shop');
insert into public.restaurant_memberships(id,restaurant_id,user_id,display_name,role) values
 ('c5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','Photo owner','owner'),
 ('c5000000-0000-4000-8000-000000000002','b5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002','Photo manager','manager'),
 ('c5000000-0000-4000-8000-000000000003','b5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000003','Photo cashier','cashier'),
 ('c5000000-0000-4000-8000-000000000004','b5000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000004','Other owner','owner');
insert into private.pos_devices(id,credential_hash,restaurant_id,membership_id) values
 ('d5000000-0000-4000-8000-000000000001',encode(sha256(convert_to(repeat('a',64),'UTF8')),'hex'),'b5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001'),
 ('d5000000-0000-4000-8000-000000000002',encode(sha256(convert_to(repeat('b',64),'UTF8')),'hex'),null,null);
insert into storage.buckets(id,name,public) values('unrelated-private-bucket','unrelated-private-bucket',false);
select set_config('request.jwt.claim.sub','a5000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare ticket jsonb; begin
 ticket:=public.pos_menu_upload_ticket('b5000000-0000-4000-8000-000000000001');
 if ticket->>'bucket'<>'pos-menu-images' or ticket->>'path' !~ '^b5000000-0000-4000-8000-000000000001/[0-9a-f-]{36}\.webp$'
  or ticket::text like '%device%' or ticket::text like '%credential%' then raise exception 'Unsafe or invalid upload ticket response'; end if;
 perform set_config('test.image.owner.path',ticket->>'path',true);
 begin perform public.pos_menu_upload_ticket('b5000000-0000-4000-8000-000000000002'); raise exception 'Cross-shop upload ticket accepted'; exception when sqlstate 'P0001' then if sqlerrm<>'access-denied' then raise; end if; end;
 begin perform 1 from private.menu_image_tickets; raise exception 'Staff read private upload capabilities'; exception when insufficient_privilege then null; end;
 if public.pos_staff_snapshot(null)::text like '%menu_image_tickets%' then raise exception 'Snapshot leaked upload capabilities'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','a5000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ declare ticket jsonb; begin
 ticket:=public.pos_menu_upload_ticket(null); perform set_config('test.image.manager.path',ticket->>'path',true);
end $$;
reset role;
select set_config('request.jwt.claim.sub','a5000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$ begin
 begin perform public.pos_menu_upload_ticket(null); raise exception 'Cashier acquired upload ticket'; exception when sqlstate 'P0001' then if sqlerrm<>'access-denied' then raise; end if; end;
 begin perform public.pos_device_menu_upload_ticket(repeat('a',64)); raise exception 'Device and JWT identities mixed'; exception when sqlstate 'P0001' then if sqlerrm<>'device-denied' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ declare ticket jsonb; rejected boolean:=false; changed integer; begin
 begin perform public.pos_menu_upload_ticket(null); raise exception 'Anon acquired standard upload ticket'; exception when insufficient_privilege then null; end;
 begin perform public.pos_device_menu_upload_ticket(repeat('f',64)); raise exception 'Unknown device acquired upload ticket'; exception when sqlstate 'P0001' then if sqlerrm<>'device-denied' then raise; end if; end;
 begin perform public.pos_device_menu_upload_ticket(repeat('b',64)); raise exception 'Unbound device acquired upload ticket'; exception when sqlstate 'P0001' then if sqlerrm<>'no-membership' then raise; end if; end;
 ticket:=public.pos_device_menu_upload_ticket(repeat('a',64)); perform set_config('test.image.device.path',ticket->>'path',true);
 if ticket->>'bucket'<>'pos-menu-images' or ticket::text like '%credential%' or coalesce(current_setting('pos.device_key',true),'')<>'' then raise exception 'Device upload ticket leaked private state'; end if;
 if public.pos_can_upload_menu_image('b5000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000000.webp') then raise exception 'Guessed upload path valid'; end if;
 begin insert into storage.objects(bucket_id,name) values('pos-menu-images','b5000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000000.webp'); raise exception 'Unknown path upload allowed'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('unrelated-private-bucket',current_setting('test.image.owner.path')); raise exception 'Ticket crossed storage bucket'; exception when insufficient_privilege then null; end;
 insert into storage.objects(bucket_id,name) values('pos-menu-images',current_setting('test.image.owner.path'));
 insert into storage.objects(bucket_id,name) values('pos-menu-images',current_setting('test.image.manager.path'));
 insert into storage.objects(bucket_id,name) values('pos-menu-images',current_setting('test.image.device.path'));
 begin insert into storage.objects(bucket_id,name) values('pos-menu-images',current_setting('test.image.owner.path')); raise exception 'Original path uploaded twice'; exception when unique_violation or insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name,metadata) values('pos-menu-images',current_setting('test.image.owner.path'),'{"overwritten":true}') on conflict(bucket_id,name) do update set metadata=excluded.metadata; raise exception 'Image upsert was allowed'; exception when insufficient_privilege then null; end;
 update storage.objects set metadata='{"overwritten":true}' where bucket_id='pos-menu-images'; get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Anon could overwrite stored menu images'; end if;
 delete from storage.objects where bucket_id='pos-menu-images'; get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Anon could erase stored menu images'; end if;
end $$;
reset role;
-- An expired or revoked issuer cannot retain a working capability.
update private.menu_image_tickets set expires_at=now()-interval '1 second' where path=current_setting('test.image.owner.path');
update public.restaurant_memberships set active=false where id='c5000000-0000-4000-8000-000000000002';
update private.pos_devices set enabled=false where id='d5000000-0000-4000-8000-000000000001';
set local role anon;
do $$ begin
 if public.pos_can_upload_menu_image(current_setting('test.image.owner.path')) then raise exception 'Expired image ticket retained access'; end if;
 if public.pos_can_upload_menu_image(current_setting('test.image.manager.path')) then raise exception 'Revoked manager ticket retained access'; end if;
 if public.pos_can_upload_menu_image(current_setting('test.image.device.path')) then raise exception 'Revoked device ticket retained access'; end if;
 begin perform public.pos_device_menu_upload_ticket(repeat('a',64)); raise exception 'Revoked device minted an image ticket'; exception when sqlstate 'P0001' then if sqlerrm<>'device-denied' then raise; end if; end;
 begin insert into storage.objects(bucket_id,name) values('pos-menu-images',current_setting('test.image.owner.path')); raise exception 'Expired image upload allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update private.pos_devices set enabled=true where id='d5000000-0000-4000-8000-000000000001';
update public.restaurant_memberships set role='manager' where id='c5000000-0000-4000-8000-000000000001';
set local role anon;
do $$ begin
 if public.pos_can_upload_menu_image(current_setting('test.image.device.path')) then raise exception 'Non-owner device binding retained upload access'; end if;
end $$;
reset role;
update public.restaurant_memberships set role='owner' where id='c5000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','a5000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare before_count integer; i integer; begin
 -- The helper cannot inspect the private table as an account. Count through the
 -- known three earlier issued capabilities for this transaction instead.
 for i in 4..20 loop perform public.pos_menu_upload_ticket(null); end loop;
 begin perform public.pos_menu_upload_ticket(null); raise exception 'Unlimited image capabilities accepted'; exception when sqlstate 'P0001' then if sqlerrm<>'image-rate-limit' then raise; end if; end;
end $$;
reset role;
-- Capability tickets are not public app data, and only INSERT got a policy.
do $$ declare fn record; begin
 if (select count(*) from storage.objects where bucket_id='pos-menu-images')<>3
  or exists(select 1 from storage.objects where metadata ? 'overwritten') then raise exception 'Image protection did not preserve original objects'; end if;
 if has_function_privilege('anon','public.pos_menu_upload_ticket(uuid)','EXECUTE') then raise exception 'Anon can mint unbound standard image tickets'; end if;
 if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='pos_menu_images_ticket_insert' and cmd<>'INSERT') then raise exception 'Unexpected image write policy'; end if;
 for fn in select p.proname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pos_menu_upload_ticket','pos_can_upload_menu_image','pos_device_menu_upload_ticket') loop
  if not ('search_path=""'=any(fn.proconfig)) then raise exception 'Image function search_path is unsafe: %',fn.proname; end if;
 end loop;
 if public.pos_setup_status()->>'menuImagesReady'<>'true' then raise exception 'Photo setup readiness flag missing'; end if;
end $$;
rollback;
select 'menu photo upload SQL checks passed' as result;
