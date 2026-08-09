# Motion Step 8 migration audit appendix

This appendix is the explicit disposition ledger for every legacy Stage 3B, Stage 4, and Stage 5 behavior formerly carried by `e2e/motion.spec.ts`, plus the Stage 4/5 responsive and deterministic-demo paths formerly carried by `e2e/responsive.spec.ts` and `e2e/demo-repository.spec.ts` at `HEAD`.

The source inventory is reproducible with:

```text
git show HEAD:e2e/motion.spec.ts
git show HEAD:e2e/responsive.spec.ts
git show HEAD:e2e/demo-repository.spec.ts
```

No legacy HTTP fixture server is used by the replacement motion suite. Current browser coverage runs against `DemoRepository`; the request audit in `e2e/motion.spec.ts` fails any `/api/` or cross-origin request and any unacknowledged console/page error.

## Disposition vocabulary

- **Migrated** — the current application still exposes the behavior and it is exercised through a real user route.
- **Current equivalent** — the old carrier or fixture-specific state no longer exists, but its surviving contract is exercised through the closest real current state.
- **Removed / unreachable** — current `DemoRepository` cannot produce the old state. Exact source symbols are named so this is an auditable disposition rather than an omitted test.
- **Non-motion contract** — retained in a focused unit/geometry suite because the assertion is data validation or layout, not a motion lifecycle.

## Current evidence keys

The tables use the following stable test-title and source-symbol keys.

| Key | Current evidence |
|---|---|
| M-PRESENCE | `e2e/motion.spec.ts` — “keeps local 299/300ms and global 449/450ms Presence fallbacks generation-bound with complete timer cleanup”; real `useMotionPresence` instances are mounted by `e2e/motion-presence-harness.tsx`. The test covers simultaneous normal timers, runtime-reduce cancellation with zero fired stale callbacks, replacement-relative old/new deadlines, and active unmount cleanup. |
| M-NAV | `e2e/motion.spec.ts` — “settles real A→B→C navigation only from C and ignores stale completion/cancellation across generations”. |
| M-SHEETS | `e2e/motion.spec.ts` — “covers bookSwitcher, Chat, Source, and Note sheets through focus, replacement, rapid reopen, and cleanup” and “runs the real editChapter sheet through enter, focus, immutable exit, generation cleanup, and trigger restore”. |
| M-AI-TOAST | `e2e/motion.spec.ts` — “keeps AI panel and scrim synchronized through rapid close/reopen, stale generations, focus return, and reduced cleanup” and “isolates consecutive Toast generations, stale events/timers, 3200ms dwell, and 180/150ms visual phases”. |
| M-UPLOAD | `e2e/motion.spec.ts` — “uses real local validation, upload, parse status, and success feedback at 180/200ms” plus “keeps the real reduced upload, Processing, ChapterConfirm, and CourseReady path direct and consumes one-shot keys”. |
| M-CARD | `e2e/motion.spec.ts` — “plays the current real course card once across Home and Library without synthetic state probes”; `src/motion/courseCardMotion.test.ts` verifies the current five-card/120ms stagger cap through the real exported symbols `shouldAnimateCourseCard`, `clampCourseCardMotionIndex`, and `getCourseCardStaggerDelayMs`. |
| M-IMAGE | `e2e/motion.spec.ts` — “plays the actual cover once per DOM node without replaying duplicate load” and “keeps a routed actual-cover failure as a stable non-animated fallback”. |
| M-SOURCE | `e2e/motion.spec.ts` — the normal rapid-switch/failure tests plus “keeps the real SourceReader cited page, switch, image, and reconstructed re-entry direct under reduced motion without normal replay”. |
| M-NOTES | `e2e/motion.spec.ts` — “replaces Notes detail once, preserves master identity, and does not replay the selected same state”. |
| M-COMMUNITY | `e2e/motion.spec.ts` — “keeps Community same-state direct while rebuilt local surfaces and covers receive one new DOM entry”. |
| M-PLAN | `e2e/motion.spec.ts` — “keeps StudyPlan date and task feedback one-shot and direct for same-state or reduced updates”. |
| M-ASSIGN | `e2e/motion.spec.ts` — “scopes Assignment feedback and Diagnosis motion to the real answer/submission identity without replay”. |
| M-LOCAL-SCREENS | `e2e/motion.spec.ts` — “keeps Lesson, Report, Export, and Profile local entries scoped to their current real screen instances”. |
| M-FLASH-MISTAKE | `e2e/motion.spec.ts` — the three tests under “local collapse, filter, and flashcard state motion”. |
| M-CSS | `e2e/motion.spec.ts` — “uses no transition-all, restricts keyframes, and leaves no permanent compositor residue”; `src/motion/sourceMotionContract.test.ts` audits every production stylesheet and the exact GSAP inventory. |
| R-GEOMETRY | `e2e/responsive.spec.ts` — seven real-route tests across the paired viewport matrix. `expectStrictHorizontalBounds` uses Playwright `locator(selector).all()` and per-element locator assertions to enforce document/app/screen/content/key-control containment for every match. The current-destination journey reaches SourceReader, StudyPlan, Assignment, Diagnosis, Lesson, Report, Notes, Export, Profile, and Community; the real StudyPlan entry must settle without sticky obstruction, receive focus, and activate through Enter. A separate visualViewport test checks every Lesson entry/list/tool and every toolbar control. Only the iPad Study `.study-book-bar` and `.study-add-button` may use the measured 8–10px documented overhang. |
| U-CHAPTER | `src/utils/chapterStructure.test.ts` — `validateChapterDraft`, `buildChapterTree`, `findChapterRangeConflicts`, and `getChapterDescendantIds`. |
| D-REPOSITORY | `src/services/DemoRepository.ts` — `uploadFile`, `getJob`, `buildLessons`, and `getLessonJob`. The current deterministic implementation returns successful upload/build paths; parse polling exposes only 18/46/74/100 progress, `processing`/`done`, and `error: null`. |

## Legacy `e2e/motion.spec.ts`: Stage 3B

| Legacy behavior (exact former title) | Disposition | Current evidence / rationale |
|---|---|---|
| keeps upload success, background progress, and completed-library feedback local across the four viewport mappings | Current equivalent | M-UPLOAD covers real selection, upload success, 18→46→74 processing, newly completed checks, ChapterConfirm, and CourseReady. R-GEOMETRY carries the paired viewport contract. The old background-upload/library carrier is absent from current D-REPOSITORY. |
| makes a failed upload clear, local, and retryable without changing the successful request path | Current equivalent | M-UPLOAD performs an invalid `.exe` selection, observes real local error motion, then retries with a valid PDF and completes the normal repository path. Server upload failure is removed: D-REPOSITORY `uploadFile` is deterministic success. |
| keeps parse and library failures explicit, local, and connected to the existing retry route | Removed / unreachable | D-REPOSITORY `getJob` has no failed status and always returns `error: null`; the old fixture-only parse/library retry carrier cannot be reached. Current recoverable media failure/retry is covered by M-SOURCE and M-IMAGE. |
| does not replay a library processing feedback surface for same-status polling updates | Current equivalent | M-UPLOAD retains the first two real processing-check DOM nodes through the next poll and proves only the newly completed stage enters. The old Library processing surface no longer exists. |
| renders Stage 3B1 status feedback at its final state under reduced motion while preserving ARIA | Migrated | M-UPLOAD asserts real progress ARIA; `e2e/responsive.spec.ts` — “keeps upload error/selection status readable and direct under runtime reduced motion” asserts direct reduced state. |
| consumes each strict chapter-status key once across same-status rerenders, save, and re-entry | Current equivalent | M-UPLOAD settles every real `.chapter-status-mark` and verifies cleanup. M-SHEETS exercises real save/reopen generations; current `useChapterStatusMotion` in `src/screens/ChapterConfirmScreen.tsx` owns strict status keys. |
| keeps a dirty chapter draft scoped to its identity and only animates an explicit save once | Migrated | M-SHEETS edits a real chapter, submits it, waits for immutable sheet exit, and verifies the corresponding directory title update. |
| consumes a reduced-mode save before restoring normal motion without replaying its sequence | Migrated | M-SHEETS opens and saves the real editChapter sheet under runtime reduced motion, asserts synchronous unmount, and verifies the updated row without an intermediate visual phase. |
| keeps selection, delete feedback, and the sticky confirmation state local without changing request behavior | Migrated | M-SHEETS uses the real two-step delete confirmation, verifies the selected directory row is removed, and verifies focus is not lost to `BODY`. |
| renders ChapterConfirm feedback directly at the final state under reduced motion | Migrated | M-UPLOAD reaches the real ChapterConfirm under reduced motion, proves reviewed marks have no intermediate node, restores normal motion, and proves the consumed keys do not replay. M-SHEETS separately covers reduced edit/save. |
| consumes each strict CourseReady key once across a parent rerender, leave/re-entry, and a new lesson-build job | Current equivalent | M-UPLOAD reaches the real CourseReady mark, completes it, sends a duplicate completion, and proves it stays idle. D-REPOSITORY produces one deterministic build identity; the old fixture’s independently minted build jobs are unavailable. |
| keeps ChapterConfirm failure and retry in their existing carrier before CourseReady receives a successful job | Removed / unreachable | D-REPOSITORY `buildLessons`/`getLessonJob` expose only processing/done success and no injectable failure. The real success path remains covered by M-UPLOAD. |
| renders CourseReady success feedback at its final state under reduced motion | Migrated | M-UPLOAD follows the real deterministic build to CourseReady under reduced motion, asserts the success mark, check path, and successful image are direct, then restores normal motion and proves the same consumed key/DOM does not replay. |
| fades each successful cover once per DOM node while preserving cached and new-URL lifecycles | Migrated | M-IMAGE proves one entry per real cover DOM and no duplicate-load replay; M-COMMUNITY proves rebuilt-DOM cover entry. |
| uses stable failed-cover fallbacks without leaving image animation residue | Migrated | M-IMAGE routes the actual cover request to 404 and verifies a stable, non-animated fallback. |
| does not suppress an unrelated matching failed-image console error | Migrated | M-SOURCE acknowledges only the exact routed 404 console message and asserts all other captured console errors remain absent; the motion fixture’s audit fails unmatched console errors. |

## Legacy `e2e/motion.spec.ts`: Stage 4

| Legacy behavior (exact former title) | Disposition | Current evidence / rationale |
|---|---|---|
| plays at most six first course cards once across Home, Library, rerenders, re-entry, and a newly refreshed book | Migrated with current policy | M-CARD exercises real Home→Library semantic-key consumption. The current explicit policy is five animated cards, not the old six; `src/motion/courseCardMotion.test.ts` locks five and a maximum 120ms stagger. |
| uses direct final card states under reduced motion and consumes their session keys | Migrated | M-CARD reconstructs the real card under reduced motion and asserts direct idle/no animation. |
| limits detail entry to named local nodes and fades the Lesson citation image once per rebuilt DOM | Current equivalent | M-LOCAL-SCREENS proves named Lesson local entry and cleanup; M-IMAGE/M-SOURCE prove real image DOM-scoped lifecycle. |
| uses direct final local states under reduced motion without adding long-list entry motion | Migrated | M-LOCAL-SCREENS reconstructs Profile under reduced motion and asserts direct idle; M-PLAN, M-ASSIGN, M-NOTES, and M-COMMUNITY cover the other current local surfaces. No directory/list container receives entry motion. |
| keeps a failed Lesson citation image in the same stable media fallback | Current equivalent | The current reachable cited-page failure/recovery path is SourceReader, covered by M-SOURCE. The former separately injected Lesson-image fixture is absent from D-REPOSITORY. |
| replaces only source-page content across failure, page changes, rapid switches, and back restoration | Migrated | M-SOURCE preserves the shell, performs rapid page generation replacement, rejects stale completion, tests routed failure→next-page recovery, and verifies reconstructed re-entry. |
| renders source-page content and image directly at their final state under reduced motion | Migrated | M-SOURCE explicitly covers the initial cited page, real page switch, successful image, reconstructed re-entry, and restoration to normal motion without same-key replay. |
| keeps StudyPlan feedback scoped to real date, empty-state, and task transitions without replay | Migrated | M-PLAN covers real date selection, selected-same-state identity, task completion, already-complete no replay, and reduced date selection. The deterministic current plan has no user-reachable empty date. |
| keeps Assignment selection and existing submission behavior keyboard-safe | Current equivalent | M-ASSIGN covers the real textarea, non-empty answer presence, edit-without-replay, submit, and return/resubmit. `e2e/state-motion.spec.ts` — “real assignment path blocks an empty answer before either backend call” retains empty-submit behavior. |
| renders StudyPlan and Assignment directly under reduced motion | Migrated | M-PLAN and M-ASSIGN both exercise real runtime reduced routes and assert direct final states. |
| keeps Flashcard 3D geometry and interaction lock inside the core answer region | Migrated | M-FLASH-MISTAKE locks the 200ms flip/crossfade, disables reveal during the active response, and settles from the real animation event. |
| uses no Flashcard 3D geometry under reduced motion | Migrated | M-FLASH-MISTAKE toggles runtime reduced motion and verifies the direct answer state/no geometry transition. |
| uses a submission-scoped diagnosis key and grows only its result bar | Migrated | M-ASSIGN verifies the real submission key, 180ms card entry, 200ms named progress curve, and scale-only progress carrier. |
| renders diagnosis results and scaleX bars directly under reduced motion | Migrated | M-ASSIGN returns and resubmits under reduced motion, then asserts direct idle/no animation. |
| replaces only the selected MistakeBook and Notes detail while their master lists keep identity | Migrated | M-NOTES preserves the Notes list and replaces only detail. M-FLASH-MISTAKE exercises the real MistakeBook filter indicator and empty result. |
| keeps Notes to existing records and preserves the existing Lesson note ActionSheet focus flow | Migrated | M-NOTES selects only existing records. M-SHEETS covers the real Lesson Note ActionSheet entry, focus ownership, exit, fallback, focus restoration, rapid reopen, and reduced cleanup. |
| uses direct final MistakeBook and Notes states under reduced motion | Migrated | M-NOTES and M-FLASH-MISTAKE both exercise runtime reduced final states. |
| reuses actual Community cover images through success and a rebuilt DOM without geometry shift | Migrated | M-COMMUNITY settles the actual cover, leaves/re-enters Community, and proves the rebuilt DOM receives exactly one new entry. R-GEOMETRY enforces containment. |
| keeps a failed actual Community cover in its stable fallback with no residual animation | Current equivalent | The shared actual-cover fallback is covered directly by M-IMAGE; M-COMMUNITY covers the Community DOM lifecycle. |
| renders the remaining Stage 4C local surfaces and Community covers directly under reduced motion | Migrated | M-COMMUNITY covers Community detail/import and cover under reduced motion; M-LOCAL-SCREENS covers Profile under reduced motion. |
| keeps Report, Profile, Community, Import, and Export reachability scoped to one local surface | Migrated | M-LOCAL-SCREENS runs Lesson→Report→Notes→Export→back→Study→Profile and verifies one scoped local entry/root; M-COMMUNITY covers detail/import reachability and reconstruction. |

## Legacy `e2e/motion.spec.ts`: Stage 5

| Legacy behavior (exact former title) | Disposition | Current evidence / rationale |
|---|---|---|
| settles rapid navigation, all ActionSheet variants, Toast replacement, and the AI Orb | Migrated | M-NAV, M-SHEETS, and M-AI-TOAST cover rapid generations, all five current sheet variants, consecutive Toast replacement, and AI panel/orb cleanup. |
| keeps retry, same-status polling, completion, and study surfaces independently settled | Migrated / current equivalent | M-UPLOAD covers real validation retry, same-node polling, and completion; M-PLAN, M-ASSIGN, M-SOURCE, and M-LOCAL-SCREENS cover current Study surfaces. Fixture-only server retry states are explicitly removed above. |
| keeps viewport proxy, contrast audit, keyboard flow, and reduced-motion feature equivalence | Migrated | R-GEOMETRY covers paired viewports and exact containment; M-SHEETS and M-AI-TOAST cover focus/keyboard ownership; all current suites include real runtime reduced paths. Contrast remains a style/accessibility gate rather than a motion state injection. |
| audits CSS keyframes, transition scope, and settled compositor residue | Migrated | M-CSS plus `src/motion/sourceMotionContract.test.ts` provide browser-settled residue checks and source-wide parsed CSS/GSAP policy checks. |

## Legacy responsive Stage 4/5 behaviors

| Legacy behavior (exact former title) | Disposition | Current evidence / rationale |
|---|---|---|
| rejects Stage 4 chapters outside their parent page range | Non-motion contract | U-CHAPTER validates overlap/range failures through `validateChapterDraft`; real edit error motion remains covered by M-UPLOAD/M-SHEETS. |
| accepts Stage 4 chapters with an empty parent ID as top-level | Non-motion contract | U-CHAPTER verifies stable top-level tree construction from null parent IDs. |
| completes the Stage 4 upload-to-course flow with responsive editing | Migrated | M-UPLOAD plus M-SHEETS cover the current real flow/editing; R-GEOMETRY covers the paired responsive shells. |
| renders Stage 4 long failures, retry navigation, and 100 percent progress without overflow | Current equivalent / removed | D-REPOSITORY no longer emits long server failures. M-UPLOAD covers validation retry and real 18/46/74/100 completion; R-GEOMETRY enforces exact content bounds. |
| lays out the Stage 5 home and library grid while loading, truncating, and deleting real courses | Current equivalent | R-GEOMETRY covers Home/Library real cards and key controls. The current deterministic repository does not expose fixture-driven loading/delete course mutations. |
| presents the Stage 5 course overview and every lesson learning entry | Migrated | R-GEOMETRY opens the real Study overview and checks its root, switcher, plan summary, section toggle, and tool cards strictly within bounds. M-LOCAL-SCREENS covers Lesson. |
| keeps Stage 5 source page switching and back navigation on the source-reader path | Migrated | M-SOURCE exercises real next-page switching and leave/re-entry restoration. |
| recovers Stage 5 source-reader media from a failed cited page to the next successful page | Migrated | M-SOURCE routes the actual cited image to 404, verifies fallback, removes the route, and succeeds on the next page DOM. |
| keeps Stage 5 image fallback geometry stable when covers and source images fail | Migrated | M-IMAGE and M-SOURCE assert stable non-animated fallbacks; R-GEOMETRY enforces bounds. |
| keeps the Stage 5 lesson toolbar reachable without covering content across short landscape and visual viewports | Migrated | R-GEOMETRY uses the real `small-phone-short-landscape` project and paired/shrunken visualViewport metrics, obtains the complete toolbar list through Playwright `locator(selector).all()`, scrolls and waits for each item sequentially, and verifies strict horizontal bounds, complete `topInsideVisual`/`bottomInsideVisual` containment, 44px targets, and unobscured centers. |
| keeps the Stage 5 lesson flashcard, exercise, and completion destinations connected | Migrated | M-LOCAL-SCREENS reaches completion/report; M-ASSIGN reaches exercise/diagnosis; M-FLASH-MISTAKE reaches the real flashcard interaction. |

The current responsive exception is intentionally narrower than the former generic tolerance: there is no blanket `<=16px` allowance. Only the iPad Study `.study-book-bar` and its `.study-add-button` may report the exact documented 8–10px overhang; document, app shell, screen roots, content roots, and key controls remain strict.

## Legacy deterministic-demo behaviors

| Legacy behavior (exact former title) | Disposition | Current evidence / rationale |
|---|---|---|
| opens the grounded meiosis lesson and blocks an empty diagnosis submission | Migrated | M-LOCAL-SCREENS opens the grounded lesson; `e2e/state-motion.spec.ts` retains the real empty-answer block before repository calls; M-ASSIGN covers the successful diagnosis path. |
| replays upload through report with deterministic local data only | Migrated | M-UPLOAD completes upload→processing→ChapterConfirm→CourseReady entirely through D-REPOSITORY; M-LOCAL-SCREENS reaches Report through the deterministic course. The request audit proves no remote/API fixture traffic. |

## Gate record

The final execution record is filled only from clean command exits; warnings are recorded separately from failures.

| Gate | Result |
|---|---|
| `npx playwright test e2e/motion.spec.ts e2e/responsive.spec.ts --list` | Fourth-remediation current inventory: **PASS**, 150 listed tests: 108 motion plus 42 responsive. |
| `npm run lint` | Fourth-remediation current run: **PASS**. |
| `npm test -- --run` | Fourth-remediation current run: **PASS**, 131/131 across 17 files. |
| `npm run build` | Fourth-remediation current run: **PASS**, TypeScript plus Vite production build; 1,829 modules transformed. |
| `npm run test:motion` (four core projects) | Fourth-remediation current run: **PASS**, 108/108. |
| `npm run test:responsive` (full configured matrix) | Fourth-remediation current run: **PASS**, 52/52: 42 responsive plus 10 device-preview tests. |
| `npm run test:state-motion` (four core projects) | Fourth-remediation current run: **PASS**, 20/20. |

Non-failing warnings: the local Vite process reports that its optional LAN HTTPS certificate is not installed; the production build also reports a 666.39kB minified JavaScript chunk above Vite's advisory 500kB threshold. Neither warning changed a gate exit code.

Responsive stability history, not current acceptance evidence: the first third-remediation full run was 51/52 because Chromium reported a transformed 44px close target as `43.99993896484375px`; the assertion added a 0.001px floating-point tolerance and its focused rerun passed 1/1. The second third-remediation full run was 51/52 because a pointer click in the existing short-landscape Study collapse test raced the 200ms local layout animation and was intercepted by adjacent real cards; that flow changed to real focus + Enter activation and waits for `aria-expanded="true"`, with its focused rerun passing 1/1. A later third-remediation local full run passed 52/52 and a focused `--repeat-each=3` run passed 12/12, but the independent third review subsequently failed 51/52 on the `ipad-pro-11-landscape` real current-destination journey: the StudyPlan entry was still activated by pointer click while its sticky summary could sit under the sticky book bar. That independent 51/52 result superseded the earlier local clean run and is retained here strictly as historical failure evidence.

Fourth-remediation current evidence: strict repeated-selector and complete-control enumeration now uses Playwright `locator(selector).all()` with per-element locator visibility and geometry assertions. The StudyPlan entry scrolls the real `.screen-content` back to its unobstructed position for the sticky iPad layout, waits across animation frames for stable geometry and a successful center hit-test, verifies focus, activates with Enter, and reaches `.study-plan-screen`. An initial centered-scroll diagnostic reproduced the obstruction 3/3; after the sticky-aware correction, the iPad landscape current-destination journey passed `--repeat-each=3` 3/3. The six-project Lesson paired/shrunken visualViewport test passed `--repeat-each=3` 18/18 while requiring each toolbar control's complete top and bottom rectangle, shell bounds, unobscured center, and 44px target. The subsequent current full responsive run passed 52/52.
