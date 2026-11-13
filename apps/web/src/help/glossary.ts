/**
 * The help page's texts, as agreed with the person on 2026-11-13 (MEMO-LAND/progetto/aiuto-glossario-demo-bozza.md).
 * The words are the ones the app shows: when a label changes in the app, it changes here too.
 */
export interface Term { word: string; meaning: string }
export interface TermGroup { title?: string; note?: string; terms: Term[] }
export interface Topic { topic: string; intro?: string; groups: TermGroup[] }

export const HELP: string[] = [
  'Premi + per scrivere al volo: finisce fra le bozze (sezione Io), che vedi solo tu.',
  'Apri una bozza per smistarla: in un gruppo, fra le idee personali, rimandata o scomposta.',
  "Un'attività cambia forma con le proprietà: una scadenza la rende una cosa da fare, data e ora un evento, Ripeti una ricorrente.",
  "Noi mostra i gruppi, Io le tue bozze e idee, l'agenda quello che c'è da fare giorno per giorno.",
];

const t = (word: string, meaning: string): Term => ({ word, meaning });

export const GLOSSARY: Topic[] = [
  { topic: 'Sezioni', groups: [{ terms: [
    t('Agenda', 'la vista per giorni: scadute, oggi, i prossimi giorni, di tutti i tuoi gruppi.'),
    t('Noi', 'i gruppi di cui fai parte.'),
    t('Io', 'le tue bozze e le tue idee personali.'),
    t('Bozze', 'quello che hai scritto con + e non hai ancora smistato. Le vedi solo tu.'),
    t('Idee personali', 'il tuo gruppo personale: solo tuo, nessun altro lo vede.'),
  ] }] },
  { topic: 'Gruppi', intro: 'Un gruppo si descrive in tre modi indipendenti: chi ne fa parte, cosa contiene, dove stanno i dati.', groups: [
    { title: 'Chi ne fa parte', note: 'deciso quando il gruppo nasce, non cambia', terms: [
      t('Personale', 'uno per account, solo tuo: le tue idee personali.'),
      t('Di dominio', "nasce da solo per chi ha un'email aziendale dello stesso dominio (es. @azienda.it): tutti membri alla pari, ognuno entra ed esce da sé."),
      t('Su invito', 'lo crea chiunque e invita chi vuole; ha un proprietario.'),
    ] },
    { title: 'Cosa contiene', note: 'solo nei gruppi su invito; il proprietario lo cambia quando vuole', terms: [
      t('Attività', 'attività con le loro proprietà: date, scadenze, assegnazioni. Personale e di dominio sono sempre così.'),
      t('Lista', 'una sola lista da spuntare, per esempio la spesa.'),
    ] },
    { title: 'Dove stanno i dati', note: 'deciso quando il gruppo nasce, non cambia', terms: [
      t('Gestito da terzi', "sul server di chi pubblica l'app."),
      t('Gestione privata', 'nel tuo account Google.'),
    ] },
    { terms: [t('Archiviato', 'un gruppo su invito che non si usa più: si legge ma non si modifica, finché il proprietario non lo riapre.')] },
  ] },
  { topic: 'Ruoli', groups: [{ terms: [
    t('Proprietario', 'può tutto, anche rinominare, archiviare o eliminare il gruppo.'),
    t('Membro', 'crea, modifica e assegna attività, invita altre persone.'),
    t('Ospite', 'vede tutto, accetta o rifiuta ciò che gli assegnano, chiude le proprie attività; non modifica quelle degli altri.'),
  ] }] },
  { topic: "Forme di un'attività", groups: [{ terms: [
    t('Bozza', 'scritta con + e non ancora in un gruppo.'),
    t('Idea', "un'attività senza date: la tieni lì finché non decidi."),
    t('Cosa da fare', 'ha una scadenza.'),
    t('Evento', 'ha data e ora.'),
    t('Ricorrente', 'si ripete (Ripeti).'),
    t('In attesa', 'aspetta qualcosa che non dipende dal gruppo (In attesa di…).'),
    t('Rimandata', 'sparisce fino alla data scelta, poi torna.'),
    t('Fatta', 'completata.'),
    t('Archiviata', 'messa da parte: non compare più, si può riaprire.'),
  ] }] },
  { topic: 'Proprietà', groups: [{ terms: [
    t('Scadenza', 'entro quando va fatta.'),
    t('Data e ora', 'quando succede.'),
    t('Ripeti', "ogni quanto si ripete: a calendario fisso, oppure dal giorno in cui l'hai fatta l'ultima volta."),
    t('Assegna', "chi la deve fare; la persona l'accetta o la rifiuta con un motivo."),
    t('In attesa di…', 'cosa si aspetta; chiunque nel gruppo può segnarla come avverata.'),
    t('Riprendi il…', 'la data in cui una rimandata torna.'),
    t('Sotto-attività', "un pezzo di un'attività più grande."),
    t('Lista', "voci da spuntare dentro un'attività."),
    t('Lista fissa', 'in una ricorrente, a ogni «Fatto» toglie solo le spunte e tiene le voci.'),
  ] }] },
  { topic: 'Azioni', groups: [{ terms: [
    t('Smistare', 'decidere dove va una bozza.'),
    t('Me la prendo', "ti assegni un'attività libera del gruppo."),
    t('Copro io questa', 'fai tu una sola occorrenza di una ricorrente assegnata a un altro.'),
    t('Lascia', "rinunci a un'attività che avevi accettato; torna libera."),
    t('Rifiuta', "non accetti un'assegnazione; serve un motivo."),
    t('Scomponi', "divide un'attività in più sotto-attività."),
    t('Rimanda', 'la nasconde fino a una data.'),
    t('Tienila come idea', 'sposta una bozza fra le idee personali.'),
    t('Torna bozza', "riporta un'attività fra le bozze."),
    t('Occorrenza', 'una delle volte di una ricorrente.'),
    t('Libera / presa', "un'attività o un'occorrenza senza nessuno che se ne occupa, o con qualcuno."),
    t('Storico', "tutto quello che è successo all'attività, con chi e quando."),
  ] }] },
];

/** Lower case, without accents: "Attività" and "attivita" match. */
const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** The topics with only the terms whose word or meaning holds every word typed; topics left empty go. */
export function searchGlossary(query: string, topics: Topic[] = GLOSSARY): Topic[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return topics;
  const keeps = (x: Term) => { const text = fold(`${x.word} ${x.meaning}`); return words.every(w => text.includes(w)); };
  return topics
    .map(tp => ({ ...tp, groups: tp.groups.map(g => ({ ...g, terms: g.terms.filter(keeps) })).filter(g => g.terms.length) }))
    .filter(tp => tp.groups.length);
}
