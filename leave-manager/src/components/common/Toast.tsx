'use client';

import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
}

export default function Toast({ message, type = 'success', onClose }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 애니메이션을 위해 약간의 딜레이
    requestAnimationFrame(() => setVisible(true));

    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, 2500);

    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = {
    success: 'bg-slate-800',
    error: 'bg-danger',
    info: 'bg-primary',
  }[type];

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 ${bgColor} text-white px-6 py-3 rounded-btn text-sm font-medium shadow-modal z-[2000] transition-all duration-300 pointer-events-none ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      {message}
    </div>
  );
}
