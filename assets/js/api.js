/* =============================================================
   api.js — ชั้นเชื่อมข้อมูล (Data layer) → Supabase

   ทุกหน้าเรียก `await API.init()` ก่อนใช้งาน
   - ข้อมูลสินค้า/บิล/ลูกค้า/สต็อก อยู่ใน Postgres ของ Supabase
   - ล็อกอินพนักงานใช้ Supabase Auth (อีเมล + รหัสผ่าน)
   - ตะกร้าหน้าร้านเก็บใน localStorage ของเบราว์เซอร์ (ยังไม่ใช่ออเดอร์)
   ============================================================= */

const PP_KEYS = { cart: 'ppoppo_cart', shift: 'ppoppo_shift' };

/* ---------------------------------------------------- safe storage */
const Store = {
  _mem: {},
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : (this._mem[key] !== undefined ? this._mem[key] : fallback);
    } catch (e) { return this._mem[key] !== undefined ? this._mem[key] : fallback; }
  },
  set(key, val) {
    this._mem[key] = val;
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
    return val;
  },
  del(key) { delete this._mem[key]; try { localStorage.removeItem(key); } catch (e) {} }
};

/* ---------------------------------------------------- แปลงแถว DB ↔ object ที่หน้าเว็บใช้ */
const toProduct = r => r && ({
  id: r.id, code: r.code, barcode: r.barcode || '', name: r.name,
  category: r.category_id, shade: r.shade,
  price: Number(r.price) || 0, cost: Number(r.cost) || 0, oldPrice: Number(r.old_price) || 0,
  stock: Number(r.stock) || 0, image: r.image_url || 'assets/images/placeholder.svg',
  desc: r.description || '', featured: !!r.featured, active: r.active !== false,
  createdAt: r.created_at, updatedAt: r.updated_at
});

const fromProduct = p => ({
  code: String(p.code || '').trim(),
  barcode: String(p.barcode || '').trim() || null,
  name: String(p.name || '').trim(),
  category_id: p.category || null,
  shade: p.shade || '#F2879C',
  price: Number(p.price) || 0,
  cost: Number(p.cost) || 0,
  old_price: Number(p.oldPrice) || 0,
  image_url: p.image || '',
  description: p.desc || '',
  featured: !!p.featured,
  active: p.active !== false
});

/** โยน error ภาษาคนอ่านได้ */
function must({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

/* =============================================================
   API
   ============================================================= */
const API = {
  sb: null,
  _user: null,      // auth user
  _staff: null,     // แถวในตาราง staff
  _settings: {},
  _categories: [],
  _ready: null,

  isConfigured() {
    return !!(PP_CONFIG.SUPABASE_URL && PP_CONFIG.SUPABASE_ANON_KEY && window.supabase);
  },

  /** ต้องเรียกครั้งแรกในทุกหน้า */
  init() {
    if (this._ready) return this._ready;
    this._ready = (async () => {
      if (!this.isConfigured()) { this._showSetupBanner(); return this; }
      this.sb = window.supabase.createClient(PP_CONFIG.SUPABASE_URL, PP_CONFIG.SUPABASE_ANON_KEY);
      const { data } = await this.sb.auth.getSession();
      this._user = data?.session?.user || null;
      await Promise.all([this._loadStaff(), this._loadSettings(), this._loadCategories()]);
      this.sb.auth.onAuthStateChange((_ev, session) => {
        this._user = session?.user || null;
        if (!this._user) this._staff = null;
      });
      return this;
    })();
    return this._ready;
  },

  _showSetupBanner() {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.insertAdjacentHTML('afterbegin', `
        <div style="position:fixed;top:0;left:0;right:0;z-index:2000;background:#3f2e34;color:#fff;padding:10px 16px;font-size:.88rem;text-align:center">
          ⚠️ ยังไม่ได้ตั้งค่า Supabase — ใส่ <code>SUPABASE_URL</code> และ <code>SUPABASE_ANON_KEY</code> ใน
          <code>assets/js/config.js</code> แล้วรัน <code>supabase/schema.sql</code> (อ่านวิธีที่ <code>supabase/README.md</code>)
        </div>`);
    });
  },

  async _loadStaff() {
    if (!this._user) { this._staff = null; return; }
    const { data } = await this.sb.from('staff').select('*').eq('id', this._user.id).maybeSingle();
    this._staff = data || null;
  },

  async _loadSettings() {
    const { data } = await this.sb.from('settings').select('key,value');
    const s = {};
    (data || []).forEach(r => { s[r.key] = r.value; });
    this._settings = s;
  },

  async _loadCategories() {
    const { data } = await this.sb.from('categories').select('*').order('sort_order');
    this._categories = data || [];
    /* แทนที่หมวดหมู่สำรองใน data.js แบบ in-place ให้ทุกหน้าเห็นชุดเดียวกัน */
    if (this._categories.length && Array.isArray(window.PP_CATEGORIES)) {
      window.PP_CATEGORIES.splice(0, window.PP_CATEGORIES.length, ...this._categories);
    }
  },

  /* ---------------------------------------------------- settings */
  setting(key, fallback) {
    const v = this._settings[key];
    return v === undefined || v === null ? fallback : v;
  },
  shippingFee()    { return Number(this.setting('shipping_fee', PP_CONFIG.shippingFee)); },
  freeShippingAt() { return Number(this.setting('free_shipping_at', PP_CONFIG.freeShippingAt)); },
  lowStockAt()     { return Number(this.setting('low_stock_at', PP_CONFIG.lowStockAt)); },
  async saveSettings(obj) {
    const rows = Object.entries(obj).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
    must(await this.sb.from('settings').upsert(rows));
    await this._loadSettings();
  },

  /* ---------------------------------------------------- สินค้า */
  categories() { return this._categories; },

  async getProducts({ includeInactive = false } = {}) {
    if (!this.sb) return [];
    let q = this.sb.from('products').select('*').order('code');
    if (!includeInactive) q = q.eq('active', true);
    return must(await q).map(toProduct);
  },

  async saveProduct(product) {
    const row = fromProduct(product);
    if (!row.code) row.code = 'P' + Date.now().toString(36).toUpperCase().slice(-5);
    if (product.id) {
      return toProduct(must(await this.sb.from('products').update(row).eq('id', product.id).select().single()));
    }
    /* สินค้าใหม่: สร้างด้วยสต็อก 0 แล้วรับเข้าผ่าน movement เพื่อให้ประวัติสต็อกครบ */
    const saved = toProduct(must(await this.sb.from('products').insert({ ...row, stock: 0 }).select().single()));
    const initial = Number(product.stock) || 0;
    if (initial > 0) return this.adjustStock(saved.id, initial, 'purchase', 'สต็อกตั้งต้น');
    return saved;
  },

  async deleteProduct(id) { must(await this.sb.from('products').delete().eq('id', id)); return { id }; },

  async adjustStock(id, delta, type = 'adjust', note = '') {
    return toProduct(must(await this.sb.rpc('adjust_stock', { p_product_id: id, p_delta: Number(delta), p_type: type, p_note: note })));
  },
  async setStock(id, stock, note = 'ตั้งค่าสต็อก') {
    return toProduct(must(await this.sb.rpc('set_stock', { p_product_id: id, p_stock: Number(stock), p_note: note })));
  },
  async getStockMovements({ productId = null, limit = 100 } = {}) {
    let q = this.sb.from('stock_movements')
      .select('*, products(code,name), staff(full_name)')
      .order('created_at', { ascending: false }).limit(limit);
    if (productId) q = q.eq('product_id', productId);
    return must(await q);
  },

  /** อัปโหลดรูปสินค้าเข้า Supabase Storage แล้วคืน public URL */
  async uploadImage(blob, filename) {
    const ext = (filename.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6) + '.' + ext;
    must(await this.sb.storage.from('product-images').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false }));
    return this.sb.storage.from('product-images').getPublicUrl(path).data.publicUrl;
  },

  /* ---------------------------------------------------- ขาย */
  /** หน้าร้านออนไลน์ (ลูกค้าสั่งเอง) */
  async createOrder(order) {
    const payload = {
      channel: 'online',
      customer: order.customer,
      items: order.items.map(i => ({ product_id: i.id, qty: i.qty })),
      promotion_code: order.promoCode || null,
      note: [order.customer?.note, 'ชำระโดย: ' + (order.payment || '-')].filter(Boolean).join(' · ')
    };
    const s = must(await this.sb.rpc('create_sale', { payload }));
    return { ...s, id: s.sale_no, dbId: s.id };
  },

  /** หน้า POS (พนักงาน) */
  async createSale(payload) {
    return must(await this.sb.rpc('create_sale', { payload: { channel: 'pos', ...payload } }));
  },

  async getSale(id) { return must(await this.sb.rpc('get_sale', { p_id: id })); },

  async getSales({ from = null, to = null, status = null, channel = null, q = '', limit = 200 } = {}) {
    let s = this.sb.from('sales').select('*, staff(full_name)').order('created_at', { ascending: false }).limit(limit);
    if (from) s = s.gte('created_at', from);
    if (to) s = s.lte('created_at', to);
    if (status) s = s.eq('status', status);
    if (channel) s = s.eq('channel', channel);
    if (q) s = s.or(`sale_no.ilike.%${q}%,customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%`);
    return must(await s);
  },

  async getSaleItems(saleId) {
    return must(await this.sb.from('sale_items').select('*').eq('sale_id', saleId).order('product_code'));
  },

  async updateSaleStatus(id, status) {
    return must(await this.sb.from('sales').update({ status }).eq('id', id).select().single());
  },

  /* ---------------------------------------------------- ลูกค้า */
  async getCustomers(q = '', limit = 200) {
    let s = this.sb.from('customers').select('*').order('updated_at', { ascending: false }).limit(limit);
    if (q) s = s.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
    return must(await s);
  },
  async findCustomerByPhone(phone) {
    return must(await this.sb.from('customers').select('*').eq('phone', String(phone).trim()).maybeSingle());
  },
  async saveCustomer(c) {
    const row = { name: String(c.name || '').trim(), phone: String(c.phone || '').trim() || null,
                  email: String(c.email || '').trim() || null, address: c.address || '', note: c.note || '' };
    if (c.id) return must(await this.sb.from('customers').update(row).eq('id', c.id).select().single());
    return must(await this.sb.from('customers').insert(row).select().single());
  },
  async deleteCustomer(id) { must(await this.sb.from('customers').delete().eq('id', id)); },
  async getCustomerSales(customerId) {
    return must(await this.sb.from('sales').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(50));
  },

  /* ---------------------------------------------------- โปรโมชัน */
  async getPromotions() { return must(await this.sb.from('promotions').select('*').order('created_at', { ascending: false })); },
  async savePromotion(p) {
    const row = {
      code: String(p.code || '').trim().toUpperCase(), name: p.name || '', type: p.type || 'percent',
      value: Number(p.value) || 0, min_subtotal: Number(p.min_subtotal) || 0,
      max_discount: p.max_discount === '' || p.max_discount == null ? null : Number(p.max_discount),
      starts_at: p.starts_at || null, ends_at: p.ends_at || null,
      usage_limit: p.usage_limit === '' || p.usage_limit == null ? null : Number(p.usage_limit),
      active: p.active !== false
    };
    if (p.id) return must(await this.sb.from('promotions').update(row).eq('id', p.id).select().single());
    return must(await this.sb.from('promotions').insert(row).select().single());
  },
  async deletePromotion(id) { must(await this.sb.from('promotions').delete().eq('id', id)); },
  async checkPromotion(code, subtotal) {
    return must(await this.sb.rpc('check_promotion', { p_code: code, p_subtotal: Number(subtotal) || 0 }));
  },

  /* ---------------------------------------------------- กะ */
  async getOpenShift() {
    return must(await this.sb.from('shifts').select('*, opened:staff!shifts_opened_by_fkey(full_name)')
      .eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle());
  },
  async openShift(openingCash, note = '') {
    return must(await this.sb.rpc('open_shift', { p_opening_cash: Number(openingCash) || 0, p_note: note }));
  },
  async closeShift(id, closingCash, note = '') {
    return must(await this.sb.rpc('close_shift', { p_shift_id: id, p_closing_cash: Number(closingCash) || 0, p_note: note }));
  },
  async getShifts(limit = 60) {
    return must(await this.sb.from('shifts')
      .select('*, opened:staff!shifts_opened_by_fkey(full_name), closed:staff!shifts_closed_by_fkey(full_name)')
      .order('opened_at', { ascending: false }).limit(limit));
  },

  /* ---------------------------------------------------- พนักงาน */
  async getStaff() { return must(await this.sb.from('staff').select('*').order('created_at')); },
  async updateStaff(id, patch) { return must(await this.sb.from('staff').update(patch).eq('id', id).select().single()); },

  /* ---------------------------------------------------- รายงาน */
  async getDailySales(days = 30) {
    const from = new Date(); from.setDate(from.getDate() - days);
    return must(await this.sb.from('v_daily_sales').select('*').gte('day', from.toISOString().slice(0, 10)).order('day'));
  },
  async getTopProducts(limit = 8) {
    return must(await this.sb.from('v_product_sales').select('*').order('qty_sold', { ascending: false }).limit(limit));
  },

  /* ---------------------------------------------------- ผู้ใช้ / login */
  async login(email, password) {
    if (!this.sb) throw new Error('ยังไม่ได้ตั้งค่า Supabase (ดู supabase/README.md)');
    const data = must(await this.sb.auth.signInWithPassword({ email: String(email).trim(), password }));
    this._user = data.user;
    await this._loadStaff();
    if (!this._staff || !this._staff.active) {
      await this.sb.auth.signOut(); this._user = null; this._staff = null;
      throw new Error('บัญชีนี้ยังไม่ได้รับสิทธิ์พนักงาน หรือถูกปิดใช้งาน');
    }
    return this.session();
  },
  async logout() { if (this.sb) await this.sb.auth.signOut(); this._user = null; this._staff = null; },

  /** ข้อมูลผู้ใช้ที่ล็อกอิน (หลัง init แล้วเรียกได้ทันที) */
  session() {
    if (!this._user || !this._staff) return null;
    return { id: this._user.id, email: this._user.email, name: this._staff.full_name || this._user.email, role: this._staff.role };
  },
  isAdmin() { return this.session()?.role === 'admin'; },
  requireStaff(next = 'pos') {
    const s = this.session();
    if (!s) { location.href = 'login.html?next=' + next; return null; }
    return s;
  },
  requireAdmin() {
    const s = this.requireStaff('admin');
    if (s && s.role !== 'admin') { location.href = 'pos.html'; return null; }
    return s;
  },

  /* ---------------------------------------------------- ตะกร้า (หน้าร้าน) */
  getCart() { return Store.get(PP_KEYS.cart, []); },
  setCart(items) { return Store.set(PP_KEYS.cart, items); },
  clearCart() { Store.set(PP_KEYS.cart, []); }
};

window.API = API;
window.PP_KEYS = PP_KEYS;
