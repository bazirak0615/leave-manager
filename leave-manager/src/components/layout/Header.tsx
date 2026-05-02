'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();

  const user = session?.user as Record<string, unknown> | undefined;
  const isAdmin = user?.role === 'admin';
  const employeeName = String((user?.employeeName as string) || user?.name || '');

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* 좌측: 로고 + 네비게이션 */}
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold text-slate-900">
            연차 관리
          </Link>

          <nav className="flex items-center gap-1">
            <Link
              href="/my"
              className={`px-3 py-1.5 rounded-btn text-sm font-medium transition-colors ${
                pathname === '/my'
                  ? 'bg-primary-light text-primary'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              내 연차
            </Link>

            {isAdmin && (
              <>
                <Link
                  href="/admin"
                  className={`px-3 py-1.5 rounded-btn text-sm font-medium transition-colors ${
                    pathname === '/admin'
                      ? 'bg-primary-light text-primary'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  대시보드
                </Link>
                <Link
                  href="/admin/employees"
                  className={`px-3 py-1.5 rounded-btn text-sm font-medium transition-colors ${
                    pathname.startsWith('/admin/employees') || pathname.startsWith('/admin/employee/')
                      ? 'bg-primary-light text-primary'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  구성원
                </Link>
                <Link
                  href="/admin/settings"
                  className={`px-3 py-1.5 rounded-btn text-sm font-medium transition-colors ${
                    pathname === '/admin/settings'
                      ? 'bg-primary-light text-primary'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  설정
                </Link>
              </>
            )}
          </nav>
        </div>

        {/* 우측: 사용자 정보 + 로그아웃 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">{employeeName}</span>
            {isAdmin && (
              <span className="px-2 py-0.5 bg-primary-light text-primary text-xs font-semibold rounded-full">
                관리자
              </span>
            )}
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}
