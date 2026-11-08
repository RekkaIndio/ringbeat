# Contributing

Issues and pull requests are welcome. The roadmap in [ROADMAP.md](ROADMAP.md) lists what is planned, with rough hour estimates; open work is tracked in GitHub Issues.

## Set up

```bash
npm ci
npm run dev
```

## Before you open a pull request

```bash
npm run typecheck
npm test
npm run build
```

If you changed anything the browser can see or hear, also run the end-to-end check (it needs Chromium for Playwright, installed once with `npx playwright install chromium`):

```bash
npm run build
npm run e2e
```

## Ground rules

- Keep the rhythm logic in `src/core/` pure: plain data in, plain data out, no browser APIs. That is what keeps it testable in Node.
- New behaviour in `src/core/` comes with tests. Prefer properties that must always hold (for example "pulses are spread as evenly as possible") over single hand-picked examples.
- Audio must stay deterministic: the same song renders to exactly the same samples.
- No accounts, no tracking, no network requests. Ringbeat runs entirely in the browser.
- Be careful with claims about traditional rhythms. Cite a source or leave it out.
