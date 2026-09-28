# 📜 Adëeva Order History & 4 Files Archive

> **No Database Required**: All historical orders and packages are automatically stored in `data/history.json` and in the `output/` directory (`customer-*.xml`, `shipto-*.xml`, `order-*.xml`, `invoice-*.pdf`).  
> You can also view, search, preview, download, and re-dispatch all past orders anytime in the **"Order History & 4 Files Archive"** tab in the web interface!

---

### 📦 Dispatched Order Archive

| Order # | Customer Name | Order Date | Items | Total ($) | 4 Files Status | FTP Upload Status | Created At |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| **ORD0042588** | Chagnon, Olivier | 2026-09-11 | 2 | $332.39 | ✅ 4 Files Ready | 📁 Local Output Only | 2026-09-28 |

---

### 🔍 How to View and Manage Order History in the App:
1. Open the application in your browser (`http://localhost:3000` or `https://adeeva-catalyst.vercel.app/`).
2. Click the **"Order History & 4 Files Archive"** tab in the top navigation bar.
3. You will see:
   - **Order Cards**: Order number, customer name, date, item count, and total.
   - **Eye Icon (Preview)**: Click any XML or PDF button to view its contents directly in a modal.
   - **Download Buttons**: Download individual XML/PDF files or download all 4 files bundled as a ZIP package.
   - **"Load into Form" Button**: Re-populates the entire order dispatch form with one click.
   - **"Send to FTP" Button**: Directly re-dispatches the 4 files to your FTP server.
