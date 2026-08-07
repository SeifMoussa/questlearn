export interface TabsProps {
  items: string[];
  active?: string;
  onChange?: (item: string) => void;
}

export function Tabs({ items = [], active, onChange }: TabsProps) {
  return (
    <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--border-default)', fontFamily: 'var(--font-ui)' }}>
      {items.map((item) => {
        const isActive = item === active;
        return (
          <div
            key={item}
            onClick={() => onChange && onChange(item)}
            style={{
              padding: '10px 2px',
              fontSize: 14,
              cursor: 'pointer',
              fontWeight: isActive ? 'var(--fw-semibold)' : 'var(--fw-regular)',
              color: isActive ? 'var(--brand-primary)' : 'var(--text-secondary)',
              borderBottom: isActive ? '2px solid var(--brand-primary)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {item}
          </div>
        );
      })}
    </div>
  );
}
