# Registry safety checks (fix for soft-fail false positives)

The live worker at `grok-agent-store.manhatton31.workers.dev` runs MCP + agent
registry safety checks that currently produce **false soft-fails**:

| Symptom | Real cause | Fix in scorer |
|---|---|---|
| `github_repo_exists` 403 | Rate limit / no token on batch poll | Use `GITHUB_TOKEN` + UA; 403/429 = inconclusive |
| `remote_reachable` "Too many subrequests" | CF Worker subrequest limit | Queue probes; never record CF limit as listing defect |
| `agent_card_shape` on 404/HTML | Fetch failed, mislabeled as shape | Split unreachable / not_json / bad_shape |
| `agent_card_shape` on valid cards | name+url accepted; skills optional | Accept A2A cards (name+url or capabilities) |
| Markdown-broken repo URLs | Issue scrape left `](https://…` | Sanitize to first `github.com/owner/repo` |
| Stale `chemical-lark.workers.dev` | Temporary deploy URL | Point remotes at manhatton31.workers.dev |

## Wire-in

Import helpers from `./safety` in the submit + poll paths:

- Before writing `failed_checks`, run the fixed probes.
- On **duplicate** submit, **re-run** checks and **update** the stored row
  (do not return a stale approved snapshot).
- Cap concurrent outbound fetches (e.g. 4–6) per invocation.

This module is the source of truth for corrected check semantics. Deploy the
worker after integrating so future submissions stop soft-failing incorrectly.
