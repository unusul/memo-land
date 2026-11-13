const ADDRESS = /https?:\/\/[^\s<>"]+/g;
/** Punctuation that closes the sentence, not the address. */
const TRAILING = /[.,;:!?)\]}'»]+$/;

/** The web addresses written in the texts, each once, in the order they appear. */
export function linksIn(...texts: string[]): string[] {
  const found = texts.flatMap(t => t.match(ADDRESS) ?? []).map(u => u.replace(TRAILING, ''));
  return [...new Set(found)].filter(isWebAddress);
}

function isWebAddress(u: string): boolean {
  try { return new URL(u).hostname.length > 0; } catch { return false; }
}

const shortName = (u: string) => new URL(u).hostname.replace(/^www\./, '');

/**
 * Title and text are fields to write in, so an address inside them does not open: it opens from here, as a notes app
 * shows the links under the note. Each in a new tab, the full address in its tooltip.
 */
export function Links({ texts }: { texts: string[] }) {
  const links = linksIn(...texts);
  if (links.length === 0) return null;
  return (
    <ul className="links" aria-label="Link">
      {links.map(u => (
        <li key={u}><a href={u} target="_blank" rel="noopener noreferrer" title={u}>↗ {shortName(u)}</a></li>
      ))}
    </ul>
  );
}
