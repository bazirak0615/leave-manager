'use client';

import { LeaveSummary } from '@/lib/types';

interface SummaryCardsProps {
  summary: LeaveSummary;
}

export default function SummaryCards({ summary }: SummaryCardsProps) {
  const formatValue = (v: number) => (v % 1 === 0 ? v.toString() : v.toFixed(1));

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      {/* 총 발생 */}
      <div className="bg-white rounded-card p-4 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all text-center">
        <div className="text-2xl mb-2">📋</div>
        <div className="text-xs text-slate-500 font-medium mb-1">총 발생</div>
        <div className="flex items-baseline justify-center gap-0.5">
          <span className="text-3xl font-extrabold text-slate-900">{formatValue(summary.totalEntitlement)}</span>
          <span className="text-sm text-slate-500">개</span>
        </div>
      </div>

      {/* 사용 */}
      <div className="bg-white rounded-card p-4 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all text-center">
        <div className="text-2xl mb-2">✏️</div>
        <div className="text-xs text-slate-500 font-medium mb-1">사용</div>
        <div className="flex items-baseline justify-center gap-0.5">
          <span className="text-3xl font-extrabold text-slate-900">{formatValue(summary.totalUsed)}</span>
          <span className="text-sm text-slate-500">개</span>
        </div>
      </div>

      {/* 잔여 */}
      <div className="bg-accent-light border-2 border-accent rounded-card p-4 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all text-center">
        <div className="text-2xl mb-2">✅</div>
        <div className="text-xs text-slate-500 font-medium mb-1">잔여</div>
        <div className="flex items-baseline justify-center gap-0.5">
          <span className="text-3xl font-extrabold text-accent">{formatValue(summary.remaining)}</span>
          <span className="text-sm text-slate-500">개</span>
        </div>
      </div>

      {/* 다음 발생 */}
      <div className="bg-white rounded-card p-4 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all text-center">
        <div className="text-2xl mb-2">📅</div>
        <div className="text-xs text-slate-500 font-medium mb-1">다음 발생</div>
        <div className="flex items-baseline justify-center">
          <span className="text-lg font-extrabold text-slate-900">
            {summary.nextGenerationDate || '-'}
          </span>
        </div>
        {summary.nextGenerationDescription && (
          <div className="text-xs text-slate-400 mt-0.5">{summary.nextGenerationDescription}</div>
        )}
      </div>
    </div>
  );
}
