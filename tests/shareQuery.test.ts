import { describe, expect, it, vi } from 'vitest';
import { queryUrl, readSharedQuery } from '../src/lib/shareQuery';
import { parseInput } from '../src/lib/parseInput';

describe('shared multilingual query round trip', () => {
  it.each(['Что? Где? Когда?', '100%', 'AC/DC', 'Осьминоги'])('preserves %s and both endpoint languages', title => {
    vi.stubGlobal('location', { href: 'https://example.com/?old=value' });
    try {
      const from = { title, lang: 'ru' }, to = { title: 'Design & science?', lang: 'en' };
      const shared = readSharedQuery(new URL(queryUrl(from, to, true)).search);
      expect(parseInput(shared.from, shared.lang)).toEqual(from);
      expect(parseInput(shared.to, shared.lang)).toEqual(to);
      expect(shared.multilingual).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });
});
