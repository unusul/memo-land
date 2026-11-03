# Fondamenta (modello attività + interfaccia motore) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una libreria TypeScript pura (`@attivita/core`) con il modello dell'attività a proprietà, le regole di gruppi e ruoli, le ricorrenze nei due modi, l'interfaccia unica verso i motori, un motore in memoria e una suite di test di contratto riusabile dai motori futuri.

**Architecture:** Funzioni pure e immutabili. Ogni operazione prende un'`Activity`, l'attore e l'istante `now`, e restituisce una nuova `Activity` con una voce di storico in più; le violazioni lanciano `DomainError`. Il motore è un'interfaccia asincrona (`Engine`). `InMemoryEngine` la implementa per i test, e `engineContract()` è la suite che ogni motore futuro (Supabase, Google) dovrà superare: è questo che garantisce che cambiare motore non obblighi a riscrivere l'app.

**Tech Stack:** TypeScript 5 (strict, ESM), Vitest, `rrule` (ricorrenze RFC 5545), npm workspaces.

**Spec:** `docs/superpowers/specs/2026-11-03-app-attivita-design.md`, in particolare §6 (interfaccia motore), §7 (gruppi e ruoli), §8 (attività) e §12 (limiti in configurazione).

## Global Constraints

- Codice, identificatori, commenti e messaggi di errore in inglese.
- Dipendenze ammesse in questo piano: `typescript`, `vitest`, `rrule`. **Nessun'altra senza approvazione esplicita dell'utente.**
- Nessuna dipendenza da browser, Supabase o Google in `packages/core`: deve girare in Node e nel browser.
- Date e ore come **ora locale "flottante"** (`LocalDateTime` = `"YYYY-MM-DDTHH:mm"`, `LocalDate` = `"YYYY-MM-DD"`), interpretata nel fuso del gruppo. Le ricorrenze si calcolano in ora locale, così l'ora legale non sposta gli eventi. Gli istanti di sistema (`now`, storico) sono stringhe ISO UTC (`Instant`).
- I limiti dei motori (intervallo dei controlli, quote, dimensione degli allegati, riduzione delle immagini, intervallo di aggiornamento) sono **valori di configurazione** (`EngineLimits`), mai costanti sparse nel codice.
- Funzioni immutabili: nessuna operazione modifica l'oggetto ricevuto.
- Git: **nessun commit né push automatico**. Ogni passo "Commit" vuol dire: proporre all'utente i file e il messaggio (Conventional Commits), e committare solo dopo il suo via esplicito.
- Dati di prova condivisi in `packages/core/test/fixtures.ts`, che cresce task dopo task: `t1`, `t2` (istanti), `base`/`draft` (bozza `a1` di `u1`), `task` (in `g1`, con `due`), `movedIdea`, `series`/`seriesForPippo` (Task 5), `monthly`, `costTask` (`due: '2026-11-06'`), `waitingMemo`, `domainGroup` (altereos.com, membri `pippo`, `pluto`), `inviteGroup` (owner `u1`, member `u3`, guest `guest1`).

## Review Focus

1. **Ora legale**: un evento settimanale alle 09:00 deve restare alle 09:00 locali prima e dopo il cambio d'ora (ultima domenica di ottobre). → test in Task 5.
2. **Fine mese con "dal completamento"**: completata il 31 gennaio con "ogni mese", la prossima scade il 28 (o 29) febbraio, non il 3 marzo. → test in Task 6.
3. **Motivo di rifiuto fatto solo di spazi**: va trattato come vuoto e rifiutato. → test in Task 3.
4. **Membro che esce con una serie ricorrente assegnata e sostituzioni future**: la serie torna non assegnata, e cadono anche le sostituzioni a suo nome. → test in Task 7.
5. **Due membri che salvano la stessa attività partendo dalla stessa versione**: il secondo salvataggio fallisce con un conflitto, non sovrascrive in silenzio. → test in Task 8 (contratto).

---

### Task 1: Repository, pacchetto `core` e tipi del dominio

**Files:**
- Create: `package.json` (workspaces `["packages/*"]`, script `test` = `npm test -w @attivita/core`)
- Create: `tsconfig.base.json` (strict, `module`/`moduleResolution` `NodeNext`, `target` ES2022)
- Create: `.gitignore` (`node_modules/`, `dist/`, `.superpowers/`)
- Create: `packages/core/package.json` (name `@attivita/core`, `type: module`, script `test` = `vitest run`)
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/errors.ts`
- Create: `packages/core/src/shape.ts`
- Create: `packages/core/src/index.ts` (riesporta tutto)
- Test: `packages/core/test/shape.test.ts`

**Interfaces:**
- Produces (in `types.ts`):
  ```ts
  type Instant = string; type LocalDate = string; type LocalDateTime = string;
  type AccountId = string; type GroupId = string; type ActivityId = string;
  type OccurrenceKey = LocalDateTime | LocalDate; // the occurrence's original start/due
  type Unit = 'day' | 'week' | 'month' | 'year';
  type Repeat =
    | { mode: 'calendar'; rrule: string }               // RRULE body without DTSTART, e.g. "FREQ=WEEKLY;BYDAY=TU,TH"
    | { mode: 'fromCompletion'; every: { unit: Unit; count: number } };
  type Assignment = { state: 'proposed' | 'accepted'; assignee: AccountId; assignedBy: AccountId };
  type WaitingFor = { condition: string; metAt?: Instant; metBy?: AccountId };
  interface Props {
    due?: LocalDate | LocalDateTime;
    schedule?: { start: LocalDateTime; end?: LocalDateTime };
    repeat?: Repeat;
    assignment?: Assignment;
    waitingFor?: WaitingFor;
    resumeAt?: LocalDate | LocalDateTime;
    parentId?: ActivityId;
  }
  type PropKey = keyof Props;
  interface OccurrenceOverride { assignee: AccountId; takenBy: AccountId }
  type HistoryKind = 'created' | 'propSet' | 'propRemoved' | 'assigned' | 'accepted' | 'rejected'
    | 'claimed' | 'conditionMet' | 'completed' | 'occurrenceTaken' | 'unassignedOnLeave'
    | 'snoozed' | 'resumed' | 'archived' | 'movedToGroup' | 'decomposed';
  interface HistoryEntry { at: Instant; by: AccountId; kind: HistoryKind; detail?: Record<string, unknown> }
  interface AttachmentRef { id: string; name: string; mimeType: string; size: number }
  type Status = 'open' | 'done' | 'archived';
  interface Activity {
    id: ActivityId; accountId: AccountId; groupId: GroupId | null; // null = draft
    title: string; body: string; attachments: AttachmentRef[];
    props: Props; status: Status;
    lastCompletedAt?: LocalDate | LocalDateTime;              // for fromCompletion
    overrides: Record<OccurrenceKey, OccurrenceOverride>;
    history: HistoryEntry[]; createdAt: Instant; updatedAt: Instant; version: number;
  }
  type Shape = 'draft' | 'idea' | 'waiting' | 'snoozed' | 'recurring' | 'event' | 'task' | 'archived' | 'done';
  ```
- Produces (in `errors.ts`): `class DomainError extends Error { constructor(public code: DomainErrorCode, message: string) }` with `type DomainErrorCode = 'REASON_REQUIRED' | 'FORBIDDEN' | 'INVALID_STATE' | 'NOT_FOUND' | 'VERSION_CONFLICT' | 'INVALID_INPUT'`.
- Produces (in `shape.ts`): `newActivity(input: { id: ActivityId; accountId: AccountId; title: string; body?: string; attachments?: AttachmentRef[]; groupId?: GroupId | null }, now: Instant): Activity` (version 1, history `[created]`, `groupId` default `null`); `shapeOf(a: Activity, personalGroupId: GroupId): Shape`.

- [ ] **Step 1: Initialize the repo** — `git init` in `F:\Work\Claude\APP-ATTIVITA`, create the files above, then `npm install -D typescript vitest` and `npm install rrule -w @attivita/core`.

- [ ] **Step 2: Write the failing test** `packages/core/test/shape.test.ts`. `shapeOf` precedence, first match wins: `archived` (status) → `done` (status) → `draft` (groupId null) → `snoozed` (resumeAt) → `waiting` (waitingFor without metAt) → `recurring` (repeat) → `event` (schedule) → `task` (due or assignment) → `idea` (in any group, no props).

```ts
const now = '2026-11-03T08:00:00Z';
const base = newActivity({ id: 'a1', accountId: 'u1', title: 'app gestione core' }, now);
test('testNewActivityIsDraftVersion1', () => {
  expect(shapeOf(base, 'p1')).toBe('draft');
  expect(base.version).toBe(1);
  expect(base.history).toEqual([{ at: now, by: 'u1', kind: 'created' }]);
});
test('testShapePrecedence', () => {
  const g = { ...base, groupId: 'g1' };
  expect(shapeOf(g, 'p1')).toBe('idea');
  expect(shapeOf({ ...g, props: { due: '2026-11-10' } }, 'p1')).toBe('task');
  expect(shapeOf({ ...g, props: { due: '2026-11-10', repeat: { mode: 'calendar', rrule: 'FREQ=MONTHLY' } } }, 'p1')).toBe('recurring');
  expect(shapeOf({ ...g, props: { repeat: { mode: 'calendar', rrule: 'FREQ=DAILY' }, waitingFor: { condition: 'ops 412 closed' } } }, 'p1')).toBe('waiting');
  expect(shapeOf({ ...g, props: { waitingFor: { condition: 'x', metAt: now, metBy: 'u2' } } }, 'p1')).toBe('idea');
  expect(shapeOf({ ...g, status: 'archived', props: { due: '2026-11-10' } }, 'p1')).toBe('archived');
});
```

- [ ] **Step 3: Run** `npm test` — Expected: FAIL (module not found).
- [ ] **Step 4: Implement** `types.ts`, `errors.ts`, `shape.ts`, `index.ts` as in Interfaces.
- [ ] **Step 5: Run** `npm test` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(core): domain types, activity factory and shape`

---

### Task 2: Proprietà e storico

**Files:**
- Create: `packages/core/src/props.ts`
- Test: `packages/core/test/props.test.ts`

**Interfaces:**
- Consumes: `Activity`, `Props`, `PropKey`, `HistoryEntry`, `DomainError` (Task 1).
- Produces:
  - `setProp<K extends PropKey>(a: Activity, key: K, value: NonNullable<Props[K]>, by: AccountId, now: Instant): Activity`
  - `removeProp(a: Activity, key: PropKey, by: AccountId, now: Instant): Activity`
  - `touch(a: Activity, entry: Omit<HistoryEntry, 'at' | 'by'>, by: AccountId, now: Instant): Activity`, the internal helper every operation uses: appends history, sets `updatedAt`, and **does not** change `version`. The version is bumped only by the engine on save.

- [ ] **Step 1: Write the failing tests**

```ts
test('testSetPropAddsHistoryAndDoesNotMutate', () => {
  const b = setProp(base, 'due', '2026-11-10', 'u1', t1);
  expect(b.props.due).toBe('2026-11-10');
  expect(base.props.due).toBeUndefined();
  expect(b.history.at(-1)).toEqual({ at: t1, by: 'u1', kind: 'propSet', detail: { key: 'due', value: '2026-11-10' } });
  expect(b.updatedAt).toBe(t1);
});
test('testRemovePropRestoresPreviousShape', () => {
  const g = { ...base, groupId: 'g1' };
  const r = removeProp(setProp(g, 'due', '2026-11-10', 'u1', t1), 'due', 'u1', t2);
  expect(shapeOf(r, 'p1')).toBe('idea');
  expect(r.history.at(-1)?.kind).toBe('propRemoved');
});
test('testSetPropRejectsAssignmentAndParentViaGenericSetter', () => {
  expect(() => setProp(base, 'assignment', { state: 'accepted', assignee: 'u2', assignedBy: 'u1' }, 'u1', t1))
    .toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
});
test('testScheduleEndBeforeStartRejected', () => {
  expect(() => setProp(base, 'schedule', { start: '2026-11-10T10:00', end: '2026-11-10T09:00' }, 'u1', t1))
    .toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
});
```

- [ ] **Step 2: Run** `npm test -- props` — Expected: FAIL.
- [ ] **Step 3: Implement** `props.ts`. `assignment` and `parentId` go only through their dedicated operations (Task 3 and Task 4), so the generic setter refuses them with `INVALID_INPUT`. It also validates `schedule.end >= start` and `every.count >= 1`.
- [ ] **Step 4: Run** `npm test -- props` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): property set/remove with history`

---

### Task 3: Assegnazione: proporre, accettare, rifiutare, prendere

**Files:**
- Create: `packages/core/src/assignment.ts`
- Test: `packages/core/test/assignment.test.ts`

**Interfaces:**
- Consumes: `touch` (Task 2); `Role` and `can` (Task 7). Until Task 7 lands, these functions accept the actor's role as a parameter, with type `Role = 'owner' | 'member' | 'guest'` declared in `types.ts`.
- Produces:
  - `assign(a, assignee: AccountId, by: AccountId, byRole: Role, now): Activity`: sets `{ state: 'proposed' }`. Guests → `FORBIDDEN`. Self-assignment goes straight to `accepted`.
  - `accept(a, by, now): Activity`: only the proposed assignee, else `FORBIDDEN`; only when state is `proposed`, else `INVALID_STATE`.
  - `reject(a, by, reason: string, now): Activity`: only the proposed or accepted assignee. `reason.trim()` must not be empty, else `REASON_REQUIRED`. Removes `assignment`. History `rejected` with `{ reason, assignedBy }`.
  - `claim(a, by, byRole, now): Activity`: only when unassigned (`INVALID_STATE` otherwise). Guests → `FORBIDDEN`. Result is `accepted`, assignedBy = by.

- [ ] **Step 1: Write the failing tests**

```ts
test('testRejectReturnsActivityToGroupWithReason', () => {
  const p = assign(task, 'u2', 'u1', 'member', t1);
  const r = reject(p, 'u2', 'no time this week', t2);
  expect(r.props.assignment).toBeUndefined();
  expect(r.history.at(-1)).toMatchObject({ kind: 'rejected', by: 'u2', detail: { reason: 'no time this week', assignedBy: 'u1' } });
});
test('testRejectWithBlankReasonFails', () => {
  const p = assign(task, 'u2', 'u1', 'member', t1);
  expect(() => reject(p, 'u2', '   ', t2)).toThrow(expect.objectContaining({ code: 'REASON_REQUIRED' }));
});
test('testOnlyAssigneeCanAccept', () => {
  const p = assign(task, 'u2', 'u1', 'member', t1);
  expect(() => accept(p, 'u3', t2)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(accept(p, 'u2', t2).props.assignment?.state).toBe('accepted');
});
test('testGuestCannotAssignOrClaim', () => {
  expect(() => assign(task, 'u2', 'g9', 'guest', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(() => claim(task, 'g9', 'guest', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
});
test('testClaimFreeActivity', () => {
  expect(claim(task, 'u3', 'member', t1).props.assignment).toEqual({ state: 'accepted', assignee: 'u3', assignedBy: 'u3' });
});
```

- [ ] **Step 2: Run** `npm test -- assignment` — Expected: FAIL.
- [ ] **Step 3: Implement** `assignment.ts`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): assignment propose/accept/reject/claim`

---

### Task 4: Bozze e memo: smistare, scomporre, rimandare, archiviare, sbloccare

**Files:**
- Create: `packages/core/src/triage.ts`
- Test: `packages/core/test/triage.test.ts`

**Interfaces:**
- Consumes: `newActivity`, `touch`, `setProp`.
- Produces:
  - `moveToGroup(a, groupId: GroupId, by, now): Activity`: only from a draft, else `INVALID_STATE`. History `movedToGroup`.
  - `keepAsIdea(a, personalGroupId: GroupId, by, now): Activity`, which is `moveToGroup` to the personal group.
  - `archive(a, by, now): Activity`: status `archived`.
  - `snooze(a, until: LocalDate | LocalDateTime, by, now): Activity`: sets `resumeAt`.
  - `resumeIfDue(a, today: LocalDateTime, now): Activity`: if `resumeAt <= today`, removes `resumeAt` (history `resumed`, by `'system'`); otherwise returns `a` unchanged (same reference).
  - `decompose(parent: Activity, children: Array<{ id: ActivityId; title: string; groupId: GroupId; props?: Props }>, by, now): { parent: Activity; children: Activity[] }`: children get `parentId = parent.id` and `accountId = parent.accountId`; the parent gets the history entry `decomposed` with the children's ids.
  - `markConditionMet(a, by, byRole, now): Activity`: any role except guest. Sets `waitingFor.metAt/metBy`, history `conditionMet`. If already met → `INVALID_STATE`.

- [ ] **Step 1: Write the failing tests**

```ts
test('testDecomposeLinksChildrenToParent', () => {
  const { parent, children } = decompose(draft, [
    { id: 'c1', title: 'kickoff meeting', groupId: 'g1', props: { schedule: { start: '2026-11-05T10:00' } } },
    { id: 'c2', title: 'progress review', groupId: 'g1', props: { repeat: { mode: 'calendar', rrule: 'FREQ=MONTHLY;BYMONTHDAY=1,15' } } },
    { id: 'c3', title: 'cost analysis', groupId: 'g1', props: { due: '2026-11-20' } },
  ], 'u1', t1);
  expect(children.map(c => c.props.parentId)).toEqual(['a1', 'a1', 'a1']);
  expect(children.map(c => shapeOf(c, 'p1'))).toEqual(['event', 'recurring', 'task']);
  expect(parent.history.at(-1)).toMatchObject({ kind: 'decomposed', detail: { children: ['c1', 'c2', 'c3'] } });
});
test('testSnoozeThenResume', () => {
  const s = snooze(movedIdea, '2026-12-03', 'u1', t1);
  expect(shapeOf(s, 'p1')).toBe('snoozed');
  expect(resumeIfDue(s, '2026-12-02T23:59', t2)).toBe(s);
  expect(shapeOf(resumeIfDue(s, '2026-12-03T00:00', t2), 'p1')).toBe('idea');
});
test('testAnyMemberUnblocksWaitingMemo', () => {
  const w = setProp(task, 'waitingFor', { condition: 'ops 412 closed' }, 'u1', t1);
  const m = markConditionMet(w, 'u3', 'member', t2);
  expect(shapeOf(m, 'p1')).toBe('task');
  expect(() => markConditionMet(m, 'u2', 'member', t2)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
});
test('testMoveToGroupOnlyFromDraft', () => {
  expect(() => moveToGroup(task, 'g2', 'u1', t1)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
});
```

- [ ] **Step 2: Run** `npm test -- triage` — Expected: FAIL.
- [ ] **Step 3: Implement** `triage.ts`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): draft triage, decomposition, snooze and waiting memos`

---

### Task 5: Ricorrenze a calendario e sostituzioni per occorrenza

**Files:**
- Create: `packages/core/src/occurrences.ts`
- Test: `packages/core/test/occurrences.test.ts`

**Interfaces:**
- Consumes: `Activity`, `Repeat`, `OccurrenceOverride`, `touch`.
- Produces:
  - `interface Occurrence { activityId: ActivityId; key: OccurrenceKey; start: LocalDateTime | LocalDate; end?: LocalDateTime; assignee?: AccountId; coveredFor?: AccountId }`
  - `occurrencesBetween(a: Activity, from: LocalDateTime, to: LocalDateTime): Occurrence[]`: for a non-recurring activity, 0 or 1 occurrence (`schedule.start`, or else `due`). For `calendar`, the occurrences of the `rrule` anchored at `schedule.start ?? due`, in floating local time. The `assignee` of an occurrence is `overrides[key]?.assignee ?? props.assignment?.assignee`; `coveredFor` is set when an override replaces the series assignee.
  - `takeOccurrence(a, key: OccurrenceKey, by: AccountId, byRole: Role, now): Activity`: adds `overrides[key] = { assignee: by, takenBy: by }`. Guests → `FORBIDDEN`. A key that is not an occurrence of the series → `INVALID_INPUT`.
- Approach: use `RRule.fromString` with `DTSTART` built from the local values as if they were UTC (floating), then convert back to `LocalDateTime` by reading the UTC fields. This is what makes the times stable across DST.

- [ ] **Step 1: Write the failing tests**

```ts
const series = { ...task, props: {
  schedule: { start: '2026-10-20T09:00', end: '2026-10-20T09:30' },
  repeat: { mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH' } as const,
  assignment: { state: 'accepted', assignee: 'pippo', assignedBy: 'u1' } as const } };
test('testWeeklyTwiceStaysAt0900AcrossDst', () => {
  const occ = occurrencesBetween(series, '2026-10-20T00:00', '2026-11-01T00:00');
  expect(occ.map(o => o.start)).toEqual(['2026-10-20T09:00', '2026-10-22T09:00', '2026-10-27T09:00', '2026-10-29T09:00']);
});
test('testPlutoCoversOneWeekSeriesStaysPippo', () => {
  let s = takeOccurrence(series, '2026-10-27T09:00', 'pluto', 'member', t1);
  s = takeOccurrence(s, '2026-10-29T09:00', 'pluto', 'member', t1);
  const occ = occurrencesBetween(s, '2026-10-20T00:00', '2026-11-06T00:00');
  expect(occ.map(o => [o.start.slice(5, 10), o.assignee, o.coveredFor])).toEqual([
    ['10-20', 'pippo', undefined], ['10-22', 'pippo', undefined],
    ['10-27', 'pluto', 'pippo'], ['10-29', 'pluto', 'pippo'],
    ['11-03', 'pippo', undefined], ['11-05', 'pippo', undefined]]);
  expect(s.props.assignment?.assignee).toBe('pippo');
});
test('testTakeOccurrenceRejectsNonOccurrence', () => {
  expect(() => takeOccurrence(series, '2026-10-21T09:00', 'pluto', 'member', t1)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
});
test('testTwiceAMonthOn1stAnd15th', () => {
  const m = { ...task, props: { due: '2026-11-01', repeat: { mode: 'calendar', rrule: 'FREQ=MONTHLY;BYMONTHDAY=1,15' } as const } };
  expect(occurrencesBetween(m, '2026-11-01T00:00', '2026-12-31T23:59').map(o => o.start))
    .toEqual(['2026-11-01', '2026-11-15', '2026-12-01', '2026-12-15']);
});
```

- [ ] **Step 2: Run** `npm test -- occurrences` — Expected: FAIL.
- [ ] **Step 3: Implement** `occurrences.ts`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): calendar recurrences with per-occurrence cover`

---

### Task 6: Completamento e ricorrenza "dal completamento"

**Files:**
- Create: `packages/core/src/completion.ts`
- Modify: `packages/core/src/occurrences.ts` (branch for `fromCompletion`)
- Test: `packages/core/test/completion.test.ts`

**Interfaces:**
- Consumes: `occurrencesBetween`, `touch`.
- Produces:
  - `complete(a, by, doneOn: LocalDate | LocalDateTime, now): Activity`: non-recurring → status `done`. `fromCompletion` → stays `open` and sets `lastCompletedAt = doneOn`. `calendar` → stays `open` (the occurrence counts as done) and records `completed` with `{ key }` in the history, using the first occurrence not yet done whose start is ≤ `doneOn`.
  - `nextDue(a: Activity): LocalDate | LocalDateTime | undefined`: for `fromCompletion` = `lastCompletedAt + every`, or `due`/`schedule.start` if never completed. Adding months clamps to the end of the month.
  - In `occurrencesBetween`, `fromCompletion` produces **only** the next occurrence (`nextDue`) if it falls in the range.

- [ ] **Step 1: Write the failing tests**

```ts
const monthly = { ...task, props: { due: '2026-11-01', repeat: { mode: 'fromCompletion', every: { unit: 'month', count: 1 } } as const } };
test('testLateCompletionRestartsFromDoneDate', () => {
  const c = complete(monthly, 'u1', '2026-11-10', t1);
  expect(c.status).toBe('open');
  expect(nextDue(c)).toBe('2026-12-10');
});
test('testMonthEndClamps', () => {
  expect(nextDue(complete(monthly, 'u1', '2027-01-31', t1))).toBe('2027-02-28');
  expect(nextDue(complete(monthly, 'u1', '2028-01-31', t1))).toBe('2028-02-29');
});
test('testNonRecurringCompleteIsDone', () => {
  expect(complete(task, 'u1', '2026-11-04', t1).status).toBe('done');
});
test('testFromCompletionShowsOnlyNextOccurrence', () => {
  const c = complete(monthly, 'u1', '2026-11-10', t1);
  expect(occurrencesBetween(c, '2026-11-01T00:00', '2027-03-01T00:00').map(o => o.start)).toEqual(['2026-12-10']);
});
```

- [ ] **Step 2: Run** `npm test -- completion` — Expected: FAIL.
- [ ] **Step 3: Implement** `completion.ts` and the `fromCompletion` branch.
- [ ] **Step 4: Run** `npm test` (all) — Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): completion and from-completion recurrences`

---

### Task 7: Gruppi, ruoli, domini e uscita dal gruppo

**Files:**
- Create: `packages/core/src/groups.ts`
- Create: `packages/core/src/public-domains.ts` (exports `DEFAULT_PUBLIC_DOMAINS: readonly string[]`, at least: gmail.com, googlemail.com, outlook.com, hotmail.com, live.com, msn.com, yahoo.com, yahoo.it, icloud.com, me.com, libero.it, virgilio.it, tiscali.it, proton.me, protonmail.com)
- Modify: `packages/core/src/assignment.ts`, `triage.ts`, `occurrences.ts` (replace the bare role checks with `can`)
- Test: `packages/core/test/groups.test.ts`

**Interfaces:**
- Produces:
  - `type GroupKind = 'personal' | 'domain' | 'invite'`
  - `interface Group { id: GroupId; kind: GroupKind; name: string; domain?: string; ownerId?: AccountId; timeZone: string; members: Record<AccountId, Role> }` (domain groups: no `ownerId`, every member is `'member'`)
  - `type Action = 'deleteGroup' | 'transferOwnership' | 'invite' | 'removeMember' | 'editActivity' | 'assign' | 'claim' | 'takeOccurrence' | 'markConditionMet' | 'comment' | 'respondToOwnAssignment' | 'completeOwn'`
  - `can(group: Group, actor: AccountId, action: Action): boolean`
  - `domainOf(email: string): string` (lowercase, the part after `@`)
  - `domainGroupNameFor(email: string, publicDomains?: readonly string[]): string | null` (`null` for public domains)
  - `addMember(group, account: AccountId, role: Role, by: AccountId): Group`: domain groups accept only `role === 'member'` and only `by === account` (self-join); otherwise `FORBIDDEN`.
  - `leaveGroup(group: Group, account: AccountId, activities: Activity[], reason: string, now): { group: Group; changed: Activity[] }`: removes the member. For every activity where they are series assignee, proposed or accepted: removes `assignment` with the history entry `unassignedOnLeave` and `{ reason }`. Also removes their overrides. `changed` contains only the modified activities. The personal group cannot be left (`FORBIDDEN`).
  - `removeMember(group, target, by, ...)`: in a domain group always `FORBIDDEN`. In an invite group, owner or member may remove, guests may not.
- Permission matrix to encode in `can`:

| Action | personal (owner) | domain member | invite owner | invite member | invite guest |
|---|---|---|---|---|---|
| deleteGroup | no | no | yes | no | no |
| transferOwnership | no | no | yes | no | no |
| invite | no | no (domain join is automatic) | yes | yes | no |
| removeMember | no | no | yes | yes | no |
| editActivity / assign / claim / takeOccurrence / markConditionMet | yes | yes | yes | yes | no |
| comment / respondToOwnAssignment / completeOwn | yes | yes | yes | yes | yes |

- [ ] **Step 1: Write the failing tests**

```ts
test('testPublicDomainHasNoDomainGroup', () => {
  expect(domainGroupNameFor('Pluto@Gmail.com')).toBeNull();
  expect(domainGroupNameFor('pippo@altereos.com')).toBe('altereos.com');
});
test('testDomainGroupNobodyRemovesNobody', () => {
  const g = { id: 'd1', kind: 'domain', name: 'altereos.com', domain: 'altereos.com', timeZone: 'Europe/Rome', members: { pippo: 'member', pluto: 'member' } } as const;
  expect(can(g, 'pippo', 'removeMember')).toBe(false);
  expect(can(g, 'pippo', 'deleteGroup')).toBe(false);
  expect(() => addMember(g, 'ext', 'guest', 'pippo')).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
});
test('testInviteGuestCanOnlyRespondAndComplete', () => {
  expect(can(inviteGroup, 'guest1', 'assign')).toBe(false);
  expect(can(inviteGroup, 'guest1', 'respondToOwnAssignment')).toBe(true);
});
test('testLeaveUnassignsSeriesAndDropsOverrides', () => {
  const s = takeOccurrence(seriesForPippo, '2026-10-27T09:00', 'pluto', 'member', t1);
  const { group, changed } = leaveGroup(domainGroup, 'pluto', [s, unrelated], 'left the company', t2);
  expect(group.members.pluto).toBeUndefined();
  expect(changed).toHaveLength(1);
  expect(changed[0].overrides).toEqual({});
  const l = leaveGroup(domainGroup, 'pippo', [seriesForPippo], 'left the company', t2);
  expect(l.changed[0].props.assignment).toBeUndefined();
  expect(l.changed[0].history.at(-1)).toMatchObject({ kind: 'unassignedOnLeave', detail: { reason: 'left the company' } });
});
```

- [ ] **Step 2: Run** `npm test -- groups` — Expected: FAIL.
- [ ] **Step 3: Implement** `groups.ts`, `public-domains.ts`. Change the signatures from Tasks 3–5 so they take `group: Group` instead of `byRole: Role`, and update those tests.
- [ ] **Step 4: Run** `npm test` (all) — Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): groups, roles, domain rules and leaving`

---

### Task 8: Interfaccia motore, suite di contratto e motore in memoria

**Files:**
- Create: `packages/core/src/engine.ts`
- Create: `packages/core/src/limits.ts`
- Create: `packages/core/src/memory-engine.ts`
- Create: `packages/core/test/engine-contract.ts` (exported function, **not** a test file: later engines import it)
- Test: `packages/core/test/memory-engine.test.ts`

**Interfaces:**
- Produces (in `limits.ts`):
  ```ts
  interface EngineLimits {
    schedulerIntervalMinutes: number; refreshIntervalSeconds: number;
    maxAttachmentBytes: number; imageMaxEdgePx: number; imageJpegQuality: number;
    dailyEmailQuota: number; dailyExternalCallQuota: number;
  }
  const DEFAULT_LIMITS: Record<'google' | 'central' | 'memory', EngineLimits>;
  // google: 10, 60, 10_000_000, 1600, 0.8, 100, 20_000 · central: 1, 15, 10_000_000, 1600, 0.8, 100, 100_000 · memory: same as central
  function resolveLimits(kind: keyof typeof DEFAULT_LIMITS, overrides?: Partial<EngineLimits>): EngineLimits;
  ```
- Produces (in `engine.ts`):
  ```ts
  interface Change { cursor: string; type: 'activity' | 'group'; id: string; deleted?: boolean }
  interface Engine {
    readonly kind: string;
    readonly limits: EngineLimits;
    getGroup(id: GroupId): Promise<Group>;                                   // NOT_FOUND
    listGroupsOf(account: AccountId): Promise<Group[]>;
    saveGroup(g: Group, expectedVersion: number | null): Promise<number>;   // returns new version; VERSION_CONFLICT
    getActivity(id: ActivityId): Promise<{ activity: Activity }>;           // NOT_FOUND
    listActivities(groupId: GroupId | null, account: AccountId): Promise<Activity[]>; // null = drafts of account
    saveActivity(a: Activity, expectedVersion: number | null): Promise<Activity>;     // null = create; returns with version+1
    putAttachment(activityId: ActivityId, file: { name: string; mimeType: string; bytes: Uint8Array }): Promise<AttachmentRef>; // INVALID_INPUT if > maxAttachmentBytes
    getAttachment(ref: AttachmentRef): Promise<Uint8Array>;
    changesSince(cursor: string | null): Promise<{ changes: Change[]; cursor: string }>;
  }
  ```
  `Group` gets a `version: number` field (add it in `groups.ts`).
- Produces (in `memory-engine.ts`): `class InMemoryEngine implements Engine { constructor(limits?: Partial<EngineLimits>) }`, which stores deep copies (`structuredClone`) so callers cannot mutate its state.
- Produces (in `engine-contract.ts`): `function engineContract(name: string, make: () => Promise<Engine>): void`, which registers a `describe(name, …)` with the tests below.

- [ ] **Step 1: Write the contract** in `engine-contract.ts` (tests with `testXxx` names):

```ts
test('testCreateThenReadRoundTrip', async () => {
  const e = await make();
  const saved = await e.saveActivity(draft, null);
  expect(saved.version).toBe(2);
  expect((await e.getActivity(draft.id)).activity).toEqual(saved);
});
test('testConcurrentSaveFromSameVersionConflicts', async () => {
  const e = await make(); const v = await e.saveActivity(draft, null);
  await e.saveActivity({ ...v, title: 'pippo edit' }, v.version);
  await expect(e.saveActivity({ ...v, title: 'pluto edit' }, v.version)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
});
test('testDraftsListedOnlyForTheirAccount', async () => {
  const e = await make(); await e.saveActivity(draft, null);
  expect(await e.listActivities(null, 'u1')).toHaveLength(1);
  expect(await e.listActivities(null, 'u2')).toHaveLength(0);
});
test('testChangesSinceReturnsOnlyNewChanges', async () => {
  const e = await make(); const { cursor } = await e.changesSince(null);
  await e.saveActivity(draft, null);
  const r = await e.changesSince(cursor);
  expect(r.changes.map(c => c.id)).toEqual([draft.id]);
  expect((await e.changesSince(r.cursor)).changes).toEqual([]);
});
test('testAttachmentOverLimitRejected', async () => {
  const e = await make();
  const big = new Uint8Array(e.limits.maxAttachmentBytes + 1);
  await expect(e.putAttachment('a1', { name: 'x.bin', mimeType: 'application/octet-stream', bytes: big })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
});
test('testReturnedObjectsAreCopies', async () => {
  const e = await make(); const s = await e.saveActivity(draft, null);
  s.title = 'mutated';
  expect((await e.getActivity(draft.id)).activity.title).toBe('app gestione core');
});
```

- [ ] **Step 2: Write** `memory-engine.test.ts`: `engineContract('InMemoryEngine', async () => new InMemoryEngine());` plus `testResolveLimitsOverrides`, i.e. `resolveLimits('google', { schedulerIntervalMinutes: 5 }).schedulerIntervalMinutes === 5`, with the other fields equal to `DEFAULT_LIMITS.google`.
- [ ] **Step 3: Run** `npm test -- memory-engine` — Expected: FAIL.
- [ ] **Step 4: Implement** `limits.ts`, `engine.ts`, `memory-engine.ts`. Cursor = progressive counter as a string.
- [ ] **Step 5: Run** `npm test` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(core): engine interface, contract suite and in-memory engine`

---

### Task 9: Agenda e ordinamento delle proprietà per uso

**Files:**
- Create: `packages/core/src/agenda.ts`
- Create: `packages/core/src/usage.ts`
- Test: `packages/core/test/agenda.test.ts`, `packages/core/test/usage.test.ts`

**Interfaces:**
- Consumes: `occurrencesBetween`, `shapeOf`, `Activity`, `Group`.
- Produces:
  - `interface AgendaItem extends Occurrence { groupId: GroupId; accountId: AccountId; title: string; shape: Shape }`
  - `buildAgenda(sources: Array<{ group: Group; activities: Activity[] }>, from: LocalDateTime, to: LocalDateTime): { days: Record<LocalDate, AgendaItem[]>; waiting: Activity[] }`: waiting memos go in `waiting`, not in the days. Archived and done activities are excluded, and snoozed ones too. Items within a day are sorted by time; those without a time (date only) come first.
  - `type UsageStats = Partial<Record<PropKey, number>>`
  - `recordUse(stats: UsageStats, key: PropKey): UsageStats`
  - `rankProps(stats: UsageStats, all?: readonly PropKey[]): PropKey[]`: by descending use; ties keep the order of `DEFAULT_PROP_ORDER: readonly PropKey[] = ['due', 'schedule', 'repeat', 'assignment', 'waitingFor', 'resumeAt', 'parentId']`.

- [ ] **Step 1: Write the failing tests**

```ts
test('testAgendaMergesGroupsAndSeparatesWaiting', () => {
  const r = buildAgenda([{ group: domainGroup, activities: [seriesForPippo, waitingMemo] }, { group: inviteGroup, activities: [costTask] }],
    '2026-11-02T00:00', '2026-11-08T23:59');
  expect(Object.keys(r.days)).toEqual(['2026-11-03', '2026-11-05', '2026-11-06']);
  expect(r.waiting.map(a => a.id)).toEqual([waitingMemo.id]);
});
test('testDateOnlyItemsComeFirstInDay', () => {
  const event = { ...costTask, id: 'e1', props: { schedule: { start: '2026-11-06T15:00' } } };
  const r = buildAgenda([{ group: inviteGroup, activities: [event, costTask] }], '2026-11-06T00:00', '2026-11-06T23:59');
  expect(r.days['2026-11-06'].map(i => i.activityId)).toEqual([costTask.id, 'e1']);
});
test('testRankPropsByUsageWithStableTies', () => {
  let s: UsageStats = {};
  s = recordUse(recordUse(recordUse(s, 'waitingFor'), 'waitingFor'), 'repeat');
  expect(rankProps(s)).toEqual(['waitingFor', 'repeat', 'due', 'schedule', 'assignment', 'resumeAt', 'parentId']);
});
```

- [ ] **Step 2: Run** `npm test -- agenda usage` — Expected: FAIL.
- [ ] **Step 3: Implement** `agenda.ts`, `usage.ts`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS, all suites.
- [ ] **Step 5: Commit** `feat(core): merged agenda and usage-ranked properties`

---

## Cosa resta fuori da questo piano (piani successivi)

Supabase e PWA (piano 2); motore Google (piano 3); notifiche (piano 4); persona e più account (piano 5); MCP e iCal (piano 6). Il calcolo di *quando* inviare una notifica usa `occurrencesBetween` e `nextDue` di questo piano, ma l'invio appartiene al piano 4.
