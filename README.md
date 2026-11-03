# memo-land

Multi-platform collaborative memos, tasks and calendars for small groups (up to ~10 people).

An activity starts as a quick draft and changes shape as you add properties: a due date makes it a task,
a schedule an event, a repeat rule a recurring item, a "waiting for" condition a blocked memo.
Group members assign work to each other, accept or reject it with a reason, and cover single occurrences
of a recurring series without taking over the series.

Data lives in a per-group **engine** chosen by whoever opens the group: a Google engine (Drive/Sheets +
Apps Script, decentralised) or a central Supabase engine (always used for email-domain groups). The app
talks to every engine through one interface, so engines can be added without rewriting the app.

## Status

| Part | State |
|---|---|
| `packages/core`: domain model, recurrences, groups and roles, agenda, engine interface, in-memory engine | done, 67 tests |
| Central engine (Supabase) and PWA | next |
| Google engine, notifications, multi-account, Claude connector and iCal | planned |

Design: [`docs/superpowers/specs/2026-11-03-app-attivita-design.md`](docs/superpowers/specs/2026-11-03-app-attivita-design.md) (Italian).
Plan for the core: [`docs/superpowers/plans/2026-11-03-fondamenta.md`](docs/superpowers/plans/2026-11-03-fondamenta.md).

## Development

Requires Node 18 or later.

```bash
npm install
npm test
npm run typecheck -w @attivita/core
```
