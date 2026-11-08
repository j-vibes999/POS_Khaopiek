-- Retire only the known unowned shop created by the previous illustrative seed.
-- Preserve any shop with a membership or business activity. Changed menu/table
-- records are archived with the unowned shop, never silently erased.
begin;
do $$
declare rid uuid := 'a1100000-0000-4000-8000-000000000001';
begin
 if not exists(select 1 from public.restaurants where id=rid and name='Khao Piek — Demo')
   or exists(select 1 from public.restaurant_memberships where restaurant_id=rid)
   or exists(select 1 from public.orders where restaurant_id=rid)
   or exists(select 1 from public.shifts where restaurant_id=rid)
   or exists(select 1 from public.payments where restaurant_id=rid)
   or exists(select 1 from public.activity_log where restaurant_id=rid) then return; end if;
 update public.restaurants set enabled=false where id=rid;
 -- Only erase rows that still have untouched seed defaults. Any descriptions,
 -- ordering or settings entered later are retained in the archived shop.
 if exists(select 1 from public.restaurants where id=rid and branch='' and phone='' and payment_methods=array['transfer','cash']::text[])
   and (select count(*) from public.menu_items where restaurant_id=rid)=6
   and not exists(
    select code,name_lo,name_th,price,category,image_path from public.menu_items where restaurant_id=rid
    except values
      ('pork','ເຂົ້າປຽກເສັ້ນໝູ','ข้าวเปียกเส้นหมู',35000::bigint,'khao','/images/khao-piak.jpg'),
      ('chicken','ເຂົ້າປຽກເສັ້ນໄກ່','ข้าวเปียกเส้นไก่',35000::bigint,'khao','/images/khao-piak.jpg'),
      ('pho','ເຝີຊີ້ນງົວ','เฝอเนื้อ',45000::bigint,'pho','/images/pho.jpg'),
      ('mixed','ເຝີລວມມິດ','เฝอรวมมิตร',50000::bigint,'pho','/images/pho.jpg'),
      ('coffee','ກາເຟລາວເຢັນ','กาแฟลาวเย็น',20000::bigint,'drinks','/images/coffee.jpg'),
      ('tea','ຊາໝາກນາວ','ชามะนาว',15000::bigint,'drinks','/images/drink.jpg'))
   and not exists(select 1 from public.menu_items where restaurant_id=rid and (name_en<>'' or name_zh<>'' or name_ko<>'' or name_ja<>'' or detail_lo<>'' or detail_th<>'' or sort_order<>0 or not available or not enabled or popular<>(code in ('pork','pho'))))
   and (select count(*) from public.dining_tables where restaurant_id=rid)=12
   and not exists(select 1 from public.dining_tables where restaurant_id=rid
     and (not enabled or zone<>'' or table_number not between 1 and 12 or seats<>(case when table_number%3=0 then 6 else 4 end))) then
    delete from public.menu_items where restaurant_id=rid;
    delete from public.dining_tables where restaurant_id=rid;
    delete from public.restaurants where id=rid;
 end if;
end $$;
commit;
