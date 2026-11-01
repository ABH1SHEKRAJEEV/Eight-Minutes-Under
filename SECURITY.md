# Security Notes — EIGHT MINUTES UNDER

## Application model

Eight Minutes Under is a static, browser-only, single-player horror game. The game engine, story script, timer and session state run in the visitor's browser. The current application has no accounts, personal-data forms, backend game state, API keys or server-side game endpoints. Google Fonts are the only expected third-party page resource.

A player can inspect or alter their own browser session. This is expected for a client-only experience and is not a server compromise. Do not use client-reported completion, elapsed time, score or game state as proof for prizes, rankings or other competitive outcomes. A future leaderboard would need server-side session creation, server-side validation and rate limiting.

## Current safeguards

- Production builds are minified; source maps and production console output are disabled. Deploy the production build, not the raw source or Vite development server.
- The production HTML receives a Content-Security-Policy at build time. It restricts outbound connections, plugins and base-URL changes; Google Fonts are explicitly allowed where needed.
- `vercel.json` configures response headers for MIME handling, framing, referrer disclosure and unnecessary browser permissions. Serve over HTTPS.
- React-rendered story and log strings are static project data; the current UI does not use an HTML string-injection API.
- No secrets, credentials or API tokens belong in this repository. Keep `.env` and local environment files out of Git.
- Vite is pinned to 7.3.7 and esbuild is pinned to 0.28.1 through the package override to address the audited development-server advisories.
- The GitHub quality workflow installs from the lockfile, runs the TypeScript check, builds the app and runs the dependency audit.

## Dependency advisories fixed (November 2026)

- `vite 7.3.2 → 7.3.7`: addresses the audited launch-editor NTLMv2 hash disclosure, editor CLI command execution, Windows `server.fs.deny` bypass and cross-origin script execution advisories.
- `esbuild → 0.28.1` via npm override: addresses the audited Windows development-server arbitrary file-read advisory.
- These findings affected the development server; the production static game does not expose that server.

## Manual regression checklist

1. Load the game and confirm the menu renders and the boot screen exits.
2. Block or fail one image asset; confirm a clear error and reload control appear.
3. Run a shift, switch to the Reaper's camera, allow a feed overload, and confirm an offline feed does not freeze the Reaper.
4. Hide the tab for 10 seconds; confirm the shift clock advances by approximately 10 seconds on return and SPACE is no longer held.
5. Complete the guide and launch a real shift; confirm the breach overlay, camera damage, phase, doses, signal and tutorial state reset.
6. On a phone, hold the charge control and use the deflect button during a parry.
7. Navigate controls with Tab and Shift+Tab; verify visible focus. Enable reduced motion and confirm intense decorative motion is suppressed.
8. Run `npm ci`, `npm run typecheck`, `npm run build` and `npm audit --audit-level=low`.

## Deployment rules

- Build with `npm run build` and deploy only the generated `dist/` output.
- Serve over HTTPS and retain the response security headers configured for the deployment host.
- Never share the Vite development-server URL or deploy the unbuilt source folder.

## Repository visibility and licensing

The GitHub repository's visibility is controlled in Repository Settings. A public repository allows anyone to read its source; making it private is a separate owner decision.

The game is © 2026 ABHISHEK RAJEEV and is released under GPL-3.0-or-later (see `LICENSE`). Anyone may copy or modify it under that licence; derivative works distributed to others must comply with its terms and preserve applicable notices.

## Known boundary

Game rules, story script and session state are client-side. A player can inspect or modify their own session. No client-only implementation can prevent that without a server-authoritative design. This is acceptable for a single-player game, but client-side results must not be trusted for prizes or rankings.
