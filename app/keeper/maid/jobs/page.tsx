import { redirect } from 'next/navigation';

// The job list now lives on /keeper/maid (components/maintenance/KeeperJobs.tsx)
export default function Page() {
  redirect('/keeper/maid');
}
