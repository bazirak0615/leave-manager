import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase';

// DELETE: 조정 내역 삭제
export async function DELETE(
  _req: NextRequest,
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

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('leave_adjustments')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
