const PDFDocument = require('pdfkit');
const fs = require('fs');

// Ensure standard font definitions are bundled by Vercel NFT trace
try {
  require('pdfkit/standard-fonts/Helvetica');
  require('pdfkit/standard-fonts/HelveticaBold');
} catch (_) {}

function generateInvoicePdf(data, outputPath) {
  return new Promise((resolve, reject) => {
    // Standard Letter page: 612 x 792 points, or A4
    // Looking at the original coordinates: 30 802 Td, width ~ 595 or 612
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 30, bottom: 30, left: 30, right: 30 }
    });

    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    // Let's implement the layout matching the original
    doc.fontSize(14).font('Helvetica-Bold').text('INVOICE', 30, 36, { align: 'center' });

    // Company info (Left)
    doc.fontSize(10).font('Helvetica-Bold').text(data.companyName || 'Adeeva Nutritionals Canada Inc.', 34, 52);
    doc.font('Helvetica').fontSize(10);
    doc.text(data.companyAddress1 || '5500 Explorer Drive, 4th Floor,', 34, 66);
    doc.text(data.companyAddress2 || 'Mississauga, ON L4W 5C7', 34, 80);
    doc.text(data.companyCountry || 'Canada', 34, 94);
    doc.text(`Phone : ${data.companyPhone || '888-251-1010'}`, 34, 108);

    // Header Right (Date, Invoice No, Customer No)
    const rightLabelX = 310;
    const rightValX = 412;
    doc.font('Helvetica').fontSize(10);
    
    doc.text('DATE :', rightLabelX, 56, { width: 95, align: 'right' });
    doc.text(data.invoiceDate || '11/09/2026', rightValX, 56);

    doc.text('INVOICE NUMBER :', rightLabelX, 70, { width: 95, align: 'right' });
    doc.text(data.invoiceNumber || 'IN00042251', rightValX, 70);

    doc.text('CUSTOMER NO. :', rightLabelX, 84, { width: 95, align: 'right' });
    doc.text(data.customerNo || '03507', rightValX, 84);

    // BILL TO / SHIP TO boxes
    // Box dimensions: 30 to 297.5 (width 267.5), 297.5 to 565 (width 267.5)
    // Y: 130 to 233
    const boxTop = 130;
    const boxHeight = 103;
    const boxWidth = 267.5;
    const leftBoxX = 30;
    const rightBoxX = 297.5;

    doc.lineWidth(0.5).rect(leftBoxX, boxTop, boxWidth, boxHeight).stroke();
    doc.rect(rightBoxX, boxTop, boxWidth, boxHeight).stroke();

    // Headers
    doc.font('Helvetica-Bold').fontSize(9.5);
    doc.text('BILL TO :', leftBoxX + 6, boxTop + 5);
    doc.text('SHIP TO :', rightBoxX + 6, boxTop + 5);

    // Bill To & Ship To resolution
    const billName = (data.billToName || data.customerName || data.customer_name || data.attention || '').trim();
    const billAddress1 = (data.billToAddress1 || data.address1 || data.address || data.street || data.address_1 || '').trim();
    let billAddress2 = (data.billToAddress2 !== undefined ? data.billToAddress2 : (data.address2 !== undefined ? data.address2 : (data.address_2 || ''))).trim();
    if (billAddress2 === '-, -' || billAddress2 === '-') billAddress2 = '';
    const billCity = (data.billToCity || data.city || '').trim();
    const billProvince = (data.billToProvince || data.provinceState || data.province_state || data.province || data.state || '').trim();
    const billPostal = (data.billToPostal || data.postalZip || data.postal_zip || data.zip || '').trim();
    const billCountry = (data.billToCountry || data.country || 'CA').trim();
    const billPhone = (data.billToPhone || data.telephone || data.phone || '').trim();

    const rawShipName = (data.shipToName || data.shipto_name || '').trim();
    const rawShipAddress1 = (data.shipToAddress1 || data.shipto_address1 || '').trim();
    let rawShipAddress2 = (data.shipToAddress2 !== undefined ? data.shipToAddress2 : (data.shipto_address2 !== undefined ? data.shipto_address2 : '')).trim();
    if (rawShipAddress2 === '-, -' || rawShipAddress2 === '-') rawShipAddress2 = '';
    const rawShipCity = (data.shipToCity || data.shipto_city || '').trim();
    const rawShipProvince = (data.shipToProvince || data.shipto_province || data.shipToProvinceState || '').trim();
    const rawShipPostal = (data.shipToPostal || data.shipto_postal || data.shipToPostalZip || '').trim();
    const rawShipCountry = (data.shipToCountry || data.shipto_country || '').trim();
    const rawShipPhone = (data.shipToPhone || data.shipto_phone || '').trim();

    const shipName = rawShipName || billName;
    const shipAddress1 = rawShipAddress1 || billAddress1;
    const shipAddress2 = rawShipAddress2 || billAddress2;
    const shipCity = rawShipCity || billCity;
    const shipProvince = rawShipProvince || billProvince;
    const shipPostal = rawShipPostal || billPostal;
    const shipCountry = rawShipCountry || billCountry || 'CA';
    const shipPhone = rawShipPhone || billPhone;

    // Check if billing address is different from shipping address
    const cleanStr = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let showBillTo = false;
    if (data.sameAsBillTo === true) {
      showBillTo = false;
    } else if (data.sameAsBillTo === false) {
      showBillTo = Boolean(billAddress1 || billCity) && (
        cleanStr(billName) !== cleanStr(shipName) ||
        cleanStr(billAddress1) !== cleanStr(shipAddress1) ||
        cleanStr(billAddress2) !== cleanStr(shipAddress2) ||
        cleanStr(billCity) !== cleanStr(shipCity) ||
        cleanStr(billProvince) !== cleanStr(shipProvince) ||
        cleanStr(billPostal) !== cleanStr(shipPostal)
      );
    } else if (billAddress1 || billCity || billName) {
      // If sameAsBillTo flag not explicitly provided, check if any address line differs
      showBillTo = (
        cleanStr(billName) !== cleanStr(shipName) ||
        cleanStr(billAddress1) !== cleanStr(shipAddress1) ||
        cleanStr(billAddress2) !== cleanStr(shipAddress2) ||
        cleanStr(billCity) !== cleanStr(shipCity) ||
        cleanStr(billProvince) !== cleanStr(shipProvince) ||
        cleanStr(billPostal) !== cleanStr(shipPostal)
      );
    }

    // Bill To Content (only rendered if different from ship-to address)
    if (showBillTo) {
      doc.font('Helvetica').fontSize(9);
      let billY = boxTop + 18;
      const billLineH = 11.5;

      if (billName) {
        doc.text(billName, leftBoxX + 6, billY, { width: boxWidth - 12 });
        billY += billLineH;
      }
      if (billAddress1) {
        doc.text(billAddress1, leftBoxX + 6, billY, { width: boxWidth - 12 });
        billY += billLineH;
      }
      if (billAddress2) {
        doc.text(billAddress2, leftBoxX + 6, billY, { width: boxWidth - 12 });
        billY += billLineH;
      }
      const billCityProvPostal = [billCity, billProvince, billPostal].filter(Boolean).join(', ');
      if (billCityProvPostal) {
        doc.text(billCityProvPostal, leftBoxX + 6, billY, { width: boxWidth - 12 });
        billY += billLineH;
      }
      if (billCountry) {
        doc.text(billCountry, leftBoxX + 6, billY, { width: boxWidth - 12 });
        billY += billLineH;
      }
      if (billPhone) {
        doc.text(billPhone, leftBoxX + 6, billY, { width: boxWidth - 12 });
        billY += billLineH;
      }
    } else {
      // Both addresses are the same: render as shown in 2nd image (, , and CA)
      doc.font('Helvetica').fontSize(9.5);
      doc.text(', ,', leftBoxX + 6, boxTop + 48);
      doc.text(billCountry || 'CA', leftBoxX + 6, boxTop + 62);
    }

    // Ship To Content
    doc.font('Helvetica').fontSize(9);
    let shipY = boxTop + 18;
    const shipLineH = 11.5;

    if (shipName) {
      doc.text(shipName, rightBoxX + 6, shipY, { width: boxWidth - 12 });
      shipY += shipLineH;
    }
    if (shipAddress1) {
      doc.text(shipAddress1, rightBoxX + 6, shipY, { width: boxWidth - 12 });
      shipY += shipLineH;
    }
    if (shipAddress2) {
      doc.text(shipAddress2, rightBoxX + 6, shipY, { width: boxWidth - 12 });
      shipY += shipLineH;
    }
    const shipCityProvPostal = [shipCity, shipProvince, shipPostal].filter(Boolean).join(', ');
    if (shipCityProvPostal) {
      doc.text(shipCityProvPostal, rightBoxX + 6, shipY, { width: boxWidth - 12 });
      shipY += shipLineH;
    }
    if (shipCountry) {
      doc.text(shipCountry, rightBoxX + 6, shipY, { width: boxWidth - 12 });
      shipY += shipLineH;
    }
    if (shipPhone) {
      doc.text(shipPhone, rightBoxX + 6, shipY, { width: boxWidth - 12 });
      shipY += shipLineH;
    }

    if (data.orderNotes) {
      shipY += 2;
      doc.fontSize(8).font('Helvetica');
      doc.text(`Instruction: ${data.orderNotes}`, rightBoxX + 6, shipY, { 
        width: boxWidth - 12,
        lineGap: 1
      });
    }

    // Special Instructions / Order Date / Order Number Bar
    const barTop = 236;
    const col1W = 321;
    const col2W = 107;
    const col3W = 107;

    // Headers
    doc.rect(30, barTop, col1W, 16).stroke();
    doc.rect(30 + col1W, barTop, col2W, 16).stroke();
    doc.rect(30 + col1W + col2W, barTop, col3W, 16).stroke();

    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('SPECIAL INSTRUCTIONS', 30, barTop + 4, { width: col1W, align: 'center' });
    doc.text('ORDER DATE', 30 + col1W, barTop + 4, { width: col2W, align: 'center' });
    doc.text('ORDER NUMBER', 30 + col1W + col2W, barTop + 4, { width: col3W, align: 'center' });

    // Values
    doc.rect(30, barTop + 16, col1W, 16).stroke();
    doc.rect(30 + col1W, barTop + 16, col2W, 16).stroke();
    doc.rect(30 + col1W + col2W, barTop + 16, col3W, 16).stroke();

    doc.font('Helvetica').fontSize(10);
    doc.text(data.orderNotes || '', 30, barTop + 20, { width: col1W, align: 'center' });
    doc.text(data.orderDateFormatted || '', 30 + col1W, barTop + 20, { width: col2W, align: 'center' });
    doc.text(data.orderNo || '', 30 + col1W + col2W, barTop + 20, { width: col3W, align: 'center' });

    // Ship Via / Terms Bar
    const shipBarTop = barTop + 38;
    const shipW = 267.5;
    doc.rect(30, shipBarTop, shipW, 14).stroke();
    doc.rect(30 + shipW, shipBarTop, shipW, 14).stroke();
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('SHIP VIA', 30, shipBarTop + 3, { width: shipW, align: 'center' });
    doc.text('TERMS', 30 + shipW, shipBarTop + 3, { width: shipW, align: 'center' });

    doc.rect(30, shipBarTop + 14, shipW, 14).stroke();
    doc.rect(30 + shipW, shipBarTop + 14, shipW, 14).stroke();
    doc.font('Helvetica').fontSize(9);
    doc.text(data.shipVia || 'Purolator', 30, shipBarTop + 17, { width: shipW, align: 'center' });
    doc.text(data.terms || '', 30 + shipW, shipBarTop + 17, { width: shipW, align: 'center' });

    // Items Table Header
    const tableTop = shipBarTop + 34;
    const descW = 214;
    const qtySpanW = 192.6;
    const reqW = 69.55;
    const shipQtyW = 74.9;
    const boW = 48.15;
    const unitPriceW = 53.5;
    const extPriceW = 74.9;

    // Header boxes
    doc.rect(30, tableTop, descW, 32).stroke();
    doc.rect(30 + descW, tableTop, qtySpanW, 16).stroke();
    doc.rect(30 + descW + qtySpanW, tableTop, unitPriceW, 32).stroke();
    doc.rect(30 + descW + qtySpanW + unitPriceW, tableTop, extPriceW, 32).stroke();

    // Sub-headers for quantity
    doc.rect(30 + descW, tableTop + 16, reqW, 16).stroke();
    doc.rect(30 + descW + reqW, tableTop + 16, shipQtyW, 16).stroke();
    doc.rect(30 + descW + reqW + shipQtyW, tableTop + 16, boW, 16).stroke();

    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('PART NUMBER DESCRIPTION', 30, tableTop + 12, { width: descW, align: 'center' });
    doc.text('QUANTITY', 30 + descW, tableTop + 4, { width: qtySpanW, align: 'center' });
    doc.text('REQ.', 30 + descW, tableTop + 20, { width: reqW, align: 'center' });
    doc.text('SHIPPED', 30 + descW + reqW, tableTop + 20, { width: shipQtyW, align: 'center' });
    doc.text('B.O.', 30 + descW + reqW + shipQtyW, tableTop + 20, { width: boW, align: 'center' });
    
    doc.text('UNIT\nPRICE', 30 + descW + qtySpanW, tableTop + 6, { width: unitPriceW, align: 'center' });
    doc.text('EXTENDED\nPRICE', 30 + descW + qtySpanW + unitPriceW, tableTop + 6, { width: extPriceW, align: 'center' });

    let currentY = tableTop + 32;
    const items = data.items || [];
    
    items.forEach((item) => {
      const rowH = 28;
      doc.rect(30, currentY, descW, rowH).stroke();
      doc.rect(30 + descW, currentY, reqW, rowH).stroke();
      doc.rect(30 + descW + reqW, currentY, shipQtyW, rowH).stroke();
      doc.rect(30 + descW + reqW + shipQtyW, currentY, boW, rowH).stroke();
      doc.rect(30 + descW + qtySpanW, currentY, unitPriceW, rowH).stroke();
      doc.rect(30 + descW + qtySpanW + unitPriceW, currentY, extPriceW, rowH).stroke();

      const skuStr = item.sku || item.partNo || '';
      const nameStr = item.productName || item.name || item.description || '';
      const displayLabel = skuStr && nameStr ? `${skuStr} - ${nameStr}` : (nameStr || skuStr);
      doc.text(displayLabel, 34, currentY + 4, { width: descW - 8 });
      doc.text(String(item.quantity || 0), 30 + descW, currentY + 9, { width: reqW, align: 'center' });
      doc.text(String(item.shipped || item.quantity || 0), 30 + descW + reqW, currentY + 9, { width: shipQtyW, align: 'center' });
      doc.text(String(item.bo || 0), 30 + descW + reqW + shipQtyW, currentY + 9, { width: boW, align: 'center' });
      doc.text(Number(item.price || 0).toFixed(2), 30 + descW + qtySpanW, currentY + 9, { width: unitPriceW - 6, align: 'right' });
      const ext = Number(item.quantity || 0) * Number(item.price || 0);
      doc.text(ext.toFixed(2), 30 + descW + qtySpanW + unitPriceW, currentY + 9, { width: extPriceW - 6, align: 'right' });

      currentY += rowH;
    });

    // Totals Section
    const totalsLabels = [
      { label: 'Subtotal :', val: Number(data.subtotal || 0).toFixed(2) },
      { label: 'Less Discount :', val: Number(data.discount || 0).toFixed(2) },
      { label: 'Misc. Charge(Shipping) :', val: Number(data.shipping || 0).toFixed(2) },
      { label: 'Total Sales Tax :', val: Number(data.tax || 0).toFixed(2) },
      { label: 'Total amount :', val: Number(data.total || 0).toFixed(2) },
    ];

    totalsLabels.forEach((tot) => {
      const totH = 16;
      doc.rect(30, currentY, 460.1, totH).stroke();
      doc.rect(30 + 460.1, currentY, extPriceW, totH).stroke();
      doc.font('Helvetica').fontSize(9);
      doc.text(tot.label, 30, currentY + 4, { width: 454.1, align: 'right' });
      doc.text(tot.val, 30 + 460.1, currentY + 4, { width: extPriceW - 6, align: 'right' });
      currentY += totH;
    });

    // Comments box
    currentY += 10;
    doc.rect(30, currentY, 535, 14).stroke();
    doc.font('Helvetica-Bold').fontSize(8);
    doc.text('Comments:', 34, currentY + 3);

    currentY += 14;
    doc.rect(30, currentY, 535, 34).stroke();
    doc.font('Helvetica').fontSize(8);
    doc.text(
      'Adeeva Nutritionals Canada Inc. Will give a full refund or exchange on product purchased at regular price within 30 days of purchase.\n' +
      'Product purchased on sale will not be refunded or exchanged. To return items. please call 888-251-1010 for a Return Authorization Number',
      34, currentY + 4, { width: 527 }
    );

    currentY += 34;
    doc.rect(30, currentY, 535, 14).stroke();
    doc.font('Helvetica-Bold').fontSize(8);
    doc.text('HST#:89646 4393', 34, currentY + 3);

    // Footer page number
    doc.font('Helvetica').fontSize(8).fillColor('#666666');
    doc.text('1/1', 30, 750, { align: 'center', width: 535 });

    doc.end();
    writeStream.on('finish', () => resolve(outputPath));
    writeStream.on('error', reject);
  });
}

module.exports = { generateInvoicePdf };
