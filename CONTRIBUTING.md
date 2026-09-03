# Contributing

Thank you for considering a contribution to the IIT project-management demonstration.

## Before you start

1. Open an issue describing the problem or proposed improvement.
2. Keep the scope suitable for a small internal research-management team.
3. Use synthetic data in code, tests, documentation, screenshots, and bug reports.
4. Read [SECURITY.md](SECURITY.md) before reporting a security concern.

## Local development

Requirements:

- Node.js 24 or a compatible current LTS release;
- pnpm 11.

From the repository root:

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Before opening a pull request:

```bash
pnpm build
pnpm test
```

Do not commit `.env`, databases, backups, attachments, generated release archives, imported workbooks, or local build output.

## Pull requests

A focused pull request should include:

- a concise description of the user-facing problem;
- the implementation approach and important trade-offs;
- tests for changed server behavior where practical;
- updated documentation when configuration or workflows change;
- sanitized before/after screenshots for visible UI changes.

Avoid bundling unrelated formatting or generated-file changes. Preserve the project's lightweight deployment and collaboration model unless the proposal explicitly discusses why additional complexity is needed.

## Commit messages

Use a short, action-oriented subject, for example:

```text
fix: refresh portfolio after project update
feat: add synthetic milestone showcase data
docs: clarify SQLite backup procedure
```

## Privacy checklist

Before committing, confirm that:

- all people and organizations are fictional;
- project codes, diseases, dates, budgets, and enrollment figures are demonstrative;
- screenshots contain no browser accounts, cloud-console details, IP addresses, local paths, or notifications;
- files do not contain hidden spreadsheet sheets, comments, document properties, or database records from production.
