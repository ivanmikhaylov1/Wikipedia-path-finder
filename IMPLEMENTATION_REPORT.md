# Отчёт об улучшении «Переходов»

Дата: 2026-09-30. Исходная версия: `c032986`.

## Этап 1 — поиск

Изменённые файлы: `src/lib/linkSource.ts`, `src/lib/apiLinkSource.ts`, `src/lib/wikiApi.ts`, `src/lib/bfs.ts`, `tests/apiLinkSource.test.ts`.

- Исходящие и входящие ссылки: `links|info` / `linkshere|info`, до 50 заголовков, общий continue, накопление результатов без повторного старта статей.
- HTTP-бюджет считает фактические попытки, включая повторы и пагинацию. Api-User-Agent, 429/5xx, Retry-After и ограничение транспорта до шести запросов.
- Выбор меньшего фронта, расширение полными слоями. Более широкий раунд пересобирает родителей; LinkSource сохраняет кэш. Продолжение сохраняет незавершённый слой.
- Дополнительные запросы размеров всего фронта устранены. Уже известный размер используется только для порядка в слое.

Проверки после этапа: 20/20 тестов, `npm run build` успешно. Контрольный граф с хабом из 40 соседей: только один вызов getOutlinks; путь через обратный фронт имеет два шага.

Ограничения: API обрезает ссылки и останавливается на первом успешном раунде, поэтому глобальная кратчайшесть не гарантирована. Реальная скорость на Wikipedia не измерялась; результаты сетевых сценариев проверены на моках. Снимок кэша может устареть за TTL 30 дней. Новый linkshere использует базу кэша v2.

## Этап 2 — интерфейс

Изменённые файлы: `src/App.tsx`, `src/components/SearchForm.tsx`, `src/lib/shareQuery.ts`, `src/styles.css`, `index.html`, `src/main.tsx`, `src/assets/fonts/*`, `public/icon.svg`, `public/manifest.webmanifest`, `public/robots.txt`, `scripts/pwa.ts`, `vite.config.ts`, `tsconfig.node.json`.

- Шаринг параметров поиска, восстановление формы, обмен статьями. Открытие ссылки не запускает API-поиск автоматически.
- Клавиатурные подсказки с aria-activedescendant, закрытие по Escape/blur, видимый фокус и навигация к форме.
- Unbounded + Golos Text и исходная кремовая/терракотовая палитра. Шрифты локальные, с SIL OFL.
- Версионный PWA precache для оболочки и ассетов. Кэши разделены по scope; статические ассеты корректно работают с Vary: Origin. Wikipedia API не кэшируется service worker.

Проверки после этапа: 20/20 тестов, сборка успешно. Первый mobile Lighthouse: Performance 96, Accessibility 100, Best Practices 100, SEO 91; после robots.txt SEO 100. Ширина 360 px без горизонтального переполнения, скриншот проверен. Итоговые axe и offline reload проверены на этапе 4.

Ограничения: API-поиск требует сети; графы не скачиваются при установке PWA. Возможность установки PWA с SVG-иконкой зависит от браузера.

## Этап 3 — архитектура

Изменённые файлы: `scripts/build-graph.ts`, `scripts/sqlDump.ts`, `src/lib/graphFormat.ts`, `src/lib/localLinkSource.ts`, `src/lib/multilingualLinkSource.ts`, `src/lib/linkSource.ts`, `src/lib/apiLinkSource.ts`, `src/lib/bfs.ts`, `src/lib/bfs.worker.ts`, `src/App.tsx`, `src/components/{Hero,SearchForm,PathVisualizer}.tsx`, `src/styles.css`, `tests/localLinkSource.test.ts`, `tests/multilingualLinkSource.test.ts`, `tests/fixtures/*`, `package.json`, `package-lock.json`, `.gitignore`, `tsconfig.node.json`, `README.md`.

- SQL/SQL.gz дампы page + pagelinks: два прохода, CSR uint32 в обе стороны, little-endian формат WPFG v1 и gzip. Поддерживаются legacy titles и современный linktarget; redirect добавляет алиасы и канонические цели.
- Статическая загрузка на язык, валидация формата и языка, разрешение редиректов. `VITE_LINK_SOURCE=local` использует все рёбра без потолка 500.
- Межъязыковой API-режим: направленные langlinks в языках двух конечных статей, прямой BFS без ложных обратных переводов. Карточки открывают соответствующий язык.

Проверки после этапа: 26/26 тестов, сборка успешно. Тестовый дамп: 6 статей, 5 рёбер, 212 байт WPFG, 148 байт gzip. Тесты проверяют современную/legacy схему, gzip-вход, SQL-экранирование, отсутствие linktarget, повреждённый формат и путь A → B → D. Один статический запрос, ноль Wikipedia-запросов.

Ограничения: полноценный ruwiki/enwiki не собран — больших дампов в среде нет; память и время на таком объёме не измерены. CSR и названия загружаются целиком; для мобильного браузера большой раздел может оказаться слишком тяжёлым. Сборщик рассчитан на стандартный Wikimedia mysqldump с INSERT на одной строке, а не произвольный SQL. Без redirect дампа нет полноценного разрешения алиасов. Локальный граф одноязыковой. Межъязыковой режим ограничен шестью прямыми шагами и языками старта/цели.

## Этап 4 — качество

Изменённые файлы: `tests/bfs.property.test.ts`, `tests/apiLinkSource.test.ts`, `tests/wikiApi.test.ts`, `e2e/search.spec.ts`, `e2e/local.spec.ts`, `playwright.config.ts`, `playwright.local.config.ts`, `scripts/lighthouse.mjs`, `.github/workflows/{ci,deploy}.yml`, `vite.config.ts`, `package.json`, `.gitignore`, `README.md`, этот отчёт. Исправления по результатам проверок: `src/App.tsx`, `src/components/SearchForm.tsx`, `scripts/pwa.ts`, `src/lib/{apiLinkSource,bfs,bfs.worker,multilingualLinkSource}.ts`.

- Property-проверки без новой библиотеки: 200 детерминированных случайных направленных графов размером 2–8, все пары, независимый перебор простых путей, проверка каждого ребра и длины; обычные и пакетные источники.
- Контроль HTTP: батчи 50, обе пагинации, кэш, фактический бюджет, успешный retry 503 и параллелизм ≤6. Приложение резервирует пять слотов для Worker и один для подсказок.
- Playwright: поиск, отмена и повторный запуск, HTTP/отсутствующая статья, восстановление ссылки, клавиатура/360 px, langlinks, offline PWA. Axe не обнаружил нарушений в начальном состоянии и результате.
- Local E2E использует настоящие Worker и gzip CSR, блокирует любую Wikipedia-сеть, проверяет две пары, включая редирект.
- CI для PR/main и деплоя: unit/property, сборка, E2E/axe, три mobile Lighthouse с порогом медианы ≥90, локальный E2E. Деплой пересобирается под GitHub Pages base после проверок.

Итоговые результаты:

| Проверка | Результат |
| --- | --- |
| `npm test` | 32/32 |
| `npm run build` | успешно |
| `npm run test:e2e` | 6/6 |
| `npm run test:local` | 1/1, два кратчайших пути, 0 Wikipedia-запросов |
| Axe | 0 нарушений в проверенных состояниях |
| Lighthouse mobile Performance | 96 |
| Lighthouse mobile Accessibility | 100 |
| Lighthouse mobile Best Practices | 100 |
| Lighthouse mobile SEO | 100 |

Lighthouse: production preview, Chromium из Playwright, mobile simulated throttling; три финальных запуска дали Performance 96, 93 и 96; остальные три категории — 100 во всех запусках. Это замер в текущей среде, не опубликованного GitHub Pages. Отчёты HTML/JSON сохраняются в lighthouse-reports, CI загружает их как artifacts.

Новых runtime-зависимостей нет. Новые dev-зависимости: @playwright/test для браузера, @axe-core/playwright для a11y, lighthouse для аудита, tsx для типизированного сборщика.

## Что не подтверждено

- Производительность и расход памяти на полном языковом дампе: проверен небольшой воспроизводимый снимок.
- Глобальная кратчайшесть API-результата: ограничение выборки ссылок сохранено и документировано.
- Межъязыковый локальный CSR и обратный индекс langlinks: в опциональном режиме используется прямой API-поиск.
- Safari/Firefox, разные платформы установки PWA и ручная проверка скринридером: браузерная проверка выполнена в Chromium, доступность дополнительно проверена axe.
- Результаты удалённых GitHub Actions и оценка опубликованного сайта требуют запуска workflow после обновления репозитория; локальные проверки уже выполнены.

## Сохранение результата

Изменения подготовлены в локальной ветке `codex/search-local-graph-quality`, отдельными коммитами. Git push из среды не прошёл HTTPS-аутентификацию. Подключённый GitHub API подтвердил права admin/push, но автоматическая проверка отклонила первый create_blob: публикация нового кода в публичный репозиторий требует явного разрешения. Загрузка через API не выполнена; удалённая ветка и draft PR не созданы, main не изменена. Для переноса сохранены git bundle с историей коммитов и ZIP исходников.
