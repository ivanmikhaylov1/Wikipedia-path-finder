import type { ParsedArticle } from './parseInput';
import { DEFAULT_LIMITS } from './searchLimits';
import { WikiApiClient } from './wikiApi';

const api = new WikiApiClient({ ...DEFAULT_LIMITS, concurrency: 1 });
const sections = ['ru', 'en', 'de', 'fr', 'es'];
// Both fields share this queue, including the freshness check before a queued call.
let queue: Promise<unknown> = Promise.resolve();

export async function suggestArticles(text: string, isCurrent: () => boolean = () => true): Promise<{ articles: ParsedArticle[]; failed: boolean }> {
  const articles: ParsedArticle[] = [];
  const seen = new Set<string>();
  let succeeded = false;
  for (const lang of sections) {
    if (!isCurrent()) return { articles: [], failed: false };
    const request = queue.then(() => isCurrent() ? api.suggest(text, lang) : []);
    queue = request.catch(() => undefined);
    try {
      const titles = await request;
      if (!isCurrent()) return { articles: [], failed: false };
      succeeded = true;
      let count = 0;
      for (const title of titles) {
        const key = JSON.stringify([lang, title]);
        if (seen.has(key)) continue;
        seen.add(key); articles.push({ title, lang }); count++;
        if (count === 2 || articles.length === 8) break;
      }
      if (articles.length === 8) break;
    } catch {
      if (!isCurrent()) return { articles: [], failed: false };
    }
  }
  return { articles, failed: !succeeded };
}
