export const stripAccents = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** Lowercase, accent-free, punctuation collapsed to single spaces — for fuzzy equality. */
export const norm = (s: string | null | undefined) =>
  stripAccents((s ?? '').toLowerCase()).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const luceneEscape = (s: string) => s.replace(/([+\-&|!(){}\[\]^"~*?:\\/])/g, '\\$1');

/** Today's date as YYYY-MM-DD (UTC). */
export const today = () => new Date().toISOString().slice(0, 10);

export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
