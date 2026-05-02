'use client';

import { SessionProvider } from 'next-auth/react';
import TransitionAlertModal from '@/components/admin/TransitionAlertModal';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <TransitionAlertModal />
    </SessionProvider>
  );
}
