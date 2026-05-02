'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import Toast from '@/components/common/Toast';
import Link from 'next/link';
import { LEAVE_TYPES, LeaveType } from '@/lib/types';
import { formatDateKR, getDayName } from '@/lib/leave-calculation';

interface MonthLeave {
  id: string;
  date: string;
  type: LeaveType;
  employees: { name: string; email: string };
}

interface EmployeeSummary {
  id: string;
  name: string;
  email: string;
  hire_date: string;
  role: string;
  entitlement: number;
  used: number;
  remaining: number;
}

export default function AdminDashboard() {
  const [monthLeaves, setMonthLeaves] = useState<MonthLeave[]>([]);
  const [monthTotalUsed, setMonthTotalUsed] = useState(0);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [currentMonth, setCurrentMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/admin/dashboard');
        if (!res.ok) throw new Error('데이터 조회 실패');
        const data = await res.json();
        setMonthLeaves(data.monthLeaves);
        setMonthTotalUsed(data.monthTotalUsed);
        setEmployees(data.employeeSummaries);
        setCurrentMonth(data.currentMonth);
      } catch {
        setToast({ message: '데이터를 불러오는데 실패했습니다', type: 'error' });
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const formatValue = (v: number) => (v % 1 === 0 ? v.toString() : v.toFixed(1));

  if (loading) {
    return (
      <>
        <Header />
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="text-center text-slate-400 py-20">로딩 중...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">관리자 대시보드</h1>

        {/* 이번 달 요약 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-card p-5 shadow-card">
            <div className="text-xs text-slate-500 font-medium mb-1">{currentMonth} 연차 사용자</div>
            <div className="text-3xl font-extrabold text-slate-900">
              {new Set(monthLeaves.map(l => l.employees?.name).filter(Boolean)).size}
              <span className="text-sm text-slate-500 font-medium ml-1">명</span>
            </div>
          </div>
          <div className="bg-white rounded-card p-5 shadow-card">
            <div className="text-xs text-slate-500 font-medium mb-1">{currentMonth} 총 사용</div>
            <div className="text-3xl font-extrabold text-primary">
              {formatValue(monthTotalUsed)}
              <span className="text-sm text-slate-500 font-medium ml-1">일</span>
            </div>
          </div>
          <div className="bg-white rounded-card p-5 shadow-card">
            <div className="text-xs text-slate-500 font-medium mb-1">전체 구성원</div>
            <div className="text-3xl font-extrabold text-slate-900">
              {employees.length}
              <span className="text-sm text-slate-500 font-medium ml-1">명</span>
            </div>
          </div>
        </div>

        {/* 이번 달 연차 목록 */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-3">{currentMonth} 연차 현황</h2>
          {monthLeaves.length === 0 ? (
            <div className="bg-white rounded-card p-8 text-center text-slate-400 text-sm shadow-card">
              이번 달 등록된 연차가 없습니다.
            </div>
          ) : (
            <div className="bg-white rounded-card shadow-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">날짜</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">요일</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">이름</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">유형</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">차감</th>
                  </tr>
                </thead>
                <tbody>
                  {monthLeaves.map(leave => {
                    const info = LEAVE_TYPES[leave.type];
                    const typeColorClass = {
                      'type-full': 'bg-primary-light text-primary',
                      'type-am-half': 'bg-warning-light text-amber-700',
                      'type-pm-half': 'bg-purple-light text-purple',
                    }[info.cssClass];

                    return (
                      <tr key={leave.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-medium text-slate-700">
                          {formatDateKR(leave.date)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-400">
                          {getDayName(leave.date)}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-700">
                          {leave.employees?.name || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${typeColorClass}`}>
                            {info.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500 text-right">
                          -{info.cost === 1 ? '1일' : '0.5일'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 구성원 잔여 연차 */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-slate-900">구성원 연차 현황</h2>
            <Link
              href="/admin/employees"
              className="text-sm text-primary font-medium hover:underline"
            >
              구성원 관리 &rarr;
            </Link>
          </div>
          <div className="bg-white rounded-card shadow-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">이름</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">역할</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">총 발생</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">사용</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">잔여</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">상세</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{emp.name}</td>
                    <td className="px-4 py-3">
                      {emp.role === 'admin' ? (
                        <span className="text-xs font-semibold px-2 py-0.5 bg-primary-light text-primary rounded-full">
                          관리자
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">일반</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 text-right">
                      {formatValue(emp.entitlement)}개
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 text-right">
                      {formatValue(emp.used)}개
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-accent text-right">
                      {formatValue(emp.remaining)}개
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link
                        href={`/admin/employee/${emp.id}`}
                        className="text-xs text-primary hover:underline font-medium"
                      >
                        보기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </>
  );
}
