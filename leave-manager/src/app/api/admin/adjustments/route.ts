import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase';

// POST: 연차 수동 보정 (이월, 추가 부여 등)
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
  const { employeeId, leaveYear, adjustment, reason, type } = body;

  if (!employeeId || leaveYear === undefined || !adjustment) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다' }, { status: 400 });
  }

  const validTypes = ['general', 'advance', 'deduction'];
  const adjustmentType = validTypes.includes(type) ? type : 'general';

  const supabase = createServerSupabase();

  const { error } = await supabase
    .from('leave_adjustments')
    .insert({
      employee_id: employeeId,
      leave_year: leaveYear,
      adjustment: Number(adjustment),
      reason: reason || null,
      type: adjustmentType,
      created_by: user.employeeId as string,
    });

  if (error) {
    return NextResponse.json({ error: '보정 등록 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
