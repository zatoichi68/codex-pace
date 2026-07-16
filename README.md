# Codex Pace

Codex Pace is a local Codex skill that measures weekly usage pace, predicts when the allowance will be exhausted, and recommends when to use available reset credits.

It reads the current account limits from the local Codex App Server instead of assuming a fixed plan allowance.

## Features

- Reports weekly usage and elapsed-window percentages.
- Calculates pace relative to a sustainable `1.00x` rate.
- Predicts the date and time the limit will be reached.
- Recommends a slowdown when usage is too fast.
- Reads available reset credits and calculates ideal and latest-use times.
- Offers to display an optional local dashboard after each report.
- Diagnoses dashboard bridge, reset-window, notification, SSR, and hydration issues.

## Requirements

- Codex CLI installed and authenticated.
- Node.js available on `PATH`.
- Local access to `codex app-server`.

## Install

### Personal skill

Install the skill for your user account:

```bash
mkdir -p "$HOME/.agents/skills"
git clone https://github.com/zatoichi68/codex-pace.git "$HOME/.agents/skills/codex-pace"
```

### Repository-scoped skill

Install it only for one repository:

```bash
mkdir -p .agents/skills
git clone https://github.com/zatoichi68/codex-pace.git .agents/skills/codex-pace
```

Codex detects skill changes automatically. Restart Codex if the skill does not appear.

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

The dashboard application is optional and is not included in this repository. After a successful usage report, the skill asks whether to display it.

Set `CODEX_PACE_WORKSPACE` to the dashboard project directory when it is not the current workspace:

```bash
export CODEX_PACE_WORKSPACE="/path/to/codex-pace-dashboard"
```

## Privacy and safety

- Account data stays local.
- The inspection script calls only `account/rateLimits/read` and `account/usage/read`.
- Authentication tokens are never requested, returned, logged, or persisted.
- Reset credits are never consumed during analysis.
- Any reset-credit consumption requires an explicit user request and confirmation.

## Repository contents

```text
codex-pace/
├── README.md
├── SKILL.md
├── agents/openai.yaml
├── references/protocol-and-pace.md
└── scripts/inspect_codex_usage.mjs
```

See the [Codex skills documentation](https://learn.chatgpt.com/docs/build-skills) for more information about skill discovery and invocation.
