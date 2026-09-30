const ftp = require('basic-ftp');
const stream = require('stream');

/**
 * Maps carrier codes to clean display names
 */
function normalizeCarrier(carrierCode) {
  if (!carrierCode) return '';
  const code = carrierCode.trim().toUpperCase();
  if (code === 'PU' || code.includes('PUROLATOR')) return 'Purolator';
  if (code.includes('UNITED PARCEL SERVICE') || code === 'UPS') return 'UPS';
  if (code.includes('FEDEX')) return 'FedEx';
  if (code.includes('CANADA POST')) return 'Canada Post';
  return carrierCode.trim();
}

/**
 * Downloads a file from FTP into an in-memory string
 */
async function downloadFileContent(client, remotePath) {
  const chunks = [];
  const writable = new stream.Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    }
  });
  await client.downloadTo(writable, remotePath);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Fetches and parses all order-*.xml and shipment-*.xml from FTP folder (default: /for_adeeva)
 */
async function fetchFtpOrdersAndShipments(ftpConfig, targetFolder = '/for_adeeva') {
  const client = new ftp.Client();
  client.ftp.verbose = false;

  const orders = [];
  const shipments = [];

  try {
    await client.access({
      host: ftpConfig.host,
      port: ftpConfig.port ? parseInt(ftpConfig.port, 10) : 21,
      user: ftpConfig.user || 'anonymous',
      password: ftpConfig.password || '',
      secure: ftpConfig.secure === true || ftpConfig.secure === 'true' || ftpConfig.secure === 'explicit',
      secureOptions: { rejectUnauthorized: false }
    });

    const folder = targetFolder.trim() || '/for_adeeva';
    await client.cd(folder);
    const list = await client.list();

    const orderFiles = list.filter(f => !f.isDirectory && f.name.toLowerCase().startsWith('order-') && f.name.toLowerCase().endsWith('.xml'));
    const shipmentFiles = list.filter(f => !f.isDirectory && f.name.toLowerCase().startsWith('shipment-') && f.name.endsWith('.xml'));

    // 1. Parse Order Confirmation files
    for (const f of orderFiles) {
      try {
        const xml = await downloadFileContent(client, f.name);
        const poMatch = xml.match(/customer_po=["']([^"']+)["']/i);
        const ccmMatch = xml.match(/<ccm_order_id>([^<]+)<\/ccm_order_id>/i);
        const statusMatch = xml.match(/<status>([^<]+)<\/status>/i);

        const orderNumber = poMatch ? poMatch[1].trim() : '';
        const ccmOrderId = ccmMatch ? ccmMatch[1].trim() : '';
        const status = statusMatch ? statusMatch[1].trim() : '';

        if (orderNumber || ccmOrderId) {
          orders.push({
            fileName: f.name,
            orderNumber,
            ccmOrderId,
            status,
            date: f.rawModifiedAt || (f.modifiedAt ? f.modifiedAt.toISOString() : '')
          });
        }
      } catch (err) {
        console.warn(`[SheetSync] Failed to parse order file ${f.name}:`, err.message);
      }
    }

    // 2. Parse Shipment files
    for (const f of shipmentFiles) {
      try {
        const xml = await downloadFileContent(client, f.name);
        
        const carrierMatch = xml.match(/<carrier_code>([^<]+)<\/carrier_code>/i);
        const dateMatch = xml.match(/<shipment_date>([^<]+)<\/shipment_date>/i);
        const waybillMatch = xml.match(/<waybill>([^<]+)<\/waybill>/i);

        const rawCarrier = carrierMatch ? carrierMatch[1].trim() : '';
        const carrier = normalizeCarrier(rawCarrier);
        const dateShipped = dateMatch ? dateMatch[1].trim() : '';
        const waybill = waybillMatch ? waybillMatch[1].trim() : '';

        const orderRegex = /<order\s+([^>]+)>/gi;
        let match;
        while ((match = orderRegex.exec(xml)) !== null) {
          const attrs = match[1];
          const ccmM = attrs.match(/ccm_order_id=["']([^"']+)["']/i);
          const custM = attrs.match(/customer_order_id=["']([^"']+)["']/i);

          const ccmOrderId = ccmM ? ccmM[1].trim() : '';
          const orderNumber = custM ? custM[1].trim() : '';

          if (ccmOrderId || orderNumber) {
            shipments.push({
              fileName: f.name,
              ccmOrderId,
              orderNumber,
              carrier,
              rawCarrier,
              waybill,
              dateShipped
            });
          }
        }
      } catch (err) {
        console.warn(`[SheetSync] Failed to parse shipment file ${f.name}:`, err.message);
      }
    }

    client.close();

    return {
      success: true,
      folder,
      orderFilesCount: orderFiles.length,
      shipmentFilesCount: shipmentFiles.length,
      orders,
      shipments
    };
  } catch (err) {
    client.close();
    return {
      success: false,
      message: `FTP read error: ${err.message}`
    };
  }
}

/**
 * Sends parsed orders and shipments to the Google Apps Script Webhook
 */
async function sendToGoogleSheetWebhook(webhookUrl, payload) {
  if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) {
    throw new Error('Invalid or missing Google Apps Script Webhook URL.');
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    redirect: 'follow'
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (_) {
    return {
      status: response.ok ? 'success' : 'error',
      rawResponse: text
    };
  }
}

/**
 * Tests connection to Google Apps Script Webhook URL
 */
async function testGoogleWebhook(webhookUrl) {
  if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) {
    return { success: false, message: 'Invalid URL. Please enter a valid Google Apps Script Web App URL.' };
  }

  const cleanUrl = webhookUrl.trim();
  if (cleanUrl.includes('docs.google.com/spreadsheets')) {
    return {
      success: false,
      message: 'This is a Google Sheet document link. To allow Adeeva Catalyst to write into it, please deploy the 1-minute Google Apps Script Web App (click instructions below) and paste the script Web App URL (ends in /exec).'
    };
  }

  try {
    // Try POST with test action
    const response = await fetch(cleanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test', timestamp: new Date().toISOString() }),
      redirect: 'follow'
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = { raw: text };
    }

    if (response.ok) {
      return {
        success: true,
        message: data.message || 'Connected to Google Apps Script Webhook successfully!',
        data
      };
    } else {
      return {
        success: false,
        message: `HTTP ${response.status}: ${response.statusText}`,
        data
      };
    }
  } catch (err) {
    return {
      success: false,
      message: `Failed to connect to webhook: ${err.message}`
    };
  }
}

/**
 * Moves ONLY the shipment file into /for_adeeva/archive/YYYY-MM-DD/
 * and updates Google Sheet last 4 columns if configured.
 */
async function archiveShipmentFile(ftpConfig, shipmentFileName, ccmOrderId, webhookUrl, sheetUrl) {
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: ftpConfig.host,
      port: ftpConfig.port ? parseInt(ftpConfig.port, 10) : 21,
      user: ftpConfig.user || 'anonymous',
      password: ftpConfig.password || '',
      secure: ftpConfig.secure === true || ftpConfig.secure === 'true' || ftpConfig.secure === 'explicit',
      secureOptions: { rejectUnauthorized: false }
    });

    const baseFolder = '/for_adeeva';
    await client.cd(baseFolder);

    // Parse shipment XML details for archiving and Google Sheet update
    let targetCcmId = (ccmOrderId || '').trim();
    let carrier = '';
    let waybill = '';
    let dateShipped = '';
    let customerOrderId = '';

    if (shipmentFileName) {
      try {
        const shipmentXml = await downloadFileContent(client, shipmentFileName);
        const match = shipmentXml.match(/ccm_order_id=["']([^"']+)["']/i) || shipmentXml.match(/<ccm_order_id>([^<]+)<\/ccm_order_id>/i);
        if (match && !targetCcmId) targetCcmId = (match[1] || match[2] || '').trim();

        const custM = shipmentXml.match(/customer_order_id=["']([^"']+)["']/i) || shipmentXml.match(/<customer_order_id>([^<]+)<\/customer_order_id>/i);
        if (custM) customerOrderId = (custM[1] || custM[2] || '').trim();

        const carrierM = shipmentXml.match(/<carrier_code>([^<]+)<\/carrier_code>/i) || shipmentXml.match(/carrier_code=["']([^"']+)["']/i);
        if (carrierM) carrier = normalizeCarrier(carrierM[1] || carrierM[2] || '');

        const waybillM = shipmentXml.match(/<waybill>([^<]+)<\/waybill>/i) || shipmentXml.match(/waybill=["']([^"']+)["']/i);
        if (waybillM) waybill = (waybillM[1] || waybillM[2] || '').trim();

        const dateM = shipmentXml.match(/<shipment_date>([^<]+)<\/shipment_date>/i) || shipmentXml.match(/shipment_date=["']([^"']+)["']/i);
        if (dateM) {
          const rawDate = (dateM[1] || dateM[2] || '').trim();
          dateShipped = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;
        }
      } catch (e) {
        console.warn('Could not read shipment XML:', e.message);
      }
    }

    // Try to find customer_po from any matching order file for exact Sheet matching
    let customerPo = '';
    if (targetCcmId) {
      try {
        const list = await client.list();
        const orderFiles = list.filter(f => !f.isDirectory && f.name.toLowerCase().startsWith('order-') && f.name.toLowerCase().endsWith('.xml'));
        for (const ofile of orderFiles) {
          try {
            const orderXml = await downloadFileContent(client, ofile.name);
            const ccmMatch = orderXml.match(/<ccm_order_id>([^<]+)<\/ccm_order_id>/i) || orderXml.match(/ccm_order_id=["']([^"']+)["']/i);
            if (ccmMatch && (ccmMatch[1] || ccmMatch[2] || '').trim() === targetCcmId) {
              const poMatch = orderXml.match(/customer_po=["']([^"']+)["']/i) || orderXml.match(/<customer_po>([^<]+)<\/customer_po>/i);
              if (poMatch && !customerPo) customerPo = (poMatch[1] || poMatch[2] || '').trim();
              break;
            }
          } catch (_) {}
        }
      } catch (_) {}
    }

    // Format current date as YYYY-MM-DD
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Target archive folder: archive/YYYY-MM-DD
    const archiveRelPath = `archive/${dateStr}`;
    await client.ensureDir(archiveRelPath);
    await client.cd(baseFolder);

    // Move ONLY shipment file
    const destShipment = `archive/${dateStr}/${shipmentFileName}`;
    await client.rename(shipmentFileName, destShipment);

    client.close();

    // Update Google Sheet if webhook configured
    let sheetResult = null;
    const targetUrl = (webhookUrl || '').trim();
    if (targetUrl) {
      try {
        const sheetPayload = {
          action: 'update_shipment_columns',
          sheetUrl: sheetUrl || '',
          orderNumber: customerPo || customerOrderId || '',
          orderId: customerOrderId || (customerPo ? customerPo.replace(/\D/g, '') : ''),
          ccmOrderId: targetCcmId || '',
          carrier: carrier || '',
          waybill: waybill || '',
          dateShipped: dateShipped || ''
        };
        sheetResult = await sendToGoogleSheetWebhook(targetUrl, sheetPayload);
      } catch (sheetErr) {
        console.warn('Google Sheet update error on archive:', sheetErr.message);
        sheetResult = { status: 'error', message: sheetErr.message };
      }
    }

    let resultMsg = `Successfully moved shipment ${shipmentFileName} to archive/${dateStr}/`;
    if (sheetResult && sheetResult.status === 'success') {
      resultMsg += ` and updated Google Sheet (Row ${sheetResult.matchedRow || ''}) with shipment details!`;
    } else if (sheetResult && sheetResult.message) {
      resultMsg += ` (Sheet update: ${sheetResult.message})`;
    }

    return {
      success: true,
      dateFolder: dateStr,
      archivePath: `/for_adeeva/archive/${dateStr}`,
      movedShipment: shipmentFileName,
      sheetResult,
      message: resultMsg
    };

  } catch (err) {
    client.close();
    return {
      success: false,
      message: `FTP operation error: ${err.message}`
    };
  }
}

/**
 * Moves ONLY the order file into /for_adeeva/archive/YYYY-MM-DD/
 * and updates Google Sheet CCM Order ID if configured.
 */
async function archiveOrderFile(ftpConfig, orderFileName, ccmOrderId, orderNumber, webhookUrl, sheetUrl) {
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: ftpConfig.host,
      port: ftpConfig.port ? parseInt(ftpConfig.port, 10) : 21,
      user: ftpConfig.user || 'anonymous',
      password: ftpConfig.password || '',
      secure: ftpConfig.secure === true || ftpConfig.secure === 'true' || ftpConfig.secure === 'explicit',
      secureOptions: { rejectUnauthorized: false }
    });

    const baseFolder = '/for_adeeva';
    await client.cd(baseFolder);

    let targetCcmId = (ccmOrderId || '').trim();
    let targetOrderNum = (orderNumber || '').trim();
    let customerOrderId = '';

    if (orderFileName) {
      try {
        const orderXml = await downloadFileContent(client, orderFileName);
        const ccmMatch = orderXml.match(/<ccm_order_id>([^<]+)<\/ccm_order_id>/i) || orderXml.match(/ccm_order_id=["']([^"']+)["']/i);
        if (ccmMatch && !targetCcmId) targetCcmId = (ccmMatch[1] || ccmMatch[2] || '').trim();

        const poMatch = orderXml.match(/customer_po=["']([^"']+)["']/i) || orderXml.match(/<customer_po>([^<]+)<\/customer_po>/i);
        if (poMatch && !targetOrderNum) targetOrderNum = (poMatch[1] || poMatch[2] || '').trim();

        const custMatch = orderXml.match(/customer_order_id=["']([^"']+)["']/i) || orderXml.match(/<customer_order_id>([^<]+)<\/customer_order_id>/i);
        if (custMatch) customerOrderId = (custMatch[1] || custMatch[2] || '').trim();
      } catch (e) {
        console.warn('Could not read order XML:', e.message);
      }
    }

    // Format current date as YYYY-MM-DD
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Target archive folder: archive/YYYY-MM-DD
    const archiveRelPath = `archive/${dateStr}`;
    await client.ensureDir(archiveRelPath);
    await client.cd(baseFolder);

    // Move ONLY order file
    const destOrder = `archive/${dateStr}/${orderFileName}`;
    await client.rename(orderFileName, destOrder);

    client.close();

    // Update Google Sheet if webhook configured
    let sheetResult = null;
    const targetUrl = (webhookUrl || '').trim();
    if (targetUrl) {
      try {
        const sheetPayload = {
          action: 'update_order_ccm',
          sheetUrl: sheetUrl || '',
          orderNumber: targetOrderNum,
          orderId: customerOrderId || (targetOrderNum ? targetOrderNum.replace(/\D/g, '') : ''),
          ccmOrderId: targetCcmId
        };
        sheetResult = await sendToGoogleSheetWebhook(targetUrl, sheetPayload);
      } catch (sheetErr) {
        console.warn('Google Sheet update error on archive:', sheetErr.message);
        sheetResult = { status: 'error', message: sheetErr.message };
      }
    }

    let resultMsg = `Successfully moved order ${orderFileName} to archive/${dateStr}/`;
    if (sheetResult && sheetResult.status === 'success') {
      resultMsg += ` and updated Google Sheet (Row ${sheetResult.matchedRow || ''}) with CCM Order ID!`;
    } else if (sheetResult && sheetResult.message) {
      resultMsg += ` (Sheet update: ${sheetResult.message})`;
    }

    return {
      success: true,
      dateFolder: dateStr,
      archivePath: `/for_adeeva/archive/${dateStr}`,
      movedOrder: orderFileName,
      sheetResult,
      message: resultMsg
    };

  } catch (err) {
    client.close();
    return {
      success: false,
      message: `FTP operation error: ${err.message}`
    };
  }
}

module.exports = {
  fetchFtpOrdersAndShipments,
  sendToGoogleSheetWebhook,
  testGoogleWebhook,
  archiveShipmentAndOrder: archiveShipmentFile,
  archiveShipmentFile,
  archiveOrderFile,
  normalizeCarrier
};
