# Collision experience verification — 2026-10-04

Verified on `redesign/incompatible-pages`, starting from Task 5 commit `25e252e`. Local preview: http://127.0.0.1:5173/ (Vite development server). Browser verification used the production build at http://127.0.0.1:4173/; local graph verification used http://127.0.0.1:4174/. No publish or merge performed.

## Fresh commands and results

| Command | Result |
| --- | --- |
| `npm test` | Exit 0; 16 files, 98 tests passed, including exhaustive shortest-path comparisons on 200 seeded random graphs. |
| `npm run build` | Exit 0; TypeScript and Vite passed. Worker remains `bfs.worker-cJcbjwNC.js`. |
| `npm run test:e2e` | Before the narrow final-review fix (`a125c7f`): exit 0; 64 Chromium tests passed in 27.0 seconds. All five existing browser suites remain active; no suite exclusion or skip added. |
| `npm run test:e2e -- e2e/search.spec.ts e2e/visual.spec.ts` | After final-review fixes: exit 0; all 36 affected cases passed in 12.6 seconds, including the new keyboard-scroll regression and eight refreshed captures. |
| `npm run test:local` | At `a125c7f`: exit 0; fixture graph build, local Vite build and 1 browser test passed; two fresh workers each fetched the graph once, with zero Wikipedia requests. |
| `node scripts/measure-bundle.mjs --out docs/collision-bundle.json` | Exit 0; 279,974 bytes gzip for JS/CSS/WOFF2/TTF; baseline 474,655, delta −194,681, below the unchanged 30,000-byte growth cap. |
| `.agents/skills/impeccable/scripts/impeccable detect --json src/App.tsx src/components/ArticleField.tsx src/components/SearchForm.tsx src/components/CollisionSpread.tsx src/components/CollisionStage.tsx src/components/SearchStatus.tsx src/components/RouteRibbon.tsx src/styles.css` | Root ran once after the aesthetic UI batch at `a125c7f`, before the narrow review fixes: exit 0, `[]`. |
| `git diff --check` | Exit 0. |

A sandboxed browser invocation initially failed before running tests with `listen EPERM` on port 4173. It was rerun with the required escalation; final browser results above are from successful runs. Existing Node `NO_COLOR`/`FORCE_COLOR` warnings are informational. No dependency upgrades were made. The user-modified `docs/bundle-final.json` was neither overwritten nor staged; the measurement script defaults to that path for other branches and accepts `--out` here.

## Coverage and functional defects

The original 12 Task 5 search cases remain, covering API/missing endpoints, shared URLs, keyboard autocomplete, automatic language changes, language-preserving swap/resume, searched-pair sharing, clipboard failure, cancellation/replacement, late old-worker messages, candidate/notFound precedence, focus recovery and offline shell/art/font decode. Three added browser cases verify delayed stale autocomplete, a surviving EN suggestion when all other sections fail, and leaving an editor through its edit button/listbox.

The keyboard regression failed on the prior implementation: input blur correctly retained editing when moving within the field, but leaving the edit button or Chromium's automatically focusable scroll container emitted no input blur. Moving the handler to the ArticleField wrapper closes editing and the listbox when focus leaves the entire field. The final regression passes. Suggestions continue to use the existing serialized queue and freshness guards; no algorithm or API changes were needed.

Browser checks cover 360/767/768/1280 CSS-pixel widths, complete long Cyrillic/Latin titles, long percent-encoded Wikipedia URLs, route lengths 1/2/12/13, exact consecutive measured SVG connectors, correct transition/article statistics, language changes specifically between nodes 03/04 at a row boundary, finite animation at found/notFound/cancel, reduced motion, visible keyboard focus, 44px button and visible link targets, overflow and axe. No-path, depth, requests, time, resumable and non-resumable stops all remain covered with accurate visited/depth counts and recovery actions. The time fixture delays neighbor expansion after endpoint resolution, allowing the real BFS to create its resume state before timeout.

200% zoom coverage explicitly emulates the browser-zoom layout metrics for a 1280px physical display: a 640px CSS viewport at device pixel ratio 2, with editable controls, full route, sharing action, overflow and axe checks. It does not claim to drive the browser toolbar zoom setting. No-JavaScript coverage verifies the truthful bounded-search explanation, decoded decorative octopus and matching paper theme color. Local mode keeps Wikipedia requests at zero.

## Batched visual review

Actual browser captures live in `docs/verification/collision/`:

| State | Mobile | Desktop |
| --- | --- | --- |
| Idle | [idle-360.png](verification/collision/idle-360.png) | [idle-1280.png](verification/collision/idle-1280.png) |
| Searching | [searching-360.png](verification/collision/searching-360.png) | [searching-1280.png](verification/collision/searching-1280.png) |
| Found | [found-360.png](verification/collision/found-360.png) | [found-1280.png](verification/collision/found-1280.png) |
| Not found | [notFound-360.png](verification/collision/notFound-360.png) | [notFound-1280.png](verification/collision/notFound-1280.png) |

These full-page PNGs use viewport heights of 900px, local fonts, reduced motion and a real Web Worker with mocked Wikipedia API responses. `EXAMPLE_ROUTE` explicitly defines separate RU/EN nodes and language links: Осьминоги → Зоология → Наука → Science → Design → Bauhaus. This is a test fixture, not a claim that those links have been checked against the current Wikipedia. Ordinary API-backed cases do not replace the Worker. Only the lifecycle suite's budget/late-message scenarios control the worker boundary, and budget checks override limits while retaining the real worker/source/BFS.

Root compared the batch to all four approved concept PNGs: `incompatible-pages-desktop.png`, `incompatible-pages-mobile.png`, `incompatible-pages-found-desktop.png` and `incompatible-pages-found-mobile.png`. Four defects were recorded and fixed together: orphaned final S in Bauhaus, desktop result heading/caption overlap, desktop octopus covering the publisher mark, and angular polygon strip edges. The batch adjusted short destination type scale, contained the result type scale, added a paper backing to the publisher mark, and replaced coarse polygons with an authored fibrous SVG mask and the existing grain texture. Two browser geometry regressions failed before that batch and pass after it: the example word fits one line at 360/1280 and the heading does not overlap the caption.

Root inspected all eight refreshed captures once after the aesthetic batch at `a125c7f`, confirmed those defects resolved, and found no additional blocking visual or functional defect. The serif/grotesk scale, torn seam, diagonal print composition, readable editing surface, route order and responsive vertical ribbon preserve the approved direction. Concept routes remain illustrative; product routes come only from worker results. No repeated aesthetic iteration was performed. The later narrow publisher hit-area correction refreshed these same eight captures once during the affected-suite run.

## Asset delivery and provenance

Existing generation prompts and provenance remain in [collision-assets.md](collision-assets.md), [initial concept prompt](concepts/incompatible-pages-prompt.md) and [state concept prompts](concepts/incompatible-pages-states.md). No new image-generation prompt was needed in Task 6. The new `paper-strip.svg` is authored vector geometry with seeded SVG turbulence/displacement, not AI-generated raster art. Icons reuse existing vector geometry with paper/ink/ultramarine colors; `node scripts/prepare-icons.mjs` deterministically creates both SVG files and the 180/192/512px PNG variants using the already installed sharp.

Image delivery sizes are recorded separately from the JS/CSS/font growth metric:

| Asset | Bytes |
| --- | ---: |
| `images/collision/octopus.webp` | 641,816 |
| `images/collision/octopus-small.webp` | 180,816 |
| `images/collision/tear.webp` | 144,380 |
| `images/collision/paper-strip.svg` | 589 |
| `images/grain.webp` | 88,398 |
| `favicon.svg` / `icon.svg` | 370 each |
| `apple-touch-icon.png` | 4,090 |
| `icon-192.png` | 4,404 |
| `icon-512.png` | 15,767 |

Octopus `srcset` delivers the 600px file on narrow screens. The visible initial composition and result heading art remain eager; no extra offscreen decorative image was introduced. Unused legacy images are not part of the application precache. The new 589-byte strip mask joins the used grain, tear, responsive octopus images, icons and build assets in the PWA precache. Wikipedia responses remain outside the service worker cache. Root confirmed the final artwork in the reviewed browser screenshots.


## Final-review corrections

The independent whole-branch review found one keyboard visibility defect, one touch-target omission and two stale README sentences. Before the fix, the eighth ArrowDown option remained clipped below the listbox, and the mobile publisher link measured only 28.59375px high. Both regressions failed in the focused browser run.

ArticleField now reveals the nearest clipped edge of its active option by changing only the listbox scroll position. It retains combobox focus and does not scroll page ancestors. The new real-browser test reaches option 8, wraps down to option 1, wraps up to option 8 and reopens with ArrowUp from no active selection; every step checks full visibility, retained focus and unchanged page scroll. The focused GREEN run passed 1/1. The publisher link has a 44px minimum hit height, and the capture audit now checks all visible interactive links as well as buttons on search and result surfaces. README now lists RU/EN/DE/FR/ES suggestions and the final paper/ink/ultramarine icon palette with the regeneration command.

Post-fix verification: `npm test` passed 98/98 in 16 files, `npm run build` passed, and `npm run test:e2e -- e2e/search.spec.ts e2e/visual.spec.ts` passed 36/36 in 12.6s, refreshing the eight screenshots once. Bundle measurement was refreshed to 279,974 gzip bytes, delta −194,681. The earlier 64-case whole-browser and local-zero-Wikipedia run remain the evidence for unchanged thread/notFound/fallback/local paths; no claim is made that all 65 current browser cases were rerun after this narrow correction. Root owns the scoped final rereview.
