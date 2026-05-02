import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface TransitionEmailParams {
  adminEmails: string[];
  employeeName: string;
  anniversaryDate: string;
  daysUntil: number;
  remainingLeaves: number;
}

export async function sendTransitionNotification(params: TransitionEmailParams): Promise<{
  success: boolean;
  error?: string;
}> {
  const { adminEmails, employeeName, anniversaryDate, daysUntil, remainingLeaves } = params;

  const urgencyText =
    daysUntil <= 0 ? '오늘' :
    daysUntil === 1 ? '내일' :
    `${daysUntil}일 후`;

  const subject = `[연차 관리] ${employeeName}님 입사 1주년 ${urgencyText} - 연차 전환 결정 필요`;

  const siteUrl = process.env.NEXTAUTH_URL || 'https://your-deployment.vercel.app';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1e293b; margin-bottom: 16px;">연차 전환 알림</h2>
      <p style="color: #475569;"><strong>${employeeName}</strong>님의 입사 1주년이 <strong>${urgencyText}</strong>입니다.</p>
      <p style="color: #64748b; font-size: 14px;">기념일: ${anniversaryDate}</p>
      <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; color: #475569;">현재 잔여 월차: <strong style="color: #3b82f6; font-size: 18px;">${remainingLeaves}개</strong></p>
        <p style="margin: 8px 0 0; color: #475569;">새로운 연차: <strong>15개</strong></p>
      </div>
      <p style="color: #475569;">관리자 페이지에서 잔여 월차 처리 방법을 결정해주세요:</p>
      <ul style="color: #475569;">
        <li><strong>누적 유지</strong>: 잔여 ${remainingLeaves}개 + 15개 = ${remainingLeaves + 15}개</li>
        <li><strong>소멸</strong>: 15개만 부여</li>
      </ul>
      <a href="${siteUrl}/admin"
         style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 12px;">
        관리자 페이지로 이동
      </a>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">이 메일은 연차 관리 시스템에서 자동 발송되었습니다.</p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
      to: adminEmails,
      subject,
      html,
    });
    return { success: true };
  } catch (error) {
    console.error('[Email] Send failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
