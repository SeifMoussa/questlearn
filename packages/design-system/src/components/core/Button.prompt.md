Primary action button — use for the single most important action on a screen (Start Free, Create Activity, Publish).

```tsx
<Button variant="primary" onClick={handleCreate}>Create Class</Button>
<Button variant="secondary" size="sm">Preview</Button>
<Button variant="ghost" icon="+">Add Question</Button>
```

Variants: `primary` (solid indigo, one per view), `secondary` (bordered, pairs with primary), `ghost` (text-only, low emphasis). Sizes: `sm` 32px, `md` 40px, `lg` 48px. Set `disabled` to dim and block clicks.
