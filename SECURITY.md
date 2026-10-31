# Security notes

## Application model

Eight Minutes Under is a static, browser-only single-player game. The game engine,
script, target frequencies, timer and state are downloaded to the visitor's browser.
A player can inspect or alter their own browser session. This is expected for a
client-only experience and is not a server compromise.

Do not use client-reported completion, elapsed time, score or game state as proof
for prizes, rankings or other competitive outcomes. A future leaderboard would
need server-side session creation, server-side validation and rate limiting.

## Current safeguards

- No login, personal-data form, API key, backend endpoint or server-side game
  state is present in the current source.
- React-rendered story and log strings are static project data; no HTML string
  injection API is used.
- Vercel response headers harden MIME handling, framing, referrer disclosure and
  unnecessary browser permissions.
- Vite is pinned to 7.3.7 and esbuild to 0.28.1, which are outside the affected ranges audited in this patch.
- CI installs the lockfile, type-checks, builds and fails on any npm audit finding, including low-severity issues.

## Manual regression checklist

1. Load with WebGL enabled; confirm the menu renders and the boot screen exits.
2. Block or fail one image asset; confirm a clear error and reload control appear.
3. Run a real shift, switch to the Reaper's camera, allow a feed overload, and
   confirm an offline feed no longer freezes the Reaper.
4. Hide the tab for 10 seconds; confirm the shift clock advances by approximately
   10 seconds when returning, and SPACE is no longer held.
5. Complete the guide and launch a real shift; confirm the breach overlay, camera
   damage, phase, doses, signal and tutorial state are reset.
6. On a phone, hold the charge control and use the deflect button during a parry.
7. Navigate all controls with Tab and Shift+Tab; verify visible focus. Enable
   reduced motion and confirm intense decorative motion is suppressed.
8. Run `npm ci`, `npm run typecheck`, `npm run build` and `npm audit --audit-level=low`.
