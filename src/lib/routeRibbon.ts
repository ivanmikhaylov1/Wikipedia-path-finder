import type { ParsedArticle } from './parseInput';
import { articleFromKey } from './multilingualLinkSource';

export interface RouteArticle extends ParsedArticle { href: string; number: number; row: number; column: number; crossLanguage: boolean }
export interface RoutePoint { x: number; y: number }
export function routeArticles(path: string[], lang: string, multilingual: boolean): RouteArticle[] {
  const articles = path.map(key => multilingual ? articleFromKey(key) : { title: key, lang });
  return articles.map((article, index) => {
    if (!/^[a-z]{2,12}(?:-[a-z]{2,12})?$/.test(article.lang)) throw new Error('Некорректный язык статьи');
    const row = Math.floor(index / 3);
    return { ...article, href: `https://${article.lang}.wikipedia.org/wiki/${encodeURIComponent(article.title.replaceAll(' ', '_'))}`,
      number: index + 1, row, column: row % 2 ? 2 - index % 3 : index % 3,
      crossLanguage: index > 0 && articles[index - 1].lang !== article.lang };
  });
}

/** Coordinates are measured from the real anchors, so wrapping and row heights are respected. */
export function routeConnectors(points: RoutePoint[], articles: RouteArticle[], mobile: boolean) {
  if (points.length !== articles.length || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return [];
  return points.slice(1).flatMap((end, index) => {
    const start = points[index];
    if (start.x === end.x && start.y === end.y) return [];
    let d = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    if (!mobile) {
      if (articles[index].row !== articles[index + 1].row) {
        const turn = articles[index].row % 2 ? -72 : 72;
        d = `M ${start.x} ${start.y} C ${start.x + turn} ${start.y} ${end.x + turn} ${end.y} ${end.x} ${end.y}`;
      } else {
        const middle = (start.x + end.x) / 2;
        d = `M ${start.x} ${start.y} C ${middle} ${start.y + 18} ${middle} ${end.y - 18} ${end.x} ${end.y}`;
      }
    }
    return [{ from: index + 1, to: index + 2, crossLanguage: articles[index + 1].crossLanguage, d }];
  });
}
