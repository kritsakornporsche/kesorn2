'use client';

import { signOut } from 'next-auth/react';
import { unsubscribeDeviceFromWebPush } from '@/lib/features/web-push-client';

/**
 * Robust signout handler for Kesorn 2
 * - Unsubscribes device from Web Push so logged-out users never receive notifications
 * - Clears localStorage auth state
 * - Calls NextAuth signOut
 * - Always forces full page navigation / reload to prevent staying stuck on current view
 */
export async function handleSignOut(callbackUrl: string = '/') {
  if (typeof window !== 'undefined') {
    try {
      const currentEmail = localStorage.getItem('userEmail') || undefined;
      await unsubscribeDeviceFromWebPush(currentEmail);
    } catch {
      // ignore unsubscribe error
    }

    try {
      localStorage.removeItem('userRole');
      localStorage.removeItem('userSubRole');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userName');
      localStorage.removeItem('selectedDormId');
      localStorage.removeItem('selectedDormDbName');
    } catch (e) {
      console.warn('Storage cleanup error:', e);
    }
  }

  try {
    await signOut({ callbackUrl, redirect: false });
  } catch (err) {
    console.error('SignOut error, falling back to direct navigation:', err);
  }

  if (typeof window !== 'undefined') {
    if (window.location.pathname === callbackUrl || (callbackUrl === '/' && window.location.pathname === '')) {
      window.location.reload();
    } else {
      window.location.href = callbackUrl;
    }
  }
}
