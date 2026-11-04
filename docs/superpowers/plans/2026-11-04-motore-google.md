# Motore Google (Firestore) e app su più motori — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un `GoogleEngine` su Firestore che supera la suite `engineContract`, regole di sicurezza Firestore con test equivalenti ai test SQL del motore centralizzato, e l'app capace di usare più motori insieme (centralizzato + uno o più progetti Firebase), con la procedura guidata per aprire un gruppo sul proprio progetto Firebase.

**Architecture:** Ogni gruppo Google vive nel progetto Firebase gratuito di chi lo apre. L'app crea un'istanza Firebase per progetto (`initializeApp(config, name)`). Il login è Google via Firebase Auth e l'identità è l'email verificata del token. Le scritture passano da transazioni Firestore che controllano la versione. Le regole di sicurezza ripetono lato server i controlli di membri, ruoli e versioni. Il flusso delle modifiche usa una collezione `changes`, scritta nella stessa transazione. L'app tiene una lista di motori nella sessione e instrada ogni operazione al motore che possiede il gruppo.

**Tech Stack:** `firebase` (SDK web modulare: app, auth, firestore), `firebase-tools` (emulatori Auth e Firestore, solo sviluppo), `@firebase/rules-unit-testing` (test delle regole, solo sviluppo), più lo stack esistente.

**Spec:** `docs/superpowers/specs/2026-11-03-app-attivita-design.md` (§6 motore Google, deciso il 2026-11-04; §7 gruppi e ruoli). Piani precedenti: `2026-11-03-fondamenta.md` (contratto `Engine`), `2026-11-03-motore-centrale-pwa.md` (stesse regole lato SQL: `supabase/migrations/0004_security.sql`, `supabase/tests/security_test.sql`).

## Global Constraints

- Dipendenze approvate: `firebase`, `firebase-tools`, `@firebase/rules-unit-testing`, oltre a quelle esistenti. Nessun'altra senza approvazione.
- Gli emulatori usano un progetto `demo-memo-land`: il prefisso `demo-` impedisce qualunque contatto con un progetto vero. Java per gli emulatori è il JDK 25 già presente (`JAVA_HOME` impostato solo nello script npm, mai globale).
- Nessun progetto Firebase vero viene creato o toccato in questo piano. La procedura guidata si prova contro gli emulatori.
- Sul motore Google stanno solo **gruppi su invito** e le **bozze** dell'account. I gruppi personali e di dominio restano sul motore centralizzato (spec §7: dominio sempre centralizzato). **[scelta di Claude]** La scelta del motore per il gruppo personale si rimanda al piano "persona e più account".
- La PWA non importa `firebase` fuori da `apps/web/src/session/google.ts`, come per Supabase con `central.ts`.
- `limits` da `resolveLimits('google', …)`; il limite degli allegati del motore Google è **5 MB** (override in configurazione, vedi Task 3).
- Git: commit e push solo con il via esplicito dell'utente.

## Review Focus

1. **Un membro che scrive direttamente su Firestore** (SDK o REST, aggirando l'app) per togliere il proprietario, cambiare ruoli o rinominare il gruppo: le regole rifiutano. → test in Task 2.
2. **Due membri che salvano la stessa attività dalla stessa versione in parallelo**: ne passa una. Le regole rifiutano anche una scrittura che salta la transazione e non incrementa la versione di 1. → contratto (Task 3) e test delle regole (Task 2).
3. **Un utente con token senza `email_verified`** (es. account email/password creato nel progetto): non legge né scrive niente. → test in Task 2.
4. **Allegato di 4 MB** su un motore con documenti da 1 MiB: viene spezzato e ricomposto byte per byte; un allegato oltre il limite viene rifiutato con `INVALID_INPUT`. → test in Task 3.
5. **App con due motori, un gruppo per ciascuno**: l'agenda li mostra insieme, e un salvataggio su un'attività del gruppo Google non finisce mai sul motore centralizzato, e viceversa. → test in Task 4.

---

### Task 1: Emulatori Firebase e pacchetto `engine-google`

**Files:**
- Create: `firebase.json` (emulators: auth 9099, firestore 8080, ui disabilitata; `firestore.rules`), `.firebaserc` (`{"projects":{"default":"demo-memo-land"}}`)
- Create: `firebase/firestore.rules` (scheletro: tutto negato)
- Create: `packages/engine-google/package.json` (deps `@attivita/core`, `firebase`; devDeps `@firebase/rules-unit-testing`), `tsconfig.json`, `vitest.config.ts` (env `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, `fileParallelism: false`)
- Modify: root `package.json`: devDependency `firebase-tools`; script `emu` = `firebase emulators:start --only auth,firestore --project demo-memo-land`, `test:google` = `firebase emulators:exec --only auth,firestore --project demo-memo-land "npm test -w @attivita/engine-google"` (with `JAVA_HOME` set inside the script)

- [ ] **Step 1:** install the dependencies; `npm run emu` → Expected: `All emulators ready`.
- [ ] **Step 2:** a smoke test `packages/engine-google/test/smoke.test.ts` that writes and reads a document with `initializeTestEnvironment` and admin rules disabled → `npm run test:google` PASS.
- [ ] **Step 3: Commit** `chore(engine-google): Firebase emulators and package skeleton`

---

### Task 2: Modello dati e regole di sicurezza

**Files:**
- Modify: `firebase/firestore.rules`
- Test: `packages/engine-google/test/rules.test.ts`

**Interfaces:**
- Produces (data model, one Firebase project = one or more invite groups):
  - `groups/{gid}`: `{ doc: Group-as-json, members: map<email, role>, ownerId: email, version: int }`
  - `activities/{id}`: `{ doc: Activity-as-json, accountId: email, groupId: string|null, version: int }`
  - `blobs/{refId}`: `{ activityId, name, mimeType, size, chunks: int }` with subcollection `chunks/{n}`: `{ data: Bytes }` (≤ 900 KB each)
  - `changes/{autoId}`: `{ type: 'activity'|'group', id, groupId: string|null, accountId: string|null, at: serverTimestamp, seq: int }`
- Rules (functions `me() = request.auth.token.email`, `verified() = request.auth.token.email_verified == true`, `role(g)`, `canSee(groupId, accountId)`):
  - nothing without `verified()`;
  - `groups` create: only `kind == 'invite'`, `members == {me(): 'owner'}`, `ownerId == me()`, `version == 2`;
  - `groups` update: `version == resource.version + 1`; caller is a member. Owner: one owner only, equal to `ownerId`, and a transfer goes to an existing member. Member: `name`, `ownerId` and `timeZone` unchanged; the members diff only adds `member`/`guest`, removes non-owners or removes itself. Guest: may only remove itself;
  - `activities` create: `canSee`, `accountId == me()` for drafts, not a guest in the group, `version == 2`; update: `version == resource.version + 1`, `accountId` unchanged, `canSee` before and after, a guest only on activities assigned to it;
  - `blobs`/`chunks`: readable and creatable only by those who see `activityId`;
  - `changes`: create only with a matching `activities`/`groups` write in the same request (`getAfter`); readable when `canSee` (activity) or the member list before/after contains `me()` (group).

- [ ] **Step 1: Write the failing tests** with `@firebase/rules-unit-testing`, one per line of the SQL suite that applies to the Google engine (names mirror `security_test.sql`):
  `testUnverifiedEmailCannotReadOrWrite`, `testOnlyInviteGroupsCanBeCreated`, `testNewGroupStartsWithCreatorAsOnlyOwner`, `testGuestCannotTakeOverGroup`, `testGuestCannotInvite`, `testGuestCannotCreateActivities`, `testGuestCanLeave`, `testMemberCannotRemoveOwner`, `testMemberCannotMakeItselfOwner`, `testMemberCannotRenameGroup`, `testMemberCanInviteGuest`, `testVersionMustIncrementByOne`, `testDraftsPrivateToTheirAccount`, `testAccountIdNeverChanges`, `testBlobsFollowActivityVisibility`, `testRemovedMemberCanReadTheGroupChange`.
- [ ] **Step 2: Run** `npm run test:google -- rules` → Expected: FAIL (rules deny everything, so the "allowed" cases fail).
- [ ] **Step 3: Implement** `firestore.rules`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine-google): Firestore data model and security rules`

---

### Task 3: `GoogleEngine` e contratto

**Files:**
- Create: `packages/engine-google/src/google-engine.ts`, `src/errors.ts`, `src/index.ts`
- Create: `packages/engine-google/test/local-firebase.ts` (`openEmulatorBackend(): Promise<SessionFactory>`: for each account, an emulator auth user `<account>@altereos.com` with email verified via `signInWithCustomToken`/emulator REST)
- Test: `packages/engine-google/test/google-engine.test.ts` (`engineContract('GoogleEngine (emulator)', openEmulatorBackend)`), `test/blobs.test.ts`, `test/change-feed.test.ts`

**Interfaces:**
- Consumes: `Engine`, `resolveLimits`, `DomainError`, `EngineUnavailableError` (core); `engineContract`.
- Produces:
  - `class GoogleEngine implements Engine { constructor(db: Firestore, account: AccountId, limits?: Partial<EngineLimits>) }` with `kind = 'google'` and `limits = resolveLimits('google', { maxAttachmentBytes: 5_000_000, ...limits })`.
  - saves: `runTransaction`: read the stored doc, compare the version (`VERSION_CONFLICT` if it differs or, on create, if it exists), write the doc with `version + 1`, and add a `changes` doc in the same transaction.
  - reads: `getDoc`/`getDocs` on queries filtered like the rules (`where('groupId','==',g)`, drafts `where('accountId','==',me).where('groupId','==',null)`). `permission-denied` on a doc that exists → `FORBIDDEN`; missing → `NOT_FOUND`. Firestore cannot tell them apart from the client: **[scelta di Claude]** `getActivity` first tries the read; a `permission-denied` maps to `FORBIDDEN`, a missing doc to `NOT_FOUND`. The rules let `get` on a non-existent id pass (`resource == null`), so the two cases stay distinct without revealing content.
  - attachments: `putAttachment` splits into chunks of 900 KB written in one batch with the `blobs` doc; `getAttachment` recomposes in order.
  - `changesSince`: query `changes` ordered by `seq` with a window below the cursor, plus a set of what was delivered (same technique as `CentralEngine`). `seq` = a per-project counter in `meta/counter`, incremented inside each save transaction.
  - errors: `toDomainError(e: FirebaseError)`: `permission-denied` → FORBIDDEN, `unavailable`/network failures → `EngineUnavailableError`, `aborted`/`failed-precondition` in a transaction → VERSION_CONFLICT.

- [ ] **Step 1: Write the failing tests**: the contract (11 tests) plus:
  ```ts
  test('testFourMegabyteAttachmentRoundTrips', /* 4_000_000 random bytes → putAttachment → getAttachment equal; > 5_000_000 → INVALID_INPUT */);
  test('testLateCommittedChangeIsStillDelivered', /* same scenario as engine-central, using seq values */);
  ```
- [ ] **Step 2: Run** `npm run test:google` → FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** → PASS (contract 11/11, blobs, change feed, rules from Task 2).
- [ ] **Step 5: Commit** `feat(engine-google): Firestore engine passing the engine contract`

---

### Task 4: Spazio di lavoro su più motori

**Files:**
- Modify: `apps/web/src/session/session.ts`, `apps/web/src/workspace/useWorkspace.tsx`, `apps/web/src/session/central.ts`
- Create: `apps/web/src/workspace/routing.ts`
- Test: `apps/web/test/multi-engine.test.tsx`

**Interfaces:**
- Produces:
  - `interface Session { account; primary: Engine; engines: Engine[]; personalGroupId; outbox; signOut; addEngine(e: Engine): void }`. `engine` is renamed `primary`, the engine of drafts and the personal group; `engines` includes it.
  - `class EngineRouter { constructor(engines: Engine[]); forGroup(groupId: GroupId | null): Engine; register(groups: Group[], engine: Engine): void }`: a group belongs to the engine that listed it; `null` (drafts) → primary. An unknown group → `NOT_FOUND`.
  - `useWorkspace(engines: Engine[])` loads from every engine in parallel; an engine that is down does not stop the others (`EngineUnavailableError` → per-engine notice, the rest stays usable). `save`/`saveGroup` go through the router. One cursor per engine.
- Moving a draft into a group of another engine: **[scelta di Claude]** a copy on the destination engine (same id, history kept), then archive on the source. `moveToGroup` in the core is unchanged; the web layer handles the copy.

- [ ] **Step 1: Write the failing tests** with two `InMemoryBackend`s posing as two engines:
  ```tsx
  test('testAgendaMergesTwoEngines', /* domain group on A, invite group on B: both in the agenda */);
  test('testSaveGoesToTheOwningEngine', /* edit an activity of B: B has version+1, A unchanged */);
  test('testDraftMovedToOtherEngineIsCopiedAndArchived', /* draft on A moved into a group of B: on B with the same id, archived on A */);
  test('testOneEngineDownKeepsTheOtherUsable', /* B fails with EngineUnavailableError: A's groups visible, notice "…non raggiungibile" */);
  ```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; update every use of `session.engine` (Shell, CaptureSheet, MeView, tests). **Step 4: Run** `npm test -w @attivita/web` → PASS, all suites.
- [ ] **Step 5: Commit** `feat(web): workspace over several engines`

---

### Task 5: Procedura guidata "Nuovo gruppo su Google"

**Files:**
- Create: `apps/web/src/session/google.ts` (the only `firebase` import in the app)
- Create: `apps/web/src/groups/GoogleGroupWizard.tsx`
- Create: `apps/web/src/groups/firebase-rules.ts` (exports the rules text, generated from `firebase/firestore.rules` by `scripts/gen-rules-module.mjs`)
- Modify: `apps/web/src/groups/GroupsView.tsx`
- Test: `apps/web/test/google-wizard.test.tsx`

**Interfaces:**
- Produces:
  - `parseFirebaseConfig(text: string): FirebaseWebConfig | null`, which accepts the JSON or the `const firebaseConfig = {...}` snippet copied from the Firebase console, and requires `apiKey`, `authDomain`, `projectId`, `appId`.
  - `connectGoogleProject(config, opts?: { emulator?: { auth: string; firestore: string } }): Promise<GoogleEngine>`: `initializeApp(config, config.projectId)`, Google login with popup (in emulator: `signInWithCredential` with a fake Google token), `persistentLocalCache` for offline. It requires `email_verified`.
  - Connected projects are remembered in localStorage (`attivita:google-projects`, configuration only, which is public by Firebase's design) and reopened at startup.
  - Wizard, 4 steps on screen: 1) "Crea un progetto Firebase" (link to the console, the free plan is enough); 2) "Attiva Firestore e il login Google" (short instructions); 3) "Pubblica le regole" (rules text with a **Copia** button); 4) "Incolla la configurazione" (textarea, then **Collega** → login → group name → **Crea gruppo**).
- **[scelta di Claude]** Inviting someone to a Google group = adding them to the group (as today) **and** that person, to enter, opening the app link with the project configuration (`?firebase=<base64 config>`), generated by an **Copia link d'invito** button. That way no central registry is needed.

- [ ] **Step 1: Write the failing tests**:
  ```tsx
  test('testParsesConsoleSnippetAndJson', /* both forms → same config; missing appId → null */);
  test('testWizardCreatesGroupOnConnectedEngine', /* connect injected with a fake engine on InMemoryBackend: after "Crea gruppo" the invite group exists on that engine, not on primary */);
  test('testInviteLinkCarriesOnlyPublicConfig', /* the link holds projectId/apiKey/appId/authDomain and nothing else */);
  ```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**. **Step 4: Run** → PASS.
- [ ] **Step 5: Manual check** with the emulators running and `VITE_FIREBASE_EMULATOR=1`: pippo (central session) opens the wizard, pastes the `demo-memo-land` configuration, logs in with the emulator, creates "famiglia", invites pluto, and copies the link. Pluto opens the link in another session and sees the group. Both edit an activity and see the other's change. Write the result in the ledger.
- [ ] **Step 6: Commit** `feat(web): guided setup for groups on a Google Firebase project`

---

## Cosa resta fuori

- Apps Script per timer, Telegram, email e feed iCal (piano notifiche).
- Push dai gruppi Google (eventuale, via Firebase Cloud Messaging).
- Scelta del motore per il gruppo personale e collegamento di più account (piano persona).
- Prova su un progetto Firebase vero: un passo di rilascio, con l'utente.
