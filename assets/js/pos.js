/* =============================================================
   pos.js — หน้าขายหน้าร้าน (Point of Sale)
   เลือกสินค้า → ตะกร้า → ส่วนลด/ลูกค้า → รับเงิน → ใบเสร็จ
   ยอดทั้งหมดคำนวณจริงที่ Database (create_sale) ฝั่งนี้แค่แสดงตัวอย่าง
   ============================================================= */

let P_PRODUCTS = [];
let P_CAT = 'all';
let P_LINES = [];            // [{ id, code, name, price, shade, image, stock, qty, discount }]
let P_CUSTOMER = null;       // แถว customers หรือ null
let P_PROMO = null;          // ผลจาก check_promotion
let P_SHIFT = null;          // กะที่เปิดอยู่
let P_METHOD = 'cash';
let P_LAST_SALE = null;

/* ---------------------------------------------------- โหลด */
async function posLoad() {
  try {
    [P_PRODUCTS, P_SHIFT] = await Promise.all([API.getProducts(), API.getOpenShift()]);
  } catch (e) { toast('โหลดข้อมูลไม่สำเร็จ: ' + esc(e.message), 'err'); }
  renderCats();
  renderGrid();
  renderBill();
  renderShiftBadge();
  if (!P_SHIFT) openShiftDialog();

  const search = document.getElementById('posSearch');
  search.addEventListener('input', renderGrid);
  search.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = search.value.trim().toLowerCase();
    if (!q) return;
    /* ยิงบาร์โค้ด / พิมพ์รหัสตรง ๆ → ใส่บิลทันที */
    const exact = P_PRODUCTS.find(p => p.barcode?.toLowerCase() === q || p.code.toLowerCase() === q);
    const list = exact ? [exact] : filtered();
    if (list.length === 1) { addLine(list[0].id); search.value = ''; renderGrid(); }
    else if (!list.length) toast('ไม่พบสินค้า "' + esc(search.value) + '"', 'err');
  });
  document.getElementById('custPhone').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); lookupCustomer(); } });
  document.getElementById('promoCode').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyPromo(); } });
  search.focus();
}

/* ---------------------------------------------------- สินค้า */
function renderCats() {
  const cats = [{ id: 'all', name: 'ทั้งหมด', emoji: '💗' }, ...PP_CATEGORIES];
  document.getElementById('posCats').innerHTML = cats.map(c =>
    `<button class="filter-pill ${P_CAT === c.id ? 'active' : ''}" onclick="setCat('${esc(c.id)}')">${c.emoji || ''} ${esc(c.name)}</button>`).join('');
}
function setCat(id) { P_CAT = id; renderCats(); renderGrid(); }

function filtered() {
  const q = document.getElementById('posSearch').value.trim().toLowerCase();
  return P_PRODUCTS.filter(p =>
    (P_CAT === 'all' || p.category === P_CAT) &&
    (!q || (p.name + ' ' + p.code + ' ' + (p.barcode || '')).toLowerCase().includes(q)));
}

function renderGrid() {
  const list = filtered();
  const inBill = id => (P_LINES.find(l => l.id === id) || {}).qty || 0;
  document.getElementById('posGrid').innerHTML = list.length ? list.map(p => {
    const left = p.stock - inBill(p.id);
    const out = left <= 0;
    return `
    <button class="pos-card ${out ? 'out' : ''}" ${out ? 'disabled' : ''} onclick="addLine('${esc(p.id)}')">
      <div class="pos-card-img"><img src="${esc(p.image)}" alt="" onerror="this.src='assets/images/placeholder.svg'">
        ${inBill(p.id) ? `<span class="pos-card-qty">${inBill(p.id)}</span>` : ''}</div>
      <div class="pos-card-body">
        <div class="d-flex align-items-center gap-1"><span class="swatch" style="background:${esc(p.shade)}"></span><span class="product-code">${esc(p.code)}</span></div>
        <div class="pos-card-name">${esc(p.name)}</div>
        <div class="d-flex justify-content-between align-items-end">
          <span class="fw-semibold text-pp">${money(p.price)}</span>
          <span class="small ${left <= API.lowStockAt() ? 'text-danger' : 'text-muted-pp'}">${out ? 'หมด' : 'เหลือ ' + left}</span>
        </div>
      </div>
    </button>`;
  }).join('') : '<div class="text-center text-muted-pp py-5 w-100">ไม่พบสินค้า</div>';
}

/* ---------------------------------------------------- บิล */
function addLine(id) {
  const p = P_PRODUCTS.find(x => x.id === id);
  if (!p) return;
  const line = P_LINES.find(l => l.id === id);
  const cur = line ? line.qty : 0;
  if (cur + 1 > p.stock) { toast('สต็อก ' + esc(p.name) + ' เหลือ ' + p.stock + ' ชิ้น', 'err'); return; }
  if (line) line.qty++;
  else P_LINES.push({ id: p.id, code: p.code, name: p.name, price: p.price, shade: p.shade, image: p.image, stock: p.stock, qty: 1, discount: 0 });
  P_PROMO = null;  // ยอดเปลี่ยน ต้องตรวจโค้ดใหม่
  renderBill(); renderGrid();
}

function setQty(id, qty) {
  const line = P_LINES.find(l => l.id === id);
  if (!line) return;
  qty = Math.max(0, Math.min(Number(qty) || 0, line.stock));
  if (qty === 0) P_LINES = P_LINES.filter(l => l.id !== id); else line.qty = qty;
  P_PROMO = null;
  renderBill(); renderGrid();
}
function bump(id, d) { const l = P_LINES.find(x => x.id === id); if (l) setQty(id, l.qty + d); }
function setLineDiscount(id, v) { const l = P_LINES.find(x => x.id === id); if (l) { l.discount = Math.max(0, Number(v) || 0); P_PROMO = null; renderBill(); } }

function clearBill() {
  if (P_LINES.length && !confirm('ล้างบิลนี้ทั้งหมด?')) return;
  P_LINES = []; P_PROMO = null; P_CUSTOMER = null;
  document.getElementById('custPhone').value = '';
  document.getElementById('promoCode').value = '';
  document.getElementById('manualDiscount').value = '';
  document.getElementById('custInfo').textContent = 'ลูกค้าทั่วไป';
  renderBill(); renderGrid();
  document.getElementById('posSearch').focus();
}

function totals() {
  const sub = P_LINES.reduce((s, l) => s + Math.max(l.price * l.qty - l.discount, 0), 0);
  const promo = P_PROMO ? Number(P_PROMO.discount) : 0;
  const manual = Math.max(Number(document.getElementById('manualDiscount').value) || 0, 0);
  const disc = Math.min(sub, promo + manual);
  return { sub, disc, total: sub - disc, count: P_LINES.reduce((s, l) => s + l.qty, 0) };
}

function renderBill() {
  const box = document.getElementById('posLines');
  box.innerHTML = P_LINES.length ? P_LINES.map(l => `
    <div class="pos-line">
      <img src="${esc(l.image)}" onerror="this.src='assets/images/placeholder.svg'">
      <div class="flex-grow-1">
        <div class="d-flex justify-content-between">
          <div style="font-weight:500;line-height:1.2">${esc(l.name)}<div class="product-code">${esc(l.code)} · ${money(l.price)}</div></div>
          <button class="btn btn-sm p-0 text-muted-pp" onclick="setQty('${esc(l.id)}',0)">✕</button>
        </div>
        <div class="d-flex justify-content-between align-items-center mt-1">
          <div class="d-flex align-items-center gap-1">
            <button class="qty-btn" onclick="bump('${esc(l.id)}',-1)">−</button>
            <input class="pos-qty" type="number" min="1" max="${l.stock}" value="${l.qty}" onchange="setQty('${esc(l.id)}',this.value)">
            <button class="qty-btn" onclick="bump('${esc(l.id)}',1)">+</button>
            <input class="pos-disc" type="number" min="0" placeholder="ลด" value="${l.discount || ''}" title="ส่วนลดรายการ (บาท)" onchange="setLineDiscount('${esc(l.id)}',this.value)">
          </div>
          <strong>${money(Math.max(l.price * l.qty - l.discount, 0))}</strong>
        </div>
      </div>
    </div>`).join('')
  : '<div class="text-center text-muted-pp py-5"><div style="font-size:2.4rem">🛍️</div>แตะสินค้าด้านซ้ายเพื่อเริ่มบิล</div>';

  const t = totals();
  document.getElementById('sumSub').textContent = money(t.sub);
  document.getElementById('sumDisc').textContent = '−' + money(t.disc);
  document.getElementById('sumTotal').textContent = money(t.total);
  document.getElementById('btnPay').disabled = !P_LINES.length;
  document.getElementById('promoInfo').innerHTML = P_PROMO
    ? `✅ ${esc(P_PROMO.name)} −${money(P_PROMO.discount)} <a href="javascript:removePromo()" class="text-danger">ยกเลิก</a>`
    : '';
}

/* ---------------------------------------------------- ลูกค้า */
async function lookupCustomer() {
  const phone = document.getElementById('custPhone').value.trim();
  const info = document.getElementById('custInfo');
  if (!phone) { P_CUSTOMER = null; info.textContent = 'ลูกค้าทั่วไป'; return; }
  try {
    P_CUSTOMER = await API.findCustomerByPhone(phone);
    if (P_CUSTOMER) {
      info.innerHTML = `⭐ <b>${esc(P_CUSTOMER.name)}</b> · แต้ม ${P_CUSTOMER.points} · ซื้อไป ${P_CUSTOMER.visit_count} ครั้ง`;
    } else {
      const name = prompt('ยังไม่มีลูกค้าเบอร์ ' + phone + '\nใส่ชื่อเพื่อสมัครสมาชิกใหม่ (เว้นว่างเพื่อข้าม)');
      if (name && name.trim()) {
        P_CUSTOMER = await API.saveCustomer({ name: name.trim(), phone });
        info.innerHTML = `🆕 สมาชิกใหม่ <b>${esc(P_CUSTOMER.name)}</b>`;
        toast('เพิ่มสมาชิกใหม่แล้ว', 'ok');
      } else { P_CUSTOMER = null; info.textContent = 'ลูกค้าทั่วไป'; }
    }
  } catch (e) { toast(esc(e.message), 'err'); }
}

/* ---------------------------------------------------- โปรโมชัน */
async function applyPromo() {
  const code = document.getElementById('promoCode').value.trim();
  if (!code) { P_PROMO = null; renderBill(); return; }
  try {
    const r = await API.checkPromotion(code, totals().sub);
    if (!r.ok) { P_PROMO = null; toast(esc(r.error), 'err'); }
    else { P_PROMO = r; toast('ใช้โค้ด ' + esc(r.code) + ' แล้ว', 'ok'); }
  } catch (e) { toast(esc(e.message), 'err'); }
  renderBill();
}
function removePromo() { P_PROMO = null; document.getElementById('promoCode').value = ''; renderBill(); }

/* ---------------------------------------------------- ชำระเงิน */
function openPay() {
  if (!P_LINES.length) return;
  const t = totals();
  document.getElementById('payTotal').textContent = money(t.total);
  document.getElementById('payError').classList.add('d-none');
  document.getElementById('payReference').value = '';
  document.getElementById('cashReceived').value = '';
  setMethod('cash');
  /* ปุ่มลัดจำนวนเงิน */
  const quick = [t.total, ...[100, 500, 1000].filter(v => v > t.total)].concat(Math.ceil(t.total / 100) * 100)
    .filter((v, i, a) => a.indexOf(v) === i && v >= t.total).sort((a, b) => a - b).slice(0, 5);
  document.getElementById('cashQuick').innerHTML = quick.map(v =>
    `<button class="btn btn-ghost btn-sm" onclick="setCash(${v})">${v === t.total ? 'พอดี ' : ''}${money(v)}</button>`).join('');
  bootstrap.Modal.getOrCreateInstance(document.getElementById('payModal')).show();
  setTimeout(() => document.getElementById('cashReceived').focus(), 300);
}

function setMethod(m) {
  P_METHOD = m;
  document.getElementById('payMethods').innerHTML = PP_CONFIG.paymentMethods.map(x =>
    `<button class="pay-method ${x.id === m ? 'active' : ''}" onclick="setMethod('${x.id}')">${x.emoji}<span>${x.name}</span></button>`).join('');
  document.getElementById('payCash').classList.toggle('d-none', m !== 'cash');
  document.getElementById('payRef').classList.toggle('d-none', m === 'cash');
  calcChange();
}
function setCash(v) { document.getElementById('cashReceived').value = v; calcChange(); }
function calcChange() {
  const t = totals();
  const recv = Number(document.getElementById('cashReceived').value) || 0;
  document.getElementById('payChange').textContent = money(Math.max(recv - t.total, 0));
}

async function confirmPay() {
  const t = totals();
  const err = document.getElementById('payError');
  const btn = document.getElementById('btnConfirmPay');
  let amount = t.total, reference = '';
  if (P_METHOD === 'cash') {
    amount = Number(document.getElementById('cashReceived').value) || 0;
    if (amount < t.total) { err.textContent = 'รับเงินมาน้อยกว่ายอดบิล'; err.classList.remove('d-none'); return; }
  } else {
    reference = document.getElementById('payReference').value.trim();
  }

  btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
  err.classList.add('d-none');
  try {
    const sale = await API.createSale({
      customer: P_CUSTOMER ? { id: P_CUSTOMER.id, name: P_CUSTOMER.name, phone: P_CUSTOMER.phone } : {},
      items: P_LINES.map(l => ({ product_id: l.id, qty: l.qty, discount: l.discount || 0 })),
      promotion_code: P_PROMO ? P_PROMO.code : null,
      discount_amount: Math.max(Number(document.getElementById('manualDiscount').value) || 0, 0),
      payments: [{ method: P_METHOD, amount, reference }],
      shift_id: P_SHIFT ? P_SHIFT.id : null
    });
    P_LAST_SALE = sale;
    bootstrap.Modal.getInstance(document.getElementById('payModal')).hide();
    document.getElementById('receipt').innerHTML = receiptHTML(sale);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('receiptModal')).show();
    toast('บันทึกบิล ' + esc(sale.sale_no) + ' แล้ว 🎉', 'ok');
  } catch (e) {
    err.textContent = e.message; err.classList.remove('d-none');
  } finally {
    btn.disabled = false; btn.textContent = 'ยืนยันรับเงิน';
  }
}

async function newSale() {
  bootstrap.Modal.getInstance(document.getElementById('receiptModal')).hide();
  P_LINES = []; P_PROMO = null; P_CUSTOMER = null;
  document.getElementById('custPhone').value = '';
  document.getElementById('promoCode').value = '';
  document.getElementById('manualDiscount').value = '';
  document.getElementById('custInfo').textContent = 'ลูกค้าทั่วไป';
  try { P_PRODUCTS = await API.getProducts(); } catch (e) {}
  renderBill(); renderGrid();
  document.getElementById('posSearch').focus();
}

/* ---------------------------------------------------- บิลล่าสุด */
async function showRecent() {
  const body = document.getElementById('recentBody');
  body.innerHTML = '<div class="text-center text-muted-pp py-4">กำลังโหลด…</div>';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('recentModal')).show();
  try {
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const sales = await API.getSales({ from: from.toISOString(), limit: 50 });
    body.innerHTML = sales.length ? `
      <table class="table align-middle mb-0">
        <thead><tr><th>เลขที่</th><th>เวลา</th><th>ลูกค้า</th><th class="text-end">ยอด</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${sales.map(s => {
          const st = PP_CONFIG.saleStatus[s.status] || { label: s.status, badge: 'badge-new' };
          return `<tr>
            <td class="fw-semibold">${esc(s.sale_no)}</td>
            <td class="small">${fmtDateTime(s.created_at)}</td>
            <td class="small">${esc(s.customer_name || 'ทั่วไป')}</td>
            <td class="text-end fw-semibold">${money(s.total)}</td>
            <td><span class="badge-pp ${st.badge}">${st.label}</span></td>
            <td class="text-end text-nowrap">
              <button class="btn btn-ghost btn-sm" onclick="reprint('${s.id}')">🧾</button>
              ${s.status === 'paid' ? `<button class="btn btn-ghost btn-sm text-danger" onclick="voidSale('${s.id}','${esc(s.sale_no)}')">ยกเลิก</button>` : ''}
            </td></tr>`; }).join('')}</tbody>
      </table>` : '<div class="text-center text-muted-pp py-4">วันนี้ยังไม่มีบิล</div>';
  } catch (e) { body.innerHTML = '<div class="text-danger">' + esc(e.message) + '</div>'; }
}

async function reprint(id) {
  try {
    const sale = await API.getSale(id);
    bootstrap.Modal.getInstance(document.getElementById('recentModal'))?.hide();
    document.getElementById('receipt').innerHTML = receiptHTML(sale);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('receiptModal')).show();
  } catch (e) { toast(esc(e.message), 'err'); }
}

async function voidSale(id, no) {
  if (!confirm('ยกเลิกบิล ' + no + ' ? สต็อกจะถูกคืนกลับอัตโนมัติ')) return;
  try {
    await API.updateSaleStatus(id, 'cancelled');
    toast('ยกเลิกบิล ' + esc(no) + ' แล้ว', 'ok');
    P_PRODUCTS = await API.getProducts();
    renderGrid(); showRecent();
  } catch (e) { toast(esc(e.message), 'err'); }
}

/* ---------------------------------------------------- กะ */
function renderShiftBadge() {
  const b = document.getElementById('shiftBadge');
  if (P_SHIFT) {
    b.className = 'badge-pp badge-ok';
    b.textContent = 'กะเปิดอยู่ · ' + new Date(P_SHIFT.opened_at).toLocaleTimeString('th-TH', { timeStyle: 'short' });
  } else { b.className = 'badge-pp badge-low'; b.textContent = 'ยังไม่เปิดกะ'; }
}

function openShiftDialog() {
  const body = document.getElementById('shiftBody');
  document.getElementById('shiftTitle').textContent = P_SHIFT ? 'ปิดกะ / สรุปยอด' : 'เปิดกะ';
  body.innerHTML = P_SHIFT ? `
    <div class="small text-muted-pp mb-2">เปิดโดย ${esc(P_SHIFT.opened?.full_name || '-')} เมื่อ ${fmtDateTime(P_SHIFT.opened_at)} · เงินสดเริ่มต้น ${money(P_SHIFT.opening_cash)}</div>
    <label class="form-label">เงินสดในลิ้นชักที่นับได้ตอนนี้ (฿)</label>
    <input id="closingCash" class="form-control form-control-lg" type="number" min="0" inputmode="decimal">
    <label class="form-label mt-2">หมายเหตุ</label>
    <input id="shiftNote" class="form-control" placeholder="ไม่บังคับ">
    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-ghost flex-fill" data-bs-dismiss="modal">ยังไม่ปิด</button>
      <button class="btn btn-pp flex-fill" onclick="doCloseShift()">ปิดกะ</button>
    </div>` : `
    <p class="small text-muted-pp">เปิดกะเพื่อให้ระบบสรุปยอดขายและเงินสดในลิ้นชักตอนปิดกะได้ (ข้ามได้ ถ้าไม่ต้องการนับเงิน)</p>
    <label class="form-label">เงินสดเริ่มต้นในลิ้นชัก (฿)</label>
    <input id="openingCash" class="form-control form-control-lg" type="number" min="0" value="0" inputmode="decimal">
    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-ghost flex-fill" data-bs-dismiss="modal">ข้าม</button>
      <button class="btn btn-pp flex-fill" onclick="doOpenShift()">เปิดกะ</button>
    </div>`;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('shiftModal')).show();
}

async function doOpenShift() {
  try {
    await API.openShift(document.getElementById('openingCash').value);
    P_SHIFT = await API.getOpenShift();
    renderShiftBadge();
    bootstrap.Modal.getInstance(document.getElementById('shiftModal')).hide();
    toast('เปิดกะแล้ว ขายดี ๆ นะ 💕', 'ok');
  } catch (e) { toast(esc(e.message), 'err'); }
}

async function doCloseShift() {
  const cash = document.getElementById('closingCash').value;
  if (cash === '') { toast('กรุณากรอกเงินสดที่นับได้', 'err'); return; }
  try {
    const s = await API.closeShift(P_SHIFT.id, cash, document.getElementById('shiftNote').value);
    P_SHIFT = null; renderShiftBadge();
    const diff = Number(s.closing_cash) - Number(s.expected_cash);
    document.getElementById('shiftBody').innerHTML = `
      <div class="bg-cream-2 rounded-4 p-3">
        <div class="d-flex justify-content-between"><span>จำนวนบิล</span><b>${s.sale_count}</b></div>
        <div class="d-flex justify-content-between"><span>ยอดขายรวม</span><b>${money(s.total_sales)}</b></div>
        <div class="d-flex justify-content-between"><span>ขายเงินสด</span><b>${money(s.cash_sales)}</b></div>
        <div class="d-flex justify-content-between"><span>เงินสดที่ควรมี</span><b>${money(s.expected_cash)}</b></div>
        <div class="d-flex justify-content-between"><span>นับได้จริง</span><b>${money(s.closing_cash)}</b></div>
        <hr class="my-2">
        <div class="d-flex justify-content-between ${diff === 0 ? 'text-success' : 'text-danger'}"><span>ส่วนต่าง</span><b>${diff >= 0 ? '+' : ''}${money(diff)}</b></div>
      </div>
      <button class="btn btn-pp w-100 mt-3" data-bs-dismiss="modal">ปิด</button>`;
    toast('ปิดกะเรียบร้อย', 'ok');
  } catch (e) { toast(esc(e.message), 'err'); }
}

Object.assign(window, {
  posLoad, setCat, addLine, setQty, bump, setLineDiscount, clearBill, renderBill,
  lookupCustomer, applyPromo, removePromo, openPay, setMethod, setCash, calcChange, confirmPay,
  newSale, showRecent, reprint, voidSale, openShiftDialog, doOpenShift, doCloseShift
});
