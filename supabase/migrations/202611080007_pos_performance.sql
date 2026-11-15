-- Order snapshots and payment validation look up immutable lines by order_id.
-- The existing restaurant_id-leading unique index scans unrelated order keys.
begin;
create index if not exists order_items_order_line_idx
  on public.order_items(order_id,line_number);
commit;
