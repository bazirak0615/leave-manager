-- =============================================
-- 연차 관리 시스템 - Supabase DB 스키마
-- Supabase SQL Editor에서 실행하세요
-- =============================================

-- 1. 구성원 테이블
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  hire_date DATE NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 연차 사용 테이블
CREATE TABLE leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('full', 'am-half', 'pm-half')),
  leave_year INT NOT NULL,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, date, type)
);

-- 3. 연차 수동 보정 테이블 (이월, 추가 부여 등)
CREATE TABLE leave_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  leave_year INT NOT NULL,
  adjustment NUMERIC(3,1) NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_leaves_employee_id ON leaves(employee_id);
CREATE INDEX idx_leaves_date ON leaves(date);
CREATE INDEX idx_leaves_employee_date ON leaves(employee_id, date);
CREATE INDEX idx_leave_adjustments_employee ON leave_adjustments(employee_id);

-- RLS (Row Level Security) 비활성화 (NextAuth로 인증 처리)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_adjustments ENABLE ROW LEVEL SECURITY;

-- 서비스 롤 키로 모든 작업 허용 (API 라우트에서 서버 사이드로 처리)
CREATE POLICY "서비스 롤 전체 접근" ON employees FOR ALL USING (true);
CREATE POLICY "서비스 롤 전체 접근" ON leaves FOR ALL USING (true);
CREATE POLICY "서비스 롤 전체 접근" ON leave_adjustments FOR ALL USING (true);

-- 초기 관리자 계정 (이메일을 실제 관리자 이메일로 변경하세요)
-- INSERT INTO employees (email, name, hire_date, role)
-- VALUES ('admin@yourcompany.com', '관리자', '2024-01-01', 'admin');
