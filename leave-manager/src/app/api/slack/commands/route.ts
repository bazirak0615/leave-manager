import { NextResponse } from 'next/server';
import { verifySlackRequest, findEmployeeBySlackUser, openLeaveModal } from '@/lib/slack';

export async function POST(req: Request) {
  // 서명 검증
  const { verified, body } = await verifySlackRequest(req);
  if (!verified) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // URL-encoded body 파싱
  const params = new URLSearchParams(body);
  const userId = params.get('user_id');
  const triggerId = params.get('trigger_id');

  if (!userId || !triggerId) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    // 슬랙 이메일로 직원 매칭
    const employee = await findEmployeeBySlackUser(userId);

    if (!employee) {
      return NextResponse.json({
        response_type: 'ephemeral',
        text: '❌ 등록된 직원 정보를 찾을 수 없습니다.\n시스템에 등록된 이메일과 슬랙 이메일이 동일한지 확인해 주세요.',
      });
    }

    // 모달 오픈
    await openLeaveModal(triggerId, employee.id, employee.name);

    // 슬래시 커맨드 응답 (빈 응답으로 에러 메시지 방지)
    return new NextResponse('', { status: 200 });
  } catch (err) {
    console.error('[Slack Command] 오류:', err);
    return NextResponse.json({
      response_type: 'ephemeral',
      text: '❌ 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    });
  }
}
