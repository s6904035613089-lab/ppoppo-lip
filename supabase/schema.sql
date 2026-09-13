-- =============================================================
--  ppoppo POS — Supabase / PostgreSQL schema
--  รันไฟล์นี้ทั้งไฟล์ใน Supabase Dashboard → SQL Editor → Run
--  (รันซ้ำได้ ปลอดภัย: ใช้ IF NOT EXISTS / OR REPLACE ทุกจุด)
-- =============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------- ENUM
do $$ begin
  create type staff_role as enum ('admin', 'cashier');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sale_channel as enum ('pos', 'online');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sale_status as enum ('pending', 'paid', 'shipped', 'completed', 'cancelled', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('cash', 'promptpay', 'transfer', 'card', 'cod');
exception when duplicate_object then null; end $$;

do $$ begin
  create type movement_type as enum ('purchase', 'sale', 'return', 'adjust', 'damage');
exception when duplicate_object then null; end $$;

do $$ begin
  create type promo_type as enum ('percent', 'fixed');
exception when duplicate_object then null; end $$;

-- =============================================================
--  1. staff — พนักงาน (ผูกกับ auth.users ของ Supabase)
-- =============================================================
create table if not exists public.staff (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        staff_role not null default 'cashier',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- =============================================================
--  2. categories — หมวดหมู่สินค้า
-- =============================================================
create table if not exists public.categories (
  id          text primary key,                 -- 'tint' | 'lipstick' | 'gloss' | 'balm'
  name        text not null,
  emoji       text not null default '',
  sort_order  int  not null default 0
);

-- =============================================================
--  3. products — สินค้า (ลิปแต่ละเฉด)
-- =============================================================
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,            -- SKU เช่น P01
  barcode      text unique,                     -- บาร์โค้ด (สแกนที่ POS)
  name         text not null,
  category_id  text references public.categories(id) on delete set null,
  shade        text not null default '#F2879C', -- สีเฉด (hex)
  price        numeric(10,2) not null default 0 check (price >= 0),
  cost         numeric(10,2) not null default 0 check (cost >= 0),   -- ต้นทุน
  old_price    numeric(10,2) not null default 0,                     -- ราคาก่อนลด
  stock        int not null default 0 check (stock >= 0),
  image_url    text not null default '',
  description  text not null default '',
  featured     boolean not null default false,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_active_idx   on public.products(active);

-- =============================================================
--  4. customers — ลูกค้า / สมาชิก
-- =============================================================
create table if not exists public.customers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  phone        text unique,
  email        text,
  address      text not null default '',
  note         text not null default '',
  points       int not null default 0,
  total_spent  numeric(12,2) not null default 0,
  visit_count  int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists customers_phone_idx on public.customers(phone);

-- =============================================================
--  5. promotions — โปรโมชัน / โค้ดส่วนลด
-- =============================================================
create table if not exists public.promotions (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  type          promo_type not null default 'percent',
  value         numeric(10,2) not null check (value >= 0),   -- % หรือ บาท
  min_subtotal  numeric(10,2) not null default 0,
  max_discount  numeric(10,2),                                -- เพดานส่วนลด (สำหรับ %)
  starts_at     timestamptz,
  ends_at       timestamptz,
  usage_limit   int,
  used_count    int not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- =============================================================
--  6. shifts — กะการขาย / ลิ้นชักเงินสด
-- =============================================================
create table if not exists public.shifts (
  id             uuid primary key default gen_random_uuid(),
  opened_by      uuid references public.staff(id),
  opened_at      timestamptz not null default now(),
  opening_cash   numeric(10,2) not null default 0,
  closed_by      uuid references public.staff(id),
  closed_at      timestamptz,
  closing_cash   numeric(10,2),           -- เงินสดที่นับได้จริงตอนปิดกะ
  expected_cash  numeric(10,2),           -- เงินสดที่ควรมี = เปิดกะ + ขายสด
  cash_sales     numeric(10,2),
  total_sales    numeric(10,2),
  sale_count     int,
  note           text not null default '',
  status         text not null default 'open' check (status in ('open', 'closed'))
);

-- =============================================================
--  7. sales — บิลขาย (POS และออนไลน์)
-- =============================================================
create sequence if not exists public.sale_no_seq;

create table if not exists public.sales (
  id                uuid primary key default gen_random_uuid(),
  sale_no           text not null unique,
  channel           sale_channel not null default 'pos',
  status            sale_status  not null default 'paid',
  customer_id       uuid references public.customers(id) on delete set null,
  customer_name     text not null default '',
  customer_phone    text not null default '',
  shipping_address  text not null default '',
  staff_id          uuid references public.staff(id) on delete set null,
  shift_id          uuid references public.shifts(id) on delete set null,
  item_count        int not null default 0,
  subtotal          numeric(12,2) not null default 0,
  discount_amount   numeric(12,2) not null default 0,
  promotion_id      uuid references public.promotions(id) on delete set null,
  promotion_code    text,
  shipping_fee      numeric(10,2) not null default 0,
  total             numeric(12,2) not null default 0,
  paid_amount       numeric(12,2) not null default 0,
  change_amount     numeric(12,2) not null default 0,
  note              text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists sales_created_idx  on public.sales(created_at desc);
create index if not exists sales_status_idx   on public.sales(status);
create index if not exists sales_customer_idx on public.sales(customer_id);

-- =============================================================
--  8. sale_items — รายการสินค้าในบิล (snapshot ราคา/ชื่อ ณ ตอนขาย)
-- =============================================================
create table if not exists public.sale_items (
  id            uuid primary key default gen_random_uuid(),
  sale_id       uuid not null references public.sales(id) on delete cascade,
  product_id    uuid references public.products(id) on delete set null,
  product_code  text not null default '',
  product_name  text not null,
  shade         text not null default '',
  unit_price    numeric(10,2) not null,
  unit_cost     numeric(10,2) not null default 0,
  qty           int not null check (qty > 0),
  discount      numeric(10,2) not null default 0,
  line_total    numeric(12,2) not null
);
create index if not exists sale_items_sale_idx    on public.sale_items(sale_id);
create index if not exists sale_items_product_idx on public.sale_items(product_id);

-- =============================================================
--  9. payments — การรับชำระ (รองรับจ่ายหลายช่องทางในบิลเดียว)
-- =============================================================
create table if not exists public.payments (
  id         uuid primary key default gen_random_uuid(),
  sale_id    uuid not null references public.sales(id) on delete cascade,
  method     payment_method not null,
  amount     numeric(12,2) not null check (amount >= 0),
  reference  text not null default '',   -- เลขอ้างอิงโอน / 4 ตัวท้ายบัตร
  paid_at    timestamptz not null default now()
);
create index if not exists payments_sale_idx on public.payments(sale_id);

-- =============================================================
-- 10. stock_movements — ประวัติการเคลื่อนไหวสต็อกทุกครั้ง
-- =============================================================
create table if not exists public.stock_movements (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,
  type         movement_type not null,
  qty          int not null,               -- +รับเข้า / −ขายออก
  stock_after  int,
  sale_id      uuid references public.sales(id) on delete set null,
  note         text not null default '',
  created_by   uuid references public.staff(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists stock_movements_product_idx on public.stock_movements(product_id, created_at desc);

-- =============================================================
-- 11. settings — ค่าตั้งค่าร้าน (key / value)
-- =============================================================
create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- =============================================================
--  Helper functions
-- =============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_products_updated  on public.products;
create trigger trg_products_updated  before update on public.products  for each row execute function public.set_updated_at();
drop trigger if exists trg_customers_updated on public.customers;
create trigger trg_customers_updated before update on public.customers for each row execute function public.set_updated_at();
drop trigger if exists trg_sales_updated     on public.sales;
create trigger trg_sales_updated     before update on public.sales     for each row execute function public.set_updated_at();

-- ตรวจสิทธิ์ (security definer เพื่อไม่ให้ RLS ของ staff วนซ้ำ)
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where id = auth.uid() and active);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where id = auth.uid() and active and role = 'admin');
$$;

-- เลขที่บิล เช่น PP260913-0001
create or replace function public.next_sale_no()
returns text language sql volatile as $$
  select 'PP' || to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD') || '-' ||
         lpad(nextval('public.sale_no_seq')::text, 4, '0');
$$;

-- สร้างแถว staff อัตโนมัติเมื่อมีผู้ใช้ใหม่ใน Supabase Auth (คนแรก = admin)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.staff (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    case when (select count(*) from public.staff) = 0 then 'admin'::staff_role else 'cashier'::staff_role end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- =============================================================
--  Stock: ทุกการเคลื่อนไหวต้องผ่าน stock_movements
--  trigger จะอัปเดต products.stock ให้ และบันทึก stock_after
-- =============================================================
create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_stock int;
begin
  update public.products
     set stock = stock + new.qty
   where id = new.product_id
   returning stock into v_stock;
  if v_stock is null then raise exception 'ไม่พบสินค้า %', new.product_id; end if;
  new.stock_after := v_stock;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;

drop trigger if exists trg_apply_stock_movement on public.stock_movements;
create trigger trg_apply_stock_movement
  before insert on public.stock_movements for each row execute function public.apply_stock_movement();

-- ปรับสต็อกด้วยมือ (รับของเข้า / ปรับยอด / ของเสีย)
create or replace function public.adjust_stock(p_product_id uuid, p_delta int, p_type movement_type default 'adjust', p_note text default '')
returns public.products language plpgsql security definer set search_path = public as $$
declare v_row public.products;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์'; end if;
  if p_delta = 0 then select * into v_row from public.products where id = p_product_id; return v_row; end if;
  insert into public.stock_movements (product_id, type, qty, note) values (p_product_id, p_type, p_delta, p_note);
  select * into v_row from public.products where id = p_product_id;
  return v_row;
end $$;

-- ตั้งสต็อกเป็นตัวเลขที่ต้องการ (บันทึกส่วนต่างเป็น movement)
create or replace function public.set_stock(p_product_id uuid, p_stock int, p_note text default 'ตั้งค่าสต็อก')
returns public.products language plpgsql security definer set search_path = public as $$
declare v_cur int;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์'; end if;
  select stock into v_cur from public.products where id = p_product_id;
  return public.adjust_stock(p_product_id, p_stock - v_cur, 'adjust', p_note);
end $$;

-- =============================================================
--  Promotion: ตรวจสอบโค้ดและคำนวณส่วนลด
-- =============================================================
create or replace function public.check_promotion(p_code text, p_subtotal numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.promotions; v_disc numeric := 0;
begin
  select * into v from public.promotions where upper(code) = upper(trim(p_code)) and active;
  if v.id is null then return jsonb_build_object('ok', false, 'error', 'ไม่พบโค้ดส่วนลดนี้'); end if;
  if v.starts_at is not null and now() < v.starts_at then return jsonb_build_object('ok', false, 'error', 'โค้ดยังไม่เริ่มใช้งาน'); end if;
  if v.ends_at   is not null and now() > v.ends_at   then return jsonb_build_object('ok', false, 'error', 'โค้ดหมดอายุแล้ว'); end if;
  if v.usage_limit is not null and v.used_count >= v.usage_limit then return jsonb_build_object('ok', false, 'error', 'โค้ดถูกใช้ครบจำนวนแล้ว'); end if;
  if p_subtotal < v.min_subtotal then
    return jsonb_build_object('ok', false, 'error', 'ยอดขั้นต่ำสำหรับโค้ดนี้คือ ' || v.min_subtotal::int || ' บาท');
  end if;
  v_disc := case when v.type = 'percent' then round(p_subtotal * v.value / 100, 2) else v.value end;
  if v.max_discount is not null and v_disc > v.max_discount then v_disc := v.max_discount; end if;
  if v_disc > p_subtotal then v_disc := p_subtotal; end if;
  return jsonb_build_object('ok', true, 'id', v.id, 'code', v.code, 'name', v.name, 'discount', v_disc);
end $$;

-- =============================================================
--  create_sale — สร้างบิลขายแบบ atomic (POS และออนไลน์ใช้ร่วมกัน)
--  payload = {
--    channel: 'pos'|'online',
--    customer: { id?, name, phone, address, note },
--    items: [{ product_id, qty, discount? }],
--    discount_amount?: number,      (ส่วนลดท้ายบิลแบบกรอกเอง — เฉพาะพนักงาน)
--    promotion_code?: string,
--    payments?: [{ method, amount, reference? }],
--    shift_id?: uuid, note?: string
--  }
-- =============================================================
create or replace function public.create_sale(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_staff        boolean := public.is_staff();
  v_channel      sale_channel;
  v_status       sale_status;
  v_sale         public.sales;
  v_item         jsonb;
  v_prod         public.products;
  v_qty          int;
  v_line_disc    numeric;
  v_line_total   numeric;
  v_subtotal     numeric := 0;
  v_count        int := 0;
  v_discount     numeric := 0;
  v_promo        jsonb;
  v_promo_id     uuid;
  v_promo_code   text;
  v_shipping     numeric := 0;
  v_total        numeric;
  v_paid         numeric := 0;
  v_change       numeric := 0;
  v_pay          jsonb;
  v_cust_id      uuid;
  v_cust         jsonb := coalesce(payload -> 'customer', '{}'::jsonb);
  v_phone        text := nullif(trim(coalesce(v_cust ->> 'phone', '')), '');
  v_name         text := trim(coalesce(v_cust ->> 'name', ''));
  v_ship_fee     numeric := coalesce((select (value #>> '{}')::numeric from public.settings where key = 'shipping_fee'), 50);
  v_free_at      numeric := coalesce((select (value #>> '{}')::numeric from public.settings where key = 'free_shipping_at'), 690);
  v_sale_no      text;
begin
  -- ใครไม่ใช่พนักงาน = ลูกค้าสั่งออนไลน์เท่านั้น
  v_channel := case when v_staff then coalesce((payload ->> 'channel')::sale_channel, 'pos') else 'online' end;
  v_status  := case when v_channel = 'pos' then 'paid' else 'pending' end;

  if jsonb_array_length(coalesce(payload -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'ไม่มีรายการสินค้า';
  end if;
  if v_channel = 'online' and (v_name = '' or v_phone is null) then
    raise exception 'กรุณากรอกชื่อและเบอร์โทร';
  end if;

  -- สร้างหัวบิลก่อน (ยังไม่มียอด)
  v_sale_no := public.next_sale_no();
  insert into public.sales (sale_no, channel, status, staff_id, shift_id, note,
                            customer_name, customer_phone, shipping_address)
  values (v_sale_no, v_channel, 'pending',
          case when v_staff then auth.uid() end,
          case when v_staff then (payload ->> 'shift_id')::uuid end,
          coalesce(payload ->> 'note', ''),
          v_name, coalesce(v_phone, ''), coalesce(v_cust ->> 'address', ''))
  returning * into v_sale;

  -- รายการสินค้า + ตัดสต็อก
  for v_item in select * from jsonb_array_elements(payload -> 'items') loop
    v_qty := greatest(coalesce((v_item ->> 'qty')::int, 0), 0);
    if v_qty = 0 then continue; end if;

    select * into v_prod from public.products where id = (v_item ->> 'product_id')::uuid for update;
    if v_prod.id is null then raise exception 'ไม่พบสินค้า'; end if;
    if not v_prod.active then raise exception 'สินค้า % ปิดการขายอยู่', v_prod.name; end if;
    if v_prod.stock < v_qty then
      raise exception 'สินค้า % มีในสต็อกแค่ % ชิ้น', v_prod.name, v_prod.stock;
    end if;

    v_line_disc  := case when v_staff then greatest(coalesce((v_item ->> 'discount')::numeric, 0), 0) else 0 end;
    v_line_total := greatest(v_prod.price * v_qty - v_line_disc, 0);

    insert into public.sale_items (sale_id, product_id, product_code, product_name, shade,
                                   unit_price, unit_cost, qty, discount, line_total)
    values (v_sale.id, v_prod.id, v_prod.code, v_prod.name, v_prod.shade,
            v_prod.price, v_prod.cost, v_qty, v_line_disc, v_line_total);

    insert into public.stock_movements (product_id, type, qty, sale_id, note)
    values (v_prod.id, 'sale', -v_qty, v_sale.id, 'ขาย ' || v_sale_no);

    v_subtotal := v_subtotal + v_line_total;
    v_count    := v_count + v_qty;
  end loop;

  -- โปรโมชัน
  if nullif(trim(coalesce(payload ->> 'promotion_code', '')), '') is not null then
    v_promo := public.check_promotion(payload ->> 'promotion_code', v_subtotal);
    if not (v_promo ->> 'ok')::boolean then raise exception '%', v_promo ->> 'error'; end if;
    v_promo_id   := (v_promo ->> 'id')::uuid;
    v_promo_code := v_promo ->> 'code';
    v_discount   := (v_promo ->> 'discount')::numeric;
    update public.promotions set used_count = used_count + 1 where id = v_promo_id;
  end if;

  -- ส่วนลดท้ายบิลแบบกรอกเอง (เฉพาะพนักงาน)
  if v_staff then
    v_discount := v_discount + greatest(coalesce((payload ->> 'discount_amount')::numeric, 0), 0);
  end if;
  if v_discount > v_subtotal then v_discount := v_subtotal; end if;

  -- ค่าส่ง (ออนไลน์เท่านั้น)
  if v_channel = 'online' then
    v_shipping := case when (v_subtotal - v_discount) >= v_free_at then 0 else v_ship_fee end;
  end if;

  v_total := v_subtotal - v_discount + v_shipping;

  -- การรับชำระ (POS)
  if v_channel = 'pos' then
    for v_pay in select * from jsonb_array_elements(coalesce(payload -> 'payments', '[]'::jsonb)) loop
      insert into public.payments (sale_id, method, amount, reference)
      values (v_sale.id, (v_pay ->> 'method')::payment_method,
              coalesce((v_pay ->> 'amount')::numeric, 0), coalesce(v_pay ->> 'reference', ''));
      v_paid := v_paid + coalesce((v_pay ->> 'amount')::numeric, 0);
    end loop;
    if v_paid < v_total then raise exception 'ยอดชำระ % น้อยกว่ายอดบิล %', v_paid, v_total; end if;
    v_change := v_paid - v_total;
  end if;

  -- ลูกค้า: หาเดิมจากเบอร์โทร ถ้าไม่มีให้สร้างใหม่
  v_cust_id := (v_cust ->> 'id')::uuid;
  if v_cust_id is null and v_phone is not null then
    select id into v_cust_id from public.customers where phone = v_phone;
    if v_cust_id is null and v_name <> '' then
      insert into public.customers (name, phone, address, note)
      values (v_name, v_phone, coalesce(v_cust ->> 'address', ''), coalesce(v_cust ->> 'note', ''))
      returning id into v_cust_id;
    end if;
  end if;
  if v_cust_id is not null then
    update public.customers
       set address = case when coalesce(v_cust ->> 'address', '') <> '' then v_cust ->> 'address' else address end
     where id = v_cust_id;
  end if;

  -- ตั้งสถานะจริงตอนท้าย เพื่อให้ trigger สะสมแต้มทำงานหลังมี customer_id แล้ว
  update public.sales set
    status = v_status, customer_id = v_cust_id, item_count = v_count, subtotal = v_subtotal,
    discount_amount = v_discount, promotion_id = v_promo_id, promotion_code = v_promo_code,
    shipping_fee = v_shipping, total = v_total, paid_amount = v_paid, change_amount = v_change
  where id = v_sale.id returning * into v_sale;

  return public.get_sale(v_sale.id);
end $$;

-- ดึงบิล 1 ใบพร้อมรายการและการชำระ (ใช้พิมพ์ใบเสร็จ)
create or replace function public.get_sale(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(s) ||
         jsonb_build_object(
           'items',    coalesce((select jsonb_agg(to_jsonb(i) order by i.product_code) from public.sale_items i where i.sale_id = s.id), '[]'::jsonb),
           'payments', coalesce((select jsonb_agg(to_jsonb(p) order by p.paid_at) from public.payments p where p.sale_id = s.id), '[]'::jsonb)
         )
  from public.sales s where s.id = p_id;
$$;

-- =============================================================
--  Sale status: ยกเลิก/คืน → คืนสต็อก, ชำระแล้ว → สะสมแต้มลูกค้า
-- =============================================================
create or replace function public.on_sale_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_rate numeric;
begin
  if tg_op = 'UPDATE' and old.status in ('cancelled', 'refunded') and new.status not in ('cancelled', 'refunded') then
    raise exception 'บิลที่ยกเลิก/คืนแล้ว ไม่สามารถเปิดใหม่ได้';
  end if;

  -- คืนสต็อกเมื่อยกเลิก/คืนสินค้า
  if new.status in ('cancelled', 'refunded') and (tg_op = 'INSERT' or old.status not in ('cancelled', 'refunded')) then
    for r in select product_id, qty from public.sale_items where sale_id = new.id and product_id is not null loop
      insert into public.stock_movements (product_id, type, qty, sale_id, note)
      values (r.product_id, 'return', r.qty, new.id, 'คืนสต็อกจาก ' || new.sale_no || ' (' || new.status || ')');
    end loop;
  end if;

  -- สะสมยอดซื้อ/แต้มครั้งแรกที่บิลกลายเป็น paid ขึ้นไป
  if new.customer_id is not null
     and new.status in ('paid', 'shipped', 'completed')
     and (tg_op = 'INSERT' or old.status not in ('paid', 'shipped', 'completed')) then
    v_rate := coalesce((select (value #>> '{}')::numeric from public.settings where key = 'points_rate'), 20);
    update public.customers
       set total_spent = total_spent + new.total,
           visit_count = visit_count + 1,
           points      = points + floor(case when v_rate > 0 then new.total / v_rate else 0 end)::int
     where id = new.customer_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_sale_status on public.sales;
create trigger trg_sale_status
  after insert or update of status, customer_id on public.sales
  for each row execute function public.on_sale_status_change();

-- =============================================================
--  Shifts — เปิด/ปิดกะ
-- =============================================================
create or replace function public.open_shift(p_opening_cash numeric default 0, p_note text default '')
returns public.shifts language plpgsql security definer set search_path = public as $$
declare v public.shifts;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into v from public.shifts where status = 'open' order by opened_at desc limit 1;
  if v.id is not null then return v; end if;
  insert into public.shifts (opened_by, opening_cash, note) values (auth.uid(), p_opening_cash, p_note) returning * into v;
  return v;
end $$;

create or replace function public.close_shift(p_shift_id uuid, p_closing_cash numeric, p_note text default '')
returns public.shifts language plpgsql security definer set search_path = public as $$
declare v public.shifts; v_cash numeric; v_total numeric; v_cnt int;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์'; end if;
  select coalesce(sum(p.amount), 0) into v_cash
    from public.payments p join public.sales s on s.id = p.sale_id
   where s.shift_id = p_shift_id and p.method = 'cash' and s.status not in ('cancelled', 'refunded');
  -- เงินทอนถูกจ่ายออกจากลิ้นชัก
  v_cash := v_cash - coalesce((select sum(change_amount) from public.sales where shift_id = p_shift_id and status not in ('cancelled', 'refunded')), 0);
  select coalesce(sum(total), 0), count(*) into v_total, v_cnt
    from public.sales where shift_id = p_shift_id and status not in ('cancelled', 'refunded');

  update public.shifts set
    status = 'closed', closed_by = auth.uid(), closed_at = now(),
    closing_cash = p_closing_cash, cash_sales = v_cash,
    expected_cash = opening_cash + v_cash, total_sales = v_total, sale_count = v_cnt,
    note = case when p_note <> '' then p_note else note end
  where id = p_shift_id returning * into v;
  return v;
end $$;

-- =============================================================
--  Views สำหรับแดชบอร์ด
-- =============================================================
create or replace view public.v_daily_sales with (security_invoker = true) as
  select (created_at at time zone 'Asia/Bangkok')::date as day,
         channel,
         count(*)                as sale_count,
         sum(item_count)         as items,
         sum(total)              as revenue,
         sum(discount_amount)    as discounts
    from public.sales
   where status not in ('cancelled', 'refunded')
   group by 1, 2;

create or replace view public.v_product_sales with (security_invoker = true) as
  select i.product_id, i.product_code, i.product_name,
         sum(i.qty)                          as qty_sold,
         sum(i.line_total)                   as revenue,
         sum(i.line_total - i.unit_cost * i.qty) as gross_profit
    from public.sale_items i
    join public.sales s on s.id = i.sale_id
   where s.status not in ('cancelled', 'refunded')
   group by 1, 2, 3;

-- =============================================================
--  Row Level Security
-- =============================================================
alter table public.staff           enable row level security;
alter table public.categories      enable row level security;
alter table public.products        enable row level security;
alter table public.customers       enable row level security;
alter table public.promotions      enable row level security;
alter table public.shifts          enable row level security;
alter table public.sales           enable row level security;
alter table public.sale_items      enable row level security;
alter table public.payments        enable row level security;
alter table public.stock_movements enable row level security;
alter table public.settings        enable row level security;

-- staff
drop policy if exists "staff read"         on public.staff;
drop policy if exists "staff admin write"  on public.staff;
create policy "staff read"        on public.staff for select using (public.is_staff());
create policy "staff admin write" on public.staff for all    using (public.is_admin()) with check (public.is_admin());

-- categories / products: ทุกคนอ่านได้ (หน้าร้าน) พนักงานแก้ได้
drop policy if exists "categories public read" on public.categories;
drop policy if exists "categories staff write" on public.categories;
create policy "categories public read" on public.categories for select using (true);
create policy "categories staff write" on public.categories for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "products public read" on public.products;
drop policy if exists "products staff write" on public.products;
create policy "products public read" on public.products for select using (true);
create policy "products staff write" on public.products for all using (public.is_staff()) with check (public.is_staff());

-- ข้อมูลภายในร้าน: เฉพาะพนักงาน
drop policy if exists "customers staff"       on public.customers;
drop policy if exists "promotions staff"      on public.promotions;
drop policy if exists "shifts staff"          on public.shifts;
drop policy if exists "sales staff"           on public.sales;
drop policy if exists "sale_items staff"      on public.sale_items;
drop policy if exists "payments staff"        on public.payments;
drop policy if exists "stock_movements staff" on public.stock_movements;
create policy "customers staff"       on public.customers       for all using (public.is_staff()) with check (public.is_staff());
create policy "promotions staff"      on public.promotions      for all using (public.is_staff()) with check (public.is_staff());
create policy "shifts staff"          on public.shifts          for all using (public.is_staff()) with check (public.is_staff());
create policy "sales staff"           on public.sales           for all using (public.is_staff()) with check (public.is_staff());
create policy "sale_items staff"      on public.sale_items      for all using (public.is_staff()) with check (public.is_staff());
create policy "payments staff"        on public.payments        for all using (public.is_staff()) with check (public.is_staff());
create policy "stock_movements staff" on public.stock_movements for all using (public.is_staff()) with check (public.is_staff());

-- settings: ทุกคนอ่านได้ (ค่าส่ง ฯลฯ) แอดมินแก้
drop policy if exists "settings public read" on public.settings;
drop policy if exists "settings admin write" on public.settings;
create policy "settings public read" on public.settings for select using (true);
create policy "settings admin write" on public.settings for all using (public.is_admin()) with check (public.is_admin());

-- สิทธิ์เรียก function
grant execute on function public.create_sale(jsonb)            to anon, authenticated;
grant execute on function public.check_promotion(text, numeric) to anon, authenticated;
grant execute on function public.get_sale(uuid)                 to authenticated;
grant execute on function public.adjust_stock(uuid, int, movement_type, text) to authenticated;
grant execute on function public.set_stock(uuid, int, text)     to authenticated;
grant execute on function public.open_shift(numeric, text)      to authenticated;
grant execute on function public.close_shift(uuid, numeric, text) to authenticated;
grant select on public.v_daily_sales, public.v_product_sales    to authenticated;
revoke execute on function public.get_sale(uuid) from anon, public;
revoke all on public.v_daily_sales, public.v_product_sales from anon;

-- =============================================================
--  Storage — bucket รูปสินค้า (public อ่านได้ พนักงานอัปโหลด)
-- =============================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product images public read" on storage.objects;
drop policy if exists "product images staff write" on storage.objects;
create policy "product images public read" on storage.objects for select using (bucket_id = 'product-images');
create policy "product images staff write" on storage.objects for all
  using (bucket_id = 'product-images' and public.is_staff())
  with check (bucket_id = 'product-images' and public.is_staff());

-- =============================================================
--  Seed — ข้อมูลตั้งต้น
-- =============================================================
insert into public.categories (id, name, emoji, sort_order) values
  ('tint',     'ลิปทินท์', '💧', 1),
  ('lipstick', 'ลิปสติก',  '💄', 2),
  ('gloss',    'ลิปกลอส',  '✨', 3),
  ('balm',     'ลิปบาล์ม', '🧸', 4)
on conflict (id) do update set name = excluded.name, emoji = excluded.emoji, sort_order = excluded.sort_order;

insert into public.settings (key, value) values
  ('shop_name',        '"ppoppo Korean Lip Studio"'),
  ('shop_address',     '"กรุงเทพมหานคร"'),
  ('shop_phone',       '"08x-xxx-xxxx"'),
  ('tax_id',           '""'),
  ('shipping_fee',     '50'),
  ('free_shipping_at', '690'),
  ('low_stock_at',     '10'),
  ('points_rate',      '20'),
  ('promptpay_id',     '""'),
  ('receipt_footer',   '"ขอบคุณที่อุดหนุน ppoppo 💋"')
on conflict (key) do nothing;

insert into public.products (code, name, category_id, shade, price, cost, old_price, stock, featured, active, image_url, description) values
  ('P01', 'Peach Ppoppo',    'tint',     '#F79A7E', 320, 120, 420, 48, true,  true, 'assets/images/products/p01-peach-ppoppo.svg',    'ทินท์เนื้อเจลลี่สีพีชอ่อน ฉ่ำวาวเหมือนเพิ่งกินลูกพีชมา ทาบางได้ ทาซ้อนได้ เหมาะกับผิวทุกโทน'),
  ('P02', 'Strawberry Milk', 'tint',     '#F2879C', 320, 120, 420, 62, true,  true, 'assets/images/products/p02-strawberry-milk.svg', 'ชมพูนมสตรอว์เบอร์รี หวานแบบเกาหลีแท้ ๆ ใส่ส่วนผสมน้ำนมข้าว ให้ปากดูอิ่มฟูไม่เป็นคราบ'),
  ('P03', 'Cherry Coke',     'lipstick', '#B23A48', 390, 150, 0,   24, true,  true, 'assets/images/products/p03-cherry-coke.svg',     'แดงเชอร์รีอมน้ำตาล เนื้อแมตต์กำมะหยี่ ติดทนตลอดวัน แต่งหน้าน้อยก็ดูมีสไตล์ทันที'),
  ('P04', 'Mandarin Pop',    'tint',     '#F4703A', 320, 120, 0,   8,  false, true, 'assets/images/products/p04-mandarin-pop.svg',    'ส้มสดใสแบบส้มแมนดาริน เนื้อบางเบา ซึมไว ไม่หนักปาก เหมาะกับลุคซัมเมอร์'),
  ('P05', 'Rose Latte',      'lipstick', '#C08574', 390, 150, 450, 35, true,  true, 'assets/images/products/p05-rose-latte.svg',      'นู้ดโรสอมน้ำตาล โทนลาเต้ที่ใส่ไปทำงานได้ทุกวัน ผสมน้ำมันโจโจ้บาไม่ทำให้ปากลอก'),
  ('P06', 'Grape Jelly',     'gloss',    '#8E5B87', 350, 130, 0,   18, false, true, 'assets/images/products/p06-grape-jelly.svg',     'กลอสองุ่นม่วงพลัม ประกายชิมเมอร์ละเอียด ทาทับลิปสติกให้มิติ หรือทาเดี่ยวก็สวย'),
  ('P07', 'Coral Sunset',    'gloss',    '#F2705F', 350, 130, 0,   41, true,  true, 'assets/images/products/p07-coral-sunset.svg',    'โคอรัลส้มพีชเงาแบบกระจก เติมความสดใสให้ใบหน้าในวินาทีเดียว ไม่เหนียวเหนอะ'),
  ('P08', 'Red Velvet',      'lipstick', '#C2213A', 420, 160, 490, 0,  true,  true, 'assets/images/products/p08-red-velvet.svg',      'แดงกำมะหยี่คลาสสิก สีแน่นในปาดเดียว ตัวท็อปของแบรนด์ที่ขายหมดตลอด'),
  ('P09', 'Cotton Candy',    'balm',     '#F6A8C6', 280, 100, 0,   76, false, true, 'assets/images/products/p09-cotton-candy.svg',    'บาล์มสีชมพูพาสเทลกลิ่นสายไหม ผสมเชียบัตเตอร์ 12% บำรุงปากนุ่มระหว่างวัน'),
  ('P10', 'Honey Nude',      'balm',     '#CE9A6E', 280, 100, 0,   54, false, true, 'assets/images/products/p10-honey-nude.svg',      'บาล์มโทนน้ำผึ้งนู้ด ผสมน้ำผึ้งแท้และวิตามินอี ทาก่อนนอนตื่นมาปากนุ่มฉ่ำ'),
  ('P11', 'Watermelon Fizz', 'gloss',    '#EE5372', 350, 130, 0,   6,  true,  true, 'assets/images/products/p11-watermelon-fizz.svg', 'กลอสแตงโมซ่า สีชมพูอมแดงสดใส ให้ฟีลริมฝีปากอวบอิ่มแบบธรรมชาติ'),
  ('P12', 'Choco Mousse',    'lipstick', '#8A5A44', 390, 150, 0,   29, false, true, 'assets/images/products/p12-choco-mousse.svg',    'น้ำตาลช็อกโกแลตมูส เนื้อแมตต์นุ่ม โทนเข้มที่ใส่ได้ทุกฤดู ดูเท่แบบไม่ต้องพยายาม')
on conflict (code) do nothing;

insert into public.promotions (code, name, type, value, min_subtotal, max_discount, active) values
  ('WELCOME10', 'ลูกค้าใหม่ลด 10%', 'percent', 10, 0, 100, true),
  ('LIP50',     'ลด 50 บาท เมื่อซื้อครบ 500', 'fixed', 50, 500, null, true)
on conflict (code) do nothing;
