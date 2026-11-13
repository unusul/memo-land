import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { InMemoryBackend, newActivity } from '@attivita/core';
import type { Activity, EngineLimits, Group } from '@attivita/core';
import { memoryOutboxStore } from '../src/offline/outbox.js';
import { SessionHost } from '../src/session/SessionContext.js';
import type { OpenedSession } from '../src/session/session.js';
import { WorkspaceProvider } from '../src/workspace/useWorkspace.js';

export const PIPPO = 'pippo@altereos.com';
export const PLUTO = 'pluto@altereos.com';
export const OSPITE = 'ospite@esterno.it';
const T0 = '2026-11-01T08:00:00Z';

const groups: Group[] = [
  { id: `personal:${PIPPO}`, kind: 'personal', name: 'Personale', ownerId: PIPPO, timeZone: 'Europe/Rome', members: { [PIPPO]: 'owner' }, version: 1 },
  { id: `personal:${PLUTO}`, kind: 'personal', name: 'Personale', ownerId: PLUTO, timeZone: 'Europe/Rome', members: { [PLUTO]: 'owner' }, version: 1 },
  { id: 'domain:altereos.com', kind: 'domain', name: 'altereos.com', domain: 'altereos.com', timeZone: 'Europe/Rome', members: { [PIPPO]: 'member', [PLUTO]: 'member' }, version: 1 },
  { id: 'inv:developers', kind: 'invite', name: 'developers', ownerId: PIPPO, timeZone: 'Europe/Rome', members: { [PIPPO]: 'owner', [PLUTO]: 'member', [OSPITE]: 'guest' }, version: 1 },
];

function mk(id: string, by: string, title: string, groupId: string | null, props: Activity['props'] = {}, body = ''): Activity {
  return { ...newActivity({ id, accountId: by, title, body, groupId }, T0), props };
}

/** The test bench data: a series pippo owns, a twice-monthly review, a proposal to pluto, a waiting memo, a draft. */
export const benchActivities: Activity[] = [
  mk('idea', PIPPO, 'app gestione core', null, {}, 'Idea avuta durante la corsa.'),
  mk('backup', PIPPO, 'Controllo backup', 'domain:altereos.com', {
    schedule: { start: '2026-10-20T09:00', end: '2026-10-20T09:30' }, repeat: { mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH' },
    assignment: { state: 'accepted', assignee: PIPPO, assignedBy: PIPPO } }),
  mk('sal', PIPPO, 'Stato avanzamento', 'domain:altereos.com', {
    schedule: { start: '2026-11-01T15:00', end: '2026-11-01T15:45' }, repeat: { mode: 'calendar', rrule: 'FREQ=MONTHLY;BYMONTHDAY=1,15' } }),
  mk('costi', PIPPO, 'Analisi costi', 'inv:developers', { due: '2026-11-06', assignment: { state: 'proposed', assignee: PLUTO, assignedBy: PIPPO } }),
  mk('doc', PLUTO, 'Aggiornare la documentazione', 'domain:altereos.com', { waitingFor: { condition: 'chiusura della ops 412' }, due: '2026-11-12' }),
];

export function benchBackend(limits: Partial<EngineLimits> = {}): InMemoryBackend {
  const backend = new InMemoryBackend(limits);
  for (const g of groups) backend.groups.set(g.id, structuredClone(g));
  for (const a of benchActivities) backend.activities.set(a.id, structuredClone(a));
  return backend;
}

export function memorySession(account: string = PIPPO, limits: Partial<EngineLimits> = {}, backend = benchBackend(limits)): OpenedSession {
  const engine = backend.session(account);
  return {
    account, primary: engine, engines: [engine], personalGroupId: `personal:${account}`,
    outbox: memoryOutboxStore(), signOut: async () => undefined,
  };
}

export function renderWithSession(ui: ReactElement, session: OpenedSession) {
  return render(<SessionHost session={session}><WorkspaceProvider>{ui}</WorkspaceProvider></SessionHost>);
}

export function userClick(name: string | RegExp): void {
  fireEvent.click(screen.getByRole('button', { name }));
}

export function userType(el: HTMLElement, text: string): void {
  fireEvent.change(el, { target: { value: text } });
}

export function firePaste(target: HTMLElement, file: File): void {
  fireEvent.paste(target, { clipboardData: { files: [file], items: [{ kind: 'file', type: file.type, getAsFile: () => file }], getData: () => '' } });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A group's row in Noi: the button that opens the group. */
export function groupRow(name: string): Promise<HTMLElement> {
  return screen.findByRole('button', { name: new RegExp(`^Apri ${escape(name)}(,|$)`) });
}

/** Opens a group's management page from its ⋯ in Noi, and gives the page. */
export async function manage(name: string): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: `Gestisci ${name}` }));
  return screen.findByRole('article', { name });
}
