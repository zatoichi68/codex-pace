---
name: codex-pace
description: Inspect, calculate, visualize, create, update, or diagnose Codex weekly usage pacing through the local Codex App Server. Use when Codex needs to report allowance consumption, predict the date a limit will be exhausted, recommend a sustainable slowdown, add intelligent pace alerts, build or maintain a local Codex Pace dashboard, or fix its live bridge, date, reset-window, notification, SSR, or hydration behavior.
---

# Codex Pace

Build conclusions from the local account response, not assumed plan limits. Keep account access local and expose only read-only usage data to the UI.

## Route the task

1. For a usage check or pace report, run `node scripts/inspect_codex_usage.mjs` from this skill directory. Add `--json` when machine-readable output helps.
2. For a dashboard build or update, inspect the target workspace first. Preserve its package manager and architecture. If `.openai/hosting.json` exists and the Sites skill is available, use it.
3. For a live-data failure, validate the inspection script before changing UI code. This separates account/App Server failures from bridge or rendering failures.
4. For protocol drift, run `codex app-server generate-ts --experimental --out <temporary-directory>` and inspect the current account rate-limit types before patching.

Read [references/protocol-and-pace.md](references/protocol-and-pace.md) when implementing the bridge, pace model, or UI states.

## Preserve the product contract

Show these elements prominently:

- weekly allowance used;
- share of the window already elapsed;
- pace multiplier relative to a sustainable `1.00x` rate;
- reset date and time;
- predicted date and time at which usage reaches 100%;
- red danger state when exhaustion is projected before reset;
- recommended percentage slowdown;
- reset credits currently available;
- ideal proactive and latest safe times for each useful credit;
- clear live, syncing, disconnected, and representative-preview states.

Make browser or desktop notifications opt-in. Deduplicate them for the same projected exhaustion window so the user is nudged rather than spammed.

## Use a local read-only bridge

Launch `codex app-server --stdio`, initialize JSON-RPC with `experimentalApi: true`, and allow only:

- `account/rateLimits/read`
- `account/usage/read`

Listen only on loopback. Reject non-local browser origins. Never return, log, persist, or expose auth tokens. Poll no more frequently than once per minute unless the user explicitly asks otherwise, and merge `account/rateLimits/updated` notifications between polls.

Treat the longest returned window as the weekly allowance. Do not assume that `primary` is short-term or that `secondary` always exists; some plans return only one weekly window.

Read `rateLimitResetCredits.availableCount` from the full rate-limit response. Never consume a reset credit unless the user explicitly asks and confirms that action. For analysis, recommend using a credit at 95% during uninterrupted active work, or waiting until 100% when an interruption is acceptable. Recalculate every projected reset time from the current burn rate and preserve credits whose ideal time falls after the natural reset.

## Offer the dashboard after analysis

After every successful usage or pace report, end with this concise opt-in question: `Veux-tu que j’affiche le dashboard Codex Pace ?`

Do not start or open the dashboard automatically. If the user accepts, reuse a healthy running UI and bridge when available; otherwise start the companion app with `npm run pace` from the Codex Pace workspace. Prefer the current workspace when its `package.json` identifies Codex Pace, then use the directory named by `CODEX_PACE_WORKSPACE` when that environment variable is set. If neither location is available, ask the user for the dashboard workspace instead of guessing a personal path. Wait for the local service to become healthy, then display `http://localhost:3000` in the in-app browser. If the app reports another local port, use and report that URL instead.

## Keep SSR deterministic

For server-rendered React:

1. Create one `initialNow` timestamp in the server component.
2. Resolve one time-zone string on the server.
3. Serialize both into the client component as props.
4. Initialize demo data and the client clock from `initialNow`.
5. Pass the serialized time zone to every `Intl.DateTimeFormat` used during the first render.
6. Start live clocks and account refreshes only after hydration.

Never call `Date.now()` independently in server and client initializers. Never depend on each runtime's implicit locale or time zone for SSR text.

## Validate on the real surface

Run, in order:

1. `node scripts/inspect_codex_usage.mjs`
2. the project's lint command
3. `npx tsc --noEmit` when TypeScript is present
4. the production build
5. the local UI and bridge health checks
6. one live `account/rateLimits/read` RPC through the bridge
7. a hard browser reload followed by a fresh console-error check

Confirm that there are no hydration errors and that the rendered reset and projected-limit timestamps match before and after hydration. Keep local companion apps local unless the user explicitly requests a separate deployable architecture; a hosted page cannot directly launch the user's local Codex App Server.
