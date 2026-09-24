# Contributing to CrawlSEO

Thanks for your interest in contributing! CrawlSEO is open source and we welcome contributions of all kinds.

## Open-Source vs. Paid Cloud Boundary

Classic search performance — Google or Bing — belongs in the open-source core. Anything that measures brand mentions or citations inside AI answers is the paid cloud layer and won't be merged here.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/crawlseo.git
   cd crawlseo
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Set up the database**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your credentials
   docker compose up -d db
   npx prisma migrate dev
   ```
5. **Start the dev server**:
   ```bash
   npm run dev
   ```

## Making Changes

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature
   ```
2. Make your changes
3. Run the linter:
   ```bash
   npm run lint
   ```
4. Build to check for errors:
   ```bash
   npm run build
   ```
5. Commit with a [conventional commit](https://www.conventionalcommits.org/) message:
   ```bash
   git commit -m "feat: add your feature"
   ```
6. Push and open a Pull Request:
   ```bash
   git push origin feature/your-feature
   ```

## Commit Message Format

We use conventional commits:

- `feat:` — New feature
- `fix:` — Bug fix
- `style:` — UI/CSS changes (no logic change)
- `refactor:` — Code refactoring
- `docs:` — Documentation
- `chore:` — Maintenance tasks

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a clear description of what changed and why
- Update documentation if your change affects the public API or user-facing behavior
- Make sure the build passes before requesting review

## Merge Gate

Before a PR is merged, every change must pass all of the following:

1. **Reproduce the bug on a real page or a real API response** — not just a synthetic fixture. If it is a crawler or page issue, point at real HTML; if it is an API issue, point at the real response shape.
2. **Classify the behaviour against the relevant spec** — e.g. WCAG for accessibility issues, the upstream API reference for data-source issues. A fix that codifies a misreading of the spec will be sent back.
3. **Add a test that fails on the old code and passes on the new one** — a regression test that pins the corrected behaviour.
4. **Typecheck, lint on changed files, and the full test suite all pass** — `npx tsc --noEmit`, `npx eslint <changed-files>`, and `npm test`, clean before merge.

## Reporting Issues

- Use [GitHub Issues](https://github.com/crawlseo/crawlseo/issues)
- Search existing issues before creating a new one
- Include steps to reproduce, expected behavior, and actual behavior

## Code Style

- TypeScript for all code
- Use existing patterns in the codebase as a guide
- Follow the project's component and file structure conventions
- No unnecessary abstractions — keep it simple

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
