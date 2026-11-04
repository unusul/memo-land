import { expect, test } from 'vitest';
import { draft } from '@attivita/core/test/fixtures';
import { openWithTeam } from './local-firebase.js';

const inTeam = { ...draft, accountId: 'pippo', groupId: 'team' };

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 65_536) crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65_536)));
  return out;
}

/** Firestore documents hold at most 1 MiB: a 4 MB file is split in chunks and must come back byte for byte. */
test('testFourMegabyteAttachmentRoundTrips', async () => {
  const e = (await openWithTeam())('pippo');
  await e.saveActivity(inTeam, null);
  const bytes = randomBytes(4_000_000);
  const ref = await e.putAttachment(inTeam.id, { name: 'big.bin', mimeType: 'application/octet-stream', bytes });
  expect(ref.size).toBe(4_000_000);
  const back = await e.getAttachment(ref);
  expect(back.byteLength).toBe(bytes.byteLength);
  expect(back.every((b, i) => b === bytes[i])).toBe(true);

  const tooBig = new Uint8Array(5_000_001);
  await expect(e.putAttachment(inTeam.id, { name: 'x.bin', mimeType: 'application/octet-stream', bytes: tooBig }))
    .rejects.toMatchObject({ code: 'INVALID_INPUT' });
});

test('testEmptyAttachmentRoundTrips', async () => {
  const e = (await openWithTeam())('pippo');
  await e.saveActivity(inTeam, null);
  const ref = await e.putAttachment(inTeam.id, { name: 'empty.txt', mimeType: 'text/plain', bytes: new Uint8Array() });
  expect((await e.getAttachment(ref)).byteLength).toBe(0);
});
