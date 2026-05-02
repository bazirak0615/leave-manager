import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase';
import {
  calculateLeaveEntitlement,
  calculateUsedLeaves,
  getLeavePeriodDates,
  calculateEffectiveEntitlement,
  splitAdjustments,
} from '@/lib/leave-calculation';

// GET: 관리자 대시보드 데이터
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  }

  const user = session.user as Record<string, unknown>;
  if (user.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });
  }

  const supabase = createServerSupabase();

  // 현재 월의 시작/종료일 (KST 기준)
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // 전체 활성 구성원 (먼저 조회 — 이번 달 연차에 이름 매핑용으로도 사용)
  const { data: employees } = await supabase
    .from('employees')
    .select('*')
    .eq('is_active', true)
    .order('name');

  // 구성원 ID→이름/이메일 매핑
  const empMap = new Map<string, { name: string; email: string }>();
  if (employees) {
    for (const emp of employees) {
      empMap.set(emp.id, { name: emp.name, email: emp.email });
    }
  }

  // 이번 달 연차 사용 목록 (FK 조인 대신 별도 매핑 — created_by FK ambiguity 회피)
  const { data: rawMonthLeaves } = await supabase
    .from('leaves')
    .select('*')
    .gte('date', monthStart)
    .lte('date', monthEnd)
    .order('date', { ascending: true });

  const monthLeaves = (rawMonthLeaves || []).map(l => ({
    ...l,
    employees: empMap.get(l.employee_id) || { name: '-', email: '' },
  }));

  // 각 구성원별 잔여 연차 계산
  const employeeSummaries = [];
  if (employees) {
    for (const emp of employees) {
      const period = getLeavePeriodDates(emp.hire_date);
      const entitlement = calculateLeaveEntitlement(emp.hire_date);

      const { data: empLeaves } = await supabase
        .from('leaves')
        .select('type, date')
        .eq('employee_id', emp.id)
        .gte('date', period.start)
        .lte('date', period.end);

      const { data: empAdjustments } = await supabase
        .from('leave_adjustments')
        .select('adjustment, type')
        .eq('employee_id', emp.id)
        .eq('leave_year', period.leaveYear);

      const { advanceTotal, generalTotal } = splitAdjustments(empAdjustments || []);
      const effectiveEntitlement = calculateEffectiveEntitlement(entitlement, period.leaveYear, advanceTotal);

      const used = calculateUsedLeaves(empLeaves || []);
      const remaining = effectiveEntitlement + generalTotal - used;

      employeeSummaries.push({
        id: emp.id,
        name: emp.name,
        email: emp.email,
        hire_date: emp.hire_date,
        role: emp.role,
        entitlement: effectiveEntitlement + generalTotal,
        used,
        remaining,
      });
    }
  }

  // 이번 달 총 사용 연차 수
  const monthTotalUsed = monthLeaves.reduce((sum, l) => {
    return sum + (l.type === 'full' ? 1 : 0.5);
  }, 0);

  return NextResponse.json({
    monthLeaves,
    monthTotalUsed,
    employeeSummaries,
    currentMonth: `${now.getFullYear()}년 ${now.getMonth() + 1}월`,
  });
}
