'use client';

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { useNativeTap } from '@/lib/use-native-tap';

const TAP_CLASS =
  'cursor-pointer touch-manipulation [-webkit-tap-highlight-color:transparent]';

type Props = {
  onTap: () => void;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onTouchEnd' | 'onTouchStart'>;

/** Button that uses native (non-passive) taps — required on iOS 15.8 Safari. */
export default function TapButton({
  onTap,
  disabled,
  type = 'button',
  className = '',
  children,
  ...rest
}: Props) {
  const ref = useNativeTap<HTMLButtonElement>(onTap, Boolean(disabled));
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={`${TAP_CLASS} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Full-screen backdrop / non-button hit target with the same native tap binding. */
export function TapSurface({
  onTap,
  className = '',
  children,
  ...rest
}: {
  onTap: () => void;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'onClick' | 'onTouchEnd' | 'onTouchStart'>) {
  const ref = useNativeTap<HTMLDivElement>(onTap);
  return (
    <div ref={ref} className={`${TAP_CLASS} ${className}`} {...rest}>
      {children}
    </div>
  );
}
