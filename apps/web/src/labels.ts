import { DomainError } from '@attivita/core';
import type { DomainErrorCode, GroupKind, HistoryEntry, PropKey, Shape } from '@attivita/core';

export const SHAPE_LABEL: Record<Shape, string> = {
  draft: 'bozza', idea: 'idea', waiting: 'in attesa', snoozed: 'rimandata', recurring: 'ricorrente',
  event: 'evento', task: 'cosa da fare', archived: 'archiviata', done: 'fatta',
};

export const PROP_LABEL: Record<PropKey, string> = {
  due: 'Scadenza', schedule: 'Data e ora', repeat: 'Ripeti', assignment: 'Assegna',
  waitingFor: 'In attesa di…', resumeAt: 'Riprendi il…', parentId: 'Sotto-attività',
};

export const KIND_LABEL: Record<GroupKind, string> = { personal: 'personale', domain: 'dominio', invite: 'su invito' };

const ERROR_LABEL: Record<DomainErrorCode, string> = {
  FORBIDDEN: 'Non hai il permesso di farlo',
  REASON_REQUIRED: 'Serve un motivo',
  INVALID_STATE: 'Non si può fare in questo stato',
  INVALID_INPUT: 'Valore non valido',
  NOT_FOUND: 'Non l\'ho trovata',
  VERSION_CONFLICT: 'Qualcun altro l\'ha appena modificata: ho ricaricato la versione aggiornata.',
};

export function errorText(e: unknown): string {
  if (e instanceof DomainError) return ERROR_LABEL[e.code];
  return 'Qualcosa non ha funzionato: controlla la connessione e riprova.';
}

const short = (who: string) => who.split('@')[0] ?? who;

export function historyText(h: HistoryEntry): string {
  const who = short(h.by);
  const d = h.detail ?? {};
  switch (h.kind) {
    case 'created': return `${who} l'ha creata`;
    case 'propSet': return `${who} ha impostato ${PROP_LABEL[d['key'] as PropKey] ?? d['key']}`;
    case 'propRemoved': return `${who} ha tolto ${PROP_LABEL[d['key'] as PropKey] ?? d['key']}`;
    case 'assigned': return `${who} l'ha assegnata a ${short(String(d['assignee']))}`;
    case 'accepted': return `${who} ha accettato`;
    case 'rejected': return `${who} ha rifiutato: ${d['reason']}`;
    case 'claimed': return `${who} se l'è presa`;
    case 'conditionMet': return `${who} ha segnato la condizione come avverata`;
    case 'completed': return `${who} l'ha segnata come fatta`;
    case 'occurrenceTaken': return `${who} copre l'occorrenza ${String(d['key']).replace('T', ' ')}`;
    case 'unassignedOnLeave': return `${who} è uscito dal gruppo: ${d['reason']}`;
    case 'snoozed': return `${who} l'ha rimandata al ${d['until']}`;
    case 'resumed': return 'è tornata dal rimando';
    case 'archived': return `${who} l'ha archiviata`;
    case 'movedToGroup': return `${who} l'ha spostata in un gruppo`;
    case 'decomposed': return `${who} l'ha scomposta`;
  }
}

export { short as shortName };
