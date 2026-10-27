import type { Order, Settings } from '../types';
import { fmtDate, fmtMoney } from './format';

export const printOrder = (order: Order, settings: Settings) => {
  const w = window.open('', '_blank', 'width=400,height=600');
  if (!w) return;
  const itemsHtml = order.items
    .map(
      (it) => `
        <tr>
          <td style="padding:2px 0">${it.name}${it.notes ? `<br><small style="color:#666">${it.notes}</small>` : ''}</td>
          <td style="text-align:center">${it.qty}</td>
          <td style="text-align:right">${fmtMoney(it.price * it.qty, settings.currency)}</td>
        </tr>`
    )
    .join('');
  const outlet = settings.outlets.find((o) => o.id === settings.activeOutletId);
  w.document.write(`
    <html>
      <head>
        <title>Bill #${order.number}</title>
        <style>
          body { font-family: 'Courier New', monospace; width: ${settings.printerWidth}mm; margin: 0; padding: 8px; font-size: 12px; color: #000; }
          h1, h2, h3 { margin: 0; text-align: center; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; }
          .total { font-size: 14px; font-weight: bold; }
        </style>
      </head>
      <body>
        <h2>${settings.restaurantName}</h2>
        <div style="text-align:center; font-size:11px">${outlet?.address || ''}</div>
        <div style="text-align:center; font-size:11px">Ph: ${outlet?.phone || ''}</div>
        ${outlet?.gstin ? `<div style="text-align:center; font-size:11px">GSTIN: ${outlet.gstin}</div>` : ''}
        <div class="divider"></div>
        <div class="row"><span>Bill #${settings.invoicePrefix}-${order.number}</span><span>${order.type.toUpperCase()}</span></div>
        <div class="row"><span>${fmtDate(order.createdAt)}</span></div>
        <div class="divider"></div>
        <table>
          <thead>
            <tr>
              <th style="text-align:left">Item</th>
              <th style="text-align:center">Qty</th>
              <th style="text-align:right">Amt</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div class="divider"></div>
        <div class="row"><span>Subtotal</span><span>${fmtMoney(order.subtotal, settings.currency)}</span></div>
        ${order.discount ? `<div class="row"><span>Discount</span><span>- ${fmtMoney(order.discount, settings.currency)}</span></div>` : ''}
        <div class="row"><span>${settings.taxLabel} ${settings.defaultTax}%</span><span>${fmtMoney(order.taxAmount, settings.currency)}</span></div>
        <div class="divider"></div>
        <div class="row total"><span>TOTAL</span><span>${fmtMoney(order.total, settings.currency)}</span></div>
        <div class="divider"></div>
        <div style="text-align:center">Payment: ${order.payment.toUpperCase()}</div>
        <div class="divider"></div>
        <div style="text-align:center; font-size:11px">${settings.footerNote}</div>
      </body>
    </html>
  `);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 200);
};

export const printKOT = (order: Order, settings: Settings) => {
  const w = window.open('', '_blank', 'width=400,height=600');
  if (!w) return;
  const itemsHtml = order.items
    .map(
      (it) => `
        <tr>
          <td style="text-align:center;font-size:18px;font-weight:bold">${it.qty}x</td>
          <td>${it.name}${it.notes ? `<br><small>${it.notes}</small>` : ''}</td>
        </tr>`
    )
    .join('');
  w.document.write(`
    <html>
      <head>
        <title>KOT #${order.number}</title>
        <style>
          body { font-family: 'Courier New', monospace; width: ${settings.printerWidth}mm; margin: 0; padding: 8px; font-size: 14px; }
          h2 { text-align: center; margin: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          td { padding: 4px 0; border-bottom: 1px dashed #000; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
        </style>
      </head>
      <body>
        <h2>KOT #${order.number}</h2>
        <div style="text-align:center">${order.type.toUpperCase()}</div>
        <div style="text-align:center">${new Date(order.createdAt).toLocaleTimeString('en-IN')}</div>
        <div class="divider"></div>
        <table>${itemsHtml}</table>
      </body>
    </html>
  `);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 200);
};
