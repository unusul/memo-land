import type { GroupId } from '@attivita/core';
import { googleConfigOf } from '../session/google-config.js';
import { useWs } from '../workspace/useWorkspace.js';

/** Where the group's data are: on the server of whoever publishes the app, or in the person's own Google project. */
export function ManagedBy({ groupId }: { groupId: GroupId }) {
  const ws = useWs();
  const google = googleConfigOf(ws.engineOf(groupId));
  return google
    ? <span className="pill" title={`progetto ${google.projectId}`}>gestione privata</span>
    : <span className="pill">gestito da terzi</span>;
}
