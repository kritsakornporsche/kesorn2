# แผน deploy ทาง ก — นำฐานข้อมูลในเครื่องไปแทนฐานบนเว็บ + merge PR #1

สำหรับเพื่อนที่ดูแลเว็บ (เป็นคน merge) · ไฟล์นี้ไม่มีรหัสผ่าน/secret — ค่าจริงส่งแยกช่องทางส่วนตัว
อ้างอิง: [`docs/CHANGES-completeness.md`](CHANGES-completeness.md) (สิ่งที่เปลี่ยน) · [`docs/schema-changes.md`](schema-changes.md) (ฐานข้อมูล)

**หลักการ:** ฐานที่ส่งให้ (export จากเครื่อง dev) รัน migration 001–017 ครบแล้ว และล้างข้อมูลทดสอบ/เลขบัตรแล้ว → **บนเว็บไม่ต้องรัน migration แยก** · import ฐาน → ตรวจ → merge (= deploy อัตโนมัติ) · ทั้งหมดใช้เวลาประมาณ 30–45 นาที แนะนำทำช่วงคนใช้น้อย

---

## 0. ข้อมูลที่ต้องมีก่อนเริ่ม
| รายการ | ค่า |
|---|---|
| ไฟล์ฐานข้อมูล | `kesorn_db_<วันที่>.sql` (ส่งแยก — ไม่อยู่ใน git) |
| sha256 ของไฟล์ | (ส่งมาพร้อมไฟล์) |
| ฐานต้นทาง | MariaDB 10.4.32 · utf8mb4 (`utf8mb4_unicode_ci` 36 ตาราง, `utf8mb4_general_ci` 5 ตาราง) · 41 ตาราง · ไม่มี view / routine / trigger / event |
| ฐานบนเว็บ | **แจ้งเวอร์ชันกลับมาก่อน export** (MariaDB / MySQL 8 — ถ้า MySQL 8 จะ export แบบเข้ากันได้) |
| `AUTH_SECRET` | สร้างใหม่บนเว็บ (`openssl rand -base64 32`) — ห้ามใช้ค่าจากเครื่อง dev |
| `CRON_SECRET` | สร้างใหม่ (`openssl rand -hex 32`) |

⚠️ ตรวจที่เก็บไฟล์ของเว็บ: แอปเขียนไฟล์ลง `storage/*` และ `public/uploads/*` บนดิสก์ของ server → ต้องเป็นดิสก์ถาวร (เช่น server ที่รันด้วย PM2) **ถ้า host เป็นแบบ serverless (เช่น Vercel) ไฟล์ที่อัปโหลดจะหาย** — บอกก่อนเริ่ม

---

## 1. backup ของเดิมบนเว็บ (ห้ามข้าม)
```bash
TS=$(date +%Y%m%d_%H%M)
mysqldump --single-transaction --routines --triggers --default-character-set=utf8mb4 -u <user> -p <web_db> > web_db_before_completeness_$TS.sql
tar czf web_uploads_before_completeness_$TS.tgz public/uploads storage 2>/dev/null   # storage อาจยังไม่มี
sha256sum web_db_before_completeness_$TS.sql web_uploads_before_completeness_$TS.tgz > backup_$TS.sha256
```
เก็บ 3 ไฟล์นี้ไว้นอกโฟลเดอร์ที่ deploy (ใช้ตอนย้อนกลับ ข้อ 8)

## 2. ตั้งค่า server ก่อน merge
1. **env** (ตั้งใน host/`.env` ของ production — ดูชื่อทั้งหมดใน `.env.example`)
   - `AUTH_SECRET` = ค่าใหม่ (บังคับ — ไม่มีค่าสำรองในโค้ด, ต้องมีก่อน build/start)
   - `CRON_SECRET` = ค่าใหม่
   - `DATABASE_URL` = `mysql://…/<web_db>` (ต้องขึ้นต้น `mysql://`)
   - ค่าเดิมที่ใช้อยู่: `SLIPOK_API_KEY`, `SLIPOK_ENDPOINT`, `GEMINI_API_KEY` ฯลฯ คงไว้
2. **โฟลเดอร์ที่แอปต้องเขียนได้** (นอก public — ไม่อยู่ใน git) ที่ root ของแอป:
   ```bash
   mkdir -p storage/contracts storage/inspections storage/move-out storage/maintenance storage/meters
   ```
   (ให้ user ที่รันแอปเขียนได้)
3. **ห้ามลบ `public/uploads/` เดิม** — ฐานที่นำขึ้นอ้างไฟล์เก่า 18 ไฟล์ (สลิป 9 ใน `uploads/slips`, ไฟล์สัญญา 5 ใน `uploads/contracts`, รูปมิเตอร์ 4 ใน `uploads/meters`) ซึ่งไม่มีในเครื่อง dev — ถ้าบนเว็บมีจะยังเปิดได้
4. **แม่แบบสัญญา PDF** `docs/สัญญาเช่าห้องพักหอพักเกษร.pdf` ไม่อยู่ใน git — วางบน server ถ้าจะใช้ปุ่มพิมพ์ PDF (ไม่มี = ปุ่ม PDF ตอบ 503, ปุ่ม Word ใช้ได้ปกติ)

## 3. import ฐานใหม่
```bash
sha256sum -c kesorn_db_<วันที่>.sql.sha256          # ต้องได้ OK — ไม่ OK ห้าม import
# หยุดแอปชั่วคราว (เช่น pm2 stop <app>) เพื่อไม่ให้มีการเขียนระหว่าง import
mysql -u <user> -p -e "DROP DATABASE <web_db>; CREATE DATABASE <web_db> CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u <user> -p --default-character-set=utf8mb4 <web_db> < kesorn_db_<วันที่>.sql
```
(ถ้าไม่มีสิทธิ์ DROP DATABASE: import ทับได้ เพราะไฟล์ dump มี `DROP TABLE IF EXISTS` ทุกตาราง แต่ตารางที่มีเฉพาะบนเว็บจะค้างอยู่ — แจ้งก่อน)

## 4. ตรวจหลัง import (ก่อนเปิดแอป)
```sql
SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE';   -- 41
SELECT status, COUNT(*) FROM rooms GROUP BY status;                    -- Available 17 · Occupied 4 (รวม 21)
SELECT GROUP_CONCAT(room_number ORDER BY room_number+0) FROM rooms WHERE status = 'Occupied';   -- 5,9,11,20
SELECT status, COUNT(*) FROM bills GROUP BY status;                    -- Paid 1 · PendingCorrection 1 · Unpaid 2 (รวม 4)
SELECT COUNT(*), SUM(amount) FROM bill_payments;                       -- 1 · 4138.00 (บิล #203, การชำระ #1643)
SELECT type, COUNT(*), SUM(amount) FROM accounting_transactions GROUP BY type;
                                                                        -- Income 30 แถว 42,750.00 · Expense 4 แถว 25,070.00 · ไม่มี Liability
SELECT status, COUNT(*) FROM contracts GROUP BY status;                -- Active 4 · Cancelled 3 · PendingFirstBill 2 · Renewed 1 · Terminated 3 (รวม 13)
SELECT COUNT(*), SUM(is_active = 1) FROM users;                        -- 167 · 148
SELECT COUNT(*) FROM notifications;                                    -- 871 (เพิ่มได้หลังเปิดแอป — แจ้งเตือนตามเวลา)
SELECT COUNT(*) FROM tenants WHERE id_card_number IS NOT NULL OR id_card_image IS NOT NULL;     -- 0
SELECT COUNT(*) FROM contracts WHERE id_card_number IS NOT NULL OR id_card_image IS NOT NULL;   -- 0
SELECT electricity_rate, water_rate, common_fee, late_fee_per_day, cleaning_fee, promptpay_number FROM dormitory_profile;
                                                                        -- 4.88 · 100.00 · 150.00 · 50.00 · 300.00 · 0636040550
SELECT name FROM job_runs;                                             -- reminders (มี = migration 016 อยู่ครบ)
```
ค่าไม่ตรง → หยุด ไม่ merge · แจ้งกลับพร้อมผล query (ย้อนกลับด้วยข้อ 8.1)

## 5. merge → deploy อัตโนมัติ
1. ตรวจว่า env ข้อ 2 ตั้งแล้ว (ไม่มี `AUTH_SECRET` = build/start ล้ม)
2. merge PR #1 (`completeness` → `main`) — **merge commit ธรรมดา** (ไม่ squash/rebase — เก็บประวัติทุก commit ไว้ใช้ revert)
3. รอระบบ deploy เสร็จ (build ผ่าน + แอปขึ้น) · ถ้าใช้ PM2: `pm2 logs <app>` ไม่มี error ตอนเริ่ม

## 6. ตั้ง cron แจ้งเตือนตามเวลา
```bash
# crontab -e บน server (ทุกชั่วโมง) — ใส่ CRON_SECRET จริงในไฟล์ crontab/สคริปต์ ไม่ใส่ใน git
0 * * * * curl -fsS -X POST -H "Authorization: Bearer <CRON_SECRET>" http://localhost:<port>/api/cron/reminders > /dev/null
```
ทดสอบครั้งแรกด้วยมือ: คำสั่งเดียวกันต้องได้ JSON `"success":true` · ไม่ใส่ header → 401 · ไม่ตั้ง cron ระบบยังเตือนจากการเปิดหน้าเว็บ (ทุก ≤ 10 นาที) แต่ช้าถ้าไม่มีคนเปิด

## 7. smoke test 5 นาที (หลัง deploy)
| # | ทำ | ต้องได้ |
|---|---|---|
| 1 | login **owner** | เข้า `/owner` ได้ แดชบอร์ดขึ้น "ค่าจอง 1,000.00 บาท" |
| 2 | login **manager** | เข้า `/owner` ได้ · `/owner/settings` แสดงป้าย "ดูอย่างเดียว" แก้ไม่ได้ |
| 3 | login **tenant** (ผู้เช่าห้อง 9 หรือ 11) | `/tenant/billing` เห็นบิลค้าง · เปิด QR ได้ มีชื่อผู้รับเงิน |
| 4 | login **keeper** (แม่บ้าน) | `/keeper/maid` เปิดได้ |
| 5 | owner เปิด `/owner/billing` | แท็บค้างชำระมีบิลห้อง 9, 11 · แท็บชำระแล้วมีบิลห้อง 20 พร้อมปุ่ม 🧾 ใบเสร็จ |
| 6 | เปิด `/receipt/1643` (owner) | ใบเสร็จ ฿4,138.00 พื้นหลังเต็มหน้า |
| 7 | owner เปิด `/owner/settings` | อัตราตามข้อ 4 · พร้อมเพย์ 0636040550 |
| 8 | `/explore` (ไม่ login) | เห็นรายการห้องว่างและกดดูห้องได้ |
ไม่ผ่านข้อไหน → ดู log · ถ้าแก้เร็วไม่ได้ → ย้อนกลับข้อ 8

## 8. ย้อนกลับถ้าพัง
1. **ฐาน:** หยุดแอป → `mysql … -e "DROP DATABASE <web_db>; CREATE DATABASE <web_db> CHARACTER SET utf8mb4;"` → `mysql … <web_db> < web_db_before_completeness_<TS>.sql` (เช็ก sha256 ก่อน)
2. **โค้ด:** `git revert -m 1 <merge commit>` บน `main` แล้ว push (deploy อัตโนมัติกลับเป็นโค้ดเดิม) — ห้าม force-push main
3. **ไฟล์:** ถ้าไฟล์ใน `public/uploads` เสียหาย แตก `web_uploads_before_completeness_<TS>.tgz` กลับ
4. ข้อมูลที่เกิดบนเว็บระหว่าง deploy จนย้อนกลับ (ถ้ามีคนใช้งาน) จะหาย — จึงควรทำช่วงคนใช้น้อย

## 9. หลัง deploy
- **เปลี่ยนรหัสผ่านบัญชีเดโม/ทดสอบทั้งหมด** (owner@, manager@, maid@, technician@, keeper@, tenant9@, tenant11@, tenant20@, guest@, researcher@ ฯลฯ) — ในฐานที่นำขึ้นยังเป็นรหัสทดสอบ · ปิดบัญชีที่ไม่ใช้ (`is_active = 0`)
- `/owner/settings`: กรอก **บัญชีธนาคาร** (พิมพ์ในสัญญา), เลขผู้เสียภาษีถ้ามี, ตรวจชื่อบัญชีพร้อมเพย์ให้ตรงกับบัญชีจริง
- ถ้ามีรูปบัตรประชาชนค้างใน `public/uploads/id_cards/` บนเว็บ ให้ลบ (เก็บ `.gitkeep`) — ระบบไม่เก็บรูปบัตรแล้ว
- เก็บ backup ข้อ 1 ไว้อย่างน้อย 30 วัน
- แจ้งเตือนจะเริ่มทำงานจริง: บิลห้อง 9 และ 11 (ครบกำหนด 5 ต.ค.) จะแจ้ง owner/manager "ค้างชำระเกิน 15 วัน" ตั้งแต่ 21 ต.ค. · เตือนจดมิเตอร์ตั้งแต่วันที่ 28
