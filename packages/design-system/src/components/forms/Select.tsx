export interface SelectProps {
  options: string[];
  value?: string;
  onChange?: (value: string) => void;
  size?: 'sm' | 'md';
}

export function Select({ options = [], value, onChange, size = 'md' }: SelectProps) {
  const height = size === 'sm' ? 32 : 40;
  return (
    <select
      value={value}
      onChange={(e) => onChange && onChange(e.target.value)}
      style={{
        height,
        padding: '0 32px 0 12px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-default)',
        background: 'var(--surface-card)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-ui)',
        fontSize: 14,
        fontWeight: 'var(--fw-medium)',
        appearance: 'none',
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M0 0l5 6 5-6z' fill='%237B7797'/></svg>\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
      }}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
