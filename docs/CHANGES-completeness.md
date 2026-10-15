# สรุปการเปลี่ยนแปลงสาขา `completeness` (commit 1–15)

สำหรับรีวิวก่อน merge `completeness` → `main` · ฐานร่วม `c1f5251` (main ยังไม่มี commit ใหม่หลังจากนั้น) · 29 commit ใน git = 15 ขั้นตามแผน `docs/completeness-plan.md`
schema ละเอียด: [`docs/schema-changes.md`](schema-changes.md) · ไม่มีไฟล์ถูก rename ในสาขานี้ (มีแต่เพิ่ม/ลบ)

สารบัญ: [1. ทีละ commit](#1-ทีละ-commit) · [2. หน้า/API ที่ลบหรือเปลี่ยนการเรียก](#2-หน้าapi-ที่ลบหรือเปลี่ยนการเรียก) · [3. กติกาธุรกิจใหม่](#3-กติกาธุรกิจใหม่) · [4. ไฟล์ที่ชนกับ feature-development](#4-ไฟล์ที่ชนกับ-originfeature-development) · [5. ขั้นตอน deploy](#5-ขั้นตอน-deploy)

| แผน | commit ใน git | เรื่อง | migration |
|---|---|---|---|
| 1 | f80c7eb | ความปลอดภัย: auth / สมัครสมาชิก | – |
| 2 | a30c05c | role guard + บทบาท manager | 001 |
| 3 | d2a3184 | ลบหน้าเก่า/หน้าทดสอบ | – |
| 4 | 645fe38 | lib คิดเงินกลาง (อัตรา ค่าปรับ ครบกำหนด) | 002, 003 |
| 5 | 363dcf1 | รับเงินทางเดียว `recordPayment` | 004 |
| 6 | d3a3b76 | บิลร่าง → ส่ง → ชำระ, ล็อกบิลที่จ่ายแล้ว | 005 |
| 7 | 17b3fb5 | เงินสด / จ่ายบางส่วน / ใบเสร็จ | – |
| 8 | 45dbb41 | สลิปยอดตรง, เงินประกันเป็นหนี้สิน, แจ้งค้าง 15 วัน | 006 |
| 9 | 23c5911, b3f9558 | service สัญญาเดียว, เงินประกันจาก server | 007, 008 |
| 10 | 678a5c0 | การจองแบบอนุมัติแล้วจ่าย | 009 |
| 11 | 164c1c3, 7c95735, 69103f3 | บิลเข้าอยู่, สัญญากระดาษ, เพดาน สคบ., ตรวจห้องเข้าอยู่ | 010, 011 |
| 12 | 6cb5c19, c408f94, f401d62, b9703b1 | ย้ายออก + ปิดบัญชี/คืนเงินประกัน | 012 |
| 13 | 265d022, 2a8c08e, 9261854, f8b672a | บอร์ดงานซ่อม/ทำความสะอาด | 013 |
| 14 | 927e91a, 277447a | มิเตอร์ที่ server, บิลรายเดือนรอบละใบ | 014 |
| 15 | 9b12347, 760ee0b, 9e703f7 | หน้าอัตราเดียว + แจ้งเตือนตามเวลา | 015, 016 |

(46b1dd9, 546add7 = ย้ายไฟล์ทดสอบไป docs เท่านั้น)

---

## 1. ทีละ commit

### 1 · ความปลอดภัย auth
- ยกเลิกรหัสผ่านสากลและทางลัดล็อกอินตาม role · สมัครได้เป็น `guest` เท่านั้น (เลือก role เองไม่ได้)
- ปุ่ม 1-Click ในหน้า signin แสดงเฉพาะ `NODE_ENV=development`
- ต้องตั้ง `AUTH_SECRET` (ไม่มีค่าสำรองในโค้ดแล้ว) · `DATABASE_URL` ต้องเป็น `mysql://`

### 2 · role guard + manager
- บทบาทใหม่ **manager** เข้า `/owner` ได้ ยกเว้นหน้าเฉพาะเจ้าของ (บัญชี, พนักงาน, กติกา) · owner สร้าง/ปิดบัญชีพนักงานที่ `/owner/keepers`
- API `app/api/owner/**` ทุกตัวตรวจสิทธิ์จาก DB (`lib/authz.ts` อ่าน role + `is_active` ทุกครั้ง ไม่เชื่อ JWT)

### 3 · ลบหน้าเก่า/หน้าทดสอบ
- หายไป: `/admin`, `/platform`, `/researcher`, `/explore/[dormId]`, `/sequence`, `/owner/onboarding`, ปุ่มทดสอบย้ายออก/รีเซ็ตในหน้าผู้เช่า · platform_admin / researcher ล็อกอินแล้วไป `/explore`

### 4 · lib คิดเงินกลาง (`lib/billing.ts`)
- ยอดบิลรายเดือนคิดที่ server · หน้าเว็บแสดงอัตราจาก `GET /api/rates`
- ค่าปรับ **ไม่มีเพดาน** (เดิมจำกัด 500) · ค่าน้ำคิดต่อคนจาก `contracts.occupants`

### 5 · รับเงินทางเดียว
- ทุกการจ่ายบันทึกวิธีจ่ายและเวลาจ่าย · ต้องจ่ายครบรวมค่าปรับ · `lib/payments.ts recordPayment` เป็นทางเดียวที่ทำให้บิลเป็น Paid (บันทึก `bill_payments` + บัญชีใน transaction เดียว)

### 6 · บิลร่าง → ส่ง → ชำระ
- บิลรายเดือนเริ่มเป็น **ร่าง** ผู้เช่ายังไม่เห็น จนกว่า owner/manager กด "ส่งบิล" · แท็บ "ร่าง" และปุ่ม "ยกเลิกการชำระ" (owner + ต้องใส่เหตุผล)
- บิลที่จ่ายแล้วล็อก · ทุกการเปลี่ยนสถานะมีประวัติ

### 7 · เงินสด / บางส่วน / ใบเสร็จ
- owner รับเงินสด/โอน รวมถึงรับบางส่วน (สถานะ Partial) · ใบเสร็จรายครั้งที่ `/receipt/[paymentId]` · ตัวเลขทศนิยม 2 ตำแหน่ง วันที่แบบไทย

### 8 · สลิป เงินประกัน แจ้งค้าง
- ยอดในสลิปต้องตรงยอดค้างพอดี · QR/ตรวจสลิปใช้พร้อมเพย์ของหอเท่านั้น (ไม่มีเลขสำรอง — ไม่ได้ตั้ง = ใช้ไม่ได้)
- เงินประกันลงบัญชีเป็น **หนี้สิน (Liability)** ไม่ใช่รายรับ · หน้าบัญชีแยกหนี้สิน · แจ้ง owner เมื่อบิลค้างเกิน 15 วัน

### 9 · service สัญญาเดียว
- สร้าง/เซ็นสัญญาทุกทางผ่าน `lib/contracts.ts` · ห้องมีสถานะ **Reserved** · ยอดเงินประกันมาจาก server เท่านั้น · หน้าจำลองสัญญาของผู้เช่าถูกลบ

### 10 · การจองแบบอนุมัติแล้วจ่าย (`lib/bookings.ts`)
- ขอจอง → owner/manager อนุมัติ → ผู้จองจ่ายค่าจองภายใน 10 นาที (มีตัวนับเวลา) · รับคำขอ 08:00–20:00 · ห้องเดียวกันจองซ้อนไม่ได้
- ระบบคืนเงินค่าจองถูกลบ (ค่าจองไม่คืน) · walk-in ปฏิเสธอีเมลที่มีสัญญา Active อยู่แล้ว

### 11 · เข้าอยู่ (`lib/moveIn.ts`, `lib/inspections.ts`)
- owner/manager **ออกบิลเข้าอยู่** (กรอกมิเตอร์เริ่มต้นบังคับ) และ **อัปโหลดสัญญากระดาษที่เซ็นแล้ว** · สัญญามีผลเมื่อครบทั้งสองอย่าง
- **ตรวจห้องก่อนเข้าอยู่** พร้อมรูป ผู้เช่ากดรับทราบ (11b) · บันทึกห้องที่เงินประกันเกินเพดาน สคบ. ไม่ได้ · พิมพ์สัญญาเป็นไฟล์ Word

### 12 · ย้ายออก (`lib/moveOut.ts`)
- ผู้เช่าแจ้งย้ายออก (เตือนถ้าแจ้งไม่ถึง 30 วัน / ออกก่อนครบสัญญา) เห็นผลตรวจ สคบ. ข้อ 13 ยอดหัก และวันคืนเงิน
- owner ใช้ `/owner/move-out` ใหม่: แท็บตามสถานะ, บันทึกวันคืนห้อง + มิเตอร์สุดท้าย, ค่าเสียหาย, ปิดบัญชีเงินประกัน, อัปสลิปคืนเงิน, ป้ายเตือนใกล้/เลยกำหนดคืนเงิน · ตรวจห้องตอนออกเทียบกับตอนเข้า
- ข้อความเงินประกันในสัญญาแก้ใหม่ (คืนภายใน 7 / 14 วัน, ข้อ 13)

### 13 · บอร์ดงานซ่อม/ทำความสะอาด (`lib/maintenance.ts`)
- ผู้เช่าแจ้งงานพร้อมรูป (เฉพาะห้องที่มีสัญญา Active) ยกเลิกได้ก่อนมีคนรับ
- owner/manager มอบหรือปฏิเสธงานที่ `/owner/maintenance` · แม่บ้าน/ช่างกดรับงานเอง เริ่ม และปิดงาน (เสนอค่าใช้จ่ายได้) · **owner ตัดสินค่าใช้จ่าย**

### 14 · มิเตอร์ (`lib/meters.ts`)
- owner/manager จดและยืนยันในขั้นเดียว (keeper ไม่จด — ต่างจากแผน 5.5 เดิม) · เมนูมิเตอร์วนรอบ / เปลี่ยนเครื่อง · เกิน 200 หน่วยต้องยืนยัน · ปุ่ม "ออกบิลรอบนี้" · รูปมิเตอร์เก็บนอก public

### 15 · หน้าอัตราเดียว + แจ้งเตือนตามเวลา (`lib/settings.ts`, `lib/reminders.ts`)
- อัตราทั้งหมดที่ `/owner/settings`: ไฟ, น้ำ/คน, ส่วนกลาง, ค่าปรับ/วัน, ค่าทำความสะอาด (300 — ค่าเริ่มต้นที่แม่บ้านเสนอ), พร้อมเพย์, บัญชีธนาคาร, เลขผู้เสียภาษี (แสดงในใบเสร็จเมื่อกรอก) + ประวัติการแก้ · manager ดูอย่างเดียว
- ฟอร์มห้องไม่มีช่องค่าน้ำ/ส่วนกลางรายห้องแล้ว · แบบฟอร์มสัญญาอ่านพร้อมเพย์/บัญชีจากหน้าตั้งค่า (ไม่มีเลขในโค้ด)
- แจ้งเตือน: จดมิเตอร์ (ตั้งแต่วันที่ 28), ใกล้ครบกำหนด (3 วัน), ครบกำหนดวันนี้, ค้างเกิน 15 วัน, บิลเข้าอยู่ (1 วันก่อนเริ่มสัญญา), การจองหมดเวลา
- แก้จากทดสอบมือ: หน้าต่าง walk-in ไม่ล้นจอ, QR แสดงชื่อผู้รับเงิน, ข้อความผิดพลาดใกล้ปุ่มบันทึก, "มัดจำ" → "ค่าจอง", ใบเสร็จพื้นหลังเต็มหน้า

---

## 2. หน้า/API ที่ลบหรือเปลี่ยนการเรียก

**หน้า/โฟลเดอร์ที่ลบ:** `app/admin/`, `app/platform/`, `app/researcher/`, `app/explore/[dormId]`, `app/sequence`, `app/owner/onboarding`, `app/tenant/contract/simulate`, `app/tenant/refund-request`, `app/owner/settings/layout.tsx` · components: `MermaidRenderer`, `ContractSigner`, `DepositRefundModal`, `MoveOutTestButton`, `ResetAllTestButton`, `app/tenant/move-out/components/{MoveOutForm,CancelRequestButton}` · `lib/diagramsData.ts` (สำเนาที่ `docs/old/`) · package `mermaid`

**API ที่ลบ:** `auth/update-role` · `db-test` · `platform/*` · `researcher/*` · `test/move-out`, `test/reset-all` · `contract/sign` · `booking/refund-promptpay`, `owner/refund-requests`, `tenant/refund-request` · `owner/billing/batch`

**API ใหม่ (หลัก):** `rates` · `owner/staff` · `owner/billing/{send,unpay,history,receive,issue-month}` · `receipts/[paymentId]` · `booking/pay` · `contracts/[id]/paper`, `contracts/[id]/inspection-photo/[file]` · `owner/contracts/[id]/inspection`, `tenant/inspection(/acknowledge)` · `owner/move-out/[id]`, `tenant/move-out`, `move-out/[id]/refund-file` · `keeper/jobs`, `maintenance/[id]/photo/[file]` · `meters/[id]/photo` · `owner/settings/history` · `cron/reminders`

**ยังอยู่แต่การเรียกเปลี่ยน**
| API | เปลี่ยนอย่างไร |
|---|---|
| `POST /api/auth/signup` | ไม่สนใจ `role` / `sub_role` |
| `POST /api/contracts` | ขอจองเท่านั้น ไม่รับสลิป/ไม่รับเงิน |
| `owner/bookings` | action เหลือ `approve` / `reject` / `cancel` |
| `PUT /api/owner/contracts` | = ออกบิลเข้าอยู่ รับแค่ `contract_id` + `initial_meter_reading` |
| `PATCH /api/owner/contracts` | = อัปสัญญาที่เซ็น `{ contractId, file (data URL JPG/PNG/PDF ≤ 10MB), signedDate }` |
| `owner/contracts/[id]/sign` | ไม่ทำให้ Active ถ้ายังขาดบิลเข้าอยู่/สัญญาที่เซ็น |
| `POST /api/owner/billing` | ไม่ใช้ยอดจาก client · บิลรายเดือน → 400 (ออกได้จากมิเตอร์เท่านั้น) |
| `owner/billing/[id]` PUT `status=Paid` | 400 (ต้องผ่านการรับเงิน) |
| `POST /api/owner/meters` | ไม่ใช้ `previous_reading` จากหน้าเว็บ |
| `GET /api/booking/qr` | ไม่รับ `amount` · ค่าจอง = `bookingFeeFor` · บิลเข้าอยู่ส่ง `contractId` |
| `GET /api/tenant/billing/qr` | ต้องมี `billId` (ไม่มีโหมดยอดลอย) · ส่ง `promptpayName` |
| `GET/POST /api/owner/settings` | GET owner+manager (manager ไม่เห็น OCR key) · POST owner เท่านั้น เขียนเฉพาะช่องที่ส่ง |
| `POST/PUT /api/owner/move-out` (แบบเดิม) | **410** → ใช้ `owner/move-out/[id]` |
| `keeper/{maid,technician}/jobs` | **410** → ใช้ `keeper/jobs` |
| `owner/meters/ocr`, `owner/contracts/ocr-id` | 401/403 ถ้าไม่ใช่ owner/manager |
| `contracts/export-pdf`, `export-docx` | ต้อง login (owner/manager หรือผู้เช่าของสัญญา) · export-pdf ไม่มีแม่แบบ → 503 `template_missing` |
| `booking/cancel` | ต้องเป็นเจ้าของการจอง |
| `keeper/dorms` | ต้อง login |

---

## 3. กติกาธุรกิจใหม่

**การจอง** (`lib/bookings.ts`)
- รับคำขอ 08:00–19:59 เวลาไทย · ไม่อนุมัติภายใน 20:00 → หมดอายุ
- อนุมัติแล้วต้องโอนภายใน **10 นาที** (อัปสลิปได้ถึง 15 นาที) · เวลาในสลิปต้องอยู่ระหว่างนาทีที่อนุมัติถึง +10 · หมดเวลา → ปล่อยห้อง + แจ้งผู้จอง
- **ค่าจองเป็นส่วนหนึ่งของเงินประกัน** (1,000 บาท; ห้องทดสอบ T01 = 1) · **ไม่คืน** ถ้าผู้จองยกเลิก/ไม่มาทำสัญญา (ริบเป็นรายรับ)

**เข้าอยู่** (`lib/moveIn.ts`, `lib/billing.ts`)
- **เพดาน สคบ.:** เงินประกัน + ค่าเช่าล่วงหน้าเดือนแรก ≤ 3 × ค่าเช่า (`capCheck`) — บันทึกห้องที่เกินไม่ได้
- บิลเข้าอยู่ = ค่าเช่าเดือนแรกเต็มเดือน + (เงินประกัน − ค่าจอง) · ครบกำหนด **วันเริ่มสัญญา** · ไม่จ่ายภายในวันนั้น → ยกเลิกสัญญา + ริบค่าจอง (จ่ายบางส่วนแล้ว → ให้ owner ตัดสิน)
- สัญญา **Active** เมื่อบิลเข้าอยู่จ่ายครบ **และ** อัปสัญญากระดาษที่เซ็นแล้ว เท่านั้น
- ตรวจห้องก่อนเข้าอยู่ (สคบ. ข้อ 9) แก้ได้จนผู้เช่ารับทราบ ไม่ขวางการเริ่มสัญญา

**บิลและการรับเงิน** (`lib/bill-status.ts`, `lib/payments.ts`, `lib/billing.ts`)
- บิลรายเดือน: ร่าง → ส่ง (ได้วันครบกำหนด) → ชำระ · **ครบกำหนดวันที่ 5 เดือนถัดไป** แต่ไม่ก่อนวันส่ง + 3 วัน
- **ค่าปรับ:** เฉพาะบิลค่าเช่ารายเดือน · ต่อวันนับตามวันไทย · **ไม่มีเพดาน** · อัตรา ณ วันที่ส่งบิล (แก้อัตราภายหลังไม่กระทบบิลที่ส่งแล้ว)
- บิลที่จ่ายแล้ว/จ่ายบางส่วนล็อก · ยกเลิกการชำระได้เฉพาะ owner + เหตุผล (ลงบัญชีกลับรายการ)
- สลิปต้องยอดตรงพอดีและไม่ซ้ำ · เงินสด/โอนรับบางส่วนได้ · เงินประกันลงเป็นหนี้สิน
- ขอแก้บิล (dispute) แก้ได้แค่ค่าไฟ ส่วนอื่นใช้ยอดเดิมของบิล

**มิเตอร์และบิลรายเดือน** (`lib/meters.ts`)
- รอบบิล: จดวันที่ 25–สิ้นเดือน = รอบเดือนนั้น · จดวันที่ 1–24 = รอบเดือนก่อน
- เลขก่อนหน้ามาจาก server · เลขน้อยกว่าเดิมไม่ได้ เว้นแต่วนรอบ/เปลี่ยนเครื่อง · เกิน 200 หน่วยต้องยืนยัน
- **บิลรายเดือน 1 ใบต่อผู้เช่าต่อรอบ** · ออกเฉพาะห้องที่จดแล้วและมีสัญญา Active · เดือนแรกไม่เก็บค่าเช่าซ้ำ (เก็บในบิลเข้าอยู่แล้ว)

**ย้ายออก** (`lib/moveOut.ts`)
- แจ้งล่วงหน้า 30 วัน (แจ้งน้อยกว่าได้แต่มีคำเตือน)
- **สคบ. ข้อ 13:** ออกก่อนครบสัญญา ได้เงินประกันคืนเมื่อครบ 3 ข้อ — อยู่ ≥ ครึ่งหนึ่งของสัญญา, แจ้งเป็นหนังสือ ≥ 30 วัน, ไม่ค้างชำระ (ทั้งตอนแจ้งและตอนคืนห้อง) · ไม่ครบ → ริบส่วนที่เหลือ
- **คืนเงินประกัน** (สคบ. ข้อ 10): ไม่มีรายการหัก 7 วัน · มีรายการหัก 14 วัน นับจากวันคืนห้อง
- บิลค้างหักจากเงินประกัน · ค่าปรับของบิลที่หักหยุดนับที่วันคืนห้อง · บิลสุดท้าย = ส่วนของเดือนที่ยังไม่ออกบิล (ไม่คิดค่าเช่ารายวัน)
- คืนห้องแล้วสัญญาจบทันที · ปิดเรื่องได้เมื่อหนี้สินเงินประกันของสัญญาเป็น 0

**งานซ่อม/ทำความสะอาด** (`lib/maintenance.ts`)
- งานซ่อม → ช่าง, ทำความสะอาด → แม่บ้าน (เฉพาะพนักงานของหอนี้)
- ปิดงานแบบมีค่าใช้จ่ายต้องมีบันทึกหรือรูป · **owner ตัดสินค่าใช้จ่ายครั้งเดียว** (ปรับยอด/ตั้ง 0 ได้): ผู้เช่าทำเสียหาย → บิลค่าเสียหาย · ค่าบริการ → บิลค่าบริการ · เสื่อมตามสภาพ → ไม่เก็บ · งานที่ผูกการย้ายออก → หักจากเงินประกันแทน

**อัตราและแจ้งเตือน** (`lib/settings.ts`, `lib/reminders.ts`)
- อัตราอยู่ที่เดียว (`dormitory_profile`) · owner แก้ได้, manager ดูได้ · ทุกการแก้มีประวัติ (ใคร/เมื่อไร/จาก/เป็น)
- แก้ค่าไฟ/น้ำ/ส่วนกลาง → ร่างบิลคิดใหม่ทันที · บิลที่ส่งหรือจ่ายแล้วไม่เปลี่ยน
- แจ้งเตือนตามเวลาส่ง **ครั้งเดียวต่อคนต่อเหตุการณ์** · ฝั่งพนักงานส่งเฉพาะ owner/manager ที่ยังใช้งาน

---

## 4. ไฟล์ที่ชนกับ `origin/feature-development`

`git merge-tree --write-tree completeness origin/feature-development` (อ่านอย่างเดียว) ชน **6 ไฟล์** — ไม่มีไฟล์อื่น · ฝั่งเพื่อน 2 commit: `e78350a` ThaID Digital ID (OAuth 2.0/OIDC + PKCE) และ `31a1ba9` PDPA ไม่เก็บเลขบัตร 13 หลัก/รูปบัตร

**ต้นเหตุหลัก:** เพื่อนแก้ SQL `INSERT/UPDATE` ใน route ให้เลขบัตร/รูปบัตรเป็น `NULL` แต่ฝั่งเราย้าย SQL เหล่านั้นไปไว้ใน `lib/contracts.ts` / `lib/bookings.ts` แล้ว (commit 9) → **แนะนำเอาไฟล์ฝั่งเรา แล้วใส่เจตนา PDPA ที่ service จุดเดียว** (ด้านล่าง)

| ไฟล์ | ฝั่งเราเปลี่ยนอะไร / เพราะอะไร | ฝั่งเพื่อน | แนะนำ |
|---|---|---|---|
| `app/api/contracts/route.ts` | เหลือแค่ auth + `requestBooking()` (ขอจองแบบอนุมัติแล้วจ่าย — ไม่รับสลิป ไม่บันทึกเงิน) + แจ้ง owner/manager · SQL ย้ายไป `lib/bookings.ts` (commit 5, 8, 9, 10, 11) | เลขบัตร/รูปบัตร → `NULL` ใน SQL 3 จุด | เอาของเรา · ทำ PDPA ใน service |
| `app/api/owner/contracts/route.ts` | สร้างสัญญาผ่าน `createContract()`, role guard, เงินประกันต้อง > 0 หรือ "รับนอกระบบ" (owner เท่านั้น), PUT = ออกบิลเข้าอยู่, PATCH = อัปสัญญาที่เซ็น (commit 2, 6, 7, 9, 11, 12, 14) | เลขบัตร → `NULL` ใน INSERT/UPDATE | เอาของเรา · ถ้ารับ PDPA ให้ตัด `id_card_number/id_card_image` ออกจาก argument ของ `createContract` (SELECT ที่คืน `''` เก็บได้) |
| `app/api/owner/tenants/walk-in/route.ts` | guard, ค่าจองจาก `bookingFeeFor()` (ไม่รับยอดจากหน้าเว็บ), SlipOK ยอดตรง + กันสลิปซ้ำ, `createContract()` แบบสัญญาเปิดได้ฉบับเดียว/ห้องต้องว่าง | เลขบัตร → `NULL` | เอาของเรา · ลบ/ส่ง `null` แทน `cleanIdCard` |
| `app/explore/room/[id]/page.tsx` | ขอจองอย่างเดียว (ไม่มีขั้นจ่ายในหน้านี้), เช็กเวลารับคำขอ, ค่าใช้จ่ายจาก server (commit 9–12) | เพิ่มปุ่ม ThaID (auto-merge แล้ว), ลบช่องเลขบัตร, ปุ่มไป `setStep(4)` | ส่วนฟอร์ม: เอาของเพื่อน (ช่องชื่อ + ข้อความ PDPA) · ปุ่มสุดท้าย: **เอาของเรา** (`handleFinalSubmit`) — `setStep(4)` จะพาไปขั้นจ่ายแบบเก่าที่เราตัดแล้ว · ตามแก้จุดที่ยังส่งเลขบัตร (ข้อมูลตัวอย่าง, OCR handler, payload) |
| `app/owner/contracts/page.tsx` | เงินประกันจาก server (ไม่ใช่ `price*2`), อัปสัญญากระดาษ, ลบ `DepositRefundModal` แท็บย้ายออกชี้ `/owner/move-out` | OCR ไม่เก็บเลขบัตร, ปุ่ม ThaID (ส่วนใหญ่ auto-merge แล้ว) | import: เก็บทั้งสอง (`checkPaperFile` + `ThaIdDigitalIdButton`) ไม่มี `DepositRefundModal` · ค่าเริ่มฟอร์ม: ใช้ชุดของเรา (ไม่มี `deposit_amount: price*2`) |
| `components/DepositRefundModal.tsx` | **ลบ** — ระบบคืนค่าจองถูกยกเลิก (commit 10: ค่าจองไม่คืน) และการคืนเงินประกันย้ายไป `/owner/move-out` (commit 12) | แก้ 1 บรรทัด (ไม่ใช้เลขบัตรเป็นพร้อมเพย์) | **ยืนยันการลบ** (`git rm`) — หน้าใหม่ไม่ใช้เลขบัตรอยู่แล้ว |

**ใส่ PDPA ที่ service (ถ้าตกลงนโยบาย "ไม่เก็บเลขบัตร/รูปบัตร"):** `lib/contracts.ts` (`resolveAccount` UPDATE/INSERT tenants, `createContractTx` INSERT contracts, การต่อสัญญาที่คัดลอกเลขบัตร) และ `lib/bookings.ts` → ทั้ง 3 route ได้ผลเหมือนกันโดยไม่ต้องแตะ SQL ใน route · ล้างข้อมูลเดิมทำเป็น migration 017 (ต้อง backup — กู้คืนไม่ได้) + ลบรูปใน `public/uploads/id_cards/`
⚠️ ต้องตัดสินก่อน: แผนเดิม (`completeness-plan.md` B.1) เขียน "เก็บบัตร ปชช. + ยินยอม PDPA" ซึ่งตรงข้ามกับทิศของเพื่อน

**auto-merge ได้แต่ควรดู:** `export-docx` (สัญญา Word จะไม่มีเลขบัตร) · `WalkInTenantModal` (state เลขบัตรยังส่ง `''`) · `owner/bookings/page.tsx` (ใช้ฟิลด์ที่ API เรามีแล้ว) · `lib/version.json` · `app/api/booking/status/route.ts` มีเงื่อนไข `OR c.id_card_number IN (...)` จาก base — เสี่ยงเห็นสัญญาข้ามบัญชีที่เลขบัตรซ้ำ ควรลบไม่ว่าเลือกนโยบายไหน

**ไฟล์ใหม่ของเพื่อน:** ไม่เรียก API ที่เราลบ ไม่มี migration (ไม่ชนเลข 001–016) · `app/api/features/thaid/route.ts` **ไม่มี auth guard** (ต่างจากแนวทาง commit 1–2) และ salt มีค่าสำรองในโค้ด → ควรใส่ auth/feature flag ก่อน production · `FEATURE_INTEGRATION_LOG.md` ห้าม DROP/RENAME บน users/tenants/rooms/contracts/bills — migration ของเรา **ไม่มี** DROP/RENAME มีแค่ `MODIFY` เพิ่มค่า ENUM (`users.role`, `rooms.status`, `accounting_transactions.type`, `bill_payments.method`) และเปลี่ยน DEFAULT ใน `dormitory_profile`

**ลำดับ resolve ที่แนะนำ:** ตัดสินนโยบายเลขบัตร → API 3 ไฟล์เอาของเรา → หน้า 2 ไฟล์แก้ทีละ hunk → `git rm components/DepositRefundModal.tsx` → PDPA ใน service → auth ให้ ThaID route → (ถ้า PDPA) migration 017 → build + ทดสอบ จอง / walk-in / สร้างสัญญา

---

## 5. ขั้นตอน deploy

### 5.1 ก่อนเริ่ม
1. **backup ฐาน** (`mysqldump`) — migration หลายตัวแก้ ENUM/เพิ่มคอลัมน์ในตารางใหญ่
2. หยุดแอป (migration 014 เพิ่ม UNIQUE ใน `meter_readings` · 016 เพิ่ม UNIQUE ใน `notifications`)

### 5.2 query ตรวจก่อนรัน (จาก header ของ migration)
```sql
-- 001: down ทำไม่ได้ถ้ามี user role manager (ตรวจเฉพาะตอนจะ rollback)

-- 012 (ย้ายออก): คำขอเดิมไม่ถูกแปลง = "คำขอแบบเดิม — จัดการด้วยมือ"
SELECT COUNT(*) AS old_requests, SUM(status IN ('Pending','Approved')) AS still_open FROM move_out_requests;
SELECT id, tenant_id, room_id FROM contracts WHERE status = 'MoveOutPending';   -- ยังถือห้องอยู่
SELECT COUNT(*) FROM contracts c WHERE c.status IN ('Active','MoveOutPending')
  AND c.booking_bill_id IS NULL AND c.move_in_bill_id IS NULL AND c.parent_contract_id IS NULL
  AND c.deposit_outside_system = 0;                                             -- เงินประกันต้องยืนยันด้วยมือ

-- 013 (งานซ่อม): งานเดิมที่ยังเปิด = "งานแบบเดิม"
SELECT COUNT(*) AS old_open_jobs FROM maintenance_requests
  WHERE LOWER(COALESCE(status, '')) NOT IN ('completed', 'resolved', 'cancelled', 'rejected');
SELECT COUNT(*) AS cleaning_jobs_rows, SUM(LOWER(status) <> 'completed') AS cleaning_jobs_open FROM cleaning_jobs;

-- 014 (มิเตอร์): ต้องได้ 0 ไม่งั้น UNIQUE จะสร้างไม่ได้
SELECT COUNT(*) FROM (SELECT room_id, type, billing_cycle FROM meter_readings
  GROUP BY room_id, type, billing_cycle HAVING COUNT(*) > 1) d;
```

### 5.3 รัน migration ตามลำดับ
```bash
# ชื่อไฟล์ขึ้นต้นด้วยเลข 3 หลัก → sort ได้ลำดับ 001…016 · หยุดทันทีถ้าตัวใดล้ม
for f in $(ls db/migrations/*.up.sql | sort); do
  echo "== $f"; mysql -u <user> -p<password> <db> < "$f" || break
done
```
001 add_manager_role · 002 add_late_fee_rate · 003 add_contract_occupants · 004 add_bill_payments · 005 bill_status_flow · 006 accounting_liability · 007 rooms_reserved · 008 contract_deposit_source · 009 booking_approval · 010 contract_move_in · 011 contract_inspections · 012 move_out_settlement · 013 work_orders · 014 meters · 015 rates_settings · 016 timed_notifications
- **016 ต้องรันก่อนเปิดแอป** — การหมดเวลาจองเขียน `notifications.event_key`
- ทุกตัวมี `*.down.sql` (ทดสอบ down → up บน dev แล้วสำหรับ 015, 016)

### 5.4 env (ดู `.env.example`)
- `AUTH_SECRET` (commit 1 — ตั้งก่อน build และ start; สร้างใหม่ ไม่ใช้ค่าจาก dev) · `DATABASE_URL` = `mysql://…`
- **ใหม่:** `CRON_SECRET` (สุ่มยาว เช่น `openssl rand -hex 32`) — ไม่ตั้ง = `/api/cron/reminders` ตอบ 401 (แจ้งเตือนยังทำงานจากการเปิดหน้า แต่ช้าถ้าไม่มีคนเปิด)
- เดิม: `SLIPOK_API_KEY`, `SLIPOK_ENDPOINT`, `GEMINI_API_KEY`, Turnstile, mail, social login

### 5.5 โฟลเดอร์ที่แอปต้องเขียนได้ (นอก public, ไม่อยู่ใน git)
`storage/contracts` (010) · `storage/inspections` (011) · `storage/move-out` (012) · `storage/maintenance` (013) · `storage/meters` (014)

### 5.6 cron (แจ้งเตือนตามเวลา)
```
0 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/reminders
```
หรือ PM2 app แยกที่ใช้ `cron_restart: '0 * * * *'` · ส่งซ้ำไม่ได้อยู่แล้ว (event_key) จึงรันถี่/ซ้อนกับการเปิดหน้าได้

### 5.7 หลัง deploy
- ตั้งค่าที่ `/owner/settings`: **พร้อมเพย์** (ว่าง = QR/ตรวจสลิปใช้ไม่ได้), **บัญชีธนาคาร** (พิมพ์ในสัญญา), เลขผู้เสียภาษี (ถ้ามี), ตรวจอัตรา
- แม่แบบ PDF สัญญา (`docs/สัญญาเช่าห้องพักหอพักเกษร.pdf`) ไม่อยู่ใน git — ต้องวางบน server ถ้าใช้ export-pdf (ถ้ามีเลขบัญชีพิมพ์ในแม่แบบต้องแก้ที่ไฟล์)
- **เปลี่ยนรหัสบัญชีทดสอบ/เดโม** ถ้ามีบน production (บัญชีที่ใช้ชื่อ user เป็นรหัส และผู้เช่าเดโม) · ตรวจบัญชี owner เก่าที่ยัง `is_active` (แจ้งเตือนส่งถึง owner/manager ที่ใช้งานทุกคน)
- ข้อมูลเก่าที่ไม่ถูกแปลง: สัญญา PendingFirstBill ที่ไม่มี `move_in_bill_id` = "สัญญาแบบเดิม — จัดการด้วยมือ" · คำขอย้ายออก/งานซ่อมเดิมตามข้อ 5.2
