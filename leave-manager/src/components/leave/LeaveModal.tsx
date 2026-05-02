'use client';

import { useState, useEffect } from 'react';
import { Leave, LeaveType, LEAVE_TYPES } from '@/lib/types';
import { getWeekdaysInRange, formatDateISO } from '@/lib/leave-calculation';

interface LeaveModalProps {
  isOpen: boolean;
  editingLeave?: Leave | null;
  onClose: () => void;
  onSave: (data: { startDate: string; endDate?: string; type: LeaveType }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export default function LeaveModal({ isOpen, editingLeave, onClose, onSave, onDelete }: LeaveModalProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedType, setSelectedType] = useState<LeaveType>('full');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingLeave) {
        setStartDate(editingLeave.date);
        setEndDate('');
        setSelectedType(editingLeave.type);
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setStartDate(formatDateISO(tomorrow));
        setEndDate('');
        setSelectedType('full');
      }
    }
  }, [isOpen, editingLeave]);

  if (!isOpen) return null;

  const isEditing = !!editingLeave;

  // 날짜 범위 도움말
  const dateRangeHelp = (() => {
    if (isEditing || !startDate || !endDate || endDate <= startDate) return null;
    const weekdays = getWeekdaysInRange(startDate, endDate);
    return `평일 ${weekdays.length}일이 등록됩니다 (주말 자동 제외)`;
  })();

  const handleSave = async () => {
    if (!startDate) return;
    setSaving(true);
    try {
      await onSave({
        startDate,
        endDate: isEditing ? undefined : (endDate || undefined),
        type: selectedType,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingLeave || !onDelete) return;
    if (!confirm('이 연차 기록을 삭제하시겠습니까?')) return;
    setDeleting(true);
    try {
      await onDelete(editingLeave.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[1000] flex items-center justify-center p-4 animate-fadeIn"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-card w-full max-w-[420px] shadow-modal animate-slideUp">
        {/* 헤더 */}
        <div className="flex justify-between items-center px-6 pt-5">
          <h3 className="text-lg font-bold">{isEditing ? '연차 수정' : '연차 등록'}</h3>
          <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-600 leading-none">
            &times;
          </button>
        </div>

        {/* 본문 */}
        <div className="px-6 py-5">
          {/* 날짜 입력 */}
          <div className="mb-4">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {isEditing ? '날짜' : '시작일'}
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2.5 border-[1.5px] border-slate-300 rounded-btn text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
              </div>

              {!isEditing && (
                <>
                  <span className="text-slate-400 font-semibold pb-2.5">~</span>
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      종료일
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      placeholder="미입력 시 당일"
                      className="w-full px-3 py-2.5 border-[1.5px] border-slate-300 rounded-btn text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>
                </>
              )}
            </div>

            {dateRangeHelp && (
              <p className="mt-1.5 text-xs text-primary font-medium">{dateRangeHelp}</p>
            )}
          </div>

          {/* 유형 선택 */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">유형</label>
            <div className="flex gap-2">
              {(Object.entries(LEAVE_TYPES) as [LeaveType, typeof LEAVE_TYPES[LeaveType]][]).map(
                ([key, info]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedType(key)}
                    className={`flex-1 py-2.5 px-2 border-[1.5px] rounded-btn text-center transition-all ${
                      selectedType === key
                        ? 'border-primary bg-primary-light text-primary'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-primary hover:text-primary'
                    }`}
                  >
                    <div className="text-xs font-semibold">{info.label}</div>
                    <div className={`text-[11px] mt-0.5 ${
                      selectedType === key ? 'text-primary/70' : 'text-slate-400'
                    }`}>
                      {info.cost === 1 ? '1일' : '0.5일'}
                    </div>
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex justify-end gap-2 px-6 pb-5">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-btn text-sm font-semibold hover:bg-slate-200 transition-colors"
          >
            취소
          </button>

          {isEditing && onDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-5 py-2.5 bg-danger-light text-danger rounded-btn text-sm font-semibold hover:bg-danger hover:text-white transition-colors disabled:opacity-50"
            >
              {deleting ? '삭제 중...' : '삭제'}
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !startDate}
            className="px-5 py-2.5 bg-primary text-white rounded-btn text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {saving ? '저장 중...' : isEditing ? '수정' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
