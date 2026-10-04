import { parseInput, type ParsedArticle } from './parseInput';
import { readSharedQuery } from './shareQuery';

export interface ArticleSelection { value: string; selected: ParsedArticle | null }

const localExamples = new Map<string, [string, string]>([
  ['ru', ['Москва', 'Юрий Гагарин']], ['en', ['London', 'Philosophy']],
  ['de', ['Berlin', 'Philosophie']], ['fr', ['Paris', 'Philosophie']], ['es', ['Madrid', 'Filosofía']],
]);

function selectionFromInput(value: string, lang: string): ArticleSelection {
  try { return { value, selected: parseInput(value, lang) }; }
  catch { return { value, selected: null }; }
}

export function initialArticlePair(search: string, local: boolean): { from: ArticleSelection; to: ArticleSelection; example: boolean } {
  const shared = readSharedQuery(search);
  const params = new URLSearchParams(search);
  const example = !params.has('from') && !params.has('to');
  if (example) {
    if (local) {
      const [from, to] = localExamples.get(shared.lang) ?? ['Москва', 'Юрий Гагарин'];
      return { from: selectionFromInput(from, shared.lang), to: selectionFromInput(to, shared.lang), example };
    }
    return { from: selectionFromInput('Осьминоги', 'ru'), to: selectionFromInput('Bauhaus', 'en'), example };
  }
  // Older multilingual links assigned the opposite default section to a plain target.
  // Preserve this only when restoring the query; subsequent edits use the visible fallback.
  const targetLang = shared.multilingual && !local ? (shared.lang === 'en' ? 'ru' : 'en') : shared.lang;
  return {
    from: selectionFromInput(shared.from, shared.lang),
    to: selectionFromInput(shared.to, targetLang),
    example,
  };
}

export function resolveArticleSelection(field: ArticleSelection, fallbackLang = 'ru'): ParsedArticle {
  return field.selected ?? parseInput(field.value, fallbackLang);
}

export function resolveSearchPair(from: ArticleSelection, to: ArticleSelection, localLang?: string): { from: ParsedArticle; to: ParsedArticle; multilingual: boolean } {
  const start = resolveArticleSelection(from, localLang);
  const end = resolveArticleSelection(to, localLang);
  if (localLang !== undefined && (start.lang !== localLang || end.lang !== localLang)) {
    const sections = [...new Set([start.lang, end.lang])].map(lang => lang.toUpperCase()).join(' и ');
    throw new Error(`Локальный граф поддерживает только раздел ${localLang.toUpperCase()}. Выбраны статьи из разделов ${sections}; выберите обе статьи из ${localLang.toUpperCase()}.`);
  }
  return { from: start, to: end, multilingual: start.lang !== end.lang };
}
