# Security Notes — EIGHT MINUTES UNDER

## What this app is

A browser-only, single-player horror game. No backend, no accounts, no forms,
no network calls (only Google Fonts), no cookies, no localStorage, no API keys.
The full dependency audit is clean (`npm audit` reports 0 vulnerabilities).

## The honest truth about "hiding the source code"

**Client-side code can never be hidden.** The browser must download and run the
code to display the page, so View Source and DevTools can always read it. Any
script that blocks right-click or F12 is bypassed in seconds and breaks the
page for real users. This is true of every website; it is not a bug here.

What we do instead:

1. **Ship a production build.** `npm run build` produces `dist/index.html` with
   the code minified and mangled — unreadable, one 1.4 MB file, no comments,
   no original names. This is already wired up. **Never deploy the raw source
   folder or share the dev server URL** (`npm run dev`) — that serves the full
   readable source and, on Windows, had known file-read vulnerabilities.
2. **No secrets in the code.** There is nothing to steal: no keys, no tokens,
   no server. Verified by sweep.
3. **Content-Security-Policy** (injected into the production HTML at build
   time): blocks all outbound connections (`connect-src 'none'`), plugins
   (`object-src 'none'`), and `<base>` hijacking. Only Google Fonts may load.
4. **No sourcemaps, no console output** in production builds.

## Repository visibility

The GitHub repository is currently **public** — anyone can read the source at
github.com. If you don't want that: repo Settings → General → Danger Zone →
Change visibility → Private. That is a decision only you can make.

**Licensing:** the game is © 2026 ABHISHEK RAJEEV, released under
**GPL-3.0-or-later** (see `LICENSE`). Anyone may copy or modify it, but any
derivative they publish must also be GPL-3.0, keep the copyright notice, and
stay open source. Proprietary rip-offs are a license violation.

## Deployment rules

- Deploy **only** the contents of `dist/` (built with `npm run build`).
- Serve over **HTTPS**.
- If your host supports response headers, add:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`)
  - `Referrer-Policy: no-referrer`

## Known boundary (by design)

Game rules, the story script, and state all live in the browser. A player can
inspect or modify their own session — no client-side game can prevent that
without a server-authoritative design. Fine for a game; never use client-side
results for prizes or rankings.

## Dependency advisories fixed (Nov 2026)

- `vite 7.3.2 → 7.3.7`: fixes launch-editor NTLMv2 hash disclosure (GHSA-v6wh-96g9-6wx3),
  editor CLI command execution (GHSA-r825-w8mm-5pxw), Windows `server.fs.deny`
  bypass (GHSA-fx2h-pf6j-xcff), and cross-origin script execution (GHSA-9jrq-w75r-8gcw).
- `esbuild → 0.28.1` (override): fixes Windows dev-server arbitrary file read (GHSA-g7r4-m6w7-qqqr).
- All of these were dev-server-only issues; the built game was never affected.
