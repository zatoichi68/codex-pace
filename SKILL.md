---
name: codex-pace
description: Inspect, calculate, visualize, create, update, or diagnose Codex weekly usage pacing through the local Codex App Server. Use when Codex needs to report allowance consumption, predict the date a limit will be exhausted, recommend a sustainable slowdown, add intelligent pace alerts, build or maintain a local Codex Pace dashboard, or fix its live bridge, date, reset-window, notification, SSR, or hydration behavior.
---

# Codex Pace

Build conclusions from the local account response, not assumed plan limits. Keep account access local and expose only read-only usage data to the UI.

## Check for updates first

At the start of every invocation, run `node scripts/check_for_updates.mjs` from this skill directory. Continue the requested task when the network is unavailable. If an update is available, mention it briefly and offer to install it after completing the current request. Never download, overwrite, or execute an update without explicit user approval.

When publishing changes to this skill, increment `VERSION` using semantic versioning so installed copies can detect the update.

## Route the task

1. For a usage check or pace report, run `node scripts/inspect_codex_usage.mjs` from this skill directory. Add `--json` when machine-readable output helps.
2. For the bundled dashboard, run `node scripts/open_dashboard.mjs --open` from this skill directory only after the user accepts the dashboard offer. It needs no package installation or separate workspace.
3. For a separate dashboard build or update, inspect the target workspace first. Preserve its package manager and architecture. If `.openai/hosting.json` exists and the Sites skill is available, use it.
4. For a live-data failure, validate the inspection script before changing UI code. This separates account/App Server failures from bridge or rendering failures.
5. For protocol drift, run `codex app-server generate-ts --experimental --out <temporary-directory>` and inspect the current account rate-limit types before patching.

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

Do not start or open the dashboard automatically. If the user accepts, run `node scripts/open_dashboard.mjs --open` from this skill directory. The bundled zero-dependency companion reuses a healthy instance, otherwise starts on the first free port from 3000 through 3010, prints its URL, and opens it in the system browser. Verify `/api/health` before reporting success. If browser opening is blocked, give the printed local URL to the user.

Use a separate `CODEX_PACE_WORKSPACE` dashboard only when the user explicitly asks to develop or validate that project. The bundled companion is the default for ordinary viewing.

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

1. `node scripts/check_for_updates.mjs`
2. `node scripts/inspect_codex_usage.mjs`
3. `node --check scripts/open_dashboard.mjs`
4. `node --check assets/dashboard/app.js`
5. the project's lint command when a separate dashboard workspace is being changed
6. `npx tsc --noEmit` when that project uses TypeScript
7. the production build when that project has one
8. the local UI and bridge health checks
9. one live `account/rateLimits/read` RPC through the bridge
10. a hard browser reload followed by a fresh console-error check when browser control permits it

Confirm that there are no hydration errors and that the rendered reset and projected-limit timestamps match before and after hydration. Keep local companion apps local unless the user explicitly requests a separate deployable architecture; a hosted page cannot directly launch the user's local Codex App Server.
