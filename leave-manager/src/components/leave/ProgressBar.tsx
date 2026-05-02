'use client';

interface ProgressBarProps {
  used: number;
  total: number;
}

export default function ProgressBar({ used, total }: ProgressBarProps) {
  const percent = total > 0 ? Math.round((used / total) * 100) : 0;

  return (
    <div className="bg-white rounded-card p-4 shadow-card mb-6">
      <div className="flex justify-between text-sm text-slate-600 font-medium mb-2">
        <span>연차 사용률</span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${Math.min(percent, 100)}%`,
            background: 'linear-gradient(90deg, #2563EB, #059669)',
          }}
        />
      </div>
    </div>
  );
}
