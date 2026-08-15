Percentage bar with a label row — mastery %, completion %, quest progress, team progress.

```tsx
<ProgressBar label="Average Mastery (%)" value={76} tone="teal" />
```

`tone` should reflect what's being measured: `teal` for mastery, `green` for completion/on-track, `amber`/`red` for concepts that need attention.
