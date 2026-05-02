import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { createServerSupabase } from './supabase';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async signIn({ user }) {
      // employees 테이블에 등록된 이메일만 로그인 허용
      const supabase = createServerSupabase();
      const { data: employee } = await supabase
        .from('employees')
        .select('id, role, is_active')
        .eq('email', user.email!)
        .single();

      if (!employee || !employee.is_active) {
        return false; // 미등록 또는 비활성 계정 거부
      }

      return true;
    },

    async jwt({ token, user, account }) {
      if (user?.email) {
        // 로그인 시 직원 정보를 JWT에 포함
        const supabase = createServerSupabase();
        const { data: employee } = await supabase
          .from('employees')
          .select('id, role, name')
          .eq('email', user.email)
          .single();

        if (employee) {
          token.employeeId = employee.id;
          token.role = employee.role;
          token.employeeName = employee.name;

          // Google OAuth 토큰 저장 (캘린더 API용)
          if (account?.refresh_token) {
            await supabase
              .from('employees')
              .update({
                google_refresh_token: account.refresh_token,
                google_access_token: account.access_token || null,
                google_token_expiry: account.expires_at
                  ? new Date(account.expires_at * 1000).toISOString()
                  : null,
              })
              .eq('id', employee.id);
          }
        }
      }
      return token;
    },

    async session({ session, token }) {
      // 세션에 직원 정보 추가
      if (session.user) {
        (session.user as Record<string, unknown>).employeeId = token.employeeId;
        (session.user as Record<string, unknown>).role = token.role;
        (session.user as Record<string, unknown>).employeeName = token.employeeName;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
