const { neon } = require('../lib/mysql-adapter');
const sql = neon();

async function run() {
  const bills = await sql`
    SELECT b.id, b.room_number, b.billing_cycle, b.status, b.amount, b.created_at, b.title
    FROM bills b
    WHERE b.billing_cycle IN ('2026-10', '2026-11', '2026-12')
  `;
  console.log('Bills in 2026-10 to 2026-12:', bills);

  const meters = await sql`
    SELECT m.id, m.room_id, r.room_number, m.billing_cycle, m.previous_reading, m.current_reading, m.units_used, m.created_at
    FROM meter_readings m
    JOIN rooms r ON m.room_id = r.id
    WHERE m.billing_cycle IN ('2026-10', '2026-11', '2026-12')
    ORDER BY m.id DESC
  `;
  console.log('Meters in 2026-10 to 2026-12:', meters);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
