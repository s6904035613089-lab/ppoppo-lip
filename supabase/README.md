# ตั้งค่า Supabase สำหรับ ppoppo POS

## 1) สร้างฐานข้อมูล (ทำครั้งเดียว)

1. เปิด https://supabase.com/dashboard → เลือกโปรเจกต์
2. เมนูซ้าย **SQL Editor** → **New query**
3. คัดลอกเนื้อหาทั้งไฟล์ `supabase/schema.sql` วาง แล้วกด **Run**
   - สร้างตาราง 11 ตาราง, function, trigger, RLS, Storage bucket และข้อมูลตั้งต้น (สินค้า 12 เฉด)
   - รันซ้ำได้ ไม่พัง (ใช้ `if not exists` / `or replace` ทุกจุด)

## 2) เอาคีย์มาใส่ในเว็บ

Dashboard → **Project Settings → API**

| ค่าใน Dashboard | ใส่ที่ `assets/js/config.js` |
|---|---|
| Project URL | `SUPABASE_URL` |
| anon public key | `SUPABASE_ANON_KEY` |

> anon key เปิดเผยได้ (ออกแบบมาให้ใช้ใน browser) ความปลอดภัยอยู่ที่ Row Level Security
> **ห้าม** เอา `service_role` key มาใส่ในเว็บเด็ดขาด

## 3) แจ้งเตือนผ่าน Telegram (ไม่บังคับ)

รันไฟล์ `supabase/telegram.sql` ใน SQL Editor อีก 1 ครั้ง (หลัง schema.sql) จากนั้นตั้งค่าที่
**หลังบ้าน → ตั้งค่า → 🔔 แจ้งเตือนผ่าน Telegram** (มีขั้นตอนสร้างบอทและหา Chat ID อยู่ในหน้านั้น)

- ฐานข้อมูลส่งข้อความเองผ่าน extension `pg_net` — ไม่ต้องมีเซิร์ฟเวอร์เพิ่ม
- แจ้งเมื่อ: 🧾 ขาย (POS) / 🛒 ออเดอร์ออนไลน์ใหม่ / 🔄 เปลี่ยนสถานะบิล · 📦 รับสินค้าเข้า · ⚠️ ใกล้หมด · ⛔ หมด
- Token เก็บในตาราง `notify_settings` (แอดมินอ่านได้เท่านั้น) · ประวัติอยู่ใน `notification_log`

## 4) สร้างบัญชีพนักงาน

Dashboard → **Authentication → Users → Add user → Create new user**
ใส่อีเมล + รหัสผ่าน แล้วติ๊ก *Auto Confirm User*

- บัญชี**แรก**ที่สร้างจะได้สิทธิ์ `admin` อัตโนมัติ
- บัญชีถัดไปเป็น `cashier` (แอดมินเปลี่ยนสิทธิ์ได้ในหลังบ้าน → พนักงาน)
- ปิด Sign-up สาธารณะ: **Authentication → Providers → Email → ปิด "Allow new users to sign up"**

## โครงสร้างตาราง

```
staff            พนักงาน (ผูกกับ auth.users)  role: admin | cashier
categories       หมวดหมู่  tint / lipstick / gloss / balm
products         สินค้า    code(SKU), barcode, shade, price, cost, stock, image_url …
customers        ลูกค้า    phone(unique), points, total_spent, visit_count
promotions       โค้ดส่วนลด  percent/fixed, min_subtotal, max_discount, ช่วงเวลา, จำกัดครั้ง
shifts           กะขาย     opening_cash → expected_cash / closing_cash / ส่วนต่าง
sales            หัวบิล    sale_no (PPยยมมวว-0001), channel pos|online, status, ยอดต่าง ๆ
sale_items       รายการในบิล (snapshot ชื่อ/ราคา/ต้นทุน ณ ตอนขาย)
payments         การรับชำระ  cash / promptpay / transfer / card / cod  (แยกหลายรายการต่อบิลได้)
stock_movements  ประวัติสต็อกทุกครั้ง  purchase / sale / return / adjust / damage
settings         ค่าตั้งค่าร้าน key/value (ค่าส่ง, แต้ม, ข้อมูลใบเสร็จ)
notify_settings  ตั้งค่า Telegram (token, chat_id, เปิด-ปิดแต่ละเหตุการณ์)   ← telegram.sql
notification_log ประวัติข้อความที่ส่ง                                    ← telegram.sql
```

### Function หลัก (เรียกผ่าน `supabase.rpc`)

| function | ทำอะไร |
|---|---|
| `create_sale(payload)` | สร้างบิลแบบ atomic: ตรวจสต็อก → ตัดสต็อก → ใช้โค้ด → บันทึกการชำระ → ผูกลูกค้า. ลูกค้าทั่วไป (anon) สร้างได้เฉพาะ `online` สถานะ `pending` |
| `check_promotion(code, subtotal)` | ตรวจโค้ดและคำนวณส่วนลด |
| `adjust_stock(id, delta, type, note)` / `set_stock(id, n, note)` | ปรับสต็อกพร้อมบันทึกประวัติ |
| `open_shift(cash)` / `close_shift(id, cash)` | เปิด/ปิดกะ คำนวณเงินสดที่ควรมี |
| `get_sale(id)` | ดึงบิลพร้อมรายการ + การชำระ (ใบเสร็จ) |

### Trigger

- เพิ่มแถวใน `stock_movements` → อัปเดต `products.stock` อัตโนมัติ
- บิลเปลี่ยนเป็น `cancelled`/`refunded` → คืนสต็อกอัตโนมัติ
- บิลเปลี่ยนเป็น `paid` ขึ้นไป → สะสม `total_spent` / `points` ให้ลูกค้า
- มีผู้ใช้ใหม่ใน Auth → สร้างแถว `staff` (คนแรก = admin)

### สิทธิ์ (RLS)

| ตาราง | anon (ลูกค้าหน้าเว็บ) | พนักงาน | แอดมิน |
|---|---|---|---|
| categories, products, settings | อ่าน | อ่าน/เขียน (settings: อ่าน) | ทั้งหมด |
| sales, sale_items, payments, customers, promotions, shifts, stock_movements | — (สั่งซื้อผ่าน `create_sale` เท่านั้น) | ทั้งหมด | ทั้งหมด |
| staff | — | อ่าน | ทั้งหมด |
| Storage `product-images` | อ่าน | อัปโหลด/ลบ | อัปโหลด/ลบ |
