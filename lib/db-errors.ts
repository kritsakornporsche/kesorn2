// Server errors turned into messages that say the real reason (commit 28a). The most common one on a copy of the
// system is a database that has not been updated yet: a column/table added by a migration is missing, so a save fails
// with "Unknown column ..." / "Table ... doesn't exist". The message then names the migration to run.
// SQL text and file paths are never sent to the page — only the column/table name, the migration and the error code.

/** What each migration adds (db/migrations/0xx_*.up.sql) */
const MIGRATION_COLUMNS: Record<string, string> = {
  landlord_name: '018',
  landlord_phone: '018',
  quantity: '019',
  data_confirmed_at: '021',
  data_confirmed_by: '021',
  ack_paper_by: '021',
  tenant_title: '022',
  tenant_first_name: '022',
  tenant_last_name: '022',
  addr_house_no: '022',
  addr_moo: '022',
  addr_soi: '022',
  addr_road: '022',
  addr_subdistrict: '022',
  addr_district: '022',
  addr_province: '022',
  addr_postcode: '022',
};
const MIGRATION_TABLES: Record<string, string> = {
  contract_occupant_changes: '020',
  contract_data_changes: '021',
};

export const migrationMessage = (number: string) => `ฐานข้อมูลยังไม่ได้อัปเดต (migration ${number})`;

/** The migration that has not been run, from a MySQL/MariaDB error; null when it is not that kind of error. */
export function missingMigration(error: any): string | null {
  const code = error?.code;
  const text = String(error?.sqlMessage || error?.message || '');
  if (code === 'ER_BAD_FIELD_ERROR' || error?.errno === 1054) {
    const column = /Unknown column '(?:[\w]+\.)?([\w]+)'/.exec(text)?.[1];
    return column ? MIGRATION_COLUMNS[column] ?? null : null;
  }
  if (code === 'ER_NO_SUCH_TABLE' || error?.errno === 1146) {
    const table = /Table '(?:[\w]+\.)?([\w]+)' doesn't exist/.exec(text)?.[1];
    return table ? MIGRATION_TABLES[table] ?? null : null;
  }
  return null;
}

const FILE_ERRORS: Record<string, string> = {
  EACCES: 'ไม่มีสิทธิ์เขียนไฟล์',
  EPERM: 'ไม่มีสิทธิ์เขียนไฟล์',
  EROFS: 'ที่เก็บไฟล์เป็นแบบอ่านอย่างเดียว',
  ENOSPC: 'พื้นที่ดิสก์เต็ม',
  ENOENT: 'ไม่พบโฟลเดอร์เก็บไฟล์',
};

/**
 * The message for a failed request: `${action}: <reason>`.
 * folder — where the request writes files (e.g. 'storage/inspections'), named when a file write fails.
 */
export function serverErrorMessage(error: any, action: string, folder?: string): string {
  const migration = missingMigration(error);
  if (migration) return `${action}: ${migrationMessage(migration)}`;
  const code = typeof error?.code === 'string' ? error.code : '';
  if (folder && FILE_ERRORS[code]) return `${action}: ${FILE_ERRORS[code]} (${folder})`;
  if (code === 'ECONNREFUSED' || code === 'PROTOCOL_CONNECTION_LOST' || code === 'ER_ACCESS_DENIED_ERROR') {
    return `${action}: เชื่อมต่อฐานข้อมูลไม่ได้ (${code})`;
  }
  if (code.startsWith('ER_')) return `${action}: ฐานข้อมูลปฏิเสธคำสั่ง (${code})`;
  return `${action}: ข้อผิดพลาดของเซิร์ฟเวอร์${code ? ` (${code})` : ''} — ดูรายละเอียดใน log ของเซิร์ฟเวอร์`;
}
