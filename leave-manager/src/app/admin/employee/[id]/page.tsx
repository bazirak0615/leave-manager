'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import SummaryCards from '@/components/leave/SummaryCards';
import ProgressBar from '@/components/leave/ProgressBar';
import LeaveHistory from '@/components/leave/LeaveHistory';
import LeaveModal from '@/components/leave/LeaveModal';
import Toast from '@/components/common/Toast';
import { Leave, LeaveType, LeaveSummary, Employee } from '@/lib/types';
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
import Link from 'next/link';

const DEDUCTION_REASONS = ['무단결근', '현금지급', '기타'];

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Next.js 14.2.x: TypeScript는 Promise 타입이지만 런타임에서는 일반 객체
  const { id } = params as unknown as { id: string };
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [adjustments, setAdjustments] = useState<Array<{ adjustment: number; leave_year: number; reason: string | null; type?: string; id: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLeave, setEditingLeave] = useState<Leave | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // 보정 모달
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ adjustment: '', reason: '' });

  // 선연차 모달
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({ days: '', memo: '' });

  // 차감 모달
  const [showDeductModal, setShowDeductModal] = useState(false);
  const [deductForm, setDeductForm] = useState({ days: '', reasonType: '무단결근', memo: '' });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/employees/${id}`);
      if (!res.ok) throw new Error('조회 실패');
      const data = await res.json();
      setEmployee(data.employee);
      setLeaves(data.leaves);
      setAdjustments(data.adjustments);
    } catch {
      setToast({ message: '데이터를 불러오는데 실패했습니다', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 현재 leave_year 계산
  const currentLeaveYear = employee ? getLeavePeriodDates(employee.hire_date).leaveYear : -1;

  // 연차 요약
  const summary: LeaveSummary = (() => {
    if (!employee) {
      return { totalEntitlement: 0, totalUsed: 0, remaining: 0, adjustments: 0, nextGenerationDate: null, nextGenerationDescription: null };
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

  const periodInfoText = (() => {
    if (!employee) return '';
    const years = getYearsWorked(employee.hire_date);
    if (years < 1) return `입사 ${getMonthsWorked(employee.hire_date)}개월차 (월차 기간)`;
    return `입사 ${years}년차 (연차 기간)`;
  })();

  // 관리자가 연차 등록
  const handleSave = async (data: { startDate: string; endDate?: string; type: LeaveType }) => {
    try {
      if (editingLeave) {
        const res = await fetch(`/api/leaves/${editingLeave.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: data.startDate, type: data.type }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error);
        }
        setToast({ message: '수정되었습니다', type: 'success' });
      } else {
        const res = await fetch('/api/admin/leaves', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employeeId: id, startDate: data.startDate, endDate: data.endDate, type: data.type }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error);
        }
        const result = await res.json();
        setToast({ message: result.message || '등록되었습니다', type: 'success' });
      }
      setModalOpen(false);
      setEditingLeave(null);
      fetchData();
    } catch (err) {
      setToast({ message: (err as Error).message, type: 'error' });
    }
  };

  const handleDelete = async (leaveId: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/leaves/${leaveId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제 실패');
      setToast({ message: '삭제되었습니다', type: 'success' });
      setModalOpen(false);
      setEditingLeave(null);
      fetchData();
    } catch (err) {
      setToast({ message: (err as Error).message, type: 'error' });
    }
  };

  // 연차 보정
  const handleAdjust = async () => {
    if (!adjustForm.adjustment || !employee) return;
    try {
      const period = getLeavePeriodDates(employee.hire_date);
      const res = await fetch('/api/admin/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: id,
          leaveYear: period.leaveYear,
          adjustment: Number(adjustForm.adjustment),
          reason: adjustForm.reason,
          type: 'general',
        }),
      });
      if (!res.ok) throw new Error('보정 실패');
      setToast({ message: '보정이 등록되었습니다', type: 'success' });
      setShowAdjustModal(false);
      setAdjustForm({ adjustment: '', reason: '' });
      fetchData();
    } catch (err) {
      setToast({ message: (err as Error).message, type: 'error' });
    }
  };

  // 선연차 부여
  const handleAdvance = async () => {
    if (!advanceForm.days || !advanceForm.memo || !employee) return;
    const days = Number(advanceForm.days);
    if (days <= 0) return;
    try {
      const res = await fetch('/api/admin/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: id,
          leaveYear: 0,
          adjustment: days,
          reason: advanceForm.memo,
          type: 'advance',
        }),
      });
      if (!res.ok) throw new Error('선연차 부여 실패');
      setToast({ message: `선연차 ${days}개가 부여되었습니다`, type: 'success' });
      setShowAdvanceModal(false);
      setAdvanceForm({ days: '', memo: '' });
      fetchData();
    } catch (err) {
      setToast({ message: (err as Error).message, type: 'error' });
    }
  };

  // 연차 차감
  const handleDeduct = async () => {
    if (!deductForm.days || !deductForm.memo || !employee) return;
    const days = Number(deductForm.days);
    if (days <= 0) return;
    try {
      const period = getLeavePeriodDates(employee.hire_date);
      const reason = deductForm.reasonType === '기타' ? deductForm.memo : `${deductForm.reasonType}: ${deductForm.memo}`;
      const res = await fetch('/api/admin/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: id,
          leaveYear: period.leaveYear,
          adjustment: -days,
          reason,
          type: 'deduction',
        }),
      });
      if (!res.ok) throw new Error('차감 실패');
      setToast({ message: `연차 ${days}개가 차감되었습니다`, type: 'success' });
      setShowDeductModal(false);
      setDeductForm({ days: '', reasonType: '무단결근', memo: '' });
      fetchData();
    } catch (err) {
      setToast({ message: (err as Error).message, type: 'error' });
    }
  };

  // 조정 삭제
  const handleDeleteAdjustment = async (adjId: string) => {
    if (!confirm('이 조정 내역을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/admin/adjustments/${adjId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제 실패');
      setToast({ message: '조정 내역이 삭제되었습니다', type: 'success' });
      fetchData();
    } catch (err) {
      setToast({ message: (err as Error).message, type: 'error' });
    }
  };

  // 조정 타입별 라벨/색상
  const getAdjustmentLabel = (type?: string) => {
    switch (type) {
      case 'advance': return { label: '선연차', color: 'text-blue-600 bg-blue-50' };
      case 'deduction': return { label: '차감', color: 'text-red-600 bg-red-50' };
      case 'carry_over': return { label: '이월', color: 'text-emerald-600 bg-emerald-50' };
      default: return { label: '보정', color: 'text-slate-600 bg-slate-100' };
    }
  };

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
        {/* 뒤로 가기 */}
        <Link href="/admin/employees" className="text-sm text-primary hover:underline mb-4 inline-block">
          &larr; 구성원 목록으로
        </Link>

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-7 pb-4 border-b-2 border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{employee?.name} 연차 현황</h1>
            <span className="inline-block mt-1 px-2.5 py-0.5 bg-primary-light text-primary rounded-full text-xs font-semibold">
              입사일: {employee?.hire_date}
            </span>
          </div>
          <span className="text-sm text-slate-500">{periodInfoText}</span>
        </div>

        <SummaryCards summary={summary} />
        <ProgressBar used={summary.totalUsed} total={summary.totalEntitlement} />

        {/* 관리 버튼 */}
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-bold text-slate-900">사용 내역</h2>
          <div className="flex gap-2 flex-wrap justify-end">
            {currentLeaveYear === 0 && (
              <button
                onClick={() => setShowAdvanceModal(true)}
                className="px-3 py-2 bg-blue-50 text-blue-600 rounded-btn text-sm font-semibold hover:bg-blue-100"
              >
                선연차 부여
              </button>
            )}
            <button
              onClick={() => setShowDeductModal(true)}
              className="px-3 py-2 bg-red-50 text-red-600 rounded-btn text-sm font-semibold hover:bg-red-100"
            >
              연차 차감
            </button>
            <button
              onClick={() => setShowAdjustModal(true)}
              className="px-3 py-2 bg-slate-100 text-slate-600 rounded-btn text-sm font-semibold hover:bg-slate-200"
            >
              연차 보정
            </button>
            <button
              onClick={() => { setEditingLeave(null); setModalOpen(true); }}
              className="px-4 py-2 bg-primary text-white rounded-btn text-sm font-semibold hover:bg-primary-dark"
            >
              + 연차 등록
            </button>
          </div>
        </div>

        <LeaveHistory
          leaves={leaves}
          isAdmin={true}
          onEdit={(leave) => { setEditingLeave(leave); setModalOpen(true); }}
          onDelete={handleDelete}
        />

        {/* 보정 내역 */}
        {adjustments.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-bold text-slate-900 mb-3">조정 내역</h2>
            <div className="bg-white rounded-card shadow-card overflow-hidden">
              {adjustments.map(adj => {
                const { label, color } = getAdjustmentLabel(adj.type);
                return (
                  <div key={adj.id} className="flex items-center justify-between px-4 py-3 border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
                        {label}
                      </span>
                      <span className={`text-sm font-bold ${Number(adj.adjustment) > 0 ? 'text-accent' : 'text-danger'}`}>
                        {Number(adj.adjustment) > 0 ? '+' : ''}{adj.adjustment}개
                      </span>
                      <span className="text-xs text-slate-400">({adj.leave_year}차)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 max-w-[200px] truncate">{adj.reason || '-'}</span>
                      <button
                        onClick={() => handleDeleteAdjustment(adj.id)}
                        className="text-xs text-slate-300 hover:text-red-500 transition-colors"
                        title="삭제"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <LeaveModal
        isOpen={modalOpen}
        editingLeave={editingLeave}
        onClose={() => { setModalOpen(false); setEditingLeave(null); }}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      {/* 보정 모달 */}
      {showAdjustModal && (
        <div
          className="fixed inset-0 bg-black/40 z-[1000] flex items-center justify-center p-4 animate-fadeIn"
          onClick={(e) => e.target === e.currentTarget && setShowAdjustModal(false)}
        >
          <div className="bg-white rounded-card w-full max-w-[380px] shadow-modal animate-slideUp">
            <div className="flex justify-between items-center px-6 pt-5">
              <h3 className="text-lg font-bold">연차 보정</h3>
              <button onClick={() => setShowAdjustModal(false)} className="text-2xl text-slate-400 hover:text-slate-600 leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">보정 개수 (+ 추가 / - 차감)</label>
                <input
                  type="number"
                  step="0.5"
                  value={adjustForm.adjustment}
                  onChange={e => setAdjustForm(f => ({ ...f, adjustment: e.target.value }))}
                  className="w-full px-3 py-2.5 border-[1.5px] border-slate-300 rounded-btn text-sm focus:outline-none focus:border-primary"
                  placeholder="예: 3 또는 -1"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">사유</label>
                <input
                  type="text"
                  value={adjustForm.reason}
                  onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))}
                  className="w-full px-3 py-2.5 border-[1.5px] border-slate-300 rounded-btn text-sm focus:outline-none focus:border-primary"
                  placeholder="예: 전년도 이월, 수동 조정"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 pb-5">
              <button onClick={() => setShowAdjustModal(false)} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-btn text-sm font-semibold hover:bg-slate-200">취소</button>
              <button onClick={handleAdjust} className="px-5 py-2.5 bg-primary text-white rounded-btn text-sm font-semibold hover:bg-primary-dark">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 선연차 부여 모달 */}
      {showAdvanceModal && (
        <div
          className="fixed inset-0 bg-black/40 z-[1000] flex items-center justify-center p-4 animate-fadeIn"
          onClick={(e) => e.target === e.currentTarget && setShowAdvanceModal(false)}
        >
          <div className="bg-white rounded-card w-full max-w-[380px] shadow-modal animate-slideUp">
            <div className="flex justify-between items-center px-6 pt-5">
              <h3 className="text-lg font-bold text-blue-600">선연차 부여</h3>
              <button onClick={() => setShowAdvanceModal(false)} className="text-2xl text-slate-400 hover:text-slate-600 leading-none">&times;</button>
            </div>
            <p className="px-6 pt-2 text-xs text-slate-500">
              입사 1년 미만 직원에게 미래 월차를 미리 부여합니다. 부여한 만큼 향후 월차 발생 시 중복 발생하지 않습니다.
            </p>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">부여 개수</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={advanceForm.days}
                  onChange={e => setAdvanceForm(f => ({ ...f, days: e.target.value }))}
                  className="w-full px-3 py-2.5 border-[1.5px] border-slate-300 rounded-btn text-sm focus:outline-none focus:border-blue-500"
                  placeholder="예: 1"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">메모 (필수)</label>
                <input
                  type="text"
                  value={advanceForm.memo}
                  onChange={e => setAdvanceForm(f => ({ ...f, memo: e.target.value }))}
                  className="w-full px-3 py-2.5 border-[1.5px] border-slate-300 rounded-btn text-sm focus:outline-none focus:border-blue-500"
                  placeholder="예: 긴급 개인 사유로 선연차 부여"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 pb-5">
              <button onClick={() => setShowAdvanceModal(false)} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-btn text-sm font-semibold hover:bg-slate-200">취소</button>
              <button
                onClick={handleAdvance}
                disabled={!advanceForm.days || !advanceForm.memo}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-btn text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                부여
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 연차 차감 모달 */}
      {showDeductModal && (
        <div
          className="fixed inset-0 bg-black/40 z-[1000] flex items-center justify-center p-4 animate-fadeIn"
          onClick={(e) => e.target === e.currentTarget && setShowDeductModal(false)}
        >
          <div className="bg-white rounded-card w-full max-w-[380px] shadow-modal animate-slideUp">
            <div className="flex justify-between items-center px-6 pt-5">
              <h3 className="text-lg font-bold text-red-600">연차 차감</h3>
              <button onClick={() => setShowDeductModal(false)} className="text-2xl text-slate-400 hover:text-slate-600 leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">차감 개수</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={deductForm.days}
                  onChange={e => setDeductForm(f => ({ ...f, days: e.target.value }))}
                  className="w-full px-3 py-2.5 border-[1.5px] border-slate-300 rounded-btn text-sm focus:outline-none focus:border-red-500"
                  placeholder="예: 1"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">사유 유형</label>
                <div className="flex gap-2">
                  {DEDUCTION_REASONS.map(r => (
                    <button
                      key={r}
                      onClick={() => setDeductForm(f => ({ ...f, reasonType: r }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        deductForm.reasonType === r
                          ? 'bg-red-50 text-red-600 border-red-200'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">메모 (필수)</label>
                <input
                  type="text"
                  value={deductForm.memo}
                  onChange={e => setDeductForm(f => ({ ...f, memo: e.target.value }))}
                  className="w-full px-3 py-2.5 border-[1.5px] border-slate-300 rounded-btn text-sm focus:outline-none focus:border-red-500"
                  placeholder="예: 3/1 무단결근 차감"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 pb-5">
              <button onClick={() => setShowDeductModal(false)} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-btn text-sm font-semibold hover:bg-slate-200">취소</button>
              <button
                onClick={handleDeduct}
                disabled={!deductForm.days || !deductForm.memo}
                className="px-5 py-2.5 bg-red-600 text-white rounded-btn text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                차감
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
