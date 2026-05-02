import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase';
import {
  getWeekdaysInRange,
  getLeaveYear,
  calculateLeaveEntitlement,
  calculateUsedLeaves,
  getLeavePeriodDates,
  getTodayISO,
  calculateEffectiveEntitlement,
  splitAdjustments,
} from '@/lib/leave-calculation';
import { createCalendarEventsBatch } from '@/lib/google-calendar';
import { sendLeaveNotification } from '@/lib/slack';
import { LeaveType } from '@/lib/types';

// GET: 내 연차 조회
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  }

  const user = session.user as Record<string, unknown>;
  const employeeId = user.employeeId as string;

  const supabase = createServerSupabase();

  // 직원 정보 조회
  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('id', employeeId)
    .single();

  if (!employee) {
    return NextResponse.json({ error: '직원 정보를 찾을 수 없습니다' }, { status: 404 });
  }

  // 연차 사용 내역 조회
  const { data: leaves } = await supabase
    .from('leaves')
    .select('*')
    .eq('employee_id', employeeId)
    .order('date', { ascending: false });

  // 연차 보정 내역 조회
  const { data: adjustments } = await supabase
    .from('leave_adjustments')
    .select('*')
    .eq('employee_id', employeeId);

  return NextResponse.json({
    employee,
    leaves: leaves || [],
    adjustments: adjustments || [],
  });
}

// POST: 연차 등록
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  }

  const user = session.user as Record<string, unknown>;
  const employeeId = user.employeeId as string;

  const body = await req.json();
  const { startDate, endDate, type } = body;

  if (!startDate || !type) {
    return NextResponse.json({ error: '시작일과 유형은 필수입니다' }, { status: 400 });
  }

  // 유효한 유형인지 확인
  if (!['full', 'am-half', 'pm-half'].includes(type)) {
    return NextResponse.json({ error: '유효하지 않은 연차 유형입니다' }, { status: 400 });
  }

  const supabase = createServerSupabase();

  // 직원 정보 조회 (입사일 필요)
  const { data: employee } = await supabase
    .from('employees')
    .select('hire_date')
    .eq('id', employeeId)
    .single();

  if (!employee) {
    return NextResponse.json({ error: '직원 정보를 찾을 수 없습니다' }, { status: 404 });
  }

  // 날짜 범위에서 평일 추출
  const effectiveEndDate = endDate || startDate;
  const datesToRegister = getWeekdaysInRange(startDate, effectiveEndDate);

  if (datesToRegister.length === 0) {
    return NextResponse.json({ error: '등록할 평일이 없습니다' }, { status: 400 });
  }

  // 각 날짜의 leave_year 계산 및 잔여 연차 확인
  const today = getTodayISO();
  const isAdmin = user.role === 'admin';

  // 일반 사용자는 미래 일정만 등록 가능
  if (!isAdmin) {
    const hasPastDate = datesToRegister.some(d => d <= today);
    if (hasPastDate) {
      return NextResponse.json({ error: '오늘 이전 날짜에는 연차를 등록할 수 없습니다' }, { status: 400 });
    }
  }

  // 현재 기간의 잔여 연차 확인
  const period = getLeavePeriodDates(employee.hire_date, today);
  const entitlement = calculateLeaveEntitlement(employee.hire_date, today);

  const { data: existingLeaves } = await supabase
    .from('leaves')
    .select('type, date')
    .eq('employee_id', employeeId)
    .gte('date', period.start)
    .lte('date', period.end);

  const { data: existingAdjustments } = await supabase
    .from('leave_adjustments')
    .select('adjustment, type')
    .eq('employee_id', employeeId)
    .eq('leave_year', period.leaveYear);

  const { advanceTotal, generalTotal } = splitAdjustments(existingAdjustments || []);
  const effectiveEntitlement = calculateEffectiveEntitlement(entitlement, period.leaveYear, advanceTotal);

  const currentUsed = calculateUsedLeaves(existingLeaves || [], period.start, period.end);
  const remaining = effectiveEntitlement + generalTotal - currentUsed;
  const cost = type === 'full' ? 1 : 0.5;
  const totalCost = cost * datesToRegister.length;

  if (totalCost > remaining) {
    return NextResponse.json({
      error: `잔여 연차가 부족합니다 (필요: ${totalCost}개, 잔여: ${remaining}개)`,
    }, { status: 400 });
  }

  // 연차 일괄 등록
  const records = datesToRegister.map(date => ({
    employee_id: employeeId,
    date,
    type,
    leave_year: getLeaveYear(employee.hire_date, date),
    created_by: employeeId,
  }));

  const { data: inserted, error } = await supabase
    .from('leaves')
    .insert(records)
    .select();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 등록된 날짜가 포함되어 있습니다' }, { status: 409 });
    }
    return NextResponse.json({ error: '연차 등록에 실패했습니다' }, { status: 500 });
  }

  // Google Calendar 일정 생성 - 과거 날짜는 캘린더 연동 제외 (fire-and-forget)
  const futureLeaves = (inserted || []).filter((l) => l.date >= today);
  if (futureLeaves.length > 0) {
    const employeeName = user.employeeName as string;
    const calendarParams = futureLeaves.map((leave) => ({
      employeeId,
      employeeName,
      date: leave.date,
      type: leave.type as LeaveType,
    }));

    createCalendarEventsBatch(calendarParams).then(async (results) => {
      const updateSupabase = createServerSupabase();
      for (const result of results) {
        if (result.eventId) {
          const matchingLeave = inserted.find((l) => l.date === result.date);
          if (matchingLeave) {
            await updateSupabase
              .from('leaves')
              .update({ calendar_event_id: result.eventId })
              .eq('id', matchingLeave.id);
          }
        }
      }
    }).catch((err) => {
      console.error('[Calendar Sync] 일괄 생성 실패:', err);
    });
  }

  // 슬랙 채널 알림 (fire-and-forget)
  const employeeName2 = user.employeeName as string;
  const employeeEmail = user.email as string;
  const remainingAfter = remaining - totalCost;
  sendLeaveNotification({
    action: 'create',
    employeeName: employeeName2,
    employeeEmail,
    dates: datesToRegister,
    type,
    remaining: remainingAfter,
  }).catch(err => console.error('[Slack] 알림 실패:', err));

  return NextResponse.json({
    success: true,
    count: inserted?.length || 0,
    message: `${inserted?.length || 0}일 등록 완료`,
  });
}
