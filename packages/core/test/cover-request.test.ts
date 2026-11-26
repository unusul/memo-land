import { expect, test } from 'vitest';
import { acceptCover, askCover, coverAskOf, holderOf, leaveOccurrence, needsAttention, occurrencesBetween, refuseCover, takeOccurrence, withdrawCover } from '../src/index.js';
import { domainGroup, series, t1, t2 } from './fixtures.js';

/*
 * «Copri tu questa» (user's choices, 2026-11-26): who has a time of a series asks a member to cover it; until an answer
 * the time stays the asker's. Rifiuta has an optional reason; the asker may withdraw. Accetta gives the time as «Copro
 * io questa». Before, a time could only be taken by whoever wanted it.
 */

const thu = '2026-11-26T09:00';

test('testAskAndAccept', () => {
  const asked = askCover(series, thu, 'pluto', 'pippo', 'member', 'member', t1);
  expect(coverAskOf(asked, thu)).toEqual({ to: 'pluto', by: 'pippo' });
  expect(holderOf(asked, thu)).toBe('pippo');
  const occ = occurrencesBetween(asked, '2026-11-26T00:00', '2026-11-26T23:59')[0]!;
  expect(occ).toMatchObject({ assignee: 'pippo', asked: { to: 'pluto', by: 'pippo' } });
  const taken = acceptCover(asked, thu, 'pluto', t2);
  expect(taken.overrides[thu]).toEqual({ assignee: 'pluto', takenBy: 'pluto' });
  expect(occurrencesBetween(taken, '2026-11-26T00:00', '2026-11-26T23:59')[0]).toMatchObject({ assignee: 'pluto', coveredFor: 'pippo' });
  expect(taken.history.slice(-2).map(h => h.kind)).toEqual(['coverAsked', 'coverAccepted']);
  // «Lascia questa volta» gives it back to the series' assignee.
  expect(holderOf(leaveOccurrence(taken, thu, 'pluto', t2), thu)).toBe('pippo');
});

/** Only who has the time asks; not a guest, not to oneself, not a time the series does not have. */
test('testWhoMayAsk', () => {
  expect(() => askCover(series, thu, 'pippo', 'pluto', 'member', 'member', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(() => askCover(series, thu, 'pluto', 'pippo', 'guest', 'member', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(() => askCover(series, thu, 'ospite', 'pippo', 'member', 'guest', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(() => askCover(series, thu, 'pippo', 'pippo', 'member', 'member', t1)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  expect(() => askCover(series, '2026-11-25T09:00', 'pluto', 'pippo', 'member', 'member', t1)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  // Who covers a time asks for it, not the series' assignee any more.
  const covered = takeOccurrence(series, thu, 'pluto', 'member', t1);
  expect(() => askCover(covered, thu, 'pluto', 'pippo', 'member', 'member', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(coverAskOf(askCover(covered, thu, 'pippo', 'pluto', 'member', 'member', t1), thu)).toEqual({ to: 'pippo', by: 'pluto' });
});

/** Rifiuta with or without a reason: the asker sees it and may ask someone else, or clear it. Only the one asked answers. */
test('testRefuseAndWithdraw', () => {
  const asked = askCover(series, thu, 'pluto', 'pippo', 'member', 'member', t1);
  expect(() => refuseCover(asked, thu, 'pippo', '', t2)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  const no = refuseCover(asked, thu, 'pluto', ' dal medico ', t2);
  expect(coverAskOf(no, thu)).toEqual({ to: 'pluto', by: 'pippo', refused: true, reason: 'dal medico' });
  expect(coverAskOf(refuseCover(asked, thu, 'pluto', '  ', t2), thu)).toEqual({ to: 'pluto', by: 'pippo', refused: true });
  expect(() => acceptCover(no, thu, 'pluto', t2)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
  expect(holderOf(no, thu)).toBe('pippo');
  expect(coverAskOf(askCover(no, thu, 'u9', 'pippo', 'member', 'member', t2), thu)).toEqual({ to: 'u9', by: 'pippo' });
  expect(() => withdrawCover(asked, thu, 'pluto', t2)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(withdrawCover(asked, thu, 'pippo', t2).overrides[thu]).toBeUndefined();
  // Whoever takes the time meanwhile, the request goes.
  expect(coverAskOf(takeOccurrence(asked, thu, 'u9', 'member', t2), thu)).toBeUndefined();
});

/** In «Proposte a te» of the one asked, from today on and not refused; counted in the badge. */
test('testAskedTimesWaitForTheAccount', () => {
  const asked = askCover(askCover(series, thu, 'pluto', 'pippo', 'member', 'member', t1), '2026-11-19T09:00', 'pluto', 'pippo', 'member', 'member', t1);
  const att = needsAttention([{ group: domainGroup, activities: [asked] }], 'pluto', '2026-11-25');
  expect(att.coverAsks.map(r => [r.key, r.by])).toEqual([[thu, 'pippo']]);
  expect(att.count).toBe(1);
  const refused = refuseCover(asked, thu, 'pluto', '', t2);
  expect(needsAttention([{ group: domainGroup, activities: [refused] }], 'pluto', '2026-11-25').coverAsks).toEqual([]);
  expect(needsAttention([{ group: domainGroup, activities: [asked] }], 'pippo', '2026-11-25').coverAsks).toEqual([]);
});
