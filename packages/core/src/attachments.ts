import { fail } from './errors.js';
import { touch } from './props.js';
import type { AccountId, Activity, Instant } from './types.js';

/**
 * Takes a file or an image away from the activity (user's choice, 2026-11-18). Only the reference goes: the file stays
 * in the engine's storage until the engines can delete one (a change of their contract, kept for later with the other
 * engine work).
 */
export function removeAttachment(a: Activity, attachmentId: string, by: AccountId, now: Instant): Activity {
  const file = a.attachments.find(f => f.id === attachmentId);
  if (!file) fail('INVALID_INPUT', `"${attachmentId}" is not attached to this activity`);
  return touch({ ...a, attachments: a.attachments.filter(f => f.id !== attachmentId) }, { kind: 'attachmentRemoved', detail: { name: file.name } }, by, now);
}
