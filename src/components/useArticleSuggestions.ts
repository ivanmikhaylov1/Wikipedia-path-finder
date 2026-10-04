import { useEffect, useState } from 'react';
import type { ParsedArticle } from '../lib/parseInput';
import { suggestArticles } from '../lib/articleSuggestions';

interface Suggestions { articles: ParsedArticle[]; loading: boolean; failed: boolean }
const empty: Suggestions = { articles: [], loading: false, failed: false };

export function useArticleSuggestions(value: string, enabled: boolean): Suggestions {
  const [state, setState] = useState<Suggestions & { value: string }>({ ...empty, value });
  const eligible = enabled && value.trim().length >= 2 && !/^https?:\/\//i.test(value.trim());
  useEffect(() => {
    let current = true;
    setState({ ...empty, value });
    if (!eligible) return;
    const timer = setTimeout(() => {
      setState({ ...empty, value, loading: true });
      void suggestArticles(value, () => current).then(result => {
        if (current) setState({ ...result, value, loading: false });
      });
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [value, eligible]);
  // Clear the prior value's list synchronously, before effect cleanup runs.
  return eligible && state.value === value ? state : empty;
}
