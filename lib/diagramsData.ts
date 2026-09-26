export interface DiagramItem {
  id: string;
  title: string;
  badge: string;
  category: string;
  description: string;
  actors: string[];
  steps: { step: number; actor: string; action: string; target: string; note?: string }[];
  mermaidCode: string;
}

export interface UseCaseActorGroup {
  actor: string;
  roleDescription: string;
  icon: string;
  badgeColor: string;
  useCases: { code: string; name: string; desc: string }[];
}

export const useCaseGroups: UseCaseActorGroup[] = [
  {
    actor: 'ผู้เยี่ยมชมทั่วไป (Guest / Public User)',
    roleDescription: 'บุคคลทั่วไป นิสิต หรือผู้สนใจเข้าพักที่ยังไม่ได้ทำสัญญาเช่า',
    icon: '🌐',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    useCases: [
      { code: 'UC01', name: 'ค้นหาและสำรวจหอพัก (Explore Dormitories & Rooms)', desc: 'ค้นหาตามทำเล ราคา สิ่งอำนวยความสะดวก พร้อมดูภาพห้องและพิกัดแผนที่' },
      { code: 'UC02', name: 'จองห้องพักและจ่ายเงินมัดจำ (Book Room & Deposit)', desc: 'กรอกข้อมูลการจอง สแกนจ่ายเงินมัดจำผ่าน PromptPay QR และแนบสลิป' },
      { code: 'UC03', name: 'เข้าสู่ระบบ / ลงทะเบียน (Authentication)', desc: 'สมัครสมาชิก หรือเข้าสู่ระบบด้วย Email หรือ Google Account' }
    ]
  },
  {
    actor: 'ผู้เช่า (Tenant)',
    roleDescription: 'ผู้ที่ผ่านการทำสัญญาเช่าและพักอาศัยอยู่ในหอพัก',
    icon: '🏠',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    useCases: [
      { code: 'UC04', name: 'ตรวจสอบข้อมูลห้องพักและสัญญา (View Room & Contract)', desc: 'ดูข้อมูลห้องพัก เลขสัญญา ระยะเวลาคงเหลือ และขอยื่นต่ออายุสัญญา' },
      { code: 'UC05', name: 'ตรวจสอบและชำระค่าเช่า (View & Pay Rental Bills)', desc: 'เปิดดูบิลค่าเช่า ค่าน้ำ ค่าไฟ สแกนจ่ายผ่าน QR Code และแนบสลิปโอนเงิน' },
      { code: 'UC06', name: 'ส่งเรื่องแจ้งซ่อม (Submit Maintenance Request)', desc: 'ส่งคำขอแจ้งซ่อมแซมสิ่งอำนวยความสะดวก ระบุอาการและแนบรูปภาพจุดชำรุด' },
      { code: 'UC07', name: 'แชทสนทนากับหอพัก (Chat with Owner)', desc: 'ส่งข้อความและรูปภาพสื่อสารแบบเรียลไทม์กับเจ้าของหอพัก' },
      { code: 'UC08', name: 'ดูประกาศข่าวสาร (View Announcements)', desc: 'รับการแจ้งเตือนและอ่านประกาศข่าวสาร กฎระเบียบ หรือแจ้งเตือนด่วนจากหอพัก' },
      { code: 'UC09', name: 'แจ้งย้ายออก (Submit Move-out Request)', desc: 'ยื่นคำร้องแจ้งย้ายออกล่วงหน้า เพื่อนัดหมายตรวจสอบห้องและคืนเงินประกัน' }
    ]
  },
  {
    actor: 'เจ้าของหอพัก (Owner)',
    roleDescription: 'เจ้าของหรือผู้จัดการหอพัก มีสิทธิ์จัดการระบบหอพักเต็มรูปแบบ',
    icon: '🏢',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    useCases: [
      { code: 'UC10', name: 'จัดการข้อมูลหอพักและห้องพัก (Manage Dormitory & Rooms)', desc: 'ตั้งค่ากฎระเบียบ ค่าน้ำ ค่าไฟ เพิ่ม/แก้ไข/ลบห้องพัก และกำหนดราคา' },
      { code: 'UC11', name: 'จัดการรายการจองห้องพัก (Manage Bookings)', desc: 'ตรวจสอบสลิปเงินมัดจำ และกดอนุมัติ (Approve) หรือปฏิเสธคำขอจอง' },
      { code: 'UC12', name: 'บันทึกสัญญากระดาษและสแกนแนบ (Record & Upload Signed Contract)', desc: 'เซ็นสัญญากระดาษฉบับจริง ถ่ายรูป/สแกนแนบเข้าระบบ ผูกสิทธิ์ลูกหอ และต่ออายุสัญญา' },
      { code: 'UC13', name: 'จดมิเตอร์น้ำ-ไฟประจำงวด (Record Utility Meters)', desc: 'บันทึกเลขมิเตอร์น้ำ/ไฟประจำเดือน คำนวณยอดหน่วยและค่าใช้จ่ายอัตโนมัติ' },
      { code: 'UC14', name: 'ออกบิลและตรวจสลิปค่าเช่า (Issue Bills & Verify Payments)', desc: 'ออกใบแจ้งหนี้ประจำเดือน ตรวจสอบสลิปโอนเงิน และกดยืนยันยอดออกใบเสร็จ' },
      { code: 'UC15', name: 'จัดการบัญชีรายรับ-รายจ่าย (Manage Accounting)', desc: 'บันทึกค่าใช้จ่าย ซ่อมบำรุง และดูสรุปงบกำไรขาดทุนภาพรวมหอพัก' },
      { code: 'UC16', name: 'มอบหมายงานซ่อม/แม่บ้าน (Assign Maintenance Tasks)', desc: 'รับเรื่องแจ้งซ่อมและมอบหมายงานให้ช่างซ่อมบำรุงหรือแม่บ้านประจำหอ' },
      { code: 'UC17', name: 'ศูนย์ตอบแชทลูกหอ (Manage Chat Messenger)', desc: 'ตอบคำถามและสนทนากับลูกหอแต่ละห้องผ่านช่องทางแชทกลาง' },
      { code: 'UC18', name: 'จัดการทีมงานผู้ดูแล (Manage Keepers)', desc: 'เพิ่มและกำหนดสิทธิ์การเข้าถึงหอพักของแม่บ้านและช่างซ่อมบำรุง' }
    ]
  },
  {
    actor: 'ผู้ดูแลหอพัก: ช่าง & แม่บ้าน (Keeper: Maid & Technician)',
    roleDescription: 'ทีมงานฝ่ายปฏิบัติการประจำหอพัก (สามารถดูแลได้หลายหอพัก)',
    icon: '🔧',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    useCases: [
      { code: 'UC19', name: 'สลับหอพักที่ดูแล (Switch Assigned Dormitory)', desc: 'เลือกสลับดูงานตามหอพักที่ได้รับมอบหมาย (Multi-Dormitory Switcher)' },
      { code: 'UC20', name: 'จัดการงานทำความสะอาด (Handle Housekeeping Tasks)', desc: 'ดูรายการห้องที่ต้องทำความสะอาด อัปเดตสถานะการทำงาน และแนบรูปความเรียบร้อย' },
      { code: 'UC21', name: 'รับงานและปิดใบแจ้งซ่อม (Handle Maintenance Tickets)', desc: 'ตรวจสอบอาการ ติดต่อผู้เช่า ดำเนินการซ่อม บันทึกค่าอะไหล่ และอัปเดตงานเสร็จสิ้น' }
    ]
  },
  {
    actor: 'ผู้ดูแลระบบส่วนกลาง (Platform Admin)',
    roleDescription: 'ผู้ดูแลภาพรวมระบบ แพลตฟอร์มหอพักหน้ามหาวิทยาลัยพะเยา',
    icon: '🛡️',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
    useCases: [
      { code: 'UC22', name: 'ดูสถิติภาพรวมระบบ (View Platform Dashboard)', desc: 'ตรวจสอบจำนวนหอพัก ห้องพัก ยอดผู้ใช้งานรวม และสถานะ Server' },
      { code: 'UC23', name: 'จัดการผู้ใช้งานและสิทธิ์ (Manage Users & Roles)', desc: 'ตรวจสอบรายชื่อผู้ใช้งาน ระงับการใช้งาน หรือปรับเปลี่ยนบทบาท' },
      { code: 'UC24', name: 'ตรวจสอบหอพักส่วนกลาง (Audit Dormitories & Rooms)', desc: 'ตรวจสอบมาตรฐานหอพักและห้องพักที่เปิดให้บริการในแพลตฟอร์ม' },
      { code: 'UC25', name: 'ประกาศข่าวสารส่วนกลาง (Publish Platform Announcements)', desc: 'สร้างและส่งประกาศข่าวสารระดับมหาวิทยาลัยถึงผู้ใช้ทุกกลุ่ม' },
      { code: 'UC26', name: 'ดูแผนภาพสถาปัตยกรรมระบบ (View System Architecture & Diagrams)', desc: 'ตรวจสอบ Use Case และ Sequence Diagrams สำหรับการพัฒนาและวิจัย' }
    ]
  }
];

export const useCaseDiagramMermaid = `graph LR
    %% Actors
    Guest["👤 :GuestUser"]
    Tenant["🏠 :Tenant"]
    Owner["🏢 :Owner"]
    Keeper["🔧 :Keeper"]
    Admin["🛡️ :PlatformAdmin"]

    %% Use cases - Public / Explore
    subgraph Explore_Booking ["ระบบสำรวจและจองห้องพัก"]
        UC01((ค้นหาและสำรวจหอพัก))
        UC02((จองห้องพักและจ่ายมัดจำ))
        UC03((เข้าสู่ระบบ / ลงทะเบียน))
    end

    %% Use cases - Tenant
    subgraph Tenant_Portal ["ระบบสำหรับผู้เช่า"]
        UC04((ตรวจสอบห้องพักและสัญญา))
        UC05((ตรวจสอบและชำระค่าเช่า))
        UC06((ส่งเรื่องแจ้งซ่อม))
        UC07((แชทสนทนากับหอพัก))
        UC08((ดูประกาศข่าวสาร))
        UC09((แจ้งย้ายออก))
    end

    %% Use cases - Owner
    subgraph Owner_Portal ["ระบบบริหารจัดการหอพัก"]
        UC10((จัดการหอพักและห้องพัก))
        UC11((อนุมัติการจองห้องพัก))
        UC12((บันทึกสัญญากระดาษและสแกนแนบ))
        UC13((จดมิเตอร์น้ำ-ไฟ))
        UC14((ออกบิลและตรวจสลิปค่าเช่า))
        UC15((จัดการบัญชีรายรับ-จ่าย))
        UC16((มอบหมายงานซ่อม/แม่บ้าน))
        UC17((ศูนย์ตอบแชทลูกหอ))
        UC18((จัดการสิทธิ์แม่บ้าน/ช่าง))
    end

    %% Use cases - Keeper
    subgraph Keeper_Portal ["ระบบปฏิบัติงานผู้ดูแล"]
        UC19((สลับหอพักที่ดูแล))
        UC20((จัดการงานทำความสะอาด))
        UC21((รับงานและปิดใบแจ้งซ่อม))
    end

    %% Use cases - Admin
    subgraph Admin_Portal ["ระบบแอดมินส่วนกลาง"]
        UC22((ดูสถิติภาพรวมระบบ))
        UC23((จัดการผู้ใช้งานและสิทธิ์))
        UC24((ตรวจสอบหอพักส่วนกลาง))
        UC25((ประกาศข่าวสารส่วนกลาง))
        UC26((ดูแผนภาพระบบ Diagrams))
    end

    %% Relationships - Guest
    Guest --> UC01
    Guest --> UC02
    Guest --> UC03

    %% Relationships - Tenant
    Tenant --> UC04
    Tenant --> UC05
    Tenant --> UC06
    Tenant --> UC07
    Tenant --> UC08
    Tenant --> UC09

    %% Relationships - Owner
    Owner --> UC10
    Owner --> UC11
    Owner --> UC12
    Owner --> UC13
    Owner --> UC14
    Owner --> UC15
    Owner --> UC16
    Owner --> UC17
    Owner --> UC18

    %% Relationships - Keeper
    Keeper --> UC19
    Keeper --> UC20
    Keeper --> UC21

    %% Relationships - Admin
    Admin --> UC22
    Admin --> UC23
    Admin --> UC24
    Admin --> UC25
    Admin --> UC26`;

export const diagrams: DiagramItem[] = [
  {
    id: 'contract',
    title: '1. การทำสัญญาเช่า (Physical Sign & Digital Upload)',
    badge: 'Owner / Tenant',
    category: 'การจัดการสัญญา',
    description: 'กระบวนการทำสัญญากระดาษฉบับจริงระหว่างเจ้าของหอพักและผู้เช่า จากนั้นนำเข้าสู่ระบบโดยการถ่ายภาพ/สแกนเพื่อเปิดสิทธิ์และผูกห้องพักในระบบ SmartDom',
    actors: [':Tenant', ':Owner', ':SmartDomWeb', ':ContractController', ':Database'],
    steps: [
      { step: 1, actor: ':Tenant', action: 'signPhysicalContract(contractDocs)', target: ':Owner', note: 'ลงนามในสัญญากระดาษฉบับจริง' },
      { step: 2, actor: ':Owner', action: 'scanSignedDocument(paperContract)', target: ':Owner', note: 'ถ่ายภาพ/สแกนสัญญาเป็นไฟล์ดิจิทัล' },
      { step: 3, actor: ':Owner', action: 'inputContractData(roomId, tenantData, deposit)', target: ':SmartDomWeb' },
      { step: 4, actor: ':SmartDomWeb', action: 'postContract(payload, slipFile)', target: ':ContractController' },
      { step: 5, actor: ':ContractController', action: 'insertContractRecord(contractData)', target: ':Database' },
      { step: 6, actor: ':Database', action: 'return contractId', target: ':ContractController' },
      { step: 7, actor: ':ContractController', action: 'updateRoomStatus(Occupied)', target: ':Database' },
      { step: 8, actor: ':ContractController', action: 'assignTenantRole(tenantId, dormId)', target: ':Database' },
      { step: 9, actor: ':ContractController', action: 'return successResponse(contractId)', target: ':SmartDomWeb' },
      { step: 10, actor: ':Tenant', action: 'accessTenantDashboard()', target: ':SmartDomWeb' },
      { step: 11, actor: ':SmartDomWeb', action: 'queryContractDetails(tenantId)', target: ':Database' },
      { step: 12, actor: ':SmartDomWeb', action: 'renderRoomAndContractDetails()', target: ':Tenant' }
    ],
    mermaidCode: `sequenceDiagram
    autonumber
    participant Tenant as :Tenant
    participant Owner as :Owner
    participant Web as :SmartDomWeb
    participant API as :ContractController
    participant DB as :Database

    Tenant->>+Owner: 1. signPhysicalContract(contractDocs)
    Note over Owner: ถ่ายภาพ / สแกนสัญญาเป็นไฟล์รูปหรือ PDF
    Owner->>+Web: 2. inputContractData(roomId, tenantData, deposit, file)
    Web->>+API: 3. postContract(payload, slipFile)
    API->>+DB: 4. insertContractRecord(contractData)
    DB-->>-API: 5. return contractId
    API->>+DB: 6. updateRoomStatus(Occupied)
    DB-->>-API: 7. return statusOk
    API->>+DB: 8. assignTenantRole(tenantId, dormId)
    DB-->>-API: 9. return roleAssigned
    API-->>-Web: 10. return successResponse(contractId)
    Web-->>-Owner: 11. displaySuccessMessage()
    deactivate Owner

    Tenant->>+Web: 12. accessTenantDashboard()
    Web->>+API: 13. getTenantContract(tenantId)
    API->>+DB: 14. queryContractDetails(tenantId)
    DB-->>-API: 15. return contractRecord
    API-->>-Web: 16. return contractData
    Web-->>-Tenant: 17. renderRoomAndContractDetails()`
  },
  {
    id: 'booking',
    title: '2. การจองห้องพัก & ชำระเงินมัดจำ (Room Booking & Approval)',
    badge: 'Public / Tenant / Owner',
    category: 'การจองห้องพัก',
    description: 'ขั้นตอนตั้งแต่ผู้เช่าสำรวจหอพัก เลือกห้อง ส่งคำขอจอง ชำระเงินมัดจำผ่าน QR Code จนถึงเจ้าของหอพักตรวจสอบและอนุมัติการจอง',
    actors: [':GuestUser', ':SmartDomWeb', ':BookingController', ':PaymentService', ':Database', ':Owner'],
    steps: [
      { step: 1, actor: ':GuestUser', action: 'searchRooms(criteria)', target: ':SmartDomWeb' },
      { step: 2, actor: ':SmartDomWeb', action: 'queryAvailableRooms()', target: ':Database' },
      { step: 3, actor: ':GuestUser', action: 'submitBooking(roomId, contactData)', target: ':SmartDomWeb' },
      { step: 4, actor: ':BookingController', action: 'generatePromptPayQR(depositAmount)', target: ':PaymentService' },
      { step: 5, actor: ':GuestUser', action: 'uploadPaymentSlip(slipImage)', target: ':SmartDomWeb' },
      { step: 6, actor: ':Owner', action: 'inspectSlipAndApprove(bookingId)', target: ':BookingController' },
      { step: 7, actor: ':BookingController', action: 'updateBookingStatus(Confirmed) & updateRoom(Booked)', target: ':Database' },
      { step: 8, actor: ':BookingController', action: 'notifyBookingConfirmed()', target: ':GuestUser' }
    ],
    mermaidCode: `sequenceDiagram
    autonumber
    participant Guest as :GuestUser
    participant Web as :SmartDomWeb
    participant API as :BookingController
    participant Pay as :PaymentService
    participant DB as :Database
    participant Owner as :Owner

    Guest->>+Web: 1. searchRooms(filterCriteria)
    Web->>+API: 2. getAvailableRooms()
    API->>+DB: 3. queryAvailableRooms()
    DB-->>-API: 4. return roomList
    API-->>-Web: 5. return roomsJSON
    Web-->>-Guest: 6. displayRoomDetails()

    Guest->>+Web: 7. submitBookingRequest(roomId, contactData, moveInDate)
    Web->>+API: 8. createBooking(payload)
    API->>+Pay: 9. generatePromptPayQR(depositAmount)
    Pay-->>-API: 10. return qrCodeData
    API->>+DB: 11. insertBookingRecord(status: PendingDeposit)
    DB-->>-API: 12. return bookingId
    API-->>-Web: 13. return { bookingId, qrCodeUrl }
    Web-->>-Guest: 14. displayQRCodeAndPaymentInstruction()

    Guest->>+Web: 15. uploadPaymentSlip(slipImage)
    Web->>+API: 16. verifyAndStoreSlip(bookingId, file)
    API->>+DB: 17. updateBookingStatus(WaitingApproval, slipUrl)
    DB-->>-API: 18. return updatedOk
    API-->>-Web: 19. return uploadSuccess
    Web-->>-Guest: 20. displayWaitingApproval()

    API->>+Owner: 21. notifyNewBooking(bookingId)
    Owner->>+Web: 22. reviewSlipAndApprove()
    Web->>+API: 23. approveBooking(bookingId)
    API->>+DB: 24. updateBooking(Confirmed) & updateRoom(Booked)
    DB-->>-API: 25. return confirmedOk
    API-->>-Web: 26. return approvalSuccess
    Web-->>-Owner: 27. displayBookingApproved()
    API-->>Guest: 28. notifyBookingConfirmed()`
  },
  {
    id: 'meter_billing',
    title: '3. จดมิเตอร์น้ำ-ไฟ & ออกบิลค่าเช่า (Meter Reading & Invoice)',
    badge: 'Owner / Keeper / Tenant',
    category: 'มิเตอร์และการเงิน',
    description: 'การบันทึกตัวเลขมิเตอร์น้ำ-ไฟประจำงวด คำนวณยอดการใช้พลังงาน และรวมยอดเป็นใบแจ้งหนี้ส่งให้ผู้เช่าแต่ละห้อง',
    actors: [':StaffOrKeeper', ':SmartDomWeb', ':BillingController', ':Database', ':Tenant'],
    steps: [
      { step: 1, actor: ':StaffOrKeeper', action: 'openMeterForm(dormId, month)', target: ':SmartDomWeb' },
      { step: 2, actor: ':BillingController', action: 'queryPreviousMeterReadings()', target: ':Database' },
      { step: 3, actor: ':StaffOrKeeper', action: 'inputCurrentMeters(waterUnit, electricUnit)', target: ':SmartDomWeb' },
      { step: 4, actor: ':BillingController', action: 'calculateUtilityCost(unitsUsed * rates)', target: ':BillingController' },
      { step: 5, actor: ':BillingController', action: 'insertInvoices(status: Unpaid)', target: ':Database' },
      { step: 6, actor: ':Tenant', action: 'viewPendingBill()', target: ':SmartDomWeb' }
    ],
    mermaidCode: `sequenceDiagram
    autonumber
    participant Staff as :StaffOrKeeper
    participant Web as :SmartDomWeb
    participant API as :BillingController
    participant DB as :Database
    participant Tenant as :Tenant

    Staff->>+Web: 1. openMeterForm(dormId, month)
    Web->>+API: 2. getPreviousMeters(month)
    API->>+DB: 3. queryPreviousMeterReadings()
    DB-->>-API: 4. return previousReadings
    API-->>-Web: 5. return meterFormData
    Web-->>-Staff: 6. renderMeterInputs()

    Staff->>+Web: 7. inputCurrentMeters(waterUnit, electricUnit)
    Web->>+API: 8. recordMeters(meterData)
    API->>+DB: 9. insertMeterReadings(readingsData)
    DB-->>-API: 10. return savedOk
    API-->>-Web: 11. return recordSuccess()

    Staff->>+Web: 12. requestBatchInvoiceGeneration()
    Web->>+API: 13. generateBatchInvoices(dormId, month)
    API->>API: 14. calculateUtilityCost(unitsUsed * rates)
    API->>API: 15. calculateTotalAmount(rent + water + electricity)
    API->>+DB: 16. insertInvoices(status: Unpaid)
    DB-->>-API: 17. return invoicesCreated
    API-->>-Web: 18. return batchInvoiceSuccess
    Web-->>-Staff: 19. displayInvoicesSummary()

    API->>+Tenant: 20. sendNewBillNotification(invoiceId)
    Tenant->>+Web: 21. viewPendingBill()
    Web->>+API: 22. getTenantInvoice(tenantId)
    API->>+DB: 23. queryTenantInvoiceDetails(tenantId)
    DB-->>-API: 24. return invoiceDetails
    API-->>-Web: 25. return invoiceJSON
    Web-->>-Tenant: 26. displayInvoiceBreakdown()`
  },
  {
    id: 'payment',
    title: '4. การชำระค่าเช่า & ตรวจสอบสลิป (Payment & Slip Verification)',
    badge: 'Tenant / Owner',
    category: 'การชำระเงิน',
    description: 'ผู้เช่าเปิดบิล สแกน QR Code PromptPay ชำระเงิน แนบสลิปโอนเงิน เจ้าของหอพักตรวจสอบสลิปและปรับสถานะเป็นชำระเงินแล้ว',
    actors: [':Tenant', ':MobileBankingApp', ':SmartDomWeb', ':PaymentController', ':Database', ':Owner'],
    steps: [
      { step: 1, actor: ':Tenant', action: 'selectBillToPay(invoiceId)', target: ':SmartDomWeb' },
      { step: 2, actor: ':PaymentController', action: 'generatePromptPayQR(exactAmount)', target: ':SmartDomWeb' },
      { step: 3, actor: ':Tenant', action: 'scanAndTransferMoney(qrData)', target: ':MobileBankingApp' },
      { step: 4, actor: ':Tenant', action: 'uploadTransferSlip(invoiceId, slipFile)', target: ':SmartDomWeb' },
      { step: 5, actor: ':Owner', action: 'reviewSlipAndVerify(invoiceId)', target: ':SmartDomWeb' },
      { step: 6, actor: ':PaymentController', action: 'updateInvoiceStatus(Paid) & generateReceipt()', target: ':Database' }
    ],
    mermaidCode: `sequenceDiagram
    autonumber
    participant Tenant as :Tenant
    participant Bank as :MobileBankingApp
    participant Web as :SmartDomWeb
    participant API as :PaymentController
    participant DB as :Database
    participant Owner as :Owner

    Tenant->>+Web: 1. selectBillToPay(invoiceId)
    Web->>+API: 2. requestPromptPayQR(invoiceId)
    API->>+DB: 3. verifyInvoiceAmount(invoiceId)
    DB-->>-API: 4. return invoiceRecord
    API-->>-Web: 5. return promptPayQR(exactAmount)
    Web-->>-Tenant: 6. displayPromptPayQR()

    Tenant->>+Bank: 7. scanAndTransferMoney(qrData)
    Bank-->>-Tenant: 8. return eSlip(transactionProof)

    Tenant->>+Web: 9. uploadTransferSlip(invoiceId, slipFile)
    Web->>+API: 10. submitSlip(invoiceId, slipFile)
    API->>+DB: 11. updateInvoiceStatus(PendingVerification, slipUrl)
    DB-->>-API: 12. return updatedOk
    API-->>-Web: 13. return uploadConfirmation
    Web-->>-Tenant: 14. displayWaitingVerificationStatus()

    API->>+Owner: 15. notifyPaymentReceived(invoiceId)
    Owner->>+Web: 16. reviewSlipAndVerify(invoiceId)
    Web->>+API: 17. confirmPayment(invoiceId)
    API->>+DB: 18. updateInvoiceStatus(Paid)
    DB-->>-API: 19. return statusPaidOk
    API->>+DB: 20. generateReceiptRecord(receiptNo)
    DB-->>-API: 21. return receiptId
    API-->>-Web: 22. return verificationSuccess
    Web-->>-Owner: 23. displayReceiptIssued()

    API-->>Tenant: 24. notifyPaymentCompleted(receiptNo)`
  },
  {
    id: 'maintenance',
    title: '5. แจ้งซ่อมและจ่ายงานช่าง/แม่บ้าน (Maintenance & Dispatch)',
    badge: 'Tenant / Owner / Keeper',
    category: 'การบริการ & ซ่อมบำรุง',
    description: 'ผู้เช่าแจ้งปัญหาในห้องพัก เจ้าของหอพักรับเรื่องและมอบหมายงานให้ช่างหรือแม่บ้าน จากนั้นทีมผู้ดูแลอัปเดตสถานะการแก้ไขจนเสร็จสิ้น',
    actors: [':Tenant', ':SmartDomWeb', ':MaintenanceController', ':Database', ':Owner', ':Keeper'],
    steps: [
      { step: 1, actor: ':Tenant', action: 'submitMaintenanceRequest(issue, details, photo)', target: ':SmartDomWeb' },
      { step: 2, actor: ':MaintenanceController', action: 'insertTicket(status: Pending)', target: ':Database' },
      { step: 3, actor: ':Owner', action: 'reviewTicketAndAssign(ticketId, keeperId)', target: ':MaintenanceController' },
      { step: 4, actor: ':Keeper', action: 'openJobDetails(ticketId)', target: ':SmartDomWeb' },
      { step: 5, actor: ':Keeper', action: 'performRepairOrCleaning()', target: ':Keeper' },
      { step: 6, actor: ':Keeper', action: 'markJobComplete(afterPhoto, costNote)', target: ':MaintenanceController' }
    ],
    mermaidCode: `sequenceDiagram
    autonumber
    participant Tenant as :Tenant
    participant Web as :SmartDomWeb
    participant API as :MaintenanceController
    participant DB as :Database
    participant Owner as :Owner
    participant Keeper as :Keeper

    Tenant->>+Web: 1. submitMaintenanceRequest(issue, details, photo)
    Web->>+API: 2. createTicket(payload)
    API->>+DB: 3. insertTicket(status: Pending)
    DB-->>-API: 4. return ticketId
    API-->>-Web: 5. return ticketSubmitted
    Web-->>-Tenant: 6. displayTicketTrackingNumber()

    API->>+Owner: 7. notifyNewTicket(ticketId)
    Owner->>+Web: 8. reviewTicketAndAssign(ticketId, keeperId)
    Web->>+API: 9. assignTicket(ticketId, keeperId)
    API->>+DB: 10. updateTicket(Assigned, assignedTo: keeperId)
    DB-->>-API: 11. return updatedOk
    API-->>-Web: 12. return assignSuccess
    Web-->>-Owner: 13. displayAssignedStatus()

    API->>+Keeper: 14. dispatchJobToKeeperPortal(ticketId)
    Keeper->>+Web: 15. openJobDetails(ticketId)
    Web->>+API: 16. getJobDetails(ticketId)
    API->>+DB: 17. queryTicketDetails()
    DB-->>-API: 18. return ticketData
    API-->>-Web: 19. return jobJSON
    Web-->>-Keeper: 20. displayIssueAndTenantContact()

    Keeper->>Keeper: 21. performRepairOrCleaning()
    Keeper->>+Web: 22. markJobComplete(afterPhoto, costNote)
    Web->>+API: 23. completeJob(ticketId, payload)
    API->>+DB: 24. updateTicketStatus(Completed, completedAt)
    DB-->>-API: 25. return completedOk
    API-->>-Web: 26. return jobFinishedSuccess
    Web-->>-Keeper: 27. displayJobClosed()

    API-->>Tenant: 28. notifyRepairFinished()`
  },
  {
    id: 'chat',
    title: '6. ระบบสนทนาสื่อสาร (Live Chat Messaging)',
    badge: 'Tenant / Owner',
    category: 'การสื่อสาร',
    description: 'การรับส่งข้อความ Real-time ระหว่างผู้เช่าแต่ละห้องกับเจ้าของหอพัก เพื่อสอบถามข้อมูล ร้องเรียน หรือประสานงานด่วน',
    actors: [':Tenant', ':TenantClient', ':ChatController', ':Database', ':OwnerClient', ':Owner'],
    steps: [
      { step: 1, actor: ':Tenant', action: 'composeMessage(text, attachment)', target: ':TenantClient' },
      { step: 2, actor: ':ChatController', action: 'insertMessage(sender, recipient, content)', target: ':Database' },
      { step: 3, actor: ':Owner', action: 'openConversationAndReply(replyText)', target: ':OwnerClient' },
      { step: 4, actor: ':ChatController', action: 'pushNewMessageEvent(replyPayload)', target: ':TenantClient' }
    ],
    mermaidCode: `sequenceDiagram
    autonumber
    participant Tenant as :Tenant
    participant TApp as :TenantClient
    participant API as :ChatController
    participant DB as :Database
    participant OApp as :OwnerClient
    participant Owner as :Owner

    Tenant->>+TApp: 1. composeMessage(text, attachment)
    TApp->>+API: 2. sendMessage(payload)
    API->>+DB: 3. insertMessage(sender: Tenant, recipient: Owner, content)
    DB-->>-API: 4. return messageId
    API-->>-TApp: 5. return { success: true, messageId, timestamp }
    TApp-->>-Tenant: 6. appendMessageToChatView()

    API->>+OApp: 7. pushNewMessageEvent(messagePayload)
    OApp-->>-Owner: 8. showNotificationBadge()

    Owner->>+OApp: 9. openConversationAndReply(replyText)
    OApp->>+API: 10. sendReply(replyPayload)
    API->>+DB: 11. insertMessage(sender: Owner, recipient: Tenant, content)
    DB-->>-API: 12. return replyMessageId
    API-->>-OApp: 13. return { success: true, replyMessageId }
    OApp-->>-Owner: 14. appendReplyToChatView()

    API->>+TApp: 15. pushNewMessageEvent(replyPayload)
    TApp-->>-Tenant: 16. displayOwnerReply()`
  },
  {
    id: 'dorm_mgmt',
    title: '7. จัดการหอพักและห้องพัก (Dorm & Room Management)',
    badge: 'Owner / Admin',
    category: 'การบริหารจัดการ',
    description: 'การลงทะเบียนหอพัก การเพิ่มห้องพัก กำหนดราคา อุปกรณ์สิ่งอำนวยความสะดวก และการตั้งค่าอัตราค่าน้ำค่าไฟ',
    actors: [':Owner', ':SmartDomWeb', ':RoomController', ':Database', ':PlatformAdmin', ':PublicExplore'],
    steps: [
      { step: 1, actor: ':Owner', action: 'inputRoomData(roomNumber, floor, price, amenities)', target: ':SmartDomWeb' },
      { step: 2, actor: ':RoomController', action: 'insertRoomRecord(status: Available, dormId)', target: ':Database' },
      { step: 3, actor: ':PlatformAdmin', action: 'auditDormitoryOverview(/admin/rooms)', target: ':SmartDomWeb' },
      { step: 4, actor: ':PublicExplore', action: 'browseRoomsInDormitory(/explore/[dormId])', target: ':SmartDomWeb' }
    ],
    mermaidCode: `sequenceDiagram
    autonumber
    participant Owner as :Owner
    participant Web as :SmartDomWeb
    participant API as :RoomController
    participant DB as :Database
    participant Admin as :PlatformAdmin
    participant Public as :PublicExplore

    Owner->>+Web: 1. inputRoomData(roomNumber, floor, price, amenities)
    Web->>+API: 2. createRoom(payload)
    API->>+DB: 3. insertRoomRecord(status: Available, dormId)
    DB-->>-API: 4. return roomId
    API-->>-Web: 5. return { success: true, roomId }
    Web-->>-Owner: 6. displayRoomCreatedSuccessfully()

    Admin->>+Web: 7. auditDormitoryOverview(/admin/rooms)
    Web->>+API: 8. getPlatformRoomsSummary()
    API->>+DB: 9. queryAllDormRooms()
    DB-->>-API: 10. return roomRecords
    API-->>-Web: 11. return adminRoomSummary
    Web-->>-Admin: 12. renderPlatformRoomsAuditTable()

    Public->>+Web: 13. browseRoomsInDormitory(/explore/[dormId])
    Web->>+API: 14. getExploreRooms(status: Available)
    API->>+DB: 15. queryPublicAvailableRooms()
    DB-->>-API: 16. return availableRooms
    API-->>-Web: 17. return publicRoomsJSON
    Web-->>-Public: 18. renderAvailableRoomCards()`
  }
];

export const erDiagramMermaid = `erDiagram
    %% Core Entities
    USERS ||--o{ DORMITORY_REGISTRY : "owns"
    USERS ||--o{ USER_DORM_ROLES : "assigned_role"
    USERS ||--o{ TENANTS : "has_account"
    USERS ||--o{ KEEPERS : "has_account"
    USERS ||--o{ NOTIFICATIONS : "receives"
    USERS ||--o{ BOOKING_PROGRESS : "requests"
    USERS ||--o{ SUBSCRIPTIONS : "purchases"

    DORMITORY_REGISTRY ||--|| DORMITORY_PROFILE : "profile"
    DORMITORY_REGISTRY ||--o{ ROOMS : "contains"
    DORMITORY_REGISTRY ||--o{ TENANTS : "registers"
    DORMITORY_REGISTRY ||--o{ KEEPERS : "employs"
    DORMITORY_REGISTRY ||--o{ BILLS : "issues"
    DORMITORY_REGISTRY ||--o{ METER_READINGS : "measures"
    DORMITORY_REGISTRY ||--o{ ANNOUNCEMENTS : "posts"
    DORMITORY_REGISTRY ||--o{ ACCOUNTING_TRANSACTIONS : "logs"
    DORMITORY_REGISTRY ||--o{ SUBSCRIPTIONS : "licensed_for"

    PACKAGES ||--o{ SUBSCRIPTIONS : "defines_tier"

    ROOMS ||--o{ CONTRACTS : "bounded_by"
    ROOMS ||--o{ BILLS : "billed_for"
    ROOMS ||--o{ METER_READINGS : "measured_at"
    ROOMS ||--o{ MAINTENANCE_JOBS : "repaired_in"
    ROOMS ||--o{ CLEANING_JOBS : "cleaned_in"
    ROOMS ||--o{ BOOKING_PROGRESS : "booked_in"
    ROOMS ||--o{ MOVE_OUT_REQUESTS : "vacated_from"

    TENANTS ||--o{ CONTRACTS : "signs"
    TENANTS ||--o{ BILLS : "pays"
    TENANTS ||--o{ MAINTENANCE_REQUESTS : "reports"
    TENANTS ||--o{ MOVE_OUT_REQUESTS : "submits"
    TENANTS ||--o{ ANNOUNCEMENT_READS : "acknowledges"

    ANNOUNCEMENTS ||--o{ ANNOUNCEMENT_READS : "tracked_in"
    KEEPERS ||--o{ KEEPER_DORMITORIES : "manages"

    USERS {
        int id PK
        string email
        string password
        string name
        string role
        string primary_role
        string sub_role
        string phone
        boolean is_active
        timestamp created_at
    }

    PLATFORM_ADMINS {
        int id PK
        string name
        string email
        string password
        string role
        boolean is_active
        timestamp created_at
    }

    DORMITORY_REGISTRY {
        int id PK
        int owner_id FK
        string dorm_name
        string db_name
        string owner_name
        string owner_email
        string phone
        string address
        string status
        int coins
        timestamp created_at
    }

    DORMITORY_PROFILE {
        int id PK
        int dorm_id FK
        int owner_id FK
        string name
        string address
        string phone
        string tax_id
        decimal water_rate
        decimal electricity_rate
        string promptpay_number
        string promptpay_name
    }

    ROOMS {
        int id PK
        int dorm_id FK
        string room_number
        string room_type
        decimal price
        int floor
        string status
        string image_url
    }

    TENANTS {
        int id PK
        int dorm_id FK
        int user_id FK
        int room_id FK
        string name
        string email
        string phone
        string status
    }

    CONTRACTS {
        int id PK
        int tenant_id FK
        int room_id FK
        date start_date
        date end_date
        decimal deposit_amount
        string status
        string contract_file_url
        string slip_url
        boolean renewal_requested
    }

    BILLS {
        int id PK
        int dorm_id FK
        int tenant_id FK
        string room_number
        string billing_cycle
        date due_date
        decimal amount
        decimal room_amount
        decimal water_amount
        decimal electric_amount
        string status
        string slip_url
    }

    METER_READINGS {
        int id PK
        int dorm_id FK
        int room_id FK
        string type
        decimal previous_reading
        decimal current_reading
        string billing_cycle
    }

    KEEPERS {
        int id PK
        int dorm_id FK
        int user_id FK
        string name
        string email
        string phone
        string position
    }

    KEEPER_DORMITORIES {
        int id PK
        int user_id FK
        int keeper_id FK
        int dorm_id FK
    }

    MAINTENANCE_REQUESTS {
        int id PK
        int dorm_id FK
        int tenant_id FK
        string room_number
        string issue_type
        string description
        string status
        string image_url
    }

    MAINTENANCE_JOBS {
        int id PK
        int room_id FK
        string issue
        string urgency
        string status
        int assigned_to FK
        string notes
        string photo_url
    }

    CLEANING_JOBS {
        int id PK
        int dorm_id FK
        int room_id FK
        string task
        string job_type
        string status
        int assigned_to FK
    }

    BOOKING_PROGRESS {
        int id PK
        int guest_id FK
        int room_id FK
        string status
        string notes
    }

    MOVE_OUT_REQUESTS {
        int id PK
        int tenant_id FK
        int room_id FK
        date move_out_date
        string reason
        string status
    }

    ANNOUNCEMENTS {
        int id PK
        int dorm_id FK
        string title
        string content
        string category
        boolean is_important
        boolean is_active
    }

    ANNOUNCEMENT_READS {
        int id PK
        int announcement_id FK
        int tenant_id FK
        timestamp read_at
    }

    ACCOUNTING_TRANSACTIONS {
        int id PK
        int dorm_id FK
        string type
        string category
        decimal amount
        string description
        date transaction_date
    }

    NOTIFICATIONS {
        int id PK
        int user_id FK
        string title
        string message
        string type
        boolean is_read
    }

    PACKAGES {
        int id PK
        string name
        decimal price
        int max_rooms
        int max_dorms
        string features
        int duration_days
    }

    SUBSCRIPTIONS {
        int id PK
        int owner_id FK
        int dormitory_id FK
        int package_id FK
        string status
        date start_date
        date end_date
        decimal amount_paid
    }

    USER_DORM_ROLES {
        int id PK
        int user_id FK
        int dorm_id FK
        string role
        string sub_role
        boolean is_active
    }`;

export interface DbTableInfo {
  name: string;
  category: string;
  description: string;
  primaryKey: string;
  columnsCount: number;
  relationships: string[];
}

export const dbTablesData: DbTableInfo[] = [
  {
    name: 'users',
    category: 'ผู้ใช้งาน & สิทธิ์',
    description: 'ตารางเก็บข้อมูลผู้ใช้งานหลักในระบบ (Email, Password Hash, Role, Sub-role, Primary Role)',
    primaryKey: 'id',
    columnsCount: 10,
    relationships: ['dormitory_registry (owner_id)', 'user_dorm_roles (user_id)', 'tenants (user_id)', 'keepers (user_id)', 'notifications (user_id)']
  },
  {
    name: 'platform_admins',
    category: 'ผู้ใช้งาน & สิทธิ์',
    description: 'ตารางเฉพาะผู้ดูแลระบบระดับแพลตฟอร์ม (Platform Admin) เพื่อความปลอดภัยสูงสุด',
    primaryKey: 'id',
    columnsCount: 7,
    relationships: ['ผู้ดูแลส่วนกลาง']
  },
  {
    name: 'user_dorm_roles',
    category: 'ผู้ใช้งาน & สิทธิ์',
    description: 'ตารางจับคู่ความสัมพันธ์ระหว่าง User กับ หอพัก พร้อมสิทธิ์การเข้าถึงแบบ Multi-tenant',
    primaryKey: 'id',
    columnsCount: 7,
    relationships: ['users (user_id)', 'dormitory_registry (dorm_id)']
  },
  {
    name: 'notifications',
    category: 'ผู้ใช้งาน & สิทธิ์',
    description: 'ตารางบันทึกการแจ้งเตือน Real-time ถึงผู้ใช้งานแต่ละคน',
    primaryKey: 'id',
    columnsCount: 8,
    relationships: ['users (user_id)']
  },
  {
    name: 'dormitory_registry',
    category: 'หอพัก & ทะเบียน',
    description: 'ทะเบียนหอพักหลักในแพลตฟอร์ม SmartDom เก็บชื่อหอพัก เจ้าของ เหรียญ และสถานะเปิดบริการ',
    primaryKey: 'id',
    columnsCount: 12,
    relationships: ['users (owner_id)', 'rooms (dorm_id)', 'tenants (dorm_id)', 'bills (dorm_id)', 'contracts (dorm_id)']
  },
  {
    name: 'dormitory_profile',
    category: 'หอพัก & ทะเบียน',
    description: 'ข้อมูลสาธารณะและสิ่งอำนวยความสะดวก ค่าน้ำ ค่าไฟ พิกัด และ PromptPay ของหอพัก',
    primaryKey: 'id',
    columnsCount: 19,
    relationships: ['dormitory_registry (dorm_id)', 'users (owner_id)']
  },
  {
    name: 'dormitory_packages / packages',
    category: 'หอพัก & ทะเบียน',
    description: 'แพ็กเกจการใช้งาน SaaS สำหรับเจ้าของหอพัก (ราคา, จำนวนห้องสูงสุด, ฟีเจอร์)',
    primaryKey: 'id',
    columnsCount: 7,
    relationships: ['subscriptions (package_id)']
  },
  {
    name: 'subscriptions',
    category: 'หอพัก & ทะเบียน',
    description: 'ประวัติการสมัครและต่ออายุแพ็กเกจ SaaS ของเจ้าของหอพัก',
    primaryKey: 'id',
    columnsCount: 9,
    relationships: ['users (owner_id)', 'dormitory_registry (dormitory_id)', 'packages (package_id)']
  },
  {
    name: 'rooms',
    category: 'ห้องพัก & ผู้เช่า',
    description: 'รายการห้องพักทั้งหมด หมายเลขห้อง ชั้น ประเภทห้อง ราคา และสถานะว่าง/มีผู้เช่า',
    primaryKey: 'id',
    columnsCount: 9,
    relationships: ['dormitory_registry (dorm_id)', 'contracts (room_id)', 'bills (room_id)', 'meter_readings (room_id)']
  },
  {
    name: 'tenants',
    category: 'ห้องพัก & ผู้เช่า',
    description: 'ทะเบียนประวัติลูกหอที่เข้าพักอาศัย ผูกกับ User Account และหมายเลขห้องพัก',
    primaryKey: 'id',
    columnsCount: 9,
    relationships: ['dormitory_registry (dorm_id)', 'users (user_id)', 'rooms (room_id)']
  },
  {
    name: 'booking_progress',
    category: 'ห้องพัก & ผู้เช่า',
    description: 'รายการจองห้องพักของผู้สนใจเช่า สถานะการจอง และสลิปเงินมัดจำ',
    primaryKey: 'id',
    columnsCount: 6,
    relationships: ['users (guest_id)', 'rooms (room_id)']
  },
  {
    name: 'contracts',
    category: 'สัญญา & การเงิน',
    description: 'สัญญาเช่าห้องพัก วันที่เริ่มต้น-สิ้นสุด เงินมัดจำ ลายเซ็น และไฟล์ภาพสแกนสัญญาฉบับจริง',
    primaryKey: 'id',
    columnsCount: 17,
    relationships: ['tenants (tenant_id)', 'rooms (room_id)', 'contracts (parent_contract_id)']
  },
  {
    name: 'bills',
    category: 'สัญญา & การเงิน',
    description: 'ใบแจ้งหนี้ค่าเช่าห้อง ค่าน้ำ ค่าไฟ ยอดเงิน สลิปโอนเงิน และสถานะการชำระ',
    primaryKey: 'id',
    columnsCount: 16,
    relationships: ['dormitory_registry (dorm_id)', 'tenants (tenant_id)']
  },
  {
    name: 'meter_readings',
    category: 'สัญญา & การเงิน',
    description: 'บันทึกประวัติการจดเลขมิเตอร์น้ำและไฟประจำงวด เพื่อคำนวณจำนวนหน่วยใช้งาน',
    primaryKey: 'id',
    columnsCount: 8,
    relationships: ['dormitory_registry (dorm_id)', 'rooms (room_id)']
  },
  {
    name: 'accounting_transactions',
    category: 'สัญญา & การเงิน',
    description: 'บันทึกบัญชีรายรับ-รายจ่ายของหอพัก หมวดหมู่ ค่าซ่อมแซม ค่าแม่บ้าน รายได้ค่าเช่า',
    primaryKey: 'id',
    columnsCount: 9,
    relationships: ['dormitory_registry (dorm_id)']
  },
  {
    name: 'move_out_requests',
    category: 'บริการ & ซ่อมบำรุง',
    description: 'คำร้องขอย้ายออกจากห้องพักล่วงหน้า นัดหมายวันตรวจห้องและคืนเงินประกัน',
    primaryKey: 'id',
    columnsCount: 7,
    relationships: ['tenants (tenant_id)', 'rooms (room_id)']
  },
  {
    name: 'maintenance_requests',
    category: 'บริการ & ซ่อมบำรุง',
    description: 'ใบแจ้งซ่อมจากผู้เช่า ระบุประเภทอาการ ภาพถ่ายความเสียหาย และสถานะการซ่อม',
    primaryKey: 'id',
    columnsCount: 10,
    relationships: ['dormitory_registry (dorm_id)', 'tenants (tenant_id)']
  },
  {
    name: 'maintenance_jobs',
    category: 'บริการ & ซ่อมบำรุง',
    description: 'ใบสั่งงานซ่อมบำรุงที่มอบหมายให้ช่าง บันทึกอาการ ความเร่งด่วน และรูปภาพหลังซ่อม',
    primaryKey: 'id',
    columnsCount: 11,
    relationships: ['rooms (room_id)', 'users/keepers (assigned_to)']
  },
  {
    name: 'cleaning_jobs',
    category: 'บริการ & ซ่อมบำรุง',
    description: 'รายการงานทำความสะอาดห้องพักที่มอบหมายให้แม่บ้าน ตรวจสอบความเรียบร้อย',
    primaryKey: 'id',
    columnsCount: 11,
    relationships: ['dormitory_registry (dorm_id)', 'rooms (room_id)', 'users/keepers (assigned_to)']
  },
  {
    name: 'keepers',
    category: 'ทีมงาน & ดูแล',
    description: 'ทะเบียนประวัติทีมงานผู้ดูแลหอพัก (ช่างซ่อมบำรุง และ แม่บ้าน)',
    primaryKey: 'id',
    columnsCount: 8,
    relationships: ['dormitory_registry (dorm_id)', 'users (user_id)']
  },
  {
    name: 'keeper_dormitories',
    category: 'ทีมงาน & ดูแล',
    description: 'ตารางผูกสิทธิ์ช่างหรือแม่บ้านเข้ากับหลายหอพัก (Multi-Dormitory Assignment)',
    primaryKey: 'id',
    columnsCount: 5,
    relationships: ['users (user_id)', 'keepers (keeper_id)', 'dormitory_registry (dorm_id)']
  },
  {
    name: 'announcements',
    category: 'สื่อสาร & ข่าวสาร',
    description: 'ประกาศข่าวสาร กฎระเบียบ แจ้งเตือนด่วน หรือข่าวสารจากเจ้าของหอพัก',
    primaryKey: 'id',
    columnsCount: 8,
    relationships: ['dormitory_registry (dorm_id)']
  },
  {
    name: 'announcement_reads',
    category: 'สื่อสาร & ข่าวสาร',
    description: 'บันทึกประวัติการเปิดอ่านประกาศของลูกหอแต่ละคนเพื่อตรวจสอบการรับทราบ',
    primaryKey: 'id',
    columnsCount: 4,
    relationships: ['announcements (announcement_id)', 'tenants (tenant_id)']
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// DATA FLOW DIAGRAMS (DFD) - Level 0 (Context Diagram), Level 1, Level 2
// ─────────────────────────────────────────────────────────────────────────────

export interface DfdLevel {
  id: string;
  level: string;
  title: string;
  badge: string;
  description: string;
  entities: string[];
  processes: { id: string; name: string; desc: string }[];
  dataStores: { id: string; name: string; table: string }[];
  mermaidCode: string;
  keyDataFlows: { from: string; to: string; flow: string }[];
}

export const dfdData: DfdLevel[] = [
  {
    id: 'dfd-context',
    level: 'Level 0',
    title: 'Context Diagram (แผนภาพบริบทระดับ 0)',
    badge: 'Overview',
    description: 'แสดงขอบเขตภาพรวมสูงสุดของระบบ SmartDom แพลตฟอร์มบริหารจัดการหอพัก ม.พะเยา การเชื่อมโยงกระแสข้อมูลระหว่างระบบหลักกับกลุ่มผู้ใช้งานภายนอก (External Entities) ทั้ง 5 กลุ่ม',
    entities: [
      'ผู้เยี่ยมชมทั่วไป (Guest / Public User)',
      'ผู้เช่า (Tenant)',
      'เจ้าของหอพัก (Owner)',
      'ผู้ดูแลหอพัก: แม่บ้าน & ช่าง (Keeper)',
      'ผู้ดูแลระบบส่วนกลาง (Platform Admin)'
    ],
    processes: [
      { id: 'P0', name: 'ระบบบริหารจัดการหอพัก SmartDom SaaS Platform', desc: 'ศูนย์กลางประมวลผลธุรกรรม จัดเก็บข้อมูล และประสานงานระหว่างผู้ใช้งานทุกกลุ่ม' }
    ],
    dataStores: [
      { id: 'DB', name: 'SmartDom Unified Database (kesorn_db)', table: 'All Tables (24 Tables)' }
    ],
    keyDataFlows: [
      { from: 'ผู้เยี่ยมชม (Guest)', to: 'SmartDom', flow: 'ข้อมูลค้นหาหอพัก, ข้อมูลการจองห้องพัก, สลิปมัดจำ' },
      { from: 'SmartDom', to: 'ผู้เยี่ยมชม (Guest)', flow: 'รายการหอพัก/ห้องพักว่าง, QR Code มัดจำ, ผลการอนุมัติการจอง' },
      { from: 'ผู้เช่า (Tenant)', to: 'SmartDom', flow: 'สลิปชำระค่าเช่า, ใบแจ้งซ่อม, ข้อความแชท, คำร้องย้ายออก' },
      { from: 'SmartDom', to: 'ผู้เช่า (Tenant)', flow: 'สัญญาเช่า, ใบแจ้งหนี้/ใบเสร็จ, สถานะงานซ่อม, ข่าวสารประกาศ' },
      { from: 'เจ้าของหอพัก (Owner)', to: 'SmartDom', flow: 'ข้อมูลหอพัก/ห้อง, เลขมิเตอร์น้ำ-ไฟ, บัญชีรายรับ-จ่าย, การอนุมัติสัญญา' },
      { from: 'SmartDom', to: 'เจ้าของหอพัก (Owner)', flow: 'สถิติภาพรวม, รายการจองค้างตรวจ, สลิปค่าเช่ารอตรวจ, สรุปบัญชีการเงิน' },
      { from: 'ผู้ดูแล (Keeper)', to: 'SmartDom', flow: 'อัปเดตสถานะงานซ่อม/ทำความสะอาด, บันทึกค่าอะไหล่, รูปผลงาน' },
      { from: 'SmartDom', to: 'ผู้ดูแล (Keeper)', flow: 'รายการใบงานที่มอบหมาย (Cleaning/Repair Jobs)' },
      { from: 'แอดมินส่วนกลาง (Admin)', to: 'SmartDom', flow: 'การกำหนดสิทธิ์, ประกาศข่าวสารมหาวิทยาลัย' },
      { from: 'SmartDom', to: 'แอดมินส่วนกลาง (Admin)', flow: 'สถิติหอพักรวม, รายงานสถานะระบบและผู้ใช้งาน' }
    ],
    mermaidCode: `flowchart TD
    classDef entity fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#f8fafc,rx:8px;
    classDef process fill:#0284c7,stroke:#0369a1,stroke-width:3px,color:#ffffff,rx:30px;

    %% External Entities
    E1["👤 ผู้เยี่ยมชมทั่วไป (Guest / Public)"]:::entity
    E2["🏠 ผู้เช่าห้องพัก (Tenant)"]:::entity
    E3["🏢 เจ้าของหอพัก (Dorm Owner)"]:::entity
    E4["🔧 ทีมงานผู้ดูแล (Keeper: Maid/Tech)"]:::entity
    E5["🛡️ แอดมินส่วนกลาง (Platform Admin)"]:::entity

    %% Central Process
    P0(["(0) ระบบบริหารจัดการหอพัก SmartDom SaaS Platform"]):::process

    %% Data Flows
    E1 -->|"1. ค้นหาหอพัก / ขอจองห้อง / สลิปมัดจำ"| P0
    P0 -->|"2. ข้อมูลห้องว่าง / QR PromptPay / ผลอนุมัติ"| E1

    E2 -->|"3. สลิปค่าเช่า / แจ้งซ่อม / แชท / ขอย้ายออก"| P0
    P0 -->|"4. สัญญาเช่า / บิลรายเดือน / ใบเสร็จ / ผลซ่อม"| E2

    E3 -->|"5. ข้อมูลห้อง / จดมิเตอร์ / อนุมัติจอง / รายจ่าย"| P0
    P0 -->|"6. สถิติหอพัก / สลิปตรวจชำระ / สรุปบัญชี"| E3

    E4 -->|"7. รายงานผลงาน / บันทึกอะไหล่ / ภาพถ่ายงานเสร็จ"| P0
    P0 -->|"8. รายการงานซ่อม / ใบงานทำความสะอาดห้อง"| E4

    E5 -->|"9. นโยบายสิทธิ์ / ข่าวสารประกาศส่วนกลาง"| P0
    P0 -->|"10. สถิติแพลตฟอร์ม / รายงานการใช้งานรวม"| E5`
  },
  {
    id: 'dfd-level-1',
    level: 'Level 1',
    title: 'DFD Level 1 (แผนภาพกระแสข้อมูลระดับ 1)',
    badge: 'System Decomposition',
    description: 'แตกกระบวนการหลักของระบบ SmartDom ออกเป็น 7 กระบวนการย่อย (Sub-processes: 1.0 - 7.0) พร้อมแสดงการจัดเก็บและดึงข้อมูลจาก Data Stores (D1 - D7) ภายในฐานข้อมูล kesorn_db',
    entities: [
      'ผู้เยี่ยมชม (Guest)',
      'ผู้เช่า (Tenant)',
      'เจ้าของหอพัก (Owner)',
      'ผู้ดูแลหอพัก (Keeper)',
      'แอดมินส่วนกลาง (Admin)'
    ],
    processes: [
      { id: '1.0', name: 'ยืนยันตัวตนและจัดการสิทธิ์ (Authentication & RBAC)', desc: 'ตรวจสอบการล็อกอิน ออก JWT Session และจำแนกสิทธิ์ตามบทบาทผู้ใช้' },
      { id: '2.0', name: 'สำรวจและจองห้องพัก (Explore & Booking)', desc: 'ค้นหาหอพัก จองห้องพัก คำนวณเงินมัดจำ และสร้าง QR Code ชำระเงิน' },
      { id: '3.0', name: 'จัดการสัญญาและผู้เช่า (Contracts & Tenants)', desc: 'บันทึกสัญญาเช่า อนุมัติการเข้าพัก ยื่นต่ออายุสัญญา และคำร้องย้ายออก' },
      { id: '4.0', name: 'คำนวณมิเตอร์และออกบิล (Meters & Billing)', desc: 'บันทึกมิเตอร์น้ำ-ไฟ (รองรับ AI OCR), คำนวณยอดเงินรวม และออกใบแจ้งหนี้' },
      { id: '5.0', name: 'ชำระเงินและบัญชีการเงิน (Payments & Accounting)', desc: 'ตรวจสอบสลิปโอนเงิน อนุมัติใบเสร็จรับเงิน และสรุปบัญชีกำไรขาดทุน' },
      { id: '6.0', name: 'บริการแจ้งซ่อมและดูแลห้อง (Maintenance & Keeper)', desc: 'รับเรื่องแจ้งซ่อม จ่ายงานให้ช่าง/แม่บ้าน บันทึกค่าอะไหล่ และปิดใบงาน' },
      { id: '7.0', name: 'สื่อสารและแจ้งเตือน (Chat & Announcements)', desc: 'ส่งข้อความสนทนาแบบเรียลไทม์ และกระจายประกาศข่าวสารของหอพัก' }
    ],
    dataStores: [
      { id: 'D1', name: 'Users & Roles Data', table: 'users, accounts' },
      { id: 'D2', name: 'Dormitories & Rooms Data', table: 'dormitory_registry, rooms, room_types' },
      { id: 'D3', name: 'Bookings & Contracts Data', table: 'bookings, contracts, tenants, move_out_requests' },
      { id: 'D4', name: 'Meters & Tariffs Data', table: 'meter_readings, utility_rates' },
      { id: 'D5', name: 'Billing & Accounting Data', table: 'bills, bill_items, accounting_transactions' },
      { id: 'D6', name: 'Maintenance & Jobs Data', table: 'maintenance_requests, maintenance_updates, keepers' },
      { id: 'D7', name: 'Communication Data', table: 'conversations, messages, announcements, notifications' }
    ],
    keyDataFlows: [
      { from: 'ผู้เยี่ยมชม (Guest)', to: 'Process 2.0', flow: 'เลือกห้อง + ข้อมูลจอง + สลิปมัดจำ' },
      { from: 'Process 2.0', to: 'D3 Bookings', flow: 'บันทึกคำขอจองห้อง (Status: Pending)' },
      { from: 'Owner', to: 'Process 3.0', flow: 'อนุมัติการจอง + อัปโหลดสัญญาเช่า' },
      { from: 'Process 3.0', to: 'D3 Contracts', flow: 'ผูกสัญญา + สร้างสถานะ Tenant' },
      { from: 'Owner', to: 'Process 4.0', flow: 'บันทึกค่ามิเตอร์น้ำ-ไฟ' },
      { from: 'Process 4.0', to: 'D5 Billing', flow: 'สร้างใบแจ้งหนี้ประจำงวด' },
      { from: 'Tenant', to: 'Process 5.0', flow: 'สลิปโอนชำระเงินค่าเช่า' },
      { from: 'Process 5.0', to: 'Owner', flow: 'รายการสลิปรอตรวจสอบยอดเงิน' },
      { from: 'Tenant', to: 'Process 6.0', flow: 'แจ้งปัญหาชำรุด + แนบรูป' },
      { from: 'Process 6.0', to: 'Keeper', flow: 'จ่ายงานซ่อมบำรุง / ทำความสะอาด' }
    ],
    mermaidCode: `flowchart TD
    classDef entity fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#f8fafc,rx:8px;
    classDef proc fill:#0369a1,stroke:#0284c7,stroke-width:2px,color:#ffffff,rx:20px;
    classDef store fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#e0e7ff;

    %% External Entities
    Guest["👤 ผู้เยี่ยมชม (Guest)"]:::entity
    Tenant["🏠 ผู้เช่า (Tenant)"]:::entity
    Owner["🏢 เจ้าของหอพัก (Owner)"]:::entity
    Keeper["🔧 ผู้ดูแล (Keeper)"]:::entity

    %% Processes
    P1(["(1.0) ยืนยันตัวตน (Auth & RBAC)"]):::proc
    P2(["(2.0) สำรวจ & จองห้อง (Booking)"]):::proc
    P3(["(3.0) จัดการสัญญา (Contracts)"]):::proc
    P4(["(4.0) คำนวณมิเตอร์ & ออกบิล (Bills)"]):::proc
    P5(["(5.0) ชำระเงิน & บัญชี (Payments)"]):::proc
    P6(["(6.0) แจ้งซ่อม & ดูแลหอ (Maintenance)"]):::proc
    P7(["(7.0) สื่อสาร & ข่าวสาร (Chat & News)"]):::proc

    %% Data Stores
    D1[("D1: Users & Roles")]:::store
    D2[("D2: Dorms & Rooms")]:::store
    D3[("D3: Contracts & Tenants")]:::store
    D4[("D4: Utility Meters")]:::store
    D5[("D5: Bills & Accounts")]:::store
    D6[("D6: Maintenance Jobs")]:::store
    D7[("D7: Communication")]:::store

    %% Data Flows - Auth
    Guest -.->|"สมัครสมาชิก / ล็อกอิน"| P1
    Owner -.->|"ล็อกอินเข้าสู่ระบบ"| P1
    P1 -->|"ตรวจสอบสิทธิ์ผู้ใช้"| D1
    D1 -->|"ส่งคืนสถานะสิทธิ์และโปรไฟล์"| P1

    %% Booking Flow
    Guest -->|"1. ค้นหาห้อง & ยื่นคำขอจอง"| P2
    D2 -->|"ดึงข้อมูลห้องว่างและอัตราค่าเช่า"| P2
    P2 -->|"บันทึกคำขอจอง + สลิปมัดจำ"| D3

    %% Contract Flow
    Owner -->|"2. อนุมัติจอง & ทำสัญญาเช่า"| P3
    P3 -->|"บันทึกสัญญา / เพิ่มสิทธิ์ผู้เช่า"| D3
    P3 -->|"อัปเดตสถานะห้องเป็นไม่ว่าง"| D2

    %% Meter & Billing Flow
    Owner -->|"3. บันทึกเลขมิเตอร์น้ำ-ไฟ"| P4
    D4 -->|"อ่านประวัติเลขงวดก่อนหน้า"| P4
    P4 -->|"บันทึกเลขมิเตอร์งวดใหม่"| D4
    P4 -->|"สร้างใบแจ้งหนี้ประจำเดือน"| D5
    D5 -->|"ส่งใบแจ้งหนี้ให้ลูกหอ"| Tenant

    %% Payment Flow
    Tenant -->|"4. อัปโหลดสลิปโอนเงิน"| P5
    P5 -->|"ปรับสถานะบิลเป็นรอตรวจสอบ"| D5
    P5 -->|"แจ้งเตือนสลิปใหม่ให้เจ้าของตรวจ"| Owner
    Owner -->|"อนุมัติการชำระเงิน"| P5
    P5 -->|"บันทึกรายรับเข้าสมุดบัญชี"| D5
    P5 -->|"ส่งใบเสร็จรับเงินดิจิทัล"| Tenant

    %% Maintenance Flow
    Tenant -->|"5. ยื่นเรื่องแจ้งซ่อม + รูปถ่าย"| P6
    P6 -->|"บันทึกใบแจ้งซ่อมใหม่"| D6
    Owner -->|"มอบหมายงานให้ช่าง/แม่บ้าน"| P6
    P6 -->|"ส่งใบงานมอบหมาย"| Keeper
    Keeper -->|"อัปเดตงานสำเร็จ + บันทึกค่าอะไหล่"| P6
    P6 -->|"บันทึกประวัติความคืบหน้างาน"| D6
    P6 -.->|"ลงบัญชีค่าใช้จ่ายซ่อมแซม"| D5

    %% Communication Flow
    Tenant -->|"6. ส่งข้อความแชท"| P7
    Owner -->|"ตอบแชท / ออกประกาศข่าวสาร"| P7
    P7 -->|"จัดเก็บข้อความและประวัติการอ่าน"| D7`
  },
  {
    id: 'dfd-level-2-billing',
    level: 'Level 2',
    title: 'DFD Level 2: กระบวนการออกบิลและชำระเงิน (4.0 & 5.0)',
    badge: 'Detailed Flow',
    description: 'ขยายรายละเอียดการทำงานของกระบวนการด้านการเงิน (Core Financial & Utility Cycle) ตั้งแต่การบันทึกมิเตอร์น้ำ-ไฟ ด้วย Smart OCR, การคำนวณเงิน, การออกบิล, การตรวจสลิปโอนเงิน จนถึงการบันทึกบัญชีรายรับ-รายจ่าย',
    entities: [
      'เจ้าของหอพัก (Owner)',
      'ผู้เช่าห้องพัก (Tenant)'
    ],
    processes: [
      { id: '4.1', name: 'บันทึกหน่วยมิเตอร์ (Capture/Input Meters)', desc: 'กรอกตัวเลขโดยตรง หรือถ่ายรูปมิเตอร์เพื่อให้อัลกอริทึม OCR อ่านตัวเลขโดยอัตโนมัติ' },
      { id: '4.2', name: 'คำนวณส่วนต่างและค่าสาธารณูปโภค (Calculate Utilities)', desc: 'นำเลขงวดล่าสุดลบเลขงวดก่อนหน้า แล้วคูณอัตราค่าน้ำ/ค่าไฟต่อหน่วยตามที่หอพักกำหนด' },
      { id: '4.3', name: 'ประมวลผลออกใบแจ้งหนี้ (Generate Monthly Bills)', desc: 'รวมค่าเช่าห้อง ค่าสาธารณูปโภค ค่าบริการส่วนกลาง และสร้างรายการบิลประจำเดือน' },
      { id: '5.1', name: 'สแกนจ่ายและส่งสลิป (Submit Payment Slip)', desc: 'ผู้เช่าเปิดดูบิล สแกน QR Code PromptPay ที่สร้างตามยอดจริง และอัปโหลดสลิปธนาคาร' },
      { id: '5.2', name: 'ตรวจสอบและอนุมัติการชำระเงิน (Verify Payment)', desc: 'เจ้าของหอพักตรวจสอบหลักฐานสลิป ยอดเงิน และกดยืนยันชำระ (Approve Payment)' },
      { id: '5.3', name: 'ออกใบเสร็จและลงบัญชี (Issue Receipt & Record Ledger)', desc: 'ระบบเปลี่ยนสถานะเป็น Paid, ออกใบเสร็จดิจิทัล และบันทึกลงบัญชีรายรับอัตโนมัติ' }
    ],
    dataStores: [
      { id: 'D4', name: 'meter_readings (ประวัติมิเตอร์)', table: 'meter_readings' },
      { id: 'D2', name: 'rooms & rates (ค่าห้องและอัตราหน่วย)', table: 'rooms, dormitory_registry' },
      { id: 'D5.1', name: 'bills & bill_items (ใบแจ้งหนี้และรายการ)', table: 'bills, bill_items' },
      { id: 'D5.2', name: 'accounting_transactions (สมุดบัญชีการเงิน)', table: 'accounting_transactions' }
    ],
    keyDataFlows: [
      { from: 'Owner', to: 'Process 4.1', flow: 'ภาพถ่ายมิเตอร์ / ตัวเลขมิเตอร์' },
      { from: 'Process 4.1', to: 'D4 meter_readings', flow: 'บันทึก current_reading' },
      { from: 'D4 + D2', to: 'Process 4.2', flow: 'previous_reading, unit_rate' },
      { from: 'Process 4.2', to: 'Process 4.3', flow: 'ยอดเงินค่าน้ำ, ยอดเงินค่าไฟ' },
      { from: 'Process 4.3', to: 'D5.1 bills', flow: 'บันทึกสถานะบิล (Status: Pending)' },
      { from: 'Tenant', to: 'Process 5.1', flow: 'สลิปโอนเงิน + เวลาที่โอน' },
      { from: 'Process 5.1', to: 'Process 5.2', flow: 'ส่งรายการบิลพร้อมสลิปให้ตรวจสอบ' },
      { from: 'Owner', to: 'Process 5.2', flow: 'ผลการยืนยันยอดเงิน (Approved)' },
      { from: 'Process 5.3', to: 'D5.2 accounting', flow: 'บันทึกรายรับ (Income Transaction)' },
      { from: 'Process 5.3', to: 'Tenant', flow: 'ใบเสร็จรับเงินดิจิทัล (Receipt)' }
    ],
    mermaidCode: `flowchart TD
    classDef entity fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#f8fafc,rx:8px;
    classDef proc fill:#0369a1,stroke:#0284c7,stroke-width:2px,color:#ffffff,rx:18px;
    classDef store fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#e0e7ff;

    Owner["🏢 เจ้าของหอพัก (Owner)"]:::entity
    Tenant["🏠 ผู้เช่าห้องพัก (Tenant)"]:::entity

    P41(["(4.1) บันทึกเลขมิเตอร์ (Input/OCR)"]):::proc
    P42(["(4.2) คำนวณค่าน้ำ-ไฟ (Calculate)"]):::proc
    P43(["(4.3) ประมวลผลออกบิล (Gen Bills)"]):::proc
    P51(["(5.1) ชำระเงิน & ส่งสลิป (Pay & Slip)"]):::proc
    P52(["(5.2) ตรวจสลิป & อนุมัติ (Verify)"]):::proc
    P53(["(5.3) ออกใบเสร็จ & ลงบัญชี (Receipt)"]):::proc

    D4[("D4: meter_readings")]:::store
    D2[("D2: rooms & rates")]:::store
    D51[("D5.1: bills & bill_items")]:::store
    D52[("D5.2: accounting_transactions")]:::store

    %% Sub-flows
    Owner -->|"1. กรอกตัวเลข / ถ่ายรูปมิเตอร์"| P41
    P41 -->|"บันทึกเลขมิเตอร์ล่าสุด"| D4

    D4 -->|"ดึงเลขมิเตอร์งวดก่อนหน้า + งวดปัจจุบัน"| P42
    D2 -->|"อัตราค่าน้ำและค่าไฟต่อหน่วย"| P42
    P42 -->|"ยอดเงินค่าน้ำและค่าไฟ"| P43

    D2 -->|"ค่าเช่าห้องรายเดือนตามสัญญา"| P43
    P43 -->|"บันทึกใบแจ้งหนี้ประจำงวด"| D51

    D51 -->|"2. แสดงใบแจ้งหนี้ + QR PromptPay"| Tenant
    Tenant -->|"3. สแกนจ่าย + อัปโหลดสลิปธนาคาร"| P51
    P51 -->|"อัปเดตสลิปและปรับสถานะบิล"| D51

    D51 -->|"4. แจ้งเตือนสลิปรอตรวจสอบยอดเงิน"| Owner
    Owner -->|"5. กดยืนยันยอดเงินถูกต้อง"| P52
    P52 -->|"ปรับสถานะบิลเป็น Approved"| D51

    P52 -->|"6. ส่งคำสั่งบันทึกบัญชีการเงิน"| P53
    P53 -->|"บันทึกรายรับเข้าสมุดบัญชีหอพัก"| D52
    P53 -->|"7. ออกใบเสร็จรับเงินดิจิทัล"| Tenant`
  },
  {
    id: 'dfd-level-2-maintenance',
    level: 'Level 2',
    title: 'DFD Level 2: กระบวนการแจ้งซ่อมและงานแม่บ้าน (6.0)',
    badge: 'Detailed Flow',
    description: 'ขยายรายละเอียดการทำงานของระบบบริการลูกหอและการซ่อมบำรุง เชื่อมโยงความต้องการของผู้เช่า การบริหารจัดการของเจ้าของหอพัก และการปฏิบัติงานหน้างานของแม่บ้านและช่างประจำหอพัก',
    entities: [
      'ผู้เช่า (Tenant)',
      'เจ้าของหอพัก (Owner)',
      'ผู้ดูแลหอพัก (Keeper)'
    ],
    processes: [
      { id: '6.1', name: 'ส่งเรื่องแจ้งซ่อม (Submit Request)', desc: 'ผู้เช่ากรอกรายละเอียดปัญหา เลือกหมวดหมู่ (น้ำ, ไฟ, แอร์, เฟอร์นิเจอร์) พร้อมถ่ายภาพแนบ' },
      { id: '6.2', name: 'คัดกรองและมอบหมายงาน (Triage & Assign Task)', desc: 'เจ้าของหอพักตรวจสอบระดับความเร่งด่วน และมอบหมายงานให้ช่างหรือแม่บ้าน' },
      { id: '6.3', name: 'เข้าดำเนินการและบันทึกผล (Execute & Update Progress)', desc: 'ผู้ดูแลรับงาน ติดต่อผู้เช่า ดำเนินการซ่อม/ทำความสะอาด บันทึกค่าอะไหล่ และถ่ายรูปผลงาน' },
      { id: '6.4', name: 'ปิดงานและบันทึกค่าใช้จ่าย (Close Task & Expense)', desc: 'เจ้าของหอตรวจรับงาน ปิดใบแจ้งซ่อม และบันทึกค่าอะไหล่/ค่าจ้างเข้าสมุดบัญชีรายจ่าย' }
    ],
    dataStores: [
      { id: 'D6.1', name: 'maintenance_requests (คำขอแจ้งซ่อม)', table: 'maintenance_requests' },
      { id: 'D6.2', name: 'maintenance_updates (บันทึกความคืบหน้า)', table: 'maintenance_updates' },
      { id: 'D6.3', name: 'keepers (ทะเบียนช่าง/แม่บ้าน)', table: 'keepers, keeper_dormitories' },
      { id: 'D5.2', name: 'accounting_transactions (สมุดบัญชีรายจ่าย)', table: 'accounting_transactions' }
    ],
    keyDataFlows: [
      { from: 'Tenant', to: 'Process 6.1', flow: 'ข้อมูลอาการชำรุด + ภาพถ่าย' },
      { from: 'Process 6.1', to: 'D6.1 requests', flow: 'บันทึกคำขอ (Status: Pending)' },
      { from: 'Owner', to: 'Process 6.2', flow: 'เลือกช่าง/แม่บ้านที่รับผิดชอบ' },
      { from: 'Process 6.2', to: 'Keeper', flow: 'แจ้งเตือนใบงานใหม่ (Assigned)' },
      { from: 'Keeper', to: 'Process 6.3', flow: 'อัปเดตสถานะ (In Progress / Completed) + รูปภาพ' },
      { from: 'Process 6.3', to: 'D6.2 updates', flow: 'บันทึกประวัติการเข้าดำเนินการ' },
      { from: 'Owner', to: 'Process 6.4', flow: 'อนุมัติปิดงาน' },
      { from: 'Process 6.4', to: 'D5.2 accounting', flow: 'บันทึกค่าอะไหล่เป็นรายจ่าย (Expense)' },
      { from: 'Process 6.4', to: 'Tenant', flow: 'แจ้งเตือนงานเสร็จสมบูรณ์' }
    ],
    mermaidCode: `flowchart TD
    classDef entity fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#f8fafc,rx:8px;
    classDef proc fill:#0369a1,stroke:#0284c7,stroke-width:2px,color:#ffffff,rx:18px;
    classDef store fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#e0e7ff;

    Tenant["🏠 ผู้เช่า (Tenant)"]:::entity
    Owner["🏢 เจ้าของหอพัก (Owner)"]:::entity
    Keeper["🔧 ผู้ดูแล (Keeper: Maid/Tech)"]:::entity

    P61(["(6.1) ส่งเรื่องแจ้งซ่อม (Submit)"]):::proc
    P62(["(6.2) คัดกรอง & มอบหมายงาน (Assign)"]):::proc
    P63(["(6.3) ลงมือปฏิบัติงาน (Execute)"]):::proc
    P64(["(6.4) ตรวจรับ & ปิดงาน (Close Task)"]):::proc

    D61[("D6.1: maintenance_requests")]:::store
    D62[("D6.2: maintenance_updates")]:::store
    D63[("D6.3: keepers")]:::store
    D52[("D5.2: accounting_transactions")]:::store

    %% Sub-flows
    Tenant -->|"1. ส่งคำขอแจ้งซ่อม + ภาพจุดชำรุด"| P61
    P61 -->|"บันทึกคำขอใหม่ (Status: Pending)"| D61

    D61 -->|"2. รายการคำขอค้างจัดสรรงาน"| Owner
    D63 -->|"ดึงรายชื่อช่าง/แม่บ้านประจำหอพัก"| P62
    Owner -->|"3. มอบหมายงานให้ผู้รับผิดชอบ"| P62
    P62 -->|"อัปเดตผู้รับผิดชอบงาน"| D61

    P62 -->|"4. แจ้งเตือนใบงานใหม่"| Keeper
    Keeper -->|"5. อัปเดตสถานะงาน + รูปผลงาน"| P63
    P63 -->|"บันทึกไทม์ไลน์ความคืบหน้า"| D62
    P63 -->|"แจ้งเตือนสถานะงานซ่อม"| Tenant

    Keeper -->|"6. ส่งรายการค่าอะไหล่และอุปกรณ์"| Owner
    Owner -->|"7. ยืนยันตรวจรับและปิดงานซ่อม"| P64
    P64 -->|"ปรับสถานะงานเป็น Resolved"| D61
    P64 -->|"8. บันทึกค่าใช้จ่ายซ่อมแซม"| D52
    P64 -->|"9. แจ้งเตือนผลการปิดงานสำเร็จ"| Tenant`
  }
];

