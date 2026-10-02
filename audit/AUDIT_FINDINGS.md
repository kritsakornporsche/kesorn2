# รายงานการตรวจสอบข้อผิดพลาดของระบบ SmartDom (Kesorn 2)
**วันที่ตรวจสอบ:** 26 กันยายน 2026  
**สถานะ:** ตรวจสอบพบข้อผิดพลาดทั้งหมดและบันทึกไว้เรียบร้อยแล้ว (**ยังไม่มีการแก้ไขโค้ดตามคำสั่ง**)  
**เวอร์ชันปัจจุบันของระบบ:** `v2.7.0-b252`  
**ฐานข้อมูล:** MySQL / MariaDB (`kesorn_db`) บนพอร์ต 3306  

---

## 📌 บทสรุปผู้บริหาร (Executive Summary)
จากการตรวจสอบโค้ดแบบเจาะลึก (Deep Exhaustive System Audit) ร่วมกับการรวบรวมผลการทดสอบระบบจริงรอบที่ 3 (`docs/fail.md`) ครอบคลุมทั้ง API Endpoints, ระบบความปลอดภัย & สิทธิ์ผู้ใช้งาน (RBAC), โครงสร้างฐานข้อมูล & ข้อมูลคงค้าง (Data Integrity), การจัดการข้อผิดพลาด (Error Handling), การแยกระบบหอพัก (Multi-Tenancy Isolation), ปัญหาข้อมูลทดสอบตกค้าง และความสอดคล้องกับเล่มวิทยานิพนธ์ 

พบข้อผิดพลาด ความเสี่ยง และจุดที่ต้องแก้ไขทั้งหมด **42 รายการ** แบ่งออกเป็น 5 หมวดหมู่ทางเทคนิค และอีก 1 หมวดหมู่วิทยานิพนธ์:
1. **ความปลอดภัยและการละเมิดสิทธิ์ (Security & RBAC Bypass):** 13 รายการ (ความรุนแรงระดับวิกฤต/สูง)
2. **ข้อผิดพลาดทางเทคนิคที่ทำให้ระบบล่ม (500 Internal Server Errors):** 4 รายการ (ความรุนแรงระดับสูง)
3. **การป้องกันหน้าเว็บ & การแยกระบบหอพัก (Guards & Multi-Tenancy):** 5 รายการ (ความรุนแรงระดับปานกลาง-สูง)
4. **ตรรกะทางธุรกิจ & ความถูกต้องของข้อมูล (Business Logic & Data Consistency):** 13 รายการ (ความรุนแรงระดับปานกลาง)
5. **ปัญหาข้อมูลทดสอบ & ข้อขัดแย้งบนหน้าเว็บจากผลการทดสอบจริง (Testing & UI Alignment — จาก `docs/fail.md`):** 7 รายการ (ความรุนแรงระดับสูง-ปานกลาง)
6. **ประเด็นที่กระทบเนื้อหาเล่มวิทยานิพนธ์ (Thesis Alignment Issues):** 4 หัวข้อสำคัญ

---

## หมวดที่ 1: ความปลอดภัยและการละเมิดสิทธิ์ (Security & RBAC Bypass) — ระดับวิกฤต 🚨

### 1.1 SEC-01: ผู้ใช้ทั่วไปสามารถเลื่อนขั้นตัวเองเป็น 'owner' ได้โดยตรง (Privilege Escalation)
- **ไฟล์ที่พบ:** [`app/api/auth/update-role/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/auth/update-role/route.ts#L13-L24)
- **สาเหตุ:** Endpoint นี้เปิดรับ `{ newRole }` จากผู้ใช้ที่ล็อกอิน และอัปเดตลงตาราง `users.role` ทันที โดยอนุญาตค่า `['tenant', 'guest', 'researcher', 'owner']` โดยไม่มีการตรวจสอบสิทธิ์ว่าผู้ร้องขอเป็นเจ้าของหรือแอดมินหรือไม่
- **ผลกระทบ:** บัญชี guest หรือผู้เช่าคนใดก็ตาม สามารถส่ง request ขอเปลี่ยนบทบาทตนเองเป็น `owner` แล้วสามารถเข้าถึงหน้า `/owner` จัดการหอพักทั้งหมดได้ทันที

### 1.2 SEC-02: ใครก็ได้สามารถสั่งยกเลิกสัญญาและปลดห้องพักเป็น 'Available' โดยไม่ต้องล็อกอิน
- **ไฟล์ที่พบ:** [`app/api/owner/move-out/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/owner/move-out/route.ts#L118-L125) (ฟังก์ชัน `POST`)
- **สาเหตุ:** มีการเรียก `const session = await auth();` แต่**ไม่มีการตรวจเช็ค `if (!session || !session.user)`** และไม่มีการตรวจเช็ค role
- **ผลกระทบ:** บุคคลภายนอกที่ไม่ล็อกอิน สามารถส่ง POST `{ requestId: X }` เพื่อสั่งจบสัญญาของผู้เช่า (Terminated), ปลดห้องเป็นสถานะว่าง (Available), ปรับสถานะผู้เช่าเป็น 'past', และบันทึกบัญชีการเงินได้ทันที

### 1.3 SEC-03: ใครก็ได้สามารถสร้างสัญญาเช่าและยึดห้องพักได้โดยไม่ต้องล็อกอิน
- **ไฟล์ที่พบ:** [`app/api/owner/contracts/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/owner/contracts/route.ts#L71-L100) (ฟังก์ชัน `POST`)
- **สาเหตุ:** ไม่มีคำสั่ง `auth()` เลยแม้แต่บรรทัดเดียวในฟังก์ชัน `POST`
- **ผลกระทบ:** ผู้ไม่ประสงค์ดีสามารถส่ง POST เข้ามาสร้างบัญชีผู้ใช้ใหม่, ผูกสัญญาเช่า, และเปลี่ยนสถานะห้องพักเป็น 'Occupied' ได้โดยไม่ต้องเข้าสู่ระบบ

### 1.4 SEC-04: ใครก็ได้สามารถกดต่ออายุสัญญาเช่า (Contract Renewal) โดยไม่ต้องล็อกอิน
- **ไฟล์ที่พบ:** [`app/api/owner/contracts/renew/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/owner/contracts/renew/route.ts#L4-L18) (ฟังก์ชัน `POST`)
- **สาเหตุ:** ไม่มีการตรวจสอบสิทธิ์ `auth()`
- **ผลกระทบ:** ใครก็ได้สามารถส่ง POST `{ contract_id, new_end_date }` เพื่อขยายเวลาสัญญาเช่าของห้องใดก็ได้ในระบบ

### 1.5 SEC-05: ข้อมูลส่วนบุคคล (PDPA) และภาพถ่ายบัตรประชาชนของผู้เช่ารั่วไหลผ่าน Query Param
- **ไฟล์ที่พบ:** [`app/api/tenant/me/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/tenant/me/route.ts#L8-L15)
- **สาเหตุ:** มีการดึง `email` จาก `searchParams.get('email')` และใช้เป็น fallback เมื่อไม่มี session โดยไม่ตรวจสอบความถูกต้องของผู้เรียก
- **ผลกระทบ:** ใครก็ตามสามารถยิง `GET /api/tenant/me?email=target@email.com` แล้วระบบจะส่งข้อมูลสัญญาเช่า, เลขบัตรประชาชน 13 หลัก, ที่อยู่ตามบัตร, เบอร์โทร และ**ลิงก์รูปถ่ายบัตรประชาชน (`id_card_image`)** ออกมาให้ทั้งหมด

### 1.6 SEC-06: ข้อมูลบิลและสลิปการโอนเงินของผู้เช่ารั่วไหลโดยไม่ต้องล็อกอิน
- **ไฟล์ที่พบ:** [`app/api/tenant/billing/list/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/tenant/billing/list/route.ts#L8-L14)
- **สาเหตุ:** รองรับ `searchParams.get('email')` สำหรับผู้ที่ไม่ได้ล็อกอิน
- **ผลกระทบ:** บุคคลภายนอกสามารถดูประวัติการชำระเงิน, ยอดหนี้คงค้าง, และรูปสลิปการโอนเงินของลูกหอทุกคนได้เพียงแค่ระบุอีเมล

### 1.7 SEC-07: ผู้เช่าสามารถอัปโหลดสลิปปลอมทับบิลของลูกหอคนอื่น หรือยื่นสลิปโดยไม่ล็อกอิน
- **ไฟล์ที่พบ:** [`app/api/tenant/billing/payment/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/tenant/billing/payment/route.ts#L7-L15)
- **สาเหตุ:** เรียก `auth()` แต่ไม่ตรวจสอบ session และไม่ตรวจสอบว่า `billId` ที่ส่งมาเป็นของลูกหอผู้ส่งจริงหรือไม่
- **ผลกระทบ:** ลูกหอ A สามารถส่งสลิปปลอมไปอัปเดตบิลของลูกหอ B ให้กลายเป็นสถานะ 'Pending' ได้

### 1.8 SEC-08: ข้อมูลคำร้องขอย้ายออกและเบอร์โทร/เลขบัตรประชาชนรั่วไหล
- **ไฟล์ที่พบ:** [`app/api/owner/move-out/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/owner/move-out/route.ts#L9-L15) (ฟังก์ชัน `GET`)
- **สาเหตุ:** เรียก `auth()` แต่ไม่มีคำสั่งตรวจสอบ session
- **ผลกระทบ:** บุคคลทั่วไปสามารถเปิดดูรายการขอย้ายออกทั้งหมด พร้อมเบอร์โทร, เลขบัตรประชาชน, บัญชีพร้อมเพย์ และยอดเงินประกัน

### 1.9 SEC-09: ตัวจำลองสัญญา (Contract Simulator) สร้างสัญญาจริงผูกกับลูกหอคนแรกใน DB เมื่อไม่ล็อกอิน
- **ไฟล์ที่พบ:** [`app/api/contract/sign/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/contract/sign/route.ts#L52-L55)
- **สาเหตุ:** มี fallback แปลกประหลาด: `else { const fallbackTenants = await sql`SELECT id FROM tenants LIMIT 1`; tenantId = fallbackTenants[0].id; }`
- **ผลกระทบ:** หากผู้เยี่ยมชมเว็บไซต์ที่ยังไม่ได้ล็อกอินกดเซ็นชื่อในหน้าจำลองสัญญา ระบบจะไปสร้างสัญญาเช่าจริงในสถานะ 'PendingOwnerSignature' ผูกกับบัญชีลูกหอคนแรกในฐานข้อมูลทันที

### 1.10 SEC-10: ระบบ OCR บัตรประชาชนเปิดสาธารณะและส่งข้อมูลสมมุติ 'นายสมชาย' เมื่อผิดพลาด
- **ไฟล์ที่พบ:** [`app/api/owner/contracts/ocr-id/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/owner/contracts/ocr-id/route.ts#L12-L33)
- **สาเหตุ:** ไม่มี `auth()` ตรวจสอบ ทำให้ใครก็สามารถส่งภาพมาผลาญโควตา Gemini API ได้ และหากไม่มี API Key ระบบจะคืนค่าข้อมูลบัตรของ "นายสมชาย ใจดี" กลับไป ทำให้กรอกข้อมูลลงสัญญาผิดคน

### 1.11 SEC-11: API ฝั่ง Owner หลายตัวไม่ได้ตรวจสอบว่าผู้ใช้เป็น Owner จริงหรือไม่
- **ไฟล์ที่พบ:**
  - [`app/api/owner/billing/batch/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/owner/billing/batch/route.ts#L6-L9) (ออกบิลทั้งหอพัก)
  - [`app/api/owner/billing/[id]/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/owner/billing/%5Bid%5D/route.ts#L6-L9) (แก้สถานะบิลและยอดเงิน)
  - [`app/api/owner/maintenance/[id]/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/owner/maintenance/%5Bid%5D/route.ts#L6-L9) (เปลี่ยนสถานะงานซ่อม)
  - [`app/api/owner/refund-requests/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/owner/refund-requests/route.ts#L100-L104) (อนุมัติคืนเงินมัดจำ)
  - [`app/api/owner/contracts/[id]/sign/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/owner/contracts/%5Bid%5D/sign/route.ts#L6-L9) (อนุมัติสัญญาเช่า)
- **สาเหตุ:** มีการเช็ค `if (!session || !session.user)` แต่ขาดการเช็ค `if (session.user.role !== 'owner')`
- **ผลกระทบ:** ลูกหอหรือบุคคลภายนอกที่มีบัญชี guest ทั่วไป สามารถเรียกคำสั่งของเจ้าของหอพักเหล่านี้ได้ทั้งหมด

### 1.12 SEC-12: การรั่วไหลของรายชื่อผู้ใช้ระบบทั้งหมดผ่าน `/api/auth/users`
- **ไฟล์ที่พบ:** [`app/api/auth/users/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/auth/users/route.ts#L26-L36)
- **สาเหตุ:** ไม่มีระบบตรวจสอบสิทธิ์ ปล่อยให้บุคคลทั่วไปเรียกดูรายชื่อและอีเมลผู้ใช้ทั้งหมดได้

### 1.13 SEC-13: แบบประเมินและข้อเสนอแนะของนักศึกษาเปิดให้ผู้ใช้ทุกคนอ่านได้
- **ไฟล์ที่พบ:** [`app/api/tenant/evaluation/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/tenant/evaluation/route.ts#L117-L120)
- **สาเหตุ:** ฟังก์ชัน `GET` เช็คแค่ว่าล็อกอินหรือไม่ แต่ไม่ได้จำกัดเฉพาะ Owner หรือ Researcher
- **ผลกระทบ:** ลูกหอคนใดก็ตามสามารถเรียกดูผลประเมิน คะแนน และข้อเสนอแนะส่วนตัวของผู้ตอบแบบสอบถามทั้งหมดได้

---

## หมวดที่ 2: ข้อผิดพลาดทางเทคนิคที่ทำให้ระบบล่ม (500 Internal Server Errors) — ระดับสูง 💥

### 2.1 ERR-01: แชทฝั่งเจ้าของหอพักล่มถาวร (HTTP 500) จาก Syntax Error `[object Promise]`
- **ไฟล์ที่พบ:** [`app/api/chat/conversations/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/chat/conversations/route.ts#L59) และ [บรรทัด 167](file:///d:/Works/thesiss/kesorn/app/api/chat/conversations/route.ts#L167)
- **ข้อความ Error:** `You have an error in your SQL syntax; check the manual that corresponds to your MariaDB server version for the right syntax to use near ''[object Promise]'' at line 3`
- **สาเหตุ:** โค้ดเขียน `WHERE k.dorm_id IN ${sql(dormIds)}` ซึ่งใน MySQL Adapter ตัว `sql` เป็น async function ที่คืนค่า Promise เมื่อถูก interpolate ลงใน string template JS จึงแปลงเป็น `'[object Promise]'`
- **ผลการทดสอบจริง:** ยิงทดสอบด้วยบัญชีเจ้าของหอพัก (`owner@kesorn.com`) ได้สถานะ **500 Internal Server Error** 100%

### 2.2 ERR-02: Endpoint `/api/auth/users` ล่มถาวร (HTTP 500) จากไวยากรณ์ PostgreSQL FILTER
- **ไฟล์ที่พบ:** [`app/api/auth/users/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/auth/users/route.ts#L40-L44)
- **ข้อความ Error:** `You have an error in your SQL syntax ... near '(WHERE role = 'owner') AS owners'`
- **สาเหตุ:** มีการใช้ไวยากรณ์ `COUNT(*) FILTER (WHERE role = 'owner')` ซึ่งเป็นของ PostgreSQL และไม่รองรับใน MySQL/MariaDB
- **ผลการทดสอบจริง:** ยิงทดสอบได้สถานะ **500 Internal Server Error** ทันที

### 2.3 ERR-03: การเปิดดูห้องพักครั้งแรกของลูกค้าทำให้ API บันทึกความคืบล่ม (HTTP 500)
- **ไฟล์ที่พบ:** [`app/api/booking/progress/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/booking/progress/route.ts#L26-L27)
- **ข้อความ Error:** `TypeError: Cannot read properties of undefined (reading 'booking_data')`
- **สาเหตุ:** บรรทัดที่ 26 เขียน `const item = progress[0]; let parsedData = item.booking_data;` โดยไม่มีการตรวจเช็ค `if (!item)` เมื่อผู้ใช้เพิ่งเปิดห้องเป็นครั้งแรกและยังไม่เคยมีประวัติบันทึกในตาราง `booking_progress`
- **ผลกระทบ:** เกิดข้อผิดพลาด 500 บนฝั่งเซิร์ฟเวอร์ทุกครั้งที่ผู้ใช้ใหม่กดเข้าหน้ารายละเอียดห้องพัก

### 2.4 ERR-04: การลบห้องพักทำให้เกิด Foreign Key Constraint Error (HTTP 500)
- **ไฟล์ที่พบ:** [`app/api/rooms/[id]/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/rooms/%5Bid%5D/route.ts#L128) (ฟังก์ชัน `DELETE`)
- **สาเหตุ:** คำสั่ง `DELETE FROM rooms WHERE id = ${id}` ไม่มี soft-delete และไม่ตรวจสอบตารางลูก เช่น `contracts`, `meter_readings`, `cleaning_jobs`, `booking_progress` ที่มี Foreign Key อ้างอิงมายัง `rooms.id`
- **ผลกระทบ:** ลบห้องที่มีประวัติแล้วไม่สำเร็จ และโยน Error `ER_ROW_IS_REFERENCED_2` (HTTP 500)

---

## หมวดที่ 3: การป้องกันหน้าเว็บ & การแยกระบบหอพัก (Guards & Multi-Tenancy) 🛡️

### 3.1 GUARD-01: ค่า `dormId` ใน JWT Token ไม่เคยถูกกำหนด ทำให้ `session.user.dormId` เป็น `undefined` เสมอ
- **ไฟล์ที่พบ:** [`auth.ts`](file:///d:/Works/thesiss/kesorn/auth.ts#L178)
- **สาเหตุ:** ใน `session` callback มีการกำหนด `session.user.dormId = token.dormId` แต่ใน `jwt` callback (บรรทัด 140-171) ไม่เคยมีการใส่ค่า `token.dormId` ลงใน token
- **ผลกระทบ:** ทุก Endpoint ที่อ้างอิง `session.user.dormId` จะได้ค่า `undefined` และต้อง fallback ไปเป็นหอพัก ID 1 เสมอ ทำให้ระบบไม่รองรับ Multi-Dormitory

### 3.2 GUARD-02: Layout Guard ของ Owner และ Keeper ตรวจสอบเฉพาะ `role` โดยไม่ดู `primary_role`
- **ไฟล์ที่พบ:** [`app/owner/layout.tsx`](file:///d:/Works/thesiss/kesorn/app/owner/layout.tsx#L27) และ [`app/keeper/layout.tsx`](file:///d:/Works/thesiss/kesorn/app/keeper/layout.tsx#L20)
- **สาเหตุ:** Fallback query เขียนว่า `SELECT role FROM users WHERE LOWER(email) = ...` ขาดการใช้ `COALESCE(role, primary_role)`
- **ผลกระทบ:** หากผู้ใช้มี `primary_role = 'owner'` แต่คอลัมน์ `role` เป็น NULL หรือ 'guest' จะถูกถีบออกจากหน้าและ redirect ไปยัง `/signin` ทันที

### 3.3 GUARD-03: Platform Layout ขาด Database Fallback Verification
- **ไฟล์ที่พบ:** [`app/platform/layout.tsx`](file:///d:/Works/thesiss/kesorn/app/platform/layout.tsx#L15-L18)
- **สาเหตุ:** ตรวจสอบเฉพาะ role ใน session cookie โดยไม่มี fallback ไปตรวจตาราง `platform_admins` ในฐานข้อมูล หาก cookie หมดอายุหรือ role ไม่ตรง แอดมินจะไม่สามารถเข้าหน้าจัดการระบบได้

### 3.4 GUARD-04: หน้า `/tenant` อนุญาตให้บทบาท 'guest' เข้าถึงได้
- **ไฟล์ที่พบ:** [`app/tenant/layout.tsx`](file:///d:/Works/thesiss/kesorn/app/tenant/layout.tsx#L19)
- **สาเหตุ:** กำหนดเงื่อนไข `let isAllowed = role === 'tenant' || role === 'owner' || role === 'guest';`
- **ผลกระทบ:** ผู้ใช้ที่ยังไม่ได้จองห้องพักสามารถกดเข้า URL `/tenant` ได้โดยไม่ถูก redirect ไปหน้า `/explore`

### 3.5 GUARD-05: ความไม่สอดคล้องของข้อมูล `role` และ `primary_role` ในฐานข้อมูลจริง
- **สาเหตุจากการตรวจสอบฐานข้อมูล:**
  - ผู้ใช้ ID 163 (`tenant9@kesorn.com`), 164, 165 มี `role = 'tenant'` แต่ `primary_role = NULL`
  - ผู้ใช้ ID 167, 169, 171 มี `role = 'guest'` แต่ `primary_role = 'tenant'`
- **ผลกระทบ:** ทำให้สิทธิ์การเข้าใช้งานระหว่างเซสชัน NextAuth และ Layout guards ทำงานขัดแย้งกัน

---

## หมวดที่ 4: ตรรกะทางธุรกิจ & ความถูกต้องของข้อมูล (Business Logic & Data Consistency) ⚙️

### 4.1 BIZ-01: ความเสี่ยงการจองห้องซ้ำซ้อน (Double-Booking Race Condition)
- **ไฟล์ที่พบ:** [`app/api/contracts/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/contracts/route.ts) และ [`app/api/contract/sign/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/contract/sign/route.ts)
- **สาเหตุ:** ไม่มีการใช้ Atomic Lock (`SELECT ... FOR UPDATE`) หรือ Unique Constraint บนห้องพักในสัญญาที่กำลัง Active
- **หลักฐานใน DB จริง:**
  - **ห้อง 5:** มีสัญญา Active ซ้ำซ้อนกันถึง **10 สัญญา!**
  - **ห้อง 18:** มีสัญญา Active ซ้ำซ้อนกันถึง **6 สัญญา!**

### 4.2 BIZ-02: สถานะห้องพักไม่ตรงกับสัญญาจริง (Status Desynchronization)
- **หลักฐานใน DB จริง:**
  - **ห้อง 18:** สถานะในตาราง `rooms` แสดงเป็น `'Available'` ทั้งที่มีสัญญาเช่า Active อยู่ 6 สัญญา
  - **ห้อง 9, 11, 20:** สถานะในตาราง `rooms` แสดงเป็น `'Occupied'` แต่ไม่มีสัญญาเช่า Active ผูกอยู่เลย

### 4.3 BIZ-03: คอลัมน์ `rooms.tenant_id` ไม่เคยถูกอัปเดตเมื่อเกิดการทำสัญญาหรือย้ายออก
- **ไฟล์ที่พบ:** [`app/api/owner/contracts/[id]/sign/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/owner/contracts/%5Bid%5D/sign/route.ts#L46-L50)
- **สาเหตุ:** ตอนอนุมัติสัญญา มีการแก้แค่ `rooms.status = 'Occupied'` แต่ไม่เคยใส่ `rooms.tenant_id = tenantId` และตอนย้ายออกก็ไม่เคยเคลียร์ค่า

### 4.4 BIZ-04: API มีการแก้ไขข้อมูลหลายตารางต่อเนื่องโดยไม่ใช้ Database Transaction (25 ไฟล์)
- **ไฟล์ตัวอย่าง:**
  - `app/api/owner/billing/batch/route.ts` (ลูปสร้างบิลและแจ้งเตือนทีละคน)
  - `app/api/owner/move-out/route.ts` (แก้ 5 ตารางพร้อมกันโดยไม่มี `START TRANSACTION`)
  - `app/api/owner/contracts/route.ts` (สร้าง user, tenant, role, contract)
  - `app/api/owner/rules/clone/route.ts` (สั่งลบกฎเดิมแล้วคัดลอกใหม่)
- **ผลกระทบ:** หากระบบขัดข้องหรือเกิดข้อผิดพลาดระหว่างทาง ข้อมูลจะถูกแก้ไขไปเพียงบางส่วน (Inconsistent State) ไม่สามารถ Rollback ได้

### 4.5 BIZ-05: ยอดรวมรายรับ-รายจ่ายในหน้าบัญชีคำนวณจากข้อมูลเพียง 100 รายการแรก (`LIMIT 100`)
- **ไฟล์ที่พบ:** [`app/api/owner/accounting/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/owner/accounting/route.ts#L40-L45) และ [`app/api/platform/accounting/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/platform/accounting/route.ts#L34-L39)
- **สาเหตุ:** ฟังก์ชันดึง `transactions` ด้วย `LIMIT 100` แล้วนำ array 100 ตัวนั้นมา `.reduce()` หายอดรวมรายรับและรายจ่ายทั้งหมดของหอพัก
- **ผลกระทบ:** หากหอพักมีรายการบัญชีเกิน 100 รายการ ตัวเลขสรุปรายรับ รายจ่าย และกำไรสุทธิบนแดชบอร์ดจะ**ผิดพลาดทันที** เพราะไม่นับรายการที่ 101 เป็นต้นไป

### 4.6 BIZ-06: การเชื่อมตารางผู้สร้างประกาศข่าวสารผิดพลาด (`a.dorm_id = u.id`)
- **ไฟล์ที่พบ:** [`app/api/announcements/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/announcements/route.ts#L15)
- **สาเหตุ:** เขียน `LEFT JOIN users u ON a.dorm_id = u.id` ซึ่งเป็นการเอา ID หอพักไปจับคู่กับ ID ของ User แทนที่จะเชื่อมผ่าน `dormitory_registry`
- **ผลกระทบ:** ชื่อผู้ประกาศข่าวจะกลายเป็นชื่อของ User คนใดก็ตามที่มี `id = 1` เสมอ

### 4.7 BIZ-07: Endpoint รายละเอียดหอพักเดี่ยวไม่สนใจพารามิเตอร์ `dormId` ใน URL
- **ไฟล์ที่พบ:** [`app/api/dorms/[id]/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/dorms/%5Bid%5D/route.ts#L11-L22)
- **สาเหตุ:** รับค่า `dormId` มาแต่ในคำสั่ง SQL ไม่มี `WHERE p.id = ${dormId}` เลย
- **ผลกระทบ:** ไม่ว่าจะเรียก `/api/dorms/1`, `/api/dorms/2` หรือ `/api/dorms/999` ระบบจะคืนข้อมูลของหอพักแรกเสมอ

### 4.8 BIZ-08: การแจ้งเตือนขอย้ายออกฮาร์ดโค้ดส่งหาเจ้าของหอพัก ID 1 เสมอ
- **ไฟล์ที่พบ:** [`app/api/tenant/move-out/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/tenant/move-out/route.ts#L175)
- **สาเหตุ:** ระบุเงื่อนไขแจ้งเตือนตายตัว `WHERE dr.id = 1` แม้ผู้เช่าจะอยู่หอพักอื่น

### 4.9 BIZ-09: Fallback Link ในระบบแจ้งเตือนพาลูกหอไปยังหน้าของ Owner
- **ไฟล์ที่พบ:** [`app/api/notifications/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/notifications/route.ts#L33)
- **สาเหตุ:** `action_url: n.link || (n.type === 'booking' ? '/owner/bookings' : '/owner')`
- **ผลกระทบ:** เมื่อลูกหอได้รับการแจ้งเตือนที่ไม่มี link เฉพาะ แล้วกดเปิด จะถูกพาไปหน้า `/owner/bookings` และโดนบล็อกด้วย Error 403

### 4.10 BIZ-10: การตรวจจับสัญญาในห้องแชทลูกหอใช้ Foreign Key ผิดคอลัมน์
- **ไฟล์ที่พบ:** [`app/api/chat/conversations/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/chat/conversations/route.ts#L259)
- **สาเหตุ:** เขียนว่า `WHERE c.tenant_id = ${user.id}` ทั้งที่ `c.tenant_id` อ้างอิง ID ของตาราง `tenants` ไม่ใช่ `users.id`
- **ผลกระทบ:** ลูกหอที่มีสัญญาเช่าอยู่แล้ว เมื่อเข้าห้องแชทครั้งแรก ระบบจะไม่สามารถจับคู่สัญญาเช่าเพื่อเปิดห้องแชทกับเจ้าของหอพักอัตโนมัติได้

### 4.11 BIZ-11: การตรวจสอบเลขห้องซ้ำซ้อนไม่จำกัดขอบเขตหอพัก (`dorm_id`)
- **ไฟล์ที่พบ:** [`app/api/rooms/[id]/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/rooms/%5Bid%5D/route.ts#L84)
- **สาเหตุ:** `SELECT id FROM rooms WHERE room_number = ${room_number} AND id != ${id}` ไม่ได้ใส่ `AND dorm_id = ...`
- **ผลกระทบ:** หากหอพัก A มีห้อง "101" หอพัก B จะไม่สามารถสร้างหรือแก้ไขห้องเป็นหมายเลข "101" ได้

### 4.12 BIZ-12: การ Join ข้อมูลหอพักกับห้องพักเกิดปัญหา Cartesian Product (`ON 1=1`)
- **ไฟล์ที่พบ:** [`app/api/dorms/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/dorms/route.ts#L24) และ [`app/api/dorms/[id]/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/dorms/%5Bid%5D/route.ts#L19)
- **สาเหตุ:** ใช้ `LEFT JOIN rooms rm ON 1=1` แทนที่จะเป็น `rm.dorm_id = p.id`
- **ผลกระทบ:** ทุกหอพักจะนับจำนวนห้องว่างและราคาต่ำสุดรวมกันทั้งหมดทุกหอพัก

### 4.13 BIZ-13: เวลาถูกบันทึกล่วงหน้า/ย้อนหลัง 7 ชั่วโมง จากการตัดตัวอักษร 'Z' ใน UTC Date String
- **ไฟล์ที่พบ:** [`lib/mysql-adapter.js`](file:///d:/Works/thesiss/kesorn/lib/mysql-adapter.js#L93)
- **สาเหตุ:** ฟังก์ชันแปลงค่า ISO String ด้วยคำสั่ง `val.replace('T', ' ').replace(/Z$/, '')` โดยไม่ปรับ Timezone จาก UTC เป็น UTC+7
- **ผลกระทบ:** เวลาในฐานข้อมูล MySQL DATETIME จะถูกบันทึกช้ากว่าเวลาจริงในประเทศไทย 7 ชั่วโมง (เช่น เวลาไทย 21:00 น. แต่ถูกบันทึกเป็น 14:00 น.) ส่งผลต่อการตรวจสอบวันหมดอายุของ OTP และกำหนดเวลาบิล

---

## หมวดที่ 5: ปัญหาข้อมูลทดสอบ & ข้อขัดแย้งบนหน้าเว็บจากผลการทดสอบจริง (Testing & UI Alignment — จาก `docs/fail.md`) 🧪

### 5.1 SEED-01: สคริปต์ใส่ข้อมูลตัวอย่าง (Seed) ทำงานซ้ำซ้อนทุกครั้งที่ Deploy หรือรีสตาร์ตระบบ
- **ที่มาและข้อค้นพบ:** รายการ `A` ใน `docs/fail.md`
- **อาการที่พบ:** งานทำความสะอาดในระบบพุ่งจาก 20 เป็น 59 รายการ โดยพบว่าเป็นชุดข้อมูลเดิมที่ถูกสร้างขึ้นในวินาทีเดียวกันถึง 19 รอบในวันเดียว (ช่วงเวลา 15:10–21:23 น.) เช่น งานห้อง 9 "ทำความสะอาดเตรียมห้อง 9 ก่อนผู้เช่าย้ายเข้าสัปดาห์หน้า" (รอดำเนินการ) รวมถึงงานห้อง 5 และห้อง 20
- **สาเหตุ:** สคริปต์ Seeder หรือ Database Migration ทำงานอัตโนมัติเมื่อระบบเริ่มทำงานใหม่ (Server Bootstrap) โดยไม่มีการตรวจสอบสถานะว่าเคยใส่ข้อมูลไปแล้วหรือไม่ (`IF NOT EXISTS` หรือ Check Flag)
- **ผลกระทบ:** หากระบบมีการรีสตาร์ตในระหว่างการสอบวิทยานิพนธ์หรือการสาธิตจริง ข้อมูลงานและบิลจะทวีคูณซ้ำซ้อนสร้างความเสียหายต่อข้อมูลสถิติ
- **แนวทางแก้ไข:** ปิดการรัน Seed อัตโนมัติบน Production หรือเพิ่มเงื่อนไขตรวจเช็คข้อมูลก่อน Insert

### 5.2 DATA-01: ข้อมูลทดสอบตกค้างปริมาณมากที่ต้องล้างก่อนเริ่มทดสอบจริง (Wipe Mock Data)
- **ที่มาและข้อค้นพบ:** รายการ `B` ใน `docs/fail.md`
- **หลักฐานในระบบจริง:**
  - บิลคงค้าง 39 ใบ (โดย 36 ใบไม่มีการคำนวณค่าน้ำ/ค่าไฟจากการจดมิเตอร์)
  - รายการจองห้องพัก 40 รายการ
  - คำร้องแจ้งซ่อม 41 รายการ (เฉพาะห้อง 5 พบถึง 45 รายการในฝั่งลูกหอ)
  - งานทำความสะอาด 59 รายการ
  - ข้อมูลมิเตอร์สมมติของห้องอื่นตกค้าง 33 รายการ
  - ผู้เช่าทดสอบตกค้างเกินในห้อง 17 และห้อง 18 (ชื่อ "นายสมชาย ใจดี" — โดยห้อง 18 มีชื่อซ้ำ 2 คน)
- **ผลกระทบ:** ทำให้การทดสอบจริงตามตาราง 15 และการเก็บผลแบบสอบถามมีความคลาดเคลื่อนจากข้อมูลขยะ
- **แนวทางแก้ไข:** ต้องทำ Data Sanitization / Cleanup สคริปต์เพื่อรีเซ็ตข้อมูลก่อนวันทดสอบ

### 5.3 RATE-01: อัตราค่าไฟฟ้าในระบบยังคงคำนวณที่ 7 บาท/หน่วย แทนที่จะเป็น 8 บาท/หน่วย
- **ที่มาและข้อค้นพบ:** รายการ `C` ใน `docs/fail.md`
- **ไฟล์ที่เกี่ยวข้อง:** [`app/api/owner/billing/batch/route.ts`](file:///d:/Works/thesiss/kesorn/app/api/owner/billing/batch/route.ts#L33)
- **สาเหตุ:** ในโค้ดแบ็กเอนด์ยังมีค่า Hardcoded หรือดึงค่า Config ไฟฟ้าเป็น 7 บาท/หน่วย ทำให้การออกบิลล่าสุด (เช่น ใช้ 50 หน่วย) คิดเป็นเงิน 350 บาท (50 × 7) แทนที่จะเป็น 400 บาท (50 × 8)
- **ผลกระทบ:** ยอดเงินไม่ตรงกับอัตราจริงของหอพักเกสร (8 บาท/หน่วย) และขัดแย้งกับผลการคำนวณด้วยมือในตาราง 15 ของวิทยานิพนธ์
- **แนวทางแก้ไข:** ปรับแก้การคำนวณและการตั้งค่าระบบให้เป็น 8 บาท/หน่วย ทุกจุดก่อนเริ่มทดสอบ

### 5.4 UI-01: อัตราค่าบริการบนหน้าเว็บแสดงผลขัดแย้งกันเองในหลายจุด (Conflicting Pricing UI)
- **ที่มาและข้อค้นพบ:** รายการ `D` ใน `docs/fail.md`
- **อาการที่พบ:**
  - หน้าแรก (Landing Page) และหน้ารายละเอียดห้องแสดงข้อความปนกัน: มีทั้ง "ค่าไฟ 6 / ฿6", "ค่าไฟหน่วยละ 7"
  - ค่าน้ำมีทั้ง "ค่าน้ำประปา ฟรี (รวมในค่าห้อง)" และ "เหมาจ่าย 100"
- **ผลกระทบ:** ผู้ใช้และคณะกรรมการที่เข้ามาดูเว็บไซต์จะสับสนในอัตราค่าบริการจริง
- **แนวทางแก้ไข:** ตรวจสอบและแก้ไข Copywriting ทุกจุดให้สอดคล้องกัน: **ค่าไฟ 8 บาท/หน่วย** และ **ค่าน้ำเหมาจ่าย 100 บาท/เดือน** (ครอบคลุม Landing Page, หน้ารายละเอียดห้อง, หน้าสรุปค่าใช้จ่ายการจอง, และหน้าจดมิเตอร์)

### 5.5 UI-02: ข้อผิดพลาดบนหน้าแม่บ้าน (Maid Portal UI Glitches)
- **ที่มาและข้อค้นพบ:** รายการ `F` และ `G` ใน `docs/fail.md`
- **อาการที่พบ:**
  1. เมนูแถบข้าง (Sidebar) ของแม่บ้าน มีปุ่ม "🔧 งานซ่อม" แสดงอยู่ ทั้งที่แม่บ้านไม่มีสิทธิ์เข้าถึงหน้าระบบช่าง
  2. ตัวนับสถิติบนหน้าแดชบอร์ดแม่บ้านแสดงข้อความว่า "งานทั้งหมดในระบบ 59 **ห้อง**"
- **ผลกระทบ:** การนำเสนอไม่เรียบร้อยและใช้หน่วยนับผิดบริบท
- **แนวทางแก้ไข:** ซ่อนเมนูงานซ่อมออกจาก Sidebar ของแม่บ้าน และเปลี่ยนคำต่อท้ายตัวนับเป็น "59 **งาน**"

### 5.6 BIZ-14: รูปแบบรอบบิลปนกันระหว่างรหัสปีเดือนและข้อความภาษาไทย
- **ที่มาและข้อค้นพบ:** รายการ `H` และ `I` ใน `docs/fail.md`
- **อาการที่พบ:** ในตารางบิลมีรอบบิลหลากรูปแบบปะปนกัน เช่น `"2026-10"`, `"2026-11"`, `"2028-06"` และรอบบิลที่เป็นข้อความ เช่น `"ค่าซ่อมแซม 26/9/2569"`, `"บริการทำความสะอาด 26/9/2569"`
- **สาเหตุ:** API ช่าง (`/api/technician/jobs/[id]`) และแม่บ้าน (`/api/maid/jobs/[id]`) มีการยิงออกบิลอัตโนมัติเข้าตาราง `bills` เมื่อระบุค่าใช้จ่าย (`cost > 0`) โดยใช้ชื่อบริการเป็นรอบบิล
- **ประเด็นพิจารณา:** ต้องยืนยันกับผู้วิจัยว่าระบบมีฟังก์ชันออกบิลค่าซ่อม/ค่าบริการทำความสะอาดเพิ่มนอกเหนือจากบิลค่าเช่ารายเดือนตามขอบเขตเล่มวิทยานิพนธ์หรือไม่

### 5.7 AUTH-01: บั๊กการสลับบทบาทแสดง "คุณไม่มีสิทธิ์เข้าถึงหน้านี้" (Role Switch Session Desynchronization)
- **ที่มาและข้อค้นพบ:** รายการ `E` ใน `docs/fail.md`
- **อาการที่พบ:** เมื่อผู้ใช้เปลี่ยนสลับบทบาท ระบบจะแจ้งเตือนว่าไม่มีสิทธิ์เข้าถึงหน้าดังกล่าว ต้องทำการรีโหลด (Refresh) หน้าเว็บก่อนจึงจะสามารถเข้าใช้งานได้ตามปกติ
- **สาเหตุ:** คุกกี้เซสชันของ NextAuth หรือ Client-side cache ไม่ได้ถูก Revalidate / Invalidate ทันทีที่มีการเปลี่ยนบทบาท

---

## หมวดที่ 6: ประเด็นที่กระทบเนื้อหาเล่มวิทยานิพนธ์ (Thesis Alignment Issues) 📝

### 6.1 THESIS-01: การปรับแก้อัตราค่าไฟฟ้าเป็น 8 บาท/หน่วย ในเอกสารวิทยานิพนธ์
- **ข้อเท็จจริง:** อัตราค่าไฟฟ้าจริงของหอพักคือ 8 บาท/หน่วย (ตัวเลข 7 บาทที่เคยปรากฏในเล่มมาจากการคำนวณย้อนหลังของทีมวิจัย ไม่ใช่บิลจริงของหอพัก)
- **จุดที่ต้องแก้ไขในเล่ม:**
  1. ย่อหน้าวิธีเก็บรวบรวมข้อมูลในบทที่ 3
  2. ย่อหน้านำเข้าสู่ตาราง 15 ในบทที่ 4
  3. คอลัมน์ "คำนวณด้วยมือ" ในตาราง 15 (ปรับสูตรเป็น จำนวนหน่วย × 8)
  4. ตัดประโยค *"พบว่าอัตราค่าไฟฟ้าที่หอพักใช้จริงคงที่ที่ 7 บาทต่อหน่วยในทุกกรณี"* ใต้ตาราง 15 ออก

### 6.2 THESIS-02: ความชัดเจนของนิยามเงินจองและเงินประกันสัญญาเช่า
- **ข้อเท็จจริง:** ในระบบจริงกำหนดให้ชำระ **ค่าจอง 1,000 บาท** ผ่าน QR Code ทันทีที่กดจอง และชำระ **เงินประกันสัญญา 2,000 บาท** ในวันทำสัญญา/ย้ายเข้า (รวมเงินมัดจำทั้งหมด 3,000 บาท)
- **จุดที่ต้องแก้ไขในเล่ม:** ปรับปรุงถ้อยคำในบทคัดย่อ, บทนำ, บทที่ 3 (ฟังก์ชัน Guest และ Owner), บทที่ 4 (ภาพ 4.7 และชุดทดสอบ TC-19), และบทที่ 5 (ข้อเสนอแนะ) ให้ตรงกับขั้นตอนจริงของระบบ

### 6.3 THESIS-03: การแนบเอกสารสัญญาเช่าจริงแทนระบบลายเซ็นดิจิทัล (D2 / TC-07)
- **ข้อเท็จจริง:** สัญญาเช่าในระบบ SmartDom ใช้วิธีการแนบไฟล์/รูปถ่ายของสัญญากระดาษจริงที่คู่สัญญาเซ็นร่วมกัน แทนการใช้ระบบลงลายมือชื่อดิจิทัล (Digital Signature)
- **จุดที่ต้องแก้ไขในเล่ม:** ปรับปรุงรายละเอียดในชุดการทดสอบ TC-07 และคำบรรยายการทำงานของระบบให้ตรงกับพฤติกรรมจริงของแอปพลิเคชัน

### 6.4 THESIS-04: การเพิ่มชุดการทดสอบการบริการทำความสะอาด (TC-26 – TC-28)
- **ข้อเท็จจริง:** มีการพัฒนาฟังก์ชันการแจ้งและจัดการงานทำความสะอาดเพิ่มเติม ซึ่งยังไม่มีใน Test Cases เดิมของเล่มวิทยานิพนธ์
- **จุดที่ต้องแก้ไขในเล่ม:** เพิ่มชุดการทดสอบ TC-26 ถึง TC-28 ในแผนการทดสอบบทที่ 4 ให้ครอบคลุมทุกบทบาท (ลูกหอแจ้ง → แม่บ้านรับงานและทำความสะอาด → เจ้าของหอยืนยัน)

---

## สรุปสถานะการทำงาน
- การตรวจสอบระบบทั้งหมดเสร็จสมบูรณ์ 100%
- ได้รวมข้อมูลจากการตรวจสอบโค้ดเชิงลึก (35 รายการ) และผลการทดสอบจริงจาก `docs/fail.md` (7 รายการเทคนิค/UI + 4 รายการเล่มวิทยานิพนธ์)
- **ไม่มีการแตะต้องหรือแก้ไขโค้ดใดๆ ทั้งสิ้น** เป็นไปตามคำสั่งของผู้ใช้อย่างเคร่งครัด
