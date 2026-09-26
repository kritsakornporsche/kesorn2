/**
 * lib/db.ts
 * Central database connection for SmartDom SaaS Platform
 *
 * Architecture:
 *   Single Database Approach
 *   Data isolation is achieved by filtering queries with `dorm_id`
 */
import { Pool } from '@/lib/mysql-adapter';

const MYSQL_BASE = process.env.DATABASE_URL 
  ? process.env.DATABASE_URL.replace(/\/[^\/]+$/, '')
  : 'mysql://smartdom:smartdom@localhost:3306';

// Use a singleton pool to prevent MySQL max_connections exhaustion
let globalDbPool: any = null;

// ── Unified Single Dormitory Database (kesorn_db) ───────────────────────────
export function getDb() {
  if (!globalDbPool) {
    const pool = new Pool({ connectionString: `${MYSQL_BASE}/kesorn_db` });
    globalDbPool = async function(strings: any, ...values: any[]) {
      if (Array.isArray(strings) && (strings as any).raw) {
        let queryText = '';
        const params = [];
        for (let i = 0; i < strings.length; i++) {
          queryText += strings[i];
          if (i < values.length) {
            queryText += '?';
            params.push(values[i]);
          }
        }
        const res = await pool.query(queryText, params);
        return res.rows;
      } else {
        const res = await pool.query(strings, values[0] || []);
        return res.rows;
      }
    };
  }
  return globalDbPool;
}

// ── Fallback exports for gradual migration ────────────────────────────────────
// These are temporarily kept but point to the same unified database
export function getPlatformDb() {
  return getDb();
}

export function getDormDb(dormDbName?: string) {
  return getDb();
}

export function getDormDbFromSession(session: any) {
  if (!session?.user) throw new Error('User not authenticated');
  return getDb();
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SmartDomUser {
  id: string;
  name: string;
  email: string;
  role: 'platform_admin' | 'owner' | 'tenant' | 'keeper' | 'researcher' | 'guest';
  sub_role?: string | null;
  dormId?: number | null;
}
