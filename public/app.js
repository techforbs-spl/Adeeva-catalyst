// Adeeva Catalyst Frontend Application Logic

// State management
let state = {
  items: [],
  currentOrderNo: '',
  generatedFiles: [],
  previews: {}
};

// DOM Elements
const orderForm = document.getElementById('order-form');
const itemsBody = document.getElementById('items-body');
const btnAddItem = document.getElementById('btn-add-item');
const btnGenerate = document.getElementById('btn-generate');
const btnUploadFtp = document.getElementById('btn-upload-ftp');
const btnDownloadZip = document.getElementById('btn-download-zip');
const btnLoadSample = document.getElementById('btn-load-sample');
const btnClearForm = document.getElementById('btn-clear-form');

const btnTestFtp = document.getElementById('btn-test-ftp');
const btnSaveFtp = document.getElementById('btn-save-ftp');
const ftpStatusBadge = document.getElementById('ftp-status-badge');

const sameAsBillToCheckbox = document.getElementById('sameAsBillTo');
const shipToFieldsContainer = document.getElementById('shipToFieldsContainer');
const shipToSyncNotice = document.getElementById('shipToSyncNotice');

const previewModal = document.getElementById('preview-modal');
const previewModalTitle = document.getElementById('preview-modal-title');
const previewModalBody = document.getElementById('preview-modal-body');
const btnClosePreview = document.getElementById('btn-close-preview');

const ftpModal = document.getElementById('ftp-modal');
const ftpModalTitle = document.getElementById('ftp-modal-title');
const ftpStatusMessage = document.getElementById('ftp-status-message');
const ftpChecklist = document.getElementById('ftp-checklist');
const btnCloseFtpModal = document.getElementById('btn-close-ftp-modal');
const btnFtpDone = document.getElementById('btn-ftp-done');

// FTP Browser Modal DOM Elements
const btnBrowseFtp = document.getElementById('btn-browse-ftp');
const ftpBrowserModal = document.getElementById('ftp-browser-modal');
const btnCloseFtpBrowser = document.getElementById('btn-close-ftp-browser');
const btnCloseFtpBrowser2 = document.getElementById('btn-close-ftp-browser-2');
const ftpBreadcrumbs = document.getElementById('ftp-breadcrumbs');
const btnFtpUpDir = document.getElementById('btn-ftp-up-dir');
const btnFtpRefresh = document.getElementById('btn-ftp-refresh');
const btnFtpNewFolder = document.getElementById('btn-ftp-new-folder');
const ftpFilterInput = document.getElementById('ftp-filter-input');
const ftpFileBrowserContainer = document.getElementById('ftp-file-browser-container');
const ftpSelectedPathDisplay = document.getElementById('ftp-selected-path-display');
const btnFtpUsePath = document.getElementById('btn-ftp-use-path');

let ftpExplorerState = {
  currentPath: '/',
  items: [],
  selectedPath: '/'
};

// Catalog Admin Elements & State
const btnOpenCatalog = document.getElementById('btn-open-catalog');
const catalogModal = document.getElementById('catalog-modal');
const btnCloseCatalogModal = document.getElementById('btn-close-catalog-modal');
const btnDoneCatalog = document.getElementById('btn-done-catalog');
const catalogSearchInput = document.getElementById('catalog-search-input');
const btnResetCatalog = document.getElementById('btn-reset-catalog');
let catalogProducts = [];

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  // Set default dates
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('orderDate').value = today;
  document.getElementById('dateWanted').value = today;

  // Setup Event Listeners
  setupEventListeners();

  // Load Saved FTP Config if any
  loadFtpConfig();

  // Load Catalog Products from server
  await fetchCatalogProducts();

  // Load sample data by default so the user immediately sees a working demo!
  loadSampleData();

  // Initialize and load order history packages
  await fetchOrderHistory();

  // Auto switch tab if URL has #history
  if (window.location.hash === '#history') {
    switchMainTab('history');
  }
});

function setupEventListeners() {
  // Add item row
  btnAddItem.addEventListener('click', () => addItemRow());

  // History search input listener
  const histSearchInput = document.getElementById('history-search-input');
  if (histSearchInput) {
    histSearchInput.addEventListener('input', (e) => {
      currentHistorySearch = e.target.value;
      renderOrderHistory();
    });
  }

  // Same as bill-to toggle
  sameAsBillToCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      shipToFieldsContainer.style.display = 'none';
      shipToSyncNotice.style.display = 'block';
    } else {
      shipToFieldsContainer.style.display = 'block';
      shipToSyncNotice.style.display = 'none';
      populateShipToFromBillTo();
    }
  });

  // Totals inputs event listeners
  ['discount', 'shipping', 'tax'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', calculateTotals);
  });

  // Action buttons
  btnLoadSample.addEventListener('click', loadSampleData);
  btnClearForm.addEventListener('click', clearForm);
  btnGenerate.addEventListener('click', handleGenerate);
  btnUploadFtp.addEventListener('click', handleFtpUpload);
  btnDownloadZip.addEventListener('click', handleDownloadZip);

  // FTP buttons
  btnTestFtp.addEventListener('click', handleTestFtp);
  btnSaveFtp.addEventListener('click', handleSaveFtp);

  // Modals
  btnClosePreview.addEventListener('click', () => previewModal.classList.remove('active'));
  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) previewModal.classList.remove('active');
  });

  btnCloseFtpModal.addEventListener('click', () => ftpModal.classList.remove('active'));
  btnFtpDone.addEventListener('click', () => ftpModal.classList.remove('active'));
  ftpModal.addEventListener('click', (e) => {
    if (e.target === ftpModal) ftpModal.classList.remove('active');
  });

  // FTP Explorer Modal Events
  if (btnBrowseFtp) {
    btnBrowseFtp.addEventListener('click', openFtpBrowser);
  }
  if (btnCloseFtpBrowser) {
    btnCloseFtpBrowser.addEventListener('click', () => ftpBrowserModal.classList.remove('active'));
  }
  if (btnCloseFtpBrowser2) {
    btnCloseFtpBrowser2.addEventListener('click', () => ftpBrowserModal.classList.remove('active'));
  }
  if (ftpBrowserModal) {
    ftpBrowserModal.addEventListener('click', (e) => {
      if (e.target === ftpBrowserModal) ftpBrowserModal.classList.remove('active');
    });
  }
  if (btnFtpUpDir) {
    btnFtpUpDir.addEventListener('click', handleFtpUpDir);
  }
  if (btnFtpRefresh) {
    btnFtpRefresh.addEventListener('click', () => fetchFtpDirectory(ftpExplorerState.currentPath));
  }
  if (btnFtpNewFolder) {
    btnFtpNewFolder.addEventListener('click', handleFtpNewFolder);
  }
  if (ftpFilterInput) {
    ftpFilterInput.addEventListener('input', (e) => renderFtpItems(e.target.value.trim().toLowerCase()));
  }
  if (btnFtpUsePath) {
    btnFtpUsePath.addEventListener('click', applySelectedFtpPath);
  }

  // Product Catalog & SKU Manager Admin Panel Events
  if (btnOpenCatalog) {
    btnOpenCatalog.addEventListener('click', openCatalogModal);
  }
  if (btnCloseCatalogModal) {
    btnCloseCatalogModal.addEventListener('click', closeCatalogModal);
  }
  if (btnDoneCatalog) {
    btnDoneCatalog.addEventListener('click', closeCatalogModal);
  }
  if (catalogModal) {
    catalogModal.addEventListener('click', (e) => {
      if (e.target === catalogModal) closeCatalogModal();
    });
  }
  if (catalogSearchInput) {
    catalogSearchInput.addEventListener('input', (e) => renderCatalogTable(e.target.value));
  }
  if (btnResetCatalog) {
    btnResetCatalog.addEventListener('click', handleResetCatalog);
  }
}

// Populate Ship-To fields from Bill-To if unchecked
function populateShipToFromBillTo() {
  if (!document.getElementById('shipToName').value) {
    document.getElementById('shipToName').value = document.getElementById('customerName').value;
  }
  if (!document.getElementById('shipToAttention').value) {
    document.getElementById('shipToAttention').value = document.getElementById('attention').value;
  }
  if (!document.getElementById('shipToAddress1').value) {
    document.getElementById('shipToAddress1').value = document.getElementById('address1').value;
  }
  if (!document.getElementById('shipToAddress2').value) {
    document.getElementById('shipToAddress2').value = document.getElementById('address2').value;
  }
  if (!document.getElementById('shipToCity').value) {
    document.getElementById('shipToCity').value = document.getElementById('city').value;
  }
  if (!document.getElementById('shipToProvince').value) {
    document.getElementById('shipToProvince').value = document.getElementById('provinceState').value;
  }
  if (!document.getElementById('shipToPostal').value) {
    document.getElementById('shipToPostal').value = document.getElementById('postalZip').value;
  }
  if (!document.getElementById('shipToCountry').value) {
    document.getElementById('shipToCountry').value = document.getElementById('country').value;
  }
  if (!document.getElementById('shipToPhone').value) {
    document.getElementById('shipToPhone').value = document.getElementById('telephone').value;
  }
  if (!document.getElementById('shipToEmail').value) {
    document.getElementById('shipToEmail').value = document.getElementById('email').value;
  }
}

// Helper to render product catalog options for dropdowns
function renderProductOptions(selectedSku = '', selectedName = '') {
  return catalogProducts.map(p => {
    const isSelected = (selectedSku && p.sku.toUpperCase() === selectedSku.toUpperCase()) ||
                       (selectedName && p.name.toLowerCase() === selectedName.toLowerCase());
    return `<option value="${p.sku}" data-name="${escapeHtml(p.name)}" data-sku="${p.sku}" data-price="${p.price || 0}" ${isSelected ? 'selected' : ''}>${escapeHtml(p.name)}</option>`;
  }).join('');
}

// Add Item Row to Table with Adeeva Product Dropdown & Automatic SKU
function addItemRow(item = {}) {
  const tr = document.createElement('tr');

  const sku = item.sku || item.partNo || '';
  const name = item.productName || item.name || item.description || '';
  const qty = item.quantity !== undefined ? item.quantity : 1;
  const shipped = item.shipped !== undefined ? item.shipped : qty;
  const bo = item.bo !== undefined ? item.bo : 0;
  const price = item.price !== undefined ? item.price : 0;
  const extended = (Number(qty) * Number(price)).toFixed(2);

  // Check if this item matches a known product in our catalog
  const matchedProd = catalogProducts.find(p => 
    (sku && p.sku.toUpperCase() === sku.toUpperCase()) ||
    (name && p.name.toLowerCase() === name.toLowerCase())
  );

  const initialSku = matchedProd ? matchedProd.sku : sku;
  const isCustom = !matchedProd && name !== '';

  tr.innerHTML = `
    <td>
      <div style="position: relative;">
        <select class="table-input item-product-select" style="font-size: 0.85rem; padding: 0.45rem 0.65rem; font-weight: 600; color: var(--text-dark);">
          <option value="">-- Select Adeeva Product --</option>
          ${renderProductOptions(initialSku, name)}
          <option value="__custom__" ${isCustom ? 'selected' : ''}>✏️ Custom / Other Product...</option>
        </select>
        <input type="text" class="table-input item-custom-name" value="${escapeHtml(name)}" placeholder="Type custom product name..." style="display: ${isCustom ? 'block' : 'none'}; margin-top: 4px; font-size: 0.8rem; padding: 4px 6px;">
      </div>
    </td>
    <td>
      <input type="text" class="table-input item-sku" value="${escapeHtml(initialSku)}" placeholder="SKU Number" required style="font-family: 'JetBrains Mono', monospace; text-transform: uppercase; font-size: 0.85rem; font-weight: 700; background: #f8fafc; color: var(--adeeva-bronze);">
    </td>
    <td>
      <input type="number" step="1" min="0" class="table-input item-qty" value="${qty}" required style="text-align: center;">
    </td>
    <td>
      <input type="number" step="1" min="0" class="table-input item-shipped" value="${shipped}" style="text-align: center;">
    </td>
    <td>
      <input type="number" step="1" min="0" class="table-input item-bo" value="${bo}" style="text-align: center;">
    </td>
    <td>
      <input type="number" step="0.01" min="0" class="table-input item-price" value="${price}" required style="text-align: right;">
    </td>
    <td style="text-align: right; font-weight: 600; padding-right: 0.75rem;" class="item-ext">
      $${extended}
    </td>
    <td>
      <button type="button" class="btn-remove-row" title="Remove Item">&times;</button>
    </td>
  `;

  // Attach input listeners for live row updates
  const productSelect = tr.querySelector('.item-product-select');
  const customNameInput = tr.querySelector('.item-custom-name');
  const skuInput = tr.querySelector('.item-sku');
  const qtyInput = tr.querySelector('.item-qty');
  const shippedInput = tr.querySelector('.item-shipped');
  const priceInput = tr.querySelector('.item-price');
  const extTd = tr.querySelector('.item-ext');
  const removeBtn = tr.querySelector('.btn-remove-row');

  function updateRow() {
    const q = parseFloat(qtyInput.value) || 0;
    const p = parseFloat(priceInput.value) || 0;
    extTd.textContent = `$${(q * p).toFixed(2)}`;
    calculateTotals();
  }

  // When a product is selected from dropdown, AUTOMATICALLY select/set the SKU number!
  productSelect.addEventListener('change', (e) => {
    const selectedVal = e.target.value;
    if (selectedVal === '__custom__') {
      customNameInput.style.display = 'block';
      customNameInput.value = '';
      customNameInput.focus();
      skuInput.value = '';
    } else if (selectedVal) {
      customNameInput.style.display = 'none';
      const opt = e.target.selectedOptions[0];
      const prodSku = opt.dataset.sku || selectedVal;
      const prodPrice = parseFloat(opt.dataset.price) || 0;

      // Automatically fill SKU number based on selected product!
      skuInput.value = prodSku;
      if (prodPrice > 0) {
        priceInput.value = prodPrice.toFixed(2);
      }
      updateRow();
    } else {
      customNameInput.style.display = 'none';
      skuInput.value = '';
      updateRow();
    }
  });

  // When user types custom SKU manually, sync dropdown if matched
  skuInput.addEventListener('input', () => {
    const val = skuInput.value.trim().toUpperCase();
    let found = false;
    for (let i = 0; i < productSelect.options.length; i++) {
      if (productSelect.options[i].value.toUpperCase() === val) {
        productSelect.selectedIndex = i;
        customNameInput.style.display = 'none';
        found = true;
        break;
      }
    }
    if (!found && val) {
      productSelect.value = '__custom__';
      customNameInput.style.display = 'block';
    }
  });

  qtyInput.addEventListener('input', () => {
    // Default shipped to qty if not manually altered
    shippedInput.value = qtyInput.value;
    updateRow();
  });
  priceInput.addEventListener('input', updateRow);

  removeBtn.addEventListener('click', () => {
    if (itemsBody.children.length > 1) {
      tr.remove();
      calculateTotals();
    } else {
      showToast('You must have at least one product row in the order.', 'info');
    }
  });

  itemsBody.appendChild(tr);
  calculateTotals();
}

// Calculate Subtotal, Tax, and Grand Total
function calculateTotals() {
  let subtotal = 0;
  const rows = itemsBody.querySelectorAll('tr');

  rows.forEach(tr => {
    const qty = parseFloat(tr.querySelector('.item-qty')?.value) || 0;
    const price = parseFloat(tr.querySelector('.item-price')?.value) || 0;
    subtotal += (qty * price);
  });

  const discount = parseFloat(document.getElementById('discount').value) || 0;
  const shipping = parseFloat(document.getElementById('shipping').value) || 0;

  // Total sales tax: default auto calculate 5% if not altered, or use current value
  let taxEl = document.getElementById('tax');
  // 5% standard QC/GST tax rate
  if (taxEl.dataset.custom !== 'true') {
    const taxableAmount = Math.max(0, subtotal - discount);
    const calculatedTax = (taxableAmount * 0.05);
    taxEl.value = calculatedTax.toFixed(2);
  }

  const tax = parseFloat(taxEl.value) || 0;
  const grandTotal = Math.max(0, subtotal - discount + shipping + tax);

  document.getElementById('display-subtotal').textContent = `$${subtotal.toFixed(2)}`;
  document.getElementById('display-total').textContent = `$${grandTotal.toFixed(2)}`;

  return { subtotal, discount, shipping, tax, grandTotal };
}

// User manually changed tax field
document.getElementById('tax').addEventListener('input', () => {
  document.getElementById('tax').dataset.custom = 'true';
  calculateTotals();
});

// Extract full form data object
function getFormData() {
  const orderNo = document.getElementById('orderNo').value.trim();
  const sameAsBillTo = sameAsBillToCheckbox.checked;

  const items = [];
  const rows = itemsBody.querySelectorAll('tr');
  rows.forEach(tr => {
    const productSelect = tr.querySelector('.item-product-select');
    const customNameInput = tr.querySelector('.item-custom-name');
    const skuInput = tr.querySelector('.item-sku');
    
    let prodName = '';
    if (productSelect && productSelect.value === '__custom__') {
      prodName = customNameInput?.value.trim() || '';
    } else if (productSelect && productSelect.value) {
      prodName = productSelect.selectedOptions[0]?.dataset.name || productSelect.selectedOptions[0]?.textContent || '';
    } else {
      prodName = customNameInput?.value.trim() || '';
    }

    const skuVal = skuInput?.value.trim() || '';

    items.push({
      partNo: skuVal,
      sku: skuVal,
      description: prodName,
      productName: prodName,
      name: prodName,
      quantity: parseFloat(tr.querySelector('.item-qty')?.value) || 0,
      shipped: parseFloat(tr.querySelector('.item-shipped')?.value) || 0,
      bo: parseFloat(tr.querySelector('.item-bo')?.value) || 0,
      price: parseFloat(tr.querySelector('.item-price')?.value) || 0
    });
  });

  const totals = calculateTotals();

  const data = {
    orderNo,
    orderId: document.getElementById('orderId').value.trim(),
    invoiceNumber: document.getElementById('invoiceNumber').value.trim(),
    shipVia: document.getElementById('shipVia').value.trim() || 'Purolator',
    orderDate: document.getElementById('orderDate').value,
    dateWanted: document.getElementById('dateWanted').value || document.getElementById('orderDate').value,
    terms: document.getElementById('terms').value.trim(),
    orderNotes: document.getElementById('orderNotes').value.trim(),

    // Customer / Bill-To
    customerNo: document.getElementById('customerNo').value.trim(),
    customerName: document.getElementById('customerName').value.trim(),
    attention: document.getElementById('attention').value.trim(),
    address1: document.getElementById('address1').value.trim(),
    address2: document.getElementById('address2').value.trim(),
    city: document.getElementById('city').value.trim(),
    provinceState: document.getElementById('provinceState').value.trim(),
    postalZip: document.getElementById('postalZip').value.trim(),
    country: document.getElementById('country').value.trim(),
    telephone: document.getElementById('telephone').value.trim(),
    fax: document.getElementById('fax').value.trim(),
    email: document.getElementById('email').value.trim(),

    // Ship-To
    sameAsBillTo,
    shipToName: sameAsBillTo ? document.getElementById('customerName').value.trim() : document.getElementById('shipToName').value.trim(),
    shipToAttention: sameAsBillTo ? document.getElementById('attention').value.trim() : document.getElementById('shipToAttention').value.trim(),
    shipToAddress1: sameAsBillTo ? document.getElementById('address1').value.trim() : document.getElementById('shipToAddress1').value.trim(),
    shipToAddress2: sameAsBillTo ? '  ' : document.getElementById('shipToAddress2').value.trim(),
    shipToCity: sameAsBillTo ? document.getElementById('city').value.trim() : document.getElementById('shipToCity').value.trim(),
    shipToProvince: sameAsBillTo ? document.getElementById('provinceState').value.trim() : document.getElementById('shipToProvince').value.trim(),
    shipToPostal: sameAsBillTo ? document.getElementById('postalZip').value.trim() : document.getElementById('shipToPostal').value.trim(),
    shipToCountry: sameAsBillTo ? document.getElementById('country').value.trim() : document.getElementById('shipToCountry').value.trim(),
    shipToPhone: sameAsBillTo ? document.getElementById('telephone').value.trim() : document.getElementById('shipToPhone').value.trim(),
    shipToFax: sameAsBillTo ? document.getElementById('fax').value.trim() : document.getElementById('shipToFax').value.trim(),
    shipToEmail: sameAsBillTo ? document.getElementById('email').value.trim() : document.getElementById('shipToEmail').value.trim(),

    // Company Header
    companyName: document.getElementById('companyName').value.trim(),

    items,
    subtotal: totals.subtotal,
    discount: totals.discount,
    shipping: totals.shipping,
    tax: totals.tax,
    total: totals.grandTotal
  };

  return data;
}

// Generate the 4 files via API
async function handleGenerate() {
  const formData = getFormData();
  if (!formData.orderNo) {
    showToast('Please provide an Order Number (e.g. ORD0042588)', 'error');
    document.getElementById('orderNo').focus();
    return;
  }
  if (!formData.customerNo) {
    showToast('Please provide Customer Number', 'error');
    document.getElementById('customerNo').focus();
    return;
  }

  btnGenerate.innerHTML = `<span class="spinner"></span> Generating...`;
  btnGenerate.disabled = true;

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const result = await res.json();
    if (!result.success) {
      throw new Error(result.error || 'Failed to generate files');
    }

    state.currentOrderNo = result.data.orderNo;
    state.generatedFiles = result.data.files;
    state.previews = result.data.previews;

    renderGeneratedFiles(result.data.files, result.data.orderNo);
    btnDownloadZip.disabled = false;
    showToast(`Successfully created 4 files for Order ${result.data.orderNo}!`, 'success');
    fetchOrderHistory();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    btnGenerate.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
      Generate 4 Files
    `;
    btnGenerate.disabled = false;
  }
}

// Render generated files list in the right sidebar
function renderGeneratedFiles(files, orderNo) {
  const fileListContainer = document.getElementById('file-list');
  const filesBadge = document.getElementById('files-badge');

  filesBadge.textContent = '4 Files Ready';
  filesBadge.style.background = 'rgba(16, 185, 129, 0.15)';
  filesBadge.style.color = 'var(--accent-emerald)';

  fileListContainer.innerHTML = files.map(file => {
    const isPdf = file.type === 'pdf';
    const typeLabel = isPdf ? 'PDF' : 'XML';
    const iconClass = isPdf ? 'pdf' : 'xml';
    const sizeKb = (file.size / 1024).toFixed(1);

    let viewType = 'xml';
    if (file.name.startsWith('customer')) viewType = 'customer';
    else if (file.name.startsWith('shipto')) viewType = 'shipto';
    else if (file.name.startsWith('order')) viewType = 'order';
    else if (file.name.startsWith('invoice')) viewType = 'invoice';

    return `
      <div class="file-item">
        <div class="file-info">
          <div class="file-icon ${iconClass}">${typeLabel}</div>
          <div>
            <div class="file-name">${file.name}</div>
            <div class="file-size">${sizeKb} KB • Generated</div>
          </div>
        </div>
        <div class="file-actions">
          <button type="button" class="btn btn-secondary btn-sm" onclick="previewFile('${viewType}', '${orderNo}')" title="Preview file">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <a href="/api/download/${encodeURIComponent(orderNo)}/${viewType === 'invoice' ? 'pdf' : viewType}" class="btn btn-secondary btn-sm" title="Download file" download>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </a>
        </div>
      </div>
    `;
  }).join('');
}

// Preview File in Modal
window.previewFile = async function(type, orderNo) {
  previewModalTitle.textContent = `Preview: ${type}-${orderNo}.${type === 'invoice' ? 'pdf' : 'xml'}`;
  previewModal.classList.add('active');
  
  if (type === 'invoice') {
    previewModalBody.innerHTML = `
      <div style="height: 600px; width: 100%;">
        <iframe src="/api/download/${encodeURIComponent(orderNo)}/pdf?inline=true#toolbar=1" style="width: 100%; height: 100%; border: none; border-radius: 8px;"></iframe>
      </div>
    `;
    return;
  }

  let content = '';
  if (state.currentOrderNo === orderNo && state.previews) {
    if (type === 'customer') content = state.previews.customerXml;
    else if (type === 'shipto') content = state.previews.shiptoXml;
    else if (type === 'order') content = state.previews.orderXml;
  }

  if (!content) {
    previewModalBody.innerHTML = `<div style="text-align: center; padding: 2.5rem; color: var(--text-muted);"><span class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></span> Loading ${type}-${orderNo}.xml...</div>`;
    try {
      const res = await fetch(`/api/download/${encodeURIComponent(orderNo)}/${type}`);
      if (!res.ok) throw new Error('File could not be loaded from server.');
      content = await res.text();
    } catch (e) {
      previewModalBody.innerHTML = `<div class="alert alert-error" style="margin: 1rem;">Failed to load file: ${e.message}</div>`;
      return;
    }
  }

  // Format XML with pretty indentation for preview
  const formattedXml = formatXmlString(content || '');

  previewModalBody.innerHTML = `
    <div style="display: flex; justify-content: flex-end; margin-bottom: 0.75rem; gap: 0.5rem;">
      <button type="button" class="btn btn-secondary btn-sm" onclick="copyXmlToClipboard()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy XML
      </button>
      <a href="/api/download/${encodeURIComponent(orderNo)}/${type}" class="btn btn-outline-primary btn-sm" download>
        Download
      </a>
    </div>
    <pre class="code-preview" id="xml-preview-content">${escapeHtml(formattedXml)}</pre>
  `;
};

window.copyXmlToClipboard = function() {
  const content = document.getElementById('xml-preview-content')?.textContent;
  if (content) {
    navigator.clipboard.writeText(content);
    showToast('XML copied to clipboard!', 'success');
  }
};

// Pretty print XML
function formatXmlString(xml) {
  let formatted = '';
  let indent = '';
  const tab = '  ';
  xml.split(/>\s*</).forEach(node => {
    if (node.match(/^\/\w/)) indent = indent.substring(tab.length);
    formatted += indent + '<' + node + '>\r\n';
    if (node.match(/^<?\w[^>]*[^\/]$/)) indent += tab;
  });
  return formatted.substring(1, formatted.length - 3);
}

// Download all 4 files as ZIP
function handleDownloadZip() {
  if (!state.currentOrderNo) {
    showToast('Please generate files first.', 'error');
    return;
  }
  window.location.href = `/api/download-zip/${encodeURIComponent(state.currentOrderNo)}`;
}

// Get FTP Config from inputs (optional overrides)
function getFtpConfig() {
  const hostVal = document.getElementById('ftpHost')?.value.trim();
  const portVal = document.getElementById('ftpPort')?.value.trim();
  const userVal = document.getElementById('ftpUser')?.value.trim();
  const passVal = document.getElementById('ftpPassword')?.value;
  const remoteDirVal = document.getElementById('ftpRemoteDir')?.value.trim() || '/';
  const secureVal = document.getElementById('ftpSecure')?.checked;

  const config = {
    remoteDir: remoteDirVal
  };

  // Only pass override credentials if manually entered
  if (hostVal) config.host = hostVal;
  if (portVal) config.port = portVal;
  if (userVal) config.user = userVal;
  if (passVal) config.password = passVal;
  if (document.getElementById('ftpSecure')) config.secure = secureVal;

  return config;
}

// Quick folder selection helper
window.setQuickFolder = function(folderPath) {
  const input = document.getElementById('ftpRemoteDir');
  if (input) {
    input.value = folderPath;
    input.focus();
    showToast(`Destination path set to: ${folderPath}`, 'info');
  }
};

// Test FTP Connection (using .env or overrides)
async function handleTestFtp() {
  const config = getFtpConfig();
  const btn = document.getElementById('btn-test-ftp');
  const badge = document.getElementById('ftp-status-badge');
  const pulse = document.getElementById('ftp-pulse-indicator');
  const hostLabel = document.getElementById('ftp-env-host-label');
  const userLabel = document.getElementById('ftp-env-user-label');

  badge.className = 'status-badge testing';
  badge.textContent = 'Testing...';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="width:12px;height:12px;border-width:2px;margin-right:4px;"></span> Testing...`;
  }

  try {
    const res = await fetch('/api/ftp/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    const result = await res.json();

    if (result.success) {
      badge.className = 'status-badge connected';
      badge.textContent = 'Online & Ready';
      if (pulse) pulse.classList.remove('offline');
      if (hostLabel) hostLabel.textContent = `${result.host || config.host || 'ftp.catalystbiz.com'}:${result.port || 21}`;
      if (userLabel) userLabel.textContent = `Connected as '${result.user || config.user || 'adeeva'}' • .env Verified`;
      showToast(result.message || 'FTP Connection Successful!', 'success');
    } else {
      badge.className = 'status-badge disconnected';
      badge.textContent = 'Failed';
      if (pulse) pulse.classList.add('offline');
      showToast(`FTP Error: ${result.message}`, 'error');
    }
  } catch (err) {
    badge.className = 'status-badge disconnected';
    badge.textContent = 'Failed';
    if (pulse) pulse.classList.add('offline');
    showToast(`Network Error: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Test Connection
      `;
    }
  }
}

// Load FTP Configuration status from server .env
async function loadFtpConfig() {
  try {
    const res = await fetch('/api/ftp/status');
    const data = await res.json();
    const envHostLabel = document.getElementById('ftp-env-host-label');
    const envUserLabel = document.getElementById('ftp-env-user-label');
    const pulse = document.getElementById('ftp-pulse-indicator');
    const badge = document.getElementById('ftp-status-badge');

    if (data.isConfigured) {
      if (envHostLabel) {
        envHostLabel.textContent = `${data.host}:${data.port}`;
        envHostLabel.style.color = '';
      }
      if (envUserLabel) {
        envUserLabel.textContent = `User: ${data.user || 'adeeva'} • Standard FTP (Port ${data.port})`;
      }
      if (pulse) {
        pulse.classList.remove('offline');
      }
      if (badge) {
        badge.className = 'status-badge connected';
        badge.textContent = 'Configured (.env)';
      }
      if (data.defaultDir && document.getElementById('ftpRemoteDir')) {
        document.getElementById('ftpRemoteDir').value = data.defaultDir;
      }
    } else {
      if (envHostLabel) {
        envHostLabel.textContent = 'FTP Host not configured';
        envHostLabel.style.color = '#ef4444';
      }
      if (envUserLabel) {
        envUserLabel.textContent = 'Please configure FTP_HOST in .env';
      }
      if (pulse) {
        pulse.classList.add('offline');
      }
      if (badge) {
        badge.className = 'status-badge disconnected';
        badge.textContent = 'Missing .env';
      }
    }
  } catch (err) {
    console.warn('Could not load FTP status from server:', err);
  }
}

// Upload all 4 files to FTP
async function handleFtpUpload() {
  const formData = getFormData();
  const ftpConfig = getFtpConfig();
  const targetDir = document.getElementById('ftpRemoteDir')?.value.trim() || '/';

  if (!formData.orderNo) {
    showToast('Please provide an Order Number (e.g. ORD0042588)', 'error');
    return;
  }

  // Open FTP Progress Modal
  ftpModalTitle.textContent = `Dispatching Order ${formData.orderNo} to FTP`;
  ftpStatusMessage.innerHTML = `<span class="spinner"></span> Connecting to FTP & uploading files to <strong>${escapeHtml(targetDir)}</strong>...`;
  
  ftpChecklist.innerHTML = `
    <div class="upload-check-item">
      <span>customer-${formData.orderNo}.xml</span>
      <span style="color: var(--accent-amber);">Uploading...</span>
    </div>
    <div class="upload-check-item">
      <span>shipto-${formData.orderNo}.xml</span>
      <span style="color: var(--accent-amber);">Uploading...</span>
    </div>
    <div class="upload-check-item">
      <span>order-${formData.orderNo}.xml</span>
      <span style="color: var(--accent-amber);">Uploading...</span>
    </div>
    <div class="upload-check-item">
      <span>invoice-${formData.orderNo}.pdf</span>
      <span style="color: var(--accent-amber);">Uploading...</span>
    </div>
  `;

  ftpModal.classList.add('active');
  btnUploadFtp.disabled = true;

  try {
    const res = await fetch('/api/ftp/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderData: formData,
        ftpConfig,
        remoteDir: targetDir
      })
    });

    const result = await res.json();
    
    // Update local state if generated
    if (result.orderNo && result.files) {
      state.currentOrderNo = result.orderNo;
      state.generatedFiles = result.files;
      renderGeneratedFiles(result.files, result.orderNo);
      btnDownloadZip.disabled = false;
    }

    if (result.success) {
      ftpStatusMessage.innerHTML = `✅ <strong style="color: var(--accent-emerald);">${result.message}</strong> Destination: <code>${escapeHtml(result.targetDir || targetDir)}</code>`;
      ftpChecklist.innerHTML = (result.results || []).map(r => `
        <div class="upload-check-item success">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="color: var(--accent-emerald); font-weight: bold;">✓</span>
            <span>${escapeHtml(r.fileName)}</span>
          </div>
          <span style="color: var(--accent-emerald); font-size: 0.75rem;">${(r.sizeBytes / 1024).toFixed(1)} KB Sent</span>
        </div>
      `).join('');
      showToast(`All 4 files sent to FTP successfully!`, 'success');
      fetchOrderHistory();
      ftpStatusBadge.className = 'status-badge connected';
      ftpStatusBadge.textContent = 'Connected';
    } else {
      ftpStatusMessage.innerHTML = `⚠️ <strong style="color: var(--accent-rose);">${result.message}</strong>`;
      if (result.results && result.results.length > 0) {
        ftpChecklist.innerHTML = result.results.map(r => `
          <div class="upload-check-item ${r.status === 'success' ? 'success' : 'failed'}">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-weight: bold;">${r.status === 'success' ? '✓' : '✗'}</span>
              <span>${escapeHtml(r.fileName)}</span>
            </div>
            <span style="font-size: 0.75rem;">${r.status === 'success' ? 'Sent' : (r.error || 'Failed')}</span>
          </div>
        `).join('');
      }
      showToast(`FTP Transfer: ${result.message}`, 'error');
    }
  } catch (err) {
    ftpStatusMessage.innerHTML = `❌ <strong style="color: var(--accent-rose);">Network / Server Error: ${err.message}</strong>`;
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    btnUploadFtp.disabled = false;
  }
}

// Populate dispatch form from data object
function populateFormWithData(data) {
  if (!data) return;

  if (data.orderNo) document.getElementById('orderNo').value = data.orderNo;
  if (data.orderId) document.getElementById('orderId').value = data.orderId;
  if (data.invoiceNumber) document.getElementById('invoiceNumber').value = data.invoiceNumber;
  if (data.shipVia) document.getElementById('shipVia').value = data.shipVia;
  if (data.orderDate) document.getElementById('orderDate').value = data.orderDate;
  if (data.dateWanted) document.getElementById('dateWanted').value = data.dateWanted;
  if (data.terms !== undefined) document.getElementById('terms').value = data.terms;
  if (data.orderNotes !== undefined) document.getElementById('orderNotes').value = data.orderNotes;

  // Customer / Bill-to
  if (data.customerNo) document.getElementById('customerNo').value = data.customerNo;
  if (data.customerName) document.getElementById('customerName').value = data.customerName;
  if (data.attention) document.getElementById('attention').value = data.attention;
  if (data.address1) document.getElementById('address1').value = data.address1;
  if (data.address2 !== undefined) document.getElementById('address2').value = data.address2;
  if (data.city) document.getElementById('city').value = data.city;
  if (data.provinceState) document.getElementById('provinceState').value = data.provinceState;
  if (data.postalZip) document.getElementById('postalZip').value = data.postalZip;
  if (data.country) document.getElementById('country').value = data.country;
  if (data.telephone) document.getElementById('telephone').value = data.telephone;
  if (data.fax !== undefined) document.getElementById('fax').value = data.fax;
  if (data.email) document.getElementById('email').value = data.email;

  // Ship-to
  const isSame = data.sameAsBillTo !== false;
  sameAsBillToCheckbox.checked = isSame;
  if (isSame) {
    shipToFieldsContainer.style.display = 'none';
    shipToSyncNotice.style.display = 'block';
  } else {
    shipToFieldsContainer.style.display = 'block';
    shipToSyncNotice.style.display = 'none';
    if (data.shipToName) document.getElementById('shipToName').value = data.shipToName;
    if (data.shipToAttention) document.getElementById('shipToAttention').value = data.shipToAttention;
    if (data.shipToAddress1) document.getElementById('shipToAddress1').value = data.shipToAddress1;
    if (data.shipToAddress2 !== undefined) document.getElementById('shipToAddress2').value = data.shipToAddress2;
    if (data.shipToCity) document.getElementById('shipToCity').value = data.shipToCity;
    if (data.shipToProvince) document.getElementById('shipToProvince').value = data.shipToProvince;
    if (data.shipToPostal) document.getElementById('shipToPostal').value = data.shipToPostal;
    if (data.shipToCountry) document.getElementById('shipToCountry').value = data.shipToCountry;
    if (data.shipToPhone) document.getElementById('shipToPhone').value = data.shipToPhone;
    if (data.shipToFax !== undefined) document.getElementById('shipToFax').value = data.shipToFax;
    if (data.shipToEmail) document.getElementById('shipToEmail').value = data.shipToEmail;
  }

  // Populate rows
  itemsBody.innerHTML = '';
  if (Array.isArray(data.items) && data.items.length > 0) {
    data.items.forEach(item => addItemRow(item));
  } else {
    addItemRow();
  }

  // Totals
  document.getElementById('discount').value = (parseFloat(data.discount) || 0).toFixed(2);
  document.getElementById('shipping').value = (parseFloat(data.shipping) || 0).toFixed(2);
  document.getElementById('tax').value = (parseFloat(data.tax) || 0).toFixed(2);
  document.getElementById('tax').dataset.custom = 'true';

  calculateTotals();
}

// Load Demo Sample Data (ORD0042588)
async function loadSampleData() {
  try {
    const res = await fetch('/api/sample');
    const data = await res.json();
    populateFormWithData(data);
    showToast('Loaded demo order ORD0042588 data!', 'info');
  } catch (err) {
    showToast('Failed to load sample data: ' + err.message, 'error');
  }
}

// Clear Form
function clearForm() {
  orderForm.reset();
  itemsBody.innerHTML = '';
  delete document.getElementById('tax').dataset.custom;
  addItemRow(); // One blank row
  
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('orderDate').value = today;
  document.getElementById('dateWanted').value = today;
  sameAsBillToCheckbox.checked = true;
  shipToFieldsContainer.style.display = 'none';
  shipToSyncNotice.style.display = 'block';

  calculateTotals();
  showToast('Form cleared.', 'info');
}

// Helper: Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';

  toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Helper: Escape HTML
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================
// FTP Directory Explorer Functions
// ==========================================

// Open FTP Directory Explorer
function openFtpBrowser() {
  const initialPath = document.getElementById('ftpRemoteDir')?.value.trim() || '/';
  ftpBrowserModal.classList.add('active');
  fetchFtpDirectory(initialPath);
}

// Fetch directory contents from FTP
async function fetchFtpDirectory(targetPath = '/') {
  const config = getFtpConfig();

  ftpFileBrowserContainer.innerHTML = `
    <div class="ftp-empty-placeholder">
      <span class="spinner" style="width: 24px; height: 24px; border-width: 3px;"></span>
      <div style="font-size: 0.85rem; color: var(--text-secondary);">Connecting to FTP & reading files at <code>${escapeHtml(targetPath)}</code>...</div>
    </div>
  `;

  try {
    const res = await fetch('/api/ftp/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ftpConfig: config,
        path: targetPath
      })
    });

    const result = await res.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to list directory');
    }

    ftpExplorerState.currentPath = result.currentDir || targetPath;
    ftpExplorerState.items = result.items || [];
    ftpExplorerState.selectedPath = ftpExplorerState.currentPath;

    ftpSelectedPathDisplay.textContent = ftpExplorerState.currentPath;
    renderFtpBreadcrumbs(ftpExplorerState.currentPath);
    renderFtpItems();
  } catch (err) {
    ftpFileBrowserContainer.innerHTML = `
      <div class="ftp-empty-placeholder">
        <div style="font-size: 1.5rem;">⚠️</div>
        <div style="font-size: 0.9rem; color: var(--accent-rose); font-weight: 600;">Failed to read directory</div>
        <div style="font-size: 0.8rem; color: var(--text-muted); max-width: 480px;">${escapeHtml(err.message)}</div>
        <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="fetchFtpDirectory('${escapeHtml(targetPath)}')">Retry</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="fetchFtpDirectory('/')">Go to Root (/)</button>
        </div>
      </div>
    `;
  }
}

// Render Breadcrumb Path Navigation
function renderFtpBreadcrumbs(pathStr) {
  const clean = pathStr.replace(/\\/g, '/');
  const parts = clean.split('/').filter(p => p.length > 0);

  let html = `<button type="button" class="breadcrumb-crumb" onclick="fetchFtpDirectory('/')" title="Root Directory">📁 /</button>`;
  let builtPath = '';

  parts.forEach((part, index) => {
    builtPath += '/' + part;
    const isLast = (index === parts.length - 1);
    html += `<span class="breadcrumb-sep">/</span>`;
    html += `<button type="button" class="breadcrumb-crumb ${isLast ? 'active' : ''}" onclick="fetchFtpDirectory('${builtPath}')">${escapeHtml(part)}</button>`;
  });

  ftpBreadcrumbs.innerHTML = html;
}

// Render list of files & directories
function renderFtpItems(filter = '') {
  const items = ftpExplorerState.items.filter(item => {
    if (!filter) return true;
    return item.name.toLowerCase().includes(filter);
  });

  if (items.length === 0) {
    ftpFileBrowserContainer.innerHTML = `
      <div class="ftp-empty-placeholder">
        <div style="font-size: 1.5rem;">📂</div>
        <div style="font-size: 0.85rem; color: var(--text-secondary);">${filter ? 'No matching files or folders found.' : 'This directory is currently empty.'}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">You can upload the 4 order files directly into this location.</div>
      </div>
    `;
    return;
  }

  let html = `
    <table class="ftp-dir-table">
      <thead>
        <tr>
          <th>Name</th>
          <th style="width: 100px;">Type</th>
          <th style="width: 100px; text-align: right;">Size</th>
          <th style="width: 140px;">Modified</th>
          <th style="width: 90px; text-align: right;">Action</th>
        </tr>
      </thead>
      <tbody>
  `;

  items.forEach(item => {
    const isDir = item.isDirectory;
    const iconClass = isDir ? 'folder' : 'file';
    const typeLabel = isDir ? 'Folder' : (item.name.split('.').pop() || 'File').toUpperCase();
    const sizeLabel = isDir ? '—' : formatFileSize(item.size);
    const dateLabel = item.date ? formatDateShort(item.date) : '—';
    
    // Construct item path
    const itemPath = ftpExplorerState.currentPath.endsWith('/') 
      ? `${ftpExplorerState.currentPath}${item.name}` 
      : `${ftpExplorerState.currentPath}/${item.name}`;

    html += `
      <tr class="ftp-dir-row ${isDir ? 'is-folder' : ''}" data-name="${escapeHtml(item.name)}" data-is-dir="${isDir}" onclick="${isDir ? `navigateFtpTo('${escapeHtml(itemPath)}')` : ''}">
        <td class="ftp-dir-cell">
          <div class="ftp-name-cell">
            <span class="ftp-icon ${iconClass}">
              ${isDir 
                ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`
                : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
              }
            </span>
            <span style="color: ${isDir ? '#fff' : 'var(--text-secondary)'}; font-weight: ${isDir ? '600' : '400'};">
              ${escapeHtml(item.name)}
            </span>
          </div>
        </td>
        <td class="ftp-dir-cell" style="color: var(--text-muted); font-size: 0.75rem;">${typeLabel}</td>
        <td class="ftp-dir-cell" style="text-align: right; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: var(--text-muted);">${sizeLabel}</td>
        <td class="ftp-dir-cell" style="font-size: 0.75rem; color: var(--text-muted);">${dateLabel}</td>
        <td class="ftp-dir-cell" style="text-align: right;" onclick="event.stopPropagation();">
          ${isDir 
            ? `<button type="button" class="btn btn-outline-primary btn-sm" style="padding: 2px 8px; font-size: 0.7rem;" onclick="quickSelectFtpFolder('${escapeHtml(itemPath)}')">Select</button>`
            : `<span style="font-size: 0.7rem; color: var(--text-muted);">File</span>`
          }
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  ftpFileBrowserContainer.innerHTML = html;
}

// Navigate into a folder
window.navigateFtpTo = function(pathStr) {
  fetchFtpDirectory(pathStr);
};

// Quick select folder
window.quickSelectFtpFolder = function(folderPath) {
  ftpExplorerState.selectedPath = folderPath;
  ftpSelectedPathDisplay.textContent = folderPath;
  applySelectedFtpPath();
};

// Go up one level (parent directory)
function handleFtpUpDir() {
  const current = ftpExplorerState.currentPath.replace(/\\/g, '/');
  if (current === '/' || !current) return;
  const parts = current.split('/').filter(p => p.length > 0);
  parts.pop();
  const parent = parts.length === 0 ? '/' : '/' + parts.join('/');
  fetchFtpDirectory(parent);
}

// Create a new folder on FTP
async function handleFtpNewFolder() {
  const folderName = prompt('Enter new folder name on FTP:');
  if (!folderName || !folderName.trim()) return;

  const cleanName = folderName.trim().replace(/[/\\:*?"<>|]/g, '_');
  const targetDir = ftpExplorerState.currentPath.endsWith('/')
    ? `${ftpExplorerState.currentPath}${cleanName}`
    : `${ftpExplorerState.currentPath}/${cleanName}`;

  try {
    const res = await fetch('/api/ftp/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ftpConfig: getFtpConfig(),
        dirPath: targetDir
      })
    });
    const result = await res.json();
    if (result.success) {
      showToast(`Created folder '${cleanName}' on FTP!`, 'success');
      fetchFtpDirectory(targetDir);
    } else {
      showToast(`Error creating folder: ${result.message}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// Apply selected FTP path back to main form input
function applySelectedFtpPath() {
  const chosenPath = ftpExplorerState.selectedPath || ftpExplorerState.currentPath || '/';
  document.getElementById('ftpRemoteDir').value = chosenPath;
  ftpBrowserModal.classList.remove('active');
  showToast(`Remote Directory set to: ${chosenPath}`, 'success');
}

// Format file size helper
function formatFileSize(bytes) {
  if (bytes === 0 || !bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format date short helper
function formatDateShort(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

// ==========================================
// Product Catalog & SKU Manager Admin Logic
// ==========================================

// Fetch product catalog from server
async function fetchCatalogProducts() {
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    if (data.success && Array.isArray(data.products)) {
      catalogProducts = data.products;
      refreshRowDropdowns();
      if (catalogModal && catalogModal.classList.contains('active')) {
        renderCatalogTable(catalogSearchInput?.value || '');
      }
    }
  } catch (err) {
    console.warn('Failed to load product catalog:', err);
  }
}

// Refresh all product dropdowns in the order table
function refreshRowDropdowns() {
  const rows = itemsBody.querySelectorAll('tr');
  rows.forEach(tr => {
    const select = tr.querySelector('.item-product-select');
    const skuInput = tr.querySelector('.item-sku');
    const customNameInput = tr.querySelector('.item-custom-name');
    if (select) {
      const currentSku = skuInput?.value || '';
      const currentName = customNameInput?.value || '';
      select.innerHTML = `
        <option value="">-- Select Adeeva Product --</option>
        ${renderProductOptions(currentSku, currentName)}
        <option value="__custom__">✏️ Custom / Other Product...</option>
      `;
    }
  });
}

// Open Catalog Admin Modal
window.openCatalogModal = function openCatalogModal() {
  const modal = document.getElementById('catalog-modal');
  if (modal) {
    modal.classList.add('active');
    renderCatalogTable();
    setTimeout(() => {
      document.getElementById('new-prod-name')?.focus();
    }, 100);
  }
};

// Close Catalog Admin Modal
window.closeCatalogModal = function closeCatalogModal() {
  const modal = document.getElementById('catalog-modal');
  if (modal) {
    modal.classList.remove('active');
  }
};

// Render products in the Catalog table (simplified to Name & SKU)
function renderCatalogTable(filterText = '') {
  const tbody = document.getElementById('catalog-table-body');
  const countBadge = document.getElementById('catalog-count-badge');
  if (!tbody) return;

  const search = (filterText || '').trim().toLowerCase();
  const filtered = catalogProducts.filter(p => 
    p.name.toLowerCase().includes(search) || 
    p.sku.toLowerCase().includes(search)
  );

  if (countBadge) {
    countBadge.textContent = `Showing ${filtered.length} of ${catalogProducts.length} products`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          No products found matching "${escapeHtml(filterText)}"
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(p => `
    <tr>
      <td style="font-weight: 600; color: var(--text-dark); padding: 0.65rem 0.85rem;">
        ${escapeHtml(p.name)}
      </td>
      <td style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--adeeva-bronze); padding: 0.65rem 0.85rem;">
        <span style="background: rgba(115, 71, 36, 0.08); padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(115, 71, 36, 0.2);">
          ${escapeHtml(p.sku)}
        </span>
      </td>
      <td style="text-align: center; padding: 0.65rem 0.85rem;">
        <button type="button" class="btn btn-secondary btn-sm" style="color: #dc2626; padding: 2px 8px; font-weight: 700;" onclick="handleDeleteProduct('${p.id}')" title="Delete product">
          &times;
        </button>
      </td>
    </tr>
  `).join('');
}

// Add new product via admin form (Product Name & SKU only)
async function handleAddProduct() {
  const nameInput = document.getElementById('new-prod-name');
  const skuInput = document.getElementById('new-prod-sku');

  const name = nameInput.value.trim();
  const sku = skuInput.value.trim().toUpperCase();

  if (!name || !sku) {
    showToast('Product Name and SKU Number are required.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sku })
    });
    const result = await res.json();
    if (result.success) {
      catalogProducts = result.products;
      showToast(`Added "${name}" (${sku}) to catalog!`, 'success');
      nameInput.value = '';
      skuInput.value = '';
      nameInput.focus();
      renderCatalogTable(catalogSearchInput?.value || '');
      refreshRowDropdowns();
    } else {
      showToast(result.message || 'Failed to add product', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// Delete product
window.handleDeleteProduct = async function(id) {
  if (!confirm('Are you sure you want to remove this product from the catalog?')) return;
  try {
    const res = await fetch(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      catalogProducts = result.products;
      showToast('Product removed from catalog.', 'info');
      renderCatalogTable(catalogSearchInput?.value || '');
      refreshRowDropdowns();
    } else {
      showToast(result.message || 'Failed to delete product', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// Reset catalog to official Adeeva catalog
async function handleResetCatalog() {
  if (!confirm('Reset product catalog to default official Adeeva products? Any custom additions will be replaced.')) return;
  try {
    const res = await fetch('/api/products/reset', { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      catalogProducts = result.products;
      showToast('Catalog reset to official Adeeva products!', 'success');
      renderCatalogTable();
      refreshRowDropdowns();
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ==========================================
// Order History & 4 Files Package Management
// ==========================================

let historyPackages = [];
let currentHistoryFilter = 'all';
let currentHistorySearch = '';

// Switch between Dispatch View and History Archive View
window.switchMainTab = function(tabName) {
  const dispatchView = document.getElementById('view-dispatch');
  const historyView = document.getElementById('view-history');
  const navTabDispatch = document.getElementById('nav-tab-dispatch');
  const navTabHistory = document.getElementById('nav-tab-history');

  if (tabName === 'history') {
    if (dispatchView) dispatchView.style.display = 'none';
    if (historyView) historyView.style.display = 'block';
    if (navTabDispatch) navTabDispatch.classList.remove('active');
    if (navTabHistory) navTabHistory.classList.add('active');
    window.location.hash = 'history';
    fetchOrderHistory();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    if (dispatchView) dispatchView.style.display = 'grid';
    if (historyView) historyView.style.display = 'none';
    if (navTabDispatch) navTabDispatch.classList.add('active');
    if (navTabHistory) navTabHistory.classList.remove('active');
    window.location.hash = 'order-form';
  }
};

// Fetch order history from server
window.fetchOrderHistory = async function() {
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    if (data.success && Array.isArray(data.history)) {
      historyPackages = data.history;
      updateHistoryBadges();
      renderOrderHistory();
    }
  } catch (err) {
    console.error('Error fetching order history:', err);
  }
};

// Update badges and metric counts
function updateHistoryBadges() {
  const total = historyPackages.length;
  const ftpCount = historyPackages.filter(p => p.ftpUploaded).length;
  const localCount = total - ftpCount;

  const headerBadge = document.getElementById('header-history-count');
  const navBadge = document.getElementById('history-nav-count');
  const metricTotal = document.getElementById('metric-total-count');
  const metricFtp = document.getElementById('metric-ftp-count');
  const metricPending = document.getElementById('metric-pending-count');
  const chipAll = document.getElementById('chip-count-all');
  const chipFtp = document.getElementById('chip-count-ftp');
  const chipLocal = document.getElementById('chip-count-local');

  if (headerBadge) headerBadge.textContent = total;
  if (navBadge) navBadge.textContent = total;
  if (metricTotal) metricTotal.textContent = total;
  if (metricFtp) metricFtp.textContent = ftpCount;
  if (metricPending) metricPending.textContent = localCount;
  if (chipAll) chipAll.textContent = total;
  if (chipFtp) chipFtp.textContent = ftpCount;
  if (chipLocal) chipLocal.textContent = localCount;
}

// Filter cards by status chip
window.filterHistoryCards = function(filterType, btnEl) {
  currentHistoryFilter = filterType;
  const chips = document.querySelectorAll('.history-filter-chips .filter-chip');
  chips.forEach(c => c.classList.remove('active-chip'));
  if (btnEl) btnEl.classList.add('active-chip');
  renderOrderHistory();
};

// Render the historical 4-file packages
window.renderOrderHistory = function() {
  const container = document.getElementById('history-packages-list');
  if (!container) return;

  const query = currentHistorySearch.trim().toLowerCase();
  let filtered = historyPackages.filter(pkg => {
    // Status filter
    if (currentHistoryFilter === 'ftp' && !pkg.ftpUploaded) return false;
    if (currentHistoryFilter === 'local' && pkg.ftpUploaded) return false;

    // Search filter
    if (query) {
      const matchOrder = pkg.orderNo && pkg.orderNo.toLowerCase().includes(query);
      const matchCust = pkg.customerName && pkg.customerName.toLowerCase().includes(query);
      const matchCustNo = pkg.customerNo && pkg.customerNo.toLowerCase().includes(query);
      const matchInv = pkg.invoiceNumber && pkg.invoiceNumber.toLowerCase().includes(query);
      if (!matchOrder && !matchCust && !matchCustNo && !matchInv) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="glass-panel" style="text-align: center; padding: 3.5rem 1.5rem; color: var(--text-muted); background: #ffffff;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 1rem; opacity: 0.5; color: var(--adeeva-bronze);">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--adeeva-bronze); margin-bottom: 0.5rem;">No History Packages Found</h3>
        <p style="font-size: 0.85rem; margin-bottom: 1.5rem; color: var(--text-secondary); max-width: 440px; margin-left: auto; margin-right: auto;">
          ${historyPackages.length === 0 ? 'No orders have been dispatched or generated yet. Use the Order Dispatch form to create your first 4-file package!' : 'No historical order matched your current search filters.'}
        </p>
        <button type="button" class="btn btn-teal" onclick="switchMainTab('dispatch')">
          Go to Order Dispatch Form
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(pkg => {
    const orderNo = pkg.orderNo;
    const dateFormatted = pkg.createdAt ? new Date(pkg.createdAt).toLocaleString(undefined, { 
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    }) : 'Recent';

    const custName = pkg.customerName || 'N/A';
    const totalDisp = parseFloat(pkg.total) > 0 ? `$${parseFloat(pkg.total).toFixed(2)}` : '$0.00';
    const itemsCount = pkg.itemCount ? `${pkg.itemCount} Items` : 'Items included';

    const ftpBadge = pkg.ftpUploaded 
      ? `<span class="history-ftp-badge uploaded" title="Uploaded to FTP: ${pkg.ftpUploadedAt || ''}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Uploaded to ${escapeHtml(pkg.ftpTargetDir || '/for_ccm/archive')}</span>`
      : `<span class="history-ftp-badge pending" title="Package ready on disk"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg> Local Output Only</span>`;

    const files = pkg.files || {};
    const custSize = files.customerXml?.size ? `${(files.customerXml.size / 1024).toFixed(1)} KB` : 'XML File';
    const shipSize = files.shiptoXml?.size ? `${(files.shiptoXml.size / 1024).toFixed(1)} KB` : 'XML File';
    const ordSize = files.orderXml?.size ? `${(files.orderXml.size / 1024).toFixed(1)} KB` : 'XML File';
    const pdfSize = files.invoicePdf?.size ? `${(files.invoicePdf.size / 1024).toFixed(1)} KB` : 'PDF File';

    return `
      <div class="history-order-card glass-panel" id="history-card-${orderNo}">
        <!-- Card Header -->
        <div class="history-card-header">
          <div class="history-order-meta">
            <span class="history-order-no-pill">${escapeHtml(orderNo)}</span>
            <div class="history-order-submeta">
              <span class="history-cust-name" title="${escapeHtml(custName)}">👤 <strong>${escapeHtml(custName)}</strong></span>
              <span class="history-date-stamp">🕒 ${dateFormatted}</span>
            </div>
          </div>
          <div class="history-header-right">
            ${ftpBadge}
            <div class="history-order-total">${totalDisp}</div>
          </div>
        </div>

        <!-- The 4 Created Files Grid -->
        <div class="history-4files-grid">
          <!-- 1. Customer XML -->
          <div class="history-file-box">
            <div class="h-file-top">
              <span class="h-file-tag xml">XML</span>
              <span class="h-file-name" title="customer-${orderNo}.xml">customer-${orderNo}.xml</span>
            </div>
            <div class="h-file-meta">Customer Profile • ${custSize}</div>
            <div class="h-file-actions">
              <button type="button" class="btn btn-secondary btn-xs" onclick="previewFile('customer', '${orderNo}')" title="Preview XML Content">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Preview XML
              </button>
              <a href="/api/download/${encodeURIComponent(orderNo)}/customer" class="btn btn-outline-teal btn-xs" download title="Download Customer XML">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download
              </a>
            </div>
          </div>

          <!-- 2. Ship-To XML -->
          <div class="history-file-box">
            <div class="h-file-top">
              <span class="h-file-tag xml">XML</span>
              <span class="h-file-name" title="shipto-${orderNo}.xml">shipto-${orderNo}.xml</span>
            </div>
            <div class="h-file-meta">Shipping Address • ${shipSize}</div>
            <div class="h-file-actions">
              <button type="button" class="btn btn-secondary btn-xs" onclick="previewFile('shipto', '${orderNo}')" title="Preview XML Content">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Preview XML
              </button>
              <a href="/api/download/${encodeURIComponent(orderNo)}/shipto" class="btn btn-outline-teal btn-xs" download title="Download Ship-To XML">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download
              </a>
            </div>
          </div>

          <!-- 3. Order XML -->
          <div class="history-file-box">
            <div class="h-file-top">
              <span class="h-file-tag xml">XML</span>
              <span class="h-file-name" title="order-${orderNo}.xml">order-${orderNo}.xml</span>
            </div>
            <div class="h-file-meta">Order Items • ${ordSize}</div>
            <div class="h-file-actions">
              <button type="button" class="btn btn-secondary btn-xs" onclick="previewFile('order', '${orderNo}')" title="Preview XML Content">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Preview XML
              </button>
              <a href="/api/download/${encodeURIComponent(orderNo)}/order" class="btn btn-outline-teal btn-xs" download title="Download Order XML">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download
              </a>
            </div>
          </div>

          <!-- 4. Invoice PDF -->
          <div class="history-file-box pdf-box">
            <div class="h-file-top">
              <span class="h-file-tag pdf">PDF</span>
              <span class="h-file-name" title="invoice-${orderNo}.pdf">invoice-${orderNo}.pdf</span>
            </div>
            <div class="h-file-meta">Official Invoice • ${pdfSize}</div>
            <div class="h-file-actions">
              <button type="button" class="btn btn-secondary btn-xs" onclick="previewFile('invoice', '${orderNo}')" title="Preview Invoice PDF">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Preview PDF
              </button>
              <a href="/api/download/${encodeURIComponent(orderNo)}/pdf" class="btn btn-outline-primary btn-xs" download title="Download Invoice PDF">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download
              </a>
            </div>
          </div>
        </div>

        <!-- Card Footer Actions Bar -->
        <div class="history-card-footer">
          <div class="history-card-tags">
            <span class="h-summary-pill">${itemsCount}</span>
            ${pkg.invoiceNumber ? `<span class="h-summary-pill">Invoice: ${escapeHtml(pkg.invoiceNumber)}</span>` : ''}
          </div>
          <div class="history-package-actions">
            <button type="button" class="btn btn-secondary btn-sm" onclick="loadHistoryOrderIntoForm('${orderNo}')" title="Load this order's data into the form">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Load into Form
            </button>
            <a href="/api/download-zip/${encodeURIComponent(orderNo)}" class="btn btn-secondary btn-sm" title="Download all 4 files as ZIP package" download>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download All (ZIP)
            </a>
            <button type="button" class="btn btn-teal btn-sm" onclick="handleHistoryFtpUpload('${orderNo}')" title="Send these 4 files to FTP">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload to FTP
            </button>
            <button type="button" class="btn btn-outline-danger btn-sm" onclick="handleDeleteHistoryOrder('${orderNo}')" title="Delete this order package from disk">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
};

// Load historical order data into dispatch form
window.loadHistoryOrderIntoForm = async function(orderNo) {
  try {
    const res = await fetch(`/api/history/${encodeURIComponent(orderNo)}`);
    const data = await res.json();
    if (!data.success || !data.item) {
      throw new Error(data.message || 'Order details not found');
    }
    const orderData = data.item.orderData;
    if (!orderData) {
      document.getElementById('orderNo').value = orderNo;
      switchMainTab('dispatch');
      showToast(`Loaded Order Number ${orderNo}. Please complete form.`, 'info');
      return;
    }

    populateFormWithData(orderData);
    switchMainTab('dispatch');
    showToast(`Loaded Order ${orderNo} into Dispatch Form!`, 'success');
  } catch (err) {
    showToast(`Failed to load order: ${err.message}`, 'error');
  }
};

// Dispatch a historical order package directly to FTP
window.handleHistoryFtpUpload = async function(orderNo) {
  const targetDir = document.getElementById('ftpRemoteDir')?.value.trim() || '/for_ccm/archive';
  const ftpConfig = getFtpConfig();

  ftpModalTitle.textContent = `Dispatching Historical Order ${orderNo} to FTP`;
  ftpStatusMessage.innerHTML = `<span class="spinner"></span> Uploading historical 4-file package to <strong>${escapeHtml(targetDir)}</strong>...`;
  
  ftpChecklist.innerHTML = `
    <div class="upload-check-item">
      <span>customer-${escapeHtml(orderNo)}.xml</span>
      <span style="color: var(--accent-amber);">Uploading...</span>
    </div>
    <div class="upload-check-item">
      <span>shipto-${escapeHtml(orderNo)}.xml</span>
      <span style="color: var(--accent-amber);">Uploading...</span>
    </div>
    <div class="upload-check-item">
      <span>order-${escapeHtml(orderNo)}.xml</span>
      <span style="color: var(--accent-amber);">Uploading...</span>
    </div>
    <div class="upload-check-item">
      <span>invoice-${escapeHtml(orderNo)}.pdf</span>
      <span style="color: var(--accent-amber);">Uploading...</span>
    </div>
  `;
  ftpModal.classList.add('active');

  try {
    const res = await fetch(`/api/history/ftp-upload/${encodeURIComponent(orderNo)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ftpConfig, remoteDir: targetDir })
    });
    const result = await res.json();
    if (result.success) {
      ftpStatusMessage.innerHTML = `✅ <strong style="color: var(--accent-emerald);">${result.message || 'Transfer completed successfully!'}</strong> Destination: <code>${escapeHtml(result.targetDir || targetDir)}</code>`;
      ftpChecklist.innerHTML = (result.results || []).map(r => `
        <div class="upload-check-item success">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="color: var(--accent-emerald); font-weight: bold;">✓</span>
            <span>${escapeHtml(r.fileName)}</span>
          </div>
          <span style="color: var(--accent-emerald); font-size: 0.75rem;">${(r.sizeBytes / 1024).toFixed(1)} KB Sent</span>
        </div>
      `).join('');
      showToast(`Order ${orderNo} package dispatched to FTP successfully!`, 'success');
      fetchOrderHistory();
    } else {
      ftpStatusMessage.innerHTML = `⚠️ <strong style="color: var(--accent-rose);">${result.message}</strong>`;
      if (result.results && result.results.length > 0) {
        ftpChecklist.innerHTML = result.results.map(r => `
          <div class="upload-check-item ${r.status === 'success' ? 'success' : 'failed'}">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-weight: bold;">${r.status === 'success' ? '✓' : '✗'}</span>
              <span>${escapeHtml(r.fileName)}</span>
            </div>
            <span style="font-size: 0.75rem;">${r.status === 'success' ? 'Sent' : (r.error || 'Failed')}</span>
          </div>
        `).join('');
      }
      showToast(`FTP Error: ${result.message}`, 'error');
    }
  } catch (err) {
    ftpStatusMessage.innerHTML = `❌ <strong style="color: var(--accent-rose);">Error: ${err.message}</strong>`;
    showToast(`Error: ${err.message}`, 'error');
  }
};

// Delete historical package and its files
window.handleDeleteHistoryOrder = async function(orderNo) {
  if (!confirm(`Are you sure you want to permanently delete Order ${orderNo} and its 4 files from disk?`)) {
    return;
  }
  try {
    const res = await fetch(`/api/history/${encodeURIComponent(orderNo)}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      showToast(`Order ${orderNo} package removed from disk and history.`, 'info');
      fetchOrderHistory();
    } else {
      showToast(result.message || 'Failed to delete package.', 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
};


