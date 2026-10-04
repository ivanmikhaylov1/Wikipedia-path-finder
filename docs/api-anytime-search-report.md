# API anytime search — implementation verification

Implemented on `redesign/incompatible-pages`, based on `32984d4`.

The API engine alternates bidirectional BFS, targeted bridge checks, and guided exploration. It publishes the first verified route, continues seeking strictly shorter routes, and retains the best route on cancellation, timeout, budget exhaustion, and errors. Depth/HTTP/time bounds mean neither finding a route nor global shortestness is guaranteed. A saved browser graph is reused as stale evidence and verified before publishing new candidates. No paid service, Google Drive dependency, or prebuilt transfer graph was added.

## Verification

- Unit/integration: **151/151**, 27 test files.
- Browser: **76/76**, including progressive routes, resume, keyboard/focus, mobile and accessibility.
- TypeScript and production build: passed.
- Local Worker compatibility: **1/1** (verified before final API-only fixes).
- Lighthouse: medians **100** performance/accessibility/best practices/SEO (verified before final API-only fixes).
- Final gzip asset total: **263,322 bytes**; bundle growth gate passed. User's existing `docs/bundle-final.json` was preserved.
- Real-adapter fixture benchmark, three repetitions, cold/warm cache: baseline **18/42**, anytime **30/42**. The five reachable scenarios contribute 30 runs; impossible/empty scenarios contribute 12 expected misses. Thus reachable outcomes were **18/30 → 30/30**. These are controlled fixtures, not live Wikipedia speed measurements.

## Independent review and fixes

One independent whole-branch reviewer reproduced six Important findings. Each was fixed in one TDD pass with an observed failing regression and a passing final suite:

1. Invalid continuation restarts discard the previous adjacency generation and invalidate corresponding discovered edges.
2. Persisted incoming redirect aliases are resolved again before creating current evidence.
3. Cached multilingual edges require the current canonical destination to match.
4. Bridge acquisition returns one HTTP page per turn; pending jobs/cursors survive resume and frontier changes.
5. Acquisition uses shared locks and persistent revision checks; delayed writes cannot replace newer complete records.
6. Resume considers already discovered candidates immediately, and rejected edges allow remaining routes to be reconsidered.

No deferred minor findings. No second reviewer was dispatched, as required by the execution workflow.

## Recorded decisions

- Ruling: Work in the user's current feature checkout, redesign/incompatible-pages — user selected implementation by me in this session; preserve existing modifications — costs lack of an isolated branch, mitigated by staging only task files.
- Ruling: Keep legacy API facades for baseline/local compatibility; introduce progressive acquisition separately and share reusable records when query semantics match — avoids unnecessary regressions — costs two acquisition paths until migration.
- Ruling: API normalization requires up to two validation requests per stale edge — reserve test uses 8 total/2 validation rather than 4/1 — tiny budgets may retain only previously validated results.
- Ruling: API acquisition lives in apiGraphAcquisition.ts to keep ApiLinkSource's facade small — same transport and budget — costs an additional focused module.
- Task 2: Ruling: reverse reachability may legitimately include ru:A through ru:A→en:B→en:A; corrected a test's title-only expected list to language-qualified identities — prevents mistaking legitimate cross-language reachability for duplicate identity.
- Ruling: Probe a direct endpoint link before the first BFS page — a cheap exact check can bypass 500-link truncation and avoid unnecessary acquisition — costs one shared-budget request on non-direct pairs.
- Ruling: Extracted searchWorker.ts for a testable real Worker boundary and updated App's resume type in Task 4 — avoids importing worker globals in tests — costs one focused module.
- Ruling: Depth exhaustion after all allowed work produces no resume token — a fresh budget cannot extend the unchanged depth bound — avoids a recovery button that cannot progress.
- Ruling: Tiny-budget E2E resume checks progress within the fresh budget, not a guaranteed complete route — stale-route validation may need more requests than such a budget permits.
- Ruling: Benchmark exercises both real API adapters against HTTP-shaped fixtures rather than counting high-level fixture methods — includes normalization and pagination in actual transport counts — costs extra fixture code, avoids misleading request comparisons.
- Ruling: Warmup has the same bounded request/time limits and reports partial warmup explicitly — a large live redirect family must not make a benchmark run unbounded — partial warm caches are labeled in JSON.
- Ruling: Node TypeScript project includes search modules and fixture types used by the CLI — ensures the benchmark is build-checked — costs duplicate type checking across app/node projects.
- Final: Ruling: Use Web Locks for cross-worker/tab acquisition and revision-aware IndexedDB transactions; fallback serializes instances within one realm — protects progress without a paid service — browsers without Web Locks may duplicate HTTP work across realms, but older revisions cannot overwrite newer records.
- Final: Ruling: Serialize one bridge HTTP page and its pending jobs in the resume state — enforces strategy fairness and preserves observed links — costs larger resume messages for large redirect families.
