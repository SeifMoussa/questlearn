The dashboard's core stat pattern — icon chip, big number, delta vs. last period. Used on every overview/analytics screen.

```tsx
<StatCard icon="◆" label="Average Mastery" value="76%" delta="8% from last week" tone="teal" />
```

`deltaDirection="down"` renders a red down-arrow (e.g. "Due Assignments ↓ 2").
