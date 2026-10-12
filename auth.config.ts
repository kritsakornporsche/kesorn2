import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: '/signin',
    signOut: '/',
  },


  callbacks: {
    authorized() {
      return true;
    },
  },

  providers: [],
} satisfies NextAuthConfig;
