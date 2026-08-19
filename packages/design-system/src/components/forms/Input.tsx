import type { CSSProperties } from 'react';

export interface InputProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  multiline?: boolean;
  maxLength?: number;
  rows?: number;
  type?: string;
  name?: string;
  id?: string;
  autoComplete?: string;
}

const baseStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-card)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 14,
  resize: 'vertical',
};

export function Input({ placeholder, value, onChange, multiline = false, maxLength, rows = 3, type = 'text', name, id, autoComplete }: InputProps) {
  if (multiline) {
    return (
      <textarea
        placeholder={placeholder}
        value={value}
        maxLength={maxLength}
        rows={rows}
        name={name}
        id={id}
        onChange={(e) => onChange && onChange(e.target.value)}
        className="qs-input"
        style={baseStyle}
      />
    );
  }
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      maxLength={maxLength}
      name={name}
      id={id}
      autoComplete={autoComplete}
      onChange={(e) => onChange && onChange(e.target.value)}
      className="qs-input"
      style={baseStyle}
    />
  );
}
