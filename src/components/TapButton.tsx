'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { tapProps } from '@/lib/tap-action';

type Props = {
  onTap: () => void;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onTouchEnd' | 'onTouchStart'>;

/** Button that fires on iOS 15 Safari touchend (click is often missing). */
export default function TapButton({ onTap, disabled, type = 'button', children, ...rest }: Props) {
  return (
    <button type={type} disabled={disabled} {...rest} {...tapProps(onTap, Boolean(disabled))}>
      {children}
    </button>
  );
}
