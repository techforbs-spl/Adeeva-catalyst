# Adeeva Catalyst — Order Dispatch & FTP Suite

A fast, modern software application designed to enter order and customer details, generate all **4 required data files** (3 XML files + 1 PDF Invoice), and dispatch them directly to your **FTP server** with one click.

---

## 📁 The 4 Generated Output Files

Based on the order number (e.g., `ORD0042588`), the system generates:

| # | File Name | Format | Purpose |
|---|---|---|---|
| 1 | `customer-{orderNo}.xml` | XML | Customer and billing contact details (`customer_no`, name, billing address, telephone, email) |
| 2 | `shipto-{orderNo}.xml` | XML | Shipping destination info (`customer_no`, `shipto_no`, `shipto_via`, delivery address, instructions) |
| 3 | `order-{orderNo}.xml` | XML | Line items (`part_no`, `quantity`, `price`), order date, wanted date, and notes |
| 4 | `invoice-{orderNo}.pdf` | PDF | Formatted invoice with company header, billing/shipping blocks, itemized table, taxes, and terms |

All generated files are saved locally to the `output/` directory and can be:
- Viewed directly inside the browser (with XML formatting & embedded PDF viewer)
- Downloaded individually or packaged together as a single **ZIP bundle**
- Transferred automatically to any remote **FTP / FTPS** directory

---

## 🚀 Quick Start (Running the Software)

### Option 1: Double-Click (Windows)
Double-click `start-app.bat` in the workspace folder.  
It will automatically verify dependencies, launch the server, and open `http://localhost:3000` in your web browser.

### Option 2: Terminal / Command Line
```powershell
# 1. Install dependencies (first time only)
npm install

# 2. Start the application
npm start
```
Then open: **[http://localhost:3000](http://localhost:3000)**

---

## ✨ Features & User Interface

1. **Intuitive Form Layout**:
   - **Order & Invoice Details**: Order Number, Order ID, Invoice Number, Ship Via (Purolator, etc.), Order Date, Date Wanted, Terms, Order Notes.
   - **Customer & Billing Information**: Customer Number, Name, Attention, Street Address 1 & 2, City, Province, Postal Code, Country, Phone, Email.
   - **Ship-To Address**: Convenient **"Same as Bill-To Address"** checkbox automatically syncs addresses, or uncheck to specify custom recipient details.
   - **Line Items & Product Table**: Add/remove unlimited products. Enter Part Number, Description, Quantity, Shipped, Backordered (B.O.), and Unit Price.
   - **Automatic Calculations**: Computes item row totals, order subtotal, discounts, shipping fees, sales taxes (5% default with custom override), and grand total.

2. **One-Click Sample Loader**:
   - Click the **"Load Sample (ORD0042588)"** button in the top navigation bar to instantly populate all fields with the workspace sample order.

3. **In-Browser Previews**:
   - Preview XML files with pretty indentation and a 1-click **"Copy XML"** button.
   - Preview the generated PDF Invoice in an interactive viewer.

4. **FTP Dispatch & Remote Directory Explorer (.env Integration)**:
   - **Configure via `.env`**: Store your FTP credentials securely in `.env` so you never have to type passwords in the browser:
     ```env
     FTP_HOST=ftp.yourserver.com
     FTP_PORT=21
     FTP_USER=your_username
     FTP_PASSWORD=your_password
     FTP_SECURE=false
     FTP_REMOTE_DIR=/orders
     ```
   - **Folder Selection Only**: The website automatically connects using `.env` settings; you only need to select or browse the destination folder!
   - **Browse Remote FTP**: Click **"Browse FTP"** to open the interactive Directory Explorer.
   - **Visual File & Folder Inspection**: See existing files, folders, sizes, and timestamps on your FTP server.
   - **Interactive Navigation**: Click any folder to dive in, click breadcrumbs (`📁 / > orders > inbound`) or **"Up"** to move through the folder tree.
   - **1-Click Location Selection**: Click **"Select This Location"** to instantly assign the chosen folder as your destination.
   - **Create New Remote Folders**: Click **"New Folder"** to create a target folder on the FTP server on the fly.
   - **Send 4 Files to FTP**: Uploads all 4 files with a live step-by-step progress checklist.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express
- **PDF Generation**: PDFKit (vector layout matching sample PDF)
- **FTP Engine**: basic-ftp (Promise-based, supports standard FTP & FTPS)
- **Packaging**: archiver (ZIP compression)
- **Frontend**: Vanilla HTML5, CSS3 (modern glassmorphism, responsive grid), JavaScript (ES6)
