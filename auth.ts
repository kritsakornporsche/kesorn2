import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Facebook from 'next-auth/providers/facebook';
import GitHub from 'next-auth/providers/github';
import Line from 'next-auth/providers/line';
import Credentials from 'next-auth/providers/credentials';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { authConfig } from './auth.config';






process.env.AUTH_TRUST_HOST = 'true';
process.env.AUTH_SECRET = 'A3B4C5D6E7F8G9H0I1J2K3L4M5N6O7P8Q9R0S1T2U3V4W5X6Y7Z8';
process.env.NEXTAUTH_SECRET = 'A3B4C5D6E7F8G9H0I1J2K3L4M5N6O7P8Q9R0S1T2U3V4W5X6Y7Z8';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  trustHost: true,
  secret: 'A3B4C5D6E7F8G9H0I1J2K3L4M5N6O7P8Q9R0S1T2U3V4W5X6Y7Z8',






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

        // Map role shortcuts to their official Kesorn 2 emails
        const ROLE_SHORTCUT_MAP: Record<string, string> = {
          tenant: 'tenant@kesorn.com',
          owner: 'owner@kesorn.com',
          admin: 'admin@smartdom.com',
          maid: 'maid@kesorn.com',
          tech: 'technician@kesorn.com',
          technician: 'technician@kesorn.com',
          researcher: 'researcher@kesorn.com',
          guest: 'guest@kesorn.com',
        };
        const targetEmail = ROLE_SHORTCUT_MAP[email] || email;

        const verifyPassword = async (storedHash: string): Promise<boolean> => {
          if (storedHash.startsWith('$2')) {
            const direct = await bcrypt.compare(password, storedHash);
            if (direct) return true;
            if (password.toLowerCase() === 'tech' && await bcrypt.compare('technician', storedHash)) return true;
            return false;
          }
          if (storedHash.length === 64) {
            const crypto = require('crypto');
            return crypto.createHash('sha256').update(password).digest('hex') === storedHash;
          }
          return password === storedHash || (password.toLowerCase() === 'tech' && storedHash === 'technician');
        };

        // ── Direct User authentication for Kesorn 2 ─────────────────────────
        try {
          const users = await sql`
            SELECT id, name, email, password, COALESCE(role, primary_role, 'guest') as role, primary_role, sub_role, is_active
            FROM users
            WHERE (
              LOWER(email) = ${targetEmail} 
              OR LOWER(name) = ${email}
              OR LOWER(email) = ${email}
              OR SUBSTRING_INDEX(LOWER(email), '@', 1) = ${email}
            )
            ORDER BY (LOWER(email) = ${targetEmail}) DESC, (LOWER(email) = ${email}) DESC
            LIMIT 1
          `;
          
          if (users.length > 0) {
            const user = users[0];
            if (await verifyPassword(user.password)) {
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
              LOWER(email) = ${targetEmail} 
              OR LOWER(email) = ${email} 
              OR LOWER(name) = ${email}
              OR SUBSTRING_INDEX(LOWER(email), '@', 1) = ${email}
            ) AND is_active = 1 LIMIT 1
          `;
          if (admins.length > 0) {
            const admin = admins[0];
            if (await verifyPassword(admin.password)) {
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
                SELECT role, sub_role 
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
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
        (session.user as any).sub_role = token.sub_role;
        (session.user as any).dormId = token.dormId;
        session.user.name = token.name;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      const cleanBase = (baseUrl || '').replace(/\/$/, '');
      if (url.startsWith('/')) {
        return cleanBase ? `${cleanBase}${url}` : url;
      }
      try {
        const parsed = new URL(url);
        if (cleanBase) {
          const baseParsed = new URL(cleanBase);
          if (parsed.origin === baseParsed.origin) return url;
        }
        // Allow same-origin or known trusted dev/prod origins
        if (
          ['localhost', '127.0.0.1'].includes(parsed.hostname) ||
          parsed.hostname.endsWith('thddns.net') ||
          parsed.hostname.startsWith('192.168.') ||
          parsed.hostname.startsWith('10.') ||
          parsed.hostname.startsWith('172.')
        ) {
          return url;
        }
        return cleanBase ? `${cleanBase}${parsed.pathname}${parsed.search}` : url;
      } catch (e) {
        return cleanBase ? `${cleanBase}/explore` : '/explore';
      }
    },
  },
});




