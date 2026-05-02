'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import SummaryCards from '@/components/leave/SummaryCards';
import ProgressBar from '@/components/leave/ProgressBar';
import LeaveHistory from '@/components/leave/LeaveHistory';
import LeaveModal from '@/components/leave/LeaveModal';
import Toast from '@/components/common/Toast';
import { Leave, LeaveType, LeaveSummary } from '@/lib/types';
import {
  calculateLeaveEntitlement,
  calculateUsedLeaves,
  getNextGenerationInfo,
  getLeavePeriodDates,
  getMonthsWorked,
  getYearsWorked,
  formatDateKR,
  calculateEffectiveEntitlement,
  splitAdjustments,
} from '@/lib/leave-calculation';

interface EmployeeData {
  id: string;
  name: string;
  hire_date: string;
  role: string;
}

export default function MyLeavePage() {
  const { data: session } = useSession();
  const [employee, setEmployee] = useState<EmployeeData | null>(null);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [adjustments, setAdjustments] = useState<Array<{ adjustment: number; leave_year: number; type?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLeave, setEditingLeave] = useState<Leave | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/leaves');
      if (!res.ok) throw new Error('데이터 조회 실패');
      const data = await res.json();
      setEmployee(data.employee);
      setLeaves(data.leaves);
      setAdjustments(data.adjustments);
    } catch {
      setToast({ message: '데이터를 불러오는데 실패했습니다', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 연차 요약 계산
  const summary: LeaveSummary = (() => {
    if (!employee) {
      return {
        totalEntitlement: 0,
        totalUsed: 0,
        remaining: 0,
        adjustments: 0,
        nextGenerationDate: null,
        nextGenerationDescription: null,
      };
    }

    const period = getLeavePeriodDates(employee.hire_date);
    const entitlement = calculateLeaveEntitlement(employee.hire_date);

    const periodLeaves = leaves.filter(l => l.date >= period.start && l.date <= period.end);
    const used = calculateUsedLeaves(periodLeaves);

    const periodAdjustments = adjustments.filter(a => a.leave_year === period.leaveYear);
    const { advanceTotal, generalTotal } = splitAdjustments(periodAdjustments);
    const effectiveEntitlement = calculateEffectiveEntitlement(entitlement, period.leaveYear, advanceTotal);

    const nextGen = getNextGenerationInfo(employee.hire_date);

    return {
      totalEntitlement: effectiveEntitlement + generalTotal,
      totalUsed: used,
      remaining: effectiveEntitlement + generalTotal - used,
      adjustments: generalTotal,
      nextGenerationDate: nextGen ? formatDateKR(nextGen.date) : null,
      nextGenerationDescription: nextGen?.description || null,
    };
  })();

  // 근속 정보 텍스트
  const periodInfoText = (() => {
    if (!employee) return '';
    const years = getYearsWorked(employee.hire_date);
    if (years < 1) {
      const months = getMonthsWorked(employee.hire_date);
      return `입사 ${months}개월차 (월차 기간)`;
    }
    return `입사 ${years}년차 (연차 기간)`;
  })();

  // 연차 등록
  const handleSave = async (data: { startDate: string; endDate?: string; type: LeaveType }) => {
    try {
      if (editingLeave) {
        // 수정
        const res = await fetch(`/api/leaves/${editingLeave.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: data.startDate, type: data.type }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error);
        }
        setToast({ message: '연차가 수정되었습니다', type: 'success' });
      } else {
        // 신규 등록
        const res = await fetch('/api/leaves', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDate: data.startDate,
            endDate: data.endDate,
            type: data.type,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error);
        }
        const result = await res.json();
        setToast({ message: result.message || '연차가 등록되었습니다', type: 'success' });
      }

      setModalOpen(false);
      setEditingLeave(null);
      fetchData();
    } catch (err) {
      setToast({ message: (err as Error).message, type: 'error' });
    }
  };

  // 연차 삭제
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/leaves/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      setToast({ message: '연차가 삭제되었습니다', type: 'success' });
      setModalOpen(false);
      setEditingLeave(null);
      fetchData();
    } catch (err) {
      setToast({ message: (err as Error).message, type: 'error' });
    }
  };

  const user = session?.user as Record<string, unknown> | undefined;
  const isAdmin = user?.role === 'admin';

  if (loading) {
    return (
      <>
        <Header />
        <div className="max-w-[720px] mx-auto px-4 py-6">
          <div className="text-center text-slate-400 py-20">로딩 중...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="max-w-[720px] mx-auto px-4 py-6">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-7 pb-4 border-b-2 border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">연차 기록기</h1>
            <span className="inline-block mt-1 px-2.5 py-0.5 bg-primary-light text-primary rounded-full text-xs font-semibold">
              {employee?.name || ''}
            </span>
          </div>
          <span className="text-sm text-slate-500">{periodInfoText}</span>
        </div>

        {/* 요약 카드 */}
        <SummaryCards summary={summary} />

        {/* 사용률 */}
        <ProgressBar used={summary.totalUsed} total={summary.totalEntitlement} />

        {/* 사용 내역 */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-slate-900">사용 내역</h2>
            <button
              onClick={() => {
                setEditingLeave(null);
                setModalOpen(true);
              }}
              className="px-4 py-2 bg-primary text-white rounded-btn text-sm font-semibold hover:bg-primary-dark transition-colors"
            >
              + 연차 등록
            </button>
          </div>

          <LeaveHistory
            leaves={leaves}
            isAdmin={isAdmin}
            onEdit={(leave) => {
              setEditingLeave(leave);
              setModalOpen(true);
            }}
            onDelete={handleDelete}
          />
        </div>
      </div>

      {/* 연차 등록/수정 모달 */}
      <LeaveModal
        isOpen={modalOpen}
        editingLeave={editingLeave}
        onClose={() => {
          setModalOpen(false);
          setEditingLeave(null);
        }}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      {/* 토스트 */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
