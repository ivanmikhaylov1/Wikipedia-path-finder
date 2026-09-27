export interface ParsedArticle { title: string; lang: string }

export function parseInput(value: string, selectedLang: string): ParsedArticle {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Введите название статьи');
  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try { url = new URL(trimmed); } catch { throw new Error('Некорректная ссылка на статью'); }
    const match = url.hostname.match(/^([a-z]{2,12}(?:-[a-z]{2,12})?)\.wikipedia\.org$/);
    if (!match || !url.pathname.startsWith('/wiki/')) throw new Error('Нужна ссылка на статью Википедии');
    let title: string;
    try { title = decodeURIComponent(url.pathname.slice(6)).replaceAll('_', ' '); }
    catch { throw new Error('Некорректная ссылка на статью'); }
    if (!title) throw new Error('В ссылке нет названия статьи');
    return { title, lang: match[1] };
  }
  return { title: trimmed.replaceAll('_', ' '), lang: selectedLang };
}

export function validatePair(from: ParsedArticle, to: ParsedArticle): void {
  if (from.lang !== to.lang) throw new Error('Поиск пути работает в пределах одного языкового раздела. Проверьте языки ссылок на статьи.');
}
