import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/authz';

// Shared layout for /owner pages that managers must not open (settings, staff, rules, accounting)
export default async function OwnerOnlyLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (user?.role !== 'owner') {
    redirect('/owner');
  }
  return <>{children}</>;
}
