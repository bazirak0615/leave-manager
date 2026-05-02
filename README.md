# Leave Manager — 스타트업 친화적 조직 연차 관리 시스템

20~200명 규모 조직이 엑셀·구글시트·카톡으로 처리하던 연차 신청·기록·승인 흐름을 웹 한 화면으로 정리하는 Next.js 14 + Supabase + NextAuth 기반 자체 사내 SaaS.

> Vercel 무료 + Supabase 무료 + Resend 무료 티어로 운영비 0원.

자세한 기획은 [docs/기획안.md](docs/기획안.md). 코드는 [`leave-manager/`](leave-manager/) 폴더에 있습니다.

## 핵심 기능

- 캘린더로 연차/오전반차/오후반차 신청 (반차 0.5일 단위)
- 관리자/일반 역할 분리, 회사 도메인 한정 Google OAuth 로그인
- 연차 잔여·이월·차감 자동 계산 (`leave_adjustments` 별도 테이블)
- Slack DM + 이메일(Resend) 자동 알림
- 승인된 연차를 Google Calendar에 자동 등록
- 월별 사용 현황 캘린더로 "이번 주 출근자" 한눈에

## 빠른 시작

```bash
cd leave-manager
npm install
cp .env.local.example .env.local
# .env.local 편집 (Supabase, Google OAuth, Slack, Resend 키 입력)
npm run dev
# → http://localhost:3000
```

DB 스키마는 [`leave-manager/supabase-schema.sql`](leave-manager/supabase-schema.sql)을 Supabase SQL Editor에서 실행.

## 환경 변수

`.env.local.example` 참고:

| 키 | 설명 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 (절대 클라이언트 노출 금지) |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | NextAuth |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `RESEND_API_KEY` | 이메일 |
| `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, `SLACK_SIGNING_SECRET` | Slack |
| `GOOGLE_CALENDAR_GROUP_ID` | 회사 공용 캘린더 |
| `CRON_SECRET` | 정기 작업 인증 |

## 기술 스택

- Next.js 14 App Router · TypeScript · TailwindCSS
- Supabase Postgres · NextAuth.js · Resend · Slack Web API · Google Calendar API
- 배포: Vercel

## 라이선스

개인 프로젝트 — 자유롭게 참고·재사용 가능.
