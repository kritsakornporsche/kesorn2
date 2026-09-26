import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  secret: 'A3B4C5D6E7F8G9H0I1J2K3L4M5N6O7P8Q9R0S1T2U3V4W5X6Y7Z8',
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
