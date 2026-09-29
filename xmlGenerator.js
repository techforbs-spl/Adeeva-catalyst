function escapeXml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateCustomerXml(data) {
  const customerNo = escapeXml(data.customerNo || '');
  const customerName = escapeXml(data.customerName || data.billToName || '');
  const attention = escapeXml(data.attention || data.billToAttention || customerName);
  const address1 = escapeXml(data.address1 || data.billToAddress1 || '');
  const address2 = escapeXml(data.address2 !== undefined ? data.address2 : (data.billToAddress2 !== undefined ? data.billToAddress2 : '-, -  '));
  const postalZip = escapeXml(data.postalZip || data.billToPostal || '');
  const provinceState = escapeXml(data.provinceState || data.billToProvince || '');
  const country = escapeXml(data.country || data.billToCountry || 'CA');
  const city = escapeXml(data.city || data.billToCity || '');
  const telephone = escapeXml(data.telephone || data.billToPhone || '');
  const fax = escapeXml(data.fax || '');
  const email = escapeXml(data.email || '');

  return `<customers><customer customer_no='${customerNo}'><customer_name>${customerName}</customer_name><address><attention>${attention}</attention><address1>${address1}</address1><address2>${address2}</address2><postal_zip>${postalZip}</postal_zip><province_state>${provinceState}</province_state><country>${country}</country><city>${city}</city><telephone>${telephone}</telephone><fax>${fax}</fax><email>${email}</email></address></customer></customers>`;
}

function generateShiptoXml(data) {
  const customerNo = escapeXml(data.customerNo || '');
  const shiptoNo = escapeXml(data.orderNo || data.shiptoNo || '');
  const shiptoVia = escapeXml(data.shipVia || 'Purolator');
  const shiptoName = escapeXml(data.shipToName || data.customerName || data.billToName || '');
  const attention = escapeXml(data.shipToAttention || data.attention || shiptoName);
  const address1 = escapeXml(data.shipToAddress1 || data.address1 || data.billToAddress1 || '');
  const address2 = escapeXml((data.shipToAddress2 !== undefined ? data.shipToAddress2 : (data.address2 !== undefined ? data.address2 : '')).trim());
  const postalZip = escapeXml(data.shipToPostal || data.postalZip || data.billToPostal || '');
  const provinceState = escapeXml(data.shipToProvince || data.provinceState || data.billToProvince || '');
  const country = escapeXml(data.shipToCountry || data.country || data.billToCountry || 'CA');
  const city = escapeXml(data.shipToCity || data.city || data.billToCity || '');
  const telephone = escapeXml(data.shipToPhone || data.telephone || data.billToPhone || '');
  const fax = escapeXml(data.shipToFax || data.fax || '');
  const email = escapeXml(data.shipToEmail || data.email || '');

  return `<shiptos><shipto customer_no='${customerNo}' shipto_no='${shiptoNo}' shipto_via='${shiptoVia}'><shipto_name>${shiptoName}</shipto_name><address><attention>${attention}</attention><address1>${address1}</address1><address2>${address2}</address2><postal_zip>${postalZip}</postal_zip><province_state>${provinceState}</province_state><country>${country}</country><city>${city}</city><telephone>${telephone}</telephone><fax>${fax}</fax><email>${email}</email></address></shipto></shiptos>`;
}

function formatDateWithDashes(val) {
  if (!val) return '';
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{8}$/.test(str)) return `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const parts = str.split('/');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return str;
}

function generateOrderXml(data) {
  const orderId = escapeXml(data.orderId || '');
  const billTo = escapeXml(data.customerNo || data.billTo || '');
  const shipTo = escapeXml(data.orderNo || data.shiptoNo || data.shipTo || '');
  const dateWanted = escapeXml(formatDateWithDashes(data.dateWanted || data.orderDate || data.orderDateRaw || ''));
  const orderDate = escapeXml(formatDateWithDashes(data.orderDate || data.orderDateRaw || ''));
  const orderNotes = escapeXml(data.orderNotes ? data.orderNotes.padEnd(24, ' ') : '');

  const itemsXml = (data.items || []).map(item => {
    const partNo = escapeXml(item.sku || item.partNo || '');
    const qty = Number(item.quantity || 0).toFixed(4);
    const priceNum = Number(item.price || 0);
    const priceStr = escapeXml(item.priceExact || priceNum);
    return `<item part_no='${partNo}'><quantity>${qty}</quantity><price>${priceStr}</price></item>`;
  }).join('');

  return `<orders><order order_id='${orderId}'><bill_to>${billTo}</bill_to><ship_to>${shipTo}</ship_to>${itemsXml}<date_wanted>${dateWanted}</date_wanted><order_date>${orderDate}</order_date><order_notes>${orderNotes}</order_notes></order></orders>`;
}

module.exports = {
  generateCustomerXml,
  generateShiptoXml,
  generateOrderXml
};
