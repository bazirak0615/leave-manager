// === 데이터베이스 타입 ===

export interface Employee {
  id: string;
  email: string;
  name: string;
  hire_date: string; // YYYY-MM-DD
  role: 'admin' | 'user';
  is_active: boolean;
  created_at: string;
  google_refresh_token: string | null;
  google_access_token: string | null;
  google_token_expiry: string | null;
}

export interface Leave {
  id: string;
  employee_id: string;
  date: string; // YYYY-MM-DD
  type: LeaveType;
  leave_year: number;
  created_by: string;
  created_at: string;
  calendar_event_id: string | null;
}

export interface LeaveAdjustment {
  id: string;
  employee_id: string;
  leave_year: number;
  adjustment: number;
  reason: string | null;
  type: 'general' | 'advance' | 'deduction' | 'carry_over';
  created_by: string;
  created_at: string;
}

// === 연차 유형 ===

export type LeaveType = 'full' | 'am-half' | 'pm-half';

export interface LeaveTypeInfo {
  label: string;
  cost: number;
  cssClass: string;
  description: string;
}

export const LEAVE_TYPES: Record<LeaveType, LeaveTypeInfo> = {
  full: {
    label: '연차',
    cost: 1.0,
    cssClass: 'type-full',
    description: '종일 (1일)',
  },
  'am-half': {
    label: '오전 반차',
    cost: 0.5,
    cssClass: 'type-am-half',
    description: '오전 (10시~15시, 0.5일)',
  },
  'pm-half': {
    label: '오후 반차',
    cost: 0.5,
    cssClass: 'type-pm-half',
    description: '오후 (15시~19시, 0.5일)',
  },
};

// === 연차 요약 ===

export interface LeaveSummary {
  totalEntitlement: number;  // 총 발생
  totalUsed: number;         // 사용
  remaining: number;         // 잔여
  adjustments: number;       // 수동 보정
  nextGenerationDate: string | null; // 다음 발생일
  nextGenerationDescription: string | null;
}

// === 1주년 전환 ===

export interface AnniversaryTransition {
  id: string;
  employee_id: string;
  transition_year: number;
  anniversary_date: string;
  status: 'pending' | 'carry_over' | 'reset';
  remaining_leaves: number | null;
  carry_over_amount: number;
  decided_by: string | null;
  decided_at: string | null;
  adjustment_id: string | null;
  created_at: string;
}

export interface TransitionWithEmployee extends AnniversaryTransition {
  employees: {
    name: string;
    email: string;
    hire_date: string;
  };
}

// === 세션 타입 확장 ===

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  employeeId: string;
}
