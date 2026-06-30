import { NextRequest, NextResponse } from 'next/server';
import { decodeTokenRole } from '@/lib/shared/auth';

const PUBLIC_PATHS = ['/login'];

function matchesSection(pathname: string, section: string): boolean {
  return pathname === section || pathname.startsWith(`${section}/`);
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('cpmind_token')?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  const role = decodeTokenRole(token);

  if (role === null) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (matchesSection(pathname, '/admin') && role !== 'admin') {
    return NextResponse.redirect(new URL('/user/panel', request.url));
  }

  if (matchesSection(pathname, '/user') && role !== 'user') {
    return NextResponse.redirect(new URL('/admin/users_panel', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};