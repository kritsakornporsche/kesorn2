export type LoginAccount =
  | { table: 'users'; row: any }
  | { table: 'platform_admins'; row: any };

export type LoginLookup =
  | { found: LoginAccount }
  | { ambiguous: true }
  | { notFound: true };

// Resolve what the user typed (email, username, or the part before @) to exactly one account.
// Order: exact email first; name / email-prefix only when a single account matches.
// Several matches are refused instead of guessing, so the caller can ask for the email.
export async function findLoginAccount(sql: any, input: string): Promise<LoginLookup> {
  const id = input.toLowerCase().trim();
  if (!id) return { notFound: true };

  const users = (where: 'email' | 'name' | 'prefix') => {
    if (where === 'email') {
      return sql`SELECT id, name, email, password, COALESCE(role, primary_role, 'guest') as role, sub_role, is_active FROM users WHERE LOWER(email) = ${id} LIMIT 2`;
    }
    if (where === 'name') {
      return sql`SELECT id, name, email, password, COALESCE(role, primary_role, 'guest') as role, sub_role, is_active FROM users WHERE LOWER(name) = ${id} LIMIT 2`;
    }
    return sql`SELECT id, name, email, password, COALESCE(role, primary_role, 'guest') as role, sub_role, is_active FROM users WHERE SUBSTRING_INDEX(LOWER(email), '@', 1) = ${id} LIMIT 2`;
  };

  const pick = (rows: any[], table: LoginAccount['table']): LoginLookup | null => {
    if (rows.length === 1) return { found: { table, row: rows[0] } as LoginAccount };
    if (rows.length > 1) return { ambiguous: true };
    return null;
  };

  // 1. Exact email (emails are unique)
  const byEmail = await users('email');
  if (byEmail.length > 0) return { found: { table: 'users', row: byEmail[0] } };

  const adminByEmail = await sql`SELECT id, name, email, password, is_active FROM platform_admins WHERE LOWER(email) = ${id} AND is_active = 1 LIMIT 1`;
  if (adminByEmail.length > 0) return { found: { table: 'platform_admins', row: adminByEmail[0] } };

  // 2. Username, then the part before @ — only when exactly one account matches
  const byName = pick(await users('name'), 'users');
  if (byName) return byName;

  const byPrefix = pick(await users('prefix'), 'users');
  if (byPrefix) return byPrefix;

  const adminByAlias = await sql`
    SELECT id, name, email, password, is_active FROM platform_admins
    WHERE (LOWER(name) = ${id} OR SUBSTRING_INDEX(LOWER(email), '@', 1) = ${id}) AND is_active = 1
    LIMIT 2
  `;
  return pick(adminByAlias, 'platform_admins') ?? { notFound: true };
}
