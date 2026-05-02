'use client';

import { useState } from 'react';
import { Leave, LEAVE_TYPES } from '@/lib/types';
import { formatDateKR, getDayName, getTodayISO } from '@/lib/leave-calculation';

interface LeaveHistoryProps {
  leaves: Leave[];
  isAdmin?: boolean;
  onEdit?: (leave: Leave) => void;
  onDelete?: (leaveId: string) => void;
}

export default function LeaveHistory({ leaves, isAdmin, onEdit, onDelete }: LeaveHistoryProps) {
  const [openYears, setOpenYears] = useState<Set<number>>(() => new Set([new Date().getFullYear()]));

  if (leaves.length === 0) {
    return (
      <div className="text-center py-10 px-4 text-slate-400 text-sm bg-white rounded-card">
        등록된 연차가 없습니다.
      </div>
    );
  }

  // 연도별 그룹핑
  const sorted = [...leaves].sort((a, b) => b.date.localeCompare(a.date));
  const grouped: Record<number, Leave[]> = {};
  for (const leave of sorted) {
    const year = parseInt(leave.date.substring(0, 4));
    if (!grouped[year]) grouped[year] = [];
    grouped[year].push(leave);
  }

  const years = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => b - a);

  const toggleYear = (year: number) => {
    setOpenYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  const today = getTodayISO();

  return (
    <div className="flex flex-col gap-3">
      {years.map(year => {
        const items = grouped[year];
        const yearUsed = items.reduce((sum, r) => sum + LEAVE_TYPES[r.type].cost, 0);
        const yearUsedText = yearUsed % 1 === 0 ? yearUsed.toString() : yearUsed.toFixed(1);
        const isOpen = openYears.has(year);

        return (
          <div key={year} className="rounded-card overflow-hidden">
            {/* 연도 헤더 */}
            <button
              onClick={() => toggleYear(year)}
              className="w-full flex justify-between items-center p-3 px-4 bg-white rounded-btn shadow-card cursor-pointer select-none hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs text-slate-400 inline-block transition-transform duration-200 ${
                    isOpen ? 'rotate-90' : ''
                  }`}
                >
                  &#9654;
                </span>
                <span className="text-[15px] font-bold text-slate-800">{year}년</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 font-medium">{items.length}건</span>
                <span className="text-sm font-bold text-primary">-{yearUsedText}일</span>
              </div>
            </button>

            {/* 연차 목록 */}
            {isOpen && (
              <div className="flex flex-col gap-1.5 pt-2">
                {items.map(leave => {
                  const info = LEAVE_TYPES[leave.type];
                  const costText = info.cost === 1 ? '1일' : '0.5일';
                  const isFuture = leave.date > today;
                  const canModify = isAdmin || isFuture;

                  const typeColorClass = {
                    'type-full': 'bg-primary-light text-primary',
                    'type-am-half': 'bg-warning-light text-amber-700',
                    'type-pm-half': 'bg-purple-light text-purple',
                  }[info.cssClass];

                  return (
                    <div
                      key={leave.id}
                      className="flex items-center gap-3 bg-white rounded-btn p-3 px-4 shadow-sm hover:bg-slate-50 hover:shadow-card transition-all"
                    >
                      <span className="text-sm font-semibold text-slate-700 min-w-[80px]">
                        {formatDateKR(leave.date)}
                      </span>
                      <span className="text-xs text-slate-400 min-w-[24px]">
                        {getDayName(leave.date)}
                      </span>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${typeColorClass}`}>
                        {info.label}
                      </span>
                      <span className="text-xs text-slate-500 ml-auto">-{costText}</span>

                      {canModify && (onEdit || onDelete) && (
                        <div className="flex gap-1 ml-2">
                          {onEdit && (
                            <button
                              onClick={() => onEdit(leave)}
                              className="text-xs text-slate-400 hover:text-primary px-1"
                            >
                              수정
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={() => onDelete(leave.id)}
                              className="text-xs text-slate-400 hover:text-danger px-1"
                            >
                              삭제
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
