export interface UpdateTask {
  id: string;
  title: string;
  category: 'Feature' | 'Fix' | 'Design' | 'Performance' | 'Security';
  details: string[];
}

export interface DailyUpdate {
  date: string;
  version?: string;
  tagline: string;
  isLatest?: boolean;
  tasks: UpdateTask[];
}

export const SYSTEM_UPDATES: DailyUpdate[] = [
  {
    date: '26 กันยายน 2026',
    version: 'v2.7.0',
    tagline: 'ระบบจัดการ Google Gemini API Key สำหรับอ่านมิเตอร์ด้วยตนเอง, ตรวจสอบและแก้ไขข้อผิดพลาดทั้งระบบ (100% Pass), ปรับปรุงความถูกต้องตามข้อมูลจริงหอพักเกษร 2 และเพิ่มการสำรองระบบ AI สแกนมิเตอร์ 3 ระดับ',
    isLatest: true,
    tasks: [
      {
        id: '2026-09-26-1',
        title: 'ระบบให้เจ้าของหอพักเปลี่ยนและทดสอบ Google Gemini API Key สำหรับอ่านมิเตอร์ด้วยตนเอง (Self-Service OCR Key)',
        category: 'Feature',
        details: [
          'เพิ่มปุ่ม "🔑 ตั้งค่า AI Key" พร้อมไฟสถานะบนแถบเมนูหน้าจดมิเตอร์ (/owner/meters)',
          'เพิ่มการ์ด "ระบบ AI สแกนอ่านมิเตอร์น้ำ-ไฟ (Meter OCR AI Key)" ในหน้าตั้งค่าหอพัก (/owner/settings)',
          'พัฒนา API POST /api/owner/meters/ocr/test-key เชื่อมต่อทดสอบกับโมเดล gemini-2.0-flash แบบเรียลไทม์ พร้อมแจ้งเตือนผลลัพธ์ทันที',
          'พัฒนา API GET/POST /api/owner/meters/ocr/key จัดเก็บ API Key ในตาราง dormitory_profile และผูกเข้ากับระบบสแกนมิเตอร์อัตโนมัติ',
          'เพิ่มคำแนะนำ 4 ขั้นตอนและลิงก์ตรงไปยัง Google AI Studio เพื่อขอรับ API Key ฟรี (โควต้า 1,500 ครั้ง/วัน)',
          'เพิ่ม Badge แสดงผลในกล้องสแกนมิเตอร์ (CameraMeterModal) ระบุชัดเจนว่าอ่านด้วย Gemini AI (คีย์ส่วนตัว/ระบบกลาง) หรือ Tesseract OCR'
        ]
      },
      {
        id: '2026-09-26-2',
        title: 'ตรวจสอบระบบเชิงลึกและแก้ไขข้อผิดพลาดสำคัญ 7 จุด (Deep System Audit & Bug Fixes)',
        category: 'Fix',
        details: [
          'แก้ไข bills.status จาก ENUM เป็น VARCHAR(50) รองรับสถานะ Pending ป้องกัน Error 500 เวลาผู้เช่าส่งสลิปชำระเงิน',
          'แก้ไข maintenance_requests.status ให้รองรับทั้ง In Progress และ InProgress จากฟอร์มหน้าเว็บ',
          'แก้ไข app/api/owner/maintenance/[id]/route.ts โดยตัด PostgreSQL RETURNING * ออกและใช้มาตรฐาน MariaDB/MySQL',
          'แก้ไข Keeper API Routes (maid/jobs และ technician/jobs) รองรับทั้ง PUT และ PATCH ป้องกัน HTTP 405 Method Not Allowed',
          'เพิ่มคอลัมน์ notes และ photo_url ในตาราง maintenance_requests รองรับการปิดงานของช่าง',
          'เพิ่มคอลัมน์ dorm_id ในตาราง bills และ desired_date ในตาราง move_out_requests',
          'ผ่านการทดสอบแบบ End-to-End ครบถ้วน 63/63 รายการ (100% Pass) และการทดสอบ Write Operations ครบ 15/15 รายการ (100% Pass)'
        ]
      },
      {
        id: '2026-09-26-3',
        title: 'ปรับปรุงข้อมูลหอพักและห้องพักให้ตรงตามข้อมูลจริงของหอพักเกษร 2 (หน้า ม.พะเยา)',
        category: 'Design',
        details: [
          'ปรับปรุงข้อมูลการติดต่อ: เบอร์โทร 082-985-3519, ค่าไฟ ฿6/หน่วย, ค่าน้ำฟรี, ค่าเช่า ฿2,800 - ฿3,100/เดือน',
          'จัดโครงสร้างห้องพัก 20 ห้อง (ชั้น 1 และ ชั้น 2) และนำเข้ารูปถ่ายจริงของหอพักเกษร 2 เข้าสู่ระบบแกลเลอรี',
          'ผูกภาพหลักฐานการอ่านมิเตอร์จริงและป้ายกำกับหน่วยมิเตอร์เข้าสู่ระบบอัตโนมัติ'
        ]
      },
      {
        id: '2026-09-26-4',
        title: 'ระบบสำรองการอ่านมิเตอร์ 3 ระดับ (Triple-Tier OCR Fallback)',
        category: 'Performance',
        details: [
          'ระดับ 1: ใช้งาน Google Gemini Vision ด้วย API Key ส่วนตัวของเจ้าของหอ',
          'ระดับ 2: สำรองด้วย Google Gemini Vision ระบบส่วนกลางของเซิร์ฟเวอร์',
          'ระดับ 3: สำรองด้วย Dual-Pass Tesseract OCR ภายในเครื่อง สามารถอ่านมิเตอร์ได้แบบออฟไลน์ 100% โดยไม่ต้องใช้อินเทอร์เน็ต'
        ]
      }
    ]
  },
  {
    date: '25 กันยายน 2026',
    version: 'v2.6.2',
    tagline: 'ปรับปรุงโครงสร้างค่าสาธารณูปโภค (ไฟ 7 บาท/หน่วย, น้ำเหมาจ่าย 100 บาท/เดือน), ถอดระบบจดมิเตอร์น้ำ, สร้าง DFD & สถาปัตยกรรมระบบในแดชบอร์ด Researcher, ปรับฐานข้อมูลห้องพัก 20 ห้อง (แอร์/พัดลม) และระบบบัญชีตามบทบาท',
    isLatest: false,
    tasks: [
      {
        id: '2026-09-25-1',
        title: 'ปรับโครงสร้างอัตราค่าสาธารณูปโภค: ค่าไฟหน่วยละ 7 บาท และค่าน้ำเหมาจ่าย 100 บาท/เดือน',
        category: 'Feature',
        details: [
          'อัปเดตอัตราค่าบริการในฐานข้อมูล dormitory_profile: electricity_rate = 7.00 และ water_rate = 100.00',
          'ปรับปรุงหน้าแรก (app/page.tsx), หน้ารายละเอียดหอพัก (/explore/[dormId]) และหน้ารายละเอียดห้องพัก (/explore/room/[id]) ให้แสดงค่าไฟ ฿7 / ยูนิต และค่าน้ำ ฿100 / เดือน (เหมาจ่าย)',
          'ปรับปรุงหน้าตั้งค่าหอพัก (/owner/settings) ให้ระบุป้ายกำกับค่าน้ำเหมาจ่ายชัดเจน'
        ]
      },
      {
        id: '2026-09-25-2',
        title: 'ยกเลิกระบบจดมิเตอร์น้ำประปา และปรับเป็นระบบจดมิเตอร์ไฟฟ้าเฉพาะ',
        category: 'Feature',
        details: [
          'ปรับหน้าจดมิเตอร์ (/owner/meters) เป็น "ระบบจดมิเตอร์ไฟฟ้า" พร้อมแท็กกำกับค่าน้ำประปาเหมาจ่าย 100 บาท/เดือน',
          'นำช่องกรอกมิเตอร์น้ำและกล้องสแกนมิเตอร์น้ำออกจากทั้ง Single Modal และ Batch Modal (ทั้งบน Mobile Drawer และ Desktop Table)',
          'ปรับปรุงการคำนวณและออกใบแจ้งหนี้อัตโนมัติ (/owner/billing และ /api/owner/billing/batch) ให้กำหนดค่าน้ำเหมาจ่าย 100 บาทในทุกบิลโดยอัตโนมัติ'
        ]
      },
      {
        id: '2026-09-25-3',
        title: 'เพิ่มแดชบอร์ด Data Flow Diagrams (DFD) และเอกสารวิเคราะห์ระบบสำหรับผู้วิจัย (/researcher/dfd)',
        category: 'Feature',
        details: [
          'พัฒนาหน้า /researcher/dfd แสดงแผนภาพกระแสข้อมูลครบ 3 ระดับ: Context Diagram (Level 0), DFD Level 1 (6 ขบวนการหลัก) และ DFD Level 2 (ระบบย่อย 1.0 - 6.0)',
          'แสดงผลแผนภาพด้วย Interactive Mermaid Renderer รองรับการดูผัง, ดูคำอธิบาย Data Flow, Data Store, External Entities และปุ่มคัดลอกโค้ด Mermaid ไปใช้ในเล่มวิทยานิพนธ์',
          'เชื่อมต่อการ์ดทางลัดและสถิติเข้ากับแดชบอร์ดหลักของผู้วิจัย (/researcher)'
        ]
      },
      {
        id: '2026-09-25-4',
        title: 'สร้างและจัดเรียงข้อมูลห้องพัก 20 ห้อง (1-20) แบ่งชั้น 1 และชั้น 2 พร้อมประเภทห้องแอร์และพัดลม',
        category: 'Feature',
        details: [
          'จัดโครงสร้างห้องพักเลขที่ 1-20 ในฐานข้อมูล kesorn_db โดยห้อง 1-10 อยู่ชั้น 1 และห้อง 11-20 อยู่ชั้น 2',
          'กำหนดประเภทห้องพัก: ห้องแอร์ (ห้อง 1-5 และ 11-15) และห้องพัดลม (ห้อง 6-10 และ 16-20)',
          'ปรับปรุงหน้าแสดงรายการห้องพัก (/owner/rooms) ให้เรียงลำดับตามหมายเลขห้อง 1-20 อย่างถูกต้อง (Natural Sort 1, 2, ..., 10, 11, ... แทน Alphabetical Sort)'
        ]
      },
      {
        id: '2026-09-25-5',
        title: 'เพิ่มและตรวจสอบบัญชีผู้ใช้งานทดสอบครบทุกบทบาท (Multi-role Test Accounts)',
        category: 'Security',
        details: [
          'สร้างและตั้งค่าบัญชีล็อกอินด้วยชื่อบทบาทและรหัสผ่านตรงกับบทบาทเพื่อความสะดวกในการทดสอบระบบ: admin/admin, owner/owner, tenant/tenant, maid/maid, tech/tech, researcher/researcher, guest/guest',
          'รองรับการล็อกอินผ่าน /signin เข้าถึงสิทธิ์และฟังก์ชันของแต่ละบทบาทได้อย่างสมบูรณ์'
        ]
      },
      {
        id: '2026-09-25-6',
        title: 'ตรวจสอบและจัดระเบียบโครงสร้างโค้ด พร้อมรันระบบผ่าน Node Server พอร์ต 3001',
        category: 'Performance',
        details: [
          'ตรวจสอบไฟล์ที่ไม่ใช้งานและคลีนโค้ดส่วนเกินในโปรเจกต์',
          'คอมไพล์ระบบด้วย Next.js Webpack Build สมบูรณ์ 100% ปราศจากข้อผิดพลาด',
          'รันบริการเซิร์ฟเวอร์แบบเสถียรบนพอร์ต 3001'
        ]
      }
    ]
  },
  {
    date: '16 กันยายน 2026',
    version: 'v2.6.1',
    tagline: 'ระบบแจ้งเตือนการจองห้องพักสำหรับเจ้าของหอ, แผนที่ปักหมุด Interactive Google Maps บนหน้า Explore, ปรับปรุงคอนทราสต์ธีมสว่าง และระบบสร้าง Git Tag อัตโนมัติ',
    isLatest: false,
    tasks: [
      {
        id: '2026-09-16-1',
        title: 'ระบบแจ้งเตือนเจ้าของหอพักเมื่อมีการจองห้องพัก พร้อมเมนู "รายการจองห้อง"',
        category: 'Feature',
        details: [
          'ส่งการแจ้งเตือนอัตโนมัติเข้าตาราง notifications ถึงเจ้าของหอพักทันทีที่ผู้เช่าส่งคำขอจองห้องพร้อมแนบสลิปมัดจำ',
          'เพิ่มเมนู "รายการจองห้อง" (🛎️) บน Sidebar และ Drawer ของเจ้าของหอพัก สามารถคลิกจากกระดิ่งแจ้งเตือนไปยังหน้าตรวจสอบได้ทันที (/owner/bookings)',
          'ปรับปรุง API สถิติ (/api/owner/stats) ให้นับคำขอจองห้องค้างตรวจ (PendingOwnerSignature) ถูกต้องเรียลไทม์'
        ]
      },
      {
        id: '2026-09-16-2',
        title: 'แสดงแผนที่และพิกัดปักหมุดแบบโต้ตอบ (Interactive Pinned Map) บนหน้าหอพัก Explore',
        category: 'Feature',
        details: [
          'ฝังกรอบแผนที่ Google Maps แบบโต้ตอบ (iframe) แสดงตำแหน่งพิกัดปักหมุดจริงของหอพักบนหน้ารายละเอียดหอพัก (/explore/[dormId]) และหน้าจองห้องพัก (/explore/room/[id])',
          'เพิ่มปุ่ม "🧭 ขอเส้นทางนำทาง" เชื่อมตรงเข้าแอป Google Maps นำทางมายังหอพักได้ทันที 1-Click',
          'เพิ่มช่องกรอกและทดสอบพิกัดแผนที่ (Map Location URL) ในหน้าตั้งค่าหอพักของเจ้าของหอพัก (/owner/settings)'
        ]
      },
      {
        id: '2026-09-16-3',
        title: 'ปรับปรุงคอนทราสต์โหมดสว่าง (Light Theme Contrast) คมชัดทุกไอคอน ไม่จมพื้นหลัง',
        category: 'Design',
        details: [
          'เพิ่ม Global Theme Overrides ใน app/globals.css สำหรับ :root:not(.dark) ให้ไอคอน SVG และข้อความความโปร่งใสสีขาวแสดงผลเป็นสี Slate คมชัดบนพื้นหลังสว่าง',
          'ปรับแต่งแถบ Header, Sidebar และ Input ค้นหาห้องพักทุกแดชบอร์ดให้ใช้ Semantic Tokens (bg-card, text-card-foreground, border-border) ปราศจากสีจม'
        ]
      },
      {
        id: '2026-09-16-4',
        title: 'เพิ่มเมนูดรอปดาวน์สลับหอพักและ "+ เพิ่มหอพัก" ใน Mobile Drawer Menu',
        category: 'Design',
        details: [
          'นำกล่องเลือกหอพักและปุ่มเพิ่มหอพักมาไว้ส่วนบนสุดของแถบเมนูข้าง (OwnerSidebar) ให้ผู้ใช้งานบนมือถือสามารถสลับหอพักและเพิ่มหอพักใหม่ได้สะดวกใน Drawer',
          'นำรูปภาพ Profile Face Avatar ออกจาก Top Navbar ทุกแดชบอร์ดเพื่อความสะอาดตาและโฟกัสฟังก์ชันสำคัญ',
          'ปรับปรุงปุ่ม Sign Out ในเมนูผู้ใช้งานให้สีสันและข้อความคมชัด มองเห็นได้ชัดเจนทั้งในโหมดสว่างและโหมดมืด'
        ]
      },
      {
        id: '2026-09-16-5',
        title: 'ระบบจัดเก็บภาพถ่ายมิเตอร์เป็นหลักฐานถาวร พร้อมระบบ AI Auto-fill & Quick Fill',
        category: 'Feature',
        details: [
          'บันทึกภาพถ่ายหน้าปัดมิเตอร์จากกล้องลงระบบจัดเก็บถาวร (/uploads/meters/) และผูก URL เข้ากับ meter_readings ในฐานข้อมูล',
          'เพิ่มคอลัมน์ "หลักฐานภาพถ่าย" ในตารางจดมิเตอร์ของเจ้าของหอพัก พร้อมปุ่ม 📷 ดูรูป และ Lightbox Modal แสดงภาพถ่ายความละเอียดสูงและเปรียบเทียบหน่วยที่ใช้',
          'ปรับปรุงระบบอ่านตัวเลขมิเตอร์ด้วย Canvas Contrast Boost และ Tesseract Numeric Whitelist (PSM 7)',
          'ระบบกรอกค่าอัตโนมัติ (Auto-fill) ทันทีที่ AI อ่านตัวเลขหน้าปัดได้ พร้อมปุ่มเลือกตัวเลขสำรอง (Candidate Pills) และปุ่ม Quick Fill (ใช้เลขเดิม, +1, +5, +10)'
        ]
      },
      {
        id: '2026-09-16-6',
        title: 'ระบบอัปเดตเวอร์ชันและสร้าง Git Tag อัตโนมัติทุกครั้งที่ Push ขึ้น Git',
        category: 'Performance',
        details: [
          'พัฒนา scripts/generate-version.js ให้นับ Build Number เชื่อมโยงกับ Git Commit Count แบบย้อนหลังและไปข้างหน้า 100%',
          'สร้าง Git Tags ย้อนหลังสำหรับทุกเวอร์ชันหลัก (v2.0.0, v2.1.0, v2.2.0, v2.3.0, v2.4.0, v2.5.0, v2.6.0, v2.6.1) พร้อม Push ขึ้น GitHub',
          'ติดตั้ง Git Hooks (pre-commit & pre-push) และสคริปต์ npm run git:push ตรวจจับการเปลี่ยนแปลงและสร้าง Tag อัตโนมัติ'
        ]
      },
      {
        id: '2026-09-16-7',
        title: 'ซิงค์ประวัติการอัปเดตและ Release Notes สู่หน้าแสดงผลทุกแดชบอร์ด',
        category: 'Feature',
        details: [
          'แสดงประวัติการอัปเดตระบบครอบคลุมทุกจุด: หน้าหลัก /updates, หน้านักวิจัย /researcher/updates, แดชบอร์ดผู้ดูแล /platform และปุ่มกระดิ่งแจ้งเตือน',
          'ปรับให้ข้อมูลเวอร์ชันและเนื้อหาสรุปทำงานแบบไดนามิก ปราศจากข้อความ Hardcoded เวอร์ชันเก่า'
        ]
      }
    ]
  },
  {
    date: '15 กันยายน 2026',
    version: 'v2.6.0',
    tagline: 'ปุ่มสอบถามหอพักและแสดงรายละเอียดค่าน้ำค่าไฟ/กฎระเบียบ, ตั้งค่าพร้อมเพย์ Onboarding, ปุ่มสลับธีมสีทุกแดชบอร์ด และบันทึก QR ลงแอปไฟล์',
    isLatest: false,
    tasks: [
      {
        id: '2026-09-15-1',
        title: 'เพิ่มปุ่มสอบถามหอพักและแสดงข้อมูลค่าน้ำค่าไฟ กฎระเบียบ ในหน้าจองและหน้ารายละเอียด',
        category: 'Feature',
        details: [
          'เพิ่มปุ่ม "💬 สอบถามหอพัก / แชทกับเจ้าของ" และ "📞 โทรติดต่อ" ในขั้นตอนการจองห้องพัก (/explore/room/[id]) และหน้ารายละเอียดหอพัก (/explore/[dormId])',
          'เพิ่มการ์ด "🏢 ข้อมูลหอพัก & เงื่อนไขสัญญา" แสดงอัตราค่าน้ำประปา, ค่าไฟฟ้า, กฎระเบียบหอพัก, นโยบายสัตว์เลี้ยง, ที่จอดรถ และคำอธิบายหอพัก',
          'ปรับปรุง API GET /api/rooms/[id] และ GET /api/dorms/[id] ให้ดึงข้อมูลโปรไฟล์หอพักครบถ้วน'
        ]
      },
      {
        id: '2026-09-15-2',
        title: 'เพิ่มการตั้งค่าบัญชีพร้อมเพย์ (PromptPay Payment) ใน Onboarding และหน้าตั้งค่าหอพัก',
        category: 'Feature',
        details: [
          'เพิ่มช่องกรอกหมายเลขพร้อมเพย์และชื่อบัญชีใน Onboarding Step 2 พร้อมปุ่มคัดลอกจากเบอร์โทรศัพท์หรือชื่อหอพัก 1-Click',
          'เพิ่มการ์ดจัดการบัญชีพร้อมเพย์ในหน้าตั้งค่าหอพัก (/owner/settings) เจ้าของหอสามารถแก้ไขได้ตลอดเวลา',
          'เชื่อมต่อกับ Dynamic QR Code ระบบออกบิลและจองห้องพัก รับเงินเข้าบัญชีเจ้าของหอพักโดยตรง ค่าธรรมเนียม 0%'
        ]
      },
      {
        id: '2026-09-15-3',
        title: 'เพิ่มปุ่มเปลี่ยนธีมสี (Theme Toggle) สลับโหมดมืด-สว่าง ในทุกแดชบอร์ด',
        category: 'Design',
        details: [
          'ติดตั้งปุ่ม ThemeToggle บน Header และ Sidebar ครบทุกบทบาท: Owner, Tenant, Keeper (Maid & Tech), และ Platform Admin',
          'ปรับปรุงให้ระบบจำสถานะธีมสีที่ผู้ใช้เลือก (Dark / Light) ผ่าน LocalStorage และ CSS Classes ราบรื่น'
        ]
      },
      {
        id: '2026-09-15-4',
        title: 'ปุ่มบันทึก QR Code ลงแอปไฟล์ (Save to Files) รองรับ iOS & Android',
        category: 'Feature',
        details: [
          'อัปเกรดคอมโพเนนต์ PromptPayBankSelector ให้มีปุ่ม "บันทึกลงแอปไฟล์"',
          'รองรับ Web Share API Files สำหรับ iOS เพื่อบันทึกลงแอป Files โดยตรง และดาวน์โหลดไฟล์ภาพอัตโนมัติสำหรับอุปกรณ์อื่น'
        ]
      },
      {
        id: '2026-09-15-5',
        title: 'แก้ไขปัญหาระบบ SignIn / SignUp แจ้งข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์',
        category: 'Fix',
        details: [
          'ปรับปรุง API Route /api/auth/signup และ NextAuth ให้จัดการ Connection Pool และ Error Handling ได้อย่างรัดกุม',
          'เพิ่ม Fallback กรณีการเชื่อมต่อฐานข้อมูลล่าช้า ให้แจ้งเตือนข้อความที่ชัดเจนแก่ผู้ใช้งาน'
        ]
      }
    ]
  },
  {
    date: '14 กันยายน 2026',
    version: 'v2.6.0',
    tagline: 'ระบบจดมิเตอร์อัจฉริยะด้วยกล้อง AI (Hybrid OCR), ชำระเงิน Dynamic PromptPay พร้อม Bank Deeplink (0% Fee) และเปิดใช้งาน SSL HTTPS Server',
    isLatest: false,
    tasks: [
      {
        id: '2026-09-14-1',
        title: 'ระบบจดมิเตอร์น้ำ-ไฟอัจฉริยะด้วยกล้อง AI (Hybrid OCR)',
        category: 'Feature',
        details: [
          'พัฒนาคอมโพเนนต์ CameraMeterModal รองรับการเปิดกล้องถ่ายภาพมิเตอร์น้ำและไฟฟ้า ทั้งแบบรายห้องเดี่ยวและตารางบันทึกด่วน (Batch Entry)',
          'เชื่อมต่อระบบสแกนตัวเลขอัจฉริยะ Hybrid OCR ผสาน Gemini 1.5 Flash Vision และ Tesseract.js (ออฟไลน์ fallback)',
          'ระบบตรวจสอบความสมเหตุสมผลของตัวเลข (Validation) แจ้งเตือนสีส้มทันทีหากเลขมิเตอร์น้อยกว่าเลขเดือนก่อนหน้า พร้อมบันทึกภาพถ่ายหลักฐาน (photo_url) ลงฐานข้อมูล'
        ]
      },
      {
        id: '2026-09-14-2',
        title: 'ระบบชำระเงินอัจฉริยะ 0% Fee + Direct Bank App Launcher (Deeplink)',
        category: 'Feature',
        details: [
          'ตัดระบบ SlipOK / ภาระค่าบริการรายสลิปออกอย่างสมบูรณ์ เพื่อความเหมาะสมสูงสุดสำหรับงานวิจัยและใช้งานจริง',
          'สร้าง PromptPay Dynamic QR Code มาตรฐานสากล EMVCo ผูกตรงกับบัญชีเจ้าของหอพัก 100%',
          'เพิ่มปุ่มลัดเปิดแอปธนาคารตรง (Deeplink) รองรับ K PLUS, SCB EASY, Krungthai NEXT, KMA, Bualuang mBanking และ ttb touch',
          'รองรับการตรวจสอบและอนุมัติสลิป (Human-in-the-loop) แบบ 1-Click พร้อมระบบปฏิเสธและระบุเหตุผล'
        ]
      },
      {
        id: '2026-09-14-3',
        title: 'ติดตั้งและตั้งค่าระบบความปลอดภัย SSL HTTPS สำหรับเซิร์ฟเวอร์ (Cloudflare Tunnel)',
        category: 'Security',
        details: [
          'ติดตั้ง cloudflared บน Windows Server รันบริการผ่าน Windows Scheduled Task (SmartDomTunnel) ตลอด 24/7',
          'ปลดล็อกข้อจำกัดของเบราว์เซอร์มือถือ (iOS Safari & Android Chrome) ให้สามารถเปิดกล้องสด (Live Viewfinder Stream) ได้อย่างปลอดภัย',
          'เพิ่มประสิทธิภาพการรับส่งข้อมูลผ่านโปรโตคอล TLS 1.3 และ HTTP/2 - QUIC / HTTP/3 โดยไม่มีปัญหา Latency'
        ]
      },
      {
        id: '2026-09-14-4',
        title: 'ปรับปรุงประสบการณ์การใช้งาน (UX) ฝั่งเจ้าของหอพัก และเพิ่มหน้าระบบสำหรับผู้วิจัย (Researcher)',
        category: 'Design',
        details: [
          'ลดความซับซ้อนของเมนูและกล่องข้อมูลฝั่งเจ้าของหอพักให้กระชับ ชัดเจน และใช้งานง่ายขึ้น',
          'เพิ่มหน้าแสดงโครงสร้างฐานข้อมูล ER Diagram และ Use Case Diagrams สถาปัตยกรรม 21 ตาราง สำหรับผู้วิจัยและผู้ดูแลระบบ (/researcher และ /admin/diagrams)'
        ]
      }
    ]
  },
  {
    date: '12 กันยายน 2026',
    version: 'v2.5.0',
    tagline: 'ระบบแจ้งเตือนสลิปชำระเงินสำหรับเจ้าของหอพัก และปรับปรุงโครงสร้าง Single Database สู่ 21 ตาราง',
    isLatest: false,
    tasks: [
      {
        id: '2026-09-12-1',
        title: 'ระบบแจ้งเตือนเจ้าของหอพักและผู้ดูแล (Keeper) เมื่อผู้เช่าแนบสลิปชำระเงิน',
        category: 'Feature',
        details: [
          'ส่งข้อความแจ้งเตือนอัตโนมัติเข้ากล่องข้อความของผู้ดูแลและเจ้าของหอพักทันทีที่ผู้เช่าอัปโหลดสลิป',
          'ระบุหมายเลขห้อง ยอดเงินที่ชำระ และลิงก์ลัด (/dormitory/bills/verification) เพื่อตรวจสอบและอนุมัติบิลได้รวดเร็ว',
          'รองรับการทำงานกับตาราง notifications รูปแบบมาตรฐานระบบ (user_id, title, message, type, is_read, created_at)'
        ]
      },
      {
        id: '2026-09-12-2',
        title: 'ปลดระวางโมดูลกระเป๋าเงิน (Wallet) และเหรียญ (Coins) ที่ไม่มีตารางรองรับ',
        category: 'Fix',
        details: [
          'นำ UI กระเป๋าเงิน/การเติมเงิน และเหรียญออกจากหน้าโปรไฟล์และเมนู เพื่อป้องกัน Runtime Error จากคอลัมน์ที่ไม่มีอยู่จริง',
          'ลบ API endpoint เก่าที่ไม่รองรับ (/api/platform/packages, /api/dormitory/packages) ออกอย่างสมบูรณ์',
          'ทำความสะอาด Schema ของตาราง dormitory_registry โดยตัดฟิลด์ coins ที่ไม่ได้ใช้งาน'
        ]
      },
      {
        id: '2026-09-12-3',
        title: 'ปรับปรุงโครงสร้าง Single Database เหลือ 21 ตารางมาตรฐาน',
        category: 'Performance',
        details: [
          'ตัดตารางที่ไม่ได้ใช้งาน subscriptions และ dormitory_packages ออกจากฐานข้อมูล',
          'คงตาราง accounting_transactions ไว้สำหรับการลงบัญชีรายรับ-รายจ่ายของหอพัก',
          'อัปเดตไฟล์ Dump ฐานข้อมูลหลัก (smartdomdb_full_dump.sql) และ docs สอดคล้องกับสภาพแวดล้อมจริง 100%'
        ]
      },
      {
        id: '2026-09-12-4',
        title: 'ปรับปรุงเมนู Sidebar ทั้ง Platform Admin และ Dormitory Owner',
        category: 'Design',
        details: [
          'ถอดเมนู "แพ็กเกจหอพัก" (Packages) ออกจากแถบเมนู Platform Admin เพื่อความถูกต้องของฟังก์ชันงาน',
          'ถอดเมนู "เหรียญ / สมัครสมาชิก" ออกจาก Dashboard ของเจ้าของหอพัก',
          'เพิ่มการสรุปสถานะเวอร์ชันระบบ (v2.5.0) และบันทึกการอัปเดตลงบน Platform Admin Dashboard'
        ]
      }
    ]
  },
  {
    date: '24 - 25 กรกฎาคม 2026',
    version: 'v2.4.0',
    tagline: 'ปรับปรุงเสถียรภาพระบบล็อกอิน การบิลด์ Tailwind v4 และระบบ Remote Deployment',
    isLatest: false,
    tasks: [
      {
        id: '2026-07-25-1',
        title: 'แก้ไขปัญหาระบบล็อกอิน และ NextAuth 0.0.0.0 Redirect',
        category: 'Security',
        details: [
          'ตั้งค่า Runtime Fallback บน auth.ts ป้องกันปัญหารีไดเรกต์ไป 0.0.0.0 ในสภาพแวดล้อม Production',
          'ปรับปรุง PM2 Ecosystem & Dynamic Reload รองรับทราฟฟิกพอร์ตคู่ 3000 และ 5993 สำหรับ THDDNS'
        ]
      },
      {
        id: '2026-07-25-2',
        title: 'แก้ไขปัญหา Tailwind CSS v4 ไม่ถูกคอมไพล์ใน Production Build',
        category: 'Performance',
        details: [
          'บังคับใช้ Webpack Build ใน package.json เพื่อแก้ปัญหา Turbopack ข้ามการประมวลผล PostCSS',
          'คอมไพล์สไตล์ Tailwind CSS v4 ได้สมบูรณ์ 100% (ขนาดไฟล์ ~133KB) พร้อมปรับปรุง app/globals.css'
        ]
      },
      {
        id: '2026-07-25-3',
        title: 'ล้าง Zombie Node Processes และแก้ไขการเคลียร์แคชบน Windows Server',
        category: 'Fix',
        details: [
          'ยุติโปรเซส node.exe ตกค้างในระบบกว่า 30 โปรเซสที่ถือครองพอร์ต',
          'แก้ไขไวยากรณ์ rmdir /s /q .next ใน deploy-remote.js ให้ลบแคชเก่าได้อย่าง 100%'
        ]
      },
      {
        id: '2026-07-25-4',
        title: 'ปรับปรุงสคริปต์ Remote Deploy และกระบวนการ Detached Process',
        category: 'Performance',
        details: [
          'ใช้ WMIC Process Creation ใน deploy-remote.js ป้องกัน Windows OpenSSH Job Object ตัดการทำงาน',
          'กำหนด Windows Firewall Inbound Rules เปิดปลดล็อก TCP พอร์ต 3000 และ 5993'
        ]
      },
      {
        id: '2026-07-25-5',
        title: 'แก้ไขข้อผิดพลาด TypeScript (Strict Type Audit)',
        category: 'Fix',
        details: [
          'แก้ไขการเปรียบเทียบ boolean กับตัวเลขใน app/page.tsx (TS2367 Error)',
          'ผ่านการตรวจสอบ Strict TypeScript (npx tsc --noEmit) สำเร็จ 100% ปราศจาก Error'
        ]
      }
    ]
  },
  {
    date: '23 กรกฎาคม 2026',
    version: 'v2.3.0',
    tagline: 'ปรับแต่งดีไซน์ธีมม่วง-ทอง มหาวิทยาลัยพะเยา และการแสดงผลหอพักคมชัดสูง',
    tasks: [
      {
        id: '2026-07-23-1',
        title: 'อัปเดตชื่อหอพักหลักและชื่อแบรนด์ระบบ (System Rebranding)',
        category: 'Design',
        details: [
          'แก้ไขชื่อหอพักหลักเป็น "หอพักหน้ามหาวิทยาลัยพะเยา"',
          'เปลี่ยนชื่อระบบเป็น "แพลตฟอร์มหอพักหน้ามหาวิทยาลัยพะเยา" ครอบคลุม Navbar, Sidebar และ Metadata'
        ]
      },
      {
        id: '2026-07-23-2',
        title: 'ธีมสีประจำมหาวิทยาลัยพะเยา (UP Purple & Gold Theme)',
        category: 'Design',
        details: [
          'กำหนดจานสีหลัก: สีม่วง มพ. (#8E24AA / #A855F7) และ สีทอง มพ. (#C59B63 / #D4AF37)',
          'ติดตั้งตราสัญลักษณ์มหาวิทยาลัยพะเยา (/up-logo.png) พร้อมเงานูนลอย Drop Shadow'
        ]
      },
      {
        id: '2026-07-23-3',
        title: 'ปรับปรุงการ์ดแสดงผลหอพักความคมชัดสูง (High-Contrast Redesign)',
        category: 'UI/UX' as any,
        details: [
          'แยกโครงสร้างการ์ดการแสดงผลภาพปกและกล่องเนื้อหาบนพื้นหลังทึบ อ่านง่าย 100%',
          'ขยายฟอนต์ชื่อหอพัก, ที่อยู่, เบอร์โทร และแท็กสิ่งอำนวยความสะดวก'
        ]
      },
      {
        id: '2026-07-23-4',
        title: 'ซ่อมแซมฟังก์ชันแชทและปรับปรุง Scrollbar',
        category: 'Fix',
        details: [
          'เพิ่ม Custom Event Listener ใน ChatWidget ให้กดแชทเปิดกล่องสนทนาได้ทันที',
          'เพิ่ม CSS Utility .no-scrollbar ซ่อนแถบเลื่อนแนวนอนของเบราว์เซอร์'
        ]
      }
    ]
  },
  {
    date: '20 กรกฎาคม 2026',
    version: 'v2.2.0',
    tagline: 'ปรับปรุงคุณภาพโค้ด จัดทำ Testing Dashboard และปรับธีม Black-Purple',
    tasks: [
      {
        id: '2026-07-20-1',
        title: 'ปรับปรุงคุณภาพโค้ดและการตรวจสอบ Types (Strict TS)',
        category: 'Performance',
        details: [
          'แก้ไขข้อผิดพลาด TypeScript ใน next.config.ts, lib/db.ts, owner/tenant routes',
          'ผ่านการทดสอบ npx tsc --noEmit และ npm run build ปราศจาก Warning'
        ]
      },
      {
        id: '2026-07-20-2',
        title: 'แดชบอร์ดสรุปผลการทดสอบระบบอินเตอร์แอคทีฟ',
        category: 'Feature',
        details: [
          'จัดทำรายงานผลการทดสอบ system-testing-results.html สไตล์ Glassmorphism',
          'แสดงผลการทดสอบ 19 Test Cases, ความปลอดภัย 4 มิติ และสถิติ Lighthouse'
        ]
      },
      {
        id: '2026-07-20-3',
        title: 'รื้อถอนสีน้ำตาลและพัฒนาธีม ดำ-ม่วง / ขาว-ม่วง',
        category: 'Design',
        details: [
          'เปลี่ยน Primary Color เป็นคู่สีม่วง/ไวโอเล็ต',
          'กำจัดสีน้ำตาลค้างในระบบ และปรับ Owner/Tenant Dashboard ให้รองรับ Light/Dark Mode Dynamic'
        ]
      }
    ]
  },
  {
    date: '17 กรกฎาคม 2026',
    version: 'v2.1.0',
    tagline: 'ระบบ API ดูห้องพักแบบสาธารณะ และการปรับแต่ง Responsive UI',
    tasks: [
      {
        id: '2026-07-17-1',
        title: 'ระบบ API เข้าถึงข้อมูลห้องพักแบบสาธารณะ (Public API)',
        category: 'Feature',
        details: [
          'เปิดให้ /api/rooms และ /api/rooms/[id] ดึงข้อมูลห้องพักได้โดยไม่ต้องใช้ Session',
          'แก้ไข SQL Join ตารางห้องพักและข้อมูลผู้ดูแลให้ถูกต้อง 100%'
        ]
      },
      {
        id: '2026-07-17-2',
        title: 'การแสดงผลแบบ Responsive เต็มรูปแบบ',
        category: 'UI/UX' as any,
        details: [
          'ปรับ Breakpoint ของ Navbar Drawer บนมือถือและแท็บเล็ต',
          'ปรับการ์ดหอพักและฟอร์มการจองให้พอดีขอบจอมือถือ'
        ]
      }
    ]
  },
  {
    date: '6 - 7 กรกฎาคม 2026',
    version: 'v2.0.0',
    tagline: 'ปรับโครงสร้างฐานข้อมูล Single DB และฟีเจอร์ Free-Tier เต็มรูปแบบ',
    tasks: [
      {
        id: '2026-07-07-1',
        title: 'สถาปัตยกรรมฐานข้อมูล Single Database',
        category: 'Performance',
        details: [
          'Migrate จาก Multi-DB เป็น Single Database (smartdomdb)',
          'สร้างระบบจดมิเตอร์น้ำ-ไฟ, QR Code PromptPay ชำระเงินฟรี และระบบแจ้งเตือน'
        ]
      },
      {
        id: '2026-07-07-2',
        title: 'ปรับปรุงฟอร์มสมัครสมาชิก (Single Page Signup)',
        category: 'Feature',
        details: [
          'รวบฟอร์มสมัครสมาชิกให้จบในหน้าเดียว พร้อมแยกชื่อ-นามสกุลในตาราง users',
          'เพิ่ม Mobile Drawer Menu สำหรับสมาร์ทโฟน'
        ]
      }
    ]
  }
];
