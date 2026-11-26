import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { groupLabels, newActivity } from '@attivita/core';
import type { Activity, Group } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { GroupList, GroupsView } from '../src/groups/GroupsView.js';
import { ToastHost } from '../src/shell/toast.js';
import { PIPPO, PLUTO, manage, memorySession, renderWithSession } from './memory-session.js';

/*
 * Labels (user's choices, 2026-11-26): each group has its list, «memo» from the start, one word in lower case each;
 * an activity takes labels from it in the detail, and in the group's list it is under its first label, there only.
 */

test('testTheGroupsLabelsInNoi', async () => {
  const s = memorySession();
  renderWithSession(<GroupsView />, s);
  const page = await manage('altereos.com');
  const labels = within(page).getByRole('region', { name: /Etichette di/ });
  expect(within(labels).getByText('memo')).toBeTruthy();
  fireEvent.change(within(labels).getByRole('textbox', { name: 'Nuova etichetta' }), { target: { value: 'Casa Mia' } });
  expect((within(labels).getByRole('textbox', { name: 'Nuova etichetta' }) as HTMLInputElement).value).toBe('casamia');
  fireEvent.click(within(labels).getByRole('button', { name: 'Aggiungi' }));
  expect(await within(labels).findByText('casamia')).toBeTruthy();
  fireEvent.click(within(labels).getByRole('button', { name: 'Togli memo' }));
  await waitFor(() => expect(within(labels).queryByText('memo')).toBeNull());
  const all = await s.primary.listActivities('domain:altereos.com');
  expect(groupLabels(all, 'domain:altereos.com')).toEqual(['casamia']);
});

test('testALabelInTheDetail', async () => {
  const s = memorySession();
  renderWithSession(<ToastHost><ActivityDetail activityId="backup" onClose={() => undefined} /></ToastHost>, s);
  fireEvent.click(await screen.findByRole('button', { name: 'Etichette' }));
  fireEvent.click(within(screen.getByRole('menu', { name: 'Etichette' })).getByRole('menuitemradio', { name: 'memo' }));
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.labels).toEqual(['memo']));
  expect(await screen.findByRole('button', { name: 'Etichette' })).toHaveProperty('textContent', 'memo');
});

test('testALabelledActivityIsUnderItsLabelOnly', () => {
  const group: Group = { id: 'inv:casa', kind: 'invite', name: 'Casa', ownerId: PIPPO, timeZone: 'Europe/Rome', members: { [PIPPO]: 'owner', [PLUTO]: 'member' }, version: 1 };
  const mk = (id: string, extra: Partial<Activity> = {}): Activity => ({ ...newActivity({ id, accountId: PIPPO, title: id, groupId: group.id }, '2026-11-01T08:00:00Z'), ...extra });
  renderWithSession(<GroupList label="Casa" group={group} onOpen={() => undefined} activities={[mk('codice cancello', { labels: ['memo'] }), mk('idea vacanze')]} />, memorySession());
  const sections = [...document.querySelectorAll('.group-list .attention')].map(d => [d.querySelector('h4')!.textContent, [...d.querySelectorAll('.t')].map(t => t.textContent)]);
  expect(sections).toEqual([['memo', ['codice cancello']], ['Idee', ['idea vacanze']]]);
});

/** A new label from the activity's menu (user's request, 2026-11-26, «come avvisi»): into the group's list, and on. */
test('testANewLabelFromTheDetail', async () => {
  const s = memorySession();
  renderWithSession(<ToastHost><ActivityDetail activityId="backup" onClose={() => undefined} /></ToastHost>, s);
  fireEvent.click(await screen.findByRole('button', { name: 'Etichette' }));
  const menu = screen.getByRole('menu', { name: 'Etichette' });
  fireEvent.change(within(menu).getByRole('textbox', { name: 'Nuova etichetta' }), { target: { value: 'Server ' } });
  fireEvent.click(within(menu).getByRole('button', { name: "Aggiungi l'etichetta" }));
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.labels).toEqual(['server']));
  expect(groupLabels(await s.primary.listActivities('domain:altereos.com'), 'domain:altereos.com')).toEqual(['memo', 'server']);
});
