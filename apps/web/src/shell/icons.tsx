import type { ReactElement } from 'react';

/** Stroke icons drawn in currentColor on a 24×24 grid, so they follow the text colour and the theme. */
const SHELL_PATHS = {
  agenda: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  drafts: <><path d="M4 13.5 6.5 5h11l2.5 8.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M4 13.5h4.5l1 2h5l1-2H20" /></>,
  groups: <><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" /><circle cx="17" cy="8.5" r="2.5" /><path d="M16.5 13.8c2.2.1 3.7 1.5 4.1 3.9" /></>,
  me: <><circle cx="12" cy="8.5" r="3.6" /><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6" /></>,
  settings: <><circle cx="12" cy="12" r="2.8" /><path d="M10.3 3.5h3.4l.5 2.4 1.6.9 2.3-.8 1.7 2.9-1.8 1.6v1.9l1.8 1.6-1.7 2.9-2.3-.8-1.6.9-.5 2.4h-3.4l-.5-2.4-1.6-.9-2.3.8-1.7-2.9 1.8-1.6v-1.9L4.2 8.9l1.7-2.9 2.3.8 1.6-.9z" /></>,
  pin: <><path d="M9 3.5h6M10 3.5v5.5l-3 3.5v1.5h10V12.5L14 9V3.5M12 14v6.5" /></>,
  unpin: <><path d="M9 3.5h6M10 3.5v5.5l-3 3.5v1.5h10V12.5L14 9V3.5M12 14v6.5" /><path d="M3.5 3.5l17 17" /></>,
  auto: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  up: <path d="M12 19.5v-15M6 10.5l6-6 6 6" />,
  down: <path d="M12 4.5v15M6 13.5l6 6 6-6" />,
  edit: <><path d="M4 20h4.5L19.5 9a2.1 2.1 0 0 0-3-3L5.5 17z" /><path d="M14.5 8l3 3" /></>,
  invite: <><circle cx="9.5" cy="8" r="3.5" /><path d="M3 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M18.5 8v6M15.5 11h6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  leave: <><path d="M14 4.5h4A1.5 1.5 0 0 1 19.5 6v12a1.5 1.5 0 0 1-1.5 1.5h-4" /><path d="M10 8l-4 4 4 4M6 12h9" /></>,
  newGroup: <><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6 1.4 0 2.6.4 3.6 1.2M18 13v7M14.5 16.5h7" /><circle cx="17" cy="8.5" r="2.5" /></>,
  reopen: <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
};

/** The icons a person can give a group, by section, with the name read out and shown in the picker. */
const GROUP_PATHS = {
  task: ['Attività', 'Cose da fare', <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>],
  list: ['Lista', 'Cose da fare', <><path d="M10 6.5h10M10 12h10M10 17.5h10" /><circle cx="5.5" cy="6.5" r="1.2" /><circle cx="5.5" cy="12" r="1.2" /><circle cx="5.5" cy="17.5" r="1.2" /></>],
  deadline: ['Scadenza', 'Cose da fare', <><circle cx="12" cy="13" r="7.5" /><path d="M12 9v4l2.5 2M10 2.5h4" /></>],
  calendar: ['Calendario', 'Cose da fare', <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" /></>],
  idea: ['Idea', 'Cose da fare', <><path d="M9.5 18h5M10.5 21h3" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2v.1h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></>],
  target: ['Obiettivo', 'Cose da fare', <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>],
  team: ['Squadra', 'In team', <><circle cx="12" cy="7" r="2.6" /><circle cx="5.5" cy="9.5" r="2.1" /><circle cx="18.5" cy="9.5" r="2.1" /><path d="M7.5 19c.4-3 2.2-5 4.5-5s4.1 2 4.5 5M2.5 18c.2-2.2 1.4-3.8 3.3-4M21.5 18c-.2-2.2-1.4-3.8-3.3-4" /></>],
  meeting: ['Riunione', 'In team', <><path d="M3.5 5.5A1.5 1.5 0 0 1 5 4h9a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 14 13H8l-4.5 3.5z" /><path d="M15.5 8.5H19a1.5 1.5 0 0 1 1.5 1.5v9.5L17 17h-6a1.5 1.5 0 0 1-1.5-1.5V13" /></>],
  project: ['Progetto', 'In team', <path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z" />],
  documents: ['Documenti', 'In team', <><path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z" /><path d="M14 3.5V8h4.5M9 12.5h6M9 16h6" /></>],
  code: ['Codice', 'In team', <path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15" />],
  office: ['Ufficio', 'In team', <><rect x="5" y="3.5" width="14" height="17" rx="1.5" /><path d="M9 7.5h.01M12 7.5h.01M15 7.5h.01M9 11h.01M12 11h.01M15 11h.01M9 14.5h.01M15 14.5h.01M10.5 20.5V17h3v3.5" /></>],
  cleaning: ['Pulizie', 'Lavori di casa', <><path d="M20 4l-7.5 7.5M11 10l3 3" /><path d="M10.5 10.5 5 13c-.5 2.5-1 5-1.5 7.5 2.5-.5 5-1 7.5-1.5l2.5-5.5z" /><path d="M6.5 17 9 14.5" /></>],
  laundry: ['Bucato', 'Lavori di casa', <><rect x="4.5" y="3" width="15" height="18" rx="2" /><path d="M4.5 7.5h15M8 5.3h.01M11 5.3h.01" /><circle cx="12" cy="14" r="4" /></>],
  repair: ['Riparazioni', 'Lavori di casa', <path d="M14.5 6.5a4 4 0 0 1 5.2-1.7L17 7.5l.4 2.3 2.3.4 2.7-2.7a4 4 0 0 1-5.2 5.2L9.8 20A2 2 0 0 1 7 17.2l7.3-7.3a4 4 0 0 1 .2-3.4z" />],
  trash: ['Rifiuti', 'Lavori di casa', <path d="M4 6.5h16M9.5 6.5v-2h5v2M6 6.5l1 13A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5l1-13M10 10.5V17M14 10.5V17" />],
  bills: ['Bollette', 'Lavori di casa', <><path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z" /><path d="M9 8h6M9 11.5h6M9 15h3.5" /></>],
  kids: ['Bambini', 'Lavori di casa', <><circle cx="12" cy="12.5" r="8" /><path d="M9 11h.01M15 11h.01M9.5 15c1.5 1.3 3.5 1.3 5 0M12 4.5c-1-1.5.5-2.5 1.5-1.5" /></>],
  home: ['Casa', 'Casa e persone', <><path d="M4 11 12 4l8 7" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></>],
  family: ['Famiglia', 'Casa e persone', <><circle cx="8" cy="6.5" r="2.5" /><circle cx="16" cy="6.5" r="2.5" /><circle cx="12" cy="13" r="2" /><path d="M4 20v-4.5A3.5 3.5 0 0 1 8 12M20 20v-4.5a3.5 3.5 0 0 0-4-3.5" /><path d="M9.5 20c0-2 1-3.3 2.5-3.3s2.5 1.3 2.5 3.3" /></>],
  friends: ['Amici', 'Casa e persone', <path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.4c0 5.4-7.5 10-7.5 10z" />],
  pets: ['Animali', 'Casa e persone', <><circle cx="6" cy="10" r="1.8" /><circle cx="9.5" cy="6" r="1.8" /><circle cx="14.5" cy="6" r="1.8" /><circle cx="18" cy="10" r="1.8" /><path d="M12 11c-3 0-5.5 4-5.5 6.5 0 1.6 1.3 2.5 2.7 2.5 1.2 0 1.8-.6 2.8-.6s1.6.6 2.8.6c1.4 0 2.7-.9 2.7-2.5C17.5 15 15 11 12 11z" /></>],
  work: ['Lavoro', 'Tempo libero', <><rect x="3.5" y="7.5" width="17" height="12" rx="2" /><path d="M9 7.5v-2A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5v2M3.5 12.5h17" /></>],
  school: ['Scuola', 'Tempo libero', <><path d="M2.5 9 12 4.5 21.5 9 12 13.5z" /><path d="M6.5 11v4.5c1.5 1.6 3.4 2.5 5.5 2.5s4-.9 5.5-2.5V11M21.5 9v5" /></>],
  sport: ['Sport', 'Tempo libero', <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17M3.5 12h17" /><path d="M6 6c2.5 2.2 2.5 9.8 0 12M18 6c-2.5 2.2-2.5 9.8 0 12" /></>],
  music: ['Musica', 'Tempo libero', <><path d="M9 18V5.5l11-2V16" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>],
  books: ['Libri', 'Tempo libero', <><path d="M5 19.5v-14A2.5 2.5 0 0 1 7.5 3H19v14.5H7.5A2.5 2.5 0 0 0 5 20a1 1 0 0 0 1 1h13" /><path d="M9 7.5h6" /></>],
  car: ['Auto', 'Luoghi e cose', <><path d="M5 17H3v-4a1.5 1.5 0 0 1 1-1.4l1.5-.6 1.9-4.4a2 2 0 0 1 1.8-1.1h5.4a2 2 0 0 1 1.7.9l2.9 4.6 1.8.6a1.5 1.5 0 0 1 1 1.4v4h-2" /><path d="M10 17h4M5.5 11h13.5" /><circle cx="7.5" cy="17" r="2.3" /><circle cx="16.5" cy="17" r="2.3" /></>],
  travel: ['Viaggi', 'Luoghi e cose', <><path d="M21 3.5 3 10.5l7 3 3 7z" /><path d="M10 13.5 21 3.5" /></>],
  shopping: ['Spesa', 'Luoghi e cose', <><path d="M3 4h2.5l2 11h10.5l2-8H7" /><circle cx="9.5" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></>],
  kitchen: ['Cucina', 'Luoghi e cose', <><path d="M7 3.5v6a2 2 0 0 0 4 0v-6M9 3.5v17" /><path d="M17 20.5v-17c-2 1-3 3.5-3 6.5v3h3" /></>],
  garden: ['Giardino', 'Luoghi e cose', <><path d="M12 20.5v-8" /><path d="M12 12.5C12 8 9 5.5 4.5 5.5c0 4.5 3 7 7.5 7z" /><path d="M12 15c0-4 2.7-6.5 7.5-6.5 0 4-2.7 6.5-7.5 6.5z" /></>],
  health: ['Salute', 'Altro', <path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z" />],
  money: ['Soldi', 'Altro', <><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5a4 4 0 1 0 0 7M7 11h6M7 13.5h6" /></>],
  party: ['Festa', 'Altro', <><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M3 9h18M12 9v11" /><path d="M12 9c-1.5-3-5-4-5-1.5S10 9 12 9zm0 0c1.5-3 5-4 5-1.5S14 9 12 9z" /></>],
  star: ['Stella', 'Altro', <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />],
} satisfies Record<string, [string, string, ReactElement]>;

export type GroupIconName = keyof typeof GROUP_PATHS;
/** The picker's sections in the order they are shown, each with its icons. */
export const GROUP_ICON_SECTIONS = Object.entries(GROUP_PATHS).reduce<Array<{ title: string; icons: Array<{ name: GroupIconName; label: string }> }>>((sections, [name, [label, title]]) => {
  const last = sections.at(-1);
  const icon = { name: name as GroupIconName, label };
  if (last?.title === title) last.icons.push(icon); else sections.push({ title, icons: [icon] });
  return sections;
}, []);

type IconName = keyof typeof SHELL_PATHS | GroupIconName;
const pathsOf = (name: IconName) => (name in SHELL_PATHS ? SHELL_PATHS[name as keyof typeof SHELL_PATHS] : GROUP_PATHS[name as GroupIconName][2]);

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-icon={name}>
      {pathsOf(name)}
    </svg>
  );
}
