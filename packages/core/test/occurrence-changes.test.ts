import { expect, test } from 'vitest';
import {
  complete, leaveGroup, leaveOccurrence, moveOccurrence, occurrencesBetween, reopenOccurrence, restoreOccurrence, setProp, skipOccurrence, takeOccurrence,
} from '../src/index.js';
import type { Activity } from '../src/index.js';
import { domainGroup, series, t1, t2 } from './fixtures.js';

const week = (s: Activity) => occurrencesBetween(s, '2026-10-26T00:00', '2026-11-01T23:59');

/** A skipped occurrence stays in the agenda, struck through like a done one (user's choice, 2026-11-16). */
test('testSkippedOccurrenceStaysMarkedSkipped', () => {
  const s = skipOccurrence(series, '2026-10-27T09:00', 'pluto', 'member', t1);
  expect(week(s).map(o => [o.start, o.skipped])).toEqual([['2026-10-27T09:00', true], ['2026-10-29T09:00', undefined]]);
  expect(s.history.at(-1)).toMatchObject({ kind: 'occurrenceSkipped', by: 'pluto', detail: { key: '2026-10-27T09:00' } });
});

test('testRestoreBringsASkippedOccurrenceBack', () => {
  const s = restoreOccurrence(skipOccurrence(series, '2026-10-27T09:00', 'pluto', 'member', t1), '2026-10-27T09:00', 'pluto', 'member', t2);
  expect(week(s).map(o => o.skipped)).toEqual([undefined, undefined]);
  expect(s.overrides).toEqual({});
  expect(s.history.at(-1)).toMatchObject({ kind: 'occurrenceRestored', detail: { key: '2026-10-27T09:00' } });
});

/**
 * A moved occurrence shows twice: struck through on its own day with where it went, and on the new day with where it
 * came from (user's choice, 2026-11-16). It keeps its key and its duration.
 */
test('testMovedOccurrenceShowsOnBothDays', () => {
  const s = moveOccurrence(series, '2026-10-27T09:00', '2026-10-30T20:00', 'pluto', 'member', t1);
  expect(week(s).map(o => [o.key, o.start, o.end, o.movedTo, o.movedFrom])).toEqual([
    ['2026-10-27T09:00', '2026-10-27T09:00', '2026-10-27T09:30', '2026-10-30T20:00', undefined],
    ['2026-10-29T09:00', '2026-10-29T09:00', '2026-10-29T09:30', undefined, undefined],
    ['2026-10-27T09:00', '2026-10-30T20:00', '2026-10-30T20:30', undefined, '2026-10-27T09:00'],
  ]);
  expect(s.history.at(-1)).toMatchObject({ kind: 'occurrenceMoved', detail: { key: '2026-10-27T09:00', to: '2026-10-30T20:00' } });
});

/** The new day is found on its own, even when the original day is outside the range asked. */
test('testMovedOccurrenceFoundOutsideItsOwnWeek', () => {
  const s = moveOccurrence(series, '2026-10-27T09:00', '2026-11-04T07:00', 'pluto', 'member', t1);
  expect(occurrencesBetween(s, '2026-11-04T00:00', '2026-11-04T23:59')).toEqual([
    expect.objectContaining({ key: '2026-10-27T09:00', start: '2026-11-04T07:00', movedFrom: '2026-10-27T09:00' }),
  ]);
});

test('testMovingAgainKeepsTheLatestDayAndRestoreGoesBack', () => {
  let s = moveOccurrence(series, '2026-10-27T09:00', '2026-10-30T20:00', 'pluto', 'member', t1);
  s = moveOccurrence(s, '2026-10-27T09:00', '2026-10-31T10:00', 'pluto', 'member', t1);
  expect(week(s).map(o => o.start)).toEqual(['2026-10-27T09:00', '2026-10-29T09:00', '2026-10-31T10:00']);
  expect(week(s)[0]?.movedTo).toBe('2026-10-31T10:00');
  s = restoreOccurrence(s, '2026-10-27T09:00', 'pluto', 'member', t2);
  expect(week(s).map(o => [o.start, o.movedTo])).toEqual([['2026-10-27T09:00', undefined], ['2026-10-29T09:00', undefined]]);
});

/** Skipping a moved occurrence skips it on its own day; moving a skipped one brings it back on the new day. */
test('testSkipAndMoveReplaceEachOther', () => {
  const moved = moveOccurrence(series, '2026-10-27T09:00', '2026-10-30T20:00', 'pluto', 'member', t1);
  const skipped = skipOccurrence(moved, '2026-10-27T09:00', 'pluto', 'member', t1);
  expect(week(skipped).map(o => [o.start, o.skipped, o.movedTo])).toEqual([['2026-10-27T09:00', true, undefined], ['2026-10-29T09:00', undefined, undefined]]);
  const back = moveOccurrence(skipped, '2026-10-27T09:00', '2026-10-30T20:00', 'pluto', 'member', t1);
  expect(week(back).map(o => o.start)).toEqual(['2026-10-27T09:00', '2026-10-29T09:00', '2026-10-30T20:00']);
  expect(week(back)[0]?.skipped).toBeUndefined();
});

/** A cover survives a skip and a move: the person who took the occurrence keeps it on the new day. */
test('testCoverFollowsTheMove', () => {
  let s = takeOccurrence(series, '2026-10-27T09:00', 'pluto', 'member', t1);
  s = moveOccurrence(s, '2026-10-27T09:00', '2026-10-30T20:00', 'pippo', 'member', t1);
  expect(week(s).at(-1)).toMatchObject({ start: '2026-10-30T20:00', assignee: 'pluto', coveredFor: 'pippo' });
});

test('testDoneOnTheNewDayAndReopenTakesItBack', () => {
  let s = moveOccurrence(series, '2026-10-27T09:00', '2026-10-30T20:00', 'pluto', 'member', t1);
  s = complete(s, 'pippo', '2026-10-30T20:30', t1, '2026-10-27T09:00');
  expect(week(s).map(o => [o.start, o.done])).toEqual([['2026-10-27T09:00', undefined], ['2026-10-29T09:00', undefined], ['2026-10-30T20:00', true]]);
  s = reopenOccurrence(s, '2026-10-27T09:00', 'pippo', t2);
  expect(week(s).map(o => o.done)).toEqual([undefined, undefined, undefined]);
  expect(s.history.at(-1)).toMatchObject({ kind: 'occurrenceReopened', by: 'pippo', detail: { key: '2026-10-27T09:00' } });
});

/** Done again after a reopen counts: the last word in the history wins. */
test('testCompleteAfterReopenIsDoneAgain', () => {
  let s = complete(series, 'pippo', '2026-10-27T09:30', t1, '2026-10-27T09:00');
  s = reopenOccurrence(s, '2026-10-27T09:00', 'pippo', t1);
  s = complete(s, 'pippo', '2026-10-27T09:40', t2, '2026-10-27T09:00');
  expect(week(s)[0]?.done).toBe(true);
});

test('testReopenRejectsAnOccurrenceNotDone', () => {
  expect(() => reopenOccurrence(series, '2026-10-27T09:00', 'pippo', t1)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
});

/** Without a key, «Fatto» goes to the latest occurrence still to do: not a skipped one, nor the day a moved one left. */
test('testCompleteWithoutKeyLeavesSkippedAndMovedAway', () => {
  let s = skipOccurrence(series, '2026-10-29T09:00', 'pippo', 'member', t1);
  s = moveOccurrence(s, '2026-10-27T09:00', '2026-10-31T10:00', 'pippo', 'member', t1);
  s = complete(s, 'pippo', '2026-10-30T12:00', t1);
  expect(s.history.at(-1)).toMatchObject({ kind: 'completed', detail: { key: '2026-10-22T09:00' } });
});

test('testChangesRejectGuestsNonOccurrencesAndBadDates', () => {
  expect(() => skipOccurrence(series, '2026-10-27T09:00', 'g9', 'guest', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(() => moveOccurrence(series, '2026-10-27T09:00', '2026-10-30T20:00', 'g9', 'guest', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(() => restoreOccurrence(series, '2026-10-27T09:00', 'g9', 'guest', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(() => skipOccurrence(series, '2026-10-28T09:00', 'pluto', 'member', t1)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  // A timed series moves to a day and a time; a series of whole days to a day.
  expect(() => moveOccurrence(series, '2026-10-27T09:00', '2026-10-30', 'pluto', 'member', t1)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
});

test('testWholeDaySeriesMovesToADay', () => {
  const days: Activity = { ...series, props: { due: '2026-10-20', repeat: { mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH' } } };
  const s = moveOccurrence(days, '2026-10-27', '2026-10-31', 'pluto', 'member', t1);
  expect(week(s).map(o => [o.start, o.movedTo, o.movedFrom])).toEqual([
    ['2026-10-27', '2026-10-31', undefined], ['2026-10-29', undefined, undefined], ['2026-10-31', undefined, '2026-10-27'],
  ]);
});

/** Removing Tuesday from the series drops what was skipped or moved on Tuesdays, as covers are dropped today. */
test('testChangingTheDaysDropsSkipsAndMovesOfDaysGone', () => {
  let s = skipOccurrence(series, '2026-10-27T09:00', 'pluto', 'member', t1);
  s = moveOccurrence(s, '2026-10-29T09:00', '2026-10-30T20:00', 'pluto', 'member', t1);
  s = setProp(s, 'repeat', { mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TH' }, 'u1', t2);
  expect(Object.keys(s.overrides)).toEqual(['2026-10-29T09:00']);
});

/** Leaving the group drops the account's covers, not the skips and moves on the same occurrences. */
test('testLeavingKeepsSkipsAndMoves', () => {
  let s = takeOccurrence(series, '2026-10-27T09:00', 'pluto', 'member', t1);
  s = moveOccurrence(s, '2026-10-27T09:00', '2026-10-30T20:00', 'pluto', 'member', t1);
  const { changed } = leaveGroup(domainGroup, 'pluto', [s], 'left', t2);
  expect(changed[0]?.overrides).toEqual({ '2026-10-27T09:00': { moved: '2026-10-30T20:00' } });
});

/**
 * The way back from «Copro io questa» (user's bug, 2026-11-17: «se mi prendo una attività non la posso lasciare»): the
 * occurrence goes back to the series' assignee, and keeps a move made meanwhile. Before, nothing gave it back.
 */
test('testLeaveGivesTheCoveredOccurrenceBack', () => {
  let s = takeOccurrence(series, '2026-10-27T09:00', 'pluto', 'member', t1);
  s = moveOccurrence(s, '2026-10-27T09:00', '2026-10-30T20:00', 'pippo', 'member', t1);
  s = leaveOccurrence(s, '2026-10-27T09:00', 'pluto', t2);
  expect(week(s).at(-1)).toMatchObject({ start: '2026-10-30T20:00', assignee: 'pippo' });
  expect(week(s).at(-1)?.coveredFor).toBeUndefined();
  expect(s.overrides['2026-10-27T09:00']).toEqual({ moved: '2026-10-30T20:00' });
  expect(s.history.at(-1)).toMatchObject({ kind: 'occurrenceLeft', by: 'pluto', detail: { key: '2026-10-27T09:00' } });
  expect(leaveOccurrence(takeOccurrence(series, '2026-10-27T09:00', 'pluto', 'member', t1), '2026-10-27T09:00', 'pluto', t2).overrides).toEqual({});
});

/** Only who covered it gives it back: not another member, nor an occurrence nobody covered. */
test('testOnlyWhoCoveredLeaves', () => {
  const s = takeOccurrence(series, '2026-10-27T09:00', 'pluto', 'member', t1);
  expect(() => leaveOccurrence(s, '2026-10-27T09:00', 'pippo', t2)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(() => leaveOccurrence(series, '2026-10-29T09:00', 'pluto', t2)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
});
