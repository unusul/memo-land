import { screen, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { linksIn } from '../src/activity/Links.js';
import { memorySession, renderWithSession } from './memory-session.js';

test('testLinksInFindsAddressesOnceWithoutTrailingPunctuation', () => {
  expect(linksIn('https://play.google.com/store/apps/details?id=epson.print&hl=it', 'vedi (https://esempio.it/a), poi http://esempio.it/b. E di nuovo https://esempio.it/a!'))
    .toEqual(['https://play.google.com/store/apps/details?id=epson.print&hl=it', 'https://esempio.it/a', 'http://esempio.it/b']);
  expect(linksIn('niente qui', 'nemmeno www.esempio.it senza https')).toEqual([]);
});

/** Title and text are fields to write in: an address in them opens from a row of links under them. */
test('testAddressInTheTitleOpensFromALinkUnderTheText', async () => {
  const s = memorySession();
  const { activity } = await s.primary.getActivity('idea');
  await s.primary.saveActivity({ ...activity, title: 'https://play.google.com/store/apps/details?id=epson.print&hl=it' }, activity.version);
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  const links = await screen.findByRole('list', { name: 'Link' });
  const a = within(links).getByRole('link', { name: /play\.google\.com/ }) as HTMLAnchorElement;
  expect(a.href).toBe('https://play.google.com/store/apps/details?id=epson.print&hl=it');
  expect(a.target).toBe('_blank');
  expect(a.rel).toContain('noopener');
});

test('testNoLinksNoRow', async () => {
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession());
  await screen.findByRole('button', { name: '+ Allega' });
  expect(screen.queryByRole('list', { name: 'Link' })).toBeNull();
});
