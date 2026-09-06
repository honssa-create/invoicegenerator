'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = {
  /** @deprecated Use onClick — kept so existing callers keep working. */
  onTap?: () => void;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * Native &lt;button type="button"&gt; with cursor:pointer.
 * Old iOS Safari only treats real buttons (or cursor:pointer) as tappable.
 * Do not attach preventDefault on touchend — that cancels the click.
 */
export default function TapButton({
  onTap,
  onClick,
  disabled,
  type = 'button',
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`cursor-pointer ${className}`}
      onClick={(event) => {
        onClick?.(event);
        if (!disabled && !event.defaultPrevented) onTap?.();
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Full-screen dismiss control — must be a &lt;button&gt;, not a div. */
export function TapSurface({
  onTap,
  onClick,
  className = '',
  children,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`cursor-pointer ${className}`}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onTap?.();
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
