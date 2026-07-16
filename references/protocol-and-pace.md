# Codex Pace protocol and calculation reference

## Current local methods

Generate bindings from the installed CLI when exact fields matter:

```bash
codex app-server generate-ts --experimental --out /private/tmp/codex-app-server-types
```

The local dashboard depends on two read-only methods:

- `account/rateLimits/read`
- `account/usage/read`

Useful rate-limit fields:

```ts
type RateLimitWindow = {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null; // Unix seconds
};

type RateLimitSnapshot = {
  limitId: string | null;
  limitName: string | null;
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
  planType: string | null;
};

type RateLimitResetCreditsSummary = {
  availableCount: bigint;
};
```

`account/rateLimits/updated` is a sparse notification. Merge its available fields into the last full read rather than replacing the entire snapshot.

## Select the weekly window

Collect non-null `primary` and `secondary` windows. Select the one with the greatest `windowDurationMins`. Do not infer semantics from field position.

If a multi-limit response exists, prefer the `codex` entry in `rateLimitsByLimitId`; otherwise use the first available entry or the backward-compatible `rateLimits` field.

## Pace calculation

Let:

- `durationMs = windowDurationMins * 60_000`
- `resetMs = resetsAt * 1_000`
- `startMs = resetMs - durationMs`
- `elapsedFraction = clamp((nowMs - startMs) / durationMs, 0.01, 1)`
- `usedFraction = clamp(usedPercent / 100, 0, 1)`

Then:

```text
pace = usedFraction / elapsedFraction
burnPerMs = usedFraction / max(nowMs - startMs, 1)
projectedLimitMs = startMs + 1 / burnPerMs
hoursEarly = max(0, (resetMs - projectedLimitMs) / 3_600_000)
slowdownPercent = max(0, round((1 - 1 / pace) * 100))
```

Use a small tolerance to avoid noisy alerts. The reference UI treats pace as dangerous when `pace > 1.05` and `projectedLimitMs < resetMs`.

When usage is zero, show an effectively unlimited projection rather than dividing by zero.

## Reset-credit strategy

Read the available count from `rateLimitResetCredits.availableCount`. The protocol confirms that a credit can reset the account rate limit, but it does not prescribe an optimal usage time. Treat the following schedule as a pace-based recommendation, not a platform guarantee.

Use 95% as the proactive threshold when uninterrupted work matters. Waiting until 100% preserves slightly more quota but risks a blocked request.

```text
proactiveFraction = 0.95
firstIdealMs = max(nowMs, startMs + proactiveFraction / burnPerMs)
cycleMs = proactiveFraction / burnPerMs
bufferMs = (1 - proactiveFraction) / burnPerMs

idealMs[0] = firstIdealMs
idealMs[n] = firstIdealMs + n * cycleMs
latestMs[n] = idealMs[n] + bufferMs
```

Mark a credit useful only when `idealMs < resetMs`. Preserve later credits for the next window. Recalculate whenever `usedPercent`, `resetsAt`, or the current time changes because early-window projections can move quickly.

Never call `account/rateLimitResetCredit/consume` during analysis. Consuming a credit is an external state change and requires an explicit user request and confirmation.

## Privacy and transport

- Bind the bridge to `127.0.0.1`.
- Restrict allowed browser origins to loopback hosts.
- Allowlist only the two account read methods.
- Do not request or expose auth tokens.
- Do not write account responses to the repository.
- Store only device-local notification preferences or deduplication keys.

## Required UI states

- `live`: current App Server values are displayed.
- `syncing`: the bridge is connected and the first read is pending.
- `disconnected`: the bridge cannot be reached.
- `preview`: representative data is shown and must be labeled as such.
- `safe`: projected exhaustion occurs at or after reset.
- `danger`: projected exhaustion occurs before reset; make the pace and estimate red.
