# Переходы

Клиентский поиск цепочки гиперссылок между двумя статьями Википедии. React + TypeScript + Vite, двунаправленный BFS в Web Worker, запросы напрямую к MediaWiki Action API. Сервер не нужен.

## Локальный запуск

```bash
npm ci
npm run dev
```

Откройте адрес Vite из терминала. Для проверки: `npm test` и `npm run build`.

Введите два названия статей одного языкового раздела или URL вида `https://ru.wikipedia.org/wiki/Москва`. Подсказки используют `list=search`. URL определяет язык автоматически; смешанные языки отклоняются до старта поиска. Редиректы разрешаются перед поиском. Результат содержит ссылки на исходные статьи. Новый поиск и кнопка остановки завершают старый Web Worker.

## Как работает поиск

`src/lib/linkSource.ts` задаёт три операции: `getOutlinks`, `getInlinks`, `resolveRedirect`. `ApiLinkSource` запрашивает `prop=links`, `list=backlinks` и редиректы через MediaWiki Action API в пространстве имён 0; использует `origin=*`, пагинацию, кэш в памяти, общий лимит параллелизма и повтор запросов при 429/5xx. `bfs.ts` зависит только от интерфейса и объекта лимитов. Поиск идёт по слоям от начала (исходящие ссылки) и от цели (входящие ссылки), после встречи восстанавливает направленный путь. Прогресс содержит глубину и число посещённых статей.

Поиск ограничен. На каждой статье берутся первые N ссылок в порядке ответа API, без дополнительной сортировки. Это удерживает статьи-хабы в разумных пределах, но полученный маршрут **может не быть глобально кратчайшим**. Отсутствие результата в пределах лимитов не доказывает отсутствие пути. `maxTotalRequests` считает логические вызовы `LinkSource`, включая два разрешения заголовков; HTTP-повторы при 429/5xx не вычитаются отдельно. При текущем `maxLinksPerPage=500` один список обычно получается одним запросом API.

| Лимит | Значение |
| --- | ---: |
| `maxDepth` | 6 шагов с каждой стороны |
| `maxLinksPerPage` | 500 исходящих или входящих ссылок на статью |
| `maxTotalRequests` | 1500 вызовов источника на поиск |
| `concurrency` | 6 запросов API одновременно |
| `requestTimeout` | 10 секунд |
| `searchTimeout` | 45 секунд |
| `retryAttempts` | 2 повтора с экспоненциальной задержкой при 429/5xx |

Изменяйте значения в `src/lib/searchLimits.ts`. API-адаптер ограничивает количество ссылок при получении; BFS дополнительно обрезает массив, чтобы тот же лимит соблюдался и для будущего локального источника.

Для проверки граничных состояний в dev-сервере можно временно добавить к URL `?maxDepth=1&maxLinksPerPage=1` или `?maxTotalRequests=3`. В production эти параметры игнорируются; значения таблицы остаются неизменными.

## Подключение локального графа

Создайте граф статей и ссылок из официальных [дампов Wikimedia](https://dumps.wikimedia.org/) (`page` + `pagelinks`) или из [WikiLinkGraphs](https://zenodo.org/records/2539424). Реализуйте три метода в `src/lib/localLinkSource.ts` и соберите с `VITE_LINK_SOURCE=local npm run build`. BFS, воркер и UI менять не нужно. Сейчас локальный адаптер намеренно выдаёт понятную ошибку: загрузка и парсинг датасета не реализованы.

## Деплой форка на GitHub Pages

1. Загрузите проект в репозиторий GitHub с веткой `main`.
2. В **Settings → Pages → Build and deployment** выберите **GitHub Actions**.
3. Push в `main` запускает тесты, сборку и публикацию `dist` через `.github/workflows/deploy.yml`.

При сборке в GitHub Actions `vite.config.ts` берёт имя репозитория из `GITHUB_REPOSITORY` и выставляет `base=/<repo>/`. Для ссылки в футере можно задать `VITE_GITHUB_URL` в окружении сборки; иначе используется адрес исходного проекта.

## Источники

- [MediaWiki Action API](https://www.mediawiki.org/wiki/API:Main_page): [links](https://www.mediawiki.org/wiki/API:Links), [backlinks](https://www.mediawiki.org/wiki/API:Backlinks), [search](https://www.mediawiki.org/wiki/API:Search), [redirects](https://www.mediawiki.org/wiki/API:Redirects), [CORS](https://www.mediawiki.org/wiki/API:Cross-site_requests)
- [Vite: GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages), [actions/deploy-pages](https://github.com/actions/deploy-pages)
