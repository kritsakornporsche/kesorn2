const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const pool = mysql.createPool({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '3306'),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'kesorn_db',
  });

  const [tenants] = await pool.query("SELECT * FROM tenants WHERE email = 'tenant_tc722@kesorn.com'");
  if (tenants.length === 0) {
    console.error('Tenant 7.2.2 not found');
    await pool.end();
    return;
  }
  const tenant = tenants[0];

  const [reqs] = await pool.query("SELECT * FROM move_out_requests WHERE tenant_id = ?", [tenant.id]);
  const moveReq = reqs[0];
  console.log('Move out request 7.2.2:', moveReq);

  // Set due_date to today + 3 days
  const gracePeriod = new Date();
  gracePeriod.setDate(gracePeriod.getDate() + 3);
  const dueDateStr = gracePeriod.toISOString().split('T')[0];

  const totalExpenses = Number(moveReq.total_expenses);
  const tenantMustPayAmount = Math.max(0, totalExpenses - 3000.00); // 4738 - 3000 = 1738
  const billTitle = 'บิลค่าใช้จ่ายส่วนต่างหลังหักเงินประกัน (ย้ายออกตามกำหนด)';

  // Insert or update move_out_settlement bill
  await pool.query("DELETE FROM bills WHERE tenant_id = ?", [tenant.id]);

  const [bRes] = await pool.query(`
    INSERT INTO bills (
      tenant_id, dorm_id, room_number, title, amount, billing_cycle,
      due_date, status, bill_type, room_amount, water_units,
      electric_units, water_amount, electric_amount, common_fee, created_at
    ) VALUES (
      ?, 1, '502', ?, ?, '2026-10',
      ?, 'Unpaid', 'move_out_settlement', ?, 1.00,
      ?, ?, ?, ?, NOW()
    )
  `, [
    tenant.id, billTitle, tenantMustPayAmount,
    dueDateStr, Number(moveReq.room_rent_amount),
    Number(moveReq.electric_units_used), Number(moveReq.water_amount),
    Number(moveReq.electric_amount), Number(moveReq.common_fee)
  ]);

  console.log(`Created Bill ID ${bRes.insertId} for tenant_tc722@kesorn.com (Amount: ฿${tenantMustPayAmount})`);

  await pool.end();
}

main().catch(console.error);
