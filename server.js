const fs = require('fs');
const path = require('path');
const os = require('os');
const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const { ZipArchive } = require('archiver');
const { generateInvoicePdf } = require('./pdfGenerator');
const { generateCustomerXml, generateShiptoXml, generateOrderXml } = require('./xmlGenerator');
const { testFtpConnection, uploadFilesToFtp, listFtpDirectory, createFtpDirectory } = require('./ftpService');

const isVercel = !!process.env.VERCEL;
const OUTPUT_DIR = isVercel ? path.join(os.tmpdir(), 'adeeva-output') : path.join(__dirname, 'output');
const DATA_DIR = isVercel ? path.join(os.tmpdir(), 'adeeva-data') : path.join(__dirname, 'data');
const CONFIG_FILE = isVercel ? path.join(os.tmpdir(), 'ftp-config.json') : path.join(__dirname, 'ftp-config.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

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
  const remoteDir = clientConfig.remoteDir || fileEnv.FTP_REMOTE_DIR || process.env.FTP_REMOTE_DIR || '/for_ccm/archive';
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

function saveHistory(history) {
  try {
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not save history to disk:', err.message);
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

// API: Download single file
app.get('/api/download/:orderNo/:type', (req, res) => {
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

  const filePath = path.join(OUTPUT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found. Please generate the files first.');
  }

  res.setHeader('Content-Type', contentType);
  // If previewing PDF inline, don't force attachment download
  if (type === 'pdf' && req.query.inline === 'true') {
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  } else {
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }
  fs.createReadStream(filePath).pipe(res);
});

// API: Download all 4 files as ZIP
app.get('/api/download-zip/:orderNo', (req, res) => {
  const { orderNo } = req.params;
  const filenames = [
    `customer-${orderNo}.xml`,
    `shipto-${orderNo}.xml`,
    `order-${orderNo}.xml`,
    `invoice-${orderNo}.pdf`
  ];

  for (const name of filenames) {
    if (!fs.existsSync(path.join(OUTPUT_DIR, name))) {
      return res.status(404).send(`File ${name} not found. Please generate the files first.`);
    }
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="Order-${orderNo}-Package.zip"`);

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('error', (err) => res.status(500).send({ error: err.message }));
  archive.pipe(res);

  filenames.forEach(name => {
    archive.file(path.join(OUTPUT_DIR, name), { name });
  });

  archive.finalize();
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
      remoteDir: remoteDir || (ftpConfig && ftpConfig.remoteDir) || '/for_ccm/archive'
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
    res.json(result);
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
  { id: 'prod_1', name: 'Glucosamine Joint Formula', sku: 'KNS-000003', price: 25.28, description: '90 capsules' },
  { id: 'prod_2', name: 'Bone Support Formula', sku: 'KNS-000013', price: 20.06, description: '60 caplets' },
  { id: 'prod_3', name: 'All-in-One Multi-Nutrient', sku: 'KNS-000001', price: 34.95, description: '120 caplets' },
  { id: 'prod_4', name: 'Bio-Dim Plus Formula', sku: 'KNS-000002', price: 38.50, description: '60 vegetarian capsules' },
  { id: 'prod_5', name: 'Cardio Essentials', sku: 'KNS-000004', price: 29.95, description: '90 softgels' },
  { id: 'prod_6', name: 'Clear Skin Formula', sku: 'KNS-000005', price: 27.50, description: '60 caplets' },
  { id: 'prod_7', name: 'Flora-Bios Probiotic Formula', sku: 'KNS-000006', price: 31.00, description: '60 capsules' },
  { id: 'prod_8', name: 'Immune Detox Formula', sku: 'KNS-000007', price: 32.50, description: '60 caplets' },
  { id: 'prod_9', name: 'Menopause Management Formula', sku: 'KNS-000008', price: 36.00, description: '60 vegetarian capsules' },
  { id: 'prod_10', name: 'Nature\'s Essential Oils', sku: 'KNS-000009', price: 26.95, description: '90 softgels' },
  { id: 'prod_11', name: 'Prostate 40 Plus', sku: 'KNS-000010', price: 39.95, description: '60 capsules' },
  { id: 'prod_12', name: 'Stress Relief Formula', sku: 'KNS-000011', price: 24.95, description: '60 caplets' },
  { id: 'prod_13', name: 'Synergy 4 Formula', sku: 'KNS-000012', price: 33.00, description: '60 caplets' },
  { id: 'prod_14', name: 'Sleep Enhancement Formula', sku: 'KNS-000014', price: 28.50, description: '60 capsules' }
];

function loadProducts() {
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
    console.warn('Could not save products to disk:', err.message);
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

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`Adeeva Catalyst Software is running on:`);
    console.log(`http://localhost:${PORT}`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
