import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeTokenRole } from '@/lib/shared/auth';

export default function RootPage(): never {
  const token = cookies().get('cpmind_token')?.value;
  const role = token ? decodeTokenRole(token) : null;

  if (role === 'admin') {
    redirect('/admin/users_panel');
  }

  if (role === 'user') {
    redirect('/user/panel');
  }

  redirect('/login');
}