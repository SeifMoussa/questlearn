# Design Reference

> **This folder is visual/UX reference only.** These are early design
> mockups, not screenshots of the built product. Per the project's
> screenshot policy, real checkpoint screenshots (`docs/screenshots/`)
> must always be genuine captures of the running app. Nothing in this
> folder should ever be presented, committed elsewhere, or referenced
> as a product screenshot.

## Files

| File | Shows |
|---|---|
| `mockup-01-landing-page.png` | Public marketing page: hero section ("Turn every lesson into a learning quest"), feature cards (Quest-Based Learning, Mastery Tracking, Teacher Analytics), testimonial, pricing tiers (Free/Teacher/School/District) |
| `mockup-02-teacher-dashboard-overview.png` | Teacher's cross-class overview: active classes, due assignments, average mastery, rewards given, recent submissions, class progress chart, learners needing support, upcoming deadlines, quick actions |
| `mockup-03-class-detail.png` | Single class view: completion rate, average mastery, concepts mastered, learner spotlight list, current assignments, weakest concepts, team progress, recent activity |
| `mockup-04-question-builder.png` | Activity/question builder: question list sidebar, question editor (type, answer options, explanation, hint, points, difficulty, linked concepts), question settings panel (shuffle, time limit, standards, tags) |
| `mockup-05-learner-dashboard.png` | Learner home: current quest with progress, quest path (sequential locked/unlocked steps), upcoming assignments, recommended practice, XP/level progress, concept mastery by topic, recent badges, class announcements |
| `mockup-06-reporting-analytics.png` | Teacher reporting: completion rate, average score, proficient learners, concepts mastered, class mastery heatmap (student × concept), assignment performance chart, learners needing support, question analysis, concept breakdown |

## Design language to carry into the build

- **Palette** — indigo/purple primary (nav, primary buttons, active states), teal/green for progress and positive metrics, orange/amber for warnings and mid-tier stats, red for "needs support" states.
- **Layout** — persistent left sidebar nav (role-specific: teacher vs. learner), card-based dashboard grid, consistent stat-card pattern (icon, big number, delta vs. last period).
- **Components worth matching** — progress bars with percentage labels, avatar + name + metric row (used for both "Learner Spotlight" and "Learners Needing Support"), badge/achievement icon grid, sequential quest-path stepper with locked/unlocked/completed states.

## Scope decisions from reviewing these mockups

These mockups show more than the MVP builds. Decisions made after review
(see `QuestLearn_Master_Spec.md` §21 for the canonical version):

- **Question types** — MVP keeps the original 5 (single choice, multiple
  choice, true/false, short text, numeric). Matching, Ordering, and
  Drag-and-Drop (shown in `mockup-04`) are **not built**.
- **Streaks + team-based progress** — deferred to Phase 2 alongside Live
  Sessions. The "24 day streak" and "Team Progress" (The Cell Squad, DNA
  Dream Team, etc.) shown in `mockup-03` and `mockup-05` are **not built**
  in Modules 0–10.
- **Marketing/pricing landing page** (`mockup-01`) — **is** in scope for
  the MVP, but presentational only. Pricing tiers are static copy; no
  real billing, payment, or plan-enforcement logic behind them.
- **"Recommended Practice" and AI-generated "Class Insights"** (shown in
  `mockup-05` / `mockup-03`) — out of scope for the MVP; legitimate
  future AI-integration ideas, not part of Modules 0–10.
