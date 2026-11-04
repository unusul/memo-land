import { fail } from '@attivita/core';
import type { Engine, Group, GroupId } from '@attivita/core';

/** Sends each operation to the engine that owns the group; drafts (no group) live on the primary engine. */
export class EngineRouter {
  private readonly owners = new Map<GroupId, Engine>();

  /** engines[0] is the primary engine. */
  constructor(private readonly engines: Engine[]) {}

  get primary(): Engine {
    return this.engines[0] ?? fail('INVALID_STATE', 'no engine');
  }

  /** A group belongs to the engine that listed it. */
  register(groups: Group[], engine: Engine): void {
    for (const g of groups) this.owners.set(g.id, engine);
  }

  forGroup(groupId: GroupId | null): Engine {
    if (groupId === null) return this.primary;
    return this.owners.get(groupId) ?? fail('NOT_FOUND', `group ${groupId} is on no connected engine`);
  }
}
