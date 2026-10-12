import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Facebook from 'next-auth/providers/facebook';
import GitHub from 'next-auth/providers/github';
import Line from 'next-auth/providers/line';
import Credentials from 'next-auth/providers/credentials';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { verifyPassword } from '@/lib/password';
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

        // ── Direct User authentication for Kesorn 2 ─────────────────────────
        try {
          const users = await sql`
            SELECT id, name, email, password, COALESCE(role, primary_role, 'guest') as role, primary_role, sub_role, is_active
            FROM users
            WHERE (
              LOWER(email) = ${email}
              OR LOWER(name) = ${email}
              OR SUBSTRING_INDEX(LOWER(email), '@', 1) = ${email}
            )
            ORDER BY (LOWER(email) = ${email}) DESC
            LIMIT 1
          `;

          if (users.length > 0) {
            const user = users[0];
            const check = await verifyPassword(password, user.password);
            if (check.ok) {
              if (check.needsRehash) await rehash('users', user.id);
              return {
                id: String(user.id),
                name: user.name,
                email: user.email,
                role: user.role || user.primary_role || 'guest',
                sub_role: user.sub_role || null,
              } as any;
            }
          }
        } catch (e) { console.error('[Auth: user check]', e); }

        // ── Platform Admin fallback check ──────────────────────────────────
        try {
          const admins = await sql`
            SELECT id, name, email, password, role FROM platform_admins
            WHERE (
              LOWER(email) = ${email}
              OR LOWER(name) = ${email}
              OR SUBSTRING_INDEX(LOWER(email), '@', 1) = ${email}
            ) AND is_active = 1 LIMIT 1
          `;
          if (admins.length > 0) {
            const admin = admins[0];
            const check = await verifyPassword(password, admin.password);
            if (check.ok) {
              if (check.needsRehash) await rehash('platform_admins', admin.id);
              return {
                id: String(admin.id),
                name: admin.name,
                email: admin.email,
                role: 'platform_admin',
                sub_role: null,
              } as any;
            }
          }
        } catch (e) { console.error('[Auth: platform_admin check]', e); }

        return null;
      }
    }),
  ],

  pages: { signIn: '/signin' },

  callbacks: {
    async signIn() { return true; },

    async jwt({ token, user, account }) {
      if (user) {
        if ((user as any).role) {
          token.role = (user as any).role;
          token.sub_role = (user as any).sub_role || null;
        } else {
          // OAuth Sign-in: lookup email in users table
          const email = user.email?.toLowerCase().trim();
          if (email) {
            const sql = getDb();
            try {
              const dbUsers = await sql`
                SELECT COALESCE(role, primary_role, 'guest') as role, sub_role 
                FROM users 
                WHERE LOWER(email) = ${email} OR LOWER(name) = ${email} LIMIT 1
              `;
              if (dbUsers.length > 0) {
                token.role = dbUsers[0].role || 'guest';
                token.sub_role = dbUsers[0].sub_role || null;
              } else {
                token.role = 'guest';
                token.sub_role = null;
              }
            } catch (e) {
              console.error('[Auth JWT: OAuth lookup]', e);
            }
          }
        }
        token.name = user.name;

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




