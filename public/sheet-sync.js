document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const previewBtn = document.getElementById('previewBtn');
  const syncLog = document.getElementById('syncLog');
  const statusBanner = document.getElementById('statusBanner');
  const orderCountBadge = document.getElementById('orderCountBadge');
  const shipmentCountBadge = document.getElementById('shipmentCountBadge');
  const targetArchiveBadge = document.getElementById('targetArchiveBadge');
  const tabOrderCount = document.getElementById('tabOrderCount');
  const tabShipmentCount = document.getElementById('tabShipmentCount');
  const ordersTableBody = document.getElementById('ordersTableBody');
  const shipmentsTableBody = document.getElementById('shipmentsTableBody');

  // Google Sheet Webhook Elements
  const sheetWebhookUrl = document.getElementById('sheetWebhookUrl');
  const saveWebhookBtn = document.getElementById('saveWebhookBtn');
  const testWebhookBtn = document.getElementById('testWebhookBtn');
  const copyScriptBtn = document.getElementById('copyScriptBtn');
  const scriptCodePre = document.getElementById('scriptCodePre');
  const sheetStatusDot = document.getElementById('sheetStatusDot');
  const sheetStatusText = document.getElementById('sheetStatusText');

  // Complete Google Apps Script tailored for the 14 columns
  const APPS_SCRIPT_CODE = `/**
 * Adeeva Catalyst - Google Sheet Auto-Update Webhook
 * Automatically updates the last 4 columns (11, 12, 13, 14)
 * when orders & shipments are archived from FTP.
 * 
 * Columns:
 * 1: No | 2: Order ID | 3: Order Number | 4: Customer Number | 5: Customer Name
 * 6: Email | 7: Phone | 8: Order Status | 9: Comments | 10: Added by
 * 11: CCM Order ID | 12: Shipment Carrier | 13: Waybill Number | 14: Date of Shipped
 */
function doPost(e) {
  try {
    var contents = e.postData ? e.postData.contents : '';
    var data = JSON.parse(contents);
    
    // Support active sheet or specific sheet by URL
    var ss = data.sheetUrl ? SpreadsheetApp.openByUrl(data.sheetUrl) : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Could not access spreadsheet.'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var sheet = ss.getActiveSheet();
    var lastRow = sheet.getLastRow();
    
    // Test action connection ping
    if (data.action === 'test') {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Adeeva Catalyst Webhook connected successfully to ' + sheet.getName() + ' (' + lastRow + ' rows).'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Target order numbers / identifiers
    var targetOrderNum = String(data.orderNumber || '').trim().toLowerCase();
    var targetOrderId = String(data.orderId || '').trim().toLowerCase();
    var targetCcmId = String(data.ccmOrderId || '').trim().toLowerCase();
    var targetOrderNumDigits = targetOrderNum.replace(/\\D/g, '');
    var targetOrderIdDigits = targetOrderId.replace(/\\D/g, '');

    var matchedRow = -1;
    
    if (lastRow >= 2) {
      var values = sheet.getRange(2, 1, lastRow - 1, 14).getValues();
      
      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var rowOrderId = String(row[1] || '').trim().toLowerCase();     // Col 2: Order ID
        var rowOrderNum = String(row[2] || '').trim().toLowerCase();    // Col 3: Order Number
        var rowCcmId = String(row[10] || '').trim().toLowerCase();      // Col 11: CCM Order ID
        
        var rowOrderNumDigits = rowOrderNum.replace(/\\D/g, '');
        var rowOrderIdDigits = rowOrderId.replace(/\\D/g, '');
        
        var isMatch = false;
        // 1. Direct match on Order Number
        if (targetOrderNum && rowOrderNum && rowOrderNum === targetOrderNum) isMatch = true;
        // 2. Direct match on Order ID
        else if (targetOrderId && rowOrderId && rowOrderId === targetOrderId) isMatch = true;
        // 3. Cross-match Order ID with Order Number
        else if (targetOrderId && rowOrderNum && rowOrderNum === targetOrderId) isMatch = true;
        else if (targetOrderNum && rowOrderId && rowOrderId === targetOrderNum) isMatch = true;
        // 4. Numeric digits match (e.g. ADE-10542 matches 10542)
        else if (targetOrderNumDigits && rowOrderNumDigits && rowOrderNumDigits === targetOrderNumDigits) isMatch = true;
        else if (targetOrderIdDigits && rowOrderIdDigits && rowOrderIdDigits === targetOrderIdDigits) isMatch = true;
        else if (targetOrderNumDigits && rowOrderIdDigits && rowOrderIdDigits === targetOrderNumDigits) isMatch = true;
        // 5. Match by CCM Order ID if already recorded
        else if (targetCcmId && rowCcmId && rowCcmId === targetCcmId) isMatch = true;
        
        if (isMatch) {
          matchedRow = i + 2;
          break;
        }
      }
    }
    
    if (matchedRow > 0) {
      // Order-only update (when order file is archived)
      if (data.action === 'update_order_ccm') {
        if (data.ccmOrderId) sheet.getRange(matchedRow, 11).setValue(data.ccmOrderId);     // Col 11: CCM Order ID
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          matchedRow: matchedRow,
          orderNumber: data.orderNumber,
          ccmOrderId: data.ccmOrderId,
          message: 'Successfully updated row ' + matchedRow + ' with CCM Order ID!'
        })).setMimeType(ContentService.MimeType.JSON);
      }

      // Shipment update (when shipment file is archived):
      if (data.ccmOrderId) sheet.getRange(matchedRow, 11).setValue(data.ccmOrderId);     // Col 11: CCM Order ID
      if (data.carrier) sheet.getRange(matchedRow, 12).setValue(data.carrier);           // Col 12: Shipment Carrier
      if (data.waybill) sheet.getRange(matchedRow, 13).setValue(String(data.waybill));   // Col 13: Waybill Number
      if (data.dateShipped) sheet.getRange(matchedRow, 14).setValue(data.dateShipped);   // Col 14: Date of Shipped
      
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        matchedRow: matchedRow,
        orderNumber: data.orderNumber,
        ccmOrderId: data.ccmOrderId,
        carrier: data.carrier,
        waybill: data.waybill,
        dateShipped: data.dateShipped,
        message: 'Successfully updated row ' + matchedRow + ' with shipment details!'
      })).setMimeType(ContentService.MimeType.JSON);
    } else {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'not_found',
        message: 'No matching row found for Order Number: "' + data.orderNumber + '" or ID: "' + data.orderId + '".'
      })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ready',
    message: 'Adeeva Catalyst Google Sheet Webhook is active and waiting for requests.'
  })).setMimeType(ContentService.MimeType.JSON);
}`;

  // Populate script in the code box
  if (scriptCodePre) {
    scriptCodePre.textContent = APPS_SCRIPT_CODE;
  }

  // Display today's target archive directory
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (targetArchiveBadge) {
    targetArchiveBadge.textContent = `/archive/${todayStr}/`;
  }

  // Local state for loaded files
  let currentOrders = [];
  let currentShipments = [];

  // Tab switching matching main page chips
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.classList.remove('active-chip');
      });
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      btn.classList.add('active-chip');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  // Banner helper
  function showBanner(type, message) {
    statusBanner.className = `status-banner show ${type}`;
    statusBanner.textContent = message;
    statusBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Logger helper
  function log(msg) {
    const time = new Date().toLocaleTimeString();
    syncLog.textContent += `\n[${time}] ${msg}`;
    syncLog.scrollTop = syncLog.scrollHeight;
  }

  // Copy Apps Script code
  copyScriptBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_CODE);
      const originalText = copyScriptBtn.innerHTML;
      copyScriptBtn.innerHTML = `✓ Copied!`;
      setTimeout(() => {
        copyScriptBtn.innerHTML = originalText;
      }, 2000);
    } catch (_) {
      showBanner('error', 'Could not copy automatically. Please select and copy the code box manually.');
    }
  });

  // Load initial Google Sheet Webhook configuration
  async function loadWebhookConfig() {
    try {
      const res = await fetch('/api/sheet-sync/status');
      const data = await res.json();
      if (data.webhookUrl) {
        sheetWebhookUrl.value = data.webhookUrl;
        updateSheetBadge(true, 'Connected & Ready');
      } else {
        updateSheetBadge(false, 'Not Configured');
      }
    } catch (_) {
      updateSheetBadge(false, 'Status Unknown');
    }
  }

  function updateSheetBadge(connected, text) {
    if (!sheetStatusDot || !sheetStatusText) return;
    if (connected) {
      sheetStatusDot.style.background = '#0f9d58';
      sheetStatusText.textContent = text || 'Connected & Ready';
      sheetStatusText.parentElement.style.color = '#0f9d58';
      sheetStatusText.parentElement.style.background = 'rgba(15, 157, 88, 0.1)';
      sheetStatusText.parentElement.style.border = '1px solid rgba(15, 157, 88, 0.3)';
    } else {
      sheetStatusDot.style.background = '#94a3b8';
      sheetStatusText.textContent = text || 'Not Configured';
      sheetStatusText.parentElement.style.color = '#64748b';
      sheetStatusText.parentElement.style.background = '#f1f5f9';
      sheetStatusText.parentElement.style.border = '1px solid var(--border-light)';
    }
  }

  loadWebhookConfig();

  // Save Webhook URL
  saveWebhookBtn?.addEventListener('click', async () => {
    const url = (sheetWebhookUrl?.value || '').trim();
    if (!url) {
      showBanner('error', 'Please enter a Google Apps Script Web App URL.');
      return;
    }

    saveWebhookBtn.disabled = true;
    saveWebhookBtn.textContent = 'Saving...';
    try {
      const res = await fetch('/api/sheet-sync/save-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: url })
      });
      const data = await res.json();
      if (data.success) {
        showBanner('success', 'Google Sheet Webhook URL saved successfully!');
        log('[Google Sheet] Webhook URL configured and saved.');
        updateSheetBadge(true, 'Saved');
      } else {
        showBanner('error', data.message || 'Failed to save URL.');
      }
    } catch (err) {
      showBanner('error', 'Error saving URL: ' + err.message);
    } finally {
      saveWebhookBtn.disabled = false;
      saveWebhookBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Save URL
      `;
    }
  });

  // Test Webhook Connection
  testWebhookBtn?.addEventListener('click', async () => {
    const url = (sheetWebhookUrl?.value || '').trim();
    if (!url) {
      showBanner('error', 'Please enter a Google Apps Script Web App URL first.');
      return;
    }

    testWebhookBtn.disabled = true;
    testWebhookBtn.textContent = 'Testing...';
    log('[Google Sheet] Testing connection to Webhook...');

    try {
      const res = await fetch('/api/sheet-sync/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: url })
      });
      const data = await res.json();
      if (data.success) {
        showBanner('success', `✓ Webhook connection verified! ${data.message || ''}`);
        log(`[Google Sheet SUCCESS] ${data.message || 'Connected successfully'}`);
        updateSheetBadge(true, 'Verified Active');
      } else {
        showBanner('error', `Connection test failed: ${data.message}`);
        log(`[Google Sheet ERROR] ${data.message}`);
        updateSheetBadge(false, 'Test Failed');
      }
    } catch (err) {
      showBanner('error', 'Network error testing webhook: ' + err.message);
      log(`[Google Sheet ERROR] ${err.message}`);
    } finally {
      testWebhookBtn.disabled = false;
      testWebhookBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        Test Connection
      `;
    }
  });

  // Fetch & Preview FTP Data
  previewBtn?.addEventListener('click', async () => {
    previewBtn.disabled = true;
    previewBtn.textContent = 'Reading FTP...';
    log('Connecting to FTP and fetching files from /for_adeeva...');

    try {
      const res = await fetch('/api/sheet-sync/preview');
      const data = await res.json();

      if (!data.success) {
        showBanner('error', data.message || 'Failed to read from FTP.');
        log(`FTP error: ${data.message}`);
        return;
      }

      currentOrders = data.orders || [];
      currentShipments = data.shipments || [];

      orderCountBadge.textContent = `${currentOrders.length} files`;
      shipmentCountBadge.textContent = `${currentShipments.length} files`;
      tabOrderCount.textContent = currentOrders.length;
      tabShipmentCount.textContent = currentShipments.length;

      renderOrdersTable(currentOrders);
      renderShipmentsTable(currentShipments);

      showBanner('info', `Successfully read ${currentOrders.length} order confirmations and ${currentShipments.length} shipment files from FTP /for_adeeva.`);
      log(`Found ${currentOrders.length} order files and ${currentShipments.length} shipment items.`);
    } catch (err) {
      showBanner('error', 'Failed to fetch FTP preview: ' + err.message);
      log(`Error: ${err.message}`);
    } finally {
      previewBtn.disabled = false;
      previewBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        Fetch &amp; Preview FTP Data
      `;
    }
  });

  // Move ONLY shipment file to archive/YYYY-MM-DD/ and update Google Sheet
  async function handleArchiveShipment(fileName, ccmOrderId) {
    const n = new Date();
    const dateStr = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    const confirmMsg = `Move shipment file "${fileName}" to /for_adeeva/archive/${dateStr}/?`;
    if (!confirm(confirmMsg)) return;

    const currentWebhookUrl = (sheetWebhookUrl?.value || '').trim();

    log(`[Archive] Moving shipment file ${fileName}...`);
    showBanner('info', `Moving ${fileName} to /for_adeeva/archive/${dateStr}/...`);

    try {
      const res = await fetch('/api/sheet-sync/archive-shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipmentFileName: fileName,
          ccmOrderId: ccmOrderId,
          webhookUrl: currentWebhookUrl
        })
      });
      const data = await res.json();

      if (data.success) {
        const folderName = data.dateFolder || dateStr;
        const msg = data.message || `Moved ${fileName} to archive/${folderName}/`;
        showBanner('success', msg);
        log(`[Archive SUCCESS] ${msg}`);

        if (data.sheetResult) {
          if (data.sheetResult.status === 'success') {
            log(`[Google Sheet SUCCESS] Row ${data.sheetResult.matchedRow} updated! Filled Col 11 (CCM ID: ${data.sheetResult.ccmOrderId || '-'}), Col 12 (Carrier: ${data.sheetResult.carrier || '-'}), Col 13 (Waybill: ${data.sheetResult.waybill || '-'}), Col 14 (Date: ${data.sheetResult.dateShipped || '-'})`);
          } else if (data.sheetResult.message) {
            log(`[Google Sheet NOTICE] ${data.sheetResult.message}`);
          }
        }

        // Mark only this shipment as moved
        currentShipments.forEach(s => {
          if (s.fileName === fileName) {
            s.isMoved = true;
            s.movedDate = folderName;
          }
        });

        // Update badge counts for remaining active shipments
        const activeShipments = currentShipments.filter(s => !s.isMoved).length;
        shipmentCountBadge.textContent = `${activeShipments} files`;
        tabShipmentCount.textContent = activeShipments;

        // Re-render shipments table
        renderShipmentsTable(currentShipments);
      } else {
        showBanner('error', `Failed to archive shipment: ${data.message}`);
        log(`[Archive FAILED] ${data.message}`);
      }
    } catch (err) {
      showBanner('error', `Network error archiving shipment: ${err.message}`);
      log(`[Archive ERROR] ${err.message}`);
    }
  }

  // Move ONLY order file to archive/YYYY-MM-DD/ and update Google Sheet CCM ID
  async function handleArchiveOrder(fileName, ccmOrderId, orderNumber) {
    const n = new Date();
    const dateStr = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    const confirmMsg = `Move order file "${fileName}" (PO #${orderNumber || 'N/A'}) to /for_adeeva/archive/${dateStr}/?`;
    if (!confirm(confirmMsg)) return;

    const currentWebhookUrl = (sheetWebhookUrl?.value || '').trim();

    log(`[Archive] Moving order file ${fileName}...`);
    showBanner('info', `Moving ${fileName} to /for_adeeva/archive/${dateStr}/...`);

    try {
      const res = await fetch('/api/sheet-sync/archive-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderFileName: fileName,
          ccmOrderId: ccmOrderId,
          orderNumber: orderNumber,
          webhookUrl: currentWebhookUrl
        })
      });
      const data = await res.json();

      if (data.success) {
        const folderName = data.dateFolder || dateStr;
        const msg = data.message || `Moved ${fileName} to archive/${folderName}/`;
        showBanner('success', msg);
        log(`[Archive SUCCESS] ${msg}`);

        if (data.sheetResult) {
          if (data.sheetResult.status === 'success') {
            log(`[Google Sheet SUCCESS] Row ${data.sheetResult.matchedRow} updated with CCM Order ID (${data.sheetResult.ccmOrderId || '-'})`);
          } else if (data.sheetResult.message) {
            log(`[Google Sheet NOTICE] ${data.sheetResult.message}`);
          }
        }

        // Mark only this order as moved
        currentOrders.forEach(o => {
          if (o.fileName === fileName) {
            o.isMoved = true;
            o.movedDate = folderName;
          }
        });

        // Update badge counts for remaining active orders
        const activeOrders = currentOrders.filter(o => !o.isMoved).length;
        orderCountBadge.textContent = `${activeOrders} files`;
        tabOrderCount.textContent = activeOrders;

        // Re-render orders table
        renderOrdersTable(currentOrders);
      } else {
        showBanner('error', `Failed to archive order: ${data.message}`);
        log(`[Archive FAILED] ${data.message}`);
      }
    } catch (err) {
      showBanner('error', `Network error archiving order: ${err.message}`);
      log(`[Archive ERROR] ${err.message}`);
    }
  }

  function renderOrdersTable(orders) {
    if (!orders || orders.length === 0) {
      ordersTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding: 2rem;">No order files found in /for_adeeva.</td></tr>`;
      return;
    }

    ordersTableBody.innerHTML = orders.map(o => {
      const isMoved = !!o.isMoved;
      const statusBadge = `<span class="history-ftp-badge uploaded">${escapeHtml(o.status || 'success')}</span>`;

      const actionHtml = isMoved
        ? `<span class="moved-badge">Moved (${escapeHtml(o.movedDate)})</span>`
        : `<button type="button" class="btn btn-secondary btn-sm move-order-btn" data-file="${escapeHtml(o.fileName)}" data-ccm="${escapeHtml(o.ccmOrderId || '')}" data-po="${escapeHtml(o.orderNumber || '')}" style="font-size:0.75rem; padding: 0.35rem 0.75rem;" title="Move order file to archive">
             <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:4px;">
               <polyline points="21 8 21 21 3 21 3 8"></polyline>
               <rect x="1" y="3" width="22" height="5"></rect>
               <line x1="10" y1="12" x2="14" y2="12"></line>
             </svg>
             Move to Archive
           </button>`;

      const fileNameHtml = isMoved
        ? `<span class="moved-badge" style="text-decoration: line-through;">${escapeHtml(o.fileName)}</span>`
        : `<a href="javascript:void(0)" class="file-link order-link" data-file="${escapeHtml(o.fileName)}" data-ccm="${escapeHtml(o.ccmOrderId || '')}" data-po="${escapeHtml(o.orderNumber || '')}" title="Click to move order to archive">${escapeHtml(o.fileName)}</a>`;

      return `
        <tr style="${isMoved ? 'background:#f8fafc; opacity:0.75;' : ''}">
          <td>${fileNameHtml}</td>
          <td><span class="order-pill">${escapeHtml(o.orderNumber || '-')}</span></td>
          <td><span class="ccm-pill">${escapeHtml(o.ccmOrderId || '-')}</span></td>
          <td>${statusBadge}</td>
          <td style="color:var(--text-muted); font-size:0.8rem;">${escapeHtml(o.date ? new Date(o.date).toLocaleString() : '-')}</td>
          <td>${actionHtml}</td>
        </tr>
      `;
    }).join('');

    // Attach click listeners to order buttons and file links
    ordersTableBody.querySelectorAll('.move-order-btn, .order-link').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const f = el.dataset.file;
        const ccm = el.dataset.ccm;
        const po = el.dataset.po;
        handleArchiveOrder(f, ccm, po);
      });
    });
  }

  function renderShipmentsTable(shipments) {
    if (!shipments || shipments.length === 0) {
      shipmentsTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding: 2rem;">No shipment files found in /for_adeeva.</td></tr>`;
      return;
    }

    shipmentsTableBody.innerHTML = shipments.map(s => {
      const isMoved = !!s.isMoved;
      const actionHtml = isMoved
        ? `<span class="moved-badge">Moved (${escapeHtml(s.movedDate)})</span>`
        : `<button type="button" class="btn btn-secondary btn-sm move-btn" data-file="${escapeHtml(s.fileName)}" data-ccm="${escapeHtml(s.ccmOrderId || '')}" style="font-size:0.75rem; padding: 0.35rem 0.75rem;" title="Move shipment file to archive">
             <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:4px;">
               <polyline points="21 8 21 21 3 21 3 8"></polyline>
               <rect x="1" y="3" width="22" height="5"></rect>
               <line x1="10" y1="12" x2="14" y2="12"></line>
             </svg>
             Move to Archive
           </button>`;

      const fileNameHtml = isMoved
        ? `<span class="moved-badge" style="text-decoration: line-through;">${escapeHtml(s.fileName)}</span>`
        : `<a href="javascript:void(0)" class="file-link shipment-link" data-file="${escapeHtml(s.fileName)}" data-ccm="${escapeHtml(s.ccmOrderId || '')}" title="Click to move shipment to archive">${escapeHtml(s.fileName)}</a>`;

      return `
        <tr style="${isMoved ? 'background:#f8fafc; opacity:0.75;' : ''}">
          <td>${fileNameHtml}</td>
          <td><span class="ccm-pill">${escapeHtml(s.ccmOrderId || '-')}</span></td>
          <td><span class="order-pill">${escapeHtml(s.orderNumber || '-')}</span></td>
          <td><span class="carrier-badge">${escapeHtml(s.carrier || s.rawCarrier || '-')}</span></td>
          <td style="font-family:'JetBrains Mono', monospace; font-size:0.82rem; font-weight:600;">${escapeHtml(s.waybill || '-')}</td>
          <td style="color:var(--text-muted); font-size:0.8rem;">${escapeHtml(s.dateShipped || '-')}</td>
          <td>${actionHtml}</td>
        </tr>
      `;
    }).join('');

    // Attach click listeners to buttons and file links
    shipmentsTableBody.querySelectorAll('.move-btn, .shipment-link').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const f = el.dataset.file;
        const ccm = el.dataset.ccm;
        handleArchiveShipment(f, ccm);
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
});
