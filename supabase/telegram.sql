-- =============================================================
--  ppoppo POS — แจ้งเตือนผ่าน Telegram (ส่วนเสริม รันหลัง schema.sql)
--  รันไฟล์นี้ทั้งไฟล์ใน Supabase Dashboard → SQL Editor → Run
--
--  ฐานข้อมูลส่งข้อความเองผ่าน extension pg_net (ไม่ต้องมีเซิร์ฟเวอร์เพิ่ม)
--  เหตุการณ์ที่แจ้ง:
--    🧾 มีการขาย (POS) / 🛒 ออเดอร์ออนไลน์ใหม่ / เปลี่ยนสถานะบิล-ยกเลิก
--    📦 รับสินค้าเข้า (purchase / ปรับสต็อกเพิ่ม)
--    ⚠️ สต็อกใกล้หมด (ตกถึงเกณฑ์ low_stock_at) / ⛔ สินค้าหมด
-- =============================================================

create extension if not exists pg_net with schema extensions;

-- ------------------------------------------------------------- ตั้งค่า (แถวเดียว id = 1)
create table if not exists public.notify_settings (
  id                  int primary key default 1 check (id = 1),
  enabled             boolean not null default false,
  telegram_bot_token  text not null default '',
  telegram_chat_id    text not null default '',
  notify_sales        boolean not null default true,   -- ขาย / ออเดอร์ใหม่ / เปลี่ยนสถานะ
  notify_restock      boolean not null default true,   -- รับสินค้าเข้า
  notify_low_stock    boolean not null default true,   -- ใกล้หมด / หมด
  updated_at          timestamptz not null default now()
);
insert into public.notify_settings (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------- ประวัติการแจ้งเตือน
create table if not exists public.notification_log (
  id          bigserial primary key,
  event       text not null,           -- sale | order | status | restock | low_stock | out_of_stock | test
  message     text not null,
  request_id  bigint,                  -- id จาก pg_net (ดูผลได้ที่ net._http_response)
  created_at  timestamptz not null default now()
);
create index if not exists notification_log_created_idx on public.notification_log(created_at desc);

alter table public.notify_settings  enable row level security;
alter table public.notification_log enable row level security;
drop policy if exists "notify_settings admin" on public.notify_settings;
drop policy if exists "notification_log staff" on public.notification_log;
create policy "notify_settings admin" on public.notify_settings for all using (public.is_admin()) with check (public.is_admin());
create policy "notification_log staff" on public.notification_log for select using (public.is_staff());

-- ------------------------------------------------------------- helpers
create or replace function public.tg_esc(t text)
returns text language sql immutable as $$
  select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;

create or replace function public.tg_money(n numeric)
returns text language sql immutable as $$
  select '฿' || to_char(coalesce(n, 0), 'FM999,999,990');
$$;

-- ส่งข้อความ (async ผ่าน pg_net) + บันทึก log · คืน request_id หรือ null ถ้าไม่ได้เปิดใช้
create or replace function public.telegram_send(p_event text, p_text text)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare s public.notify_settings; v_req bigint;
begin
  select * into s from public.notify_settings where id = 1;
  if s.id is null or not s.enabled or s.telegram_bot_token = '' or s.telegram_chat_id = '' then
    return null;
  end if;
  begin
    select net.http_post(
      url     := 'https://api.telegram.org/bot' || s.telegram_bot_token || '/sendMessage',
      body    := jsonb_build_object('chat_id', s.telegram_chat_id, 'text', p_text,
                                    'parse_mode', 'HTML', 'disable_web_page_preview', true),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 8000
    ) into v_req;
  exception when others then
    v_req := null;   -- ห้ามให้การแจ้งเตือนทำให้การขายล้ม
  end;
  insert into public.notification_log (event, message, request_id) values (p_event, p_text, v_req);
  return v_req;
end $$;

-- ------------------------------------------------------------- สต็อก: รับเข้า / ใกล้หมด / หมด
create or replace function public.notify_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s        public.notify_settings;
  p        public.products;
  v_low    int := coalesce((select (value #>> '{}')::int from public.settings where key = 'low_stock_at'), 10);
  v_before int := new.stock_after - new.qty;
  v_who    text;
begin
  select * into s from public.notify_settings where id = 1;
  if s.id is null or not s.enabled then return new; end if;
  select * into p from public.products where id = new.product_id;
  select full_name into v_who from public.staff where id = new.created_by;

  -- 📦 รับสินค้าเข้า
  if s.notify_restock and new.qty > 0 and new.type in ('purchase', 'adjust') then
    perform public.telegram_send('restock',
      '📦 <b>รับสินค้าเข้า</b>' || E'\n' ||
      tg_esc(p.name) || ' (' || tg_esc(p.code) || ')  <b>+' || new.qty || '</b> ชิ้น' || E'\n' ||
      'คงเหลือตอนนี้: <b>' || new.stock_after || '</b> ชิ้น' ||
      case when new.note <> '' then E'\n' || '📝 ' || tg_esc(new.note) else '' end ||
      case when v_who is not null then E'\n' || '👤 ' || tg_esc(v_who) else '' end);
  end if;

  -- ⛔ หมด (เพิ่งตกเป็น 0)
  if s.notify_low_stock and new.stock_after <= 0 and v_before > 0 then
    perform public.telegram_send('out_of_stock',
      '⛔ <b>สินค้าหมด!</b>' || E'\n' ||
      tg_esc(p.name) || ' (' || tg_esc(p.code) || ')' || E'\n' ||
      'คงเหลือ <b>0</b> ชิ้น — รีบเติมสต็อกนะคะ');
  -- ⚠️ ใกล้หมด (เพิ่งตกถึงเกณฑ์)
  elsif s.notify_low_stock and new.stock_after > 0 and new.stock_after <= v_low and v_before > v_low then
    perform public.telegram_send('low_stock',
      '⚠️ <b>สต็อกใกล้หมด</b>' || E'\n' ||
      tg_esc(p.name) || ' (' || tg_esc(p.code) || ')' || E'\n' ||
      'เหลือ <b>' || new.stock_after || '</b> ชิ้น (เกณฑ์เตือน ≤ ' || v_low || ')');
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_stock_movement on public.stock_movements;
create trigger trg_notify_stock_movement
  after insert on public.stock_movements for each row execute function public.notify_stock_movement();

-- ------------------------------------------------------------- บิล: ข้อความสรุปบิล 1 ใบ
create or replace function public.sale_summary_text(p_sale_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare s public.sales; v_items text; v_pay text; v_who text;
begin
  select * into s from public.sales where id = p_sale_id;
  select string_agg('• ' || tg_esc(product_name) || ' ×' || qty || '  ' || tg_money(line_total), E'\n' order by product_code)
    into v_items from public.sale_items where sale_id = p_sale_id;
  select string_agg(case method when 'cash' then 'เงินสด' when 'promptpay' then 'พร้อมเพย์' when 'transfer' then 'โอน'
                                when 'card' then 'บัตร' else method::text end || ' ' || tg_money(amount), ', ')
    into v_pay from public.payments where sale_id = p_sale_id;
  select full_name into v_who from public.staff where id = s.staff_id;

  return '<b>' || tg_esc(s.sale_no) || '</b>  ' || case when s.channel = 'pos' then '🏪 หน้าร้าน' else '🌐 ออนไลน์' end || E'\n' ||
         coalesce(v_items, '-') || E'\n' ||
         '━━━━━━━━━━━━━━' || E'\n' ||
         'รวม ' || s.item_count || ' ชิ้น  ยอดสินค้า ' || tg_money(s.subtotal) ||
         case when s.discount_amount > 0 then E'\n' || 'ส่วนลด −' || tg_money(s.discount_amount) ||
              case when s.promotion_code is not null then ' (' || tg_esc(s.promotion_code) || ')' else '' end else '' end ||
         case when s.shipping_fee > 0 then E'\n' || 'ค่าส่ง ' || tg_money(s.shipping_fee) else '' end || E'\n' ||
         '💰 <b>ยอดสุทธิ ' || tg_money(s.total) || '</b>' ||
         case when v_pay is not null then E'\n' || '💳 ' || v_pay ||
              case when s.change_amount > 0 then ' (ทอน ' || tg_money(s.change_amount) || ')' else '' end else '' end ||
         case when s.customer_name <> '' then E'\n' || '👤 ลูกค้า: ' || tg_esc(s.customer_name) ||
              case when s.customer_phone <> '' then ' ' || tg_esc(s.customer_phone) else '' end else '' end ||
         case when s.shipping_address <> '' then E'\n' || '📍 ' || tg_esc(s.shipping_address) else '' end ||
         case when v_who is not null then E'\n' || '🧑‍💼 แคชเชียร์: ' || tg_esc(v_who) else '' end ||
         case when s.note <> '' then E'\n' || '📝 ' || tg_esc(s.note) else '' end;
end $$;

-- แจ้งบิลใหม่ (เรียกจาก create_sale)
create or replace function public.notify_new_sale(p_sale_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.notify_settings; v_channel sale_channel;
begin
  select * into s from public.notify_settings where id = 1;
  if s.id is null or not s.enabled or not s.notify_sales then return; end if;
  select channel into v_channel from public.sales where id = p_sale_id;
  if v_channel = 'pos' then
    perform public.telegram_send('sale', '🧾 <b>ขายสินค้าแล้ว</b>' || E'\n' || public.sale_summary_text(p_sale_id));
  else
    perform public.telegram_send('order', '🛒 <b>ออเดอร์ออนไลน์ใหม่ — รอชำระ</b>' || E'\n' || public.sale_summary_text(p_sale_id) ||
                                 E'\n\n' || '👉 เปิดหลังบ้านเพื่อยืนยันการชำระเงิน');
  end if;
end $$;

-- แจ้งเมื่อบิลเปลี่ยนสถานะ (ยกเว้นตอน create_sale เติมยอดครั้งแรก ซึ่ง old.item_count = 0)
create or replace function public.notify_sale_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare s public.notify_settings; v_label text;
begin
  select * into s from public.notify_settings where id = 1;
  if s.id is null or not s.enabled or not s.notify_sales then return new; end if;
  if old.status = new.status or old.item_count = 0 then return new; end if;
  v_label := case new.status when 'paid' then '✅ ชำระแล้ว' when 'shipped' then '🚚 จัดส่งแล้ว' when 'completed' then '🎉 สำเร็จ'
                             when 'cancelled' then '❌ ยกเลิกบิล (คืนสต็อกแล้ว)' when 'refunded' then '↩️ คืนเงิน (คืนสต็อกแล้ว)'
                             else new.status::text end;
  perform public.telegram_send('status',
    v_label || E'\n' || '<b>' || tg_esc(new.sale_no) || '</b>  ' || case when new.channel = 'pos' then '🏪 หน้าร้าน' else '🌐 ออนไลน์' end ||
    case when new.customer_name <> '' then E'\n' || '👤 ' || tg_esc(new.customer_name) else '' end ||
    E'\n' || '💰 ' || tg_money(new.total));
  return new;
end $$;

drop trigger if exists trg_notify_sale_status on public.sales;
create trigger trg_notify_sale_status
  after update of status on public.sales for each row execute function public.notify_sale_status();

-- ------------------------------------------------------------- เกี่ยว create_sale ให้แจ้งบิลใหม่
-- (แทนที่ทั้งฟังก์ชัน — เหมือน schema.sql ทุกอย่าง เพิ่มแค่บรรทัด notify_new_sale ก่อน return)
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
  v_channel := case when v_staff then coalesce((payload ->> 'channel')::sale_channel, 'pos') else 'online' end;
  v_status  := case when v_channel = 'pos' then 'paid' else 'pending' end;

  if jsonb_array_length(coalesce(payload -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'ไม่มีรายการสินค้า';
  end if;
  if v_channel = 'online' and (v_name = '' or v_phone is null) then
    raise exception 'กรุณากรอกชื่อและเบอร์โทร';
  end if;

  v_sale_no := public.next_sale_no();
  insert into public.sales (sale_no, channel, status, staff_id, shift_id, note,
                            customer_name, customer_phone, shipping_address)
  values (v_sale_no, v_channel, 'pending',
          case when v_staff then auth.uid() end,
          case when v_staff then (payload ->> 'shift_id')::uuid end,
          coalesce(payload ->> 'note', ''),
          v_name, coalesce(v_phone, ''), coalesce(v_cust ->> 'address', ''))
  returning * into v_sale;

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

  if nullif(trim(coalesce(payload ->> 'promotion_code', '')), '') is not null then
    v_promo := public.check_promotion(payload ->> 'promotion_code', v_subtotal);
    if not (v_promo ->> 'ok')::boolean then raise exception '%', v_promo ->> 'error'; end if;
    v_promo_id   := (v_promo ->> 'id')::uuid;
    v_promo_code := v_promo ->> 'code';
    v_discount   := (v_promo ->> 'discount')::numeric;
    update public.promotions set used_count = used_count + 1 where id = v_promo_id;
  end if;

  if v_staff then
    v_discount := v_discount + greatest(coalesce((payload ->> 'discount_amount')::numeric, 0), 0);
  end if;
  if v_discount > v_subtotal then v_discount := v_subtotal; end if;

  if v_channel = 'online' then
    v_shipping := case when (v_subtotal - v_discount) >= v_free_at then 0 else v_ship_fee end;
  end if;

  v_total := v_subtotal - v_discount + v_shipping;

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

  update public.sales set
    status = v_status, customer_id = v_cust_id, item_count = v_count, subtotal = v_subtotal,
    discount_amount = v_discount, promotion_id = v_promo_id, promotion_code = v_promo_code,
    shipping_fee = v_shipping, total = v_total, paid_amount = v_paid, change_amount = v_change
  where id = v_sale.id returning * into v_sale;

  -- 🔔 แจ้งเตือน Telegram (ไม่กระทบการขายถ้าส่งไม่สำเร็จ)
  perform public.notify_new_sale(v_sale.id);

  return public.get_sale(v_sale.id);
end $$;

-- ------------------------------------------------------------- ทดสอบจากหลังบ้าน
create or replace function public.telegram_test()
returns bigint language plpgsql security definer set search_path = public as $$
declare v_req bigint; s public.notify_settings;
begin
  if not public.is_admin() then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into s from public.notify_settings where id = 1;
  if not s.enabled then raise exception 'ยังไม่ได้เปิดใช้การแจ้งเตือน (ติ๊ก "เปิดใช้งาน" แล้วบันทึกก่อน)'; end if;
  if s.telegram_bot_token = '' or s.telegram_chat_id = '' then raise exception 'กรุณากรอก Bot Token และ Chat ID ก่อน'; end if;
  v_req := public.telegram_send('test',
    '🔔 <b>ทดสอบการแจ้งเตือน ppoppo POS</b>' || E'\n' || 'ถ้าเห็นข้อความนี้ แปลว่าตั้งค่าถูกต้องแล้ว 💋' || E'\n' ||
    to_char(now() at time zone 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI'));
  if v_req is null then raise exception 'ส่งไม่สำเร็จ — ตรวจสอบว่าเปิด extension pg_net แล้ว'; end if;
  return v_req;
end $$;

-- ดูผลตอบกลับจาก Telegram ของ request นั้น (pg_net เก็บไว้ที่ net._http_response)
create or replace function public.telegram_check(p_request_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.is_staff() then raise exception 'ไม่มีสิทธิ์'; end if;
  select status_code, content, error_msg into r from net._http_response where id = p_request_id;
  if r is null then return jsonb_build_object('done', false); end if;
  return jsonb_build_object('done', true, 'status', r.status_code, 'body', left(coalesce(r.content, ''), 400), 'error', r.error_msg);
end $$;

grant execute on function public.telegram_test()          to authenticated;
grant execute on function public.telegram_check(bigint)   to authenticated;
revoke execute on function public.telegram_send(text, text) from anon, authenticated, public;
revoke execute on function public.notify_new_sale(uuid)     from anon, authenticated, public;
revoke execute on function public.sale_summary_text(uuid)   from anon, authenticated, public;
