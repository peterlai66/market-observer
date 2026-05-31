# Contributing

Thanks for considering a contribution to Market Observer.

MO is a Cloudflare Workers + D1 project for Taiwan post-market observation, LINE reports, recommendation validation, and simulated execution review. It does not place real broker orders or manage real funds.

## Good First Contributions

- improve setup documentation
- add tests around date handling and market-data validation
- improve D1 migration notes
- harden CLI diagnostics
- improve LINE command documentation
- add safer failure messages for missing remote credentials

## Development Setup

```bash
npm install
npm run mo -- doctor
npm run mo -- preflight
```

Before opening a pull request, run:

```bash
npm run mo -- doctor
npm run mo -- guard
npm run mo -- sanity
npm run typecheck
```

If your change touches Worker runtime behavior, also run:

```bash
npm run mo -- smoke-worker
```

## Project Rules

- Keep `VERSION` as the version source of truth.
- Do not treat generated handoff files or chat memory as source of truth.
- Keep real trading and broker execution out of scope.
- Prefer auditable scripts and small, reviewable changes.
- Avoid committing secrets, tokens, raw production logs, or local Cloudflare credentials.

## Pull Request Checklist

- Explain the problem and the fix.
- Include validation commands and their results.
- Update docs when behavior changes.
- Add or update tests for behavior changes when practical.
- Confirm no secrets or private runtime state were committed.
