import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeTokenRole } from '@/lib/shared/auth';

export default function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = cookies().get('cpmind_token')?.value;
  const role = token ? decodeTokenRole(token) : null;

  if (role !== 'user') {
    redirect('/login');
  }

  return <>{children}</>;
}