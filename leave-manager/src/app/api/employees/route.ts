import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase';

// GET: 구성원 목록 조회 (관리자만)
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
  const { data: employees, error } = await supabase
    .from('employees')
    .select('*')
    .order('name');

  if (error) {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }

  return NextResponse.json({ employees });
}

// POST: 구성원 등록 (관리자만)
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

  // 단건 등록
  if (!Array.isArray(body)) {
    const { email, name, hire_date, role } = body;

    if (!email || !name || !hire_date) {
      return NextResponse.json({ error: '이메일, 이름, 입사일은 필수입니다' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from('employees')
      .insert({
        email: email.trim().toLowerCase(),
        name: name.trim(),
        hire_date,
        role: role || 'user',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '이미 등록된 이메일입니다' }, { status: 409 });
      }
      return NextResponse.json({ error: '등록 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true, employee: data });
  }

  // 일괄 등록 (CSV)
  const records = body.map((item: { email: string; name: string; hire_date: string; role?: string }) => ({
    email: item.email.trim().toLowerCase(),
    name: item.name.trim(),
    hire_date: item.hire_date,
    role: item.role || 'user',
  }));

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('employees')
    .upsert(records, { onConflict: 'email' })
    .select();

  if (error) {
    return NextResponse.json({ error: '일괄 등록 실패: ' + error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    count: data?.length || 0,
    message: `${data?.length || 0}명 등록/업데이트 완료`,
  });
}
