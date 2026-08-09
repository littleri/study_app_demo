# Community iOS reference image prompt

Use case: ui-mockup

Asset type: high-fidelity iOS mobile app community-page reference image for the existing BookCourse AI frontend

Input images: Image 1 is the primary visual-style reference for the existing app UI, including its pale blue-white background, navy Chinese typography, rounded white surfaces, blue-purple accent, floating assistant orb, spacing rhythm, and bottom navigation. Image 2 is a supporting brand-mood reference only for the soft cloudlike pastel blue/lilac atmosphere; do not reproduce its large mascot or turn the screen into an illustration.

Primary request: Generate a new, shippable-looking portrait iOS community discovery screen that feels unmistakably part of the same frontend as Image 1, while improving the community page information architecture. This is a new screen, not an edit of either reference.

Style/medium: realistic production product UI, high-fidelity mobile app screenshot, not concept art, not a wireframe.

Composition/framing: one full portrait mobile app screen, approximately iPhone 17 Pro proportions, straight-on, full bleed UI only, no physical phone frame, no hands, no desk, no perspective tilt. Respect iOS safe areas. Keep the density practical and readable.

Scene/backdrop: very pale blue-white app background with a subtle cool luminous wash. Restrained near-white cards, fine cool-gray borders, modest soft shadows, 14–18 px corner radii. Dark navy text. Primary purple #7C3AED, pressed deep purple, with sparing sky-blue/cyan support. Preserve the gentle cloudlike companion feeling from the existing frontend without a large decorative hero.

Layout and hierarchy, top to bottom:

1. Compact page header with title "社区" and subtitle "发现适合你当前教材的课程与学习笔记".
2. A prominent rounded search field with a search icon and placeholder "搜索教材、课程或知识点".
3. A compact current-textbook context surface: label "当前教材", main line "生物 必修 2 · 遗传与进化", and a small secondary action/value "12 个匹配". Include a tiny book-cover thumbnail, not an illustration.
4. A horizontally scrollable row of compact filter chips. The selected chip is "与你教材匹配"; other chips are "同步学习", "考前复习", "专项训练". Selected state uses restrained purple fill; inactive chips are white with subtle border.
5. Section heading "与你教材匹配" with small action "全部".
6. Two vertically stacked, information-rich horizontal course cards. Each card uses a genuine 3:4 textbook/course thumbnail on the left and structured information on the right, not a large top image.
   First course exact content: title "遗传与进化高频考点课"; metadata "人教版 · 高二 · 必修 2"; a visible trust/match tag "与你的教材匹配"; summary "3 章 · 24 闪卡 · 8 练习"; creator line "高二 3 班 林同学".
   Second course exact content: title "减数分裂动画讲解课"; metadata "第 2 章 · 图示讲解"; summary "3 节 · 20 闪卡"; creator line "AI 课程广场". Give the cards strong scan hierarchy, not equal-sized text everywhere.
7. Lower section heading "同教材热门问题". Show one compact interactive discussion row with a speech-bubble icon, question "同源染色体和姐妹染色单体怎么区分？", meta "18 条学习笔记", and a small chevron.
8. A small floating purple-blue circular AI assistant button above the bottom navigation near the lower-right, consistent with Image 1 and not covering content.
9. A floating rounded white iOS bottom navigation bar consistent with Image 1, with four equally understandable labeled items: "首页", "社区", "学习", "我的". The "社区" item is clearly active using the existing blue-purple selection treatment; the other items are inactive dark navy/gray. Use familiar outline icons.

Typography: Chinese system sans similar to PingFang SC / Noto Sans SC, bold dark navy headings, readable 12–16 px metadata and 20–26 px page title. Crisp text, careful alignment, consistent baselines, practical touch targets.

Text (verbatim): "社区", "发现适合你当前教材的课程与学习笔记", "搜索教材、课程或知识点", "当前教材", "生物 必修 2 · 遗传与进化", "12 个匹配", "与你教材匹配", "同步学习", "考前复习", "专项训练", "全部", "遗传与进化高频考点课", "人教版 · 高二 · 必修 2", "与你的教材匹配", "3 章 · 24 闪卡 · 8 练习", "高二 3 班 林同学", "减数分裂动画讲解课", "第 2 章 · 图示讲解", "3 节 · 20 闪卡", "AI 课程广场", "同教材热门问题", "同源染色体和姐妹染色单体怎么区分？", "18 条学习笔记", "首页", "社区", "学习", "我的".

Constraints: Render the requested Chinese text verbatim wherever it appears; do not invent extra copy. Maintain the existing frontend’s restrained product design and friendly learning mood. Make all major controls look implementable with React and CSS. Clear information hierarchy, generous but not wasteful spacing, at least 44 px touch targets, readable contrast. The key focus is resource discovery and textbook matching, not social-media engagement metrics.

Avoid: giant decorative hero; oversized cloud mascot; dashboard KPI tiles; colorful leaderboard; nested cards; identical card grid; glassmorphism as a decorative default; gradient text; excessive saturation; beige or cream background; tiny unreadable metadata; English placeholder text; bottom nav with an upload action; physical phone mockup; watermark; unrelated logos; malformed duplicated characters.

## Reference images

- `e2e/stage7.spec.ts-snapshots/home-iphone-17-pro-win32.png`: primary frontend visual-style reference.
- `public/assets/brand/community-hero-bg.png`: supporting brand-mood reference only.
