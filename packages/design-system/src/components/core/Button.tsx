import type { MouseEventHandler, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  disabled?: boolean;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit' | 'reset';
}

const sizes: Record<ButtonSize, { height: number; padding: string; fontSize: number }> = {
  sm: { height: 32, padding: '0 12px', fontSize: 13 },
  md: { height: 40, padding: '0 16px', fontSize: 14 },
  lg: { height: 48, padding: '0 20px', fontSize: 15 },
};

const variants: Record<ButtonVariant, { background: string; color: string; border: string }> = {
  primary: { background: 'var(--brand-primary)', color: '#fff', border: '1px solid transparent' },
  secondary: { background: 'var(--surface-card)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' },
  ghost: { background: 'transparent', color: 'var(--brand-primary)', border: '1px solid transparent' },
};

export function Button({ variant = 'primary', size = 'md', icon, disabled, children, onClick, type = 'button' }: ButtonProps) {
  const v = variants[variant] || variants.primary;
  const s = sizes[size] || sizes.md;
  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        justifyContent: 'center',
        height: s.height,
        padding: s.padding,
        fontSize: s.fontSize,
        fontFamily: 'var(--font-ui)',
        fontWeight: 'var(--fw-semibold)',
        borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background var(--duration-fast) var(--ease-standard)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        ...v,
      }}
    >
      {icon ? <span style={{ display: 'inline-flex', fontSize: s.fontSize + 2 }}>{icon}</span> : null}
      {children}
    </button>
  );
}
