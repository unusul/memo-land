# memo-land

Multi-platform collaborative memos, tasks and calendars for small groups (up to ~10 people).

An activity starts as a quick draft and changes shape as you add properties: a due date makes it a task,
a schedule an event, a repeat rule a recurring item, a "waiting for" condition a blocked memo.
Group members assign work to each other, accept or reject it with a reason, and cover single occurrences
of a recurring series without taking over the series.

Data lives in a per-group **engine** chosen by whoever opens the group: a Google engine (Firestore in the
group owner's free Firebase project, decentralised) or a central Supabase engine (always used for email-domain
groups). The app talks to every engine through one interface, so engines can be added without rewriting the app.

## Status

| Part | State |
|---|---|
| `packages/core`: domain model, recurrences, groups and roles, agenda, lists, engine interface, in-memory engine | done |
| `packages/engine-central` + `supabase/`: central engine with row-level security and SQL tests | done |
| `packages/engine-google` + `firebase/`: Firestore engine with security rules | done |
| `apps/web`: installable PWA on several engines (agenda, drafts, lists, offline capture) | done, runs locally |
| Notifications and timers, multi-account, Claude connector and iCal, hosted release | planned |

Design: [`docs/superpowers/specs/2026-11-03-app-attivita-design.md`](docs/superpowers/specs/2026-11-03-app-attivita-design.md) (Italian).
Plans: [`docs/superpowers/plans/`](docs/superpowers/plans/).

## Development

Requires Node 18 or later.

```bash
npm install
npm test
npm run typecheck -w @attivita/core
```

### Local data

The central engine runs on a local Supabase (`npm run db -- start`, then `bash scripts/db-env.sh` for the keys).

- `npm test -w @attivita/engine-central` **wipes the local database** (tables and users) before every test, so each
  run starts empty. Whatever was created by hand in the app is lost.
- `npm run seed` puts sample data back: the account `lulli@lulli.com` with a dozen activities around today
  (overdue, today, series, a shopping list, ideas). Sign in with that email; the link arrives in the local mailbox.
  `npm run seed -- --reset` replaces that account's activities.

