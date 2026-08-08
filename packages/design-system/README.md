# @questlearn/design-system

Design tokens and component library for QuestLearn, pulled from the
`QuestLearn Design System` project on Claude Design
(`claude.ai/design`). This is the source of visual truth for
`apps/web` from Module 1 onward.

## What's here

```
src/
  styles.css          root stylesheet, @imports every token file below
  tokens/
    colors.css        primitive + semantic color tokens
    typography.css     font families, sizes, weights, line-heights
    spacing.css         spacing scale, layout widths
    effects.css          radius, shadow, easing/duration
    fonts.css               @font-face (Google Fonts-hosted, see Caveats)
    base.css                minimal reset, body/link defaults
  components/
    core/         Button, Badge, Tag, ProgressBar
    forms/        Input, Select, Switch
    feedback/     StatCard, AvatarMetricRow
    navigation/   SidebarNavItem, Tabs
    data/         QuestStepper
  index.ts        barrel export
assets/
  logo-mark.svg   placeholder wordmark icon (see Caveats)
reference/
  auth-screens.jsx, marketing-site.jsx   full-screen layout reference,
  not runnable directly in this repo (see reference/README.md)
```

Each component ships as a typed `.tsx` (converted from the source
project's `.jsx` + `.d.ts`, same markup and logic) with a colocated
`.prompt.md` describing intended usage — kept for reference, not
consumed at runtime.

## Usage

```tsx
import { Button, Input } from '@questlearn/design-system';
import '@questlearn/design-system/styles.css';
```

Components style themselves via inline styles that read CSS custom
properties (`var(--brand-primary)`, etc.) — there is no utility-class
system. Importing `styles.css` once (e.g. in the Next.js root layout)
is what makes those variables resolve.

## Known limitations, carried over from the source project

The design system was authored from the 6 static mockups in
`docs/design-reference/` and the master spec, largely without visual
access to the real running app (see the source project's own README
for the sync history). Several things are explicitly placeholders,
not final brand assets:

- **Fonts are Google Fonts substitutions** (Lora / Inter / JetBrains
  Mono), not confirmed brand typefaces.
- **The logo (`assets/logo-mark.svg`) is a plain geometric
  approximation** — a stroke circle + diagonal line standing in for
  the mockups' "magnifying-glass Q" mark.
- **Icons are Unicode glyphs** (`⌂ ◈ ⚑ ▤ ★ ◎`), not a real icon set.
  A real icon library (the design system's own notes suggest Lucide
  or Heroicons as the closest visual match) should replace these.
- **Animation, hover, and press states are assumptions**, not sourced
  from anything — the original mockups are static images.

Replace these as real assets become available; nothing above blocks
building functional pages against the tokens and components as-is.

## Re-syncing

Re-run the design-system pull (via the `DesignSync` tool's read
methods against the `QuestLearn Design System` project) whenever the
Claude Design side changes meaningfully, and diff before overwriting —
this package is meant to track that project, not diverge from it.
