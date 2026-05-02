import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // /admin 경로는 관리자만 접근 가능
    if (pathname.startsWith('/admin') && token?.role !== 'admin') {
      return NextResponse.redirect(new URL('/my', req.url));
    }

    // 루트 경로 리다이렉트
    if (pathname === '/') {
      if (token?.role === 'admin') {
        return NextResponse.redirect(new URL('/admin', req.url));
      }
      return NextResponse.redirect(new URL('/my', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ['/', '/my/:path*', '/admin/:path*', '/api/leaves/:path*', '/api/employees/:path*', '/api/admin/:path*'],
  // 참고: /api/slack/* 경로는 matcher에 포함하지 않아 NextAuth 인증 제외 (Slack 자체 서명 검증 사용)
};
