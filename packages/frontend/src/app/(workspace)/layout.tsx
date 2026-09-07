import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeTokenRole } from '@/lib/shared/auth';
import { WorkspaceNav } from '@/components/shared/WorkspaceNav';
import type { UserRole } from '@cpmind/shared';

export default function WorkspaceLayout({
    children,
}: {
    children: React.ReactNode;
}): React.ReactElement {
    const token = cookies().get('cpmind_token')?.value;
    const role = token ? decodeTokenRole(token) : null;

    if (role !== 'admin' && role !== 'user') {
        redirect('/login');
    }

    return (
        <div>
            <WorkspaceNav role={role as UserRole} />
            {children}
        </div>
    );
}