import { expect, test } from 'vitest';
import { archive, editText, rebase, setProp } from '../src/index.js';
import { t1, t2, task } from './fixtures.js';

/*
 * A change computed on a version the same person has just saved over (user's bug, 2026-11-17: text left and Archivia
 * tapped at once said «Qualcun altro l'ha appena modificata» and lost the archive): put again on the newer version,
 * field by field. Before, the second save was refused as a conflict.
 */

/** The text saved first, the archive computed on the version before it: both stay, history in order. */
test('testRebaseKeepsBothChanges', () => {
  const theirs = { ...editText(task, { body: 'una nota nuova' }, 'u1', t1), version: task.version + 1 };
  const mine = archive(task, 'u1', t2);
  const out = rebase(task, mine, theirs);
  expect([out.body, out.status, out.version, out.updatedAt]).toEqual(['una nota nuova', 'archived', theirs.version, t2]);
  expect(out.history.map(h => h.kind).slice(-2)).toEqual(['textEdited', 'archived']);
});

/** Properties merge one by one: a priority set after a due changed keeps the new due. */
test('testRebaseMergesPropsOneByOne', () => {
  const theirs = { ...setProp(task, 'due', '2026-11-20', 'u1', t1), version: task.version + 1 };
  const mine = setProp(task, 'priority', 'high', 'u1', t2);
  expect(rebase(task, mine, theirs).props).toEqual({ due: '2026-11-20', priority: 'high' });
});

/** A field taken away by the later change stays away; one it did not touch keeps the newer value. */
test('testRebaseTakesAwayWhatTheChangeRemoved', () => {
  const withDue = setProp(task, 'priority', 'low', 'u1', t1);
  const theirs = { ...editText(withDue, { title: 'nuovo titolo' }, 'u1', t1), version: withDue.version + 1 };
  const { priority: _gone, ...props } = withDue.props;
  const mine = { ...withDue, props };
  const out = rebase(withDue, mine, theirs);
  expect([out.title, out.props.priority]).toEqual(['nuovo titolo', undefined]);
});
