# 社区页参考图 V3（纯色修正版）

生成方式：Codex 内置 ImageGen，参考图编辑模式。

基础生成提示词见 `community-ios-books-grid-reference-v2-solid.prompt.md`。V3 以 V2 生成图为输入，只修正紫色控件和页面表面的色彩表现，不改变信息架构、中文内容、图标、书籍封面或双列布局。

## 最终修正提示词

```text
Edit this existing BookCourse AI iOS community-page UI reference with surgical precision.

Keep absolutely everything unchanged: the entire layout, all spacing, card sizes, four book covers, Chinese text, icons, status bar, two-column book grid, category labels, navigation labels, white cards, borders, and page composition.

ONLY correct the color rendering so the surrounding UI uses genuinely flat solid fills:
1. Replace the selected “全部” category chip fill with one uniform solid purple #7C3AED from edge to edge. No blue area, no violet transition, no highlight, no lighting, no gradient.
2. Replace the floating chat button fill with one uniform solid purple #7C3AED. Keep the white chat icon. No blue blend, no radial highlight, no glow, no gradient.
3. Replace the active bottom-navigation “社区” pill fill with one uniform solid purple #7C3AED. Keep its white icon and white label. No blue side, no magenta side, no lighting, no gradient.
4. Ensure the page background is one uniform solid pale cool gray-blue #F6F8FB, white surfaces are solid #FFFFFF, and secondary surfaces are solid #F3F6FB. Remove any broad color wash or decorative lighting from UI surfaces.
5. Purple text and icons should use one flat solid purple #7C3AED.

Do not redesign, crop, rearrange, add, delete, or rewrite anything. Do not change any book-cover artwork; natural shading and photography inside book covers may remain. Do not change the status-bar icons or home indicator. The final image must remain a full straight-on portrait iOS screen with the exact same dimensions and composition.

Hard constraint: zero gradients on UI components. Flat, solid, implementation-ready React/CSS UI.
```

## 产物

- `community-ios-books-grid-reference-v3-flat.png`
- 说明：V3 是本轮推荐交付版本；V2 被保留用于对照。
