import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeTokenRole } from '@/lib/shared/auth';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = cookies().get('cpmind_token')?.value;
  const role = token ? decodeTokenRole(token) : null;

  if (role !== 'admin') {
    redirect('/login');
  }

  return <>{children}</>;
}