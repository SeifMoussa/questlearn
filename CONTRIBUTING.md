# Contributing

QuestLearn is a solo portfolio project, but it follows the same
branch/PR/review discipline as a team repository, both because that's
good practice and because the workflow itself is part of what this
project is demonstrating.

## Branching

- `main` is always deployable.
- Work happens on feature branches named for what they contain, e.g.
  `feature/module-0-foundation`, `feature/auth-registration`,
  `fix/duplicate-xp-award`, `docs/module-01-checkpoint`.
- No direct commits to `main`. Every change goes through a pull request,
  even when there's no second reviewer — the PR description and CI run
  are the record of what changed and why.

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(auth): add email registration endpoint
fix(attempts): prevent duplicate XP award on retry
test(scoring): cover partial-credit edge cases
docs: update module 2 checkpoint
chore(infra): bump postgres image to 17.2
```

Avoid vague messages like "update" or "fix stuff" — the type and scope
should make the commit's purpose clear without opening the diff.

## Pull requests

Each module's PR should describe:

- what's included and what's explicitly deferred to a later module,
- how to run and verify it locally,
- any known limitations.

CI (lint, typecheck, unit tests, build) must pass before merge. PRs are
squash-merged to keep `main` history readable.

## Code style

Formatting and linting are enforced via the shared config in
`packages/config` (ESLint + Prettier) and run in CI. Run `pnpm lint`
and `pnpm typecheck` locally before opening a PR.
