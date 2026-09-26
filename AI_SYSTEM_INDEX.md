# 🗺️ AI Index & System Map (Kesorn / SmartDom)

เอกสารสารบัญนี้จัดทำขึ้นเพื่อให้ AI / LLM เข้าใจภาพรวม โครงสร้าง และตำแหน่งสำคัญของระบบ **Kesorn (SmartDom)** ได้อย่างรวดเร็ว โดยไม่ต้อง scan ทั้ง repository ใหม่ในทุกการสนทนา

---

## 📌 1. ภาพรวมของระบบ (System Overview)
- **ชื่อโปรเจกต์:** SmartDom (หอพักเกษร 2)
- **Tech Stack หลัก:**
  - **Framework:** Next.js (App Router)
  - **Language:** TypeScript / JavaScript (React 19)
  - **Authentication:** `next-auth` v5 (Beta 30)
  - **Database:** MySQL (`mysql2` Connection Pool / Custom Provider ใน [`lib/db.ts`](file:///d:/Works/thesiss/kesorn/lib/db.ts) & [`auth.ts`](file:///d:/Works/thesiss/kesorn/auth.ts))
  - **Styling:** Tailwind CSS v4
  - **Process Management:** PM2 (`ecosystem.config.js` / `server.js`)
- **Port การทำงาน:** `3001` (ตั้งค่าใน `package.json` และ PM2)

---

## 📁 2. โครงสร้างโฟลเดอร์หลัก (Folder Architecture)

```
kesorn/
├── app/                  # Next.js App Router (Pages, Components & APIs)
│   ├── admin/            # ผู้ดูแลระบบระดับสูงสุด / Admin Dashboard
│   ├── owner/            # เมนูหลักสำหรับเจ้าของหอพัก (Meters, Invoices, Rooms, Reports ฯลฯ)
│   ├── tenant/           # เมนูสำหรับผู้เช่า (ดูใบแจ้งหนี้, สแกนชำระเงิน, แจ้งซ่อม)
│   ├── keeper/           # สำหรับแม่บ้าน/ช่าง/ผู้ดูแลหอพัก
│   ├── researcher/       # หน้าสำหรับนักวิจัย/ดูข้อมูลสถิติ
│   ├── platform/         # ระบบบริหารจัดการแพลตฟอร์ม
│   ├── api/              # API Endpoints (Auth, Meters, Invoices, Line Webhook ฯลฯ)
│   ├── components/       # Shared UI Components เฉพาะในแอป
│   └── page.tsx          # Landing Page
├── components/           # UI Components ส่วนกลาง (Modals, Form inputs ฯลฯ)
├── lib/                  # Core Utilities & Database Adapters
│   ├── db.ts             # Connection Pool สำหรับ MySQL
│   ├── mysql-adapter.js  # NextAuth Custom MySQL Adapter
│   └── utils.ts          # Helper Utility Functions
├── scripts/              # Automation Scripts (DB Switching, Dumps, Lighthouse)
├── auth.ts               # NextAuth v5 configuration & Handlers
├── proxy.ts              # Custom Proxy Router / Dynamic Routing
├── server.js             # Custom Node.js Server Runner
├── ecosystem.config.js   # PM2 Deployment Configuration
└── PROGRESS.md           # บันทึกสถานะการพัฒนาล่าสุด
```

---

## 🔑 3. บทบาทผู้ใช้งานหลักในระบบ (User Roles & Entry Points)

1. **Owner (`/owner`):** 
   - จดมิเตอร์ไฟฟ้า/น้ำประปา (`/owner/meters`)
   - ออกใบแจ้งหนี้ (`/owner/invoices`)
   - จัดการสัญญาและห้องพัก (`/owner/rooms`, `/owner/tenants`)
   - ตั้งค่าระบบและค่าบริการ (`/owner/settings`)
2. **Tenant (`/tenant`):** 
   - ดูใบแจ้งหนี้ประจำเดือน และสแกน QR Code (PromptPay) เพื่อชำระเงิน
   - แจ้งซ่อม/ติดตามสถานะการซ่อม
3. **Keeper / Housekeeper (`/keeper`):**
   - บันทึกการทำความสะอาด ตรวจเช็คห้องพัก แจ้งซ่อม
4. **Admin / Platform (`/admin`, `/platform`):**
   - บริหารจัดการสิทธิ์ผู้ใช้งานและหอพักทั้งหมดในแพลตฟอร์ม

---

## 🛠️ 4. คำสั่งสำคัญ (Key Scripts)

- **รันสภาพแวดล้อม Dev:** `npm run dev` (Port 3001)
- **สร้าง Build:** `npm run build`
- **จัดการสลับฐานข้อมูล (DB Switching):**
  - `npm run db:local` -> สลับไปใช้ DB เครื่อง Local
  - `npm run db:remote` -> สลับไปใช้ DB เครื่อง Remote/Server
- **สำรอง/ย้ายข้อมูล DB:**
  - `npm run db:dump` -> Export Local DB
  - `npm run db:push-remote` -> Push DB ไปยัง Remote Server

---

## 💡 5. คำแนะนำสำหรับ AI ในการสืบค้นต่อ (Guidelines for AI)
1. **เรื่อง Auth / User Session:** ให้ดูที่ [`auth.ts`](file:///d:/Works/thesiss/kesorn/auth.ts) และ [`lib/mysql-adapter.js`](file:///d:/Works/thesiss/kesorn/lib/mysql-adapter.js)
2. **เรื่อง Query DB:** ให้ดูที่ [`lib/db.ts`](file:///d:/Works/thesiss/kesorn/lib/db.ts) และ API routes ใน [`app/api/`](file:///d:/Works/thesiss/kesorn/app/api)
3. **เรื่อง Logic และ UI แต่ละบทบาท:** ให้พุ่งเป้าไปที่โฟลเดอร์ของบทบาทนั้นๆ เช่น `app/owner/`, `app/tenant/` โดยตรง
