import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase';
import { getTodayISO } from '@/lib/leave-calculation';
import { updateCalendarEvent, deleteCalendarEvent } from '@/lib/google-calendar';
import { sendLeaveNotification } from '@/lib/slack';
import { LeaveType } from '@/lib/types';

// PUT: 연차 수정
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  }

  const user = session.user as Record<string, unknown>;
  const employeeId = user.employeeId as string;
  const isAdmin = user.role === 'admin';
  const { id } = await params;

  const body = await req.json();
  const { date, type } = body;

  const supabase = createServerSupabase();

  // 기존 연차 조회
  const { data: existing } = await supabase
    .from('leaves')
    .select('*')
    .eq('id', id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: '연차를 찾을 수 없습니다' }, { status: 404 });
  }

  // 권한 확인: 본인 것만 수정 가능 (관리자는 모두 가능)
  if (!isAdmin && existing.employee_id !== employeeId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
  }

  // 일반 사용자는 과거 일정 수정 불가
  const today = getTodayISO();
  if (!isAdmin && existing.date <= today) {
    return NextResponse.json({ error: '오늘 이전의 연차는 수정할 수 없습니다' }, { status: 400 });
  }

  // 수정
  const updateData: Record<string, string> = {};
  if (date) updateData.date = date;
  if (type) updateData.type = type;

  const { error } = await supabase
    .from('leaves')
    .update(updateData)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: '수정에 실패했습니다' }, { status: 500 });
  }

  // Google Calendar 일정 수정 (fire-and-forget)
  const { data: leaveOwner } = await supabase
    .from('employees')
    .select('name, email')
    .eq('id', existing.employee_id)
    .single();

  if (existing.calendar_event_id && leaveOwner) {
    updateCalendarEvent(
      existing.employee_id,
      existing.calendar_event_id,
      {
        employeeName: leaveOwner.name,
        date: updateData.date || undefined,
        type: (updateData.type as LeaveType) || undefined,
      }
    ).catch((err) => {
      console.error('[Calendar Sync] 수정 실패:', err);
    });
  }

  // 슬랙 채널 알림 (fire-and-forget)
  if (leaveOwner) {
    sendLeaveNotification({
      action: 'update',
      employeeName: leaveOwner.name,
      employeeEmail: leaveOwner.email,
      dates: [updateData.date || existing.date],
      type: updateData.type || existing.type,
      oldDate: existing.date,
      oldType: existing.type,
    }).catch(err => console.error('[Slack] 알림 실패:', err));
  }

  return NextResponse.json({ success: true });
}

// DELETE: 연차 삭제
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  }

  const user = session.user as Record<string, unknown>;
  const employeeId = user.employeeId as string;
  const isAdmin = user.role === 'admin';
  const { id } = await params;

  const supabase = createServerSupabase();

  // 기존 연차 조회
  const { data: existing } = await supabase
    .from('leaves')
    .select('*')
    .eq('id', id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: '연차를 찾을 수 없습니다' }, { status: 404 });
  }

  // 권한 확인
  if (!isAdmin && existing.employee_id !== employeeId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
  }

  // 일반 사용자는 과거 일정 삭제 불가
  const today = getTodayISO();
  if (!isAdmin && existing.date <= today) {
    return NextResponse.json({ error: '오늘 이전의 연차는 삭제할 수 없습니다' }, { status: 400 });
  }

  const { error } = await supabase
    .from('leaves')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: '삭제에 실패했습니다' }, { status: 500 });
  }

  // Google Calendar 일정 삭제 (fire-and-forget)
  if (existing.calendar_event_id) {
    deleteCalendarEvent(existing.employee_id, existing.calendar_event_id).catch(
      (err) => {
        console.error('[Calendar Sync] 삭제 실패:', err);
      }
    );
  }

  // 슬랙 채널 알림 (fire-and-forget)
  const { data: deleteOwner } = await supabase
    .from('employees')
    .select('name, email')
    .eq('id', existing.employee_id)
    .single();

  if (deleteOwner) {
    sendLeaveNotification({
      action: 'delete',
      employeeName: deleteOwner.name,
      employeeEmail: deleteOwner.email,
      dates: [existing.date],
      type: existing.type,
    }).catch(err => console.error('[Slack] 알림 실패:', err));
  }

  return NextResponse.json({ success: true });
}
