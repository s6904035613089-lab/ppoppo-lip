/* =============================================================
   receipt.js — สร้าง HTML ใบเสร็จจากบิล (ใช้ทั้ง POS และหลังบ้าน)
   sale = ผลลัพธ์จาก API.getSale() / API.createSale()
   ============================================================= */

const PAY_NAME = { cash: 'เงินสด', promptpay: 'พร้อมเพย์', transfer: 'โอนธนาคาร', card: 'บัตร', cod: 'เก็บเงินปลายทาง' };

function fmtDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d) ? String(iso) : d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
}

function receiptHTML(sale) {
  const st = PP_CONFIG.saleStatus[sale.status] || { label: sale.status };
  const items = (sale.items || []).map(i => `
    <tr>
      <td>${esc(i.product_name)}<div class="text-muted-pp" style="font-size:.72rem">${esc(i.product_code)}${i.discount > 0 ? ' · ลด ' + money(i.discount) : ''}</div></td>
      <td class="text-center">${i.qty}</td>
      <td class="text-end">${money(i.line_total)}</td>
    </tr>`).join('');

  const pays = (sale.payments || []).map(p =>
    `<div class="d-flex justify-content-between"><span>${PAY_NAME[p.method] || p.method}${p.reference ? ' (' + esc(p.reference) + ')' : ''}</span><span>${money(p.amount)}</span></div>`).join('');

  return `
  <div class="text-center">
    <img src="assets/images/logo.svg" alt="ppoppo" style="height:44px">
    <div class="fw-semibold mt-1">${esc(API.setting('shop_name', 'ppoppo'))}</div>
    <div class="small text-muted-pp">${esc(API.setting('shop_address', ''))}${API.setting('shop_phone', '') ? ' · โทร ' + esc(API.setting('shop_phone', '')) : ''}</div>
    ${API.setting('tax_id', '') ? `<div class="small text-muted-pp">เลขผู้เสียภาษี ${esc(API.setting('tax_id', ''))}</div>` : ''}
  </div>
  <hr class="receipt-hr">
  <div class="d-flex justify-content-between small"><span>เลขที่</span><b>${esc(sale.sale_no)}</b></div>
  <div class="d-flex justify-content-between small"><span>วันที่</span><span>${fmtDateTime(sale.created_at)}</span></div>
  <div class="d-flex justify-content-between small"><span>ช่องทาง</span><span>${sale.channel === 'pos' ? 'หน้าร้าน' : 'ออนไลน์'} · ${esc(st.label)}</span></div>
  ${sale.customer_name ? `<div class="d-flex justify-content-between small"><span>ลูกค้า</span><span>${esc(sale.customer_name)}${sale.customer_phone ? ' ' + esc(sale.customer_phone) : ''}</span></div>` : ''}
  <hr class="receipt-hr">
  <table class="table table-sm table-borderless mb-1 receipt-table">
    <thead><tr class="small text-muted-pp"><th>รายการ</th><th class="text-center">จำนวน</th><th class="text-end">ราคา</th></tr></thead>
    <tbody>${items}</tbody>
  </table>
  <hr class="receipt-hr">
  <div class="d-flex justify-content-between small"><span>ยอดสินค้า (${sale.item_count} ชิ้น)</span><span>${money(sale.subtotal)}</span></div>
  ${Number(sale.discount_amount) > 0 ? `<div class="d-flex justify-content-between small text-danger"><span>ส่วนลด${sale.promotion_code ? ' (' + esc(sale.promotion_code) + ')' : ''}</span><span>−${money(sale.discount_amount)}</span></div>` : ''}
  ${Number(sale.shipping_fee) > 0 ? `<div class="d-flex justify-content-between small"><span>ค่าจัดส่ง</span><span>${money(sale.shipping_fee)}</span></div>` : ''}
  <div class="d-flex justify-content-between fs-5 mt-1"><strong>ยอดสุทธิ</strong><strong class="text-pp">${money(sale.total)}</strong></div>
  ${pays ? `<div class="small mt-2">${pays}</div>` : ''}
  ${Number(sale.change_amount) > 0 ? `<div class="d-flex justify-content-between small"><span>เงินทอน</span><span>${money(sale.change_amount)}</span></div>` : ''}
  ${sale.note ? `<div class="small text-muted-pp mt-2">หมายเหตุ: ${esc(sale.note)}</div>` : ''}
  <hr class="receipt-hr">
  <div class="text-center small text-muted-pp">${esc(API.setting('receipt_footer', 'ขอบคุณที่อุดหนุน ppoppo 💋'))}</div>`;
}

window.receiptHTML = receiptHTML;
window.fmtDateTime = fmtDateTime;
window.PAY_NAME = PAY_NAME;
