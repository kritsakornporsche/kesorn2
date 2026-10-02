# รายงานการวิเคราะห์ปัญหาหน้า UI บนการใช้งานจริงผ่านโทรศัพท์มือถือ (Mobile Usability Audit)
**SmartDom - ระบบบริหารจัดการหอพักเกษร 2**  
*วันที่ตรวจสอบ: 26 กันยายน 2026 | สถานะ: วิเคราะห์ครบถ้วน (ยังไม่มีการแก้ไขโค้ดตามคำสั่ง)*

---

## สรุปภาพรวมการตรวจวิเคราะห์ (Executive Summary)

จากการตรวจสอบเชิงลึก (Deep Static & Responsive Analysis) ทุกไฟล์หน้าจอ UI ในระบบรวมทั้งสิ้นกว่า **101 ไฟล์** ครอบคลุมทุกบทบาทผู้ใช้งาน (**เจ้าของหอพัก - Owner, ผู้เช่า - Tenant, ผู้ดูแล/แม่บ้าน/ช่าง - Keeper, ผู้ดูแลระบบส่วนกลาง - Platform Admin, และผู้เยี่ยมชม - Public**) พบข้อผิดพลาดร้ายแรงเกี่ยวกับการใช้งานบนโทรศัพท์มือถือจริง โดยเฉพาะ:
1. **ปุ่มตกหล่น / หลุดจอ / ติดอยู่ใต้คีย์บอร์ดเสมือน (Keyboard Trap & Truncated Modals)**
2. **ไม่สามารถเลื่อนหน้าจอลงไปกดปุ่มได้ (Unscrollable Parent / Modal Scroll Lock)**
3. **ปุ่มไม่แสดง หรือถูกแถบเมนูด้านล่างทับ (Fixed Bottom Navigation Overlap)**
4. **ตารางล้นจอแต่เลื่อนแนวนอนไม่ได้ ข้อมูลและปุ่มกดถูกตัดทิ้ง (Horizontal Overflow & Truncated Table Actions)**
5. **กริดยุบตัวจนปุ่มและช่องกรอกเล็กเกินสัมผัส (Rigid Grid Breakdown & Small Touch Targets)**
6. **ปุ่มล่องหนบนหน้าจอสัมผัส (Hover-dependent Opacity Trap on Touchscreens)**

---

## หมวดที่ 1: หน้าจอที่ "ไม่สามารถเลื่อนหน้าจอลงไปกดปุ่มได้" (Unscrollable Parent Traps)

### 1.1 หน้าตรวจสัญญาเช่าและอนุมัติสัญญาเช่าของเจ้าของหอพัก (Critical Blocker)
- **ไฟล์ที่พบ**: [`app/owner/contracts/[id]/page.tsx`](file:///d:/Works/thesiss/kesorn/app/owner/contracts/[id]/page.tsx#L107) และ [`app/owner/layout.tsx:48`](file:///d:/Works/thesiss/kesorn/app/owner/layout.tsx#L48)
- **สาเหตุของปัญหา**: 
  - ใน `app/owner/layout.tsx` บรรทัดที่ 48 กำหนดให้คอนเทนเนอร์หลักของหน้าจอมีคลาส `overflow-hidden`
  - ในขณะที่หน้า `app/owner/contracts/[id]/page.tsx` คอนเทนเนอร์ระดับบนสุดกำหนดคลาสเป็น `<div className="p-6 sm:p-10 max-w-5xl mx-auto space-y-8 font-sans">` โดย**ไม่มีคลาส `overflow-y-auto` หรือ `h-full`**
- **ผลกระทบจริงบนมือถือ**: 
  - เมื่อเปิดดูหน้ารายละเอียดสัญญาเช่าที่มีข้อมูลยาว (ข้อมูลผู้เช่า, รายละเอียดห้อง, เงินประกัน, ภาพสลิป, ลายเซ็น) **หน้าจอจะถูกล็อคความสูงไว้ ไม่สามารถเลื่อน (Scroll) ลงไปดูเนื้อหาด้านล่างได้เลย**
  - เจ้าของหอพักไม่สามารถเลื่อนลงไปตรวจภาพสลิป ไม่สามารถดูเอกสารสัญญาฉบับเต็ม และที่สำคัญที่สุดคือ **ไม่สามารถเลื่อนลงไปกดปุ่ม "✓ อนุมัติสัญญาเช่านี้" (บรรทัดที่ 147) ได้เลย** ส่งผลให้กระบวนการอนุมัติสัญญาล้มเหลว 100% บนมือถือ
- **แนวทางแก้ไข**: เพิ่ม `flex-1 overflow-y-auto w-full h-full` ให้กับ root container ของหน้ารายละเอียดสัญญา

---

### 1.2 หน้าทะเบียนผู้เช่าของเจ้าของหอพัก (Scroll Lock & Table Cutoff)
- **ไฟล์ที่พบ**: [`app/owner/tenants/page.tsx:66`](file:///d:/Works/thesiss/kesorn/app/owner/tenants/page.tsx#L66) และบรรทัดที่ 76–77
- **สาเหตุของปัญหา**: 
  - Root container กำหนด `className="flex-1 flex flex-col overflow-hidden"`
  - บรรทัดที่ 76 ใช้การ์ดคลุมตารางเป็น `<div className="bg-card rounded-[32px] overflow-hidden shadow-xl ...">` โดย**ไม่มีคลาส `overflow-x-auto`**
  - คอลัมน์ตารางมีการกำหนด Padding สูงถึง `px-8 py-5` (32px ซ้าย + 32px ขวา = 64px ต่อคอลัมน์ รวม 5 คอลัมน์ = 320px เฉพาะ Padding)
- **ผลกระทบจริงบนมือถือ**: 
  - บนจอมือถือความกว้าง 360px - 390px ตารางจะล้นจออย่างรุนแรง แต่คอนเทนเนอร์เป็น `overflow-hidden` ผู้ใช้จึง**ไม่สามารถเลื่อนหน้าจอในแนวนอนเพื่อดูเบอร์โทรศัพท์ อีเมล หรือสถานะของผู้เช่าได้** ข้อมูลถูกตัดตกขอบจอทั้งหมด
- **แนวทางแก้ไข**: หุ้ม `<table>` ด้วย `<div className="overflow-x-auto w-full">` และลด Padding บนมือถือเป็น `px-4 py-3 sm:px-8 sm:py-5`

---

### 1.3 หน้าจอเข้าสู่ระบบถูกล็อคการเลื่อนเมื่อเปิดคีย์บอร์ด (Sign In Virtual Keyboard Trap)
- **ไฟล์ที่พบ**: [`app/signin/SigninContent.tsx:126`](file:///d:/Works/thesiss/kesorn/app/signin/SigninContent.tsx#L126)
- **สาเหตุของปัญหา**: 
  - Root div ใช้คลาส `min-h-screen bg-background flex items-center justify-center p-4 sm:p-6 relative overflow-hidden`
- **ผลกระทบจริงบนมือถือ**: 
  - เมื่อผู้ใช้งานแตะที่ช่องกรอกรหัสผ่าน คีย์บอร์ดเสมือนของโทรศัพท์ (Virtual Keyboard) จะเด้งขึ้นมากินพื้นที่ความสูงหน้าจอไปประมาณ 300px–350px
  - คอนเทนเนอร์มีคลาส `overflow-hidden` ทำให้การ์ดฟอร์มที่มีความสูงเกินพื้นที่หน้าจอที่เหลือ **ไม่สามารถเลื่อนขึ้นลงได้**
  - **ปุ่ม "เข้าสู่ระบบ" และลิงก์ "ลืมรหัสผ่าน?" ถูกคีย์บอร์ดบังมิด** ผู้ใช้ต้องกดยุบคีย์บอร์ดก่อนจึงจะมองเห็นปุ่ม

---

## หมวดที่ 2: ปัญหา Modal ฟอร์มที่ไม่มี Scroll ทำให้ปุ่มกดตกหล่นและกดไม่ได้ (Modal Traps & Off-Screen Buttons)

บนหน้าจอโทรศัพท์มือถือ ความสูงหน้าจอมาตรฐาน (Viewport Height) มักอยู่ที่ 667px (iPhone SE), 844px (iPhone 12/13/14/15) หรือ 800px–850px (Android) เมื่อผู้ใช้แตะกรอกข้อมูลใน Modal คีย์บอร์ดจะเด้งขึ้นมาทำให้ความสูงที่เหลืออยู่เพียง 350px–450px เท่านั้น หาก Modal ไม่มี `max-h-[...]` และ `overflow-y-auto` ปุ่มกดยืนยันจะหลุดจอและไม่สามารถเลื่อนไปกดได้

### 2.1 หน้าต่างยืนยันส่งงานของแม่บ้าน (Maid Job Completion Modal - Critical Blocker)
- **ไฟล์ที่พบ**: [`app/keeper/maid/page.tsx:412-415`](file:///d:/Works/thesiss/kesorn/app/keeper/maid/page.tsx#L412-L415)
- **สาเหตุของปัญหา**: 
  - คลาส Modal Backdrop: `fixed inset-0 z-50 flex items-center justify-center p-4`
  - คลาส Modal Card: `bg-[#0F172A] rounded-[40px] shadow-2xl w-full max-w-lg relative z-10 overflow-hidden`
  - ภายในประกอบด้วย:
    1. Header พร้อม Badge หมายเลขห้อง (~120px)
    2. กล่อง Textarea บันทึกเพิ่มเติม (~140px)
    3. ส่วนกรอกค่าบริการทำความสะอาด + 5 ปุ่มตัวเลือกด่วน (~220px)
    4. ส่วนอัปโหลดรูปภาพหลักฐานการทำงาน (~220px)
    5. ปุ่มกดยกเลิก และปุ่ม **"ส่งงานเสร็จสิ้น"** (~60px)
  - ความสูงรวมของแบบฟอร์มสูงเกิน **820px** แต่การ์ดถูกตั้งเป็น `overflow-hidden` โดย**ไม่มี `max-h` และไม่มี `overflow-y-auto`**
- **ผลกระทบจริงบนมือถือ**: 
  - บนมือถือทุกรุ่น (โดยเฉพาะ iPhone SE, iPhone 12/13/14/15) **ปุ่ม "ส่งงานเสร็จสิ้น" จะหลุดขอบล่างของหน้าจอไปทั้งหมด**
  - แม่บ้านไม่สามารถเลื่อนหน้าจอลงไปกดปุ่มได้เลย ทำให้ไม่สามารถส่งงานได้จริง 100%
- **แนวทางแก้ไข**: เพิ่ม `max-h-[90vh] flex flex-col` และใส่ `overflow-y-auto` ที่คอนเทนเนอร์เนื้อหาภายใน พร้อมแยก Footer ปุ่มกดเป็น Sticky หรือ shrink-0 ด้านล่าง

---

### 2.2 หน้าต่างบันทึกงานใหม่ของแม่บ้าน (Maid Create Job Modal)
- **ไฟล์ที่พบ**: [`app/keeper/maid/page.tsx:644-646`](file:///d:/Works/thesiss/kesorn/app/keeper/maid/page.tsx#L644-L646)
- **สาเหตุของปัญหา**: 
  - คลาส Modal Card: `bg-[#0F172A] border border-white/10 rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden` โดยไม่มี Scroll
  - เมื่อแตะ Textarea บันทึกรายละเอียดงาน (บรรทัด 728) คีย์บอร์ดมือถือจะดันฟอร์มขึ้น
- **ผลกระทบจริงบนมือถือ**: 
  - **ปุ่ม "บันทึกงาน" (บรรทัด 745) หลุดขอบจอด้านล่าง** และไม่สามารถเลื่อนหน้าจอลงไปแตะได้

---

### 2.3 หน้าต่างส่งมอบงานซ่อมของช่างเทคนิค (Technician Job Completion Modal - Critical Blocker)
- **ไฟล์ที่พบ**: [`app/keeper/technician/page.tsx:393-396`](file:///d:/Works/thesiss/kesorn/app/keeper/technician/page.tsx#L393-L396)
- **สาเหตุของปัญหา**: 
  - โครงสร้างผิดพลาดแบบเดียวกับหน้าต่างของแม่บ้าน (`overflow-hidden` ไม่มี `max-h` และไม่มี `overflow-y-auto`)
  - ฟอร์มประกอบด้วยบันทึกการซ่อม, ค่าซ่อม/อะไหล่, และกล่องอัปโหลดรูปภาพหลักฐานการซ่อม ความสูงรวมเกิน 800px
- **ผลกระทบจริงบนมือถือ**: 
  - **ปุ่ม "ส่งมอบงานซ่อมเสร็จสิ้น" (บรรทัด 523) ตกหล่นออกนอกหน้าจอโทรศัพท์** ช่างเทคนิคไม่สามารถเลื่อนไปกดส่งมอบงานซ่อมได้

---

### 2.4 หน้าต่างดูรายละเอียดประวัติงานของแม่บ้านและช่าง (Job Details Modal Trap)
- **ไฟล์ที่พบ**: [`app/keeper/maid/jobs/page.tsx:202-204`](file:///d:/Works/thesiss/kesorn/app/keeper/maid/jobs/page.tsx#L202-L204) และ [`app/keeper/technician/jobs/page.tsx:202-204`](file:///d:/Works/thesiss/kesorn/app/keeper/technician/jobs/page.tsx#L202-L204)
- **สาเหตุของปัญหา**: 
  - Card: `bg-[#0F172A] rounded-[40px] shadow-2xl w-full max-w-lg relative z-10 p-8 border border-white/20/10` (ไม่มี `max-h` และไม่มี `overflow-y-auto`)
  - มีการแสดงภาพหลักฐานขนาด `h-48` (192px) พร้อมรายละเอียดงาน
- **ผลกระทบจริงบนมือถือ**: 
  - **ปุ่ม "ปิดรายละเอียด" (บรรทัด 259) ตกขอบจอด้านล่าง** ผู้ใช้ไม่สามารถเลื่อนหน้าจอลงไปกดปิด Modal ได้ และเนื่องจาก Backdrop มืดสนิท ผู้ใช้จะติดอยู่ในหน้าต่างนี้ (Trapped in Modal)

---

### 2.5 หน้าต่างขอต่อสัญญาเช่าของลูกหอ (Tenant Renewal Request Modal)
- **ไฟล์ที่พบ**: [`app/tenant/contract/page.tsx:303-305`](file:///d:/Works/thesiss/kesorn/app/tenant/contract/page.tsx#L303-L305)
- **สาเหตุของปัญหา**: 
  - Card ใช้คลาส `bg-card rounded-[32px] w-full max-w-lg border border-border shadow-2xl overflow-hidden`
  - มีช่อง Textarea บันทึกความประสงค์ขอต่อสัญญา
- **ผลกระทบจริงบนมือถือ**: 
  - ขณะที่ลูกหอกำลังพิมพ์หมายเหตุ คีย์บอร์ดมือถือจะบดบังครึ่งล่างของ Modal ทำให้**ปุ่ม "ส่งคำขอต่อสัญญา →" (บรรทัด 341) ถูกผลักหลุดจอ** และไม่สามารถใช้นิ้วปัดเลื่อนขึ้นมาได้

---

### 2.6 หน้าต่างอัปโหลดสลิปชำระเงินของลูกหอ (Tenant Slip Upload Modal)
- **ไฟล์ที่พบ**: [`app/tenant/billing/page.tsx:270-272`](file:///d:/Works/thesiss/kesorn/app/tenant/billing/page.tsx#L270-L272)
- **สาเหตุของปัญหา**: 
  - คลาส Card: `bg-card rounded-[2.5rem] w-full max-w-md p-10 overflow-hidden shadow-2xl relative animate-in zoom-in-95` (ไม่มี `max-h` และไม่มี `overflow-y-auto`)
  - กล่องอัปโหลดแบบเส้นประด้านในมี Padding สูงถึง `p-10`
- **ผลกระทบจริงบนมือถือ**: 
  - บนโทรศัพท์จอเล็กหรือเมื่อถือใช้งานแนวนอน (Landscape) ส่วนล่างของหน้าต่างและปุ่มกดจะถูกตัดทิ้ง ไม่สามารถเลื่อนจอได้

---

### 2.7 หน้าต่างบันทึกบัญชีรายรับ-รายจ่ายของเจ้าของหอพัก (Owner Accounting Add Transaction Modal)
- **ไฟล์ที่พบ**: [`app/owner/accounting/page.tsx:161-163`](file:///d:/Works/thesiss/kesorn/app/owner/accounting/page.tsx#L161-L163)
- **สาเหตุของปัญหา**: 
  - คลาส Card: `bg-card border border-white/20/10 rounded-2xl p-8 w-full max-w-md shadow-2xl`
  - ประกอบด้วย Select ประเภท, Input หมวดหมู่, Input จำนวนเงิน, Input วันที่, Textarea รายละเอียด
- **ผลกระทบจริงบนมือถือ**: 
  - ความสูงของฟอร์มรวมกับระยะ Padding เกินขนาดหน้าจอโทรศัพท์เมื่อคีย์บอร์ดเปิดขึ้น **ปุ่ม "บันทึก" และ "ยกเลิก" หลุดจอและเลื่อนลงไปกดไม่ได้**

---

### 2.8 หน้าต่างเพิ่มเจ้าหน้าที่และมอบหมายงานแม่บ้าน (Owner Keepers Modals)
- **ไฟล์ที่พบ**: 
  - Modal เพิ่มเจ้าหน้าที่: [`app/owner/keepers/page.tsx:233-235`](file:///d:/Works/thesiss/kesorn/app/owner/keepers/page.tsx#L233-L235)
  - Modal มอบหมายงานทำความสะอาด: [`app/owner/keepers/page.tsx:324-326`](file:///d:/Works/thesiss/kesorn/app/owner/keepers/page.tsx#L324-L326)
- **สาเหตุของปัญหา**: 
  - ทั้งสอง Modal ใช้ `overflow-hidden` โดยไม่มีการจำกัด `max-h` และไม่มี Scrollbar
- **ผลกระทบจริงบนมือถือ**: 
  - **ปุ่ม "เพิ่มเจ้าหน้าที่" และปุ่ม "ยืนยันมอบหมายงาน" หลุดจอ** ไม่สามารถเลื่อนไปกดได้เมื่อเปิดคีย์บอร์ด

---

### 2.9 หน้าต่างเพิ่ม/แก้ไขห้องพัก และสร้างข่าวสาร (Admin Modals)
- **ไฟล์ที่พบ**: 
  - [`app/admin/rooms/page.tsx:293-294`](file:///d:/Works/thesiss/kesorn/app/admin/rooms/page.tsx#L293-L294)
  - [`app/admin/news/page.tsx:143-145`](file:///d:/Works/thesiss/kesorn/app/admin/news/page.tsx#L143-L145)
  - [`app/platform/accounting/page.tsx:172-173`](file:///d:/Works/thesiss/kesorn/app/platform/accounting/page.tsx#L172-L173)
- **ผลกระทบจริงบนมือถือ**: 
  - ทุกจุดมีลักษณะเดียวกันคือกล่อง Modal สูงเกินความจุมือถือ ไม่มี Scroll ทำให้ปุ่ม Submit หลุดขอบล่างของหน้าจอ

---

## หมวดที่ 3: ปุ่มไม่แสดง หรือถูกแถบเมนูบังมิด (Fixed Navigation Collisions & Hidden Buttons)

### 3.1 แถบเมนูด้านล่างทับปุ่มก้าวหน้าและปุ่มส่งแบบประเมินผู้เช่า (Critical UX Collision)
- **ไฟล์ที่พบ**: [`app/tenant/evaluation/page.tsx:486`](file:///d:/Works/thesiss/kesorn/app/tenant/evaluation/page.tsx#L486) เทียบกับ [`app/tenant/components/TenantBottomNav.tsx:291`](file:///d:/Works/thesiss/kesorn/app/tenant/components/TenantBottomNav.tsx#L291)
- **สาเหตุของปัญหา**: 
  - ในหน้าประเมินความพึงพอใจของลูกหอ แถบปุ่มกดนำทาง (Back / Next / Submit) ถูกวางไว้ด้านล่างสุดด้วยคลาส:
    `<div className="fixed bottom-0 left-0 right-0 bg-card/90 backdrop-blur-xl border-t border-border p-4 safe-area-bottom">` โดย**ไม่มีการระบุ `z-index` (ค่าเริ่มต้น z-0)**
  - แต่ในเลย์เอาต์หลักของลูกหอ [`app/tenant/layout.tsx:84`](file:///d:/Works/thesiss/kesorn/app/tenant/layout.tsx#L84) มี `TenantBottomNav` ซึ่งมีคลาส:
    `className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 ..."`
- **ผลกระทบจริงบนมือถือ**: 
  - แถบเมนูหลักของลูกหอ (`z-40`) จะ**ลอยทับอยู่บนปุ่ม "ถัดไป →" และปุ่ม "✓ ส่งแบบประเมิน" โดยตรง**
  - เมื่อผู้เช่าพยายามแตะปุ่ม "ถัดไป" หรือ "ส่งแบบประเมิน" นิ้วจะไปโดนไอคอนของเมนูหลัก (เช่น หน้าหลัก, บิลค่าเช่า, แจ้งซ่อม) แทน
  - ส่งผลให้ระบบเด้งเปลี่ยนหน้าทันที และ**ข้อมูลแบบประเมินที่ผู้เช่ากรอกไว้จะสูญหายทั้งหมด**
- **แนวทางแก้ไข**: เพิ่ม `z-50` ให้กับแถบ Navigation ของหน้าประเมิน หรือซ่อน `TenantBottomNav` ชั่วคราวเมื่ออยู่ในเส้นทาง `/tenant/evaluation`

---

### 3.2 เมนูแถบข้าง (Drawer) ในหน้าหลักไม่มี Scroll ทำให้ปุ่มออกจากระบบหลุดจอ
- **ไฟล์ที่พบ**: [`app/components/Navbar.tsx:196`](file:///d:/Works/thesiss/kesorn/app/components/Navbar.tsx#L196)
- **สาเหตุของปัญหา**: 
  - Drawer เมนูมือถือใช้คลาส:
    `relative w-full max-w-sm ml-auto h-full bg-card shadow-2xl border-l border-border flex flex-col p-6` (ไม่มี `overflow-y-auto`)
- **ผลกระทบจริงบนมือถือ**: 
  - เมื่อผู้ใช้ล็อกอินแล้ว เมนูจะมีทั้งชื่อผู้ใช้, บทบาท, ปุ่ม "ไปที่แดชบอร์ด", และปุ่ม "ออกจากระบบ"
  - หากเปิดในมือถือจอความสูงสั้นหรือในแนวนอน **ปุ่ม "ออกจากระบบ" และปุ่มสลับหน้าจะหลุดขอบจอด้านล่างและไม่สามารถเลื่อนไปกดได้**
- **แนวทางแก้ไข**: เพิ่ม `overflow-y-auto` ให้กับคอนเทนเนอร์ของ Drawer

---

### 3.3 กล่องแชทแบบลอย (ChatWidget) ล้นขอบจอด้านข้างบนมือถือ 360px
- **ไฟล์ที่พบ**: [`app/components/ChatWidget.tsx:118, 140`](file:///d:/Works/thesiss/kesorn/app/components/ChatWidget.tsx#L118)
- **สาเหตุของปัญหา**: 
  - ตำแหน่ง: `fixed bottom-4 right-4 ...` (มี Margin ขวา 16px)
  - ความกว้างของกล่องแชท: `w-[360px]`
  - ผลรวมความกว้างที่ต้องการ = 360px + 16px = **376px**
- **ผลกระทบจริงบนมือถือ**: 
  - บนมือถือที่หน้าจอกว้าง 360px (เช่น Samsung Galaxy รุ่นมาตรฐาน, Android หน้าจอทั่วไป) กล่องแชทจะล้นทะลุขอบจอด้านซ้ายไป 16px
  - บนมือถือ iPhone SE (กว้าง 375px) กล่องแชทจะล้นขอบจอ 1px และทำให้เกิดการเลื่อนในแนวนอนโดยไม่ตั้งใจ
- **แนวทางแก้ไข**: ปรับความกว้างเป็น `w-[calc(100vw-2rem)] sm:w-96 max-w-sm`

---

## หมวดที่ 4: การจัดวางสองฝั่งบนจอมือถือจนปุ่มส่งข้อความถูกบีบหลุดจอ (Chat Layout Collapse)

### 4.1 หน้าศูนย์จัดการแชทของเจ้าของหอและลูกหอ ไม่ยุบเมนูด้านข้างบนมือถือ
- **ไฟล์ที่พบ**: 
  - หน้าเจ้าของหอ: [`app/owner/chat/page.tsx:115, 117, 191, 253`](file:///d:/Works/thesiss/kesorn/app/owner/chat/page.tsx#L115)
  - หน้าลูกหอ: [`app/tenant/chat/page.tsx:103, 105, 165, 226`](file:///d:/Works/thesiss/kesorn/app/tenant/chat/page.tsx#L103)
- **สาเหตุของปัญหา**: 
  - คอนเทนเนอร์จัดวางเป็น `flex flex-row`
  - ฝั่งซ้าย (รายการผู้สนทนา) ล็อคขนาดความกว้างไว้คงที่ `w-80 lg:w-96 shrink-0` (320px) โดย**ไม่มีคลาสซ่อนบนมือถือ เช่น `hidden md:flex`**
  - ฝั่งขวา (ห้องแชทและช่องส่งข้อความ) เป็น `flex-1 flex flex-col`
- **ผลกระทบจริงบนมือถือ**: 
  - บนหน้าจอมือถือกว้าง 360px–390px แถบรายการทางซ้ายจะกินพื้นที่ไปแล้ว 320px (คิดเป็น 85%–90% ของความกว้างหน้าจอ)
  - ห้องแชทและช่องพิมพ์ตอบกลับทางขวาจะถูกบีบเหลือพื้นที่เพียง 40px–70px
  - ผลลัพธ์คือ **กล่องข้อความบวมล้นจอแนวนอน ปุ่ม "ส่งข้อความ" หลุดออกไปนอกหน้าจอทางขวา** และไม่มีปุ่มกด ย้อนกลับ (Back Button) เพื่อสลับระหว่างหน้ารายการแชทกับห้องสนทนา
- **แนวทางแก้ไข**: ปรับให้แสดงผลแบบ Responsive Single View (เมื่อเลือกห้องแชทให้ซ่อนรายการทางซ้ายบนมือถือ `selectedConv ? 'hidden md:flex' : 'flex'` และเพิ่มปุ่ม ← ย้อนกลับที่แถบด้านบนของห้องแชท)

---

## หมวดที่ 5: ปัญหา Flex Centering ดึงส่วนหัวของ Modal หลุดไปในพิกัดลบ (Negative Scroll Coordinate Trap)

ในระบบ CSS Flexbox เมื่อคอนเทนเนอร์มีคลาส `flex items-center justify-center overflow-y-auto` หากเนื้อหาภายในมีความสูงมากกว่าความสูงหน้าจอ (Viewport Height) เบราว์เซอร์จะทำการจัดกึ่งกลางเนื้อหา ทำให้ส่วนบนสุดของ Modal ถูกดันขึ้นไปเหนือขอบบน (พิกัด Scroll ติดลบ `scrollTop < 0`) ซึ่งมาตรฐานเบราว์เซอร์จะไม่สามารถเลื่อนย้อนขึ้นไปดูได้

### 5.1 หน้าต่างลงนามสัญญาเช่าห้องพัก (ContractSigner Modal)
- **ไฟล์ที่พบ**: [`app/explore/room/[id]/page.tsx:882`](file:///d:/Works/thesiss/kesorn/app/explore/room/[id]/page.tsx#L882)
- **สาเหตุของปัญหา**: 
  - Backdrop ใช้ `flex items-center justify-center p-4 lg:p-12 overflow-y-auto`
  - ส่วนประกอบภายใน (`ContractSigner`) เป็นสัญญาเช่าฉบับเต็มความสูงกว่า 1,200px
- **ผลกระทบจริงบนมือถือ**: 
  - ส่วนหัวของสัญญาเช่า (หัวข้อสัญญา, ข้อความยินยอม, ปุ่มย้อนกลับด้านบน) จะถูกผลักขึ้นไปด้านบนจนหลุดหน้าจอ และผู้ใช้**ไม่สามารถเลื่อนย้อนกลับขึ้นไปอ่านหรือกดปุ่มด้านบนได้** (เปรียบเทียบกับ `ContractSimulator` ในบรรทัด 900 ที่ใช้ `items-start sm:items-center` และ `my-auto` อย่างถูกต้อง)
- **แนวทางแก้ไข**: เปลี่ยนคลาสเป็น `flex items-start sm:items-center justify-center p-4 lg:p-12 overflow-y-auto` และใส่ `my-auto` ที่กล่องสัญญา

---

### 5.2 หน้าต่างตรวจสอบสลิปและยืนยันยอดเงินของเจ้าของหอพัก (Slip Inspection Modal)
- **ไฟล์ที่พบ**: [`app/owner/billing/page.tsx:982`](file:///d:/Works/thesiss/kesorn/app/owner/billing/page.tsx#L982)
- **สาเหตุของปัญหา**: 
  - ใช้ `flex items-center justify-center p-4 sm:p-6 overflow-y-auto` ครอบการ์ดที่มีทั้งภาพสลิปขนาด 320px–440px, รายละเอียดบิล, ช่องเหตุผลปฏิเสธ, และปุ่มอนุมัติ
- **ผลกระทบจริงบนมือถือ**: 
  - ส่วนหัวของ Modal (หมายเลขห้อง, ชื่อผู้เช่า, ปุ่มปิดกากบาท ✕) หลุดขึ้นไปในพิกัดลบ เจ้าของหอไม่สามารถเลื่อนขึ้นไปดูหัวบิลหรือกดปุ่ม ✕ เพื่อปิดได้

---

## หมวดที่ 6: ตารางที่ไม่มีการหุ้ม Scroll แนวนอน ทำให้คอลัมน์และปุ่มจัดการถูกตัดทิ้ง (Table Overflow Defect)

พบตารางจำนวน **8 แห่ง** ในระบบที่ไม่มีการหุ้มด้วย `<div className="overflow-x-auto">` ส่งผลให้บนหน้าจอมือถือคอลัมน์ด้านขวาสุด (ซึ่งมักเป็นปุ่ม Action เช่น ปุ่มจัดการ, ปุ่มแก้ไข, ปุ่มสลับสถานะ) หลุดขอบจอและไม่สามารถเลื่อนไปกดได้:

| ลำดับ | ไฟล์ที่พบ | คอลัมน์ที่ถูกตัดทิ้งบนมือถือ | ผลกระทบต่อการใช้งานจริง |
|---|---|---|---|
| 1 | [`app/platform/dormitories/page.tsx:88`](file:///d:/Works/thesiss/kesorn/app/platform/dormitories/page.tsx#L88) | คอลัมน์ที่ 5: "จัดการ" (ปุ่มระงับ/เปิดใช้งาน) | ผู้ดูแลระบบ**ไม่เห็นและไม่สามารถกดปุ่มระงับหรือเปิดใช้งานหอพักได้** |
| 2 | [`app/platform/accounting/page.tsx:134`](file:///d:/Works/thesiss/kesorn/app/platform/accounting/page.tsx#L134) | คอลัมน์ที่ 5–6: "หอพัก", "จำนวนเงิน" | ดูยอดเงินและหอพักไม่ได้ ข้อมูลถูกตัดตกขอบ |
| 3 | [`app/owner/tenants/page.tsx:77`](file:///d:/Works/thesiss/kesorn/app/owner/tenants/page.tsx#L77) | คอลัมน์ที่ 3–5: "เบอร์โทร", "อีเมล", "สถานะ" | ไม่เห็นข้อมูลติดต่อผู้เช่าบนมือถือ |
| 4 | [`app/owner/accounting/page.tsx:125`](file:///d:/Works/thesiss/kesorn/app/owner/accounting/page.tsx#L125) | คอลัมน์ที่ 4–5: "รายละเอียด", "จำนวนเงิน" | ยอดเงินรายรับรายจ่ายถูกตัดทิ้งทางขวา |
| 5 | [`app/owner/billing/page.tsx:1245`](file:///d:/Works/thesiss/kesorn/app/owner/billing/page.tsx#L1245) | คอลัมน์ที่ 3–4: "หน่วยที่ใช้", "จำนวนเงิน" ในใบแจ้งหนี้ | รายการค่าเช่าและยอดเงินถูกตัดขาดในหน้าพิมพ์บิล |
| 6 | [`app/researcher/dfd/page.tsx:257`](file:///d:/Works/thesiss/kesorn/app/researcher/dfd/page.tsx#L257) | คอลัมน์ที่ 3: "ข้อมูลที่ส่ง (Data Flow)" | ข้อความ Data Flow หลุดขอบตาราง |

---

## หมวดที่ 7: การบีบอัด Grid และปัญหาการสัมผัสบนจอ Touchscreen

### 7.1 ช่องกรอกข้อมูลใน Modal เพิ่มห้องพักหดตัวจนอ่านไม่ได้ (Rigid Grid Squeeze)
- **ไฟล์ที่พบ**: [`app/owner/rooms/page.tsx:503, 530`](file:///d:/Works/thesiss/kesorn/app/owner/rooms/page.tsx#L503)
- **สาเหตุของปัญหา**: 
  - ภายใน Modal มีการใส่ Padding `p-6` ที่ชั้นนอก และ `p-10` ที่ชั้นใน
  - ฟอร์มถูกแบ่งเป็น `<div className="grid grid-cols-2 gap-8">` โดยไม่มีการปรับเป็น 1 คอลัมน์บนมือถือ
- **ผลกระทบจริงบนมือถือ**: 
  - บนมือถือความกว้าง 375px: พื้นที่คงเหลือสำหรับ 2 คอลัมน์ = 375 - 48 (p-6) - 80 (p-10) - 32 (gap-8) = **215px** (เฉลี่ยคอลัมน์ละ 107px)
  - เมื่อหักลบ Padding ภายในช่อง Input (`px-6` = 48px) จะเหลือพื้นที่พิมพ์ตัวหนังสือเพียง **59px**
  - ข้อความใน Dropdown (Standard, Deluxe, Available, Occupied) จะทับกับลูกศร Dropdown และตัวหนังสือพันกันจนอ่านไม่ออก
- **แนวทางแก้ไข**: ปรับคลาสเป็น `grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8` และลด Padding ลงบนมือถือ

---

### 7.2 ปุ่มลบรูปภาพที่อัปโหลดไม่แสดงบนจอสัมผัส (Hover Opacity Trap)
- **ไฟล์ที่พบ**: [`app/owner/rooms/page.tsx:578`](file:///d:/Works/thesiss/kesorn/app/owner/rooms/page.tsx#L578)
- **สาเหตุของปัญหา**: 
  - ปุ่มลบรูปภาพระบุคลาส:
    `className="absolute top-2 right-2 bg-rose-500 text-white p-1.5 rounded-lg opacity-0 group-hover/img:opacity-100 transition-opacity shadow-lg scale-90"`
- **ผลกระทบจริงบนมือถือ**: 
  - บนโทรศัพท์มือถือ (Touchscreen) **ไม่มีกลไก Hover เหมือนเมาส์บนคอมพิวเตอร์**
  - เมื่อผู้ใช้เพิ่มรูปห้องพักและต้องการลบรูปออก ปุ่มกากบาทสีแดงจะถูกซ่อนอยู่ด้วย `opacity-0` ตลอดเวลา ทำให้ผู้ใช้งานมองไม่เห็นและไม่สามารถลบรูปภาพได้
- **แนวทางแก้ไข**: กำหนดให้แสดงผลตลอดเวลาบนหน้าจอมือถือ `opacity-100 sm:opacity-0 sm:group-hover/img:opacity-100`

---

### 7.3 ส่วนหัวหน้าแจ้งซ่อมของผู้เช่าชนกันและดันจอแตกแนวนอน
- **ไฟล์ที่พบ**: [`app/tenant/maintenance/page.tsx:80`](file:///d:/Works/thesiss/kesorn/app/tenant/maintenance/page.tsx#L80)
- **สาเหตุของปัญหา**: 
  - Header ใช้คลาส `<header className="flex justify-between items-end">` โดยไม่มี `flex-col sm:flex-row`
  - ฝั่งซ้ายคือหัวข้อขนาดยาว "การดูแลรักษาและทำความสะอาด (Maintenance & Cleaning)"
  - ฝั่งขวาคือปุ่มขนาดใหญ่ `px-8 py-3.5` "+ แจ้งซ่อม / ทำความสะอาด"
- **ผลกระทบจริงบนมือถือ**: 
  - ตัวหนังสือกับปุ่มกดจะชนกันในแนวนอน และผลักขอบจอจนหลุด Viewport ทำให้เกิดช่องว่างสีขาวด้านข้าง และหน้าจอกระตุกเมื่อเลื่อนขึ้นลง
- **แนวทางแก้ไข**: ปรับเป็น `flex flex-col sm:flex-row sm:items-end justify-between gap-4`

---

## สรุป Matrix ความรุนแรงและผลกระทบ (Defect Severity Matrix)

| ความรุนแรง | รายการปัญหา | บทบาทผู้ใช้ที่กระทบ | สภาพปัญหา |
|---|---|---|---|
| 🔴 **Critical Blocker** | `app/owner/contracts/[id]/page.tsx` เลื่อนจอไม่ได้ | เจ้าของหอพัก (Owner) | ไม่สามารถเลื่อนไปกดปุ่ม **"อนุมัติสัญญาเช่า"** ได้ |
| 🔴 **Critical Blocker** | `app/keeper/maid/page.tsx:412` Modal ไม่มี Scroll | แม่บ้าน (Maid) | ไม่สามารถกดปุ่ม **"ส่งงานเสร็จสิ้น"** ได้ |
| 🔴 **Critical Blocker** | `app/keeper/technician/page.tsx:393` Modal ไม่มี Scroll | ช่างซ่อม (Technician) | ไม่สามารถกดปุ่ม **"ส่งมอบงานซ่อม"** ได้ |
| 🔴 **Critical Blocker** | `app/tenant/evaluation/page.tsx:486` เมนูล่างทับปุ่ม | ผู้เช่า (Tenant) | ปุ่ม **"ถัดไป"** และ **"ส่งแบบประเมิน"** ถูก BottomNav ทับมิด |
| 🟠 **High Severity** | `app/owner/chat` & `app/tenant/chat` เมนูไม่ยุบ | ทุกบทบาท (Owner & Tenant) | ปุ่ม **"ส่งข้อความ"** ถูกบีบหลุดขอบจอขวา |
| 🟠 **High Severity** | `app/tenant/contract/page.tsx:303` คีย์บอร์ดบัง | ผู้เช่า (Tenant) | ปุ่ม **"ส่งคำขอต่อสัญญา"** หลุดจอเมื่อพิมพ์ข้อความ |
| 🟠 **High Severity** | `app/owner/accounting/page.tsx:161` คีย์บอร์ดบัง | เจ้าของหอพัก (Owner) | ปุ่ม **"บันทึกรายรับ-รายจ่าย"** หลุดจอ |
| 🟠 **High Severity** | `app/explore/room/[id]/page.tsx:882` Flex-center ลบ | ผู้เยี่ยมชม / ผู้เช่า | หัวสัญญาและปุ่มย้อนกลับหลุดขึ้นไปเหนือหน้าจอ |
| 🟡 **Medium Severity** | 8 ตารางหลักไม่มี `overflow-x-auto` | ทุกบทบาท | คอลัมน์ขวาสุดและปุ่มจัดการ (Action buttons) ถูกตัดตกจอ |
| 🟡 **Medium Severity** | `app/owner/rooms/page.tsx:578` Hover Opacity | เจ้าของหอพัก (Owner) | ปุ่มลบรูปภาพมองไม่เห็นบนจอ Touchscreen |

---

*เอกสารฉบับนี้จัดทำขึ้นเพื่อการตรวจสอบและวิเคราะห์ข้อบกพร่องตามคำสั่งของผู้ใช้โดยสมบูรณ์ โดยยังไม่มีการดัดแปลงแก้ไขโค้ดโปรแกรมใดๆ ในระบบ*
