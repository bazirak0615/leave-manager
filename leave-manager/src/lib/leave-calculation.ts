/**
 * 연차 계산 로직
 * 근로기준법 기반 연차 발생 규칙 구현
 */

/**
 * 두 날짜 사이의 만 근속 개월 수 계산
 */
export function getMonthsWorked(hireDate: string, asOfDate?: string): number {
  const start = new Date(hireDate + 'T00:00:00');
  const target = asOfDate ? new Date(asOfDate + 'T00:00:00') : new Date();

  if (target < start) return 0;

  let months = (target.getFullYear() - start.getFullYear()) * 12
    + (target.getMonth() - start.getMonth());

  // 일자가 입사일 이전이면 한 달 차감
  if (target.getDate() < start.getDate()) months--;

  return Math.max(0, months);
}

/**
 * 두 날짜 사이의 만 근속 년 수 계산
 */
export function getYearsWorked(hireDate: string, asOfDate?: string): number {
  const start = new Date(hireDate + 'T00:00:00');
  const target = asOfDate ? new Date(asOfDate + 'T00:00:00') : new Date();

  if (target < start) return 0;

  let years = target.getFullYear() - start.getFullYear();

  // 입사일이 아직 안 지났으면 1년 차감
  const monthDiff = target.getMonth() - start.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && target.getDate() < start.getDate())) {
    years--;
  }

  return Math.max(0, years);
}

/**
 * 입사일 기준 N번째 근속 기념일 계산
 */
export function getAnniversaryDate(hireDate: string, year: number): string {
  const start = new Date(hireDate + 'T00:00:00');
  const anniv = new Date(start);
  anniv.setFullYear(anniv.getFullYear() + year);
  return formatDateISO(anniv);
}

/**
 * 연차 발생 개수 계산
 * - 입사 후 1년 미만: 매월 1개씩, 최대 11개
 * - 입사 후 1년 이상: 15개
 * - 입사 후 3년 이상: 16개 (15 + 1)
 * - 이후 2년마다 +1개, 최대 25개
 */
export function calculateLeaveEntitlement(hireDate: string, asOfDate?: string): number {
  const yearsWorked = getYearsWorked(hireDate, asOfDate);

  if (yearsWorked < 1) {
    // 월차 기간: 매월 1개씩, 최대 11개
    const monthsWorked = getMonthsWorked(hireDate, asOfDate);
    return Math.min(monthsWorked, 11);
  }

  // 연차 기간
  const base = 15;

  if (yearsWorked < 3) {
    return base;
  }

  // 3년차부터 추가: 3년차 +1, 5년차 +2, 7년차 +3, ...
  const bonus = Math.floor((yearsWorked - 3) / 2) + 1;

  return Math.min(base + bonus, 25);
}

/**
 * 현재 연차 기간(leave_year) 계산
 * 입사일 기준으로 몇 번째 연차 기간인지 반환
 */
export function getLeaveYear(hireDate: string, targetDate?: string): number {
  const yearsWorked = getYearsWorked(hireDate, targetDate);

  if (yearsWorked < 1) {
    return 0; // 월차 기간
  }

  return yearsWorked;
}

/**
 * 특정 날짜가 속하는 연차 기간의 시작/종료일 계산
 */
export function getLeavePeriodDates(hireDate: string, targetDate?: string): {
  start: string;
  end: string;
  leaveYear: number;
} {
  const leaveYear = getLeaveYear(hireDate, targetDate);

  if (leaveYear === 0) {
    // 월차 기간: 입사일 ~ 입사 1주년 전날
    const endDate = new Date(hireDate + 'T00:00:00');
    endDate.setFullYear(endDate.getFullYear() + 1);
    endDate.setDate(endDate.getDate() - 1);
    return {
      start: hireDate,
      end: formatDateISO(endDate),
      leaveYear: 0,
    };
  }

  // 연차 기간: 입사 N주년 ~ 입사 (N+1)주년 전날
  const start = getAnniversaryDate(hireDate, leaveYear);
  const endDate = new Date(start + 'T00:00:00');
  endDate.setFullYear(endDate.getFullYear() + 1);
  endDate.setDate(endDate.getDate() - 1);

  return {
    start,
    end: formatDateISO(endDate),
    leaveYear,
  };
}

/**
 * 다음 연차 발생 정보
 */
export function getNextGenerationInfo(hireDate: string, asOfDate?: string): {
  date: string;
  description: string;
} | null {
  const yearsWorked = getYearsWorked(hireDate, asOfDate);

  if (yearsWorked < 1) {
    const monthsWorked = getMonthsWorked(hireDate, asOfDate);

    if (monthsWorked >= 11) {
      // 이미 최대 월차 도달, 다음은 1주년
      const anniv = getAnniversaryDate(hireDate, 1);
      return { date: anniv, description: '연차 15개 부여' };
    }

    // 다음 월차 발생일
    const start = new Date(hireDate + 'T00:00:00');
    const nextMonth = new Date(start);
    nextMonth.setMonth(start.getMonth() + monthsWorked + 1);
    return { date: formatDateISO(nextMonth), description: '+1개 (월차)' };
  }

  // 다음 연차 기간 시작일
  const nextAnniv = getAnniversaryDate(hireDate, yearsWorked + 1);
  const nextEntitlement = calculateLeaveEntitlement(hireDate, nextAnniv);
  return {
    date: nextAnniv,
    description: `연차 ${nextEntitlement}개 부여`,
  };
}

/**
 * 사용 연차 합계 계산
 */
export function calculateUsedLeaves(
  leaves: Array<{ type: string; date: string }>,
  periodStart?: string,
  periodEnd?: string
): number {
  let total = 0;

  for (const leave of leaves) {
    // 기간 필터
    if (periodStart && leave.date < periodStart) continue;
    if (periodEnd && leave.date > periodEnd) continue;

    switch (leave.type) {
      case 'full':
        total += 1;
        break;
      case 'am-half':
      case 'pm-half':
        total += 0.5;
        break;
    }
  }

  return total;
}

/**
 * 날짜 범위에서 평일만 추출 (주말 제외)
 */
export function getWeekdaysInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const current = new Date(start);

  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(formatDateISO(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * 날짜를 ISO 형식 (YYYY-MM-DD)으로 포맷
 */
export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 날짜를 한국어 형식으로 포맷 (YY.MM.DD)
 */
export function formatDateKR(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const y = d.getFullYear().toString().slice(2);
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}.${m}.${day}`;
}

/**
 * 요일 이름 반환
 */
export function getDayName(dateStr: string): string {
  const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
  const d = new Date(dateStr + 'T00:00:00');
  return DAY_NAMES[d.getDay()];
}

/**
 * 오늘 날짜를 ISO 형식으로 반환
 */
export function getTodayISO(): string {
  return formatDateISO(new Date());
}

/**
 * 선연차 반영 실질 발생 연차 계산
 * - leave_year=0: max(월차발생, 선연차합계) → 선연차가 향후 월차를 대체
 * - leave_year>=1: 기본 entitlement 그대로
 */
export function calculateEffectiveEntitlement(
  baseEntitlement: number,
  leaveYear: number,
  advanceTotal: number
): number {
  if (leaveYear === 0 && advanceTotal > 0) {
    return Math.max(baseEntitlement, advanceTotal);
  }
  return baseEntitlement;
}

/**
 * 조정 내역에서 선연차 / 일반(+차감) 분리 계산
 */
export function splitAdjustments(
  adjustments: Array<{ adjustment: number; type?: string }>
): { advanceTotal: number; generalTotal: number } {
  let advanceTotal = 0;
  let generalTotal = 0;
  for (const a of adjustments) {
    if (a.type === 'advance') {
      advanceTotal += Number(a.adjustment);
    } else {
      generalTotal += Number(a.adjustment);
    }
  }
  return { advanceTotal, generalTotal };
}
