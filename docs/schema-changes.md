# การเปลี่ยนแปลง schema สาขา `completeness` (migration 001–016)

สำหรับวาด ER ใหม่และตรวจก่อน merge เข้า `main` · ไฟล์ migration อยู่ที่ `db/migrations/NNN_*.up.sql` / `*.down.sql` (รันตามลำดับเลข) · ตรวจกับฐาน dev ที่รันครบ 016 แล้ว

**หลักที่ใช้:** เพิ่มอย่างเดียว — ไม่มี `DROP COLUMN` / `RENAME COLUMN` / `DROP TABLE` ใน up-migration · มี `MODIFY` เฉพาะเพิ่มค่า ENUM และเปลี่ยน DEFAULT (ระบุไว้ในตาราง) · สถานะใหม่ของ `contracts.status` / `bills.status` เป็น varchar ไม่ต้องแก้ schema

FK: **D** = ประกาศจริงในฐาน · **I** = อ้างด้วยชื่อคอลัมน์ (ไม่มี FK constraint — โค้ดดูแลเอง)

---

## 1. สรุปทีละ migration

| # | ไฟล์ | เพิ่ม / เปลี่ยน | ข้อมูลเดิม (backfill) |
|---|---|---|---|
| 001 | `add_manager_role` | `users.role` ENUM เพิ่ม `'manager'` (MODIFY) | – · down ทำไม่ได้ถ้ายังมี user role manager |
| 002 | `add_late_fee_rate` | `dormitory_profile.late_fee_per_day DECIMAL(10,2) NOT NULL DEFAULT 50` | – |
| 003 | `add_contract_occupants` | `contracts.occupants INT NOT NULL DEFAULT 1` (ค่าน้ำคิดต่อคน) | สัญญาเดิม = 1 |
| 004 | `add_bill_payments` | **ตาราง `bill_payments`** · `bills.paid_at`, `bills.payment_method` | – |
| 005 | `bill_status_flow` | `bills.sent_at` · `bill_payments.voided_at/voided_by/void_reason` · **ตาราง `bill_status_history`** | – |
| 006 | `accounting_liability` | `accounting_transactions.type` ENUM เพิ่ม `'Liability'` (MODIFY) | แถวเดิมไม่แปลง (เงินประกันเก่ายังเป็น Income/Deposit, คืนเงินเป็น Expense/Deposit Refund) |
| 007 | `rooms_reserved` | `rooms.status` ENUM เพิ่ม `'Reserved'` (MODIFY) | ห้องที่ status ว่าง/NULL: มีสัญญา Active → Occupied · มีสัญญารอ (PendingOwnerSignature/PendingContract/PendingFirstBill) → Reserved · อื่น → Available |
| 008 | `contract_deposit_source` | `contracts.deposit_outside_system TINYINT NOT NULL DEFAULT 0`, `deposit_note VARCHAR(500)` | สัญญาเดิม = 0 |
| 009 | `booking_approval` | `contracts.approved_at/approved_by/expires_at/cancelled_at/cancelled_by/cancel_reason/booking_bill_id` · INDEX `(status, expires_at)` | – · สถานะใหม่ BookingRequested / BookingApproved / Expired / Rejected (varchar) |
| 010 | `contract_move_in` | `contracts.move_in_bill_id`, `start_meter_reading`, `paper_signed_date`, `paper_uploaded_at`, `paper_uploaded_by` | – · ไฟล์สัญญากระดาษ: `contract_file_url = 'paper:<file>'` ใน `storage/contracts` |
| 011 | `contract_inspections` | **ตาราง `contract_inspections`, `contract_inspection_items`** | – · รูปใน `storage/inspections` |
| 012 | `move_out_settlement` | **ตาราง `move_out_settlements`** · `bill_payments.method` ENUM เพิ่ม `'deposit_offset'` (MODIFY) | คำขอย้ายออกเดิมไม่แปลง (= "คำขอแบบเดิม — จัดการด้วยมือ") · ไฟล์สลิปคืนเงินใน `storage/move-out` |
| 013 | `work_orders` | เพิ่ม 24 คอลัมน์ใน `maintenance_requests` + 3 INDEX · **ตาราง `maintenance_photos`** | งานเดิม `state` = NULL ("งานแบบเดิม") · รูปใน `storage/maintenance` |
| 014 | `meters` | เพิ่ม 13 คอลัมน์ใน `meter_readings` รวม generated `cycle_key` + UNIQUE `uq_meter_cycle` + INDEX `(room_id, id)` | แถวเดิมทั้งหมด `kind = 'cycle'` · รูปใน `storage/meters` |
| 015 | `rates_settings` | `dormitory_profile.cleaning_fee` (300), `bank_name`, `bank_account`, `bank_account_name` · DEFAULT `water_rate` 18→100, `electricity_rate` 8→4.88 (MODIFY, แถวเดิมไม่เปลี่ยน) · `bills.late_fee_rate` · **ตาราง `rate_changes`** | บิลที่ส่งแล้ว (ไม่ใช่ Draft/Cancelled) ได้ `late_fee_rate` = อัตราปัจจุบัน |
| 016 | `timed_notifications` | `notifications.event_key VARCHAR(120)` + UNIQUE `(user_id, event_key)` · **ตาราง `job_runs`** | แจ้งเตือน `overdue_alert` เดิมได้ key `overdue15:<bill>` (แถวแรกต่อ user+link) · แทรก `job_runs ('reminders', '2000-01-01')` |

ข้อที่ต้องตรวจก่อนรัน (012–014) และโฟลเดอร์ `storage/*` อยู่ใน `docs/CHANGES-completeness.md` หัวข้อ deploy

---

## 2. ตารางใหม่

**`bill_payments`** (004/005/012) — การรับเงินแต่ละครั้ง (บิลหนึ่งรับได้หลายครั้ง)
- `id` PK · `bill_id` → bills (I) · `amount DECIMAL(10,2)` · `method ENUM('slip','cash','transfer','deposit_offset')` · `paid_at DATETIME` (เวลาโอนจริง) · `slip_ref VARCHAR(100)` (index, ไม่ unique — กันซ้ำในโค้ด) · `recorded_by` → users (I) · `note` · `created_at`
- ยกเลิก (ไม่ลบ): `voided_at`, `voided_by` → users (I), `void_reason`

**`bill_status_history`** (005) — ประวัติสถานะบิล
- `id` · `bill_id` → bills (I) · `from_status`, `to_status VARCHAR(30)` · `reason` · `changed_by` → users (I) · `changed_at`

**`contract_inspections`** (011) — ตรวจห้องตอนเข้าอยู่ / ย้ายออก
- `id` · `contract_id` → contracts (I) · `kind ENUM('move_in','move_out')` · UNIQUE `(contract_id, kind)` · `inspected_by` → users (I), `inspected_at` · `note` · `tenant_ack_at`, `tenant_ack_by` → users (I)

**`contract_inspection_items`** (011)
- `id` · `inspection_id` → contract_inspections (**D**, ON DELETE CASCADE) · `item_name` · `condition_status ENUM('Good','Damaged','Missing')` · `note` · `photo_file VARCHAR(64)` (ชื่อไฟล์ใน storage/inspections)

**`move_out_settlements`** (012) — การย้ายออก + ชำระ/คืนเงินประกัน (1:1 กับคำขอย้ายออก)
- `id` · `request_id` → move_out_requests (I, **UNIQUE**) · `contract_id` → contracts · `tenant_id` → tenants · `room_id` → rooms · `final_bill_id`, `damage_bill_id` → bills (I ทั้งหมด)
- `state ENUM('Notified','Returned','Settled','Closed','Cancelled')`
- วันที่: `notice_at`, `planned_return_date`, `paper_notice_date`, `return_date`, `returned_at`, `refund_due_date`, `settled_at`, `refunded_at`, `closed_at`, `cancelled_at`
- มิเตอร์: `prev_meter`, `final_meter` · ค่าเสียหาย: `damage_items TEXT` (JSON)
- เงื่อนไขคืนประกัน (สคบ. ข้อ 13): `early`, `c13_half`, `c13_notice`, `c13_no_arrears`, `refundable` (TINYINT)
- เงิน: `deposit_source`, `deposit_amount`, `deposit_note`, `deposit_confirmed_at`, `offset_total`, `forfeit_total`, `refund_amount`, `refund_file`
- ผู้ทำรายการ → users (I): `notice_by`, `returned_by`, `deposit_confirmed_by`, `settled_by`, `refunded_by`, `closed_by`, `cancelled_by`

**`maintenance_photos`** (013)
- `id` · `request_id` → maintenance_requests (I) · `stage ENUM('report','done')` · `file VARCHAR(64)` · `uploaded_by` → users (I), `uploaded_at`

**`rate_changes`** (015) — ประวัติแก้อัตรา/ข้อมูลรับเงิน
- `id` · `field VARCHAR(50)` · `old_value`, `new_value` · `changed_by` → users (I) · `changed_at` (index)

**`job_runs`** (016) — เวลาที่รันงานตามเวลาล่าสุด
- `name` PK · `ran_at` · ไม่มี relation (แถวเดียว `reminders`)

---

## 3. ตารางเดิมที่เปลี่ยน

**`bills`**
- เพิ่ม: `paid_at`, `payment_method` (สรุปการชำระ — รายละเอียดอยู่ใน bill_payments) · `sent_at` (เวลาส่งบิล Draft→Unpaid) · `late_fee_rate` (ค่าปรับ/วัน ณ วันส่ง; NULL = อัตราปัจจุบัน)
- ความหมายเปลี่ยน: `status` ใช้ Draft และ Partial จริง (ข้อ 4) · บิลผูกห้องด้วย `room_number` (string) ไม่ใช่ room_id · `common_fee` ของบิลเข้าอยู่ไม่ใช่ค่าใช้จ่ายจริง (ค่าส่วนกลางเก็บในบิลรายเดือน)

**`contracts`**
- เพิ่ม: `occupants` (003) · `deposit_outside_system`, `deposit_note` (008) · `approved_at/by`, `expires_at`, `cancelled_at/by`, `cancel_reason`, `booking_bill_id` (009) · `move_in_bill_id`, `start_meter_reading`, `paper_signed_date`, `paper_uploaded_at/by` (010)
- ความหมายเปลี่ยน: `status` มีค่าใหม่ (ข้อ 4) · `contract_file_url` อาจเป็น `paper:<file>` (ไฟล์นอก public เปิดผ่าน `/api/contracts/[id]/paper`) · `deposit_amount` ของสัญญาจากการจอง = ค่าจองระหว่างรอ แล้วปรับเป็นเงินประกันเต็มตอนสัญญามีผล

**`rooms`** — `status` เพิ่ม `Reserved` (007) · **เลิกใช้:** `water_rate`, `common_fee` (โค้ดไม่อ่าน/เขียนแล้ว ใช้อัตราจาก `dormitory_profile` ทั้งหอ — ยังไม่ DROP) · มีผลจริงแค่ `deposit_amount`

**`meter_readings`** (014) — เพิ่ม `kind ENUM('cycle','start','move_out')`, `event ENUM('normal','rollover','replaced')`, `rollover_at`, `old_meter_final`, `new_meter_start`, `event_note`, `large_confirmed`, `photo_file` (storage/meters; แถวเก่ายังใช้ `photo_url`), `recorded_by/at`, `confirmed_by/at` → users (I), `cycle_key` (generated: `room|type|cycle` เมื่อ kind = cycle) UNIQUE → **หนึ่งห้อง/ประเภท/รอบ มีเลขรอบได้แถวเดียว** · `previous_reading` มาจากแถวล่าสุดของห้องเสมอ (server)

**`maintenance_requests`** (013) — เพิ่ม `kind ENUM('repair','cleaning')`, `state`, `requested_by/at`, `contract_id`, `room_id`, `move_out_settlement_id`, `assigned_to/by/at`, `started_at`, `done_at`, `done_note`, `closed_reason/by/at`, `charge_proposed`, `charge_proposed_note`, `charge_amount`, `charge_reason ENUM('tenant_damage','wear_and_tear','service')`, `charge_note`, `charge_decided_by/at`, `charge_bill_id` · `state` NULL = งานแบบเดิม · คอลัมน์ `status` เดิมยังเขียนคู่กัน (Pending/InProgress/Completed)

**`notifications`** — `event_key` + UNIQUE `(user_id, event_key)` (016): แจ้งเตือนตามเวลาส่งครั้งเดียวต่อคนต่อเหตุการณ์ · แถวอื่น key = NULL

**`dormitory_profile`** — ที่เดียวที่เก็บอัตราและข้อมูลรับเงิน: `late_fee_per_day` (002), `cleaning_fee`, `bank_name`, `bank_account`, `bank_account_name` (015) · DEFAULT ของ `water_rate` / `electricity_rate` เปลี่ยน · `water_rate` = ต่อคนต่อเดือน, `common_fee` = ต่อห้องต่อเดือน

**`accounting_transactions`** — `type` เพิ่ม `Liability` (006) · `reference_id` เป็น polymorphic ตาม `reference_type` (ข้อ 4)

**`users`** — `role` เพิ่ม `manager` (001) · `sub_role` (`maid` / `technician`) แยกบอร์ดงานของ keeper

**ไม่ใช้แล้ว / อ่านอย่างเดียว:** `rooms.water_rate`, `rooms.common_fee` · `cleaning_jobs` (อ่านเป็นงานเดิม) · `room_inventory` (ต้นแบบรายการตรวจห้อง) · คอลัมน์ settlement เดิมใน `move_out_requests` (`net_refund_amount`, `settlement_type` …) ใช้กับคำขอแบบเดิมเท่านั้น

---

## 4. สถานะและการเปลี่ยนสถานะ

### bills.status
```
Draft ──sendBills──▶ Unpaid ──recordPayment──▶ Partial ──recordPayment──▶ Paid
                       ▲                                                   │
                       └──────────── unpayBill (owner + เหตุผล) ◀──────────┘
Unpaid ──dispute──▶ PendingCorrection (ตรึงยอด/ค่าปรับ)      * ──▶ Cancelled
```
- Draft: บิลรายเดือนจากเลขมิเตอร์ (`lib/meters.ts`) — ผู้เช่าไม่เห็น · ส่งแล้วได้ `due_date` (วันที่ 5 เดือนถัดไป, อย่างน้อย 3 วันหลังส่ง) และ `late_fee_rate`
- Unpaid ตั้งแต่สร้าง: บิลค่าจอง, บิลเข้าอยู่, บิลย้ายออก, ค่าเสียหาย/บริการ
- Paid: ทางเดียวคือ `lib/payments.ts recordPayment` (ล็อก — แก้ไม่ได้, ยกเลิกได้ด้วย `unpayBill` เท่านั้น)
- Cancelled: การจองหมดเวลา/ยกเลิก, บิลเข้าอยู่ที่ไม่จ่ายภายในวันเริ่มสัญญา, ร่างที่ไม่ใช้

**bills.bill_type:** `monthly` · `booking` (ค่าจอง และบิลเข้าอยู่ที่ `is_first_bill = 1`) · `move_out` · `move_out_damage` · `damage` · `service`

### contracts.status
```
(ขอจอง) BookingRequested ──approve──▶ BookingApproved ──payBooking──▶ PendingOwnerSignature
          │ reject → Rejected            │ หมดเวลา → Expired
          │ หมดเวลา 20:00 → Expired
(walk-in) ─────────────────────────────────────────────────────────▶ PendingOwnerSignature
PendingOwnerSignature / PendingContract ──issueMoveInBill──▶ PendingFirstBill
PendingFirstBill ──(บิลเข้าอยู่จ่ายครบ + อัปสัญญาที่เซ็น)──▶ Active      ไม่จ่ายภายในวันเริ่ม → Cancelled (ริบค่าจอง)
(owner สร้างตรง) ─────────────────────────────────────────────▶ Active
Active ──renewContract──▶ Renewed (+ สัญญาใหม่ parent_contract_id)
Active ──คืนห้อง (lib/moveOut.ts)──▶ Ended
```
- ห้องถูกถือ (`ROOM_HOLDING_STATUSES` ใน `lib/contracts.ts`): BookingRequested, BookingApproved, PendingOwnerSignature, PendingContract, PendingFirstBill, Active, MoveOutPending
- ค่าเดิมที่ยังอยู่ในฐาน: `MoveOutPending` (คำขอแบบเดิม), `Terminated` (ไม่มีโค้ดเขียนแล้ว)
- `rooms.status`: Reserved ระหว่างสัญญายังไม่ Active · Occupied เมื่อ Active · Available เมื่อปล่อยห้อง / คืนห้อง

### การจอง (booking) — อยู่ใน contracts
- ขอจองได้ 08:00–20:00 · ไม่อนุมัติภายใน 20:00 → Expired · อนุมัติแล้วต้องจ่ายค่าจองภายใน 10 นาที (อัปสลิปได้ถึง 15 นาที) → ไม่งั้น Expired · `expires_at` เก็บเส้นตาย · บิลค่าจอง = `booking_bill_id`

### maintenance_requests.state (`lib/maintenance.ts`)
```
Requested ──assign──▶ Assigned ──start──▶ InProgress
Requested ──claim (keeper)──▶ InProgress
InProgress ──finish──▶ Closed (ไม่มีค่าใช้จ่าย) | Done (เสนอค่าใช้จ่าย)
Done ──decideCharge (owner)──▶ Closed (+ บิล damage/service หรือหักในการย้ายออก)
Requested ──cancel (ผู้เช่า)──▶ Cancelled      Requested/Assigned ──reject──▶ Rejected
```

### move_out_settlements.state (`lib/moveOut.ts`)
`Notified` (แจ้งย้ายออก) → `Returned` (คืนห้อง: สัญญา Ended, ห้องว่าง, ออกบิลสุดท้าย) → `Settled` (หัก/ริบ/คำนวณคืน) → `Closed` (คืนเงินแล้ว, Liability ของห้องเหลือ 0) · ยกเลิก → `Cancelled`

### อื่น ๆ
- `meter_readings.kind`: cycle (ใช้คิดบิล) · start (เริ่มสัญญา) · move_out · `event`: normal · rollover · replaced
- `bill_payments.method`: slip · cash · transfer · deposit_offset (หักจากเงินประกันตอนย้ายออก)
- `contract_inspection_items.condition_status`: Good · Damaged · Missing
- `notifications.event_key`: `meter:<cycle>` · `due_soon:<bill>` · `due_today:<bill>` · `overdue15:<bill>` · `movein_due:<contract>` · `booking_expired:<contract>`

### accounting_transactions (reference_type → reference_id)
| type | category | reference_type | ref |
|---|---|---|---|
| Liability | Deposit | bill_payment | bill_payments.id (ส่วนเงินประกันของบิลจอง/บิลเข้าอยู่) |
| Income | Rent / Service / Damage | bill_payment | bill_payments.id |
| (กลับรายการ) | Reversal | bill_payment_reversal | bill_payments.id |
| Liability − / Income + | ริบเงินประกัน | booking_forfeit | bills.id |
| Liability / Income − | Deposit (deposit_reclass) | settlement_opening | move_out_settlements.id |
| Liability − | Deposit Offset | settlement_offset | move_out_settlements.id |
| Liability − / Income + | ริบเงินประกัน | settlement_forfeit | move_out_settlements.id |
| Liability − | Deposit Refund | settlement_refund | move_out_settlements.id |

ค่าเดิมที่ยังมีในฐาน: `reference_type = 'bill'`, `move_out_refund`, Income/Deposit

---

## 5. ความสัมพันธ์ทั้งหมด (สำหรับวาด ER)

| จาก | ไป | |
|---|---|---|
| tenants.user_id | users | D |
| tenants.room_id | rooms | D |
| rooms.tenant_id | tenants | D |
| contracts.tenant_id / room_id | tenants / rooms | D |
| contracts.parent_contract_id | contracts | I |
| contracts.booking_bill_id / move_in_bill_id | bills | I |
| contracts.approved_by / cancelled_by / paper_uploaded_by | users | I |
| bills.tenant_id | tenants | D |
| bills.room_number | rooms.room_number | I (string) |
| bill_payments.bill_id | bills | I |
| bill_payments.recorded_by / voided_by | users | I |
| bill_status_history.bill_id / changed_by | bills / users | I |
| bill_corrections.bill_id | bills | D |
| contract_inspections.contract_id | contracts | I |
| contract_inspections.inspected_by / tenant_ack_by | users | I |
| contract_inspection_items.inspection_id | contract_inspections | D (CASCADE) |
| room_inventory.room_id | rooms | D |
| move_out_requests.tenant_id / room_id | tenants / rooms | D |
| move_out_requests.contract_id | contracts | I |
| move_out_settlements.request_id | move_out_requests | I (1:1 unique) |
| move_out_settlements.contract_id / tenant_id / room_id | contracts / tenants / rooms | I |
| move_out_settlements.final_bill_id / damage_bill_id | bills | I |
| move_out_settlements.*_by | users | I |
| maintenance_requests.tenant_id | tenants | D |
| maintenance_requests.contract_id / room_id | contracts / rooms | I |
| maintenance_requests.move_out_settlement_id | move_out_settlements | I |
| maintenance_requests.charge_bill_id (และ bill_id เดิม) | bills | I |
| maintenance_requests.requested_by / assigned_to / assigned_by / closed_by / charge_decided_by | users | I |
| maintenance_photos.request_id / uploaded_by | maintenance_requests / users | I |
| meter_readings.room_id | rooms | D (CASCADE) |
| meter_readings.recorded_by / confirmed_by | users | I |
| notifications.user_id | users | D (CASCADE) |
| rate_changes.changed_by | users | I |
| accounting_transactions.reference_id | bill_payments / bills / move_out_settlements ตาม reference_type | I (polymorphic) |
| cleaning_jobs.room_id / assigned_to | rooms / users | D (ตารางเดิม) |

`dormitory_profile` และ `job_runs` ไม่มี relation (ทั้งระบบใช้ dorm_id = 1)
