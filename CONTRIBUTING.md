# Contributing to Genesis.ai

Thanks for your interest in contributing! This document explains how to get a
development environment running, the conventions we follow, and how to get your
change merged.

> New here? Read [`ONBOARDING.md`](ONBOARDING.md) and [`STRUCTURE.md`](STRUCTURE.md)
> first for a tour of the codebase.

## Table of contents

- [Code of Conduct](#code-of-conduct)
- [Ways to contribute](#ways-to-contribute)
- [Development setup](#development-setup)
- [Project layout](#project-layout)
- [Branch & commit conventions](#branch--commit-conventions)
- [Before you open a PR](#before-you-open-a-pr)
- [Pull request process](#pull-request-process)
- [Reporting bugs & requesting features](#reporting-bugs--requesting-features)
- [Security issues](#security-issues)

## Code of Conduct

This project and everyone participating in it is governed by our
[Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to
uphold it. Please report unacceptable behavior through the channels listed
there.

## Ways to contribute

- **Report bugs** and **request features** via [GitHub Issues](https://github.com/junjie-duan/genesis-agent-teams/issues).
- **Improve documentation** — typo fixes and clarifications are welcome and are
  a great first contribution.
- **Submit code** — fix a bug, implement a feature, or improve tests.

If you are planning a large change, please open an issue to discuss it first so
we can align on direction before you invest time.

## Development setup

### Requirements

- Node.js `>= 20`
- npm `>= 9`
- Docker / Docker Compose (for PostgreSQL, Redis, and FlareSolverr)

### Steps

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/genesis-agent-teams.git
cd genesis-agent-teams

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Fill in at least: DATABASE_URL, REDIS_URL, JWT_SECRET,
# and one model provider key (e.g. OPENAI_API_KEY)

# 4. Start infrastructure (Postgres, Redis, FlareSolverr)
npm run db:setup

# 5. Initialize the database
cd backend
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
cd ..

# 6. Run the dev environment
npm run dev
```

Default ports: frontend `:3000`, backend `:3001`, AI service `:5000`.

> **Never commit real secrets.** `.env` is gitignored. Only ever edit
> `.env.example` with placeholder values.

## Project layout

This is a monorepo:

| Path          | Description                              |
| ------------- | ---------------------------------------- |
| `frontend/`   | Next.js 14 + TypeScript frontend         |
| `backend/`    | NestJS 10 + Prisma backend               |
| `ai-service/` | FastAPI auxiliary service                |
| `infra/`      | Deployment scripts and configuration     |
| `e2e/`        | Playwright end-to-end tests              |
| `docs/`       | Design docs, guides, and decisions       |

The backend is organized into five top-level layers — `ai-app`, `ai-engine`,
`ai-harness`, `ai-infra`, and `open-api` — with a strict one-directional
dependency rule enforced by architecture-boundary tests. See
[`STRUCTURE.md`](STRUCTURE.md) before moving code across layers, and run
`npm run verify:arch` (in `backend/`) to check boundaries.

## Branch & commit conventions

- Branch off the default branch with a descriptive name, e.g.
  `feat/agent-handoff`, `fix/token-aggregation`, `docs/readme-quickstart`.
- We use [Conventional Commits](https://www.conventionalcommits.org/) enforced
  by commitlint. Commit message format:

  ```
  <type>(<scope>): <subject>
  ```

  Allowed types: `feat`, `fix`, `refactor`, `perf`, `docs`, `style`, `test`,
  `chore`, `ci`, `build`.

  Examples:

  ```
  feat(research): add multi-step plan caching
  fix(playground): correct section offset in report artifact
  docs(readme): add English quickstart
  ```

- Keep one logical change per commit. Don't mix unrelated changes.
- Do **not** force-push to shared branches. If your branch is behind, use
  `git pull --rebase` and resolve conflicts locally.

## Before you open a PR

Run the local quality gates and make sure they pass:

```bash
npm run type-check     # TypeScript checks
npm run lint           # ESLint
npm run test:quick     # Fast test suite
npm run verify:quick   # Type-check + tests in one step
```

For changes that touch backend module boundaries, also run:

```bash
cd backend && npm run verify:arch
```

Husky pre-commit and pre-push hooks run a subset of these automatically.

Checklist:

- [ ] Code compiles and type-checks with no new errors
- [ ] Tests pass; new behavior is covered by tests
- [ ] No `console.log`, no `any` types, no hardcoded model names or secrets
- [ ] Documentation updated if behavior or APIs changed
- [ ] Commits follow Conventional Commits

## Pull request process

1. Push your branch to your fork and open a PR against the default branch.
2. Fill in the PR template — describe **what** changed and **why**, and link
   any related issues (`Closes #123`).
3. Ensure CI is green. The CI pipeline runs linting, type-checks, tests, the
   architecture-boundary job, and builds.
4. Address review feedback by pushing additional commits (we squash on merge).
5. A maintainer will merge once approved and CI passes.

## Reporting bugs & requesting features

Use the issue templates:

- **Bug report** — include reproduction steps, expected vs. actual behavior,
  and environment details.
- **Feature request** — describe the problem you're trying to solve, not just
  the solution you have in mind.

## Security issues

**Do not** open public issues for security vulnerabilities. Please follow the
process in [`SECURITY.md`](SECURITY.md).
