# Reference screens

`auth-screens.jsx` and `marketing-site.jsx` are pulled verbatim from the
design system project's `ui_kits/`. They are **not runnable in this repo
as-is** — they read components off a `window.QuestLearnDesignSystem_*`
global that only exists inside that project's own preview runtime.

They exist here as layout/copy reference for building the real pages in
`apps/web`: full-screen composition, spacing, copy tone, and how the
core components (`Button`, `Input`, `Badge`, ...) combine on each screen.
The actual Module 1 pages import components directly from
`@questlearn/design-system` rather than off a global, and are built as
real Next.js routes, not static preview HTML.

See the top-level `docs/design-reference/README.md` for the caveats that
apply to the whole design system (substituted fonts, placeholder logo,
Unicode glyph icons, unsourced animation/hover assumptions) — those
apply equally to what's built from these reference screens.
