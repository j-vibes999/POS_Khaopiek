-- Disposable database only: verify known seed cleanup preserves user edits.
\set ON_ERROR_STOP on
create function pg_temp.install_old_seed() returns void language plpgsql as $$
declare rid uuid := 'a1100000-0000-4000-8000-000000000001';
begin
 insert into public.restaurants(id,name) values(rid,'Khao Piek — Demo');
 insert into public.menu_items(restaurant_id,code,name_lo,name_th,price,category,image_path,popular)
 select rid,v.*,v.code in ('pork','pho') from (values
      ('pork','ເຂົ້າປຽກເສັ້ນໝູ','ข้าวเปียกเส้นหมู',35000::bigint,'khao','/images/khao-piak.jpg'),
      ('chicken','ເຂົ້າປຽກເສັ້ນໄກ່','ข้าวเปียกเส้นไก่',35000::bigint,'khao','/images/khao-piak.jpg'),
      ('pho','ເຝີຊີ້ນງົວ','เฝอเนื้อ',45000::bigint,'pho','/images/pho.jpg'),
      ('mixed','ເຝີລວມມິດ','เฝอรวมมิตร',50000::bigint,'pho','/images/pho.jpg'),
      ('coffee','ກາເຟລາວເຢັນ','กาแฟลาวเย็น',20000::bigint,'drinks','/images/coffee.jpg'),
      ('tea','ຊາໝາກນາວ','ชามะนาว',15000::bigint,'drinks','/images/drink.jpg')
 ) as v(code,name_lo,name_th,price,category,image_path);
 insert into public.dining_tables(restaurant_id,table_number,seats)
 select rid,n,case when n%3=0 then 6 else 4 end from generate_series(1,12) n;
end $$;
select pg_temp.install_old_seed();
\ir ../migrations/202611070003_retire_sample_shop.sql
do $$ begin
 if exists(select 1 from public.restaurants where id='a1100000-0000-4000-8000-000000000001') then raise exception 'Untouched seed was not removed'; end if;
end $$;
select pg_temp.install_old_seed();
update public.menu_items set detail_lo='A description entered by the shop' where restaurant_id='a1100000-0000-4000-8000-000000000001' and code='pork';
\ir ../migrations/202611070003_retire_sample_shop.sql
do $$ begin
 if not exists(select 1 from public.restaurants where id='a1100000-0000-4000-8000-000000000001' and not enabled)
 or not exists(select 1 from public.menu_items where restaurant_id='a1100000-0000-4000-8000-000000000001' and detail_lo='A description entered by the shop') then raise exception 'Edited seed rows were lost'; end if;
end $$;
delete from public.menu_items where restaurant_id='a1100000-0000-4000-8000-000000000001';
delete from public.dining_tables where restaurant_id='a1100000-0000-4000-8000-000000000001';
delete from public.restaurants where id='a1100000-0000-4000-8000-000000000001';
select pg_temp.install_old_seed();
insert into auth.users(id,email,email_confirmed_at) values('99000000-0000-4000-8000-000000000001','cleanup@test.invalid',now());
insert into public.restaurant_memberships(restaurant_id,user_id,display_name,role)
 values('a1100000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000001','Actual owner','owner');
\ir ../migrations/202611070003_retire_sample_shop.sql
do $$ begin
 if not exists(select 1 from public.restaurants where id='a1100000-0000-4000-8000-000000000001' and enabled)
 or (select count(*) from public.menu_items where restaurant_id='a1100000-0000-4000-8000-000000000001')<>6 then raise exception 'Owned shop was changed by cleanup'; end if;
end $$;
delete from public.restaurant_memberships where restaurant_id='a1100000-0000-4000-8000-000000000001';
delete from public.menu_items where restaurant_id='a1100000-0000-4000-8000-000000000001';
delete from public.dining_tables where restaurant_id='a1100000-0000-4000-8000-000000000001';
delete from public.restaurants where id='a1100000-0000-4000-8000-000000000001';
delete from auth.users where id='99000000-0000-4000-8000-000000000001';
select 'legacy sample cleanup checks passed' as result;
