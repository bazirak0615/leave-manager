'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Header from '@/components/layout/Header';
import Toast from '@/components/common/Toast';
import { Employee } from '@/lib/types';

export default function SettingsPage() {
  const { data: session } = useSession();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const user = session?.user as Record<string, unknown> | undefined;
  const myId = user?.employeeId as string;

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/employees');
      if (!res.ok) throw new Error('조회 실패');
      const data = await res.json();
      setEmployees(data.employees.filter((e: Employee) => e.is_active));
    } catch {
      setToast({ message: '구성원 목록을 불러오는데 실패했습니다', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const admins = employees.filter(e => e.role === 'admin');
  const users = employees.filter(e => e.role === 'user');

  const handleRoleChange = async (action: 'promote' | 'demote' | 'transfer', targetId: string, targetName: string) => {
    const messages = {
      promote: `${targetName}님을 관리자로 승격하시겠습니까?`,
      demote: `${targetName}님의 관리자 권한을 해제하시겠습니까?`,
      transfer: `${targetName}님에게 관리자 권한을 이관하시겠습니까?\n\n이관 후 본인은 일반 사용자로 변경됩니다.`,
    };

    if (!confirm(messages[action])) return;

    try {
      const res = await fetch('/api/admin/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, targetEmployeeId: targetId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      const result = await res.json();
      setToast({ message: result.message, type: 'success' });

      if (action === 'transfer') {
        // 이관 후 페이지 새로고침 (권한 변경 반영)
        setTimeout(() => window.location.href = '/my', 1500);
      } else {
        fetchEmployees();
      }
    } catch (err) {
      setToast({ message: (err as Error).message, type: 'error' });
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="text-center text-slate-400 py-20">로딩 중...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">관리자 설정</h1>

        {/* 현재 관리자 목록 */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-3">현재 관리자</h2>
          <div className="bg-white rounded-card shadow-card overflow-hidden">
            {admins.map(admin => (
              <div key={admin.id} className="flex items-center justify-between px-5 py-4 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary-light flex items-center justify-center text-primary font-bold text-sm">
                    {admin.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-700">
                      {admin.name}
                      {admin.id === myId && (
                        <span className="ml-1.5 text-xs text-slate-400">(나)</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">{admin.email}</div>
                  </div>
                </div>

                {admin.id !== myId && (
                  <button
                    onClick={() => handleRoleChange('demote', admin.id, admin.name)}
                    className="text-xs text-slate-400 hover:text-danger font-medium px-3 py-1.5 rounded-btn hover:bg-danger-light transition-colors"
                  >
                    권한 해제
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 관리자 추가 */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-3">관리자 추가</h2>
          <p className="text-sm text-slate-500 mb-3">일반 구성원을 관리자로 승격합니다.</p>
          <div className="bg-white rounded-card shadow-card overflow-hidden">
            {users.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400">
                승격 가능한 일반 구성원이 없습니다.
              </div>
            ) : (
              users.map(emp => (
                <div key={emp.id} className="flex items-center justify-between px-5 py-4 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-sm">
                      {emp.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-700">{emp.name}</div>
                      <div className="text-xs text-slate-400">{emp.email}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRoleChange('promote', emp.id, emp.name)}
                    className="text-xs text-primary font-medium px-3 py-1.5 rounded-btn hover:bg-primary-light transition-colors"
                  >
                    관리자 승격
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 관리자 권한 이관 */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-3">관리자 권한 이관</h2>
          <div className="bg-warning-light border border-warning rounded-btn p-3 mb-3 text-sm text-amber-700">
            권한을 이관하면 본인은 일반 사용자로 변경됩니다. 이 작업은 되돌릴 수 없습니다.
          </div>
          <div className="bg-white rounded-card shadow-card overflow-hidden">
            {users.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400">
                이관 대상이 없습니다. 먼저 구성원을 등록하세요.
              </div>
            ) : (
              users.map(emp => (
                <div key={emp.id} className="flex items-center justify-between px-5 py-4 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-sm">
                      {emp.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-700">{emp.name}</div>
                      <div className="text-xs text-slate-400">{emp.email}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRoleChange('transfer', emp.id, emp.name)}
                    className="text-xs text-danger font-medium px-3 py-1.5 rounded-btn hover:bg-danger-light transition-colors"
                  >
                    권한 이관
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
