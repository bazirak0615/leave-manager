import { google } from 'googleapis';
import { createServerSupabase } from './supabase';
import { LeaveType } from './types';

const GROUP_CALENDAR_ID = process.env.GOOGLE_CALENDAR_GROUP_ID || '';

// === 타입 정의 ===

interface CalendarEventParams {
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  type: LeaveType;
}

interface CalendarSyncResult {
  eventId: string | null;
  error?: string;
}

// === OAuth2 클라이언트 생성 ===

async function getOAuth2ClientForEmployee(employeeId: string) {
  const supabase = createServerSupabase();

  const { data: employee } = await supabase
    .from('employees')
    .select('google_refresh_token, google_access_token, google_token_expiry')
    .eq('id', employeeId)
    .single();

  if (!employee?.google_refresh_token) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!
  );

  oauth2Client.setCredentials({
    refresh_token: employee.google_refresh_token,
    access_token: employee.google_access_token || undefined,
    expiry_date: employee.google_token_expiry
      ? new Date(employee.google_token_expiry).getTime()
      : undefined,
  });

  // 토큰 자동 갱신 시 DB에 저장
  oauth2Client.on('tokens', async (tokens) => {
    const updateData: Record<string, string | null> = {};
    if (tokens.access_token) {
      updateData.google_access_token = tokens.access_token;
    }
    if (tokens.expiry_date) {
      updateData.google_token_expiry = new Date(tokens.expiry_date).toISOString();
    }
    if (Object.keys(updateData).length > 0) {
      await supabase
        .from('employees')
        .update(updateData)
        .eq('id', employeeId);
    }
  });

  return oauth2Client;
}

// === 이벤트 제목 생성 ===

function buildEventTitle(name: string, type: LeaveType): string {
  switch (type) {
    case 'full':
      return `${name} 연차`;
    case 'am-half':
      return `${name} 오전반차`;
    case 'pm-half':
      return `${name} 오후반차`;
    default:
      return `${name} 연차`;
  }
}

// === 종일 일정용 종료일 계산 (exclusive) ===

function getNextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// === 캘린더 일정 생성 ===

export async function createCalendarEvent(
  params: CalendarEventParams
): Promise<CalendarSyncResult> {
  try {
    const auth = await getOAuth2ClientForEmployee(params.employeeId);
    if (!auth) {
      return { eventId: null, error: 'Google 토큰 없음' };
    }

    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: buildEventTitle(params.employeeName, params.type),
        start: { date: params.date },
        end: { date: getNextDay(params.date) },
        attendees: GROUP_CALENDAR_ID
          ? [{ email: GROUP_CALENDAR_ID }]
          : undefined,
        transparency: 'opaque',
        reminders: { useDefault: false, overrides: [] },
      },
      sendUpdates: 'all',
    });

    return { eventId: response.data.id || null };
  } catch (error) {
    console.error('[Google Calendar] 일정 생성 실패:', error);
    return {
      eventId: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// === 캘린더 일정 수정 ===

export async function updateCalendarEvent(
  employeeId: string,
  eventId: string | null,
  params: {
    employeeName: string;
    date?: string;
    type?: LeaveType;
  }
): Promise<CalendarSyncResult> {
  if (!eventId) {
    return { eventId: null, error: '이벤트 ID 없음' };
  }

  try {
    const auth = await getOAuth2ClientForEmployee(employeeId);
    if (!auth) {
      return { eventId: null, error: 'Google 토큰 없음' };
    }

    const calendar = google.calendar({ version: 'v3', auth });

    const patch: Record<string, unknown> = {};
    if (params.type) {
      patch.summary = buildEventTitle(params.employeeName, params.type);
    }
    if (params.date) {
      patch.start = { date: params.date };
      patch.end = { date: getNextDay(params.date) };
    }

    await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody: patch,
      sendUpdates: 'all',
    });

    return { eventId };
  } catch (error) {
    console.error('[Google Calendar] 일정 수정 실패:', error);
    return {
      eventId: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// === 캘린더 일정 삭제 ===

export async function deleteCalendarEvent(
  employeeId: string,
  eventId: string | null
): Promise<void> {
  if (!eventId) return;

  try {
    const auth = await getOAuth2ClientForEmployee(employeeId);
    if (!auth) return;

    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
      sendUpdates: 'all',
    });
  } catch (error) {
    console.error('[Google Calendar] 일정 삭제 실패:', error);
  }
}

// === 캘린더 일정 일괄 생성 (대량 등록용) ===

export async function createCalendarEventsBatch(
  params: CalendarEventParams[]
): Promise<Array<{ date: string; eventId: string | null }>> {
  const CHUNK_SIZE = 5;
  const results: Array<{ date: string; eventId: string | null }> = [];

  for (let i = 0; i < params.length; i += CHUNK_SIZE) {
    const chunk = params.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.allSettled(
      chunk.map((p) => createCalendarEvent(p))
    );

    chunkResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        results.push({
          date: chunk[idx].date,
          eventId: result.value.eventId,
        });
      } else {
        results.push({
          date: chunk[idx].date,
          eventId: null,
        });
      }
    });
  }

  return results;
}
