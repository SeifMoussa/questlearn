export interface SwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  description?: string;
}

export function Switch({ checked = false, onChange, label, description }: SwitchProps) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
      <span
        onClick={() => onChange && onChange(!checked)}
        style={{
          width: 40,
          height: 22,
          borderRadius: 'var(--radius-pill)',
          flexShrink: 0,
          position: 'relative',
          background: checked ? 'var(--brand-primary)' : 'var(--gray-300)',
          transition: 'background var(--duration-fast) var(--ease-standard)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 21 : 3,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left var(--duration-fast) var(--ease-standard)',
            boxShadow: '0 1px 2px rgba(0,0,0,.2)',
          }}
        />
      </span>
      {(label || description) && (
        <span>
          {label ? <div style={{ fontSize: 14, fontWeight: 'var(--fw-medium)', color: 'var(--text-primary)' }}>{label}</div> : null}
          {description ? <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{description}</div> : null}
        </span>
      )}
    </label>
  );
}
