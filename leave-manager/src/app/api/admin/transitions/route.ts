import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase';

// GET: 대기 중인 전환 목록 조회
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  }

  const user = session.user as Record<string, unknown>;
  if (user.role !== 'admin') {
    return NextResponse.json({ transitions: [] });
  }

  const supabase = createServerSupabase();

  const { data: transitions } = await supabase
    .from('anniversary_transitions')
    .select('*, employees(name, email, hire_date)')
    .eq('status', 'pending')
    .order('anniversary_date', { ascending: true });

  return NextResponse.json({ transitions: transitions || [] });
}
