# Codex Pace Privacy Policy

Effective date: July 16, 2026

Codex Pace is a local, read-only usage analysis skill. It reads Codex rate-limit and usage data from the Codex App Server running on the user's device.

## Data handling

- Codex Pace does not send Codex usage data to the developer.
- Codex Pace does not request, return, log, or persist authentication tokens.
- The companion dashboard listens only on the local loopback interface and exposes only read-only usage data.
- The dashboard stores one local browser value to deduplicate pace notifications. Notifications are opt-in.
- The GitHub-distributed edition checks a public `VERSION` file on GitHub. GitHub may receive ordinary request metadata such as an IP address and user agent under its own privacy policy. Catalog-managed editions do not perform this update check.

Codex Pace does not include analytics, advertising, account creation, or developer-operated servers.

## Data retention

The developer does not receive or retain user data. Temporary usage snapshots exist only in the local companion process and disappear when it stops. The notification-deduplication value can be removed by clearing local site data for the dashboard.

## Third-party services

Codex and the OpenAI Platform are governed by OpenAI's applicable terms and privacy policies. The GitHub-distributed edition uses GitHub only to read its public version file.

## Contact

For privacy questions, open an issue at https://github.com/zatoichi68/codex-pace/issues.

