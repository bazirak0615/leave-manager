import { NextResponse } from 'next/server';
import { verifySlackRequest, sendLeaveNotification } from '@/lib/slack';
import { createServerSupabase } from '@/lib/supabase';
import {
  getWeekdaysInRange,
  getLeaveYear,
  getTodayISO,
  getLeavePeriodDates,
  calculateLeaveEntitlement,
  calculateUsedLeaves,
  calculateEffectiveEntitlement,
  splitAdjustments,
} from '@/lib/leave-calculation';
import { createCalendarEventsBatch } from '@/lib/google-calendar';
import { LeaveType } from '@/lib/types';

export async function POST(req: Request) {
  // 서명 검증
  const { verified, body } = await verifySlackRequest(req);
  if (!verified) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // payload 파싱 (URL-encoded → JSON)
  const params = new URLSearchParams(body);
  const payloadStr = params.get('payload');
  if (!payloadStr) {
    return NextResponse.json({ error: 'No payload' }, { status: 400 });
  }

  const payload = JSON.parse(payloadStr);

  // view_submission만 처리
  if (payload.type !== 'view_submission') {
    return new NextResponse('', { status: 200 });
  }

  const { callback_id, private_metadata } = payload.view;
  if (callback_id !== 'leave_registration') {
    return new NextResponse('', { status: 200 });
  }

  // 메타데이터 & 입력값 추출
  const { employeeId, employeeName } = JSON.parse(private_metadata);
  const slackUserId = payload.user?.id as string | undefined;
  const values = payload.view.state.values;

  const startDate = values.start_date_block.start_date.selected_date;
  const endDate = values.end_date_block.end_date.selected_date || startDate;
  const type = values.leave_type_block.leave_type.selected_option.value as LeaveType;

  if (!startDate) {
    return NextResponse.json({
      response_action: 'errors',
      errors: { start_date_block: '시작일을 선택해 주세요.' },
    });
  }

  // 평일 추출
  const datesToRegister = getWeekdaysInRange(startDate, endDate);
  if (datesToRegister.length === 0) {
    return NextResponse.json({
      response_action: 'errors',
      errors: { start_date_block: '등록할 평일이 없습니다.' },
    });
  }

  const supabase = createServerSupabase();

  // 직원 정보 조회
  const { data: employee } = await supabase
    .from('employees')
    .select('hire_date')
    .eq('id', employeeId)
    .single();

  if (!employee) {
    return NextResponse.json({
      response_action: 'errors',
      errors: { start_date_block: '직원 정보를 찾을 수 없습니다.' },
    });
  }

  // 잔여 연차 확인
  const today = getTodayISO();
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
      response_action: 'errors',
      errors: {
        start_date_block: `잔여 연차가 부족합니다 (필요: ${totalCost}개, 잔여: ${remaining}개)`,
      },
    });
  }

  // 연차 등록
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
    const errMsg = error.code === '23505'
      ? '이미 등록된 날짜가 포함되어 있습니다.'
      : '연차 등록에 실패했습니다.';
    return NextResponse.json({
      response_action: 'errors',
      errors: { start_date_block: errMsg },
    });
  }

  // Google Calendar 동기화 (미래 날짜만, fire-and-forget)
  const futureLeaves = (inserted || []).filter(l => l.date >= today);
  if (futureLeaves.length > 0) {
    const calendarParams = futureLeaves.map(leave => ({
      employeeId,
      employeeName,
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
    }).catch(err => {
      console.error('[Calendar Sync] Slack 연차 등록 캘린더 동기화 실패:', err);
    });
  }

  // 슬랙 채널 알림
  const remainingAfter = remaining - totalCost;
  sendLeaveNotification({
    action: 'create',
    employeeName,
    slackUserId,
    dates: datesToRegister,
    type,
    remaining: remainingAfter,
  }).catch(err => {
    console.error('[Slack] 알림 발송 실패:', err);
  });

  // 모달 닫기 (빈 응답 = 성공)
  return new NextResponse('', { status: 200 });
}
