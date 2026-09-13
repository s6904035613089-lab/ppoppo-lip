/* =============================================================
   data.js — ค่าคงที่ฝั่งหน้าเว็บ
   ข้อมูลสินค้าจริงอยู่ใน Supabase (ดู supabase/schema.sql)
   ไฟล์นี้เหลือแค่หมวดหมู่สำรอง (ใช้ระหว่างรอโหลด) และคลังรูปในโปรเจกต์
   ============================================================= */

const PP_CATEGORIES = [
  { id: 'tint',     name: 'ลิปทินท์',   emoji: '💧' },
  { id: 'lipstick', name: 'ลิปสติก',    emoji: '💄' },
  { id: 'gloss',    name: 'ลิปกลอส',    emoji: '✨' },
  { id: 'balm',     name: 'ลิปบาล์ม',   emoji: '🧸' }
];

/* รูปที่มีอยู่ในโฟลเดอร์ assets/images/products (ให้แอดมินเลือกใช้ได้เลย) */
const PP_IMAGE_LIBRARY = [
  'p01-peach-ppoppo', 'p02-strawberry-milk', 'p03-cherry-coke', 'p04-mandarin-pop',
  'p05-rose-latte', 'p06-grape-jelly', 'p07-coral-sunset', 'p08-red-velvet',
  'p09-cotton-candy', 'p10-honey-nude', 'p11-watermelon-fizz', 'p12-choco-mousse'
].map(n => 'assets/images/products/' + n + '.svg');

window.PP_CATEGORIES = PP_CATEGORIES;
window.PP_IMAGE_LIBRARY = PP_IMAGE_LIBRARY;
