const mysql = require('mysql2/promise');

async function migrate() {
  const pool = mysql.createPool('mysql://smartdom:smartdom@localhost:3306/kesorn_db');
  
  try {
    const [cols] = await pool.query('DESCRIBE rooms');
    const existing = cols.map(c => c.Field);
    
    if (!existing.includes('deposit_amount')) {
      await pool.query('ALTER TABLE rooms ADD COLUMN deposit_amount DECIMAL(10, 2) DEFAULT 3000.00');
      console.log('Added deposit_amount');
    }
    if (!existing.includes('water_rate')) {
      await pool.query('ALTER TABLE rooms ADD COLUMN water_rate DECIMAL(10, 2) DEFAULT 100.00');
      console.log('Added water_rate');
    }
    if (!existing.includes('common_fee')) {
      await pool.query('ALTER TABLE rooms ADD COLUMN common_fee DECIMAL(10, 2) DEFAULT 150.00');
      console.log('Added common_fee');
    }
    
    const [updatedCols] = await pool.query('DESCRIBE rooms');
    console.log('Updated columns:', updatedCols.map(c => ({ Field: c.Field, Type: c.Type, Default: c.Default })));
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await pool.end();
  }
}

migrate();
