import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase';

// PUT: 권한 변경 (관리자 승격/해제/이관)
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  }

  const user = session.user as Record<string, unknown>;
  if (user.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });
  }

  const body = await req.json();
  const { action, targetEmployeeId } = body;

  if (!action || !targetEmployeeId) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다' }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const myId = user.employeeId as string;

  switch (action) {
    case 'promote': {
      // 관리자로 승격
      const { error } = await supabase
        .from('employees')
        .update({ role: 'admin' })
        .eq('id', targetEmployeeId);

      if (error) return NextResponse.json({ error: '승격 실패' }, { status: 500 });
      return NextResponse.json({ success: true, message: '관리자로 승격되었습니다' });
    }

    case 'demote': {
      // 관리자에서 해제
      if (targetEmployeeId === myId) {
        return NextResponse.json({ error: '본인의 관리자 권한은 이관을 통해서만 변경 가능합니다' }, { status: 400 });
      }

      const { error } = await supabase
        .from('employees')
        .update({ role: 'user' })
        .eq('id', targetEmployeeId);

      if (error) return NextResponse.json({ error: '해제 실패' }, { status: 500 });
      return NextResponse.json({ success: true, message: '관리자 권한이 해제되었습니다' });
    }

    case 'transfer': {
      // 권한 이관: 대상을 관리자로 승격 + 본인을 일반으로 변경
      const { error: promoteError } = await supabase
        .from('employees')
        .update({ role: 'admin' })
        .eq('id', targetEmployeeId);

      if (promoteError) return NextResponse.json({ error: '이관 실패 (승격)' }, { status: 500 });

      const { error: demoteError } = await supabase
        .from('employees')
        .update({ role: 'user' })
        .eq('id', myId);

      if (demoteError) {
        // 롤백: 대상도 원래대로
        await supabase.from('employees').update({ role: 'user' }).eq('id', targetEmployeeId);
        return NextResponse.json({ error: '이관 실패 (변경)' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: '관리자 권한이 이관되었습니다. 페이지를 새로고침합니다.' });
    }

    default:
      return NextResponse.json({ error: '알 수 없는 작업입니다' }, { status: 400 });
  }
}
