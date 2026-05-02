import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import {
  getAnniversaryDate,
  calculateLeaveEntitlement,
  calculateUsedLeaves,
  getLeavePeriodDates,
  splitAdjustments,
  calculateEffectiveEntitlement,
  formatDateISO,
} from '@/lib/leave-calculation';
import { sendTransitionNotification } from '@/lib/email';

export async function GET(req: NextRequest) {
  // Vercel Cron 인증
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabase();
  const today = formatDateISO(new Date());

  // 활성 직원 조회
  const { data: employees } = await supabase
    .from('employees')
    .select('*')
    .eq('is_active', true);

  if (!employees || employees.length === 0) {
    return NextResponse.json({ message: 'No employees found' });
  }

  // 관리자 이메일 목록
  const adminEmails = employees
    .filter(e => e.role === 'admin')
    .map(e => e.email);

  const results = [];

  for (const emp of employees) {
    // 1주년 기념일 계산
    const anniversaryDate = getAnniversaryDate(emp.hire_date, 1);
    const anniv = new Date(anniversaryDate + 'T00:00:00');
    const todayDate = new Date(today + 'T00:00:00');
    const daysUntil = Math.ceil((anniv.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

    // 15일 이내이거나 기념일 후 90일 이내만 처리
    if (daysUntil > 15 || daysUntil < -90) continue;

    // 기존 전환 기록 확인
    const { data: existingTransition } = await supabase
      .from('anniversary_transitions')
      .select('*')
      .eq('employee_id', emp.id)
      .eq('transition_year', 1)
      .maybeSingle();

    if (existingTransition && existingTransition.status !== 'pending') {
      continue; // 이미 결정됨
    }

    // 잔여 월차 계산 (연차 0차 기간)
    const hireDate = emp.hire_date;
    const period = getLeavePeriodDates(hireDate, hireDate); // year 0 period
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
      .eq('leave_year', 0);

    const entitlement = calculateLeaveEntitlement(hireDate, hireDate);
    const maxMonthly = Math.min(11, entitlement);
    const { advanceTotal, generalTotal } = splitAdjustments(empAdjustments || []);
    const effectiveEntitlement = calculateEffectiveEntitlement(maxMonthly, 0, advanceTotal);
    const used = calculateUsedLeaves(empLeaves || [], period.start, period.end);
    const remaining = Math.max(0, effectiveEntitlement + generalTotal - used);

    // 전환 기록 생성 또는 업데이트
    let transitionId: string;
    if (!existingTransition) {
      const { data: newTransition, error } = await supabase
        .from('anniversary_transitions')
        .insert({
          employee_id: emp.id,
          transition_year: 1,
          anniversary_date: anniversaryDate,
          status: 'pending',
          remaining_leaves: remaining,
        })
        .select()
        .single();

      if (error || !newTransition) {
        results.push({ employee: emp.name, error: 'Failed to create transition' });
        continue;
      }
      transitionId = newTransition.id;
    } else {
      transitionId = existingTransition.id;
      await supabase
        .from('anniversary_transitions')
        .update({ remaining_leaves: remaining })
        .eq('id', transitionId);
    }

    // 이메일 발송 (15일/7일/1일 전)
    const notificationType =
      daysUntil === 15 ? 'email_15d' :
      daysUntil === 7 ? 'email_7d' :
      daysUntil === 1 ? 'email_1d' :
      null;

    if (notificationType && adminEmails.length > 0) {
      const { data: existingNotif } = await supabase
        .from('transition_notifications')
        .select('id')
        .eq('transition_id', transitionId)
        .eq('notification_type', notificationType)
        .maybeSingle();

      if (!existingNotif) {
        const emailResult = await sendTransitionNotification({
          adminEmails,
          employeeName: emp.name,
          anniversaryDate,
          daysUntil,
          remainingLeaves: remaining,
        });

        await supabase
          .from('transition_notifications')
          .insert({
            transition_id: transitionId,
            notification_type: notificationType,
            sent_to: adminEmails,
            status: emailResult.success ? 'sent' : 'failed',
            error_message: emailResult.error || null,
          });

        results.push({
          employee: emp.name,
          notification: notificationType,
          sent: emailResult.success,
        });
      }
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
