/* =============================================================
   app.js — ส่วนกลางที่ทุกหน้าใช้ร่วมกัน
   (ตะกร้าสินค้า, การแจ้งเตือน, การ์ดสินค้า, สั่งซื้อออนไลน์ → Supabase)
   ============================================================= */

const money = n => PP_CONFIG.currency(n);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------------------------------------------------- แจ้งเตือน */
function toast(msg, type = '') {
  let wrap = document.querySelector('.pp-toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'pp-toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = 'pp-toast ' + type;
  el.innerHTML = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(-20px)'; }, 2400);
  setTimeout(() => el.remove(), 2900);
}

/* ---------------------------------------------------- สถานะสต็อก */
function stockState(stock) {
  const s = Number(stock) || 0;
  if (s <= 0) return { key: 'out', label: 'สินค้าหมด', badge: 'badge-out' };
  if (s <= API.lowStockAt()) return { key: 'low', label: 'เหลือน้อย ' + s + ' ชิ้น', badge: 'badge-low' };
  return { key: 'ok', label: 'พร้อมส่ง ' + s + ' ชิ้น', badge: 'badge-ok' };
}

/* ---------------------------------------------------- การ์ดสินค้า */
function productCard(p) {
  const st = stockState(p.stock);
  const cat = (PP_CATEGORIES.find(c => c.id === p.category) || {}).name || p.category || '';
  const tag = st.key === 'out'
    ? '<span class="pp-tag soldout">SOLD OUT</span>'
    : st.key === 'low'
      ? '<span class="pp-tag low">ใกล้หมด</span>'
      : (p.oldPrice > p.price ? '<span class="pp-tag">SALE</span>' : (p.featured ? '<span class="pp-tag">BEST</span>' : ''));

  return `
  <div class="col-6 col-md-4 col-lg-3">
    <article class="product-card reveal">
      <div class="product-thumb">
        ${tag}
        <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"
             onerror="this.src='assets/images/placeholder.svg'">
      </div>
      <div class="product-body">
        <div class="d-flex align-items-center gap-2">
          <span class="swatch" style="background:${esc(p.shade || '#eee')}"></span>
          <span class="product-code">${esc(p.code || p.id)} · ${esc(cat)}</span>
        </div>
        <h3 class="product-name">${esc(p.name)}</h3>
        <p class="product-desc">${esc((p.desc || '').slice(0, 78))}${(p.desc || '').length > 78 ? '…' : ''}</p>
        <div class="stock-line">${st.label}</div>
        <div class="d-flex align-items-center justify-content-between gap-2 mt-1">
          <div class="product-price">${money(p.price)}${p.oldPrice > p.price ? `<s>${money(p.oldPrice)}</s>` : ''}</div>
          <button class="btn btn-pp btn-sm px-3" ${st.key === 'out' ? 'disabled' : ''}
                  onclick="addToCart('${esc(p.id)}')">${st.key === 'out' ? 'หมด' : 'ใส่ตะกร้า'}</button>
        </div>
      </div>
    </article>
  </div>`;
}

/* ---------------------------------------------------- ตะกร้าสินค้า */
let PP_PRODUCTS_CACHE = [];

function cartCount() { return API.getCart().reduce((s, i) => s + i.qty, 0); }
function cartSubtotal() { return API.getCart().reduce((s, i) => s + i.price * i.qty, 0); }
function shippingOf(sub) { return (sub === 0 || sub >= API.freeShippingAt()) ? 0 : API.shippingFee(); }

function updateCartBadge() {
  const n = cartCount();
  document.querySelectorAll('.cart-badge').forEach(b => {
    b.textContent = n;
    b.style.display = n ? '' : 'none';
  });
}

function addToCart(id) {
  const p = PP_PRODUCTS_CACHE.find(x => x.id === id);
  if (!p) return;
  if ((Number(p.stock) || 0) <= 0) { toast('สินค้าชิ้นนี้หมดชั่วคราว 🥲', 'err'); return; }

  const cart = API.getCart();
  const line = cart.find(x => x.id === id);
  if (line) {
    if (line.qty + 1 > p.stock) { toast('มีสินค้าในสต็อกแค่ ' + p.stock + ' ชิ้นค่ะ', 'err'); return; }
    line.qty++;
  } else {
    cart.push({ id: p.id, code: p.code, name: p.name, price: p.price, image: p.image, shade: p.shade, qty: 1 });
  }
  API.setCart(cart);
  updateCartBadge();
  renderCart();
  toast('เพิ่ม <b>' + esc(p.name) + '</b> ลงตะกร้าแล้ว 💕', 'ok');
}

function changeQty(id, delta) {
  const cart = API.getCart();
  const line = cart.find(x => x.id === id);
  if (!line) return;
  const p = PP_PRODUCTS_CACHE.find(x => x.id === id);
  const max = p ? Number(p.stock) || 0 : 99;
  line.qty += delta;
  if (line.qty > max) { line.qty = max; toast('มีในสต็อกแค่ ' + max + ' ชิ้นค่ะ', 'err'); }
  if (line.qty <= 0) API.setCart(cart.filter(x => x.id !== id));
  else API.setCart(cart);
  updateCartBadge();
  renderCart();
}

function removeLine(id) {
  API.setCart(API.getCart().filter(x => x.id !== id));
  updateCartBadge();
  renderCart();
}

function renderCart() {
  const box = document.getElementById('cartItems');
  if (!box) return;
  const cart = API.getCart();

  if (!cart.length) {
    box.innerHTML = `<div class="text-center py-5">
        <div style="font-size:3rem">🧺</div>
        <p class="text-muted-pp mt-2 mb-3">ตะกร้ายังว่างอยู่เลย</p>
        <a href="products.html" class="btn btn-pp-outline btn-sm">ไปเลือกลิปกัน</a>
      </div>`;
  } else {
    box.innerHTML = cart.map(i => `
      <div class="cart-item">
        <img src="${esc(i.image)}" alt="${esc(i.name)}">
        <div class="flex-grow-1">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <div style="font-weight:500">${esc(i.name)}</div>
              <div class="product-code">${esc(i.code || i.id)}</div>
            </div>
            <button class="btn btn-sm p-0 text-muted-pp" onclick="removeLine('${esc(i.id)}')" title="ลบ">✕</button>
          </div>
          <div class="d-flex justify-content-between align-items-center mt-2">
            <div class="d-flex align-items-center gap-2">
              <button class="qty-btn" onclick="changeQty('${esc(i.id)}',-1)">−</button>
              <span style="min-width:22px;text-align:center">${i.qty}</span>
              <button class="qty-btn" onclick="changeQty('${esc(i.id)}',1)">+</button>
            </div>
            <strong class="text-pp">${money(i.price * i.qty)}</strong>
          </div>
        </div>
      </div>`).join('');
  }

  const sub = cartSubtotal(), ship = shippingOf(sub);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('cartSubtotal', money(sub));
  set('cartShipping', ship === 0 ? 'ฟรี' : money(ship));
  set('cartTotal', money(sub + ship));

  const note = document.getElementById('cartFreeNote');
  if (note) {
    const left = API.freeShippingAt() - sub;
    note.innerHTML = (sub > 0 && left > 0)
      ? `ซื้อเพิ่มอีก <b class="text-pp">${money(left)}</b> ส่งฟรีทันที 🚚`
      : (sub > 0 ? 'ออเดอร์นี้ได้ส่งฟรีแล้ว 🎉' : '');
  }

  const btn = document.getElementById('btnCheckout');
  if (btn) btn.disabled = !cart.length;
}

/* ---------------------------------------------------- checkout (prototype) */
/** ปิดตะกร้าก่อน แล้วค่อยเปิดฟอร์มสั่งซื้อ (กัน backdrop ซ้อนกัน) */
function openCheckout() {
  const el = document.getElementById('cartCanvas');
  const show = () => bootstrap.Modal.getOrCreateInstance(document.getElementById('checkoutModal')).show();
  const oc = bootstrap.Offcanvas.getInstance(el);
  if (oc && el.classList.contains('show')) {
    el.addEventListener('hidden.bs.offcanvas', show, { once: true });
    oc.hide();
  } else {
    show();
  }
}

async function submitOrder(e) {
  e.preventDefault();
  const f = e.target;
  const cart = API.getCart();
  if (!cart.length) return;

  const sub = cartSubtotal(), ship = shippingOf(sub);
  const order = {
    customer: {
      name: f.custName.value.trim(),
      phone: f.custPhone.value.trim(),
      address: f.custAddress.value.trim(),
      note: f.custNote.value.trim()
    },
    items: cart.map(i => ({ id: i.id, code: i.code, name: i.name, price: i.price, qty: i.qty })),
    itemCount: cart.reduce((s, i) => s + i.qty, 0),
    subtotal: sub, shipping: ship, total: sub + ship,
    payment: f.payMethod.value,
    promoCode: (f.promoCode?.value || '').trim()
  };

  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.innerHTML = 'กำลังบันทึก…';

  try {
    /* ราคา/ส่วนลด/ค่าส่ง คำนวณจริงที่ฝั่ง Database (create_sale) */
    const saved = await API.createOrder(order);
    API.clearCart();
    updateCartBadge();
    renderCart();

    bootstrap.Modal.getInstance(document.getElementById('checkoutModal'))?.hide();
    document.getElementById('thanksOrderId').textContent = saved.sale_no || saved.id;
    document.getElementById('thanksName').textContent = order.customer.name || 'คุณลูกค้า';
    document.getElementById('thanksTotal').textContent = money(saved.total ?? order.total);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('thanksModal')).show();

    PP_PRODUCTS_CACHE = await API.getProducts();
    document.dispatchEvent(new CustomEvent('pp:products-updated'));
    f.reset();
  } catch (err) {
    toast('บันทึกออเดอร์ไม่สำเร็จ: ' + esc(err.message), 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'ยืนยันการสั่งซื้อ';
  }
}

/* ---------------------------------------------------- UI ตะกร้า + modal */
function mountCartUI() {
  if (document.getElementById('cartCanvas')) return;
  document.body.insertAdjacentHTML('beforeend', `
  <!-- ตะกร้าสินค้า -->
  <div class="offcanvas offcanvas-end" tabindex="-1" id="cartCanvas" style="max-width:100%;width:400px">
    <div class="offcanvas-header border-bottom">
      <h5 class="offcanvas-title">ตะกร้าของฉัน 🛍️</h5>
      <button type="button" class="btn-close" data-bs-dismiss="offcanvas"></button>
    </div>
    <div class="offcanvas-body d-flex flex-column">
      <div id="cartItems" class="flex-grow-1"></div>
      <div class="border-top pt-3 mt-2">
        <div id="cartFreeNote" class="small text-muted-pp mb-2"></div>
        <div class="d-flex justify-content-between small mb-1"><span>ยอดสินค้า</span><span id="cartSubtotal">฿0</span></div>
        <div class="d-flex justify-content-between small mb-2"><span>ค่าจัดส่ง</span><span id="cartShipping">ฟรี</span></div>
        <div class="d-flex justify-content-between mb-3">
          <strong>รวมทั้งหมด</strong><strong class="text-pp fs-5" id="cartTotal">฿0</strong>
        </div>
        <button class="btn btn-pp w-100" id="btnCheckout" onclick="openCheckout()" disabled>สั่งซื้อเลย</button>
      </div>
    </div>
  </div>

  <!-- ฟอร์มสั่งซื้อ -->
  <div class="modal fade" id="checkoutModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content" style="border-radius:26px;border:0">
        <form onsubmit="submitOrder(event)">
          <div class="modal-header border-0 pb-0">
            <div>
              <h5 class="modal-title mb-1">ข้อมูลจัดส่ง</h5>
              <p class="small text-muted-pp mb-0">สั่งแล้วทีมงานจะติดต่อยืนยันและแจ้งช่องทางชำระเงินให้ค่ะ</p>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">ชื่อ-นามสกุล *</label>
                <input class="form-control" name="custName" required placeholder="เช่น มินตรา ใจดี">
              </div>
              <div class="col-md-6">
                <label class="form-label">เบอร์โทร *</label>
                <input class="form-control" name="custPhone" required placeholder="08x-xxx-xxxx"
                       pattern="[0-9\\-\\s\\+]{9,15}">
              </div>
              <div class="col-12">
                <label class="form-label">ที่อยู่จัดส่ง *</label>
                <textarea class="form-control" name="custAddress" rows="2" required
                          placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"></textarea>
              </div>
              <div class="col-md-6">
                <label class="form-label">ช่องทางชำระเงิน</label>
                <select class="form-select" name="payMethod">
                  <option>โอนผ่านพร้อมเพย์</option>
                  <option>บัตรเครดิต/เดบิต</option>
                  <option>เก็บเงินปลายทาง</option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">โค้ดส่วนลด</label>
                <input class="form-control text-uppercase" name="promoCode" placeholder="เช่น WELCOME10">
              </div>
              <div class="col-12">
                <label class="form-label">หมายเหตุ</label>
                <input class="form-control" name="custNote" placeholder="เช่น ห่อของขวัญ">
              </div>
            </div>
          </div>
          <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-ghost" data-bs-dismiss="modal">ยกเลิก</button>
            <button type="submit" class="btn btn-pp px-4">ยืนยันการสั่งซื้อ</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- ขอบคุณ -->
  <div class="modal fade" id="thanksModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content text-center p-4" style="border-radius:28px;border:0">
        <div class="modal-body">
          <div class="thanks-emoji">💋</div>
          <h4 class="mt-2 mb-1">ขอบคุณมากค่ะ <span id="thanksName"></span>!</h4>
          <p class="text-muted-pp mb-3">เราได้รับคำสั่งซื้อของคุณเรียบร้อยแล้ว<br>ทีมงาน ppoppo จะติดต่อกลับเพื่อยืนยันภายใน 24 ชม.</p>
          <div class="d-inline-block text-start bg-cream-2 rounded-4 px-4 py-3 mb-3">
            <div class="small text-muted-pp">เลขที่คำสั่งซื้อ</div>
            <div class="fw-bold" id="thanksOrderId"></div>
            <div class="small text-muted-pp mt-2">ยอดรวม</div>
            <div class="fw-bold text-pp" id="thanksTotal"></div>
          </div>
          <div><button class="btn btn-pp px-4" data-bs-dismiss="modal">เลือกซื้อต่อ</button></div>
        </div>
      </div>
    </div>
  </div>`);
}

/* ---------------------------------------------------- navbar ร่วม */
function mountNav(active) {
  const el = document.getElementById('ppNav');
  if (!el) return;
  const s = API.session();
  const link = (href, label, key) =>
    `<li class="nav-item"><a class="nav-link ${active === key ? 'active' : ''}" href="${href}">${label}</a></li>`;

  el.innerHTML = `
  <nav class="navbar navbar-expand-lg pp-nav fixed-top">
    <div class="container">
      <a class="navbar-brand" href="index.html"><img src="assets/images/logo.svg" alt="ppoppo"></a>
      <button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#navMenu">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navMenu">
        <ul class="navbar-nav mx-auto">
          ${link('index.html', 'หน้าแรก', 'home')}
          ${link('products.html', 'สินค้าทั้งหมด', 'products')}
          ${link('index.html#shades', 'เฉดสี', '')}
          ${link('index.html#about', 'เกี่ยวกับเรา', '')}
        </ul>
        <div class="d-flex align-items-center gap-2">
          <a href="${s ? (s.role === 'admin' ? 'admin.html' : 'pos.html') : 'login.html'}" class="btn btn-ghost btn-sm">
            ${s ? (s.role === 'admin' ? '⚙️ หลังบ้าน' : '🧾 หน้าขาย POS') : '🔑 พนักงาน'}
          </a>
          <button class="btn btn-pp btn-sm cart-btn" data-bs-toggle="offcanvas" data-bs-target="#cartCanvas">
            🛍️ ตะกร้า <span class="cart-badge">0</span>
          </button>
        </div>
      </div>
    </div>
  </nav>`;
}

/* ---------------------------------------------------- footer ร่วม */
function mountFooter() {
  const el = document.getElementById('ppFooter');
  if (!el) return;
  el.innerHTML = `
  <footer class="pp-footer">
    <div class="container">
      <div class="row g-4">
        <div class="col-lg-4">
          <img src="assets/images/logo.svg" alt="ppoppo" style="height:56px">
          <p class="text-muted-pp small mt-3 mb-0" style="max-width:300px">
            ${esc(PP_CONFIG.tagline)} — ลิปสไตล์เกาหลีที่คิด ทดสอบ และผลิตในไทย
            ปลอดพาราเบน ไม่ทดลองกับสัตว์
          </p>
        </div>
        <div class="col-6 col-lg-2">
          <h6 class="mb-3">ช้อป</h6>
          <div class="d-flex flex-column gap-2">
            <a href="products.html">สินค้าทั้งหมด</a>
            <a href="products.html?cat=tint">ลิปทินท์</a>
            <a href="products.html?cat=lipstick">ลิปสติก</a>
            <a href="products.html?cat=gloss">ลิปกลอส</a>
            <a href="products.html?cat=balm">ลิปบาล์ม</a>
          </div>
        </div>
        <div class="col-6 col-lg-2">
          <h6 class="mb-3">ช่วยเหลือ</h6>
          <div class="d-flex flex-column gap-2">
            <a href="#">วิธีสั่งซื้อ</a>
            <a href="#">การจัดส่ง</a>
            <a href="#">คืนสินค้า</a>
            <a href="login.html">สำหรับพนักงาน</a>
          </div>
        </div>
        <div class="col-lg-4">
          <h6 class="mb-3">รับส่วนลด 10% ครั้งแรก</h6>
          <form class="d-flex gap-2" onsubmit="event.preventDefault();this.reset();toast('สมัครรับข่าวสารเรียบร้อย 💌','ok')">
            <input class="form-control" type="email" placeholder="อีเมลของคุณ" required>
            <button class="btn btn-pp px-3">สมัคร</button>
          </form>
          <div class="d-flex gap-3 mt-3 small">
            <a href="#">Instagram</a><a href="#">TikTok</a><a href="#">Line OA</a><a href="#">Shopee</a>
          </div>
        </div>
      </div>
      <hr class="my-4" style="border-color:var(--pp-line)">
      <div class="d-flex flex-wrap justify-content-between gap-2 small text-muted-pp">
        <span>© ${new Date().getFullYear()} ppoppo Korean Lip Studio · เว็บไซต์ตัวอย่างเพื่อการสาธิต</span>
        <span>ระบบ POS · ข้อมูลเก็บบน <b>Supabase</b></span>
      </div>
    </div>
  </footer>`;
}

/* ---------------------------------------------------- reveal on scroll */
function initReveal() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); } });
  }, { threshold: .12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
}

window.toast = toast;
window.money = money;
window.esc = esc;
window.addToCart = addToCart;
window.changeQty = changeQty;
window.removeLine = removeLine;
window.submitOrder = submitOrder;
window.openCheckout = openCheckout;
window.productCard = productCard;
window.stockState = stockState;
window.initReveal = initReveal;
window.mountNav = mountNav;
window.mountFooter = mountFooter;
window.mountCartUI = mountCartUI;
window.renderCart = renderCart;
window.updateCartBadge = updateCartBadge;
