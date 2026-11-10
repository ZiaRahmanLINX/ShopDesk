// Invoice printing: thermal (58/80mm) + A4 HTML, print + PDF export.
import { BrowserWindow, dialog } from 'electron';
import { getPrisma, getShopSettings } from './db';
import { formatPKR } from './utils/money';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function invoiceHtml(saleId: string, width: '58' | '80' | 'A4'): Promise<string> {
  const db = getPrisma();
  const sale = await db.sale.findUnique({
    where: { id: saleId },
    include: { customer: true, items: { include: { product: true } }, payments: true },
  });
  if (!sale) throw new Error('Sale not found');
  const shop = await getShopSettings();
  const w = width === '58' ? '58mm' : width === '80' ? '80mm' : '210mm';
  const rows = sale.items
    .map(
      (it) => `<tr><td>${esc(it.product.name)}</td><td class="r">${it.qty}</td><td class="r">${formatPKR(it.unitPrice)}</td><td class="r">${formatPKR(it.lineTotal)}</td></tr>`,
    )
    .join('');
  const payments = sale.payments
    .map((p) => `<div class="row"><span>${p.method}</span><span>${formatPKR(p.amount)}</span></div>`)
    .join('');
  const credit = sale.total - sale.paidAmount;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; width: ${w}; margin: 0 auto; padding: ${width === 'A4' ? '24px' : '8px'}; color: #111; font-size: ${width === 'A4' ? '14px' : '12px'}; }
    h1 { font-size: ${width === 'A4' ? '22px' : '16px'}; text-align: center; }
    .c { text-align: center; } .r { text-align: right; }
    .muted { color: #555; font-size: 11px; }
    hr { border: none; border-top: 1px dashed #999; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 3px 2px; text-align: left; }
    th { border-bottom: 1px solid #999; }
    .row { display: flex; justify-content: space-between; padding: 2px 0; }
    .total { font-weight: bold; font-size: 15px; }
    @media print { body { width: ${w}; } }
  </style></head><body>
    <h1>${esc(shop.shopName)}</h1>
    <p class="c muted">${esc(shop.shopAddress)}${shop.shopPhone ? ` · ${esc(shop.shopPhone)}` : ''}</p>
    <hr>
    <div class="row"><span>Invoice</span><strong>${esc(sale.invoiceNo)}</strong></div>
    <div class="row"><span>Date</span><span>${sale.date.toLocaleString('en-GB')}</span></div>
    ${sale.customer ? `<div class="row"><span>Customer</span><span>${esc(sale.customer.name)}</span></div>` : ''}
    <hr>
    <table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Total</th></tr></thead><tbody>${rows}</tbody></table>
    <hr>
    <div class="row"><span>Subtotal</span><span>${formatPKR(sale.subtotal)}</span></div>
    ${sale.discount > 0 ? `<div class="row"><span>Discount</span><span>-${formatPKR(sale.discount)}</span></div>` : ''}
    <div class="row total"><span>Total</span><span>${formatPKR(sale.total)}</span></div>
    <hr>
    ${payments}
    ${credit > 0 ? `<div class="row"><span>Remaining (Udhar)</span><strong>${formatPKR(credit)}</strong></div>` : ''}
    <hr>
    <p class="c">${esc(shop.thankYouNote)}</p>
  </body></html>`;
}

async function printWindow(html: string): Promise<BrowserWindow> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return win;
}

export async function printInvoice(
  mainWindow: BrowserWindow,
  payload: { saleId: string; width: '58' | '80' | 'A4' },
): Promise<{ ok: boolean }> {
  const html = await invoiceHtml(payload.saleId, payload.width);
  const win = await printWindow(html);
  const db = getPrisma();
  await db.invoice.updateMany({ where: { saleId: payload.saleId }, data: { printCount: { increment: 1 } } });
  win.webContents.print({ silent: false, printBackground: false }, (success, reason) => {
    if (!success) console.error('Print failed:', reason);
    win.destroy();
  });
  void mainWindow;
  return { ok: true };
}

export async function exportInvoicePdf(
  _mainWindow: BrowserWindow,
  payload: { saleId: string },
): Promise<{ ok: boolean; path?: string }> {
  const html = await invoiceHtml(payload.saleId, 'A4');
  const win = await printWindow(html);
  const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4, topUnits: 'inches', bottomUnits: 'inches', leftUnits: 'inches', rightUnits: 'inches' } as never });
  win.destroy();
  const res = await dialog.showSaveDialog({
    title: 'Save invoice as PDF',
    defaultPath: `${payload.saleId.slice(0, 8)}-invoice.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false };
  const fs = await import('node:fs');
  fs.writeFileSync(res.filePath, pdf);
  return { ok: true, path: res.filePath };
}
