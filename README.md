# Codex Pace

Codex Pace is a local Codex skill that measures weekly usage pace, predicts when the allowance will be exhausted, and recommends when to use available reset credits.

It reads the current account limits from the local Codex App Server instead of assuming a fixed plan allowance.

## Features

- Reports weekly usage and elapsed-window percentages.
- Calculates pace relative to a sustainable `1.00x` rate.
- Predicts the date and time the limit will be reached.
- Recommends a slowdown when usage is too fast.
- Reads available reset credits and calculates ideal and latest-use times.
- Includes a zero-dependency local dashboard and offers to open it after each report.
- Checks the published skill version whenever Codex Pace is invoked.
- Diagnoses dashboard bridge, reset-window, notification, SSR, and hydration issues.

## Requirements

- Codex CLI installed and authenticated.
- Node.js available on `PATH`.
- Local access to `codex app-server`.

## Install

### One-step install

Paste this directly into Codex:

```text
$skill-installer https://github.com/zatoichi68/codex-pace
```

Restart Codex if the skill does not appear immediately.

On each invocation, Codex Pace compares its local `VERSION` file with the published version. It only reports whether an update exists; it never downloads or installs code without approval.

### Manual fallback

To install with Git instead:

```bash
mkdir -p "$HOME/.agents/skills"
git clone https://github.com/zatoichi68/codex-pace.git "$HOME/.agents/skills/codex-pace"
```

## Use

Invoke the skill explicitly:

```text
$codex-pace check my current usage pace
```

French example:

```text
$codex-pace vérifie mon rythme d’utilisation
```

Codex may also activate the skill automatically when a request concerns weekly usage pace, projected exhaustion, slowdown recommendations, reset credits, or the Codex Pace dashboard.

## Dashboard

The companion dashboard is included in the skill. It needs no `npm install` and no separate workspace:

```bash
node scripts/open_dashboard.mjs --open
```

It starts locally on the first free port from `3000` through `3010`, opens the browser, and refreshes live account data once per minute.

## Privacy and safety

- Account data stays local.
- The inspection script calls only `account/rateLimits/read` and `account/usage/read`.
- Authentication tokens are never requested, returned, logged, or persisted.
- Reset credits are never consumed during analysis.
- Any reset-credit consumption requires an explicit user request and confirmation.

## Repository contents

```text
codex-pace/
├── assets/dashboard/
├── README.md
├── SKILL.md
├── VERSION
├── agents/openai.yaml
├── references/protocol-and-pace.md
└── scripts/
    ├── check_for_updates.mjs
    ├── inspect_codex_usage.mjs
    └── open_dashboard.mjs
```

See the [Codex skills documentation](https://learn.chatgpt.com/docs/build-skills) for more information about skill discovery and invocation.
