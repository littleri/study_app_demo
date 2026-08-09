# Community iOS books-grid reference prompt

Use case: ui-mockup

Asset type: high-fidelity iOS mobile community page reference for the existing BookCourse AI learning app

Input images: Image 1 is a layout reference only: borrow its compact colored top area, overlapping horizontal featured card, clean section hierarchy, and strict two-column community grid. Image 2 is a component-detail reference only: borrow its white-card spacing, rounded corners, clear title/subtitle hierarchy, and restrained elevation. Image 3 is the primary BookCourse AI visual-style reference: preserve its pale blue-white background, dark navy Chinese typography, purple-to-sky-blue accent system, friendly learning mood, soft rounded surfaces, floating AI assistant, and bottom navigation. Do not copy the green palette, people, avatars, English text, or navigation from Images 1–2.

Primary request: Generate a new portrait iOS community screen for BookCourse AI. It must clearly contain a section named "书籍分类" and a book list arranged as a strict two-column grid. This is a new generation using the images as references, not an edit or collage.

Style/medium: realistic shippable product UI, polished React/CSS-feasible mobile app screenshot, not concept art and not a wireframe.

Composition/framing: one full straight-on portrait iPhone screen, approximately 402×874 CSS-pixel proportions / 9:19.5 aspect ratio, full-bleed UI only, no physical phone frame, no hands, no perspective. Respect the iOS status bar and home indicator. Keep every section readable within one tall screen.

Color and mood: very pale cool blue app background; compact top header with a tasteful BookCourse purple-to-sky-blue gradient; near-white cards with fine cool-gray borders; modest soft shadows; 14–18 px corner radii; dark navy text; primary purple #7C3AED with limited sky-blue/cyan support. Friendly and calm, not childish, not gamified.

Layout from top to bottom:

1. iOS status bar showing 9:41.
2. Compact purple-to-sky-blue header. Large white title "社区", smaller white subtitle "发现同学分享的优质课程", and one small circular search icon button in the upper-right. No giant mascot.
3. A horizontal white featured-course card overlaps the bottom edge of the colored header, inspired by Image 1 but redesigned for books. On the left: a small genuine 3:4 biology textbook cover. Middle: label "与你教材匹配", bold title "遗传与进化高频考点课", metadata "人教版 · 高二 · 必修 2". On the right: compact purple action "查看".
4. Section heading "书籍分类". Directly under it, one compact horizontal category row with five clear selectable chips: "全部", "生物", "数学", "物理", "化学". The selected category "全部" uses purple fill; inactive categories are near-white with a subtle border. Give each chip a tiny simple subject icon, not avatars.
5. Section heading "热门书籍" with small action "全部".
6. REQUIRED: a strict two-column book grid, exactly two equal columns and at least four visible book cards across two rows. Never collapse to one column and never use three columns. Each book card is a compact white rounded card with a large 3:4 book-cover thumbnail at the top, followed by a small colored subject label, a bold book title, one line of grade/version metadata, and a small learner count. Maintain consistent card heights and aligned baselines.
   Card 1 exact content: label "生物"; title "遗传与进化"; metadata "高二 · 人教版"; count "128 人学习".
   Card 2 exact content: label "生物"; title "生态系统与稳态"; metadata "高二 · 人教版"; count "86 人学习".
   Card 3 exact content: label "数学"; title "函数与导数"; metadata "高二 · 北师大版"; count "203 人学习".
   Card 4 exact content: label "物理"; title "力与运动"; metadata "高一 · 人教版"; count "164 人学习".
   The four covers should feel like real modern Chinese high-school study-book covers: biology DNA/cell imagery, ecology/leaf imagery, math graph imagery, physics motion/force imagery. No recognizable copyrighted publisher logos.
7. A small floating purple-blue circular AI assistant button above the bottom navigation near the lower-right, matching Image 3 and not covering a book card.
8. Floating rounded white bottom navigation bar matching the existing BookCourse AI app. Four labeled items only: "首页", "社区", "学习", "我的". "社区" is clearly active with the blue-purple selection treatment; the other items use dark navy/gray outline icons. Include the iOS home indicator below.

Typography: Chinese system sans resembling PingFang SC / Noto Sans SC. Bold dark navy section headings, strong but compact card titles, readable metadata. Maintain practical 44 px touch targets and careful alignment.

Text (verbatim): "社区", "发现同学分享的优质课程", "与你教材匹配", "遗传与进化高频考点课", "人教版 · 高二 · 必修 2", "查看", "书籍分类", "全部", "生物", "数学", "物理", "化学", "热门书籍", "遗传与进化", "高二 · 人教版", "128 人学习", "生态系统与稳态", "86 人学习", "函数与导数", "高二 · 北师大版", "203 人学习", "力与运动", "高一 · 人教版", "164 人学习", "首页", "社区", "学习", "我的".

Constraints: The "书籍分类" heading must be visible. The book list must visibly use two equal columns. Render Chinese text verbatim and do not invent English text. Make the result consistent with Image 3 and implementable in the current frontend. Preserve adequate contrast, compact information density, consistent margins, and clear hierarchy.

Avoid: green-dominant palette; copying the people or avatars from the references; single-column book list; three-column list; horizontal scrolling book list; giant hero illustration; oversized cloud mascot; dashboard KPI tiles; social-media follower avatars; nested cards; heavy glassmorphism; gradient text; excessive blur; excessive saturation; beige or cream background; tiny unreadable text; upload action in bottom navigation; physical phone mockup; watermark; unrelated brand logos; malformed duplicated characters.

## Reference images

- `codex-clipboard-e266ebf0-6a77-4b27-9e5a-2d5abbffd649.png`: uploaded full community-interface layout reference.
- `codex-clipboard-064419f4-904b-4810-b525-98048ac08670.png`: uploaded white-card detail reference.
- `e2e/stage7.spec.ts-snapshots/home-iphone-17-pro-win32.png`: primary BookCourse AI visual-style reference.
