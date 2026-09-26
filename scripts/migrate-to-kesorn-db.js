/**
 * scripts/migrate-to-kesorn-db.js
 * Creates 'kesorn_db' with single-dormitory architecture (no multi-dorm logic, no platform/subscription tables).
 * Migrates data from Kesorn 2 (dorm_id = 1) from smartdomdb.
 */
const mysql = require('mysql2/promise');

const SOURCE_URL = process.env.DATABASE_URL || 'mysql://smartdom:smartdom@localhost:3306/smartdomdb';
const BASE_URL = SOURCE_URL.replace(/\/[^\/]+$/, '');
const TARGET_DB = 'kesorn_db';

async function migrate() {
  console.log('Connecting to MySQL base:', BASE_URL);
  const conn = await mysql.createConnection(BASE_URL);

  try {
    // 1. Recreate TARGET_DB
    console.log(`Creating database ${TARGET_DB} if not exists...`);
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${TARGET_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.changeUser({ database: TARGET_DB });

    console.log('Dropping old tables in kesorn_db...');
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    const tables = [
      'accounting_monthly_summary', 'accounting_transactions', 'announcement_reads',
      'announcements', 'bills', 'booking_progress', 'chat_messages', 'cleaning_jobs',
      'contracts', 'conversations', 'dormitory_profile', 'dormitory_rules',
      'keeper_dormitories', 'keepers', 'maintenance_jobs', 'maintenance_requests',
      'meter_readings', 'move_out_requests', 'notifications', 'parcels',
      'room_inventory', 'rooms', 'tenants', 'users'
    ];

    for (const t of tables) {
      await conn.query(`DROP TABLE IF EXISTS \`${t}\``);
    }

    console.log('Creating single-dormitory schema in kesorn_db...');

    // 1. Users
    await conn.query(`
      CREATE TABLE users (
        id int(11) NOT NULL AUTO_INCREMENT,
        email varchar(255) NOT NULL UNIQUE,
        password varchar(255) NOT NULL,
        name varchar(255) NOT NULL,
        phone varchar(50) DEFAULT NULL,
        role enum('owner','tenant','keeper','researcher','guest') NOT NULL DEFAULT 'guest',
        sub_role varchar(50) DEFAULT NULL,
        is_active tinyint(1) DEFAULT 1,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Dormitory Profile (Single record for Kesorn 2)
    await conn.query(`
      CREATE TABLE dormitory_profile (
        id int(11) NOT NULL AUTO_INCREMENT,
        name varchar(255) NOT NULL DEFAULT 'หอพักเกษร 2 (ม.พะเยา)',
        address text DEFAULT NULL,
        phone varchar(50) DEFAULT NULL,
        tax_id varchar(50) DEFAULT NULL,
        cover_image longtext DEFAULT NULL,
        description text DEFAULT NULL,
        water_rate decimal(10,2) DEFAULT 18.00,
        electricity_rate decimal(10,2) DEFAULT 8.00,
        promptpay_number varchar(50) DEFAULT NULL,
        promptpay_name varchar(255) DEFAULT NULL,
        has_wifi tinyint(1) DEFAULT 1,
        has_parking tinyint(1) DEFAULT 1,
        has_air_con tinyint(1) DEFAULT 1,
        has_lan tinyint(1) DEFAULT 1,
        pet_friendly tinyint(1) DEFAULT 1,
        facilities text DEFAULT NULL,
        map_url longtext DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Rooms
    await conn.query(`
      CREATE TABLE rooms (
        id int(11) NOT NULL AUTO_INCREMENT,
        room_number varchar(50) NOT NULL UNIQUE,
        room_type varchar(50) DEFAULT 'Standard',
        price decimal(10,2) NOT NULL,
        status enum('Available','Occupied','Maintenance') DEFAULT 'Available',
        floor int(11) DEFAULT 1,
        tenant_id int(11) DEFAULT NULL,
        image_url longtext DEFAULT NULL,
        images longtext DEFAULT NULL,
        amenities longtext DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Tenants
    await conn.query(`
      CREATE TABLE tenants (
        id int(11) NOT NULL AUTO_INCREMENT,
        user_id int(11) DEFAULT NULL,
        name varchar(255) NOT NULL,
        email varchar(255) DEFAULT NULL,
        phone varchar(50) DEFAULT NULL,
        room_id int(11) DEFAULT NULL,
        id_card_number varchar(20) DEFAULT NULL,
        id_card_image longtext DEFAULT NULL,
        status enum('active','past','pending') DEFAULT 'active',
        move_in_date date DEFAULT NULL,
        move_out_date date DEFAULT NULL,
        emergency_contact varchar(255) DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Add FK from rooms to tenants
    await conn.query(`
      ALTER TABLE rooms ADD CONSTRAINT fk_rooms_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
    `);

    // 5. Keepers
    await conn.query(`
      CREATE TABLE keepers (
        id int(11) NOT NULL AUTO_INCREMENT,
        user_id int(11) DEFAULT NULL,
        position enum('Maid','Technician','Guard','Other') DEFAULT 'Maid',
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. Dormitory Rules
    await conn.query(`
      CREATE TABLE dormitory_rules (
        id int(11) NOT NULL AUTO_INCREMENT,
        title varchar(255) NOT NULL,
        content text NOT NULL,
        order_index int(11) DEFAULT 0,
        is_active tinyint(1) DEFAULT 1,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 7. Contracts
    await conn.query(`
      CREATE TABLE contracts (
        id int(11) NOT NULL AUTO_INCREMENT,
        tenant_id int(11) DEFAULT NULL,
        room_id int(11) DEFAULT NULL,
        start_date timestamp NULL DEFAULT NULL,
        end_date timestamp NULL DEFAULT NULL,
        deposit_amount decimal(10,2) DEFAULT 0.00,
        status varchar(50) DEFAULT 'PendingTenantSignature',
        signature_data longtext DEFAULT NULL,
        owner_signature_data longtext DEFAULT NULL,
        signed_at timestamp NULL DEFAULT NULL,
        contract_terms text DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 8. Bills
    await conn.query(`
      CREATE TABLE bills (
        id int(11) NOT NULL AUTO_INCREMENT,
        tenant_id int(11) DEFAULT NULL,
        room_number varchar(50) DEFAULT NULL,
        title varchar(255) NOT NULL,
        amount decimal(10,2) NOT NULL,
        billing_cycle varchar(100) DEFAULT NULL,
        due_date date DEFAULT NULL,
        status enum('Unpaid','Paid','Overdue','Cancelled') DEFAULT 'Unpaid',
        slip_url longtext DEFAULT NULL,
        water_units decimal(10,2) DEFAULT 0.00,
        electric_units decimal(10,2) DEFAULT 0.00,
        water_amount decimal(10,2) DEFAULT 0.00,
        electric_amount decimal(10,2) DEFAULT 0.00,
        room_amount decimal(10,2) DEFAULT 0.00,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 9. Accounting Transactions
    await conn.query(`
      CREATE TABLE accounting_transactions (
        id int(11) NOT NULL AUTO_INCREMENT,
        type enum('Income','Expense') NOT NULL,
        category varchar(100) NOT NULL,
        amount decimal(10,2) NOT NULL,
        description text DEFAULT NULL,
        reference_id int(11) DEFAULT NULL,
        reference_type varchar(50) DEFAULT NULL,
        transaction_date date NOT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 10. Accounting Monthly Summary
    await conn.query(`
      CREATE TABLE accounting_monthly_summary (
        id int(11) NOT NULL AUTO_INCREMENT,
        year int(11) NOT NULL,
        month int(11) NOT NULL,
        total_income decimal(10,2) DEFAULT 0.00,
        total_expense decimal(10,2) DEFAULT 0.00,
        net_profit decimal(10,2) DEFAULT 0.00,
        updated_at timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        PRIMARY KEY (id),
        UNIQUE KEY \`year_month\` (\`year\`, \`month\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 11. Announcements
    await conn.query(`
      CREATE TABLE announcements (
        id int(11) NOT NULL AUTO_INCREMENT,
        title varchar(255) NOT NULL,
        content text NOT NULL,
        is_important tinyint(1) DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 12. Announcement Reads
    await conn.query(`
      CREATE TABLE announcement_reads (
        id int(11) NOT NULL AUTO_INCREMENT,
        announcement_id int(11) NOT NULL,
        user_id int(11) NOT NULL,
        read_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id),
        UNIQUE KEY unique_read (announcement_id, user_id),
        FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 13. Conversations
    await conn.query(`
      CREATE TABLE conversations (
        id int(11) NOT NULL AUTO_INCREMENT,
        tenant_user_id int(11) DEFAULT NULL,
        owner_id int(11) DEFAULT NULL,
        last_message text DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        updated_at timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        PRIMARY KEY (id),
        FOREIGN KEY (tenant_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 14. Chat Messages
    await conn.query(`
      CREATE TABLE chat_messages (
        id int(11) NOT NULL AUTO_INCREMENT,
        conversation_id int(11) NOT NULL,
        sender_id int(11) NOT NULL,
        message text NOT NULL,
        is_read tinyint(1) DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 15. Maintenance Requests
    await conn.query(`
      CREATE TABLE maintenance_requests (
        id int(11) NOT NULL AUTO_INCREMENT,
        tenant_id int(11) DEFAULT NULL,
        room_number varchar(50) DEFAULT NULL,
        issue_type varchar(100) DEFAULT NULL,
        description text NOT NULL,
        status enum('Pending','InProgress','Completed','Cancelled') DEFAULT 'Pending',
        image_url longtext DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 16. Maintenance Jobs
    await conn.query(`
      CREATE TABLE maintenance_jobs (
        id int(11) NOT NULL AUTO_INCREMENT,
        room_id int(11) DEFAULT NULL,
        issue text NOT NULL,
        urgency enum('normal','rush') DEFAULT 'normal',
        status enum('pending','in_progress','waiting_parts','completed','cancelled') DEFAULT 'pending',
        assigned_to int(11) DEFAULT NULL,
        notes text DEFAULT NULL,
        photo_url longtext DEFAULT NULL,
        tenant_notes text DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        completed_at timestamp NULL DEFAULT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 17. Cleaning Jobs
    await conn.query(`
      CREATE TABLE cleaning_jobs (
        id int(11) NOT NULL AUTO_INCREMENT,
        room_id int(11) DEFAULT NULL,
        task varchar(255) NOT NULL,
        status enum('pending','in_progress','completed') DEFAULT 'pending',
        assigned_to int(11) DEFAULT NULL,
        notes text DEFAULT NULL,
        photo_url longtext DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        completed_at timestamp NULL DEFAULT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 18. Move Out Requests
    await conn.query(`
      CREATE TABLE move_out_requests (
        id int(11) NOT NULL AUTO_INCREMENT,
        tenant_id int(11) DEFAULT NULL,
        room_id int(11) DEFAULT NULL,
        move_out_date date DEFAULT NULL,
        reason text DEFAULT NULL,
        status enum('Pending','Approved','Rejected') DEFAULT 'Pending',
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 19. Booking Progress
    await conn.query(`
      CREATE TABLE booking_progress (
        id int(11) NOT NULL AUTO_INCREMENT,
        guest_id int(11) DEFAULT NULL,
        room_id int(11) DEFAULT NULL,
        status varchar(50) DEFAULT 'Pending',
        notes text DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id),
        FOREIGN KEY (guest_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 20. Parcels
    await conn.query(`
      CREATE TABLE parcels (
        id int(11) NOT NULL AUTO_INCREMENT,
        room_number varchar(50) DEFAULT NULL,
        recipient_name varchar(255) DEFAULT NULL,
        tracking_number varchar(100) DEFAULT NULL,
        carrier varchar(100) DEFAULT NULL,
        status enum('Pending','Picked Up') DEFAULT 'Pending',
        image_url longtext DEFAULT NULL,
        received_date timestamp NOT NULL DEFAULT current_timestamp(),
        picked_up_at timestamp NULL DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 21. Meter Readings
    await conn.query(`
      CREATE TABLE meter_readings (
        id int(11) NOT NULL AUTO_INCREMENT,
        room_id int(11) NOT NULL,
        type enum('Water','Electric') NOT NULL,
        previous_reading decimal(10,2) DEFAULT 0.00,
        current_reading decimal(10,2) NOT NULL,
        billing_cycle varchar(50) NOT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 22. Notifications
    await conn.query(`
      CREATE TABLE notifications (
        id int(11) NOT NULL AUTO_INCREMENT,
        user_id int(11) NOT NULL,
        title varchar(255) NOT NULL,
        message text NOT NULL,
        link_url varchar(255) DEFAULT NULL,
        is_read tinyint(1) DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 23. Room Inventory
    await conn.query(`
      CREATE TABLE room_inventory (
        id int(11) NOT NULL AUTO_INCREMENT,
        room_id int(11) NOT NULL,
        item_name varchar(255) NOT NULL,
        condition_status enum('Good','Damaged','Replaced') DEFAULT 'Good',
        notes text DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('Tables created successfully!');

    // ── DATA MIGRATION FROM smartdomdb (Kesorn 2 dorm_id = 1) ─────────────────
    console.log('Migrating data from smartdomdb for Kesorn 2...');
    const srcConn = await mysql.createConnection(`${BASE_URL}/smartdomdb`);

    // 1. Users (All users or mapped roles)
    const [srcUsers] = await srcConn.query(`
      SELECT DISTINCT u.id, u.email, u.password, u.name, u.phone, 
             COALESCE(u.role, u.primary_role, 'guest') as role, 
             u.sub_role, u.is_active, u.created_at
      FROM users u
      LEFT JOIN user_dorm_roles udr ON u.id = udr.user_id
      WHERE udr.dorm_id = 1 OR u.role IN ('owner','researcher','tenant','keeper') OR u.email LIKE '%kesorn%'
    `);
    console.log(`Found ${srcUsers.length} users to migrate.`);
    for (const u of srcUsers) {
      let r = u.role;
      if (!['owner','tenant','keeper','researcher','guest'].includes(r)) r = 'guest';
      await conn.query(`
        INSERT INTO users (id, email, password, name, phone, role, sub_role, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE name=VALUES(name), role=VALUES(role), password=VALUES(password)
      `, [u.id, u.email, u.password, u.name, u.phone, r, u.sub_role, u.is_active || 1, u.created_at]);
    }

    // Ensure kesorn2_owner exists
    const [ownerCheck] = await conn.query('SELECT * FROM users WHERE email = ?', ['owner@kesorn2.com']);
    if (ownerCheck.length === 0) {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('smartdom', 10);
      await conn.query(`
        INSERT INTO users (email, password, name, phone, role)
        VALUES ('owner@kesorn2.com', ?, 'เจ้าของหอพักเกษร 2', '081-999-2222', 'owner')
      `, [hash]);
      console.log('Created owner@kesorn2.com user.');
    }

    // 2. Dormitory Profile
    const [srcProfile] = await srcConn.query('SELECT * FROM dormitory_profile WHERE dorm_id = 1 LIMIT 1');
    if (srcProfile.length > 0) {
      const p = srcProfile[0];
      await conn.query(`
        INSERT INTO dormitory_profile (id, name, address, phone, tax_id, cover_image, description, water_rate, electricity_rate, promptpay_number, promptpay_name, has_wifi, has_parking, has_air_con, has_lan, pet_friendly)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        p.name || 'หอพักเกษร 2 (ม.พะเยา)',
        p.address || '123 หมู่ 6 ต.แม่กา อ.เมือง จ.พะเยา 56000',
        p.phone || '081-999-2222',
        p.tax_id || null,
        p.cover_image || '/up-logo.png',
        p.description || 'หอพักคุณภาพใกล้มหาวิทยาลัยพะเยา ปลอดภัย สะอาด สิ่งอำนวยความสะดวกครบครัน',
        p.water_rate || 18,
        p.electricity_rate || 8,
        p.promptpay_number || '0819992222',
        p.promptpay_name || 'หอพักเกษร 2',
        p.has_wifi ?? 1,
        p.has_parking ?? 1,
        p.has_air_con ?? 1,
        p.has_lan ?? 1,
        p.pet_friendly ?? 1
      ]);
      console.log('Dormitory profile migrated.');
    }

    // 3. Rooms
    const [srcRooms] = await srcConn.query('SELECT * FROM rooms WHERE dorm_id = 1');
    console.log(`Migrating ${srcRooms.length} rooms...`);
    for (const r of srcRooms) {
      await conn.query(`
        INSERT INTO rooms (id, room_number, room_type, price, status, floor, image_url, images, amenities, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        r.id, r.room_number, r.room_type || 'Standard', r.price || 3000,
        r.status || 'Available', r.floor || 1, r.image_url, r.images, r.amenities, r.created_at
      ]);
    }

    // 4. Tenants
    const [srcTenants] = await srcConn.query('SELECT * FROM tenants WHERE dorm_id = 1');
    console.log(`Migrating ${srcTenants.length} tenants...`);
    for (const t of srcTenants) {
      // check if user_id exists in users table
      let validUserId = null;
      if (t.user_id) {
        const [u] = await conn.query('SELECT id FROM users WHERE id = ?', [t.user_id]);
        if (u.length > 0) validUserId = t.user_id;
      }
      await conn.query(`
        INSERT INTO tenants (id, user_id, name, email, phone, room_id, id_card_number, id_card_image, status, move_in_date, move_out_date, emergency_contact, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        t.id, validUserId, t.name || 'ผู้เช่า', t.email, t.phone, t.room_id,
        t.id_card_number, t.id_card_image, t.status || 'active',
        t.move_in_date, t.move_out_date, t.emergency_contact, t.created_at
      ]);
    }

    // Link rooms back to tenants if room has tenant
    for (const r of srcRooms) {
      if (r.tenant_id) {
        await conn.query('UPDATE rooms SET tenant_id = ? WHERE id = ?', [r.tenant_id, r.id]);
      }
    }

    // 5. Keepers
    const [srcKeepers] = await srcConn.query('SELECT * FROM keepers WHERE dorm_id = 1');
    for (const k of srcKeepers) {
      const [u] = await conn.query('SELECT id FROM users WHERE id = ?', [k.user_id]);
      if (u.length > 0) {
        await conn.query(`
          INSERT INTO keepers (id, user_id, position, created_at)
          VALUES (?, ?, ?, ?)
        `, [k.id, k.user_id, k.position || 'Maid', k.created_at]);
      }
    }

    // 6. Bills
    const [srcBills] = await srcConn.query('SELECT * FROM bills WHERE dorm_id = 1');
    console.log(`Migrating ${srcBills.length} bills...`);
    for (const b of srcBills) {
      await conn.query(`
        INSERT INTO bills (id, tenant_id, room_number, title, amount, billing_cycle, due_date, status, slip_url, water_units, electric_units, water_amount, electric_amount, room_amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        b.id, b.tenant_id, b.room_number, b.title, b.amount, b.billing_cycle,
        b.due_date, b.status, b.slip_url, b.water_units || 0, b.electric_units || 0,
        b.water_amount || 0, b.electric_amount || 0, b.room_amount || 0, b.created_at
      ]);
    }

    // 7. Rules
    try {
      const [srcRules] = await srcConn.query('SELECT * FROM dormitory_rules WHERE dorm_id = 1');
      for (const rule of srcRules) {
        await conn.query(`
          INSERT INTO dormitory_rules (id, title, content, order_index, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [rule.id, rule.title, rule.content, rule.order_index || 0, rule.is_active || 1, rule.created_at]);
      }
    } catch (e) {}

    // 8. Accounting
    try {
      const [srcAcc] = await srcConn.query('SELECT * FROM accounting_transactions WHERE dorm_id = 1');
      for (const a of srcAcc) {
        await conn.query(`
          INSERT INTO accounting_transactions (id, type, category, amount, description, reference_id, reference_type, transaction_date, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [a.id, a.type, a.category, a.amount, a.description, a.reference_id, a.reference_type, a.transaction_date, a.created_at]);
      }
    } catch (e) {}

    // 9. Meter readings
    try {
      const [srcMeters] = await srcConn.query('SELECT * FROM meter_readings WHERE dorm_id = 1');
      for (const m of srcMeters) {
        await conn.query(`
          INSERT INTO meter_readings (id, room_id, type, previous_reading, current_reading, billing_cycle, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [m.id, m.room_id, m.type, m.previous_reading || 0, m.current_reading, m.billing_cycle, m.created_at]);
      }
    } catch (e) {}

    // 10. Maintenance requests
    try {
      const [srcMaint] = await srcConn.query('SELECT * FROM maintenance_requests WHERE dorm_id = 1');
      for (const mr of srcMaint) {
        await conn.query(`
          INSERT INTO maintenance_requests (id, tenant_id, room_number, issue_type, description, status, image_url, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [mr.id, mr.tenant_id, mr.room_number, mr.issue_type, mr.description, mr.status, mr.image_url, mr.created_at]);
      }
    } catch (e) {}

    await srcConn.end();
    console.log('✅ Migration to kesorn_db completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await conn.end();
  }
}

migrate();
