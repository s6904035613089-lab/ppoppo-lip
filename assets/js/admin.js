/* =============================================================
   admin.js — หลังบ้านระบบ POS
   ภาพรวม · บิลขาย · สินค้า · คลัง · ลูกค้า · โปรโมชัน · กะ · พนักงาน · ตั้งค่า
   ============================================================= */

let A_PRODUCTS = [];
let A_SALES = [];
let A_TAB = 'dash';
let A_FILTER = { range: 'today', status: '', channel: '', q: '' };

/* ---------------------------------------------------- โหลด */
async function adminLoad() {
  try {
    A_PRODUCTS = await API.getProducts({ includeInactive: true });
  } catch (e) { toast('โหลดสินค้าไม่สำเร็จ: ' + esc(e.message), 'err'); }
  render();
}

function go(tab) {
  A_TAB = tab;
  document.querySelectorAll('.admin-side .nav-link').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  render();
}

async function render() {
  const views = {
    dash: viewDash, sales: viewSales, products: viewProducts, stock: viewStock, customers: viewCustomers,
    promotions: viewPromotions, shifts: viewShifts, staff: viewStaff, settings: viewSettings
  };
  const el = document.getElementById('adminView');
  el.innerHTML = '<div class="text-center py-5 text-muted-pp">กำลังโหลด…</div>';
  try { el.innerHTML = await (views[A_TAB] || viewDash)(); }
  catch (e) { el.innerHTML = `<div class="alert alert-danger">โหลดไม่สำเร็จ: ${esc(e.message)}</div>`; }
}

const statusBadge = s => { const st = PP_CONFIG.saleStatus[s] || { label: s, badge: 'badge-new' }; return `<span class="badge-pp ${st.badge}">${st.label}</span>`; };
const catName = id => (PP_CATEGORIES.find(c => c.id === id) || {}).name || id || '-';
const dayStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const localISODate = d => { const x = new Date(d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };

function rangeToDates(range) {
  const now = new Date(), from = dayStart(now);
  if (range === 'week') from.setDate(from.getDate() - 6);
  if (range === 'month') from.setDate(1);
  if (range === 'all') return { from: null, to: null };
  return { from: from.toISOString(), to: null };
}

function statCard(ico, val, lbl, sub = '') {
  return `<div class="col-6 col-lg-3"><div class="stat-card">
    <div style="font-size:1.5rem">${ico}</div>
    <div class="val">${val}</div>
    <div class="lbl">${lbl}${sub ? ' · ' + sub : ''}</div>
  </div></div>`;
}

/* =============================================================
   ภาพรวม
   ============================================================= */
async function viewDash() {
  const [today, daily, top] = await Promise.all([
    API.getSales({ ...rangeToDates('today'), limit: 500 }),
    API.getDailySales(14),
    API.getTopProducts(6)
  ]);
  const live = today.filter(s => !['cancelled', 'refunded'].includes(s.status));
  const revenue = live.reduce((s, o) => s + Number(o.total), 0);
  const items = live.reduce((s, o) => s + Number(o.item_count), 0);
  const pendingOnline = today.filter(s => s.channel === 'online' && s.status === 'pending').length;
  const low = A_PRODUCTS.filter(p => p.active && p.stock <= API.lowStockAt());
  const stockValue = A_PRODUCTS.reduce((s, p) => s + p.stock * p.cost, 0);

  /* กราฟแท่งง่าย ๆ 14 วัน */
  const byDay = {};
  daily.forEach(r => { byDay[r.day] = (byDay[r.day] || 0) + Number(r.revenue); });
  const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(localISODate(d)); }
  const max = Math.max(1, ...days.map(d => byDay[d] || 0));
  const bars = days.map(d => `
    <div class="d-flex flex-column align-items-center justify-content-end" style="flex:1;height:120px" title="${d}: ${money(byDay[d] || 0)}">
      <div style="width:70%;height:${Math.round((byDay[d] || 0) / max * 100)}%;min-height:2px;background:linear-gradient(180deg,var(--pp-pink-soft),var(--pp-pink-deep));border-radius:6px 6px 2px 2px"></div>
      <div class="text-muted-pp" style="font-size:.62rem;margin-top:4px">${d.slice(8)}</div>
    </div>`).join('');

  return `
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    <div><h4 class="mb-1">ภาพรวมร้าน</h4><p class="text-muted-pp small mb-0">วันนี้ ${new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}</p></div>
    <a class="btn btn-pp" href="pos.html">🧾 เปิดหน้าขาย</a>
  </div>
  <div class="row g-3 mb-4">
    ${statCard('💰', money(revenue), 'ยอดขายวันนี้')}
    ${statCard('🧾', live.length, 'บิลวันนี้', items + ' ชิ้น')}
    ${statCard('🛒', pendingOnline, 'ออเดอร์ออนไลน์รอยืนยัน')}
    ${statCard('📦', money(stockValue), 'มูลค่าสต็อก (ต้นทุน)')}
  </div>
  <div class="row g-3">
    <div class="col-lg-7">
      <div class="panel mb-3">
        <h6 class="mb-3">ยอดขาย 14 วันล่าสุด</h6>
        <div class="d-flex gap-1">${bars}</div>
      </div>
      <div class="panel">
        <h6 class="mb-3">บิลล่าสุดวันนี้</h6>
        <div class="table-responsive"><table class="table align-middle mb-0">
          <thead><tr><th>เลขที่</th><th>ลูกค้า</th><th>ช่องทาง</th><th>ยอด</th><th>สถานะ</th><th>เวลา</th></tr></thead>
          <tbody>${today.slice(0, 8).map(o => `<tr style="cursor:pointer" onclick="openSale('${o.id}')">
            <td class="fw-semibold">${esc(o.sale_no)}</td><td>${esc(o.customer_name || 'ทั่วไป')}</td>
            <td class="small">${o.channel === 'pos' ? 'หน้าร้าน' : 'ออนไลน์'}</td>
            <td class="text-pp fw-semibold">${money(o.total)}</td><td>${statusBadge(o.status)}</td>
            <td class="small text-muted-pp">${fmtDateTime(o.created_at)}</td></tr>`).join('')
            || '<tr><td colspan="6" class="text-center text-muted-pp py-4">วันนี้ยังไม่มีบิล</td></tr>'}</tbody>
        </table></div>
      </div>
    </div>
    <div class="col-lg-5">
      <div class="panel mb-3">
        <h6 class="mb-3">🏆 สินค้าขายดี</h6>
        ${top.length ? top.map((t, i) => `
          <div class="d-flex align-items-center gap-2 py-1">
            <span class="text-muted-pp" style="width:20px">${i + 1}.</span>
            <span class="flex-grow-1">${esc(t.product_name)} <span class="product-code">${esc(t.product_code)}</span></span>
            <b>${t.qty_sold} ชิ้น</b>
          </div>`).join('') : '<div class="text-muted-pp small">ยังไม่มีข้อมูล</div>'}
      </div>
      <div class="panel">
        <h6 class="mb-1">⚠️ สินค้าใกล้หมด / หมด</h6>
        <p class="small text-muted-pp">เตือนเมื่อเหลือ ≤ ${API.lowStockAt()} ชิ้น</p>
        ${low.length ? low.map(p => `
          <div class="d-flex align-items-center gap-3 py-2 border-bottom" style="border-color:var(--pp-line)!important">
            <img class="thumb-sm" src="${esc(p.image)}" onerror="this.src='assets/images/placeholder.svg'">
            <div class="flex-grow-1"><div style="font-weight:500;font-size:.92rem">${esc(p.name)}</div><div class="product-code">${esc(p.code)}</div></div>
            <span class="badge-pp ${stockState(p.stock).badge}">${p.stock} ชิ้น</span>
            <button class="btn btn-ghost btn-sm" onclick="receiveStock('${p.id}')">รับเข้า</button>
          </div>`).join('') : '<div class="text-center text-muted-pp py-4">สต็อกทุกตัวยังสบายดี 🎉</div>'}
      </div>
    </div>
  </div>`;
}

/* =============================================================
   บิลขาย
   ============================================================= */
async function viewSales() {
  A_SALES = await API.getSales({ ...rangeToDates(A_FILTER.range), status: A_FILTER.status || null, channel: A_FILTER.channel || null, q: A_FILTER.q, limit: 500 });
  const live = A_SALES.filter(s => !['cancelled', 'refunded'].includes(s.status));
  const sum = live.reduce((s, o) => s + Number(o.total), 0);
  const opt = (v, l, cur) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`;

  return `
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    <div><h4 class="mb-1">บิลขาย</h4><p class="text-muted-pp small mb-0">${live.length} บิล · รวม <b class="text-pp">${money(sum)}</b></p></div>
    <button class="btn btn-ghost" onclick="exportSales()">⬇️ ดาวน์โหลด CSV</button>
  </div>
  <div class="panel mb-3">
    <div class="row g-2 align-items-end">
      <div class="col-6 col-md-2"><label class="form-label small">ช่วงเวลา</label>
        <select class="form-select form-select-sm" onchange="setFilter('range',this.value)">
          ${opt('today', 'วันนี้', A_FILTER.range)}${opt('week', '7 วัน', A_FILTER.range)}${opt('month', 'เดือนนี้', A_FILTER.range)}${opt('all', 'ทั้งหมด', A_FILTER.range)}
        </select></div>
      <div class="col-6 col-md-2"><label class="form-label small">สถานะ</label>
        <select class="form-select form-select-sm" onchange="setFilter('status',this.value)">
          ${opt('', 'ทุกสถานะ', A_FILTER.status)}${Object.entries(PP_CONFIG.saleStatus).map(([k, v]) => opt(k, v.label, A_FILTER.status)).join('')}
        </select></div>
      <div class="col-6 col-md-2"><label class="form-label small">ช่องทาง</label>
        <select class="form-select form-select-sm" onchange="setFilter('channel',this.value)">
          ${opt('', 'ทั้งหมด', A_FILTER.channel)}${opt('pos', 'หน้าร้าน', A_FILTER.channel)}${opt('online', 'ออนไลน์', A_FILTER.channel)}
        </select></div>
      <div class="col-6 col-md-4"><label class="form-label small">ค้นหา</label>
        <input class="form-control form-control-sm" value="${esc(A_FILTER.q)}" placeholder="เลขที่บิล / ชื่อ / เบอร์" onchange="setFilter('q',this.value)"></div>
    </div>
  </div>
  <div class="panel"><div class="table-responsive"><table class="table align-middle mb-0">
    <thead><tr><th>เลขที่</th><th>เวลา</th><th>ลูกค้า</th><th>ช่องทาง</th><th>พนักงาน</th><th class="text-end">ยอด</th><th>สถานะ</th><th></th></tr></thead>
    <tbody>${A_SALES.map(o => `<tr>
      <td class="fw-semibold">${esc(o.sale_no)}</td>
      <td class="small text-muted-pp">${fmtDateTime(o.created_at)}</td>
      <td>${esc(o.customer_name || 'ทั่วไป')}<div class="product-code">${esc(o.customer_phone || '')}</div></td>
      <td class="small">${o.channel === 'pos' ? 'หน้าร้าน' : 'ออนไลน์'}</td>
      <td class="small">${esc(o.staff?.full_name || '-')}</td>
      <td class="text-end fw-semibold text-pp">${money(o.total)}</td>
      <td>
        <select class="form-select form-select-sm" style="width:125px" onchange="changeStatus('${o.id}',this.value,this)" ${['cancelled', 'refunded'].includes(o.status) ? 'disabled' : ''}>
          ${Object.entries(PP_CONFIG.saleStatus).map(([k, v]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select>
      </td>
      <td class="text-end"><button class="btn btn-ghost btn-sm" onclick="openSale('${o.id}')">ดู</button></td>
    </tr>`).join('') || '<tr><td colspan="8" class="text-center text-muted-pp py-5">ไม่พบบิล</td></tr>'}</tbody>
  </table></div></div>`;
}

function setFilter(k, v) { A_FILTER[k] = v; render(); }

async function changeStatus(id, status, sel) {
  if (['cancelled', 'refunded'].includes(status) && !confirm('เปลี่ยนเป็น "' + PP_CONFIG.saleStatus[status].label + '"? สต็อกจะถูกคืนกลับและย้อนกลับไม่ได้')) { render(); return; }
  try {
    await API.updateSaleStatus(id, status);
    toast('อัปเดตสถานะเป็น "' + PP_CONFIG.saleStatus[status].label + '"', 'ok');
    A_PRODUCTS = await API.getProducts({ includeInactive: true });
    if (['cancelled', 'refunded'].includes(status) && sel) sel.disabled = true;
  } catch (e) { toast(esc(e.message), 'err'); render(); }
}

async function openSale(id) {
  const sale = await API.getSale(id);
  showModal('บิล ' + sale.sale_no, `
    <div class="receipt">${receiptHTML(sale)}</div>
    <div class="d-flex justify-content-between mt-3">
      <button class="btn btn-ghost" onclick="printSale()">🖨️ พิมพ์</button>
      <button class="btn btn-pp" data-bs-dismiss="modal">ปิด</button>
    </div>`);
}
function printSale() {
  const r = document.querySelector('#gmBody .receipt');
  const w = window.open('', '_blank', 'width=420,height=700');
  w.document.write(`<html><head><title>ใบเสร็จ</title><link href="${new URL("assets/vendor/bootstrap.min.css", location.href).href}" rel="stylesheet"><link href="${new URL("assets/css/style.css", location.href).href}" rel="stylesheet"></head><body><div id="receipt" class="receipt p-3">${r.innerHTML}</div><script>setTimeout(()=>{print();close()},400)<\/script></body></html>`);
  w.document.close();
}

function exportSales() {
  if (!A_SALES.length) { toast('ไม่มีข้อมูลให้ดาวน์โหลด', 'err'); return; }
  const head = ['เลขที่', 'วันที่', 'ช่องทาง', 'สถานะ', 'ลูกค้า', 'โทร', 'จำนวนชิ้น', 'ยอดสินค้า', 'ส่วนลด', 'ค่าส่ง', 'ยอดสุทธิ', 'พนักงาน', 'หมายเหตุ'];
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = A_SALES.map(o => [o.sale_no, fmtDateTime(o.created_at), o.channel, PP_CONFIG.saleStatus[o.status]?.label || o.status,
    o.customer_name, o.customer_phone, o.item_count, o.subtotal, o.discount_amount, o.shipping_fee, o.total, o.staff?.full_name, o.note].map(q).join(','));
  downloadText('﻿' + [head.map(q).join(',')].concat(lines).join('\n'), 'ppoppo-sales-' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv;charset=utf-8');
}
function downloadText(text, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
}

/* =============================================================
   สินค้า
   ============================================================= */
async function viewProducts() {
  const rows = A_PRODUCTS.map(p => {
    const st = stockState(p.stock);
    return `<tr>
      <td><img class="thumb-sm" src="${esc(p.image)}" onerror="this.src='assets/images/placeholder.svg'"></td>
      <td><div style="font-weight:500">${esc(p.name)}</div><div class="product-code">${esc(p.code)} · ${esc(catName(p.category))}${p.barcode ? ' · ' + esc(p.barcode) : ''}</div></td>
      <td><span class="swatch" style="background:${esc(p.shade)}"></span></td>
      <td class="fw-semibold">${money(p.price)}<div class="product-code">ทุน ${money(p.cost)}</div></td>
      <td><span class="badge-pp ${st.badge}">${p.stock} ชิ้น</span></td>
      <td>${p.featured ? '<span class="badge-pp badge-new">แนะนำ</span> ' : ''}${!p.active ? '<span class="badge-pp badge-out">ปิดขาย</span>' : ''}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-ghost btn-sm" onclick="openProduct('${p.id}')">แก้ไข</button>
        <button class="btn btn-ghost btn-sm text-danger" onclick="removeProduct('${p.id}')">ลบ</button>
      </td></tr>`;
  }).join('') || '<tr><td colspan="7" class="text-center text-muted-pp py-5">ยังไม่มีสินค้า</td></tr>';

  return `
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    <div><h4 class="mb-1">สินค้า</h4><p class="text-muted-pp small mb-0">${A_PRODUCTS.length} รายการ · แสดงบนหน้าเว็บและหน้า POS</p></div>
    <div class="d-flex gap-2">
      <button class="btn btn-ghost" onclick="exportProducts()">⬇️ JSON</button>
      <button class="btn btn-pp" onclick="openProduct()">+ เพิ่มสินค้า</button>
    </div>
  </div>
  <div class="panel"><div class="table-responsive"><table class="table align-middle mb-0">
    <thead><tr><th>รูป</th><th>สินค้า</th><th>เฉด</th><th>ราคา</th><th>สต็อก</th><th>สถานะ</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div></div>`;
}

function openProduct(id) {
  const p = A_PRODUCTS.find(x => x.id === id) || {
    id: '', code: '', barcode: '', name: '', category: PP_CATEGORIES[0]?.id || 'tint', shade: '#F2879C',
    price: 320, cost: 0, oldPrice: 0, stock: 0, featured: false, active: true, image: PP_IMAGE_LIBRARY[0], desc: ''
  };
  document.getElementById('pmTitle').textContent = id ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่';
  document.getElementById('categorySelect').innerHTML = PP_CATEGORIES.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  const f = document.getElementById('productForm');
  f.pid.value = p.id; f.code.value = p.code || ''; f.barcode.value = p.barcode || ''; f.name.value = p.name || '';
  f.category.value = p.category || ''; f.shade.value = p.shade || '#F2879C';
  f.price.value = p.price || 0; f.cost.value = p.cost || 0; f.oldPrice.value = p.oldPrice || 0;
  f.stock.value = p.stock || 0; f.desc.value = p.desc || '';
  f.featured.checked = !!p.featured; f.active.checked = p.active !== false;
  /* สินค้าเดิมปรับสต็อกที่หน้า "คลังสินค้า" เพื่อให้มีประวัติ */
  document.getElementById('stockField').classList.toggle('d-none', !!id);
  setImage(p.image);
  document.getElementById('imgPicker').innerHTML = PP_IMAGE_LIBRARY.map(src =>
    `<img src="${esc(src)}" onclick="setImage('${esc(src)}')" title="${esc(src.split('/').pop())}">`).join('');
  bootstrap.Modal.getOrCreateInstance(document.getElementById('productModal')).show();
}

function setImage(src) {
  document.getElementById('productForm').image.value = src;
  document.getElementById('imgPreview').src = src;
  document.querySelectorAll('#imgPicker img').forEach(i => i.classList.toggle('sel', i.getAttribute('src') === src));
}

/** ย่อรูปแล้วอัปโหลดขึ้น Supabase Storage */
function onUploadImage(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('กรุณาเลือกไฟล์รูปภาพ', 'err'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1000;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(async blob => {
        try {
          toast('กำลังอัปโหลด…');
          const url = await API.uploadImage(blob, file.name.replace(/\.[^.]+$/, '') + '.jpg');
          setImage(url);
          toast('อัปโหลดรูปแล้ว ✅', 'ok');
        } catch (e) { toast('อัปโหลดไม่สำเร็จ: ' + esc(e.message), 'err'); }
        input.value = '';
      }, 'image/jpeg', 0.86);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

async function saveProductForm(e) {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
  try {
    await API.saveProduct({
      id: f.pid.value || '', code: f.code.value.trim(), barcode: f.barcode.value.trim(), name: f.name.value.trim(),
      category: f.category.value, shade: f.shade.value, price: f.price.value, cost: f.cost.value, oldPrice: f.oldPrice.value,
      stock: f.stock.value, image: f.image.value, desc: f.desc.value.trim(), featured: f.featured.checked, active: f.active.checked
    });
    bootstrap.Modal.getInstance(document.getElementById('productModal')).hide();
    toast('บันทึกสินค้าเรียบร้อย 💾', 'ok');
    await adminLoad();
  } catch (ex) {
    toast('บันทึกไม่สำเร็จ: ' + esc(/duplicate key/.test(ex.message) ? 'รหัสสินค้าหรือบาร์โค้ดซ้ำ' : ex.message), 'err');
  } finally { btn.disabled = false; btn.textContent = 'บันทึก'; }
}

async function removeProduct(id) {
  const p = A_PRODUCTS.find(x => x.id === id);
  if (!confirm('ลบสินค้า "' + (p ? p.name : id) + '" ใช่หรือไม่?\n(ถ้าเคยขายแล้ว แนะนำให้ "ปิดขาย" แทน เพื่อให้ประวัติบิลยังอ้างอิงได้)')) return;
  try { await API.deleteProduct(id); toast('ลบสินค้าแล้ว', 'ok'); adminLoad(); }
  catch (e) { toast(esc(e.message), 'err'); }
}

function exportProducts() { downloadText(JSON.stringify(A_PRODUCTS, null, 2), 'ppoppo-products.json', 'application/json'); }

/* =============================================================
   คลังสินค้า
   ============================================================= */
async function viewStock() {
  const moves = await API.getStockMovements({ limit: 40 });
  const out = A_PRODUCTS.filter(p => p.stock === 0).length;
  const low = A_PRODUCTS.filter(p => p.stock > 0 && p.stock <= API.lowStockAt()).length;
  const TYPE = { purchase: 'รับเข้า', sale: 'ขาย', return: 'คืน', adjust: 'ปรับยอด', damage: 'ของเสีย' };

  return `
  <h4 class="mb-1">คลังสินค้า</h4>
  <p class="text-muted-pp small mb-4">ทุกการเปลี่ยนแปลงถูกบันทึกเป็นประวัติ · ระบบตัดสต็อกอัตโนมัติเมื่อขาย และคืนเมื่อยกเลิกบิล</p>
  <div class="row g-3 mb-4">
    ${statCard('✅', A_PRODUCTS.length - out - low, 'สต็อกปกติ')}
    ${statCard('⚠️', low, 'ใกล้หมด')}
    ${statCard('⛔', out, 'หมดแล้ว')}
    ${statCard('📦', A_PRODUCTS.reduce((s, p) => s + p.stock, 0).toLocaleString('th-TH'), 'รวมทั้งหมด (ชิ้น)')}
  </div>
  <div class="row g-3">
    <div class="col-lg-7"><div class="panel"><div class="table-responsive"><table class="table align-middle mb-0">
      <thead><tr><th>สินค้า</th><th>คงเหลือ</th><th>มูลค่า(ทุน)</th><th></th></tr></thead>
      <tbody>${A_PRODUCTS.map(p => `<tr>
        <td><div class="d-flex align-items-center gap-2"><img class="thumb-sm" src="${esc(p.image)}" onerror="this.src='assets/images/placeholder.svg'"><div><div style="font-weight:500">${esc(p.name)}</div><div class="product-code">${esc(p.code)}</div></div></div></td>
        <td><span class="badge-pp ${stockState(p.stock).badge}">${p.stock}</span></td>
        <td class="small">${money(p.stock * p.cost)}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-ghost btn-sm" onclick="receiveStock('${p.id}')">+ รับเข้า</button>
          <button class="btn btn-ghost btn-sm" onclick="adjustDialog('${p.id}')">ปรับ</button>
          <button class="btn btn-ghost btn-sm" onclick="stockHistory('${p.id}')">ประวัติ</button>
        </td></tr>`).join('')}</tbody>
    </table></div></div></div>
    <div class="col-lg-5"><div class="panel">
      <h6 class="mb-3">ความเคลื่อนไหวล่าสุด</h6>
      ${moves.map(m => `<div class="d-flex justify-content-between align-items-start py-2 border-bottom small" style="border-color:var(--pp-line)!important">
        <div><b>${esc(m.products?.name || '-')}</b> <span class="product-code">${esc(m.products?.code || '')}</span>
          <div class="text-muted-pp">${TYPE[m.type] || m.type}${m.note ? ' · ' + esc(m.note) : ''}${m.staff?.full_name ? ' · ' + esc(m.staff.full_name) : ''}<br>${fmtDateTime(m.created_at)}</div></div>
        <div class="text-end"><b class="${m.qty < 0 ? 'text-danger' : 'text-success'}">${m.qty > 0 ? '+' : ''}${m.qty}</b><div class="text-muted-pp">→ ${m.stock_after}</div></div>
      </div>`).join('') || '<div class="text-muted-pp small">ยังไม่มีประวัติ</div>'}
    </div></div>
  </div>`;
}

async function receiveStock(id) {
  const p = A_PRODUCTS.find(x => x.id === id);
  const v = prompt('รับสินค้าเข้า "' + p.name + '" จำนวน (ชิ้น)', '12');
  if (v === null) return;
  const n = Number(v);
  if (!n || n <= 0) { toast('กรุณาใส่จำนวนที่ถูกต้อง', 'err'); return; }
  try { await API.adjustStock(id, n, 'purchase', 'รับสินค้าเข้า'); toast('รับเข้า +' + n + ' แล้ว', 'ok'); adminLoad(); }
  catch (e) { toast(esc(e.message), 'err'); }
}

function adjustDialog(id) {
  const p = A_PRODUCTS.find(x => x.id === id);
  showModal('ปรับสต็อก — ' + p.name, `
    <div class="small text-muted-pp mb-2">คงเหลือปัจจุบัน <b>${p.stock}</b> ชิ้น</div>
    <label class="form-label">ประเภท</label>
    <select id="adjType" class="form-select mb-2">
      <option value="set">ตั้งยอดคงเหลือใหม่ (นับสต็อก)</option>
      <option value="damage">ของเสีย / ชำรุด (−)</option>
      <option value="adjust">ปรับเพิ่ม/ลด (+/−)</option>
    </select>
    <label class="form-label">จำนวน</label>
    <input id="adjQty" class="form-control mb-2" type="number" value="${p.stock}">
    <label class="form-label">หมายเหตุ</label>
    <input id="adjNote" class="form-control mb-3" placeholder="เช่น นับสต็อกประจำเดือน">
    <button class="btn btn-pp w-100" onclick="doAdjust('${id}')">บันทึก</button>`);
}
async function doAdjust(id) {
  const type = document.getElementById('adjType').value;
  const qty = Number(document.getElementById('adjQty').value) || 0;
  const note = document.getElementById('adjNote').value.trim();
  try {
    if (type === 'set') await API.setStock(id, qty, note || 'นับสต็อก');
    else if (type === 'damage') await API.adjustStock(id, -Math.abs(qty), 'damage', note || 'ของเสีย');
    else await API.adjustStock(id, qty, 'adjust', note || 'ปรับยอด');
    hideModal(); toast('ปรับสต็อกแล้ว', 'ok'); adminLoad();
  } catch (e) { toast(esc(e.message), 'err'); }
}

async function stockHistory(id) {
  const p = A_PRODUCTS.find(x => x.id === id);
  const TYPE = { purchase: 'รับเข้า', sale: 'ขาย', return: 'คืน', adjust: 'ปรับยอด', damage: 'ของเสีย' };
  const moves = await API.getStockMovements({ productId: id, limit: 100 });
  showModal('ประวัติสต็อก — ' + p.name, `<table class="table table-sm align-middle mb-0">
    <thead><tr><th>เวลา</th><th>ประเภท</th><th class="text-end">จำนวน</th><th class="text-end">คงเหลือ</th></tr></thead>
    <tbody>${moves.map(m => `<tr><td class="small">${fmtDateTime(m.created_at)}<div class="product-code">${esc(m.note)}</div></td><td class="small">${TYPE[m.type] || m.type}</td>
      <td class="text-end ${m.qty < 0 ? 'text-danger' : 'text-success'}">${m.qty > 0 ? '+' : ''}${m.qty}</td><td class="text-end">${m.stock_after}</td></tr>`).join('') || '<tr><td colspan="4" class="text-muted-pp text-center">ไม่มีประวัติ</td></tr>'}</tbody></table>`, 'modal-lg');
}

/* =============================================================
   ลูกค้า
   ============================================================= */
let A_CUST_Q = '';
async function viewCustomers() {
  const list = await API.getCustomers(A_CUST_Q);
  return `
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    <div><h4 class="mb-1">ลูกค้า / สมาชิก</h4><p class="text-muted-pp small mb-0">สะสมยอดซื้อและแต้มอัตโนมัติจากบิล (${API.setting('points_rate', 20)} บาท = 1 แต้ม)</p></div>
    <div class="d-flex gap-2">
      <input class="form-control" style="width:220px" placeholder="ค้นหาชื่อ / เบอร์" value="${esc(A_CUST_Q)}" onchange="A_CUST_Q=this.value;render()">
      <button class="btn btn-pp" onclick="openCustomer()">+ เพิ่มลูกค้า</button>
    </div>
  </div>
  <div class="panel"><div class="table-responsive"><table class="table align-middle mb-0">
    <thead><tr><th>ชื่อ</th><th>เบอร์โทร</th><th class="text-end">ซื้อไป</th><th class="text-end">ยอดสะสม</th><th class="text-end">แต้ม</th><th>หมายเหตุ</th><th></th></tr></thead>
    <tbody>${list.map(c => `<tr>
      <td style="font-weight:500">${esc(c.name)}<div class="product-code">${esc(c.email || '')}</div></td>
      <td>${esc(c.phone || '-')}</td>
      <td class="text-end">${c.visit_count} ครั้ง</td>
      <td class="text-end fw-semibold text-pp">${money(c.total_spent)}</td>
      <td class="text-end">${c.points}</td>
      <td class="small text-muted-pp">${esc(c.note || '')}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-ghost btn-sm" onclick="customerSales('${c.id}')">บิล</button>
        <button class="btn btn-ghost btn-sm" onclick="openCustomer('${c.id}')">แก้ไข</button>
      </td></tr>`).join('') || '<tr><td colspan="7" class="text-center text-muted-pp py-5">ยังไม่มีลูกค้า</td></tr>'}</tbody>
  </table></div></div>`;
}

async function openCustomer(id) {
  let c = { name: '', phone: '', email: '', address: '', note: '' };
  if (id) c = (await API.getCustomers('', 500)).find(x => x.id === id) || c;
  showModal(id ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า', `
    <form onsubmit="saveCustomerForm(event,'${id || ''}')">
      <div class="row g-2">
        <div class="col-12"><label class="form-label">ชื่อ *</label><input name="name" class="form-control" required value="${esc(c.name)}"></div>
        <div class="col-6"><label class="form-label">เบอร์โทร</label><input name="phone" class="form-control" value="${esc(c.phone || '')}"></div>
        <div class="col-6"><label class="form-label">อีเมล</label><input name="email" class="form-control" value="${esc(c.email || '')}"></div>
        <div class="col-12"><label class="form-label">ที่อยู่</label><textarea name="address" class="form-control" rows="2">${esc(c.address)}</textarea></div>
        <div class="col-12"><label class="form-label">หมายเหตุ</label><input name="note" class="form-control" value="${esc(c.note)}"></div>
      </div>
      <div class="d-flex justify-content-between mt-3">
        ${id ? `<button type="button" class="btn btn-ghost text-danger" onclick="removeCustomer('${id}')">ลบ</button>` : '<span></span>'}
        <button class="btn btn-pp px-4">บันทึก</button>
      </div>
    </form>`);
}
async function saveCustomerForm(e, id) {
  e.preventDefault();
  const f = e.target;
  try {
    await API.saveCustomer({ id: id || undefined, name: f.name.value, phone: f.phone.value, email: f.email.value, address: f.address.value, note: f.note.value });
    hideModal(); toast('บันทึกลูกค้าแล้ว', 'ok'); render();
  } catch (ex) { toast(/duplicate key/.test(ex.message) ? 'เบอร์โทรนี้มีอยู่แล้ว' : esc(ex.message), 'err'); }
}
async function removeCustomer(id) {
  if (!confirm('ลบลูกค้ารายนี้? ประวัติบิลยังอยู่แต่จะไม่ผูกกับลูกค้า')) return;
  try { await API.deleteCustomer(id); hideModal(); toast('ลบแล้ว', 'ok'); render(); } catch (e) { toast(esc(e.message), 'err'); }
}
async function customerSales(id) {
  const sales = await API.getCustomerSales(id);
  showModal('ประวัติการซื้อ', `<table class="table table-sm align-middle mb-0">
    <thead><tr><th>เลขที่</th><th>เวลา</th><th class="text-end">ยอด</th><th>สถานะ</th></tr></thead>
    <tbody>${sales.map(s => `<tr style="cursor:pointer" onclick="openSale('${s.id}')"><td>${esc(s.sale_no)}</td><td class="small">${fmtDateTime(s.created_at)}</td><td class="text-end">${money(s.total)}</td><td>${statusBadge(s.status)}</td></tr>`).join('') || '<tr><td colspan="4" class="text-center text-muted-pp">ยังไม่มีบิล</td></tr>'}</tbody></table>`);
}

/* =============================================================
   โปรโมชัน
   ============================================================= */
async function viewPromotions() {
  const list = await API.getPromotions();
  const fmtD = d => d ? new Date(d).toLocaleDateString('th-TH') : '—';
  return `
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    <div><h4 class="mb-1">โปรโมชัน / โค้ดส่วนลด</h4><p class="text-muted-pp small mb-0">ใช้ได้ทั้งหน้า POS และหน้าร้านออนไลน์</p></div>
    <button class="btn btn-pp" onclick="openPromo()">+ เพิ่มโค้ด</button>
  </div>
  <div class="panel"><div class="table-responsive"><table class="table align-middle mb-0">
    <thead><tr><th>โค้ด</th><th>ชื่อ</th><th>ส่วนลด</th><th>ขั้นต่ำ</th><th>ช่วงเวลา</th><th>ใช้แล้ว</th><th>สถานะ</th><th></th></tr></thead>
    <tbody>${list.map(p => `<tr>
      <td class="fw-semibold">${esc(p.code)}</td><td>${esc(p.name)}</td>
      <td>${p.type === 'percent' ? p.value + '%' + (p.max_discount ? ' (สูงสุด ' + money(p.max_discount) + ')' : '') : money(p.value)}</td>
      <td class="small">${p.min_subtotal > 0 ? money(p.min_subtotal) : '—'}</td>
      <td class="small">${fmtD(p.starts_at)} → ${fmtD(p.ends_at)}</td>
      <td class="small">${p.used_count}${p.usage_limit ? ' / ' + p.usage_limit : ''}</td>
      <td>${p.active ? '<span class="badge-pp badge-ok">ใช้งาน</span>' : '<span class="badge-pp badge-out">ปิด</span>'}</td>
      <td class="text-end text-nowrap"><button class="btn btn-ghost btn-sm" onclick='openPromo(${JSON.stringify(p).replace(/'/g, '&#39;')})'>แก้ไข</button>
        <button class="btn btn-ghost btn-sm text-danger" onclick="removePromo('${p.id}')">ลบ</button></td></tr>`).join('')
      || '<tr><td colspan="8" class="text-center text-muted-pp py-5">ยังไม่มีโปรโมชัน</td></tr>'}</tbody>
  </table></div></div>`;
}

function openPromo(p = {}) {
  const dt = v => v ? new Date(v).toISOString().slice(0, 16) : '';
  showModal(p.id ? 'แก้ไขโค้ด' : 'เพิ่มโค้ดส่วนลด', `
    <form onsubmit="savePromoForm(event,'${p.id || ''}')">
      <div class="row g-2">
        <div class="col-5"><label class="form-label">โค้ด *</label><input name="code" class="form-control text-uppercase" required value="${esc(p.code || '')}"></div>
        <div class="col-7"><label class="form-label">ชื่อโปร *</label><input name="name" class="form-control" required value="${esc(p.name || '')}"></div>
        <div class="col-4"><label class="form-label">ประเภท</label><select name="type" class="form-select">
          <option value="percent" ${p.type !== 'fixed' ? 'selected' : ''}>เปอร์เซ็นต์ (%)</option><option value="fixed" ${p.type === 'fixed' ? 'selected' : ''}>จำนวนเงิน (฿)</option></select></div>
        <div class="col-4"><label class="form-label">มูลค่า *</label><input name="value" type="number" min="0" step="0.01" class="form-control" required value="${p.value ?? ''}"></div>
        <div class="col-4"><label class="form-label">ลดสูงสุด (฿)</label><input name="max_discount" type="number" min="0" class="form-control" value="${p.max_discount ?? ''}"></div>
        <div class="col-6"><label class="form-label">ยอดขั้นต่ำ (฿)</label><input name="min_subtotal" type="number" min="0" class="form-control" value="${p.min_subtotal ?? 0}"></div>
        <div class="col-6"><label class="form-label">จำกัดจำนวนครั้ง</label><input name="usage_limit" type="number" min="0" class="form-control" value="${p.usage_limit ?? ''}" placeholder="ไม่จำกัด"></div>
        <div class="col-6"><label class="form-label">เริ่ม</label><input name="starts_at" type="datetime-local" class="form-control" value="${dt(p.starts_at)}"></div>
        <div class="col-6"><label class="form-label">สิ้นสุด</label><input name="ends_at" type="datetime-local" class="form-control" value="${dt(p.ends_at)}"></div>
        <div class="col-12 form-check ms-2 mt-2"><input class="form-check-input" type="checkbox" name="active" id="promoActive" ${p.active !== false ? 'checked' : ''}><label class="form-check-label" for="promoActive">เปิดใช้งาน</label></div>
      </div>
      <button class="btn btn-pp w-100 mt-3">บันทึก</button>
    </form>`);
}
async function savePromoForm(e, id) {
  e.preventDefault();
  const f = e.target;
  try {
    await API.savePromotion({ id: id || undefined, code: f.code.value, name: f.name.value, type: f.type.value, value: f.value.value,
      max_discount: f.max_discount.value, min_subtotal: f.min_subtotal.value, usage_limit: f.usage_limit.value,
      starts_at: f.starts_at.value ? new Date(f.starts_at.value).toISOString() : null,
      ends_at: f.ends_at.value ? new Date(f.ends_at.value).toISOString() : null, active: f.active.checked });
    hideModal(); toast('บันทึกโปรโมชันแล้ว', 'ok'); render();
  } catch (ex) { toast(/duplicate key/.test(ex.message) ? 'โค้ดนี้มีอยู่แล้ว' : esc(ex.message), 'err'); }
}
async function removePromo(id) {
  if (!confirm('ลบโค้ดนี้?')) return;
  try { await API.deletePromotion(id); toast('ลบแล้ว', 'ok'); render(); } catch (e) { toast(esc(e.message), 'err'); }
}

/* =============================================================
   กะ / ปิดยอด
   ============================================================= */
async function viewShifts() {
  const list = await API.getShifts();
  return `
  <h4 class="mb-1">กะ / ปิดยอดเงินสด</h4>
  <p class="text-muted-pp small mb-4">เปิด-ปิดกะทำได้ที่หน้า POS · หน้านี้ดูประวัติและส่วนต่างเงินสด</p>
  <div class="panel"><div class="table-responsive"><table class="table align-middle mb-0">
    <thead><tr><th>เปิด</th><th>ปิด</th><th>พนักงาน</th><th class="text-end">เงินเริ่มต้น</th><th class="text-end">บิล</th><th class="text-end">ยอดขาย</th><th class="text-end">ขายเงินสด</th><th class="text-end">ควรมี</th><th class="text-end">นับได้</th><th class="text-end">ส่วนต่าง</th></tr></thead>
    <tbody>${list.map(s => {
      const diff = s.closing_cash == null ? null : Number(s.closing_cash) - Number(s.expected_cash);
      return `<tr>
        <td class="small">${fmtDateTime(s.opened_at)}</td>
        <td class="small">${s.closed_at ? fmtDateTime(s.closed_at) : '<span class="badge-pp badge-ok">เปิดอยู่</span>'}</td>
        <td class="small">${esc(s.opened?.full_name || '-')}</td>
        <td class="text-end">${money(s.opening_cash)}</td>
        <td class="text-end">${s.sale_count ?? '—'}</td>
        <td class="text-end">${s.total_sales != null ? money(s.total_sales) : '—'}</td>
        <td class="text-end">${s.cash_sales != null ? money(s.cash_sales) : '—'}</td>
        <td class="text-end">${s.expected_cash != null ? money(s.expected_cash) : '—'}</td>
        <td class="text-end">${s.closing_cash != null ? money(s.closing_cash) : '—'}</td>
        <td class="text-end fw-semibold ${diff === null ? '' : diff === 0 ? 'text-success' : 'text-danger'}">${diff === null ? '—' : (diff > 0 ? '+' : '') + money(diff)}</td>
      </tr>`; }).join('') || '<tr><td colspan="10" class="text-center text-muted-pp py-5">ยังไม่มีข้อมูลกะ</td></tr>'}</tbody>
  </table></div></div>`;
}

/* =============================================================
   พนักงาน
   ============================================================= */
async function viewStaff() {
  const list = await API.getStaff();
  const me = API.session();
  return `
  <h4 class="mb-1">พนักงาน</h4>
  <p class="text-muted-pp small mb-4">เพิ่มบัญชีใหม่ที่ Supabase Dashboard → Authentication → Users → <b>Add user</b> (ใส่อีเมล + รหัสผ่าน) แล้วบัญชีจะโผล่ที่นี่อัตโนมัติ</p>
  <div class="panel"><div class="table-responsive"><table class="table align-middle mb-0">
    <thead><tr><th>ชื่อ</th><th>อีเมล</th><th>สิทธิ์</th><th>สถานะ</th><th>เพิ่มเมื่อ</th></tr></thead>
    <tbody>${list.map(s => `<tr>
      <td><input class="form-control form-control-sm" value="${esc(s.full_name)}" style="max-width:220px" onchange="updateStaff('${s.id}',{full_name:this.value})"></td>
      <td>${esc(s.email)}${s.id === me.id ? ' <span class="badge-pp badge-new">คุณ</span>' : ''}</td>
      <td><select class="form-select form-select-sm" style="width:130px" ${s.id === me.id ? 'disabled' : ''} onchange="updateStaff('${s.id}',{role:this.value})">
        <option value="admin" ${s.role === 'admin' ? 'selected' : ''}>แอดมิน</option><option value="cashier" ${s.role === 'cashier' ? 'selected' : ''}>แคชเชียร์</option></select></td>
      <td><div class="form-check form-switch"><input class="form-check-input" type="checkbox" ${s.active ? 'checked' : ''} ${s.id === me.id ? 'disabled' : ''} onchange="updateStaff('${s.id}',{active:this.checked})"></div></td>
      <td class="small text-muted-pp">${fmtDateTime(s.created_at)}</td></tr>`).join('')}</tbody>
  </table></div></div>`;
}
async function updateStaff(id, patch) {
  try { await API.updateStaff(id, patch); toast('บันทึกแล้ว', 'ok'); } catch (e) { toast(esc(e.message), 'err'); }
}

/* =============================================================
   ตั้งค่า
   ============================================================= */
async function viewSettings() {
  const g = k => esc(API.setting(k, ''));
  return `
  <h4 class="mb-1">ตั้งค่าร้าน</h4>
  <p class="text-muted-pp small mb-4">ข้อมูลบนใบเสร็จ ค่าส่ง และกติกาสะสมแต้ม · เก็บในตาราง <code>settings</code></p>
  <form class="row g-3" onsubmit="saveSettingsForm(event)">
    <div class="col-lg-7"><div class="panel">
      <h6 class="mb-3">ข้อมูลร้าน (แสดงบนใบเสร็จ)</h6>
      <div class="row g-2">
        <div class="col-12"><label class="form-label">ชื่อร้าน</label><input name="shop_name" class="form-control" value="${g('shop_name')}"></div>
        <div class="col-12"><label class="form-label">ที่อยู่</label><input name="shop_address" class="form-control" value="${g('shop_address')}"></div>
        <div class="col-6"><label class="form-label">โทร</label><input name="shop_phone" class="form-control" value="${g('shop_phone')}"></div>
        <div class="col-6"><label class="form-label">เลขผู้เสียภาษี</label><input name="tax_id" class="form-control" value="${g('tax_id')}"></div>
        <div class="col-6"><label class="form-label">พร้อมเพย์</label><input name="promptpay_id" class="form-control" value="${g('promptpay_id')}"></div>
        <div class="col-12"><label class="form-label">ข้อความท้ายใบเสร็จ</label><input name="receipt_footer" class="form-control" value="${g('receipt_footer')}"></div>
      </div>
    </div></div>
    <div class="col-lg-5"><div class="panel">
      <h6 class="mb-3">กติกา</h6>
      <div class="row g-2">
        <div class="col-6"><label class="form-label">ค่าส่ง (฿)</label><input name="shipping_fee" type="number" class="form-control" value="${API.shippingFee()}"></div>
        <div class="col-6"><label class="form-label">ส่งฟรีเมื่อครบ (฿)</label><input name="free_shipping_at" type="number" class="form-control" value="${API.freeShippingAt()}"></div>
        <div class="col-6"><label class="form-label">เตือนสต็อก ≤</label><input name="low_stock_at" type="number" class="form-control" value="${API.lowStockAt()}"></div>
        <div class="col-6"><label class="form-label">กี่บาท = 1 แต้ม</label><input name="points_rate" type="number" class="form-control" value="${esc(API.setting('points_rate', 20))}"></div>
      </div>
      <button class="btn btn-pp w-100 mt-4">บันทึกการตั้งค่า</button>
      <div class="bg-cream-2 rounded-3 p-3 small mt-3">
        <div class="fw-semibold mb-1">การเชื่อมต่อ</div>
        <div class="text-muted-pp" style="word-break:break-all">Supabase: ${esc(PP_CONFIG.SUPABASE_URL || '(ยังไม่ได้ตั้งค่า)')}</div>
      </div>
    </div></div>
  </form>

  ${await telegramPanel()}`;
}
async function saveSettingsForm(e) {
  e.preventDefault();
  const f = e.target, obj = {};
  ['shop_name', 'shop_address', 'shop_phone', 'tax_id', 'promptpay_id', 'receipt_footer'].forEach(k => obj[k] = f[k].value.trim());
  ['shipping_fee', 'free_shipping_at', 'low_stock_at', 'points_rate'].forEach(k => obj[k] = Number(f[k].value) || 0);
  try { await API.saveSettings(obj); toast('บันทึกการตั้งค่าแล้ว', 'ok'); } catch (ex) { toast(esc(ex.message), 'err'); }
}

/* =============================================================
   แจ้งเตือน Telegram
   ============================================================= */
const NOTIFY_EVENT = { sale: '🧾 ขาย', order: '🛒 ออเดอร์ออนไลน์', status: '🔄 เปลี่ยนสถานะ', restock: '📦 รับเข้า', low_stock: '⚠️ ใกล้หมด', out_of_stock: '⛔ หมด', test: '🔔 ทดสอบ' };

async function telegramPanel() {
  let s, log = [], missing = false;
  try { [s, log] = await Promise.all([API.getNotifySettings(), API.getNotificationLog(20)]); }
  catch (e) { missing = true; s = { enabled: false, telegram_bot_token: '', telegram_chat_id: '', notify_sales: true, notify_restock: true, notify_low_stock: true }; }
  const chk = (name, label, on) => `<div class="form-check form-switch mb-1"><input class="form-check-input" type="checkbox" name="${name}" id="tg_${name}" ${on ? 'checked' : ''}><label class="form-check-label" for="tg_${name}">${label}</label></div>`;
  return `
  <h4 class="mt-5 mb-1">🔔 แจ้งเตือนผ่าน Telegram</h4>
  <p class="text-muted-pp small mb-3">ฐานข้อมูลส่งข้อความเข้า Telegram อัตโนมัติเมื่อมีการขาย รับสินค้าเข้า และสต็อกใกล้หมด/หมด (ทำงานทั้งจาก POS และหน้าร้านออนไลน์)</p>
  ${missing ? '<div class="alert alert-warning small">ยังไม่ได้ติดตั้งส่วนแจ้งเตือน — รันไฟล์ <code>supabase/telegram.sql</code> ใน SQL Editor ก่อน</div>' : ''}
  <div class="row g-3">
    <div class="col-lg-7"><form class="panel" onsubmit="saveTelegram(event)">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h6 class="mb-0">การเชื่อมต่อ</h6>
        <div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" name="enabled" id="tg_enabled" ${s.enabled ? 'checked' : ''}><label class="form-check-label" for="tg_enabled">เปิดใช้งาน</label></div>
      </div>
      <label class="form-label">Bot Token</label>
      <div class="input-group mb-2">
        <input name="telegram_bot_token" id="tgToken" class="form-control" type="password" autocomplete="off" value="${esc(s.telegram_bot_token)}" placeholder="123456789:AAxxxxxxxx…">
        <button type="button" class="btn btn-ghost" onclick="const i=document.getElementById('tgToken');i.type=i.type==='password'?'text':'password'">👁️</button>
      </div>
      <label class="form-label">Chat ID</label>
      <div class="input-group mb-3">
        <input name="telegram_chat_id" id="tgChat" class="form-control" value="${esc(s.telegram_chat_id)}" placeholder="เช่น 123456789 หรือ -100xxxxxxxxx (กลุ่ม)">
        <button type="button" class="btn btn-pp-outline" onclick="findChatId()">🔍 ค้นหา Chat ID</button>
      </div>
      <div id="tgChatList" class="small mb-3"></div>
      <h6 class="mb-2">แจ้งเตือนเมื่อ</h6>
      ${chk('notify_sales', 'มีการขาย / ออเดอร์ออนไลน์ใหม่ / เปลี่ยนสถานะบิล', s.notify_sales)}
      ${chk('notify_restock', 'รับสินค้าเข้า / ปรับสต็อกเพิ่ม', s.notify_restock)}
      ${chk('notify_low_stock', 'สต็อกใกล้หมด (≤ ${API.lowStockAt()}) หรือหมด', s.notify_low_stock)}
      <div class="d-flex gap-2 mt-3">
        <button class="btn btn-pp flex-fill" ${missing ? 'disabled' : ''}>บันทึก</button>
        <button type="button" class="btn btn-ghost" id="btnTgTest" onclick="testTelegram()" ${missing ? 'disabled' : ''}>📨 ส่งข้อความทดสอบ</button>
      </div>
      <div id="tgTestResult" class="small mt-2"></div>
    </form></div>
    <div class="col-lg-5">
      <div class="panel mb-3">
        <h6 class="mb-2">วิธีตั้งค่า (ครั้งเดียว)</h6>
        <ol class="small mb-0 ps-3" style="line-height:1.8">
          <li>ใน Telegram ค้นหา <b>@BotFather</b> → พิมพ์ <code>/newbot</code> → ตั้งชื่อ → คัดลอก <b>token</b> มาวางด้านซ้าย</li>
          <li>เปิดแชทกับบอทที่สร้าง แล้วกด <b>Start</b> (หรือเพิ่มบอทเข้ากลุ่มร้านแล้วพิมพ์ทักทาย 1 ข้อความ)</li>
          <li>กด <b>🔍 ค้นหา Chat ID</b> → เลือกแชทที่ต้องการ</li>
          <li>ติ๊ก <b>เปิดใช้งาน</b> → <b>บันทึก</b> → กด <b>ส่งข้อความทดสอบ</b></li>
        </ol>
      </div>
      <div class="panel">
        <h6 class="mb-2">ประวัติการแจ้งเตือนล่าสุด</h6>
        ${log.length ? log.map(l => `<div class="py-1 border-bottom small" style="border-color:var(--pp-line)!important">
            <div class="d-flex justify-content-between"><b>${NOTIFY_EVENT[l.event] || esc(l.event)}</b><span class="text-muted-pp">${fmtDateTime(l.created_at)}</span></div>
            <div class="text-muted-pp text-truncate">${esc(l.message.replace(/<[^>]+>/g, '').split('\n').slice(0, 2).join(' · '))}</div>
          </div>`).join('') : '<div class="text-muted-pp small">ยังไม่มีการแจ้งเตือน</div>'}
      </div>
    </div>
  </div>`;
}

async function saveTelegram(e) {
  e.preventDefault();
  const f = e.target;
  try {
    await API.saveNotifySettings({
      enabled: f.enabled.checked, telegram_bot_token: f.telegram_bot_token.value, telegram_chat_id: f.telegram_chat_id.value,
      notify_sales: f.notify_sales.checked, notify_restock: f.notify_restock.checked, notify_low_stock: f.notify_low_stock.checked
    });
    toast('บันทึกการแจ้งเตือนแล้ว 🔔', 'ok');
  } catch (ex) { toast(esc(ex.message), 'err'); }
}

async function findChatId() {
  const token = document.getElementById('tgToken').value.trim();
  const box = document.getElementById('tgChatList');
  if (!token) { toast('กรอก Bot Token ก่อน', 'err'); return; }
  box.innerHTML = '<span class="text-muted-pp">กำลังค้นหา…</span>';
  try {
    const chats = await API.telegramFindChats(token);
    box.innerHTML = chats.length
      ? '<div class="text-muted-pp mb-1">เลือกแชทที่จะรับการแจ้งเตือน:</div>' + chats.map(c =>
          `<button type="button" class="btn btn-ghost btn-sm me-1 mb-1" onclick="document.getElementById('tgChat').value='${esc(String(c.id))}';toast('เลือก ${esc(c.title)} แล้ว','ok')">${c.type === 'private' ? '👤' : '👥'} ${esc(c.title)} <span class="product-code">${esc(String(c.id))}</span></button>`).join('')
      : '<span class="text-danger">ยังไม่พบแชท — เปิดแชทกับบอทแล้วกด Start (หรือพิมพ์ข้อความ 1 ครั้ง) แล้วลองใหม่</span>';
  } catch (ex) { box.innerHTML = '<span class="text-danger">' + esc(ex.message) + '</span>'; }
}

async function testTelegram() {
  const btn = document.getElementById('btnTgTest'), out = document.getElementById('tgTestResult');
  btn.disabled = true; out.innerHTML = '<span class="text-muted-pp">กำลังส่ง… (บันทึกการตั้งค่าก่อนถ้ายังไม่ได้บันทึก)</span>';
  try {
    const r = await API.telegramTest();
    if (!r.done) out.innerHTML = '<span class="text-warning">ส่งคำขอแล้ว แต่ยังไม่ได้รับผลตอบกลับ — ลองเช็คใน Telegram</span>';
    else if (r.status === 200) out.innerHTML = '<span class="text-success">✅ ส่งสำเร็จ — ดูข้อความใน Telegram ได้เลย</span>';
    else out.innerHTML = '<span class="text-danger">❌ Telegram ตอบ ' + esc(String(r.status)) + ': ' + esc(r.body || r.error || '') + '</span>';
  } catch (ex) { out.innerHTML = '<span class="text-danger">' + esc(ex.message) + '</span>'; }
  finally { btn.disabled = false; }
}

/* ---------------------------------------------------- modal helpers */
function showModal(title, html, size = '') {
  document.getElementById('gmTitle').textContent = title;
  document.getElementById('gmBody').innerHTML = html;
  document.getElementById('genericDialog').className = 'modal-dialog modal-dialog-centered modal-dialog-scrollable ' + size;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('genericModal')).show();
}
function hideModal() { bootstrap.Modal.getInstance(document.getElementById('genericModal'))?.hide(); }

Object.assign(window, {
  go, adminLoad, setFilter, changeStatus, openSale, printSale, exportSales,
  openProduct, setImage, onUploadImage, saveProductForm, removeProduct, exportProducts,
  receiveStock, adjustDialog, doAdjust, stockHistory,
  openCustomer, saveCustomerForm, removeCustomer, customerSales,
  openPromo, savePromoForm, removePromo, updateStaff, saveSettingsForm, showModal, hideModal,
  saveTelegram, findChatId, testTelegram
});
