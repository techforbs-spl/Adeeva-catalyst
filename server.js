const fs = require('fs');
const path = require('path');
const os = require('os');
const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const { generateInvoicePdf } = require('./pdfGenerator');
const { generateCustomerXml, generateShiptoXml, generateOrderXml } = require('./xmlGenerator');
const { testFtpConnection, uploadFilesToFtp, listFtpDirectory, createFtpDirectory } = require('./ftpService');
const { fetchFtpOrdersAndShipments, sendToGoogleSheetWebhook, testGoogleWebhook, archiveShipmentAndOrder } = require('./googleSheetSyncService');

const isVercel = !!process.env.VERCEL;
const OUTPUT_DIR = isVercel ? path.join(os.tmpdir(), 'adeeva-output') : path.join(__dirname, 'output');
const DATA_DIR = isVercel ? path.join(os.tmpdir(), 'adeeva-data') : path.join(__dirname, 'data');
const CONFIG_FILE = isVercel ? path.join(os.tmpdir(), 'ftp-config.json') : path.join(__dirname, 'ftp-config.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const PRODUCTS_MD_FILE = isVercel ? path.join(os.tmpdir(), 'PRODUCTS.md') : path.join(__dirname, 'PRODUCTS.md');

try {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Pre-seed sample and data files into writable tempdir on Vercel
  if (isVercel) {
    const bundledOutput = path.join(__dirname, 'output');
    if (fs.existsSync(bundledOutput)) {
      fs.readdirSync(bundledOutput).forEach(fn => {
        const target = path.join(OUTPUT_DIR, fn);
        if (!fs.existsSync(target)) {
          try { fs.copyFileSync(path.join(bundledOutput, fn), target); } catch (_) {}
        }
      });
    }

    const bundledData = path.join(__dirname, 'data');
    if (fs.existsSync(bundledData)) {
      fs.readdirSync(bundledData).forEach(fn => {
        const target = path.join(DATA_DIR, fn);
        if (!fs.existsSync(target)) {
          try { fs.copyFileSync(path.join(bundledData, fn), target); } catch (_) {}
        }
      });
    }

    const bundledMd = path.join(__dirname, 'PRODUCTS.md');
    if (fs.existsSync(bundledMd) && !fs.existsSync(PRODUCTS_MD_FILE)) {
      try { fs.copyFileSync(bundledMd, PRODUCTS_MD_FILE); } catch (_) {}
    }
  }
} catch (err) {
  console.warn('Initialization directory setup warning:', err.message);
}

function loadEnvDynamically() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
      for (const k in parsed) {
        process.env[k] = parsed[k];
      }
      return parsed;
    } catch (e) {
      console.error('Error parsing .env:', e);
    }
  }
  return {};
}

// Resolve FTP config from request or .env dynamically
function getEffectiveFtpConfig(clientConfig = {}) {
  const fileEnv = loadEnvDynamically();
  const host = clientConfig.host || fileEnv.FTP_HOST || process.env.FTP_HOST || '';
  const port = clientConfig.port 
    ? parseInt(clientConfig.port, 10) 
    : parseInt(fileEnv.FTP_PORT || process.env.FTP_PORT || '21', 10);
  const user = clientConfig.user || fileEnv.FTP_USER || process.env.FTP_USER || 'anonymous';
  const password = (clientConfig.password !== undefined && clientConfig.password !== '') 
    ? clientConfig.password 
    : (fileEnv.FTP_PASSWORD !== undefined ? fileEnv.FTP_PASSWORD : (process.env.FTP_PASSWORD || ''));
  const remoteDir = fileEnv.FTP_REMOTE_DIR || process.env.FTP_REMOTE_DIR || clientConfig.remoteDir || '/for_ccm';
  const secure = clientConfig.secure !== undefined 
    ? (clientConfig.secure === true || clientConfig.secure === 'true') 
    : (fileEnv.FTP_SECURE === 'true' || process.env.FTP_SECURE === 'true');
  
  return { host, port, user, password, remoteDir, secure };
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Explicit root fallback
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.send('Adeeva Catalyst API is running.');
});

// Function to return default sample order data
function getSampleOrderData() {
  return {
    orderNo: 'ORD0042588',
    orderId: '40139',
    orderDate: '2026-09-11',
    dateWanted: '2026-09-11',
    invoiceNumber: 'IN00042251',
    customerNo: '03507',
    shipVia: 'Purolator',
    orderNotes: 'NO SIGNATURE REQUIRED',
    terms: '',
    customerName: 'Chagnon, Olivier',
    attention: 'Chagnon, Olivier',
    address1: '20 Desbiens St',
    address2: '-, -  ',
    city: 'Amqui',
    provinceState: 'QC',
    postalZip: 'G5J 3P1',
    country: 'CA',
    telephone: '4186291244',
    fax: '',
    email: 'info@axesanteoptimale.com',
    sameAsBillTo: true,
    shipToName: 'Chagnon, Olivier',
    shipToAttention: 'Chagnon, Olivier',
    shipToAddress1: '20 Desbiens St',
    shipToAddress2: '  ',
    shipToCity: 'Amqui',
    shipToProvince: 'QC',
    shipToPostal: 'G5J 3P1',
    shipToCountry: 'CA',
    shipToPhone: '4186291244',
    shipToFax: '',
    shipToEmail: 'info@axesanteoptimale.com',
    companyName: 'Adeeva Nutritionals Canada Inc.',
    companyAddress1: '5500 Explorer Drive, 4th Floor,',
    companyAddress2: 'Mississauga, ON L4W 5C7',
    companyCountry: 'Canada',
    companyPhone: '888-251-1010',
    items: [
      {
        partNo: 'KNS-000013',
        sku: 'KNS-000013',
        description: 'Bone Support Formula - 1 bottle (60 caplets)',
        productName: 'Bone Support Formula',
        quantity: 12,
        shipped: 12,
        bo: 0,
        price: 20.06,
        priceExact: '20.0600007'
      },
      {
        partNo: 'KNS-000003',
        sku: 'KNS-000003',
        description: 'Glucosamine Joint Formula - 1 bottle (90 capsules)',
        productName: 'Glucosamine Joint Formula',
        quantity: 3,
        shipped: 3,
        bo: 0,
        price: 25.28,
        priceExact: '25.2800007'
      }
    ],
    discount: 0,
    shipping: 0,
    taxRate: 5,
    tax: 15.83,
    subtotal: 316.56,
    total: 332.39
  };
}

// History storage & discovery
function loadHistory() {
  let history = [];
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch (e) {
      console.error('Error reading history.json:', e);
      history = [];
    }
  } else {
    const bundledHistory = path.join(__dirname, 'data', 'history.json');
    if (fs.existsSync(bundledHistory)) {
      try {
        history = JSON.parse(fs.readFileSync(bundledHistory, 'utf8'));
      } catch (_) {}
    }
  }

  // Scan OUTPUT_DIR for any orders that exist on disk
  if (fs.existsSync(OUTPUT_DIR)) {
    const files = fs.readdirSync(OUTPUT_DIR);
    const orderNos = new Set();
    files.forEach(file => {
      const match = file.match(/^(?:customer|shipto|order|invoice)-(.+)\.(?:xml|pdf)$/i);
      if (match) {
        orderNos.add(match[1]);
      }
    });

    let modified = false;
    orderNos.forEach(orderNo => {
      let existing = history.find(h => h.orderNo === orderNo);
      const custPath = path.join(OUTPUT_DIR, `customer-${orderNo}.xml`);
      const shipPath = path.join(OUTPUT_DIR, `shipto-${orderNo}.xml`);
      const ordPath = path.join(OUTPUT_DIR, `order-${orderNo}.xml`);
      const pdfPath = path.join(OUTPUT_DIR, `invoice-${orderNo}.pdf`);

      const custExists = fs.existsSync(custPath);
      const shipExists = fs.existsSync(shipPath);
      const ordExists = fs.existsSync(ordPath);
      const pdfExists = fs.existsSync(pdfPath);

      if (!existing && (custExists || shipExists || ordExists || pdfExists)) {
        let fileTime = new Date().toISOString();
        try {
          const stats = fs.statSync(custExists ? custPath : (ordExists ? ordPath : pdfPath));
          fileTime = stats.mtime.toISOString();
        } catch (_) {}

        const sampleData = orderNo === 'ORD0042588' ? getSampleOrderData() : null;

        history.push({
          orderNo,
          orderId: sampleData ? sampleData.orderId : '',
          invoiceNumber: sampleData ? sampleData.invoiceNumber : '',
          customerName: sampleData ? sampleData.customerName : `Order ${orderNo}`,
          customerNo: sampleData ? sampleData.customerNo : '',
          total: sampleData ? sampleData.total : 0,
          itemCount: sampleData ? sampleData.items.length : 0,
          createdAt: fileTime,
          updatedAt: fileTime,
          ftpUploaded: false,
          ftpUploadedAt: null,
          ftpTargetDir: null,
          files: {
            customerXml: { name: `customer-${orderNo}.xml`, size: custExists ? fs.statSync(custPath).size : 0, exists: custExists },
            shiptoXml: { name: `shipto-${orderNo}.xml`, size: shipExists ? fs.statSync(shipPath).size : 0, exists: shipExists },
            orderXml: { name: `order-${orderNo}.xml`, size: ordExists ? fs.statSync(ordPath).size : 0, exists: ordExists },
            invoicePdf: { name: `invoice-${orderNo}.pdf`, size: pdfExists ? fs.statSync(pdfPath).size : 0, exists: pdfExists }
          },
          orderData: sampleData
        });
        modified = true;
      }
    });

    if (modified) {
      saveHistory(history);
    }
  }

  // Update dynamic file existence status for all entries
  history.forEach(item => {
    const custPath = path.join(OUTPUT_DIR, `customer-${item.orderNo}.xml`);
    const shipPath = path.join(OUTPUT_DIR, `shipto-${item.orderNo}.xml`);
    const ordPath = path.join(OUTPUT_DIR, `order-${item.orderNo}.xml`);
    const pdfPath = path.join(OUTPUT_DIR, `invoice-${item.orderNo}.pdf`);

    item.files = {
      customerXml: { name: `customer-${item.orderNo}.xml`, size: fs.existsSync(custPath) ? fs.statSync(custPath).size : 0, exists: fs.existsSync(custPath) },
      shiptoXml: { name: `shipto-${item.orderNo}.xml`, size: fs.existsSync(shipPath) ? fs.statSync(shipPath).size : 0, exists: fs.existsSync(shipPath) },
      orderXml: { name: `order-${item.orderNo}.xml`, size: fs.existsSync(ordPath) ? fs.statSync(ordPath).size : 0, exists: fs.existsSync(ordPath) },
      invoicePdf: { name: `invoice-${item.orderNo}.pdf`, size: fs.existsSync(pdfPath) ? fs.statSync(pdfPath).size : 0, exists: fs.existsSync(pdfPath) }
    };
  });

  // Sort newest first
  history.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return history;
}

function formatHistoryToMarkdown(history) {
  let md = `# 📜 Adëeva Order History & 4 Files Archive\n\n`;
  md += `> **No Database Required**: All historical orders and packages are automatically stored in \`data/history.json\` and in the \`output/\` directory (\`customer-*.xml\`, \`shipto-*.xml\`, \`order-*.xml\`, \`invoice-*.pdf\`).  \n`;
  md += `> You can also view, search, preview, download, and re-dispatch all past orders anytime in the **"Order History & 4 Files Archive"** tab in the web interface!\n\n`;
  md += `---\n\n`;
  md += `### 📦 Dispatched Order Archive\n\n`;
  md += `| Order # | Customer Name | Order Date | Items | Total ($) | 4 Files Status | FTP Upload Status | Created At |\n`;
  md += `| :--- | :--- | :--- | :---: | :---: | :--- | :--- | :--- |\n`;
  for (const h of history) {
    const orderNo = h.orderNo || '-';
    const custName = (h.customerName || h.orderData?.customerName || '-').replace(/\|/g, '-');
    const orderDate = h.orderData?.orderDate || '-';
    const itemsCount = h.itemCount || (h.orderData?.items ? h.orderData.items.length : 0);
    const total = typeof h.total === 'number' ? `$${h.total.toFixed(2)}` : (h.total || '$0.00');
    const ftpStatus = h.ftpUploaded ? `✅ Uploaded (${h.ftpTargetDir || '/for_ccm/archive'})` : `📁 Local Output Only`;
    const created = h.createdAt ? new Date(h.createdAt).toLocaleDateString() : '-';
    md += `| **${orderNo}** | ${custName} | ${orderDate} | ${itemsCount} | ${total} | ✅ Ready | ${ftpStatus} | ${created} |\n`;
  }
  md += `\n`;
  return md;
}

function saveHistory(history) {
  try {
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not save history to disk:', err.message);
  }

  try {
    const mdContent = formatHistoryToMarkdown(history);
    const historyMdPath = path.join(__dirname, 'HISTORY.md');
    fs.writeFileSync(historyMdPath, mdContent, 'utf8');
  } catch (err) {
    console.warn('Could not save history to HISTORY.md:', err.message);
  }
}

function recordOrderHistory(data, isFtp = false, ftpDir = '') {
  const orderNo = (data.orderNo || 'ORD0000000').trim();
  const history = loadHistory();
  const existingIndex = history.findIndex(h => h.orderNo === orderNo);

  const custPath = path.join(OUTPUT_DIR, `customer-${orderNo}.xml`);
  const shipPath = path.join(OUTPUT_DIR, `shipto-${orderNo}.xml`);
  const ordPath = path.join(OUTPUT_DIR, `order-${orderNo}.xml`);
  const pdfPath = path.join(OUTPUT_DIR, `invoice-${orderNo}.pdf`);

  const nowIso = new Date().toISOString();
  const entry = existingIndex >= 0 ? history[existingIndex] : {
    orderNo,
    createdAt: nowIso
  };

  entry.orderNo = orderNo;
  entry.orderId = data.orderId || entry.orderId || '';
  entry.invoiceNumber = data.invoiceNumber || entry.invoiceNumber || '';
  entry.customerName = data.customerName || entry.customerName || '';
  entry.customerNo = data.customerNo || entry.customerNo || '';
  entry.total = parseFloat(data.total) >= 0 ? parseFloat(data.total) : (entry.total || 0);
  entry.itemCount = Array.isArray(data.items) ? data.items.length : (entry.itemCount || 0);
  entry.updatedAt = nowIso;
  if (!entry.createdAt) entry.createdAt = nowIso;

  if (isFtp) {
    entry.ftpUploaded = true;
    entry.ftpUploadedAt = nowIso;
    entry.ftpTargetDir = ftpDir || '/for_ccm/archive';
  }

  entry.files = {
    customerXml: { name: `customer-${orderNo}.xml`, size: fs.existsSync(custPath) ? fs.statSync(custPath).size : 0, exists: fs.existsSync(custPath) },
    shiptoXml: { name: `shipto-${orderNo}.xml`, size: fs.existsSync(shipPath) ? fs.statSync(shipPath).size : 0, exists: fs.existsSync(shipPath) },
    orderXml: { name: `order-${orderNo}.xml`, size: fs.existsSync(ordPath) ? fs.statSync(ordPath).size : 0, exists: fs.existsSync(ordPath) },
    invoicePdf: { name: `invoice-${orderNo}.pdf`, size: fs.existsSync(pdfPath) ? fs.statSync(pdfPath).size : 0, exists: fs.existsSync(pdfPath) }
  };

  entry.orderData = data;

  if (existingIndex >= 0) {
    history[existingIndex] = entry;
  } else {
    history.unshift(entry);
  }

  saveHistory(history);
  return entry;
}

// Helper to format date string
function normalizeDate(dateStr) {
  if (!dateStr) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return {
      raw: `${yyyy}${mm}${dd}`,
      formatted: `${dd}/${mm}/${yyyy}`,
      iso: `${yyyy}-${mm}-${dd}`
    };
  }

  // If already YYYYMMDD
  if (/^\d{8}$/.test(dateStr)) {
    const yyyy = dateStr.slice(0, 4);
    const mm = dateStr.slice(4, 6);
    const dd = dateStr.slice(6, 8);
    return {
      raw: dateStr,
      formatted: `${dd}/${mm}/${yyyy}`,
      iso: `${yyyy}-${mm}-${dd}`
    };
  }

  // If YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [yyyy, mm, dd] = dateStr.split('-');
    return {
      raw: `${yyyy}${mm}${dd}`,
      formatted: `${dd}/${mm}/${yyyy}`,
      iso: dateStr
    };
  }

  // If DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [dd, mm, yyyy] = dateStr.split('/');
    return {
      raw: `${yyyy}${mm}${dd}`,
      formatted: dateStr,
      iso: `${yyyy}-${mm}-${dd}`
    };
  }

  return { raw: dateStr, formatted: dateStr, iso: dateStr };
}

// Generate the 4 files
async function generateAllFiles(data) {
  const orderNo = (data.orderNo || 'ORD0000000').trim();
  const dateInfo = normalizeDate(data.orderDate);
  data.orderDateRaw = dateInfo.raw;
  data.orderDateFormatted = dateInfo.formatted;
  data.invoiceDate = data.invoiceDate || dateInfo.formatted;

  const files = {
    customerXmlPath: path.join(OUTPUT_DIR, `customer-${orderNo}.xml`),
    shiptoXmlPath: path.join(OUTPUT_DIR, `shipto-${orderNo}.xml`),
    orderXmlPath: path.join(OUTPUT_DIR, `order-${orderNo}.xml`),
    invoicePdfPath: path.join(OUTPUT_DIR, `invoice-${orderNo}.pdf`),
  };

  const customerXmlContent = generateCustomerXml(data);
  const shiptoXmlContent = generateShiptoXml(data);
  const orderXmlContent = generateOrderXml(data);

  fs.writeFileSync(files.customerXmlPath, customerXmlContent, 'utf8');
  fs.writeFileSync(files.shiptoXmlPath, shiptoXmlContent, 'utf8');
  fs.writeFileSync(files.orderXmlPath, orderXmlContent, 'utf8');

  await generateInvoicePdf(data, files.invoicePdfPath);

  // Record package in persistent history
  recordOrderHistory(data, false);

  return {
    orderNo,
    files: [
      { name: `customer-${orderNo}.xml`, path: files.customerXmlPath, type: 'xml', size: fs.statSync(files.customerXmlPath).size },
      { name: `shipto-${orderNo}.xml`, path: files.shiptoXmlPath, type: 'xml', size: fs.statSync(files.shiptoXmlPath).size },
      { name: `order-${orderNo}.xml`, path: files.orderXmlPath, type: 'xml', size: fs.statSync(files.orderXmlPath).size },
      { name: `invoice-${orderNo}.pdf`, path: files.invoicePdfPath, type: 'pdf', size: fs.statSync(files.invoicePdfPath).size },
    ],
    previews: {
      customerXml: customerXmlContent,
      shiptoXml: shiptoXmlContent,
      orderXml: orderXmlContent,
      invoicePdfUrl: `/api/download/${encodeURIComponent(orderNo)}/pdf`
    }
  };
}

// API: Generate 4 files
app.post('/api/generate', async (req, res) => {
  try {
    const data = req.body;
    if (!data.orderNo) {
      return res.status(400).json({ success: false, error: 'Order Number is required.' });
    }
    const result = await generateAllFiles(data);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Generation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ensure the 4 files for an order exist on disk; if missing, auto-regenerate on the fly!
async function ensureOrderFilesExist(orderNo) {
  const filenames = [
    `customer-${orderNo}.xml`,
    `shipto-${orderNo}.xml`,
    `order-${orderNo}.xml`,
    `invoice-${orderNo}.pdf`
  ];

  // 1. If files exist in bundled output (e.g. on Vercel deployment), copy them to writable OUTPUT_DIR
  const bundledOutput = path.join(__dirname, 'output');
  if (fs.existsSync(bundledOutput)) {
    filenames.forEach(fn => {
      const target = path.join(OUTPUT_DIR, fn);
      const src = path.join(bundledOutput, fn);
      if (!fs.existsSync(target) && fs.existsSync(src)) {
        try { fs.copyFileSync(src, target); } catch (_) {}
      }
    });
  }

  // 2. Check if all 4 files already exist
  const allExist = filenames.every(fn => fs.existsSync(path.join(OUTPUT_DIR, fn)));
  if (allExist) return true;

  // 3. Look up orderData in history or sample data
  const history = loadHistory();
  const entry = history.find(h => h.orderNo === orderNo);
  let orderData = entry?.orderData;
  if (!orderData && (orderNo === 'ORD0042588' || orderNo === 'ORD42588')) {
    orderData = getSampleOrderData();
  }

  // 4. Regenerate missing files on demand
  if (orderData) {
    try {
      const custPath = path.join(OUTPUT_DIR, `customer-${orderNo}.xml`);
      const shipPath = path.join(OUTPUT_DIR, `shipto-${orderNo}.xml`);
      const ordPath = path.join(OUTPUT_DIR, `order-${orderNo}.xml`);
      const pdfPath = path.join(OUTPUT_DIR, `invoice-${orderNo}.pdf`);

      if (!fs.existsSync(custPath)) fs.writeFileSync(custPath, generateCustomerXml(orderData), 'utf8');
      if (!fs.existsSync(shipPath)) fs.writeFileSync(shipPath, generateShiptoXml(orderData), 'utf8');
      if (!fs.existsSync(ordPath)) fs.writeFileSync(ordPath, generateOrderXml(orderData), 'utf8');
      if (!fs.existsSync(pdfPath)) await generateInvoicePdf(orderData, pdfPath);
      return true;
    } catch (err) {
      console.error(`Failed to auto-regenerate files for ${orderNo}:`, err);
    }
  }

  return false;
}

// API: Download single file (with on-the-fly auto-regeneration)
app.get('/api/download/:orderNo/:type', async (req, res) => {
  const { orderNo, type } = req.params;
  let filename = '';
  let contentType = 'application/octet-stream';

  if (type === 'customer') {
    filename = `customer-${orderNo}.xml`;
    contentType = 'application/xml';
  } else if (type === 'shipto') {
    filename = `shipto-${orderNo}.xml`;
    contentType = 'application/xml';
  } else if (type === 'order') {
    filename = `order-${orderNo}.xml`;
    contentType = 'application/xml';
  } else if (type === 'pdf' || type === 'invoice') {
    filename = `invoice-${orderNo}.pdf`;
    contentType = 'application/pdf';
  } else {
    return res.status(400).send('Invalid file type.');
  }

  await ensureOrderFilesExist(orderNo);

  let filePath = path.join(OUTPUT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    const bundledPath = path.join(__dirname, 'output', filename);
    if (fs.existsSync(bundledPath)) {
      filePath = bundledPath;
    } else {
      return res.status(404).send('File not found. Please generate the files first.');
    }
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // If previewing PDF inline, don't force attachment download
  if ((type === 'pdf' || type === 'invoice') && req.query.inline === 'true') {
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  } else {
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }
  fs.createReadStream(filePath).pipe(res);
});

// API: Download all 4 files as ZIP (with on-the-fly auto-regeneration)
app.get('/api/download-zip/:orderNo', async (req, res) => {
  const { orderNo } = req.params;
  await ensureOrderFilesExist(orderNo);

  const filenames = [
    `customer-${orderNo}.xml`,
    `shipto-${orderNo}.xml`,
    `order-${orderNo}.xml`,
    `invoice-${orderNo}.pdf`
  ];

  for (const name of filenames) {
    const p = path.join(OUTPUT_DIR, name);
    const bp = path.join(__dirname, 'output', name);
    if (!fs.existsSync(p) && !fs.existsSync(bp)) {
      return res.status(404).send(`File ${name} not found. Please generate the files first.`);
    }
  }

  try {
    const archiverModule = await import('archiver');
    const ZipArchive = archiverModule.ZipArchive || archiverModule.default?.ZipArchive;
    if (!ZipArchive) {
      return res.status(500).json({ error: 'ZipArchive constructor could not be loaded' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="Order-${orderNo}-Package.zip"`);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('error', (err) => res.status(500).send({ error: err.message }));
    archive.pipe(res);

    filenames.forEach(name => {
      const p = path.join(OUTPUT_DIR, name);
      const bp = path.join(__dirname, 'output', name);
      const actualPath = fs.existsSync(p) ? p : bp;
      archive.file(actualPath, { name });
    });

    archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Order History & 4 Files Management API
// ==========================================

// API: Get All History Packages
app.get('/api/history', (req, res) => {
  try {
    const history = loadHistory();
    res.json({ success: true, count: history.length, history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Get Single History Package (including orderData for form loading)
app.get('/api/history/:orderNo', (req, res) => {
  try {
    const { orderNo } = req.params;
    const history = loadHistory();
    const item = history.find(h => h.orderNo.toLowerCase() === orderNo.toLowerCase());
    if (!item) {
      return res.status(404).json({ success: false, message: `Order ${orderNo} not found in history.` });
    }
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Delete an Order Package and its 4 files from disk & history
app.delete('/api/history/:orderNo', (req, res) => {
  try {
    const { orderNo } = req.params;
    const filenames = [
      `customer-${orderNo}.xml`,
      `shipto-${orderNo}.xml`,
      `order-${orderNo}.xml`,
      `invoice-${orderNo}.pdf`
    ];

    filenames.forEach(name => {
      const filePath = path.join(OUTPUT_DIR, name);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) { console.error(`Error deleting ${name}:`, e); }
      }
    });

    let history = loadHistory();
    history = history.filter(h => h.orderNo.toLowerCase() !== orderNo.toLowerCase());
    saveHistory(history);

    res.json({ success: true, message: `Package ${orderNo} removed successfully.`, history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Upload Historical Package directly to FTP
app.post('/api/history/ftp-upload/:orderNo', async (req, res) => {
  try {
    const { orderNo } = req.params;
    const { ftpConfig, remoteDir } = req.body || {};
    const config = getEffectiveFtpConfig({
      ...(ftpConfig || {}),
      remoteDir: remoteDir || (ftpConfig && ftpConfig.remoteDir) || '/for_ccm'
    });

    if (!config.host) {
      return res.status(400).json({ 
        success: false, 
        message: 'FTP Host is not configured. Please set FTP_HOST in your .env file or enter FTP details.' 
      });
    }

    const filenames = [
      `customer-${orderNo}.xml`,
      `shipto-${orderNo}.xml`,
      `order-${orderNo}.xml`,
      `invoice-${orderNo}.pdf`
    ];

    const filesToUpload = [];
    for (const fn of filenames) {
      const fp = path.join(OUTPUT_DIR, fn);
      if (!fs.existsSync(fp)) {
        return res.status(404).json({ success: false, message: `Required file ${fn} was not found on disk.` });
      }
      filesToUpload.push({ filePath: fp });
    }

    const uploadResult = await uploadFilesToFtp(filesToUpload, config);

    if (uploadResult.success) {
      const history = loadHistory();
      const entry = history.find(h => h.orderNo.toLowerCase() === orderNo.toLowerCase());
      if (entry) {
        entry.ftpUploaded = true;
        entry.ftpUploadedAt = new Date().toISOString();
        entry.ftpTargetDir = config.remoteDir;
        saveHistory(history);
      }
    }

    res.json({
      ...uploadResult,
      orderNo,
      targetDir: config.remoteDir
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Get FTP Configuration Status from .env
app.get('/api/ftp/status', (req, res) => {
  const config = getEffectiveFtpConfig({});
  const hasHost = !!config.host;
  res.json({
    success: true,
    isConfigured: hasHost,
    host: config.host || '',
    port: config.port || 21,
    user: config.user || '',
    defaultDir: config.remoteDir || '/',
    secure: config.secure === true
  });
});

// API: Test FTP Connection
app.post('/api/ftp/test', async (req, res) => {
  try {
    const config = getEffectiveFtpConfig(req.body || {});
    if (!config.host) {
      return res.status(400).json({ 
        success: false, 
        message: 'FTP Host is not configured. Please set FTP_HOST in your .env file or enter FTP details.' 
      });
    }
    const result = await testFtpConnection(config);
    res.json({
      ...result,
      host: config.host,
      port: config.port,
      user: config.user,
      targetDir: result.targetDir || config.remoteDir || '/'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Upload to FTP
app.post('/api/ftp/upload', async (req, res) => {
  try {
    const { orderData, ftpConfig, remoteDir } = req.body;
    if (!orderData || !orderData.orderNo) {
      return res.status(400).json({ success: false, message: 'Order data with Order Number is required.' });
    }

    const config = getEffectiveFtpConfig({
      ...(ftpConfig || {}),
      remoteDir: remoteDir || (ftpConfig && ftpConfig.remoteDir) || orderData.remoteDir
    });

    if (!config.host) {
      return res.status(400).json({ 
        success: false, 
        message: 'FTP Host is not configured. Please set FTP_HOST in your .env file or enter FTP details.' 
      });
    }

    // Generate fresh files
    const genResult = await generateAllFiles(orderData);
    const filesToUpload = genResult.files.map(f => ({ filePath: f.path }));

    const uploadResult = await uploadFilesToFtp(filesToUpload, config);

    if (uploadResult.success) {
      recordOrderHistory(orderData, true, config.remoteDir);
    }

    res.json({
      ...uploadResult,
      orderNo: genResult.orderNo,
      files: genResult.files,
      targetDir: config.remoteDir
    });
  } catch (err) {
    console.error('FTP Upload error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: List FTP Directory contents (Folders and Files)
app.post('/api/ftp/list', async (req, res) => {
  try {
    const { ftpConfig } = req.body;
    const targetPath = req.body.path || req.body.dirPath || '';
    const config = getEffectiveFtpConfig(ftpConfig || {});
    if (!config.host) {
      return res.status(400).json({ 
        success: false, 
        message: 'FTP Host is not configured. Please set FTP_HOST in your .env file.' 
      });
    }
    const result = await listFtpDirectory(config, targetPath || config.remoteDir || '/');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Create Directory on FTP
app.post('/api/ftp/mkdir', async (req, res) => {
  try {
    const { ftpConfig, dirPath } = req.body;
    const config = getEffectiveFtpConfig(ftpConfig || {});
    if (!config.host) {
      return res.status(400).json({ 
        success: false, 
        message: 'FTP Host is not configured. Please set FTP_HOST in your .env file.' 
      });
    }
    if (!dirPath) {
      return res.status(400).json({ success: false, message: 'Directory path is required.' });
    }
    const result = await createFtpDirectory(config, dirPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Save / Get FTP Config
app.get('/api/ftp/config', (req, res) => {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      // Don't expose plain password if not needed, or return as is for convenient local tool
      res.json({ success: true, config });
    } catch {
      res.json({ success: false, config: null });
    }
  } else {
    res.json({ success: true, config: null });
  }
});

app.post('/api/ftp/config', (req, res) => {
  try {
    const config = req.body;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    res.json({ success: true, message: 'FTP configuration saved successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// Product Catalog & SKU Management API
// ==========================================

const DEFAULT_PRODUCTS = [
  { id: 'prod_kns_000024', name: 'Adrnl Support Formula', sku: 'KNS-000024', price: 0, description: '' },
  { id: 'prod_kns_000002', name: 'Body Burn', sku: 'KNS-000002', price: 0, description: '' },
  { id: 'prod_kns_000013', name: 'Bone Support Formula', sku: 'KNS-000013', price: 0, description: '' },
  { id: 'prod_kns_000004', name: 'Cardio Essentials', sku: 'KNS-000004', price: 0, description: '' },
  { id: 'prod_ktf_000003', name: 'Essential H.A. Serum 30ml', sku: 'KTF-000003', price: 0, description: '' },
  { id: 'prod_ktf_000004', name: 'Essential H.A. Spray 60ml', sku: 'KTF-000004', price: 0, description: '' },
  { id: 'prod_ktf_000013', name: 'Essential H.A. Set: Spray 60ml / Serum 30ml', sku: 'KTF-000013', price: 0, description: '' },
  { id: 'prod_kns_000015', name: 'Flora Essentials', sku: 'KNS-000015', price: 0, description: '' },
  { id: 'prod_kns_000003', name: 'Glucosamine Joint Formula', sku: 'KNS-000003', price: 0, description: '' },
  { id: 'prod_kns_000012', name: 'Immuno-Detox Prime', sku: 'KNS-000012', price: 0, description: '' },
  { id: 'prod_kns_000020', name: 'Memory Support Complex', sku: 'KNS-000020', price: 0, description: '' },
  { id: 'prod_kns_000001', name: 'Multi Vitamin & Mineral', sku: 'KNS-000001', price: 0, description: '' },
  { id: 'prod_kns_000016', name: 'Nature’s Essential Oils', sku: 'KNS-000016', price: 0, description: '' },
  { id: 'prod_kns_000018', name: 'Nature’s Iron', sku: 'KNS-000018', price: 0, description: '' },
  { id: 'prod_kns_000007', name: 'Nature’s Relief', sku: 'KNS-000007', price: 0, description: '' },
  { id: 'prod_kns_000017', name: 'Orega-Sept Capsules', sku: 'KNS-000017', price: 0, description: '' },
  { id: 'prod_kns_000008', name: 'Prostate 40 Plus', sku: 'KNS-000008', price: 0, description: '' },
  { id: 'prod_kns_000022', name: 'SensaGen', sku: 'KNS-000022', price: 0, description: '' },
  { id: 'prod_kns_000010', name: 'Sleep – E Naturals', sku: 'KNS-000010', price: 0, description: '' },
  { id: 'prod_kns_000014', name: 'Thyro-Support Formula', sku: 'KNS-000014', price: 0, description: '' },
  { id: 'prod_kns_000011', name: 'Ultimate GLX', sku: 'KNS-000011', price: 0, description: '' },
  { id: 'prod_kns_000021', name: 'UT-Clear', sku: 'KNS-000021', price: 0, description: '' },
  { id: 'prod_kns_000009', name: 'Women’s Hormonal Balance', sku: 'KNS-000009', price: 0, description: '' }
];

function parseProductsFromMarkdown(content) {
  if (!content || typeof content !== 'string') return [];
  const lines = content.split(/\r?\n/);
  const products = [];
  let inTable = false;
  let headers = [];

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    
    const rawCells = trimmed.split('|');
    const cells = rawCells.slice(1, -1).map(c => c.trim());

    if (cells.length < 2) continue;

    // Check if separator row (e.g. |---|---|)
    if (cells.every(c => /^:?-+:?$/.test(c))) {
      inTable = true;
      continue;
    }

    // Header row
    if (!inTable) {
      headers = cells.map(h => h.toLowerCase());
      continue;
    }

    // Data row
    let name = '';
    let sku = '';
    let price = 0;
    let description = '';

    const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('product'));
    const skuIdx = headers.findIndex(h => h.includes('sku') || h.includes('code') || h.includes('part'));
    const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('cost') || h.includes('rate'));
    const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('size') || h.includes('detail') || h.includes('pack'));

    name = (nameIdx !== -1 && cells[nameIdx] !== undefined) ? cells[nameIdx] : cells[0] || '';
    sku = (skuIdx !== -1 && cells[skuIdx] !== undefined) ? cells[skuIdx] : cells[1] || '';
    
    const rawPrice = (priceIdx !== -1 && cells[priceIdx] !== undefined) ? cells[priceIdx] : cells[2];
    price = rawPrice ? parseFloat(rawPrice.replace(/[^0-9.]/g, '')) || 0 : 0;
    
    description = (descIdx !== -1 && cells[descIdx] !== undefined) ? cells[descIdx] : (cells[3] || '');

    if (name && sku) {
      const cleanSku = sku.toUpperCase();
      products.push({
        id: `prod_${cleanSku.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`,
        name: name,
        sku: cleanSku,
        price: isNaN(price) ? 0 : price,
        description: description
      });
    }
  }

  return products;
}

function formatProductsToMarkdown(products) {
  let md = `# 🌿 Adëeva Product & SKU Catalog\n\n`;
  md += `> **Local Product Database**: You can add, edit, or delete products directly in the table below.  \n`;
  md += `> Whenever you add a product name and SKU number here, it will automatically appear in the **Section 4 Product Dropdown** in the app, and selecting the product will auto-select its SKU number!\n\n`;
  md += `---\n\n`;
  md += `### 📝 How to Add a New Product\n`;
  md += `Simply add a new line at the bottom of the table:\n`;
  md += `\`\`\`markdown\n`;
  md += `| Your Product Name | SKU-CODE |\n`;
  md += `\`\`\`\n\n`;
  md += `---\n\n`;
  md += `### 📦 Product Catalog\n\n`;
  md += `| Product Name | SKU |\n`;
  md += `| :--- | :--- |\n`;
  for (const p of products) {
    const name = (p.name || '').replace(/\|/g, '-').trim();
    const sku = (p.sku || '').replace(/\|/g, '-').trim();
    if (name && sku) {
      md += `| ${name} | ${sku} |\n`;
    }
  }
  md += `\n`;
  return md;
}

function loadProducts() {
  // 1. Check PRODUCTS.md first (for direct local editing)
  if (fs.existsSync(PRODUCTS_MD_FILE)) {
    try {
      const content = fs.readFileSync(PRODUCTS_MD_FILE, 'utf8');
      const mdProducts = parseProductsFromMarkdown(content);
      if (mdProducts && mdProducts.length > 0) {
        return mdProducts;
      }
    } catch (e) {
      console.error('Error reading PRODUCTS.md:', e);
    }
  }

  // 2. Check bundled PRODUCTS.md if running in another context
  const bundledMd = path.join(__dirname, 'PRODUCTS.md');
  if (fs.existsSync(bundledMd)) {
    try {
      const content = fs.readFileSync(bundledMd, 'utf8');
      const mdProducts = parseProductsFromMarkdown(content);
      if (mdProducts && mdProducts.length > 0) {
        return mdProducts;
      }
    } catch (_) {}
  }

  // 3. Check products.json
  if (fs.existsSync(PRODUCTS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
    } catch (e) {
      console.error('Error reading products.json:', e);
    }
  }
  const bundled = path.join(__dirname, 'data', 'products.json');
  if (fs.existsSync(bundled)) {
    try {
      return JSON.parse(fs.readFileSync(bundled, 'utf8'));
    } catch (_) {}
  }
  return DEFAULT_PRODUCTS;
}

function saveProducts(products) {
  try {
    const dir = path.dirname(PRODUCTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not save products to JSON:', err.message);
  }

  try {
    const mdContent = formatProductsToMarkdown(products);
    fs.writeFileSync(PRODUCTS_MD_FILE, mdContent, 'utf8');
    const rootMd = path.join(__dirname, 'PRODUCTS.md');
    if (PRODUCTS_MD_FILE !== rootMd && fs.existsSync(rootMd)) {
      try { fs.writeFileSync(rootMd, mdContent, 'utf8'); } catch (_) {}
    }
  } catch (err) {
    console.warn('Could not save products to PRODUCTS.md:', err.message);
  }
}

// API: Get all products
app.get('/api/products', (req, res) => {
  res.json({ success: true, products: loadProducts() });
});

// API: Add a new product
app.post('/api/products', (req, res) => {
  try {
    const { name, sku, price, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Product Name is required.' });
    }
    if (!sku || !sku.trim()) {
      return res.status(400).json({ success: false, message: 'SKU is required.' });
    }

    const products = loadProducts();
    const newProduct = {
      id: `prod_${Date.now()}`,
      name: name.trim(),
      sku: sku.trim().toUpperCase(),
      price: parseFloat(price) >= 0 ? parseFloat(price) : 0,
      description: (description || '').trim()
    };

    products.push(newProduct);
    saveProducts(products);

    res.json({ success: true, message: 'Product added successfully!', product: newProduct, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Update an existing product
app.put('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, sku, price, description } = req.body;
    const products = loadProducts();
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    if (name) products[idx].name = name.trim();
    if (sku) products[idx].sku = sku.trim().toUpperCase();
    if (price !== undefined) products[idx].price = parseFloat(price) >= 0 ? parseFloat(price) : 0;
    if (description !== undefined) products[idx].description = description.trim();

    saveProducts(products);
    res.json({ success: true, message: 'Product updated successfully!', product: products[idx], products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Delete a product
app.delete('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    let products = loadProducts();
    const initialLen = products.length;
    products = products.filter(p => p.id !== id);
    if (products.length === initialLen) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    saveProducts(products);
    res.json({ success: true, message: 'Product removed from catalog.', products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Reset products to official Adeeva catalog
app.post('/api/products/reset', (req, res) => {
  try {
    saveProducts(DEFAULT_PRODUCTS);
    res.json({ success: true, message: 'Reset to default Adeeva catalog.', products: DEFAULT_PRODUCTS });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Get Sample Data matching workspace ORD0042588
app.get('/api/sample', (req, res) => {
  const sample = {
    orderNo: 'ORD0042588',
    orderId: '40139',
    orderDate: '2026-09-11',
    dateWanted: '2026-09-11',
    invoiceNumber: 'IN00042251',
    customerNo: '03507',
    shipVia: 'Purolator',
    orderNotes: 'NO SIGNATURE REQUIRED',
    terms: '',
    
    // Customer / Bill to
    customerName: 'Chagnon, Olivier',
    attention: 'Chagnon, Olivier',
    address1: '20 Desbiens St',
    address2: '-, -  ',
    city: 'Amqui',
    provinceState: 'QC',
    postalZip: 'G5J 3P1',
    country: 'CA',
    telephone: '4186291244',
    fax: '',
    email: 'info@axesanteoptimale.com',

    // Ship to
    sameAsBillTo: true,
    shipToName: 'Chagnon, Olivier',
    shipToAttention: 'Chagnon, Olivier',
    shipToAddress1: '20 Desbiens St',
    shipToAddress2: '  ',
    shipToCity: 'Amqui',
    shipToProvince: 'QC',
    shipToPostal: 'G5J 3P1',
    shipToCountry: 'CA',
    shipToPhone: '4186291244',
    shipToFax: '',
    shipToEmail: 'info@axesanteoptimale.com',

    // Company Header
    companyName: 'Adeeva Nutritionals Canada Inc.',
    companyAddress1: '5500 Explorer Drive, 4th Floor,',
    companyAddress2: 'Mississauga, ON L4W 5C7',
    companyCountry: 'Canada',
    companyPhone: '888-251-1010',

    // Items
    items: [
      {
        partNo: 'KNS-000013',
        description: 'Bone Support Formula - 1 bottle (60 caplets)',
        quantity: 12,
        shipped: 12,
        bo: 0,
        price: 20.06,
        priceExact: '20.0600007'
      },
      {
        partNo: 'KNS-000003',
        description: 'Glucosamine Joint Formula - 1 bottle (90 capsules)',
        quantity: 3,
        shipped: 3,
        bo: 0,
        price: 25.28,
        priceExact: '25.2800007'
      }
    ],

    // Totals
    discount: 0,
    shipping: 0,
    taxRate: 5,
    tax: 15.83,
    subtotal: 316.56,
    total: 332.39
  };
  res.json(sample);
});

// ==========================================
// Google Sheets Synchronization Routes
// ==========================================

// Dedicated page route
app.get('/sheet-sync', (req, res) => {
  const syncHtmlPath = path.join(__dirname, 'public', 'sheet-sync.html');
  if (fs.existsSync(syncHtmlPath)) {
    return res.sendFile(syncHtmlPath);
  }
  res.status(404).send('Sheet Sync page not found.');
});

// Get current Google Sheet Webhook status
app.get('/api/sheet-sync/status', (req, res) => {
  const env = loadEnvDynamically();
  const webhookUrl = env.GOOGLE_SHEET_WEBHOOK_URL || process.env.GOOGLE_SHEET_WEBHOOK_URL || '';
  const sheetUrl = env.GOOGLE_SHEET_URL || process.env.GOOGLE_SHEET_URL || '';
  res.json({
    configured: Boolean(webhookUrl),
    webhookUrl: webhookUrl || '',
    sheetUrl: sheetUrl || ''
  });
});

// Save Webhook URL / Sheet URL to .env
app.post('/api/sheet-sync/save-webhook', (req, res) => {
  try {
    const { webhookUrl, sheetUrl } = req.body;
    if (!webhookUrl && !sheetUrl) {
      return res.status(400).json({ success: false, message: 'Please provide a Webhook URL or Sheet URL.' });
    }
    const envPath = path.join(__dirname, '.env');
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }
    if (webhookUrl !== undefined) {
      if (content.includes('GOOGLE_SHEET_WEBHOOK_URL=')) {
        content = content.replace(/GOOGLE_SHEET_WEBHOOK_URL=.*/g, `GOOGLE_SHEET_WEBHOOK_URL=${webhookUrl.trim()}`);
      } else {
        content += `\nGOOGLE_SHEET_WEBHOOK_URL=${webhookUrl.trim()}\n`;
      }
      process.env.GOOGLE_SHEET_WEBHOOK_URL = webhookUrl.trim();
    }
    if (sheetUrl !== undefined) {
      if (content.includes('GOOGLE_SHEET_URL=')) {
        content = content.replace(/GOOGLE_SHEET_URL=.*/g, `GOOGLE_SHEET_URL=${sheetUrl.trim()}`);
      } else {
        content += `\nGOOGLE_SHEET_URL=${sheetUrl.trim()}\n`;
      }
      process.env.GOOGLE_SHEET_URL = sheetUrl.trim();
    }
    fs.writeFileSync(envPath, content, 'utf8');
    res.json({ success: true, message: 'Google Sheet settings saved successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Test connection to Google Apps Script Webhook
app.post('/api/sheet-sync/test-webhook', async (req, res) => {
  try {
    const env = loadEnvDynamically();
    const webhookUrl = req.body.webhookUrl || env.GOOGLE_SHEET_WEBHOOK_URL || process.env.GOOGLE_SHEET_WEBHOOK_URL;
    const result = await testGoogleWebhook(webhookUrl);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Preview FTP order confirmations and shipment files from /for_adeeva
app.get('/api/sheet-sync/preview', async (req, res) => {
  try {
    const ftpConfig = getEffectiveFtpConfig();
    const result = await fetchFtpOrdersAndShipments(ftpConfig, '/for_adeeva');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Execute sync: Read FTP order & shipment files, then send to Google Sheet Webhook
app.post('/api/sheet-sync/sync', async (req, res) => {
  try {
    const env = loadEnvDynamically();
    const webhookUrl = req.body.webhookUrl || env.GOOGLE_SHEET_WEBHOOK_URL || process.env.GOOGLE_SHEET_WEBHOOK_URL;
    if (!webhookUrl) {
      return res.status(400).json({ success: false, message: 'Google Apps Script Webhook URL is not configured.' });
    }

    const ftpConfig = getEffectiveFtpConfig();
    const ftpData = await fetchFtpOrdersAndShipments(ftpConfig, '/for_adeeva');
    if (!ftpData.success) {
      return res.status(500).json({ success: false, message: ftpData.message });
    }

    const payload = {
      action: 'batch_sync',
      folder: '/for_adeeva',
      orders: ftpData.orders,
      shipments: ftpData.shipments,
      syncedAt: new Date().toISOString()
    };

    const sheetResponse = await sendToGoogleSheetWebhook(webhookUrl, payload);

    res.json({
      success: true,
      ordersCount: ftpData.orders.length,
      shipmentsCount: ftpData.shipments.length,
      orders: ftpData.orders,
      shipments: ftpData.shipments,
      sheetResponse
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Move shipment file and its matching order file(s) to /for_adeeva/archive/YYYY-MM-DD/ and update Google Sheet
app.post('/api/sheet-sync/archive-shipment', async (req, res) => {
  try {
    const { shipmentFileName, ccmOrderId, webhookUrl, sheetUrl } = req.body;
    if (!shipmentFileName) {
      return res.status(400).json({ success: false, message: 'Shipment file name is required.' });
    }
    const env = loadEnvDynamically();
    const effectiveWebhookUrl = webhookUrl || env.GOOGLE_SHEET_WEBHOOK_URL || process.env.GOOGLE_SHEET_WEBHOOK_URL || '';
    const effectiveSheetUrl = sheetUrl || env.GOOGLE_SHEET_URL || process.env.GOOGLE_SHEET_URL || '';

    const ftpConfig = getEffectiveFtpConfig();
    const result = await archiveShipmentAndOrder(ftpConfig, shipmentFileName, ccmOrderId, effectiveWebhookUrl, effectiveSheetUrl);
    if (!result.success) {
      return res.status(500).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`Adeeva Catalyst Software is running on:`);
    console.log(`http://localhost:${PORT}`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
