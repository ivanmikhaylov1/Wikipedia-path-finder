# Incompatible Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать «Несовместимые страницы» максимально близко к четырём согласованным эскизам: живой разорванный разворот, автоматический межъязыковой поиск и склеенная полоса найденного маршрута.

**Architecture:** Существующие Worker/BFS/LinkSource остаются источником результатов и статистики. App управляет lifecycle поиска; самостоятельные компоненты отвечают за ввод, визуальный разворот, статус и единственный семантический маршрут. Язык хранится с выбранной статьёй, режим определяется парой разделов.

**Tech Stack:** React 19, TypeScript, Vite, CSS/SVG, существующие локальные шрифты, image_gen для отдельных декоративных ассетов, sharp для форматов доставки, Vitest/linkedom и Playwright/axe. Новые runtime dependencies не требуются.

**Spec:** `docs/superpowers/specs/2026-10-03-incompatible-pages-design.md`; reference images и prompts: `docs/concepts/`.

## Global Constraints

- Ветка `redesign/incompatible-pages`, база `origin/main` (`01e1814`); работа над предварительным маршрутом из другой ветки не включается.
- Палитра: `#f4f1e8`, `#11110f`, `#123bff`. Один визуальный мир, без выбора темы и языка в отдельных controls.
- Controls и ссылки — живой HTML; PNG макетов не используется как интерактивная страница.
- BFS, worker messages, retry policy, budgets и LinkSource interfaces сохраняются.
- Межъязыковой алгоритм ограничен разделами конечных статей; никакого обещания кратчайшего пути или гарантированной достижимости.
- Idle и завершённые состояния неподвижны; collision 600–900 мс, сборка результата около 700 мс, без задержки доступности результата.
- Mobile 360–767 px вертикальный, desktop от 768 px; длинные названия полные, targets от 44 px, focus и reduced motion обязательны.
- API suggestions RU/EN/DE/FR/ES: debounce около 300 мс, последовательная общая очередь concurrency 1, до двух результатов/раздел, до восьми суммарно.
- Существующие пользовательские `docs/bundle-final.json`, `.agents/`, `.impeccable/`, `PRODUCT.md` и прочие незакоммиченные файлы не входят в commits реализации и не перезаписываются.
- Локальный режим, PWA shell, старые shared URLs и JavaScript-disabled объяснение сохраняются. Merge и публикация не входят в этот план.

## Review Focus

- Очень длинное название, URL и zoom 200%: полный текст доступен, поля и маршрут не выходят за ширину телефона. Task 3/6.
- Одинаковые названия в разных разделах и изменение выбранного названия: язык не переносится к другой статье незаметно. Task 1/2.
- Быстрый ввод в обоих полях, поздние ответы и частичный сбой API: устаревшая выдача не заменяет актуальный выбор. Task 2.
- Cancel/resume/new pair и позднее сообщение завершённого worker: новый запрос не получает старый результат, resume сохраняет выбранные языки. Task 5.
- Путь из одной статьи, из 12+ статей и переход языка на границе ряда: DOM и визуальное соединение имеют один порядок, шаги равны рёбрам. Task 4/6.

## Files and Boundaries

- Create `src/lib/articleSelection.ts`: initial pair, input resolution, automatic mode и local restrictions; consumes `parseInput`/`readSharedQuery`.
- Create `src/lib/articleSuggestions.ts`, `src/components/useArticleSuggestions.ts`: shared serial suggestions service and debounced latest-only UI hook.
- Create `src/components/ArticleField.tsx`: accessible monumental input, selected language badge, listbox and errors.
- Replace `src/components/SearchForm.tsx`: two fields and seam actions, typed selections, swap and validation.
- Create `src/components/CollisionSpread.tsx`, `CollisionStage.tsx`, `SearchStatus.tsx`: art composition, actual progress fragments and recovery controls.
- Create `src/lib/routeRibbon.ts`, `src/components/RouteRibbon.tsx`: decoded route model and one ordered linked strip, including language joins.
- Modify `src/App.tsx`: connect new view with existing worker orchestration, route focus, new pair and share result.
- Replace `src/styles.css`; modify `src/assets/fonts/fonts.css` only if a new licensed font is actually needed.
- Create `public/images/collision/` delivery assets and `docs/collision-assets.md` with provenance/prompts. Main serif uses Georgia/Times New Roman initially; body uses local Golos Text. Right display uses a locally hosted condensed font only if existing/system fallbacks cannot reproduce the reference; verify official source and include license before adding it.
- Modify `index.html`, `public/manifest.webmanifest`, `scripts/pwa.ts` and optional favicon source to remove theme initialization, align shell and precache required decoration.
- Modify UI tests and e2e to new behavior; retain algorithm tests. Remove old unused Header/Hero/ThreadStage/PathVisualizer/PathSteps/ProgressIndicator components and threadMotion helpers only after all consumers/tests are migrated. Preserve Footer if it can be integrated into page margins.
- Modify `scripts/measure-bundle.mjs` to accept an optional output path, preserving its existing default; report this branch to `docs/collision-bundle.json`.

---

### Task 1: Язык выбранной статьи и совместимые URL

**Files:** Create `src/lib/articleSelection.ts`, `tests/articleSelection.test.ts`; consume `src/lib/parseInput.ts`, `src/lib/shareQuery.ts`.

**Interfaces:** Export `ArticleSelection { value: string; selected: ParsedArticle | null }`, `initialArticlePair(search: string, local: boolean): { from: ArticleSelection; to: ArticleSelection; example: boolean }`, `resolveArticleSelection(field: ArticleSelection, fallbackLang?: string): ParsedArticle`, `resolveSearchPair(from: ArticleSelection, to: ArticleSelection, localLang?: string): { from: ParsedArticle; to: ParsedArticle; multilingual: boolean }`. Local language absence denotes API mode.

- [ ] Write failing tests: initial API pair is `Осьминоги/ru` and `Bauhaus/en`; explicit shared URL overrides it; old `mode=multilingual&lang=ru&from=A&to=D` restores EN target like old form; input URL uses its actual section; selected article keeps its language; edited raw input uses visible RU fallback; different sections set `multilingual=true`; local mixed pair throws a contextual error.
- [ ] Run `npm test -- tests/articleSelection.test.ts`; expect failures because exports do not exist.
- [ ] Implement helpers using existing parser, preserve older query semantics only during initialization, and derive the actual mode from resolved endpoints. Local example remains one-language and requests no remote suggestions.
- [ ] Add Review Focus test: same display title in RU and EN produces two different `ParsedArticle` values, and a one-article same-section query is accepted.
- [ ] Run focused test; expect all cases pass.
- [ ] Commit only this task's named source/test files: `feat: resolve article languages without mode controls`.

### Task 2: Межъязыковые подсказки и доступный ввод

**Files:** Create `src/lib/articleSuggestions.ts`, `src/components/useArticleSuggestions.ts`, `src/components/ArticleField.tsx`, `tests/articleSuggestions.test.ts`, `tests/articleField.test.tsx`; replace `src/components/SearchForm.tsx`, migrate `tests/validation.test.tsx`.

**Interfaces:** Service exports `suggestArticles(text: string, isCurrent?: () => boolean): Promise<{ articles: ParsedArticle[]; failed: boolean }>` and owns one `WikiApiClient` with concurrency 1. Hook exports `useArticleSuggestions(value: string, enabled: boolean): { articles: ParsedArticle[]; loading: boolean; failed: boolean }`. Field props: `id: 'article-01'|'article-02'`, `label: string`, `number: '01'|'02'`, `selection: ArticleSelection`, `onChange(selection: ArticleSelection): void`, `disabled: boolean`, `localLang?: string`, `error?: string`. Form props preserve existing `onSearch(ParsedArticle, ParsedArticle, boolean)`, `onCancel()`, `onValidationError(string)` and `formRef`, adding `onPairChange?(pair)` and `resetKey?: number` only for composition/reset integration.

- [ ] Write failing service tests with mocked `WikiApiClient.suggest`: output dedupes only identical `{lang,title}`, keeps two same-title different-language rows, limits two/section and eight overall, preserves partial results on one failing section, signals total failure, never exceeds one active suggestion request across both fields, and skips remaining section calls when stale.
- [ ] Write failing SSR/linkedom field tests: accessible label, visible section badge, error association, no standalone language select, no theme control. Use browser tests in Task 6 for interaction rather than adding a DOM test dependency.
- [ ] Run `npm test -- tests/articleSuggestions.test.ts tests/articleField.test.tsx tests/validation.test.tsx`; expect missing module/new behavior failures.
- [ ] Implement service, debounce hook, combobox navigation (ArrowDown/Up, Enter, Escape, active descendant), opaque listbox and disabled/search behavior. Selection updates `{value,selected}`; edits reset selection; paste URL updates visible section. Full suggestion failure does not prevent direct URL submission.
- [ ] Replace form with two labelled fields, one `Столкнуть`/`Остановить` action and swap. Resolve via Task 1, focus failing field, preserve selections across swap, keep URL update on valid submit. Share is removed from the input surface.
- [ ] Run focused tests; expect pass. Commit named files: `feat: select multilingual articles inside the spread`.

### Task 3: Разорванный разворот и ассеты

**Files:** Create `CollisionSpread.tsx`, `CollisionStage.tsx`, `SearchStatus.tsx`; replace `src/styles.css`; add `public/images/collision/`, `docs/collision-assets.md`; update `tests/searchCopy.test.tsx`, `tests/notFound.test.tsx` to new active components.

**Interfaces:** `CollisionStage` consumes `{ searching: boolean; searchId: number; progress: ThreadProgress|null }` and renders only sampleTitles/counts from that input. `SearchStatus` consumes `{ searching, error, notFound, canResume, onResume, onEdit, onSwap }` with existing `NotFoundState`/callback types. `CollisionSpread` consumes those plus form callbacks, `formRef`, pair display values and `resetKey`; it owns no worker or invented results.

- [ ] Write failing SSR tests: actual sample titles appear only during search; counts match supplied progress; idle has no fabricated path; each stopping reason has specific text and only available recovery actions; no shortest/reachability claim. Run focused tests to confirm failures.
- [ ] Generate separate production decorative octopus engraving (transparent cutout), print grain/torn-paper detail as needed; inspect them and save into workspace. Simple blue circle/rectangle and connector geometry use CSS/SVG. Record exact prompts and generated sources; convert delivery assets with existing sharp, retaining alpha where needed. Do not extract text from mock PNGs or use whole mocked screens as backgrounds.
- [ ] Build two overlapping paper fragments with a functional central seam and editorial publisher margin. Use the reference's scale, opposing serif/condensed faces and blue-black collage; add fixed language badges as metadata. Initial illustration retreats to abstract print grain when its corresponding example article changes. Decorative layers use `aria-hidden` and `pointer-events:none`.
- [ ] Write CSS for 360/768/1280 widths, short mobile viewports and content-dependent sizing. Keep full title visible even when it is a long URL; focused editing uses comfortable text size with a separate complete display layer if necessary. Main inputs and seam action precede lower decorative fragments in mobile layout priority.
- [ ] Implement one 750 ms collision transition on `searchId` change, finite decorative sample movement, and stationary idle/end. Reduced motion bypasses transforms. Never defer worker input or status visibility to animation.
- [ ] Run focused tests and `npm run build`; expect pass. Commit task files and assets: `feat: build the torn encyclopedia spread`.

### Task 4: Склеенная полоса результата

**Files:** Create `src/lib/routeRibbon.ts`, `src/components/RouteRibbon.tsx`, `tests/routeRibbon.test.tsx`; extend `src/styles.css`.

**Interfaces:** Export `RouteArticle extends ParsedArticle { href: string; number: number; row: number; column: number; crossLanguage: boolean }`, `routeArticles(path: string[], lang: string, multilingual: boolean): RouteArticle[]`. Three columns at desktop; odd visual rows reverse direction without reordering the DOM. `RouteRibbon` props `{ path: string[]; lang: string; multilingual: boolean; onNewPair(): void; onShare(): void; shareStatus: string }`.

- [ ] Write failing tests using linkedom: path order unchanged in one ordered list; each href encodes title and language; six-node route assigns desktop positions 01–03 left-to-right then 04–06 right-to-left; boundary link 03→04 never skips; only changed-language nodes have transition label; same article path has zero edges; 13-node path retains every article exactly once.
- [ ] Run `npm test -- tests/routeRibbon.test.tsx`; expect failures.
- [ ] Implement route decoding using `articleFromKey`, safe encoded hrefs, and one ordered DOM list. Display `Связь найдена`, edge/article counts, folios, language badges and arrow affordances. Route links are available immediately. Language labels accompany dashed joins; decorative SVG is hidden from assistive technologies.
- [ ] Render layout-aware connectors from measured article anchor positions with a finite resize/ResizeObserver recalculation. Geometry connects each consecutive pair and follows row turns. Mobile uses one vertical continuous path. Empty/zero-length measurement never produces an invalid SVG; remove observers on cleanup. No perpetual RAF and no summary-fetch thumbnails/fictional summaries.
- [ ] Add a 700 ms assembly reveal on result change with transforms/opacity; reduced motion skips it and focus is unaffected. Actions at ribbon end: `Новая пара`, `Поделиться`.
- [ ] Run focused tests; expect pass. Commit: `feat: assemble found paths into an editorial ribbon`.

### Task 5: App integration, recovery и оболочка

**Files:** Modify `src/App.tsx`, `index.html`, `public/manifest.webmanifest`, `scripts/pwa.ts`, `README.md`; remove unused old UI source only after consumers migrate. Preserve algorithm files.

**Interfaces:** Existing `search(from, to, multilingual)`, `startWorker(...)` and `resumeSearch()` keep worker input/message contracts. App tracks selected pair and form reset key, exposes `onNewPair()` to clear outcome, show form and focus first input; `onShare()` copies `queryUrl` of searched endpoints, not edited pending input. UI state precedence: active search > error > notFound > found > idle.

- [ ] Add failing browser tests in `e2e/search.spec.ts` for automatic cross-language URLs, swap preserving endpoint languages, copy URL after result, failed copy status, cancellation then fresh query, resume retaining languages, and late worker message not affecting replacement worker.
- [ ] Run focused cases against current build and confirm behavior fails (new action/controls absent).
- [ ] Connect new spread/ribbon/status to existing worker lifecycle; focus result heading without stealing active keyboard interaction, and return focus to form on new pair/recovery. Keep sampleTitles raw data and bounded search explanations near status.
- [ ] Remove theme initialization script/meta mismatch and obsolete preloads; update no-JS shell to the paper-world explanation and decorative art with truthful alt. Update PWA manifest/theme color and precache only used app illustration files. No API cache added.
- [ ] Remove old UI-only consumers and migrate tests that previously imported them; remove old theme/canvas animations rather than keeping duplicate hidden presentation. Algorithm/property tests stay unchanged. Update README about article-language selection and automatic cross-language mode.
- [ ] Run `npm test` and `npm run build`, then the task's selected e2e cases; expect pass. Commit named files: `feat: integrate the collision search experience`.

### Task 6: Проверка сценариев и визуальная сверка

**Files:** Modify `e2e/search.spec.ts`, `e2e/thread.spec.ts`, `e2e/notFound.spec.ts`, `e2e/visual.spec.ts`, `e2e/fallback.spec.ts`, `e2e/local.spec.ts`, `e2e/wikiMock.ts`; update `scripts/measure-bundle.mjs`; create `docs/collision-verification.md`, `docs/collision-bundle.json` and bounded reference screenshots.

**Interfaces:** Reuse real worker with mocked API; update existing Playwright file inventory instead of excluding obsolete failing suites. Measure script accepts `--out <file>` and defaults to old file for other branches.

- [ ] Update fixtures with explicit per-section nodes and language links. Add targeted failing regression cases for stale autocomplete selection, long Cyrillic/Latin titles, long URLs, 200% zoom, route lengths 1/2/12/13, row-boundary language changes, reduced motion and stopped animation after cancel/found/notFound.
- [ ] Replace theme matrices and old canvas-specific assertions with single-palette responsive checks, consecutive SVG connections and accurate stats. Keep no-path/depth/requests/time/resume coverage and zero Wikipedia requests in local mode.
- [ ] Run `npm test`, `npm run build`, `npm run test:e2e`, `npm run test:local`; inspect every exit/output. No unrelated dependency upgrades.
- [ ] Capture one batched visual review at 360/1280 for idle, searching, found and notFound using real mocked worker data. Compare with all four concept images: type scale, paper tear, diagonal tension, readable input and route order. Check focus, overflow, target sizes and axe. Record all defects, fix once as a batch, and confirm once. If a new functional regression is discovered, diagnose it separately instead of broad aesthetic iteration.
- [ ] Run `.agents/skills/impeccable/scripts/impeccable detect --json` on changed UI targets once after UI is complete; resolve material findings consistent with the brief.
- [ ] Run `node scripts/measure-bundle.mjs --out docs/collision-bundle.json`; retain existing 30 KB gzip growth check for JS/CSS/fonts, separately record delivery image sizes and lazy-load appropriate decoration. Do not overwrite user-modified bundle-final report.
- [ ] Save final prompts/provenance, fresh verification commands/results, actual screenshots and local preview URL. Commit implementation/verification files explicitly; exclude existing user changes. Confirm git branch/log/status after commit. No merge/publish.

## Self-review and Execution Handoff

Spec coverage: Task 1 owns language/query semantics; Task 2 owns inputs/suggestions; Task 3 owns world/images/search scene; Task 4 owns result; Task 5 owns lifecycle/shell; Task 6 owns responsive/accessibility/local/PWA regression checks. All five Review Focus risks have explicit owning tests. Shared types and component contracts are defined once above and reused by later tasks.

Baseline on 2026-10-03: `npm test` passed, 12 files / 52 tests. No implementation files changed while preparing this plan.

Recommended execution: **Native** — один исполнитель в текущей ветке: визуальная композиция, размеры полей и геометрия маршрута тесно связаны, и им полезен единый проход. Если пользователь выберет Native, применяется executing-plans; целостный review выполняется после проверок. Если выберет subagent-driven, применяется соответствующий workflow с независимыми implementer/reviewer.

План требует review и выбора способа исполнения перед началом реализации, по writing-plans и architectural gate brainstorming.
