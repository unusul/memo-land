import { useState } from 'react';
import { GLOSSARY, HELP, searchGlossary } from './glossary.js';

/**
 * Aiuto e glossario, opened from the settings: a few lines of help, then the app's words by topic, with a search.
 * Each word on its own line with its meaning under it: side-by-side columns changed width from one block to the next.
 */
export function HelpView() {
  const [query, setQuery] = useState('');
  const found = searchGlossary(query, GLOSSARY);
  return (
    <section aria-labelledby="help-h" className="stack help">
      <h2 id="help-h">Aiuto e glossario</h2>
      <p>memo-land tiene idee, cose da fare e appuntamenti tuoi e dei tuoi gruppi.</p>
      <ul className="help-points">{HELP.map(h => <li key={h}>{h}</li>)}</ul>
      <section aria-label="Glossario" className="stack glossary">
        <p className="label">Glossario</p>
        <input type="search" aria-label="Cerca una parola" placeholder="Cerca una parola…" value={query} onChange={e => setQuery(e.target.value)} />
        {found.length === 0 && <p className="muted">Nessuna parola trovata.</p>}
        {found.map(tp => (
          <div key={tp.topic} className="glossary-topic">
            <h3>{tp.topic}</h3>
            {tp.intro && !query.trim() && <p className="muted">{tp.intro}</p>}
            {tp.groups.map((g, i) => (
              <div key={g.title ?? i} className="glossary-group">
                {g.title && <p className="glossary-sub"><span className="label">{g.title}</span>{g.note && <span className="muted small">{g.note}</span>}</p>}
                <dl>{g.terms.map(x => <div key={x.word} className="term"><dt>{x.word}</dt><dd>{x.meaning}</dd></div>)}</dl>
              </div>
            ))}
          </div>
        ))}
      </section>
    </section>
  );
}
