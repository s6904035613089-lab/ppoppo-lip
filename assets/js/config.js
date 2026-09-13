/* =============================================================
   config.js — ตั้งค่าหลักของเว็บไซต์ / ระบบ POS
   ============================================================= */

const PP_CONFIG = {
  brand: 'ppoppo',
  tagline: 'จูบแรกของริมฝีปากคุณ',
  taglineEn: "Your lips' first kiss",

  /* -----------------------------------------------------------
     Supabase — เอาค่าจาก Dashboard → Project Settings → API
       SUPABASE_URL      = Project URL   (https://xxxx.supabase.co)
       SUPABASE_ANON_KEY = anon public key
     anon key เปิดเผยได้ (ถูกออกแบบมาให้ใช้ฝั่ง browser)
     ความปลอดภัยอยู่ที่ Row Level Security ใน supabase/schema.sql
     ----------------------------------------------------------- */
  SUPABASE_URL: 'https://mbqhzvhfycafnsobbshk.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_ne7e4_f4zn1DW2u1xnWwpw_pDvZTQ_o',

  /* ค่าเริ่มต้น (ถ้าในตาราง settings ไม่มี จะใช้ค่านี้) */
  shippingFee: 50,
  freeShippingAt: 690,
  lowStockAt: 10,

  /* ช่องทางชำระเงินที่ POS รองรับ */
  paymentMethods: [
    { id: 'cash',      name: 'เงินสด',        emoji: '💵' },
    { id: 'promptpay', name: 'พร้อมเพย์',      emoji: '📱' },
    { id: 'transfer',  name: 'โอนธนาคาร',     emoji: '🏦' },
    { id: 'card',      name: 'บัตรเครดิต/เดบิต', emoji: '💳' }
  ],

  /* สถานะบิล (ค่าใน DB → ป้ายภาษาไทย) */
  saleStatus: {
    pending:   { label: 'รอชำระ',     badge: 'badge-new' },
    paid:      { label: 'ชำระแล้ว',   badge: 'badge-ok' },
    shipped:   { label: 'จัดส่งแล้ว', badge: 'badge-new' },
    completed: { label: 'สำเร็จ',     badge: 'badge-ok' },
    cancelled: { label: 'ยกเลิก',     badge: 'badge-out' },
    refunded:  { label: 'คืนเงิน',    badge: 'badge-low' }
  },

  currency: (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
};

window.PP_CONFIG = PP_CONFIG;
