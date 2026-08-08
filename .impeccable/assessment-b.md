# Impeccable Critique — Assessment B

## Scope and isolation

- Assessment: **B only (detector + browser evidence)**. No Assessment A files or results were read.
- Stable target: `D:\code\study_app_demo\src`
- Live target: `http://127.0.0.1:5173/?preview=devices&device=iphone-17-pro&orientation=portrait&quality=fit&chrome=1`
- Product context: mobile-first BookCourse AI for high-school students; evidence was checked against the stated WCAG AA, 44 px touch-target, and reduced-motion requirements without making Assessment A aesthetic judgments.
- Required references read in full before the scan: Impeccable `SKILL.md`, `reference/critique.md`, and `reference/product.md`. The required context script resolved `PRODUCT.md` with register `product`.
- Relevant source inspected for routing and browser-state interpretation: `src/App.tsx`, `src/main.tsx`, `src/context/AppContext.tsx`, `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/responsive.css`, and `src/styles/motion.css`.

## CLI detector

### Invocation and exit status

The detector was run **exactly once**:

```text
node C:\Users\ren_xingyu\.agents\skills\impeccable\scripts\detect.mjs --json D:\code\study_app_demo\src
```

- Actual exit code: **1**
- JSON finding count: **2**
- Important contract mismatch: `critique.md` documents exit code `0` for clean and `2` for findings, but this invocation returned valid JSON findings with exit code `1`. The JSON was still complete and usable. The scan was not repeated.

### Counts by rule

| Rule (`antipattern`) | Human-readable name | Count |
|---|---|---:|
| `side-tab` | Side-tab accent border | 1 |
| `layout-transition` | Layout property animation | 1 |
| **Total** |  | **2** |

### Exact locations

1. `side-tab` — **Side-tab accent border**
   - File: `D:\code\study_app_demo\src\styles\base.css`
   - Line: **4178**
   - Snippet: `border-left: 4px solid #8f79ff`
   - Imported by: `main.tsx`
   - Local context: `.plan-link-card`; surrounding declarations include `border-radius: 0 12px 12px 0`, `background: transparent`, and `box-shadow: none`.

2. `layout-transition` — **Layout property animation**
   - File: `D:\code\study_app_demo\src\styles\home.css`
   - Line: **166**
   - Snippet: `transition: width`
   - Imported by: `main.tsx`
   - Local context: `.home-focus-progress span`, transitioning progress width with `var(--motion-duration-progress)` and `var(--motion-ease-enter)`.

### Complete detector JSON

```json
[
  {
    "antipattern": "side-tab",
    "name": "Side-tab accent border",
    "description": "Thick colored border on one side of a card — the most recognizable tell of AI-generated UIs. Use a subtler accent or remove it entirely.",
    "severity": "warning",
    "file": "D:\\code\\study_app_demo\\src\\styles\\base.css",
    "line": 4178,
    "snippet": "border-left: 4px solid #8f79ff",
    "importedBy": [
      "main.tsx"
    ]
  },
  {
    "antipattern": "layout-transition",
    "name": "Layout property animation",
    "description": "Animating width, height, padding, or margin causes layout thrash and janky performance. Use transform and opacity instead, or grid-template-rows for height animations.",
    "severity": "warning",
    "file": "D:\\code\\study_app_demo\\src\\styles\\home.css",
    "line": 166,
    "snippet": "transition: width",
    "importedBy": [
      "main.tsx"
    ]
  }
]
```

## False-positive accounting

- **No obvious CLI false positive was discarded.** Both results match their source text exactly.
- `layout-transition` is context-sensitive rather than an obvious false positive: the matched element is a bounded progress fill, so its user impact may be lower than a general layout animation, but it still animates `width` and therefore mechanically matches the rule. A `transform: scaleX(...)` implementation would avoid layout work.
- Browser overlay totals are **manifestation counts, not unique root-cause counts**. Shared card/nav styles recur on many elements and across views; repeated `hairline border with wide shadow` labels should not be treated as that many independent design-system defects.
- The browser detector's `low contrast text` labels are evidence signals requiring final computed-color/contrast confirmation. Transparent layers, background images, and stacked surfaces can make individual contrast sampling context-sensitive. No individual label was dismissed without such confirmation.
- A stylesheet-level finding can appear in the detector banner on several views even when the matching element is not present in that view. That repetition is not a new per-view defect.

## Browser evidence

### Browser setup and mutable-injection preflight

- Used the required `browser:control-in-app-browser` skill and created a **new, isolated in-app Browser tab**. No existing/user tab was claimed or reused.
- The device-preview document contained one same-origin iframe with `src="/?embedded=device-preview"`; all app overlays were injected into that embedded app document, not merely the outer preview workbench.
- Playwright `evaluate(...)` was treated as read-only and was **not** used to claim mutation success.
- Mutable preflight used the tab's CDP capability to:
  1. change `document.title` from `BookCourse AI` to `BookCourse AI [Impeccable Preflight]`;
  2. append `<script id="impeccable-preflight-script" type="application/json">`;
  3. read both values back in a separate verification call.
- Preflight result: **success** (`scriptPresent: true`, changed title verified).
- Browser session was named `[Human] Assessment B` before the visibility attempt.

### Visibility and presentation

- `visibility.set(true)` was attempted only after mutable injection was confirmed, as required.
- Browser visibility result: **failed/unavailable** with the concrete runtime response: `IAB visibility is not supported in a subagent thread`.
- Because the tab could not be surfaced to the user, this run does **not** claim a persistent user-visible `[Human]` overlay. Evidence fallback was the verified overlay DOM state, `impeccable` console messages, DOM snapshots, and four Browser screenshots.

### Live detector server and overlay injection

- Started the Impeccable live server with `--background`.
- The start command itself returned no stdout, but `.impeccable/live/server.json` authoritatively confirmed:
  - PID: `24240`
  - Port: `8400`
  - Token: present
- Injected `http://localhost:8400/detect.js` into the embedded app document through a real `<script>` element for each representative view. Each injection resolved via its `load` event and `scriptConnected: true`.
- Waited 2.5 seconds after each injection before reading `tab.dev.logs({ filter: "impeccable" })` and overlay DOM state.
- The overlay DOM used `.impeccable-overlay` / `.impeccable-label`; screenshots visibly confirmed yellow annotations inside the emulated iPhone frame.

### Representative views sampled

Four views were sampled (within the requested 3–5 range):

| View | DOM snapshot evidence | Console detector result | Overlay DOM evidence | Screenshot/visual signal |
|---|---|---:|---|---|
| Home | `h1` “Hi，小明同学”; “今日下一步”, “我的课程”, “学习工具”; four-item bottom navigation | **9 anti-patterns found** (`detect.js?view=home`) | Eight element overlays/labels plus the detector banner were present; injected script verified | Visible labels included low-contrast signals and shared border/shadow signals on the course/navigation surfaces |
| Community | Header “社区”; `h2` “看看同学们正在学什么”; four shared course buttons; “社区动态” | **18 anti-patterns found** (`detect.js?view=community`) | 17 element labels plus detector banner; labels comprised 9 `low contrast text` and 8 `hairline border with wide shadow` | Screenshot confirmed labels across hero copy, course cards, and shared navigation |
| Upload | Header “上传书籍”; `h2` “上传一本书”; native file control plus “选择文件”; upload-support aside | **14 anti-patterns found** (`detect.js?view=upload`) | 13 element labels plus detector banner; labels comprised 9 `low contrast text` and 4 `hairline border with wide shadow` | Screenshot confirmed signals on header/support copy and upload option cards |
| Profile | Header “我的”; `h2` “我的学习”; metrics 0/82/12; five settings/action rows | **21 anti-patterns found** (`detect.js?view=profile`) | 20 element labels plus detector banner; labels comprised 9 `low contrast text` and 11 `hairline border with wide shadow` | Screenshot confirmed repeated shared card-row and muted-copy signals |

Notes:

- The per-view console totals are not summed as unique issues because the same styles and components recur across views.
- Console check for ordinary warnings/errors returned an empty array (`[]`).
- The first Playwright click on the embedded “社区” nav button resolved uniquely but did not change app state. After a fresh state check, navigation used a snapshot-grounded, unique CDP DOM `.click()` fallback. Every fallback navigation was verified by active-nav/header state and a fresh DOM snapshot; no guessed selector was used.
- The outer device-preview snapshot consistently verified iPhone 17 Pro portrait, logical viewport `402 × 874 CSS px`, Fit quality, 71% scale, and Phone layout family.

## Skipped/failed steps and fallback signals

| Step | Status | Concrete reason | Fallback/verification |
|---|---|---|---|
| User-visible Browser presentation | Failed/unavailable | `IAB visibility is not supported in a subagent thread` | Verified injection load, overlay DOM, `impeccable` console logs, DOM snapshots, and screenshots |
| Playwright mutation preflight | Intentionally not used | Browser skill states Playwright `evaluate(...)` is read-only | CDP mutation plus independent readback of title and script node |
| First embedded nav Playwright click | No state change | Unique locator click completed but active nav remained Home | Snapshot-grounded unique CDP DOM click; active state and DOM snapshot verified afterward |
| Overlay injection | Succeeded | N/A | Script `load`, `scriptConnected: true`, console result, overlay node count, screenshot |
| General console issues | None observed | `tab.dev.logs` at warning/error levels returned `[]` | DOM and screenshot evidence remained the fallback for visual/browser issues |

## Cleanup status

- **Overlay cleanup: complete.** Removed the current view's 42 temporary inner-document nodes and four detector style elements; post-cleanup verification returned `remainingInner: 0` and `remainingStyles: 0`.
- **Preflight cleanup: complete.** Removed `#impeccable-preflight-script`, restored outer title to `BookCourse AI`, and verified `preflightPresent: false`.
- **Live-server cleanup: complete.** `live-server.mjs stop` reported `Stopped live server on port 8400.` Subsequent verification showed PID `24240` not alive and `.impeccable/live/server.json` absent.
- **Temporary-file cleanup: complete.** No annotation/session files remained. Only persistent `.impeccable/live/annotations/`, `.impeccable/live/sessions/`, and `.impeccable/live/config.json` remained; these were not created as disposable report artifacts in this run.
- **Tab cleanup: complete.** Finalized the Browser session with `keep: []`, closing the newly created Assessment B tab and leaving user tabs untouched.
- **Product source changes: none.** Only this Assessment B report was written.
