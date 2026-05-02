'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { TransitionWithEmployee } from '@/lib/types';

export default function TransitionAlertModal() {
  const { data: session } = useSession();
  const [transitions, setTransitions] = useState<TransitionWithEmployee[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [processing, setProcessing] = useState(false);

  const user = session?.user as Record<string, unknown> | undefined;
  const isAdmin = user?.role === 'admin';

  const fetchTransitions = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch('/api/admin/transitions');
      if (!res.ok) return;
      const data = await res.json();
      setTransitions(data.transitions || []);
    } catch {
      // 백그라운드 체크 - 실패 시 무시
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchTransitions();
  }, [fetchTransitions]);

  if (!isAdmin || transitions.length === 0 || dismissed) return null;

  const current = transitions[currentIndex];
  if (!current) return null;

  const remaining = Number(current.remaining_leaves) || 0;
  const fmt = (v: number) => (v % 1 === 0 ? v.toString() : v.toFixed(1));

  const handleDecision = async (decision: 'carry_over' | 'reset') => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/transitions/${current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        const newList = transitions.filter(t => t.id !== current.id);
        setTransitions(newList);
        if (currentIndex >= newList.length) {
          setCurrentIndex(Math.max(0, newList.length - 1));
        }
      }
    } catch {
      // 에러 처리
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[1100] flex items-center justify-center p-4 animate-fadeIn"
      onClick={(e) => e.target === e.currentTarget && setDismissed(true)}
    >
      <div className="bg-white rounded-card w-full max-w-[440px] shadow-modal animate-slideUp">
        {/* 헤더 */}
        <div className="flex justify-between items-center px-6 pt-5">
          <h3 className="text-lg font-bold text-slate-900">연차 전환 알림</h3>
          <button
            onClick={() => setDismissed(true)}
            className="text-2xl text-slate-400 hover:text-slate-600 leading-none"
          >
            &times;
          </button>
        </div>

        {/* 건수 */}
        {transitions.length > 1 && (
          <div className="px-6 pt-2">
            <span className="text-xs text-slate-500">
              {currentIndex + 1} / {transitions.length}건 처리 대기 중
            </span>
          </div>
        )}

        {/* 본문 */}
        <div className="px-6 py-5 text-center">
          <div className="text-4xl mb-3">📅</div>
          <div className="text-lg font-bold text-slate-900 mb-2">
            {current.employees?.name}님 입사 1주년 전환
          </div>
          <div className="text-sm text-slate-500 mb-4">
            기념일: <strong>{current.anniversary_date}</strong>
          </div>

          <div className="bg-slate-50 rounded-btn p-4 mb-4">
            <div className="text-sm text-slate-600 mb-1">현재 잔여 월차</div>
            <div className="text-3xl font-extrabold text-primary">
              {fmt(remaining)}
              <span className="text-sm text-slate-500 font-medium ml-1">개</span>
            </div>
          </div>

          <div className="text-sm text-slate-600 mb-4">
            새로운 연차 <strong>15개</strong>가 부여됩니다.<br />
            잔여 월차를 어떻게 처리하시겠습니까?
          </div>

          {/* 선택지 미리보기 */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-blue-50 border border-blue-200 rounded-btn p-3 text-sm">
              <div className="font-semibold text-blue-700">누적 유지</div>
              <div className="text-blue-600 text-xs mt-1">
                {fmt(remaining)} + 15 = <strong>{fmt(remaining + 15)}개</strong>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-btn p-3 text-sm">
              <div className="font-semibold text-slate-700">소멸</div>
              <div className="text-slate-500 text-xs mt-1">
                15개만 부여
              </div>
            </div>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex flex-col gap-2 px-6 pb-5">
          <div className="flex gap-2">
            <button
              onClick={() => handleDecision('carry_over')}
              disabled={processing}
              className="flex-1 py-2.5 bg-primary text-white rounded-btn text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 transition-colors"
            >
              {processing ? '처리 중...' : '누적 유지'}
            </button>
            <button
              onClick={() => handleDecision('reset')}
              disabled={processing}
              className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-btn text-sm font-semibold hover:bg-slate-200 disabled:opacity-50 transition-colors"
            >
              소멸
            </button>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="w-full py-2 text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            나중에 결정
          </button>
        </div>
      </div>
    </div>
  );
}
