import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase';

// PUT: 전환 결정 (carry_over / reset)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  }

  const user = session.user as Record<string, unknown>;
  if (user.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });
  }

  const { id } = params as unknown as { id: string };
  const body = await req.json();
  const { decision } = body;

  if (!['carry_over', 'reset'].includes(decision)) {
    return NextResponse.json({ error: '유효하지 않은 결정입니다' }, { status: 400 });
  }

  const supabase = createServerSupabase();

  // 전환 기록 조회
  const { data: transition } = await supabase
    .from('anniversary_transitions')
    .select('*')
    .eq('id', id)
    .eq('status', 'pending')
    .single();

  if (!transition) {
    return NextResponse.json({ error: '전환 기록을 찾을 수 없습니다' }, { status: 404 });
  }

  const adminId = user.employeeId as string;
  let adjustmentId: string | null = null;

  // 누적 유지: carry_over 조정 생성
  if (decision === 'carry_over' && (transition.remaining_leaves || 0) > 0) {
    const { data: adjustment, error: adjError } = await supabase
      .from('leave_adjustments')
      .insert({
        employee_id: transition.employee_id,
        leave_year: transition.transition_year,
        adjustment: transition.remaining_leaves,
        reason: `입사 ${transition.transition_year}주년 월차→연차 전환 이월 (잔여 ${transition.remaining_leaves}개)`,
        type: 'carry_over',
        created_by: adminId,
      })
      .select()
      .single();

    if (adjError) {
      return NextResponse.json({ error: '이월 조정 생성 실패' }, { status: 500 });
    }
    adjustmentId = adjustment.id;
  }

  // 전환 상태 업데이트
  const { error: updateError } = await supabase
    .from('anniversary_transitions')
    .update({
      status: decision,
      carry_over_amount: decision === 'carry_over' ? (transition.remaining_leaves || 0) : 0,
      decided_by: adminId,
      decided_at: new Date().toISOString(),
      adjustment_id: adjustmentId,
    })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: '전환 상태 업데이트 실패' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    decision,
    carryOverAmount: decision === 'carry_over' ? (transition.remaining_leaves || 0) : 0,
  });
}
