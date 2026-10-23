import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Facebook from 'next-auth/providers/facebook';
import GitHub from 'next-auth/providers/github';
import Line from 'next-auth/providers/line';
import Credentials from 'next-auth/providers/credentials';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { verifyPassword } from '@/lib/password';
import { findLoginAccount } from '@/lib/login-lookup';
import { authConfig } from './auth.config';

if (!process.env.AUTH_SECRET) {
  throw new Error('AUTH_SECRET is not set');
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  trustHost: true,
  secret: process.env.AUTH_SECRET,






  providers: [
    ...(process.env.GOOGLE_CLIENT_ID ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET! })] : []),
    ...(process.env.FACEBOOK_CLIENT_ID ? [Facebook({ clientId: process.env.FACEBOOK_CLIENT_ID, clientSecret: process.env.FACEBOOK_CLIENT_SECRET! })] : []),
    ...(process.env.GITHUB_CLIENT_ID ? [GitHub({ clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET! })] : []),
    ...(process.env.LINE_CLIENT_ID ? [Line({ clientId: process.env.LINE_CLIENT_ID, clientSecret: process.env.LINE_CLIENT_SECRET! })] : []),

    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = String(credentials.email).toLowerCase().trim();
        const password = String(credentials.password);
        const sql = getDb();

        const rehash = async (table: 'users' | 'platform_admins', id: number) => {
          try {
            const hashed = await bcrypt.hash(password, 10);
            if (table === 'users') {
              await sql`UPDATE users SET password = ${hashed} WHERE id = ${id}`;
            } else {
              await sql`UPDATE platform_admins SET password = ${hashed} WHERE id = ${id}`;
            }
          } catch (e) { console.error('[Auth: rehash]', e); }
        };

        try {
          // Ambiguous names (several accounts) are refused; /api/auth/login tells the user to use the email
          const lookup = await findLoginAccount(sql, email);
          if (!('found' in lookup)) return null;

          const { table, row } = lookup.found;
          const check = await verifyPassword(password, row.password);
          if (!check.ok || !row.is_active) return null;
          if (check.needsRehash) await rehash(table, row.id);

          return {
            id: String(row.id),
            name: row.name,
            email: row.email,
            role: table === 'platform_admins' ? 'platform_admin' : (row.role || 'guest'),
            sub_role: table === 'platform_admins' ? null : (row.sub_role || null),
          } as any;
        } catch (e) { console.error('[Auth: credentials check]', e); }

        return null;
      }
    }),
  ],

  pages: { signIn: '/signin' },

  callbacks: {
    async signIn() { return true; },

    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        token.name = user.name;
        token.email = user.email;
        if ((user as any).role) {
          token.role = (user as any).role;
          token.sub_role = (user as any).sub_role || null;
        }
      }

      if (trigger === 'update' && session?.role) {
        token.role = session.role;
      }

      // Sync role dynamically from DB so that role changes (e.g. move-out downgrade to guest) take effect immediately without re-login
      const lookupEmail = (token.email || user?.email)?.toLowerCase().trim();
      if (lookupEmail) {
        const sql = getDb();
        try {
          const dbUsers = await sql`
            SELECT COALESCE(role, primary_role, 'guest') as role, sub_role 
            FROM users 
            WHERE LOWER(email) = ${lookupEmail} OR LOWER(name) = ${lookupEmail} LIMIT 1
          `;
          if (dbUsers.length > 0) {
            token.role = dbUsers[0].role || 'guest';
            token.sub_role = dbUsers[0].sub_role || null;
          }
        } catch (e) {
          console.error('[Auth JWT: Sync role error]', e);
        }
      }

      if (user) {
        // Resolve dormId (GUARD-01)
        const email = user.email?.toLowerCase().trim();
        const userId = user.id;
        const sql = getDb();
        try {
          let resolvedDormId = 1;
          const userRole = token.role || (user as any).role;
          if (userRole === 'owner') {
            const dorms = await sql`
              SELECT id FROM dormitory_registry 
              WHERE owner_id = ${userId} OR LOWER(owner_email) = ${email} 
              LIMIT 1
            `;
            if (dorms.length > 0) resolvedDormId = dorms[0].id;
          } else if (userRole === 'tenant') {
            const tenants = await sql`
              SELECT dorm_id FROM tenants 
              WHERE user_id = ${userId} OR LOWER(email) = ${email} 
              LIMIT 1
            `;
            if (tenants.length > 0 && tenants[0].dorm_id) resolvedDormId = tenants[0].dorm_id;
          } else if (userRole === 'keeper') {
            const keepers = await sql`
              SELECT dorm_id FROM keepers 
              WHERE user_id = ${userId} OR LOWER(email) = ${email} 
              LIMIT 1
            `;
            if (keepers.length > 0 && keepers[0].dorm_id) resolvedDormId = keepers[0].dorm_id;
          }
          token.dormId = resolvedDormId || 1;
        } catch (e) {
          token.dormId = 1;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
        (session.user as any).sub_role = token.sub_role;
        (session.user as any).dormId = token.dormId || 1;
        session.user.name = token.name;
      }
      return session;
    },

    async redirect({ url }) {
      if (url.startsWith('/')) {
        return url;
      }
      try {
        const parsed = new URL(url);
        return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
      } catch (e) {
        return '/explore';
      }
    },
  },
});




