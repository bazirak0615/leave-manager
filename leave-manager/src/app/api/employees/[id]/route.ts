import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase';

// GET: 특정 구성원 상세 조회 (관리자만)
export async function GET(
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

  const { id } = await params;
  const supabase = createServerSupabase();

  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('id', id)
    .single();

  if (!employee) {
    return NextResponse.json({ error: '구성원을 찾을 수 없습니다' }, { status: 404 });
  }

  const { data: leaves } = await supabase
    .from('leaves')
    .select('*')
    .eq('employee_id', id)
    .order('date', { ascending: false });

  const { data: adjustments } = await supabase
    .from('leave_adjustments')
    .select('*')
    .eq('employee_id', id);

  return NextResponse.json({
    employee,
    leaves: leaves || [],
    adjustments: adjustments || [],
  });
}

// PUT: 구성원 정보 수정 (관리자만)
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

  const { id } = await params;
  const body = await req.json();
  const updateData: Record<string, unknown> = {};

  if (body.name !== undefined) updateData.name = body.name;
  if (body.email !== undefined) updateData.email = body.email;
  if (body.hire_date !== undefined) updateData.hire_date = body.hire_date;
  if (body.is_active !== undefined) updateData.is_active = body.is_active;

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('employees')
    .update(updateData)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
