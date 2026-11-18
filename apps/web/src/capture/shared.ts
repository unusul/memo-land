/**
 * What another app sent with Condividi (Android, user's choice 2026-11-17): the title, the text and the link, one per
 * line, the same text given twice once (a page often sends its link as the text too); undefined when nothing came.
 */
export function sharedText(params: URLSearchParams): string | undefined {
  const parts = ['title', 'text', 'url'].map(k => params.get(k)?.trim() ?? '').filter(Boolean);
  const unique = [...new Set(parts)];
  return unique.length > 0 ? unique.join('\n') : undefined;
}
