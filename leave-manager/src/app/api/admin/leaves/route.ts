import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase';
import { getLeaveYear, getWeekdaysInRange, getTodayISO } from '@/lib/leave-calculation';
import { createCalendarEventsBatch } from '@/lib/google-calendar';
import { sendLeaveNotification } from '@/lib/slack';
import { LeaveType } from '@/lib/types';

// POST: 관리자가 특정 구성원에게 연차 등록 (날짜 범위 지원)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  }

  const user = session.user as Record<string, unknown>;
  if (user.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });
  }

  const body = await req.json();
  const { employeeId, startDate, endDate, type } = body;

  if (!employeeId || !startDate || !type) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다' }, { status: 400 });
  }

  const supabase = createServerSupabase();

  // 직원 정보 조회
  const { data: employee } = await supabase
    .from('employees')
    .select('hire_date, name, email')
    .eq('id', employeeId)
    .single();

  if (!employee) {
    return NextResponse.json({ error: '구성원을 찾을 수 없습니다' }, { status: 404 });
  }

  // 날짜 범위에서 평일 추출
  const effectiveEndDate = endDate || startDate;
  const datesToRegister = getWeekdaysInRange(startDate, effectiveEndDate);

  if (datesToRegister.length === 0) {
    return NextResponse.json({ error: '등록할 평일이 없습니다' }, { status: 400 });
  }

  // 일괄 등록
  const records = datesToRegister.map(date => ({
    employee_id: employeeId,
    date,
    type,
    leave_year: getLeaveYear(employee.hire_date, date),
    created_by: user.employeeId as string,
  }));

  const { data: inserted, error } = await supabase
    .from('leaves')
    .insert(records)
    .select();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 등록된 날짜가 포함되어 있습니다' }, { status: 409 });
    }
    return NextResponse.json({ error: '등록 실패' }, { status: 500 });
  }

  // Google Calendar 일정 생성 - 과거 날짜는 캘린더 연동 제외
  const today = getTodayISO();
  const futureLeaves = (inserted || []).filter(l => l.date >= today);
  if (futureLeaves.length > 0 && employee) {
    const calendarParams = futureLeaves.map(leave => ({
      employeeId,
      employeeName: employee.name,
      date: leave.date,
      type: leave.type as LeaveType,
    }));

    createCalendarEventsBatch(calendarParams).then(async (results) => {
      const updateSupabase = createServerSupabase();
      for (const result of results) {
        if (result.eventId) {
          const matchingLeave = inserted?.find(l => l.date === result.date);
          if (matchingLeave) {
            await updateSupabase
              .from('leaves')
              .update({ calendar_event_id: result.eventId })
              .eq('id', matchingLeave.id);
          }
        }
      }
    }).catch((err) => {
      console.error('[Calendar Sync] 관리자 대리 등록 실패:', err);
    });
  }

  // 슬랙 채널 알림 (fire-and-forget)
  sendLeaveNotification({
    action: 'create',
    employeeName: employee.name,
    employeeEmail: employee.email,
    dates: datesToRegister,
    type,
  }).catch(err => console.error('[Slack] 알림 실패:', err));

  return NextResponse.json({
    success: true,
    count: inserted?.length || 0,
    message: `${inserted?.length || 0}일 등록 완료`,
  });
}
