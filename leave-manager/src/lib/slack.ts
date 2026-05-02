import crypto from 'crypto';
import { WebClient } from '@slack/web-api';
import { createServerSupabase } from './supabase';

// === Slack WebClient ===

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

// === 서명 검증 ===

export async function verifySlackRequest(req: Request): Promise<{ verified: boolean; body: string }> {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return { verified: false, body: '' };
  }

  const timestamp = req.headers.get('x-slack-request-timestamp');
  const signature = req.headers.get('x-slack-signature');

  if (!timestamp || !signature) {
    return { verified: false, body: '' };
  }

  // 5분 이내 요청만 허용
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    return { verified: false, body: '' };
  }

  const body = await req.text();
  const basestring = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac('sha256', signingSecret).update(basestring).digest('hex');
  const computed = `v0=${hmac}`;

  const verified = crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(signature)
  );

  return { verified, body };
}

// === Slack 유저 이메일로 직원 매칭 ===

export async function findEmployeeBySlackUser(slackUserId: string) {
  // Slack에서 이메일 조회
  const userInfo = await slackClient.users.info({ user: slackUserId });
  const email = userInfo.user?.profile?.email;

  if (!email) {
    return null;
  }

  // employees 테이블에서 이메일 매칭
  const supabase = createServerSupabase();
  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('email', email)
    .eq('is_active', true)
    .single();

  return employee;
}

// === 연차 유형 라벨 ===

function getLeaveTypeLabel(type: string): string {
  switch (type) {
    case 'full': return '연차';
    case 'am-half': return '오전반차';
    case 'pm-half': return '오후반차';
    default: return type;
  }
}

// === 날짜 포맷 (YYYY-MM-DD → YY.MM.DD) ===

function formatShortDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${y.slice(2)}.${m}.${d}`;
}

// === 잔여 연차 포맷 ===

function formatRemaining(v: number): string {
  return v % 1 === 0 ? v.toString() : v.toFixed(1);
}

// === 이메일로 Slack 유저 ID 조회 ===

export async function lookupSlackUserByEmail(email: string): Promise<string | null> {
  try {
    const result = await slackClient.users.lookupByEmail({ email });
    return result.user?.id || null;
  } catch {
    return null;
  }
}

// === 슬랙 채널 알림 발송 ===

export async function sendLeaveNotification(params: {
  action: 'create' | 'update' | 'delete';
  employeeName: string;
  employeeEmail?: string;
  slackUserId?: string;
  dates: string[];
  type: string;
  remaining?: number;
  oldDate?: string;
  oldType?: string;
}) {
  const channelId = process.env.SLACK_CHANNEL_ID;
  if (!channelId || !process.env.SLACK_BOT_TOKEN) return;

  const { action, employeeName, employeeEmail, dates, type, remaining, oldDate, oldType } = params;
  const typeLabel = getLeaveTypeLabel(type);

  // Slack 유저 멘션 조회
  let userMention = `*${employeeName}*`;
  const slackUserId = params.slackUserId || (employeeEmail ? await lookupSlackUserByEmail(employeeEmail) : null);
  if (slackUserId) {
    userMention = `<@${slackUserId}>`;
  }

  const remainingText = remaining !== undefined ? ` (잔여 연차 ${formatRemaining(remaining)}일)` : '';

  let text = '';

  if (action === 'create') {
    if (dates.length === 1) {
      text = `<!channel> ${userMention} 님이 ${formatShortDate(dates[0])} ${typeLabel}를 사용합니다.${remainingText}`;
    } else {
      text = `<!channel> ${userMention} 님이 ${formatShortDate(dates[0])}~${formatShortDate(dates[dates.length - 1])} ${typeLabel}를 사용합니다.${remainingText}`;
    }
  } else if (action === 'update') {
    const oldTypeLabel = oldType ? getLeaveTypeLabel(oldType) : typeLabel;
    if (oldDate && dates[0] !== oldDate) {
      text = `<!channel> ${userMention} 님이 ${formatShortDate(oldDate)} ${oldTypeLabel} → ${formatShortDate(dates[0])} ${typeLabel}로 변경했습니다.${remainingText}`;
    } else if (oldType && type !== oldType) {
      text = `<!channel> ${userMention} 님이 ${formatShortDate(dates[0])} ${oldTypeLabel} → ${typeLabel}로 변경했습니다.${remainingText}`;
    } else {
      text = `<!channel> ${userMention} 님이 ${formatShortDate(dates[0])} ${typeLabel}를 수정했습니다.${remainingText}`;
    }
  } else if (action === 'delete') {
    text = `<!channel> ${userMention} 님이 ${formatShortDate(dates[0])} ${typeLabel}를 취소했습니다.${remainingText}`;
  }

  try {
    await slackClient.chat.postMessage({
      channel: channelId,
      text,
      mrkdwn: true,
    });
  } catch (err) {
    console.error('[Slack] 알림 발송 실패:', err);
  }
}

// === 슬랙 모달 오픈 ===

export async function openLeaveModal(triggerId: string, employeeId: string, employeeName: string) {
  await slackClient.views.open({
    trigger_id: triggerId,
    view: {
      type: 'modal',
      callback_id: 'leave_registration',
      private_metadata: JSON.stringify({ employeeId, employeeName }),
      title: {
        type: 'plain_text',
        text: '연차 등록',
      },
      submit: {
        type: 'plain_text',
        text: '등록',
      },
      close: {
        type: 'plain_text',
        text: '취소',
      },
      blocks: [
        {
          type: 'input',
          block_id: 'start_date_block',
          element: {
            type: 'datepicker',
            action_id: 'start_date',
            placeholder: {
              type: 'plain_text',
              text: '시작일 선택',
            },
          },
          label: {
            type: 'plain_text',
            text: '시작일',
          },
        },
        {
          type: 'input',
          block_id: 'end_date_block',
          optional: true,
          element: {
            type: 'datepicker',
            action_id: 'end_date',
            placeholder: {
              type: 'plain_text',
              text: '종료일 선택 (미입력 시 시작일과 동일)',
            },
          },
          label: {
            type: 'plain_text',
            text: '종료일 (선택)',
          },
        },
        {
          type: 'input',
          block_id: 'leave_type_block',
          element: {
            type: 'static_select',
            action_id: 'leave_type',
            options: [
              {
                text: { type: 'plain_text', text: '종일' },
                value: 'full',
              },
              {
                text: { type: 'plain_text', text: '오전반차' },
                value: 'am-half',
              },
              {
                text: { type: 'plain_text', text: '오후반차' },
                value: 'pm-half',
              },
            ],
            initial_option: {
              text: { type: 'plain_text', text: '종일' },
              value: 'full',
            },
          },
          label: {
            type: 'plain_text',
            text: '유형',
          },
        },
      ],
    },
  });
}
