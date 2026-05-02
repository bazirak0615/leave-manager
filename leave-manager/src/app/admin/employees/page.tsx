'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Header from '@/components/layout/Header';
import Toast from '@/components/common/Toast';
import { Employee } from '@/lib/types';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // 추가 모달
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', name: '', hire_date: '', role: 'user' });
  const [saving, setSaving] = useState(false);

  // 수정 모달
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', hire_date: '' });

  // CSV 업로드
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/employees');
      if (!res.ok) throw new Error('조회 실패');
      const data = await res.json();
      setEmployees(data.employees);
    } catch {
      setToast({ message: '구성원 목록을 불러오는데 실패했습니다', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // 구성원 추가
  const handleAdd = async () => {
    if (!addForm.email || !addForm.name || !addForm.hire_date) {
      setToast({ message: '이메일, 이름, 입사일은 필수입니다', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      setToast({ message: '구성원이 등록되었습니다', type: 'success' });
      setShowAddModal(false);
      setAddForm({ email: '', name: '', hire_date: '', role: 'user' });
      fetchEmployees();
    } catch (err) {
      setToast({ message: (err as Error).message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // 구성원 수정
  const handleEdit = async () => {
    if (!editEmployee) return;
    try {
      const res = await fetch(`/api/employees/${editEmployee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error('수정 실패');
      setToast({ message: '수정되었습니다', type: 'success' });
      setEditEmployee(null);
      fetchEmployees();
    } catch (err) {
      setToast({ message: (err as Error).message, type: 'error' });
    }
  };

  // 비활성화 토글
  const handleToggleActive = async (emp: Employee) => {
    const action = emp.is_active ? '비활성화' : '활성화';
    if (!confirm(`${emp.name}님을 ${action}하시겠습니까?`)) return;

    try {
      const res = await fetch(`/api/employees/${emp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !emp.is_active }),
      });
      if (!res.ok) throw new Error('변경 실패');
      setToast({ message: `${action}되었습니다`, type: 'success' });
      fetchEmployees();
    } catch (err) {
      setToast({ message: (err as Error).message, type: 'error' });
    }
  };

  // CSV 업로드 처리
  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.trim().split('\n');
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());

    const emailIdx = header.findIndex(h => h.includes('email') || h.includes('이메일'));
    const nameIdx = header.findIndex(h => h.includes('name') || h.includes('이름'));
    const dateIdx = header.findIndex(h => h.includes('date') || h.includes('입사'));

    if (emailIdx === -1 || nameIdx === -1 || dateIdx === -1) {
      setToast({ message: 'CSV 헤더에 이메일, 이름, 입사일 컬럼이 필요합니다', type: 'error' });
      return;
    }

    const records = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols[emailIdx] && cols[nameIdx] && cols[dateIdx]) {
        records.push({
          email: cols[emailIdx],
          name: cols[nameIdx],
          hire_date: cols[dateIdx],
        });
      }
    }

    if (records.length === 0) {
      setToast({ message: '유효한 데이터가 없습니다', type: 'error' });
      return;
    }

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(records),
      });
      if (!res.ok) throw new Error('업로드 실패');
      const result = await res.json();
      setToast({ message: result.message, type: 'success' });
      fetchEmployees();
    } catch (err) {
      setToast({ message: (err as Error).message, type: 'error' });
    }

    // 파일 입력 리셋
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">구성원 관리</h1>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleCSVUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-btn text-sm font-semibold hover:bg-slate-200 transition-colors"
            >
              CSV 업로드
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-primary text-white rounded-btn text-sm font-semibold hover:bg-primary-dark transition-colors"
            >
              + 구성원 추가
            </button>
          </div>
        </div>

        {/* CSV 안내 */}
        <div className="bg-slate-50 border border-slate-200 rounded-btn p-3 mb-4 text-xs text-slate-500">
          CSV 형식: <code className="bg-white px-1 py-0.5 rounded">이메일,이름,입사일</code> (예: kim@company.com,김철수,2024-01-15)
        </div>

        {/* 구성원 테이블 */}
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">이름</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">이메일</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">입사일</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">역할</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">상태</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">관리</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id} className={`border-b border-slate-50 hover:bg-slate-50 ${!emp.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">{emp.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{emp.email}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{emp.hire_date}</td>
                  <td className="px-4 py-3">
                    {emp.role === 'admin' ? (
                      <span className="text-xs font-semibold px-2 py-0.5 bg-primary-light text-primary rounded-full">관리자</span>
                    ) : (
                      <span className="text-xs text-slate-400">일반</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {emp.is_active ? (
                      <span className="text-xs font-semibold px-2 py-0.5 bg-accent-light text-accent rounded-full">활성</span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-400 rounded-full">비활성</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => {
                          setEditEmployee(emp);
                          setEditForm({ name: emp.name, email: emp.email, hire_date: emp.hire_date });
                        }}
                        className="text-xs text-primary hover:underline font-medium"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleToggleActive(emp)}
                        className="text-xs text-slate-400 hover:text-danger font-medium"
                      >
                        {emp.is_active ? '비활성화' : '활성화'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 구성원 추가 모달 */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/40 z-[1000] flex items-center justify-center p-4 animate-fadeIn"
          onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}
        >
          <div className="bg-white rounded-card w-full max-w-[420px] shadow-modal animate-slideUp">
            <div className="flex justify-between items-center px-6 pt-5">
              <h3 className="text-lg font-bold">구성원 추가</h3>
              <button onClick={() => setShowAddModal(false)} className="text-2xl text-slate-400 hover:text-slate-600 leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">이름</label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border-[1.5px] border-slate-300 rounded-btn text-sm focus:outline-none focus:border-primary"
                  placeholder="홍길동"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">이메일 (Google 계정)</label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2.5 border-[1.5px] border-slate-300 rounded-btn text-sm focus:outline-none focus:border-primary"
                  placeholder="hong@company.com"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">입사일</label>
                <input
                  type="date"
                  value={addForm.hire_date}
                  onChange={e => setAddForm(f => ({ ...f, hire_date: e.target.value }))}
                  className="w-full px-3 py-2.5 border-[1.5px] border-slate-300 rounded-btn text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 pb-5">
              <button onClick={() => setShowAddModal(false)} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-btn text-sm font-semibold hover:bg-slate-200">취소</button>
              <button onClick={handleAdd} disabled={saving} className="px-5 py-2.5 bg-primary text-white rounded-btn text-sm font-semibold hover:bg-primary-dark disabled:opacity-50">
                {saving ? '등록 중...' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 구성원 수정 모달 */}
      {editEmployee && (
        <div
          className="fixed inset-0 bg-black/40 z-[1000] flex items-center justify-center p-4 animate-fadeIn"
          onClick={(e) => e.target === e.currentTarget && setEditEmployee(null)}
        >
          <div className="bg-white rounded-card w-full max-w-[420px] shadow-modal animate-slideUp">
            <div className="flex justify-between items-center px-6 pt-5">
              <h3 className="text-lg font-bold">구성원 수정</h3>
              <button onClick={() => setEditEmployee(null)} className="text-2xl text-slate-400 hover:text-slate-600 leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">이름</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border-[1.5px] border-slate-300 rounded-btn text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">이메일</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2.5 border-[1.5px] border-slate-300 rounded-btn text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">입사일</label>
                <input
                  type="date"
                  value={editForm.hire_date}
                  onChange={e => setEditForm(f => ({ ...f, hire_date: e.target.value }))}
                  className="w-full px-3 py-2.5 border-[1.5px] border-slate-300 rounded-btn text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 pb-5">
              <button onClick={() => setEditEmployee(null)} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-btn text-sm font-semibold hover:bg-slate-200">취소</button>
              <button onClick={handleEdit} className="px-5 py-2.5 bg-primary text-white rounded-btn text-sm font-semibold hover:bg-primary-dark">저장</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </>
  );
}
