import type { LinkSource } from './linkSource';

/**
 * Placeholder for an offline graph. Prepare `page` + `pagelinks` from the official
 * Wikimedia dumps (https://dumps.wikimedia.org/) or use WikiLinkGraphs
 * (https://zenodo.org/records/2539424), then implement this adapter only.
 */
export class LocalDatasetLinkSource implements LinkSource {
  private unavailable(): never {
    throw new Error('Локальный датасет пока не подключён. Выберите VITE_LINK_SOURCE=api.');
  }
  getOutlinks(_title: string, _lang: string): Promise<string[]> { return this.unavailable(); }
  getInlinks(_title: string, _lang: string): Promise<string[]> { return this.unavailable(); }
  resolveRedirect(_title: string, _lang: string): Promise<string> { return this.unavailable(); }
}
