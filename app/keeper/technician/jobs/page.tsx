import { redirect } from 'next/navigation';

// The job list now lives on /keeper/technician (components/maintenance/KeeperJobs.tsx)
export default function Page() {
  redirect('/keeper/technician');
}
