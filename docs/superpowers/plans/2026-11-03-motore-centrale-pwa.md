# Motore centralizzato (Supabase) e PWA di base — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un motore `CentralEngine` su Supabase che supera la suite `engineContract` della prima parte, più una PWA installabile (agenda, bozze, dettaglio "aggiungi proprietà", gruppi, cattura veloce offline con immagini incollate) che usa solo l'interfaccia `Engine`.

**Architecture:** Supabase gira in locale (CLI + Docker) per sviluppo e test. Il database conserva ogni attività come documento JSON (`doc jsonb`) più le colonne che servono ai permessi (`account_id`, `group_id`, `version`). Scritture atomiche e controlli di versione e permesso stanno in funzioni Postgres chiamate via RPC. La Row Level Security fa sì che le letture vedano solo bozze proprie e gruppi di cui si è membri. La PWA dipende da `Engine` e mai da Supabase, quindi in test gira sull'`InMemoryBackend` della prima parte.

**Tech Stack:** Supabase (Postgres 15, Auth, Storage; CLI su Docker), `@supabase/supabase-js`, React + Vite, `vite-plugin-pwa`, `idb`, Vitest + `@testing-library/react` + `jsdom`.

**Spec:** `docs/superpowers/specs/2026-11-03-app-attivita-design.md` (§6 motori, §7 gruppi, §8 attività, §9 schermate, §12 limiti). Piano precedente: `docs/superpowers/plans/2026-11-03-fondamenta.md` (interfaccia `Engine`, `engineContract`, `InMemoryBackend`).

## Global Constraints

- Codice, identificatori, commenti, log in inglese; testi dell'interfaccia in italiano.
- Dipendenze approvate: `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `vite-plugin-pwa`, `idb`, `@supabase/supabase-js`, `supabase` (CLI, dev), `@testing-library/react`, `jsdom`, oltre a `typescript`, `vitest`, `rrule`. Nessun'altra senza approvazione. I tipi `@types/react` e `@types/react-dom` servono a TypeScript per React e contano come parte di `react`.
- Node 24 di nvm via `PATH` (`/c/Users/xrob7/AppData/Roaming/nvm/v24.10.0`); il Node 16 predefinito resta intatto.
- Tutta la logica di dominio viene da `@attivita/core`; la PWA non la reimplementa.
- La PWA importa solo `Engine` e i tipi di core; l'unico file che conosce Supabase è `apps/web/src/session/central.ts`.
- `AccountId` = email in minuscolo in produzione. Nei test le stringhe brevi (`pippo`, `u1`) restano valide: la tabella `accounts` mappa l'utente Auth sull'`account_id`.
- Limiti solo da `resolveLimits('central', …)` o `engine.limits`, mai costanti sparse.
- Nessun segreto nel codice: URL e anon key da `import.meta.env`, la service role key solo nei test, da `supabase status`.
- Git: nessun commit né push senza via esplicito dell'utente; ogni passo "Commit" vuol dire proporre file e messaggio.

## Review Focus

1. **Bozza catturata offline e app chiusa prima del ritorno della rete**: alla riapertura la bozza è ancora in coda e parte; non si perde e non si duplica. → test in Task 9.
2. **Due schede aperte che svuotano la coda insieme**: la stessa bozza arriva una volta sola; il secondo invio vede `VERSION_CONFLICT` su una creazione e la tratta come già inviata. → test in Task 9.
3. **Membro di un gruppo di dominio che prova a togliere un altro via RPC diretta**, aggirando l'app: il server rifiuta. → test in Task 4.
4. **Utente con email di dominio pubblico** (`@gmail.com`) che chiama `join_domain_group`: nessun gruppo creato. → test in Task 4.
5. **Immagine incollata più grande del limite**: viene ridotta prima dell'invio, e se resta sopra `maxAttachmentBytes` l'utente vede un messaggio chiaro, senza un errore muto. → test in Task 8.

---

### Task 1: Supabase locale e schema

**Files:**
- Create: `supabase/config.toml` (da `npx supabase init`, poi: `[auth] site_url = "http://localhost:5173"`, `[auth.email] enable_confirmations = false`, `[storage] file_size_limit = "10MiB"`)
- Create: `supabase/migrations/0001_schema.sql`
- Create: `supabase/seed.sql` (generato, vedi Task 4)
- Modify: `package.json` (root): script `db:start` = `supabase start`, `db:reset` = `supabase db reset`, `db:stop` = `supabase stop`; devDependency `supabase`.

**Interfaces:**
- Produces (SQL):
  ```sql
  accounts(user_id uuid pk references auth.users on delete cascade, account_id text unique not null, email text not null)
  groups(id text pk, kind text check (kind in ('personal','domain','invite')), name text not null,
         domain text, owner_id text, time_zone text not null default 'Europe/Rome', version int not null)
  group_members(group_id text references groups on delete cascade, account_id text, role text check (role in ('owner','member','guest')),
                primary key (group_id, account_id))
  activities(id text pk, account_id text not null, group_id text references groups, doc jsonb not null,
             version int not null, updated_at timestamptz not null default now())
  changes(cursor bigserial pk, type text check (type in ('activity','group')), id text not null,
          group_id text, account_id text, at timestamptz default now())
  public_domains(domain text pk)
  function current_account() returns text  -- account_id of auth.uid(), stable, security definer
  function is_member(g text) returns boolean -- security definer
  ```
  RLS on every table: `activities` select only when `(group_id is null and account_id = current_account()) or is_member(group_id)`; `groups`/`group_members` select only when `is_member(id)`; `changes` select with the same visibility rule (draft changes: `account_id = current_account()`). **No insert/update/delete policies**: all writes go through the RPCs of Task 2 and Task 4.
  Triggers: `after insert or update on activities` and `on groups` append to `changes`.
  Storage bucket `attachments` (private). Policy on `storage.objects`: select/insert allowed when the first path segment is an activity id that `activities` RLS lets the caller see.

- [ ] **Step 1: Install and start** — `npm install -D supabase`, `npx supabase init`, `npm run db:start`. Expected: `supabase status` prints `API URL http://127.0.0.1:54321` and the anon and service_role keys.
- [ ] **Step 2: Write** `0001_schema.sql` as in Interfaces.
- [ ] **Step 3: Run** `npm run db:reset`. Expected: `Finished supabase db reset` with no errors.
- [ ] **Step 4: Smoke check** — `npx supabase db lint` → no errors; `psql` (or `supabase db execute`) `select count(*) from activities;` → `0`.
- [ ] **Step 5: Commit** `feat(db): local Supabase schema with row level security`

---

### Task 2: RPC di scrittura atomica

**Files:**
- Create: `supabase/migrations/0002_write_rpc.sql`

**Interfaces:**
- Produces:
  - `save_activity(doc jsonb, expected int) returns jsonb`: in one statement, insert (`expected is null`) with `on conflict do nothing`, or `update … where id = doc->>'id' and version = expected`. If no row is affected → `raise exception 'VERSION_CONFLICT' using errcode = 'P0001'`. Before writing: visibility check on the stored row and on the new doc (draft: `doc->>'accountId' = current_account()`; group: `is_member(doc->>'groupId')`), else `raise exception 'FORBIDDEN'`. Stores `doc` with `version` = (expected, or `doc->>'version'` on create) + 1, mirrored in the column and inside `doc`. Returns the stored doc.
  - `save_group(doc jsonb, expected int) returns int`: `doc` is a core `Group` (`members` as an object). Same version logic on `groups`; replaces `group_members` from `doc->'members'`. Checks: the caller is a member of the stored group (or, on create, of `doc->'members'`) → else `FORBIDDEN`. **Creating a domain group** requires `doc->>'domain'` = domain of the JWT email (otherwise `FORBIDDEN`). **Domain groups, on update**: the members' diff may only add or remove `current_account()` itself, and only with role `member`; any other change → `FORBIDDEN`. **Invite groups**: owner-only fields (`owner_id`) change only if the caller is the owner. Returns the new version.
- Error contract: the engine maps `P0001` messages `VERSION_CONFLICT` and `FORBIDDEN` to `DomainError` with the same code.

- [ ] **Step 1: Write** `0002_write_rpc.sql`.
- [ ] **Step 2: Run** `npm run db:reset` — Expected: success. The behaviour is tested through the contract in Task 3.
- [ ] **Step 3: Commit** `feat(db): atomic save RPCs with version and permission checks`

---

### Task 3: `CentralEngine` e suite di contratto

**Files:**
- Create: `packages/engine-central/package.json` (name `@attivita/engine-central`, deps `@attivita/core`, `@supabase/supabase-js`)
- Create: `packages/engine-central/tsconfig.json`
- Create: `packages/engine-central/src/central-engine.ts`
- Create: `packages/engine-central/src/errors.ts`
- Create: `packages/engine-central/src/index.ts`
- Create: `packages/engine-central/test/local-supabase.ts` (test helper)
- Create: `packages/engine-central/test/central-engine.test.ts`
- Modify: root `package.json` script `test` → runs every workspace (`npm test --workspaces --if-present`)
- Modify: `packages/core/package.json`: add `"exports": { ".": "./src/index.ts", "./test/engine-contract": "./test/engine-contract.ts", "./test/fixtures": "./test/fixtures.ts" }`

**Interfaces:**
- Consumes: `Engine`, `EngineLimits`, `resolveLimits`, `DomainError`, `Group`, `Activity` (core); `engineContract`, `SessionFactory` (core test).
- Produces:
  - `class CentralEngine implements Engine { constructor(client: SupabaseClient, account: AccountId, limits?: Partial<EngineLimits>) }`, with `kind = 'central'` and `limits = resolveLimits('central', limits)`. Reads go through `select` (RLS). Writes go through `rpc('save_activity' | 'save_group')`. Attachments go through `storage.from('attachments')` at path `<activityId>/<uuid>`. `changesSince(cursor)` = `select * from changes where cursor > $1 order by cursor`, and the new cursor is the last value (or the input). `getActivity` on a row hidden by RLS: a second `rpc('activity_exists', id)` (security definer, returns boolean) distinguishes `FORBIDDEN` from `NOT_FOUND`. Add that function to `0002_write_rpc.sql`.
  - `toDomainError(e: { message?: string; code?: string }): DomainError` in `errors.ts`.
  - Test helper `openLocalBackend(): Promise<SessionFactory>`. It reads URL and keys from `npx supabase status -o json`, resets the tables and deletes the test users (`auth.admin.deleteUser`) with the service-role client, and for each account opens a client with `auth.signUp({ email: `${account}@altereos.com`, password })` (the domain must match `domainGroup.domain` from the fixtures, because creating a domain group checks it) (password generated per run, never logged), then inserts `accounts(user_id, account_id = account, email)` with the service role. Sessions are cached per account.

- [ ] **Step 1: Write the failing test** `central-engine.test.ts`:
  ```ts
  import { engineContract } from '@attivita/core/test/engine-contract';
  import { openLocalBackend } from './local-supabase.js';
  engineContract('CentralEngine (local Supabase)', openLocalBackend);
  ```
- [ ] **Step 2: Run** `npm test -w @attivita/engine-central` with Supabase started. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `central-engine.ts`, `errors.ts`, `local-supabase.ts`, `activity_exists`.
- [ ] **Step 4: Run** — Expected: all 11 contract tests PASS, `testParallelSavesExactlyOneWins` included.
- [ ] **Step 5: Run** `npm test` (all workspaces). Expected: core 67/67 and central 11/11.
- [ ] **Step 6: Commit** `feat(engine-central): Supabase engine passing the engine contract`

---

### Task 4: Ingresso nel gruppo di dominio e gruppo personale

**Files:**
- Create: `supabase/migrations/0003_onboarding.sql`
- Create: `scripts/gen-public-domains.mjs` (writes `supabase/seed.sql` from `DEFAULT_PUBLIC_DOMAINS`)
- Modify: `packages/engine-central/src/central-engine.ts`
- Test: `packages/engine-central/test/onboarding.test.ts`

**Interfaces:**
- Produces (SQL, security definer, everything taken from `auth.jwt()`, never from parameters):
  - `ensure_account() returns text`: creates the `accounts` row if missing, with `account_id = lower(email)`. Creates the personal group `personal:<account_id>` with the caller as `owner` if missing. Returns `account_id`.
  - `join_domain_group() returns text`: domain = part after `@` of the JWT email, in lowercase. If it is in `public_domains` → returns `null`. Otherwise upserts the group `domain:<domain>` (kind `domain`, no owner, name = domain) and the membership `member`. Returns the group id. It is idempotent.
- Produces (TS): `CentralEngine.onboard(): Promise<{ account: AccountId; personalGroupId: GroupId; domainGroupId: GroupId | null }>`, which calls the two RPCs.
- The helper from Task 3 gets `openLocalUser(email): Promise<CentralEngine>`, which signs up with that email and does **not** pre-insert `accounts`.

- [ ] **Step 1: Write the failing tests**
  ```ts
  test('testDomainUsersShareTheDomainGroup', async () => {
    const pippo = await openLocalUser('pippo@altereos.com');
    const pluto = await openLocalUser('pluto@altereos.com');
    const a = await pippo.onboard(); const b = await pluto.onboard();
    expect(a.domainGroupId).toBe('domain:altereos.com');
    expect(b.domainGroupId).toBe('domain:altereos.com');
    expect(Object.keys((await pluto.getGroup('domain:altereos.com')).members).sort()).toEqual(['pippo@altereos.com', 'pluto@altereos.com']);
    expect(a.personalGroupId).toBe('personal:pippo@altereos.com');
  });
  test('testPublicDomainGetsNoDomainGroup', async () => {
    const u = await openLocalUser('mario.rossi@gmail.com');
    expect((await u.onboard()).domainGroupId).toBeNull();
  });
  test('testOnboardIsIdempotent', async () => {
    const u = await openLocalUser('paperino@altereos.com');
    expect(await u.onboard()).toEqual(await u.onboard());
  });
  test('testDomainMemberCannotRemoveAnotherViaRpc', async () => {
    const pippo = await openLocalUser('pippo@altereos.com'); await pippo.onboard();
    const pluto = await openLocalUser('pluto@altereos.com'); await pluto.onboard();
    const g = await pippo.getGroup('domain:altereos.com');
    const { ['pluto@altereos.com']: _gone, ...members } = g.members;
    await expect(pippo.saveGroup({ ...g, members }, g.version)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  test('testDomainMemberCanLeave', async () => {
    const pluto = await openLocalUser('pluto@altereos.com'); await pluto.onboard();
    const g = await pluto.getGroup('domain:altereos.com');
    const { ['pluto@altereos.com']: _me, ...members } = g.members;
    await pluto.saveGroup({ ...g, members }, g.version);
    expect((await pluto.listGroups()).map(x => x.id)).toEqual(['personal:pluto@altereos.com']);
  });
  ```
- [ ] **Step 2: Run** `npm test -w @attivita/engine-central -- onboarding` — Expected: FAIL.
- [ ] **Step 3: Implement** the migration, the seed script (`node scripts/gen-public-domains.mjs`, which imports from core), and `onboard()`. Then `npm run db:reset`.
- [ ] **Step 4: Run** — Expected: PASS. The full central suite stays green.
- [ ] **Step 5: Commit** `feat(db): personal and domain group onboarding`

---

### Task 5: Scheletro PWA, sessione e motore di prova

**Files:**
- Create: `apps/web/package.json` (name `@attivita/web`; deps `react`, `react-dom`, `@attivita/core`, `@attivita/engine-central`, `@supabase/supabase-js`, `idb`; devDeps `vite`, `@vitejs/plugin-react`, `vite-plugin-pwa`, `@testing-library/react`, `jsdom`, `@types/react`, `@types/react-dom`)
- Create: `apps/web/index.html`, `apps/web/vite.config.ts` (React plugin, PWA plugin configured in Task 10, vitest `environment: 'jsdom'`)
- Create: `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/styles.css` (tokens light/dark as in the test bench)
- Create: `apps/web/src/session/central.ts`, `apps/web/src/session/SessionContext.tsx`, `apps/web/src/session/LoginScreen.tsx`
- Create: `apps/web/.env.example` (`VITE_SUPABASE_URL=`, `VITE_SUPABASE_ANON_KEY=`)
- Test: `apps/web/test/app.test.tsx`

**Interfaces:**
- Produces:
  - `interface Session { account: AccountId; engine: Engine; personalGroupId: GroupId; signOut(): Promise<void> }`
  - `SessionProvider({ open: () => Promise<Session | null>, children })` and `useSession(): Session`.
  - `openCentralSession(): Promise<Session | null>` in `central.ts`. It creates the client from `import.meta.env`, returns `null` without an Auth session, and otherwise calls `CentralEngine.onboard()`.
  - `LoginScreen`: email field and a "Mandami il link" button (`signInWithOtp`). In local dev the email arrives in Inbucket (`http://127.0.0.1:54324`). Google and Microsoft buttons appear only if `VITE_AUTH_PROVIDERS` lists them.
  - `App({ open })`: without a session shows `LoginScreen`; with a session shows the shell from Task 6. Tests pass `open` returning a session on `InMemoryBackend`.
- Test helper `apps/web/test/memory-session.ts`: `memorySession(account = 'pippo@altereos.com', limits?: Partial<EngineLimits>): Session` on `InMemoryBackend`, preloaded with the test bench data (domain group `domain:altereos.com` with pippo and pluto, invite group `developers` with a guest, personal groups, and the activities "Controllo backup", "Stato avanzamento", "Analisi costi" (id `costi`), the memo waiting for the ops 412, the draft "app gestione core" (id `idea`)). Plus `renderWithSession(ui, session)`.

- [ ] **Step 1: Write the failing test**
  ```tsx
  test('testShowsLoginWithoutSession', async () => {
    render(<App open={async () => null} />);
    expect(await screen.findByRole('button', { name: 'Mandami il link' })).toBeTruthy();
  });
  test('testShowsAgendaWithSession', async () => {
    render(<App open={async () => memorySession()} />);
    expect(await screen.findByRole('navigation')).toHaveTextContent(/Agenda.*Bozze.*Gruppi.*Io/);
  });
  ```
- [ ] **Step 2: Run** `npm test -w @attivita/web` — Expected: FAIL.
- [ ] **Step 3: Implement**. Run `npm run dev -w @attivita/web`: the page at `http://localhost:5173` shows the login.
- [ ] **Step 4: Run** tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): PWA shell, session and login`

---

### Task 6: Dati dello spazio di lavoro e agenda

**Files:**
- Create: `apps/web/src/workspace/useWorkspace.ts`
- Create: `apps/web/src/agenda/AgendaView.tsx`
- Create: `apps/web/src/shell/Shell.tsx` (barra in basso: Agenda | Bozze (n) | Gruppi | Io; pulsante + sempre visibile)
- Test: `apps/web/test/agenda.test.tsx`, `apps/web/test/workspace.test.ts`

**Interfaces:**
- Consumes: `Engine`, `buildAgenda`, `resumeIfDue`, `shapeOf`.
- Produces:
  - `useWorkspace(engine: Engine): { groups: Group[]; activities: Activity[]; drafts: Activity[]; save(a: Activity): Promise<Activity>; reload(): Promise<void>; error: string | null }`. On load it reads `listGroups()`, then `listActivities(g.id)` for each group, plus `listActivities(null)`. Every `engine.limits.refreshIntervalSeconds` it calls `changesSince(cursor)` and reloads only the changed ids. `save` calls `engine.saveActivity(a, a.version)` (or `null` for a new one). On `VERSION_CONFLICT` it reloads that activity and exposes `error = 'Qualcun altro l'ha appena modificata: ho ricaricato la versione aggiornata.'`. Snoozed activities whose time has come are shown resumed (`resumeIfDue` at read time) without saving.
  - `AgendaView({ from: LocalDate, days: number })`, default from today for 14 days. One row per day as in the approved mockup B: time or "giorno", title, group with its colour, assignee or "libera", pills "copre X" and "fatta". Below it the "In attesa" section.
- Colours: group colour by `kind` (domain/invite/personal), tokens `--acc-dom/--acc-inv/--acc-per`.

- [ ] **Step 1: Write the failing tests**
  ```tsx
  test('testAgendaShowsCoverAndWaiting', async () => {
    renderWithSession(<AgendaView from="2026-11-02" days={14} />, memorySession('pluto@altereos.com'));
    expect(await screen.findAllByText('Controllo backup')).toHaveLength(4);
    expect(screen.getByRole('heading', { name: 'In attesa' })).toBeTruthy();
    expect(screen.getByText(/chiusura della ops 412/)).toBeTruthy();
  });
  test('testConflictReloadsAndExplains', async () => {
    const s = memorySession(); const { result } = renderHook(() => useWorkspace(s.engine));
    await waitFor(() => expect(result.current.activities.length).toBeGreaterThan(0));
    const a = result.current.activities[0]!;
    await s.engine.saveActivity({ ...a, title: 'other tab' }, a.version);
    await act(() => result.current.save({ ...a, title: 'mine' }).catch(() => undefined));
    expect(result.current.error).toMatch(/Qualcun altro/);
    expect(result.current.activities.find(x => x.id === a.id)?.title).toBe('other tab');
  });
  ```
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): workspace sync and group agenda`

---

### Task 7: Dettaglio attività e bozze

**Files:**
- Create: `apps/web/src/activity/ActivityDetail.tsx`, `apps/web/src/activity/PropertyForms.tsx`, `apps/web/src/activity/actions.ts`
- Create: `apps/web/src/drafts/DraftsView.tsx`
- Create: `apps/web/src/usage/usageStore.ts` (localStorage per account, try/catch; it moves to the person's data in plan 5)
- Test: `apps/web/test/detail.test.tsx`

**Interfaces:**
- Consumes: every core operation (`setProp`, `removeProp`, `assign`, `accept`, `reject`, `claim`, `takeOccurrence`, `complete`, `markConditionMet`, `moveToGroup`, `keepAsIdea`, `archive`, `snooze`, `decompose`, `rankProps`, `recordUse`, `roleIn`, `can`).
- Produces:
  - `availableActions(a: Activity, occ: Occurrence | null, group: Group | null, me: AccountId): ActionKind[]` in `actions.ts`, where `type ActionKind = 'accept' | 'reject' | 'claim' | 'cover' | 'complete' | 'met' | 'moveToGroup' | 'keepAsIdea' | 'snooze' | 'archive' | 'decompose'`. It is pure, and it applies the same rules as the test bench but reads permissions from `can(group, me, …)`.
  - `ActivityDetail({ activityId, occurrenceKey? })`: title, text, attachments (thumbnails), properties, action buttons, "Aggiungi proprietà" chips ordered by `rankProps(usage)`, history (most recent first, in Italian: "pippo ha rifiutato: motivo").
  - The rejection form requires a reason, and the button stays disabled while the field is blank after trim.
  - `DraftsView`: the account's drafts, and tapping one opens `ActivityDetail`. "Scomponi" opens a form for N children (title + one property each).
- Each action saves through `useWorkspace().save` and shows the `DomainError` messages in Italian (same table as the test bench).

- [ ] **Step 1: Write the failing tests**
  ```tsx
  test('testAvailableActionsForGuest', () => {
    const mine = { ...costTask, props: { ...costTask.props, assignment: { state: 'accepted', assignee: 'guest1', assignedBy: 'u1' } } } as const;
    expect(availableActions(mine, null, inviteGroup, 'guest1')).toEqual(['complete']);
    expect(availableActions(costTask, null, inviteGroup, 'guest1')).toEqual([]);
  });
  test('testRejectNeedsReason', async () => {
    renderWithSession(<ActivityDetail activityId="costi" />, memorySession('pluto@altereos.com'));
    await userClick('Rifiuta…');
    expect(screen.getByRole('button', { name: 'Rifiuta' })).toBeDisabled();
    await userType(screen.getByLabelText('Motivo'), 'non ho tempo');
    await userClick('Rifiuta');
    expect(await screen.findByText(/pluto ha rifiutato: non ho tempo/)).toBeTruthy();
  });
  test('testChipsFollowUsage', async () => {
    seedUsage('pippo@altereos.com', { waitingFor: 3 });
    renderWithSession(<ActivityDetail activityId="idea" />, memorySession());
    expect((await screen.findAllByRole('button', { name: /^\+ / }))[1]).toHaveTextContent('In attesa di');
  });
  ```
  (`[1]` because the first chip of a draft is always "Gruppo". `userClick`/`userType` are small helpers over `fireEvent`, since `@testing-library/user-event` is not approved.)
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): activity detail, property chips and drafts`

---

### Task 8: Cattura veloce, incolla e riduzione immagini

**Files:**
- Create: `apps/web/src/capture/CaptureSheet.tsx`
- Create: `apps/web/src/capture/images.ts`
- Test: `apps/web/test/images.test.ts`, `apps/web/test/capture.test.tsx`

**Interfaces:**
- Produces:
  - `fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number }`: pure, keeps the aspect ratio, never enlarges.
  - `shrinkImage(file: File, limits: EngineLimits): Promise<File>`: canvas to JPEG at `imageJpegQuality` with `fitWithin(…, imageMaxEdgePx)`. Non-images are returned unchanged.
  - `CaptureSheet({ onSaved })`: opened by the `+` button and by the `?capture=1` URL. It has a text field with autofocus, plus three ways to add an attachment: a `paste` event on the sheet (images from the clipboard), drag and drop, and a file button with `accept="image/*,*/*"` (on the phone it offers the camera). "Salva" creates the draft through the outbox (Task 9). A file over `maxAttachmentBytes` after shrinking shows "L'allegato supera i 10 MB anche dopo la riduzione: non l'ho aggiunto." The size in the message comes from `limits`.

- [ ] **Step 1: Write the failing tests**
  ```ts
  test('testFitWithinKeepsRatioAndNeverEnlarges', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
  test('testPastedImageBecomesAttachment', async () => {
    renderWithSession(<CaptureSheet onSaved={vi.fn()} />, memorySession());
    firePaste(screen.getByRole('dialog'), new File([new Uint8Array(10)], 'screenshot.png', { type: 'image/png' }));
    expect(await screen.findByText('screenshot.png')).toBeTruthy();
  });
  test('testOversizeAttachmentExplained', async () => {
    renderWithSession(<CaptureSheet onSaved={vi.fn()} />, memorySession(undefined, { maxAttachmentBytes: 5 }));
    firePaste(screen.getByRole('dialog'), new File([new Uint8Array(10)], 'big.bin', { type: 'application/octet-stream' }));
    expect(await screen.findByText(/supera/)).toBeTruthy();
  });
  ```
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**. Under jsdom `shrinkImage` has no canvas: inject `shrink` as an optional prop, with the real implementation as the default.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): quick capture with paste, drop and image shrinking`

---

### Task 9: Coda offline delle bozze

**Files:**
- Create: `apps/web/src/offline/outbox.ts`
- Create: `apps/web/src/offline/idb-store.ts`
- Test: `apps/web/test/outbox.test.ts`

**Interfaces:**
- Produces:
  - `interface OutboxEntry { id: string; account: AccountId; activity: Activity; files: Array<{ name: string; mimeType: string; bytes: Uint8Array }>; createdAt: Instant }`
  - `interface OutboxStore { put(e: OutboxEntry): Promise<void>; list(account: AccountId): Promise<OutboxEntry[]>; remove(id: string): Promise<void> }`, implemented by `memoryOutboxStore()` (tests) and `idbOutboxStore()` (`idb`, database `attivita-outbox`, store `entries`).
  - `enqueueDraft(store, account, activity, files, now): Promise<void>`, which writes to the store **before** any network call.
  - `flushOutbox(store, engine): Promise<{ sent: number; failed: number }>`, in creation order. For each entry: `putAttachment` for every file, then `saveActivity(activity with attachments, null)`. `VERSION_CONFLICT` on that create counts as already sent and the entry is removed. Network errors leave the entry in place. Re-entrancy is guarded per store with an in-progress promise.
  - Triggers in the app: at startup, on the `online` event, and after every `enqueueDraft` when `navigator.onLine`.
- Known limit, accepted: attachments uploaded before a failed save may stay orphaned in storage. Cleaning them up belongs to plan 4.

- [ ] **Step 1: Write the failing tests**
  ```ts
  test('testQueuedDraftSurvivesRestartAndIsSentOnce', async () => {
    const store = memoryOutboxStore(); const backend = new InMemoryBackend();
    await enqueueDraft(store, 'pippo@altereos.com', draftOf('d1'), [], t1);
    // "restart": new engine session, same store
    const r = await flushOutbox(store, backend.session('pippo@altereos.com'));
    expect(r).toEqual({ sent: 1, failed: 0 });
    expect(await store.list('pippo@altereos.com')).toEqual([]);
    expect(await backend.session('pippo@altereos.com').listActivities(null)).toHaveLength(1);
  });
  test('testTwoTabsFlushingSendOnce', async () => {
    const store = memoryOutboxStore(); const backend = new InMemoryBackend();
    await enqueueDraft(store, 'pippo@altereos.com', draftOf('d2'), [], t1);
    const s = backend.session('pippo@altereos.com');
    await Promise.all([flushOutbox(store, s), flushOutbox(memoryOutboxStoreSharing(store), s)]);
    expect(await s.listActivities(null)).toHaveLength(1);
  });
  test('testNetworkErrorKeepsEntry', async () => {
    const store = memoryOutboxStore();
    await enqueueDraft(store, 'pippo@altereos.com', draftOf('d3'), [], t1);
    const r = await flushOutbox(store, failingEngine(new TypeError('Failed to fetch')));
    expect(r).toEqual({ sent: 0, failed: 1 });
    expect(await store.list('pippo@altereos.com')).toHaveLength(1);
  });
  ```
  (`memoryOutboxStoreSharing` = a second store instance over the same data, simulating a second tab. `failingEngine` = an `Engine` whose every method rejects with that error.)
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): offline outbox for drafts`

---

### Task 10: Gruppi, "Io" e installazione PWA

**Files:**
- Create: `apps/web/src/groups/GroupsView.tsx`, `apps/web/src/me/MeView.tsx`
- Modify: `apps/web/vite.config.ts` (`VitePWA`: name "memo-land", `display: 'standalone'`, `start_url: '/'`, `shortcuts: [{ name: 'Nuova bozza', url: '/?capture=1' }]`, icons generated as SVG in `public/`, `registerType: 'autoUpdate'`, app-shell precache)
- Test: `apps/web/test/groups.test.tsx`

**Interfaces:**
- Produces:
  - `GroupsView`: list of groups with their kind and members. "Nuovo gruppo" creates an invite group with the caller as owner (`saveGroup(…, null)`). "Invita" takes an email (account id = lowercase email) and a role member/guest, through `addMember`. "Esci" uses `leaveGroup` and saves the released activities. It is not shown for the personal group or for the owner.
  - `MeView`: account, "Esci dall'account", the number of drafts waiting in the outbox.

- [ ] **Step 1: Write the failing tests**
  ```tsx
  test('testCreateInviteGroupAndInvite', async () => {
    const s = memorySession();
    renderWithSession(<GroupsView />, s);
    await userClick('Nuovo gruppo'); await userType(screen.getByLabelText('Nome'), 'developers'); await userClick('Crea');
    await userClick('Invita'); await userType(screen.getByLabelText('Email'), 'Pluto@Altereos.com'); await userClick('Invia invito');
    const g = (await s.engine.listGroups()).find(x => x.name === 'developers')!;
    expect(g.members).toMatchObject({ 'pippo@altereos.com': 'owner', 'pluto@altereos.com': 'member' });
  });
  test('testDomainGroupHasNoInviteButton', async () => {
    renderWithSession(<GroupsView />, memorySession());
    const card = await screen.findByRole('article', { name: 'altereos.com' });
    expect(within(card).queryByRole('button', { name: 'Invita' })).toBeNull();
  });
  ```
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm test` (all workspaces) — Expected: PASS. Then `npm run build -w @attivita/web` → `dist/` contains `manifest.webmanifest` with the shortcut and `sw.js`.
- [ ] **Step 5: Manual check** with Supabase started: `npm run dev -w @attivita/web`, log in with the link from Inbucket as `pippo@altereos.com`, then in another browser profile as `pluto@altereos.com`. Pippo creates and assigns an activity, and pluto sees it within `refreshIntervalSeconds`, accepts it or rejects it with a reason. Then capture a draft with DevTools in offline mode, reload, go back online: the draft arrives. Write the result in the ledger.
- [ ] **Step 6: Commit** `feat(web): groups, account view and installable PWA`

---

## Cosa resta fuori (piani successivi)

- **Google login e Microsoft login sul progetto online**: si configurano nel progetto Supabase dell'utente al primo rilascio; in locale si usa il link via email.
- **Pubblicazione su GitHub Pages e progetto Supabase online**: un passo di rilascio a parte, dopo questo piano.
- **Notifiche, timer, ripresa dei rimandi lato server**: piano 4.
- **Motore Google**: piano 3.
- **Persona e più account, statistiche d'uso condivise**: piano 5.
- **MCP e iCal**: piano 6.
