# แผน deploy ทาง ก — นำฐานข้อมูลในเครื่องขึ้นเว็บ (ฐานใหม่ `kesorn_new`) + merge PR #1 → #2 → #3

สำหรับเพื่อนที่ดูแลเว็บ (เป็นคน merge) · ไฟล์นี้ไม่มีรหัสผ่าน/secret — ค่าจริงส่งแยกช่องทางส่วนตัว
อ้างอิง: [`docs/CHANGES-completeness.md`](CHANGES-completeness.md) (สิ่งที่เปลี่ยน) · [`docs/schema-changes.md`](schema-changes.md) (ฐานข้อมูล)

**หลักการ:** import ไฟล์ฐานที่ส่งให้ลง **ฐานใหม่ชื่อ `kesorn_new`** (ฐานเดิม `kesorn_db` บนเว็บไม่ถูกแตะ = เป็น backup ในตัว) → query ตรวจ → **รัน migration 018 → 019 → 020 → 021 บน `kesorn_new`** → แก้ `.env` ให้ `DATABASE_URL` ชี้ `kesorn_new` → merge PR #1 → #2 → #3 (= deploy อัตโนมัติ) → ตั้ง cron · ฐานที่ส่งให้รัน migration 001–017 ครบแล้ว และล้างข้อมูลทดสอบ/เลขบัตรแล้ว → บนเว็บรันเพิ่มแค่ **018 (PR #2), 019, 020 และ 021 (PR #3)** ในข้อ 4.5 · ใช้เวลาประมาณ 35 นาที แนะนำทำช่วงคนใช้น้อย

**ลำดับทั้งหมด:** import (ข้อ 3) → ตรวจ (ข้อ 4) → 018 → 019 → 020 → 021 (ข้อ 4.5) → `.env` (ข้อ 5.3) → merge PR #1 → #2 → #3 (ข้อ 5.4) → cron (ข้อ 6)

---

## 0. ข้อมูลก่อนเริ่ม
| รายการ | ค่า |
|---|---|
| ไฟล์ฐานข้อมูล | `kesorn_db_20261015_1723.sql` (382,030 ไบต์ ≈ 0.4 MB · ส่งแยก — ไม่อยู่ใน git) |
| sha256 | `80ac8dab3828d886739f340d0f9d716a383a38ba292edccdc728c4f4d301d404` |
| ต้นทาง | MariaDB 10.4.32 (XAMPP) · utf8mb4 · 41 ตาราง (`utf8mb4_unicode_ci` 36, `utf8mb4_general_ci` 5) · ไม่มี view / routine / trigger / event / DEFINER · ไฟล์ไม่มี `CREATE DATABASE` / `USE` → import ลงฐานชื่ออะไรก็ได้ |
| ปลายทาง | MariaDB บน XAMPP (เหมือนเครื่อง dev) |
| `AUTH_SECRET` | ค่าที่ใช้บนเว็บอยู่แล้ว หรือสร้างใหม่ (`openssl rand -base64 32`) — ห้ามใช้ค่าจากเครื่อง dev |
| `CRON_SECRET` | สร้างใหม่ (`openssl rand -hex 32`) |

ทดสอบบนเครื่อง dev แล้ว: import ไฟล์นี้ลงฐานใหม่ได้ข้อมูลตรงต้นฉบับทุกตาราง (CHECKSUM 41/41) · แอปที่ชี้ `DATABASE_URL` ไปฐานใหม่อ่านและเขียนฐานใหม่ทั้งหมด

⚠️ **โค้ดเดิมบน `main` อ่านฐานชื่อ `kesorn_db` ตายตัว** (ไม่สนชื่อฐานใน `DATABASE_URL`) แต่ส่วนรับเงิน/สัญญาใช้ `DATABASE_URL` ตรง ๆ → **ห้ามให้โค้ดเดิมรันกับ `DATABASE_URL` = `kesorn_new`** (ข้อมูลจะแยกไป 2 ฐาน) · โค้ดใน PR นี้แก้แล้ว (`lib/db.ts` ใช้ชื่อฐานจาก `DATABASE_URL`) → ทำตามลำดับในข้อ 5
ตรวจด้วยว่า `DATABASE_URL` บนเว็บตอนนี้ลงท้าย `/kesorn_db` (ถ้าเป็นชื่ออื่น แจ้งก่อน)

---

## 1. backup (ฐานเดิมไม่ถูกแตะอยู่แล้ว แต่ทำไว้)
**phpMyAdmin:** เลือกฐาน `kesorn_db` → แท็บ *Export* → Quick, SQL → Go → เก็บไฟล์
**หรือ XAMPP Shell:**
```
cd C:\xampp\mysql\bin
mysqldump.exe -u root -p --single-transaction --routines --triggers --default-character-set=utf8mb4 kesorn_db > C:\backup\kesorn_db_before_completeness.sql
```
และคัดลอกโฟลเดอร์ `public\uploads` ของแอปเก็บไว้ (zip)

## 2. ตรวจไฟล์ที่ได้รับ (sha256)
PowerShell: `Get-FileHash .\kesorn_db_20261015_1723.sql -Algorithm SHA256`
หรือ cmd: `certutil -hashfile kesorn_db_20261015_1723.sql SHA256`
ต้องได้ `80ac8dab3828d886739f340d0f9d716a383a38ba292edccdc728c4f4d301d404` (ไม่สนตัวพิมพ์เล็ก/ใหญ่) — ไม่ตรง ห้าม import

## 3. import ลงฐานใหม่ `kesorn_new`
**phpMyAdmin**
1. แท็บ *Databases* → Create database: ชื่อ `kesorn_new` · Collation `utf8mb4_unicode_ci` → Create
2. เลือก `kesorn_new` → แท็บ *Import* → เลือกไฟล์ `.sql` → Character set `utf-8` → Go
3. ต้องขึ้น "Import has been successfully finished" และฝั่งซ้ายมี 41 ตาราง

ไฟล์ ~0.4 MB เล็กกว่าขีดจำกัด upload ของ phpMyAdmin บน XAMPP (ดูได้ที่หน้า Import "Max: …") · **ถ้าไฟล์ใหญ่กว่าที่ phpMyAdmin รับ (`upload_max_filesize`)** ใช้ XAMPP Shell แทน:
```
cd C:\xampp\mysql\bin
mysql.exe -u root -p -e "CREATE DATABASE kesorn_new CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mysql.exe -u root -p --default-character-set=utf8mb4 kesorn_new < C:\path\kesorn_db_20261015_1723.sql
```

## 4. query ตรวจ `kesorn_new` (phpMyAdmin แท็บ SQL ของ `kesorn_new`)
```sql
SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'kesorn_new' AND TABLE_TYPE = 'BASE TABLE';   -- 41
SELECT status, COUNT(*) FROM rooms GROUP BY status;                    -- Available 17 · Occupied 4 (รวม 21)
SELECT GROUP_CONCAT(room_number ORDER BY room_number+0) FROM rooms WHERE status = 'Occupied';   -- 5,9,11,20
SELECT status, COUNT(*) FROM bills GROUP BY status;                    -- Paid 1 · PendingCorrection 1 · Unpaid 2 (รวม 4)
SELECT COUNT(*), SUM(amount) FROM bill_payments;                       -- 1 · 4138.00 (บิล #203, การชำระ #1643)
SELECT type, COUNT(*), SUM(amount) FROM accounting_transactions GROUP BY type;
                                                                        -- Income 13 แถว 37738.00 · Expense 3 แถว 22350.00 · ไม่มี Liability
SELECT status, COUNT(*) FROM contracts GROUP BY status;                -- Active 4 · Cancelled 3 · PendingFirstBill 2 · Renewed 1 (รวม 10)
SELECT COUNT(*), SUM(is_active = 1) FROM users;                        -- 166 · 147
SELECT COUNT(*) FROM tenants;                                          -- 4
SELECT COUNT(*) FROM notifications;                                    -- 580
SELECT COUNT(*) FROM maintenance_requests;                             -- 4
SELECT COUNT(*) FROM move_out_requests;                                -- 19
SELECT COUNT(*) FROM tenants   WHERE id_card_number IS NOT NULL OR id_card_image IS NOT NULL;   -- 0
SELECT COUNT(*) FROM contracts WHERE id_card_number IS NOT NULL OR id_card_image IS NOT NULL;   -- 0
SELECT electricity_rate, water_rate, common_fee, late_fee_per_day, cleaning_fee, promptpay_number FROM dormitory_profile;
                                                                        -- 4.88 · 100.00 · 150.00 · 50.00 · 300.00 · 0636040550
SELECT name FROM job_runs;                                             -- reminders
```
ค่าไม่ตรง → หยุด (ไม่ต้องย้อนอะไร — เว็บยังใช้ `kesorn_db` เดิม) · แจ้งกลับพร้อมผล query

## 4.5 รัน migration 018 → 019 → 020 → 021 บน `kesorn_new` (ตามลำดับ · ก่อนแก้ `.env`)
ไฟล์อยู่ใน branch ของ PR (`db/migrations/`) · รันกับ **`kesorn_new` เท่านั้น** (ห้ามรันกับ `kesorn_db` เดิม) · 018/019 แค่เพิ่มคอลัมน์ว่าง (NULL) · 020 เพิ่มตารางใหม่ว่าง ๆ · 021 เพิ่มคอลัมน์ว่าง (NULL) 3 คอลัมน์ + ตารางใหม่ว่าง 1 ตาราง · ไม่แก้ข้อมูลเดิม (สัญญาเดิมยังมีผู้พัก 1 คนตามที่บันทึกไว้)
```
cd C:\xampp\mysql\bin
mysql.exe -u root -p --default-character-set=utf8mb4 kesorn_new < C:\path\app\db\migrations\018_landlord_contact.up.sql
mysql.exe -u root -p --default-character-set=utf8mb4 kesorn_new < C:\path\app\db\migrations\019_inspection_item_quantity.up.sql
mysql.exe -u root -p --default-character-set=utf8mb4 kesorn_new < C:\path\app\db\migrations\020_contract_occupant_changes.up.sql
mysql.exe -u root -p --default-character-set=utf8mb4 kesorn_new < C:\path\app\db\migrations\021_booking_steps.up.sql
```
(phpMyAdmin: เลือก `kesorn_new` → แท็บ *Import* → ไฟล์ 018 ก่อน แล้ว 019 แล้ว 020 แล้ว 021)

| migration | PR | ทำอะไร | ตรวจ (แท็บ SQL ของ `kesorn_new`) |
|---|---|---|---|
| 018 | #2 | `dormitory_profile.landlord_name`, `landlord_phone` (ชื่อ/โทรผู้ให้เช่าในสัญญา) | `SHOW COLUMNS FROM dormitory_profile LIKE 'landlord%';` → 2 แถว |
| 019 | #3 | `contract_inspection_items.quantity` INT NULL (จำนวนของที่นับได้ เช่น กุญแจห้อง / รีโมทแอร์ ในผลตรวจห้อง) | `SHOW COLUMNS FROM contract_inspection_items LIKE 'quantity';` → 1 แถว `int(11)` `YES` |
| 020 | #3 | ตารางใหม่ `contract_occupant_changes` (ประวัติการแก้จำนวนผู้พักระหว่างสัญญา: เดิม → ใหม่, ใครแก้, เมื่อไร, เหตุผล) | `SELECT COUNT(*) FROM contract_occupant_changes;` → 0 · `SELECT occupants, COUNT(*) FROM contracts GROUP BY occupants;` → 1 คน ทุกสัญญา (ไม่เปลี่ยน) |
| 021 | #3 | ขั้นตอนจอง → เป็นลูกหอ 7 ขั้น: `contracts.data_confirmed_at`, `data_confirmed_by` (ยืนยันข้อมูลสัญญา ขั้น 3) · `contract_inspections.ack_paper_by` (ใครบันทึกว่าผู้เช่ารับทราบผลตรวจบนกระดาษ) · ตารางใหม่ `contract_data_changes` (ประวัติการแก้ข้อมูลสัญญาหลังยืนยัน: เดิม → ใหม่, เหตุผล, ใคร, เมื่อไร) | `SHOW COLUMNS FROM contracts LIKE 'data_confirmed%';` → 2 แถว · `SHOW COLUMNS FROM contract_inspections LIKE 'ack_paper_by';` → 1 แถว · `SELECT COUNT(*) FROM contract_data_changes;` → 0 |

**ห้องทดสอบ T01 (id 21 — มีอยู่ในไฟล์ฐานที่ import):** T01 (id 21) = ห้องทดสอบ ซ่อนจากหน้าสาธารณะ ไม่นับในรายงาน เข้าได้ด้วยลิงก์ตรง `/explore/room/21`
- หน้าห้องมีป้าย "ห้องทดสอบระบบ" · จองได้ตามปกติ (เจ้าของหออนุมัติ) · ใช้ราคาเดโม (ค่าจอง 1 บาท ฯลฯ) ไว้ทดสอบรับเงินจริง
- ตัวเลขของเจ้าของหอ (รายงาน / dashboard / ยอดสรุปบัญชี) ไม่นับ T01 · รายการของ T01 ในบัญชี / บิล / สัญญา / หน้าห้อง ยังแสดง พร้อมป้าย "ทดสอบ"
- **ไม่ต้องตั้ง Maintenance · ห้ามลบ · ห้ามแก้ฐานข้อมูล**

ย้อนกลับ (ถ้าต้อง): รัน `021_…down.sql` → `020_…down.sql` → `019_…down.sql` → `018_…down.sql` (ลำดับกลับกัน) · ไม่มีคอลัมน์/ตาราง 018–021 แล้ว merge → หน้าตั้งค่า/สัญญา หน้าตรวจห้อง การแก้จำนวนผู้พัก และหน้ารายการจอง error

## 5. ตั้งค่า → เปลี่ยน DATABASE_URL → merge
ทำต่อเนื่องกัน ตามลำดับ:
1. **โฟลเดอร์ที่แอปต้องเขียนได้** (นอก public — ไม่อยู่ใน git) ในโฟลเดอร์แอป:
   `storage\contracts`, `storage\inspections`, `storage\move-out`, `storage\maintenance`, `storage\meters`
2. **ห้ามลบ `public\uploads\` เดิม** — ฐานอ้างไฟล์เก่า 12 ไฟล์ (สลิป 6, ไฟล์สัญญา 2, รูปมิเตอร์ 4) ที่ไม่มีในเครื่อง dev ถ้าบนเว็บมีจะยังเปิดได้
3. **แก้ env ของ production** (ไฟล์ `.env` / `.env.local` ของแอปบนเว็บ — ชื่อตัวแปรทั้งหมดดู `.env.example`):
   - `DATABASE_URL` = `mysql://<user>:<pass>@localhost:3306/kesorn_new`
   - `AUTH_SECRET` = มีค่า (บังคับ — ไม่มีค่าสำรองในโค้ด)
   - `CRON_SECRET` = ค่าใหม่
   - `SLIPOK_API_KEY` และ `SLIPOK_ENDPOINT` = **คีย์ใหม่ที่สร้างเองที่ SlipOK** (บังคับ — โค้ดไม่มีค่าสำรองแล้ว · ไม่ตั้ง = ระบบตรวจสลิปตอบ "ยังไม่ได้ตั้งค่า SlipOK" และไม่รับสลิป) · คีย์เก่ายังอยู่ในประวัติ git → ห้ามใช้ต่อ ให้ยกเลิก (revoke) ที่ SlipOK
   - `CLOUDFLARE_TURNSTILE_SECRET_KEY` และ `NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY` = คีย์จริงของเว็บจาก Cloudflare Turnstile (บังคับ — โค้ดไม่มีค่าสำรองแล้ว · ไม่ตั้ง = หน้าสมัครสมาชิกขึ้น "ยังไม่ได้ตั้งค่า" และส่ง OTP ไม่ได้ · คีย์ทดสอบ `1x000…` และโทเคน mock ใช้ได้เฉพาะเครื่อง dev) · `NEXT_PUBLIC_…` ถูกฝังตอน build → ต้องตั้ง**ก่อน** build/merge
   - **อย่ารีสตาร์ทแอปตรงนี้** — แอปที่รันอยู่ยังเป็นโค้ดเดิมกับ env เดิมจนกว่าจะ deploy
4. **merge PR #1 → #2 → #3 ตามลำดับ** (`completeness` → `completeness-2` → `completeness-3` เข้า `main`) แบบ merge commit ธรรมดา (ไม่ squash/rebase — เก็บประวัติไว้ใช้ revert) → ระบบ deploy อัตโนมัติ build + รีสตาร์ทด้วยโค้ดใหม่ + env ใหม่ · ต้องรัน 018 → 021 (ข้อ 4.5) ก่อน merge #2 / #3
5. รอ deploy เสร็จ · ดู log ตอนเริ่ม (เช่น `pm2 logs`) ต้องไม่มี `AUTH_SECRET is not set` / `DATABASE_URL is not set`
6. ถ้าระบบ deploy อัตโนมัติไม่ได้รีสตาร์ทแอป → รีสตาร์ทเอง (เช่น `pm2 restart <app>`)

แม่แบบสัญญา PDF `docs\สัญญาเช่าห้องพักหอพักเกษร.pdf` ไม่อยู่ใน git — วางบน server ถ้าจะใช้ปุ่มพิมพ์ PDF (ไม่มี = ปุ่ม PDF ตอบ 503, ปุ่ม Word ใช้ได้ปกติ)

## 6. cron แจ้งเตือนตามเวลา (ทุกชั่วโมง)
Windows Task Scheduler (ทุก 1 ชั่วโมง) รันคำสั่ง:
```
curl -fsS -X POST -H "Authorization: Bearer <CRON_SECRET>" http://localhost:<port>/api/cron/reminders
```
(Linux: `0 * * * * curl …` ใน crontab) · ทดสอบครั้งแรกด้วยมือ: ต้องได้ JSON `"success":true` · ไม่ใส่ header → 401 · ไม่ตั้ง cron ระบบยังเตือนจากการเปิดหน้าเว็บ (ทุก ≤ 10 นาที) แต่ช้าถ้าไม่มีคนเปิด

## 7. smoke test 5 นาที
| # | ทำ | ต้องได้ |
|---|---|---|
| 1 | login **owner** | `/owner` แดชบอร์ดขึ้น "ค่าจอง 1,000.00 บาท" |
| 2 | login **manager** | เข้า `/owner` ได้ · `/owner/settings` ป้าย "ดูอย่างเดียว" แก้ไม่ได้ |
| 3 | login **tenant** (ห้อง 9 หรือ 11) | `/tenant/billing` เห็นบิลค้าง · เปิด QR ได้ มีชื่อผู้รับเงิน |
| 4 | login **keeper** (แม่บ้าน) | `/keeper/maid` เปิดได้ |
| 5 | owner `/owner/billing` | ค้างชำระ: ห้อง 9, 11 · ชำระแล้ว: ห้อง 20 พร้อมปุ่ม 🧾 ใบเสร็จ |
| 6 | owner `/receipt/1643` | ใบเสร็จ ฿4,138.00 พื้นหลังเต็มหน้า |
| 7 | owner `/owner/settings` | อัตราตามข้อ 4 · พร้อมเพย์ 0636040550 |
| 8 | `/explore` (ไม่ login) | เห็นรายการห้องว่างและกดดูห้องได้ |
ไม่ผ่าน → ดู log · แก้เร็วไม่ได้ → ย้อนกลับข้อ 8

## 8. ย้อนกลับถ้าพัง
ทำ 2 อย่างคู่กัน (ห้ามให้โค้ดเดิมรันกับ `DATABASE_URL` = `kesorn_new`):
1. แก้ env: `DATABASE_URL` กลับเป็น `…/kesorn_db` (ไม่ต้องรีสตาร์ทตรงนี้)
2. `git revert -m 1 <merge commit>` บน `main` แล้ว push → deploy อัตโนมัติกลับเป็นโค้ดเดิม + env เดิม (ห้าม force-push main)

ฐาน `kesorn_db` เดิมไม่ถูกแตะ จึงใช้ต่อได้ทันที · ข้อมูลที่เกิดใน `kesorn_new` ระหว่างนั้นยังอยู่ใน `kesorn_new` (ไม่หาย แต่ไม่ถูกใช้) · ไฟล์ใน `public\uploads` เสียหาย → แตก zip จากข้อ 1

## 9. หลัง deploy
- **เปลี่ยนรหัสผ่านบัญชีเดโม/ทดสอบทั้งหมด** (owner@, manager@, maid@, technician@, keeper@, tenant9@, tenant11@, tenant20@, guest@, researcher@ ฯลฯ) — ในฐานที่นำขึ้นยังเป็นรหัสทดสอบ · ปิดบัญชีที่ไม่ใช้ (`is_active = 0`)
- `/owner/settings`: กรอก **บัญชีธนาคาร** (พิมพ์ในสัญญา), เลขผู้เสียภาษีถ้ามี, ตรวจชื่อบัญชีพร้อมเพย์ให้ตรงกับบัญชีจริง
- **หลัง deploy เจ้าของหอต้องแก้ในหน้ากฎหอ** (`/owner/rules` — ข้อความเป็นข้อมูลในฐาน ไม่ได้แก้ด้วยโค้ด):
  - ข้อ 22 "อัตราค่าน้ำประปาและค่าไฟฟ้า" → ค่าไฟหน่วยละ **4.88 บาท** (ในฐานเขียน 8 บาท ไม่ตรงอัตราจริง)
  - ข้อ 25 "ข้อห้ามเรื่องการสูบบุหรี่และสิ่งเสพติด" → **ห้ามสูบบุหรี่ทุกพื้นที่ภายในหอพัก**
- ถ้ามีรูปบัตรประชาชนค้างใน `public\uploads\id_cards\` บนเว็บ ให้ลบ (เก็บ `.gitkeep`) — ระบบไม่เก็บรูปบัตรแล้ว
- **ลบไฟล์ 6 ไฟล์ที่ไม่มีใครอ้างแล้ว** (ข้อมูลทดสอบส่วนตัวที่ลบออกจากฐานก่อน export — ถ้ามีบนเว็บ):
  - `public\uploads\slips\first_bill_17_21_1790939738047_2d2gfb.jpg`
  - `public\uploads\slips\first_bill_17_21_1790950326640_71aely.jpg`
  - `public\uploads\slips\first_bill_17_21_1790962723406_fe3url.jpg`
  - `public\uploads\contracts\contract_77_1790939582259.pdf`
  - `public\uploads\contracts\contract_78_1790950277576.pdf`
  - `public\uploads\contracts\contract_80_1790962522046.pdf`
- เก็บ `kesorn_db` เดิม + backup ข้อ 1 ไว้อย่างน้อย 30 วัน แล้วค่อยลบ
- **ไฟล์ backup ในเครื่อง dev (มีข้อมูลส่วนตัว — ไม่อยู่ใน git ห้าม commit/ส่งต่อ) ลบหลัง deploy ผ่าน smoke test:**
  - `docs\review\kesorn_db_before_019_20261019_1743.sql` (backup ก่อนรัน 019 บนฐาน dev)
  - `docs\review\kesorn_db_before_020_20261020_0057.sql` (backup ก่อนรัน 020 บนฐาน dev)
  - `docs\review\kesorn_db_before_021_20261020_1524.sql` (backup ก่อนรัน 021 บนฐาน dev)
  - (ไฟล์ export ที่ส่งให้ `kesorn_db_20261015_1723.sql` — ลบทั้งฝั่งผู้ส่งและบน server หลัง import เสร็จ)
- แจ้งเตือนจะเริ่มทำงานจริง: บิลห้อง 9 และ 11 (ครบกำหนด 5 ต.ค.) แจ้ง owner/manager "ค้างชำระเกิน 15 วัน" ตั้งแต่ 21 ต.ค. · เตือนจดมิเตอร์ตั้งแต่วันที่ 28
