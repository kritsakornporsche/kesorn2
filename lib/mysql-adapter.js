const mysql = require('mysql2/promise');
const urlParser = require('url');

// Global pool cache for Pool class only
let globalPool = null;
let dbEnsured = false;

function getPool(connectionString) {
  if (globalPool) return globalPool;
  
  let url = connectionString || process.env.DATABASE_URL;
  if (!url) {
    throw new Error("No database URL provided");
  }
  
  // Clean connection string: if it starts with postgresql:// or postgres://, convert to mysql://
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    url = 'mysql://smartdom:smartdom@localhost:3306/kesorn_db';
  }
  
  
  globalPool = mysql.createPool({
    uri: url,
    waitForConnections: true,
    connectionLimit: 25,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    timezone: '+07:00'
  });
  return globalPool;
}

async function ensureDatabaseExists(connectionString) {
  if (dbEnsured) return;
  dbEnsured = true;
  
  let url = connectionString || process.env.DATABASE_URL;
  if (!url) return;
  
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    url = 'mysql://smartdom:smartdom@localhost:3306/smartdomdb';
  }
  
  try {
    const parsed = urlParser.parse(url);
    const dbName = parsed.pathname ? parsed.pathname.replace(/^\//, '') : '';
    if (!dbName) return;
    
    // Connect without database
    const connectionUrlWithoutDb = `${parsed.protocol}//${parsed.auth ? parsed.auth + '@' : ''}${parsed.host}`;
    
    const tempConn = await mysql.createConnection(connectionUrlWithoutDb);
    await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await tempConn.end();
  } catch (err) {
    // Non-blocking in production
  }
}

async function runQueryWithDropChecks(conn, cleanQuery, values) {
  const isDrop = /drop\s+table/i.test(cleanQuery);
  const isAlter = /alter\s+table/i.test(cleanQuery);
  
  if (isDrop) {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  }
  
  try {
    const res = await conn.query(cleanQuery, values);
    return res;
  } catch (err) {
    if (isAlter && (err.errno === 1060 || err.code === 'ER_DUP_FIELDNAME')) {
      // Ignore duplicate column name error in migrations/seeding
      return [[], []];
    }
    throw err;
  } finally {
    if (isDrop) {
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  }
}

async function translateAndRun(conn, query, params) {
  let cleanQuery = query;
  let values = params ? [...params] : [];
  
  // Format ISO date strings to MySQL compatible format
  values = values.map(val => {
    if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
      return val.replace('T', ' ').replace(/\.\d+Z$/, '').replace(/Z$/, '');
    }
    return val;
  });
  
  // 1. Strip type casting like ::jsonb, ::text, etc.
  cleanQuery = cleanQuery.replace(/::[a-zA-Z_0-9]+/g, '');
  
  // 2. Replace SERIAL PRIMARY KEY with INT AUTO_INCREMENT PRIMARY KEY
  cleanQuery = cleanQuery.replace(/SERIAL PRIMARY KEY/gi, 'INT AUTO_INCREMENT PRIMARY KEY');
  
  // 3. Handle ON CONFLICT
  // ON CONFLICT (col1, col2) DO NOTHING -> ON DUPLICATE KEY UPDATE id=id
  cleanQuery = cleanQuery.replace(/ON CONFLICT\s*\([^)]+\)\s*DO NOTHING/gi, 'ON DUPLICATE KEY UPDATE id=id');
  // ON CONFLICT (col1) DO UPDATE SET -> ON DUPLICATE KEY UPDATE
  cleanQuery = cleanQuery.replace(/ON CONFLICT\s*\([^)]+\)\s*DO UPDATE SET/gi, 'ON DUPLICATE KEY UPDATE');
  // EXCLUDED.col -> VALUES(col)
  cleanQuery = cleanQuery.replace(/EXCLUDED\.([a-zA-Z_0-9]+)/gi, 'VALUES($1)');
  
  // 4. Strip CASCADE from DROP TABLE
  cleanQuery = cleanQuery.replace(/CASCADE/gi, '');
  
  // 5. Replace ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... -> ADD ...
  cleanQuery = cleanQuery.replace(/ADD COLUMN IF NOT EXISTS/gi, 'ADD');
  cleanQuery = cleanQuery.replace(/ADD IF NOT EXISTS/gi, 'ADD');
  
  // 6. Support for diagnostic / metadata queries
  cleanQuery = cleanQuery.replace(/table_schema\s*=\s*'public'/gi, 'table_schema = DATABASE()');
  cleanQuery = cleanQuery.replace(/TIMESTAMPTZ/gi, 'TIMESTAMP');
  cleanQuery = cleanQuery.replace(/email\s+TEXT\s+NOT\s+NULL\s+UNIQUE/gi, 'email VARCHAR(255) NOT NULL UNIQUE');
  cleanQuery = cleanQuery.replace(/email\s+TEXT\s+UNIQUE/gi, 'email VARCHAR(255) UNIQUE');
  
  // Replace PostgreSQL JSONB / JSON types with LONGTEXT to avoid validation check constraint issues
  cleanQuery = cleanQuery.replace(/\bJSONB\b/gi, 'LONGTEXT');
  cleanQuery = cleanQuery.replace(/\bJSON\b/gi, 'LONGTEXT');
  
  if (cleanQuery.toLowerCase().includes('pg_catalog.pg_tables')) {
    cleanQuery = `SELECT table_name AS tablename FROM information_schema.tables WHERE table_schema = DATABASE()`;
  }
  
  // 7. Handle RETURNING clause
  const returningMatch = cleanQuery.match(/\s+RETURNING\s+([\s\S]+)$/i);
  
  if (returningMatch) {
    const returningColumns = returningMatch[1].trim();
    // Remove the RETURNING clause from the query
    cleanQuery = cleanQuery.replace(/\s+RETURNING\s+([\s\S]+)$/i, '');
    
    // Find the operation type (INSERT, UPDATE, DELETE)
    const isInsert = /^\s*INSERT\s+/i.test(cleanQuery);
    const isUpdate = /^\s*UPDATE\s+/i.test(cleanQuery);
    const isDelete = /^\s*DELETE\s+/i.test(cleanQuery);
    
    if (isInsert) {
      // Find table name
      const insertTableMatch = cleanQuery.match(/INSERT\s+INTO\s+([^\s(]+)/i);
      const tableName = insertTableMatch ? insertTableMatch[1].trim().replace(/['"`]/g, '') : '';
      
      const [res] = await runQueryWithDropChecks(conn, cleanQuery, values);
      const insertId = res.insertId;
      
      if (tableName && insertId) {
        // Query the inserted row
        const selectSql = `SELECT ${returningColumns} FROM ${tableName} WHERE id = ?`;
        const [rows] = await conn.query(selectSql, [insertId]);
        return rows;
      }
      return [];
    } else if (isUpdate) {
      // Find table name and where clause
      const updateTableMatch = cleanQuery.match(/UPDATE\s+([^\s]+)/i);
      const tableName = updateTableMatch ? updateTableMatch[1].trim().replace(/['"`]/g, '') : '';
      
      const whereIndex = cleanQuery.toUpperCase().indexOf(' WHERE ');
      
      if (tableName && whereIndex !== -1) {
        const whereClause = cleanQuery.substring(whereIndex);
        
        // Run update
        await runQueryWithDropChecks(conn, cleanQuery, values);
        
        // Run select to retrieve updated records
        const wherePlaceholders = (whereClause.match(/\?/g) || []).length;
        const whereValues = values.slice(values.length - wherePlaceholders);
        
        const selectSql = `SELECT ${returningColumns} FROM ${tableName} ${whereClause}`;
        const [rows] = await conn.query(selectSql, whereValues);
        return rows;
      }
      
      const [res] = await runQueryWithDropChecks(conn, cleanQuery, values);
      return res;
    } else if (isDelete) {
      // Find table name and where clause
      const deleteTableMatch = cleanQuery.match(/DELETE\s+FROM\s+([^\s]+)/i);
      const tableName = deleteTableMatch ? deleteTableMatch[1].trim().replace(/['"`]/g, '') : '';
      const whereIndex = cleanQuery.toUpperCase().indexOf(' WHERE ');
      
      if (tableName && whereIndex !== -1) {
        const whereClause = cleanQuery.substring(whereIndex);
        const wherePlaceholders = (whereClause.match(/\?/g) || []).length;
        const whereValues = values.slice(values.length - wherePlaceholders);
        
        // Select BEFORE deleting
        const selectSql = `SELECT ${returningColumns} FROM ${tableName} ${whereClause}`;
        const [rows] = await conn.query(selectSql, whereValues);
        
        // Run delete
        await runQueryWithDropChecks(conn, cleanQuery, values);
        return rows;
      }
      
      const [res] = await runQueryWithDropChecks(conn, cleanQuery, values);
      return res;
    }
  }
  
  // Standard query (no RETURNING clause)
  const [res] = await runQueryWithDropChecks(conn, cleanQuery, values);
  
  if (Array.isArray(res)) return res;
  const arr = [];
  Object.assign(arr, res);
  return arr;
}

async function executeQuery(sqlString, params, connectionString) {
  const pool = getPool(connectionString);
  const conn = await pool.getConnection();
  try {
    return await translateAndRun(conn, sqlString, params);
  } finally {
    conn.release();
  }
}

function neon(connectionString) {
  return async function sql(strings, ...values) {
    if (Array.isArray(strings) && strings.raw) {
      // Called as tagged template literal
      let queryText = '';
      const params = [];
      for (let i = 0; i < strings.length; i++) {
        queryText += strings[i];
        if (i < values.length) {
          queryText += '?';
          params.push(values[i]);
        }
      }
      return executeQuery(queryText, params, connectionString);
    } else {
      // Called as a regular function
      const queryText = strings;
      const params = values[0] || [];
      return executeQuery(queryText, params, connectionString);
    }
  };
}

class Pool {
  constructor(config) {
    this.connectionString = config ? config.connectionString : null;
    this.pool = null;
  }
  
  async connect() {
    if (!this.pool) {
      this.pool = getPool(this.connectionString);
    }
    const conn = await this.pool.getConnection();
    
    return {
      query: async (text, params) => {
        const res = await translateAndRun(conn, text, params);
        return { rows: res };
      },
      release: () => {
        conn.release();
      }
    };
  }
  
  async query(text, params) {
    if (!this.pool) {
      this.pool = getPool(this.connectionString);
    }
    const conn = await this.pool.getConnection();
    try {
      const res = await translateAndRun(conn, text, params);
      return { rows: res };
    } finally {
      conn.release();
    }
  }
  
  async end() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

module.exports = {
  neon,
  Pool
};
