# 社区页参考图 V2（纯色主题）

生成方式：Codex 内置 ImageGen（reference-image generation）

参考图：

1. `codex-clipboard-e266ebf0-6a77-4b27-9e5a-2d5abbffd649.png`：仅参考社区页的信息层级、横向推荐卡片、分类区与双列网格布局。
2. `codex-clipboard-064419f4-904b-4810-b525-98048ac08670.png`：仅参考白色卡片的留白、圆角与标题/副标题层级。
3. `codex-clipboard-4de4d1ef-2c18-4475-96bf-e59583e17b00.png`：作为 BookCourse AI 当前前端主题的权威参考，匹配纯色中性背景、深藏青文字、纯紫色主操作和白色底部导航。

## 最终提示词

```text
Use case: ui-mockup
Asset type: corrected high-fidelity iOS mobile community-page reference for the existing BookCourse AI frontend
Input images: Image 1 is a layout reference only: borrow its compact header, horizontal featured-content card, clear section order, and strict two-column content grid. Image 2 is a card-detail reference only: borrow its comfortable white-card spacing, rounded corners, and clear title/subtitle hierarchy. Image 3 is the authoritative BookCourse AI theme reference: match its solid neutral surfaces, dark navy Chinese typography, solid purple primary controls, restrained semantic colors, white bottom navigation, and overall spacing. IMPORTANT: ignore the green gradient in Images 1–2. Ignore any blue/purple lighting inside the raster hero illustration in Image 3; that lighting belongs to the image asset and is not the UI theme.
Primary request: Generate a new portrait iOS community screen for BookCourse AI that matches Image 3’s current solid-color frontend theme. It must visibly contain "书籍分类" and a strict two-column book list. This is a new generation, not an edit or collage.
Style/medium: realistic, shippable product UI that can be implemented with React and CSS; not concept art and not a wireframe.
Composition/framing: one full straight-on portrait iPhone screen, approximately 402×874 CSS-pixel proportions / 9:19.5 aspect ratio, full-bleed UI only, no external phone frame, no hands, no perspective. Respect iOS status-bar and home-indicator safe areas. Fit the main hierarchy and four book cards into one tall screen.
Color system — SOLID COLORS ONLY:
- page background: one uniform solid pale cool gray-blue #F6F8FB
- content surface: solid white #FFFFFF
- secondary surface: solid #F3F6FB
- primary text: solid dark navy #20263A
- secondary text: solid #4F5E75
- border: solid cool gray #D7DEE8
- primary action and selected state: solid purple #7C3AED
- pressed/deeper purple may be solid #5B21B6
- semantic accents may use separate solid green, blue, orange, or purple, never blended together
Do not use gradients anywhere in the UI. No gradient header, no gradient buttons, no gradient chips, no gradient navigation selection, no gradient AI button, no gradient page background, no gradient text, and no decorative color transitions.
Layout from top to bottom:
1. iOS status bar showing 9:41.
2. Compact neutral page header on the same solid #F6F8FB background. Dark navy title "社区", smaller subtitle "发现同学分享的优质课程", and a small white circular search button with a solid purple search icon on the upper-right. No colored header band and no illustration.
3. Directly below the header, one horizontal solid-white featured-course card with a 1 px cool-gray border and restrained 14–16 px corners. Do not overlap a colored header. Left: a small real 3:4 biology textbook cover. Middle: small solid purple-soft label "与你教材匹配", bold title "遗传与进化高频考点课", metadata "人教版 · 高二 · 必修 2". Right: compact solid-purple text action "查看" and chevron.
4. Section heading "书籍分类". Under it, one compact horizontal category row with five selectable chips: "全部", "生物", "数学", "物理", "化学". Selected "全部" is a solid #7C3AED pill with white icon and text. Inactive chips are solid white with a cool-gray border and dark text. Use small solid-color subject icons; no avatars.
5. Section heading "热门书籍" with small solid-purple action "全部".
6. REQUIRED: one strict two-column book grid with exactly two equal columns and four visible cards across two rows. Never use one column, three columns, or a horizontal carousel. Each card is a solid-white rounded rectangle with a thin cool-gray border and either no shadow or a very tight subtle neutral shadow. Each card contains a prominent 3:4 book-cover thumbnail, a small solid-color subject label, a bold book title, one grade/version line, and one learner-count line. Align card heights and typography.
   Card 1: label "生物"; title "遗传与进化"; metadata "高二 · 人教版"; count "128 人学习".
   Card 2: label "生物"; title "生态系统与稳态"; metadata "高二 · 人教版"; count "86 人学习".
   Card 3: label "数学"; title "函数与导数"; metadata "高二 · 北师大版"; count "203 人学习".
   Card 4: label "物理"; title "力与运动"; metadata "高一 · 人教版"; count "164 人学习".
   Book covers may contain natural educational photography or illustration—DNA/cells, ecology/leaf, graph, motion/force—but the surrounding UI must stay flat and solid-colored. No recognizable publisher logos.
7. A small floating AI assistant button near the lower-right above navigation. It must be a single solid purple circle #7C3AED with a white outline chat icon, matching Image 3. No blue blend, no gradient, no glow.
8. Floating solid-white rounded bottom navigation matching Image 3, with four items only: "首页", "社区", "学习", "我的". "社区" is active inside one solid-purple pill with white icon and white text. Other items use dark navy outline icons and labels. No gradient selection and no upload action. Include a black iOS home indicator below.
Typography: Chinese system sans similar to PingFang SC / Noto Sans SC. Dark navy headings, readable 12–16 px metadata, clear alignment, practical 44 px touch targets.
Text (verbatim): "社区", "发现同学分享的优质课程", "与你教材匹配", "遗传与进化高频考点课", "人教版 · 高二 · 必修 2", "查看", "书籍分类", "全部", "生物", "数学", "物理", "化学", "热门书籍", "遗传与进化", "高二 · 人教版", "128 人学习", "生态系统与稳态", "86 人学习", "函数与导数", "高二 · 北师大版", "203 人学习", "力与运动", "高一 · 人教版", "164 人学习", "首页", "社区", "学习", "我的".
Hard constraints: No UI gradients of any kind. The "书籍分类" heading must be clearly visible. The book list must visibly use two equal columns. Render Chinese text verbatim with no English UI copy. The result must look like a new page inside the exact frontend shown in Image 3, not a separate design system.
Avoid: all gradients; colored top banner; blue-purple blend; luminous background wash; green-dominant palette; people and avatars from reference images; single-column list; three-column list; horizontal book carousel; giant hero; mascot; dashboard metrics; follower avatars; nested cards; glassmorphism; heavy blur; wide decorative shadows; beige/cream background; tiny text; external phone frame; watermark; unrelated logos; malformed or duplicated Chinese characters.
```

## 产物

- `community-ios-books-grid-reference-v2-solid.png`
- 版本说明：V2 明确以现有首页截图为主题基准，移除上一版的大面积紫蓝渐变；采用统一浅灰蓝背景、白色内容面、深藏青文字和纯紫色选中态。
