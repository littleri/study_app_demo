# 错题集 UI 调研与生成记录

## 调研结论

成熟的错题集通常围绕“收集 → 诊断 → 重做 → 掌握”构建，而不是只保存错误题目。

- 收集：拍照、相册或课程作业自动入库，按科目、章节、知识点和标签归档。
- 记录：题干、学生答案、正确答案、解析、错因、知识点、来源、日期、错误次数与掌握状态。
- 复习：今日待复习、间隔重复、熟悉度评价、再次作答、答案遮蔽和复习记录。
- 巩固：反复错题标记、同类变式练习、在线重考、智能组卷和 PDF 导出。
- 分析：薄弱知识点、掌握趋势、重复错误与学习路径。

参考资料：

- [App Store：错题本-拍照整理作业错题](https://apps.apple.com/cn/app/%E9%94%99%E9%A2%98%E6%9C%AC-%E6%8B%8D%E7%85%A7%E6%95%B4%E7%90%86%E4%BD%9C%E4%B8%9A%E9%94%99%E9%A2%98/id6448860597)
- [Google Play：MistakeBook 错题本](https://play.google.com/store/apps/details?hl=zh&id=com.btpastry.mistakebook)
- [AI 错题本帮助中心](https://www.aierrorbook.com/help)
- [猫头鹰 AI 错题本](https://www.aicuoti.cn/)
- [Anki Manual：Leeches](https://docs.ankiweb.net/leeches.html)
- [Quizlet Learn](https://quizlet.com/features/learn)

## 视觉方向

1. `01-overview-list.png`：列表工作台，强调快速筛选、今日任务和批量管理。
2. `02-focused-review.png`：沉浸式单题重做，强调主动回忆、错因反思和掌握度反馈。
3. `03-analytics-dashboard.png`：平板数据工作台，强调薄弱点、趋势、智能组卷和错题详情联动。

三张图均使用项目现有的紫色主色与中性表面体系：`#7C3AED`、`#5B21B6`、`#F6F8FB`、`#20263A`、`#D7DEE8`。

## 最终生成提示词

生成方式：Codex 内置 `image_gen`，用途分类为 `ui-mockup`。

### 01 — Overview list

```text
Use case: ui-mockup
Asset type: high-fidelity mobile app UI reference for an existing Chinese course-learning product
Primary request: design a polished “错题集” overview and management screen that turns mistakes into an actionable daily review queue
Scene/backdrop: edge-to-edge portrait mobile application screen, no phone hardware, no presentation board, no hands
Style/medium: realistic shippable product UI, restrained modern Chinese education app, precise spacing, crisp flat interface, not concept art
Composition/framing: portrait mobile screen. Top app bar with title and search/filter icons; compact “今日待复习” summary card; segmented filter control; vertically scrollable mistake cards; sticky bottom primary action
Color palette: existing product palette — primary purple #7C3AED, pressed purple #5B21B6, off-white background #F6F8FB, white cards, dark navy text #20263A, subtle gray borders #D7DEE8; small amber warning accents only
Subject/UI details: header “错题集”; summary “今日待复习 / 8 道”; filters “全部 24 / 待复习 8 / 反复出错 5 / 已掌握 11”; search “搜索题目或知识点”; subject and knowledge-point tags; error-count badge; actions “重做 / 查看解析”; sticky CTA “开始今日复习”
Typography: clean PingFang SC / Noto Sans SC-like sans serif, readable Chinese, strong information hierarchy, 8pt spacing rhythm, 44px touch targets
Constraints: practical implementable layout; render specified Chinese verbatim; no extra navigation tabs; no gradients; no glassmorphism; no illustration; no logo; no watermark; no mock phone frame; no tiny illegible text; avoid clutter
Output intent: a single polished portrait UI screen suitable as a design reference
```

### 02 — Focused review

```text
Use case: ui-mockup
Asset type: high-fidelity mobile app UI reference for an existing Chinese course-learning product
Primary request: design an immersive “错题重做” single-question review screen focused on active recall, error reflection, and mastery rating
Scene/backdrop: edge-to-edge portrait mobile application screen, no phone hardware, no presentation board, no hands
Style/medium: realistic shippable product UI, calm focused Chinese education app, crisp flat interface, not concept art
Composition/framing: portrait mobile screen. Compact progress header; large central question card; answer-entry area; collapsible analysis panel; error-reason chips; fixed mastery actions at the bottom
Color palette: primary purple #7C3AED, deep purple #5B21B6, off-white #F6F8FB, white surfaces, dark navy #20263A, cool gray #D7DEE8; restrained amber/red for mistakes and mint for mastery
Subject/UI details: “错题重做”, “3 / 12”, “数学 · 二次函数”, “错 3 次”, question card, “写下你的答案”, “查看提示”, “我的答案 / 正确答案”, “这次为什么会错？”, chips “知识盲区 / 审题疏忽 / 计算错误 / 方法不熟”, “核心思路”, “查看完整解析”, mastery actions “还不会 / 有点模糊 / 已掌握”, and “回到教材原文”
Typography: clean PingFang SC / Noto Sans SC-like sans serif, generous line height, readable Chinese, strong hierarchy, 8pt spacing rhythm, 44px minimum touch targets
Constraints: practical implementable layout; render specified Chinese verbatim; no bottom navigation; no gradients; no glassmorphism; no illustration; no logo; no watermark; no mock phone frame; no tiny illegible text; avoid clutter
Output intent: a single polished portrait UI screen suitable as a design reference
```

### 03 — Analytics dashboard

```text
Use case: ui-mockup
Asset type: high-fidelity tablet/desktop responsive UI reference for an existing Chinese course-learning product
Primary request: design a data-driven “错题分析” workspace that combines weak-knowledge diagnosis, smart review planning, and a selectable mistake list
Scene/backdrop: edge-to-edge landscape tablet application screen, no tablet hardware, no presentation board, no hands
Style/medium: realistic shippable product UI, professional but friendly Chinese education app, crisp flat interface, not concept art
Composition/framing: 4:3 landscape tablet screen. Slim left navigation rail; page header; top KPI cards; two-column analytics middle section; bottom split pane with mistake list and selected-item preview
Color palette: primary purple #7C3AED, deep purple #5B21B6, off-white #F6F8FB, white cards, dark navy #20263A, cool gray #D7DEE8; amber/red only for weak points and mint for mastered states
Subject/UI details: selected navigation “错题集”; header “错题分析”; subtitle “用数据找到最值得复习的地方”; CTA “智能组卷”; KPI cards “错题总数 24 / 本周新增 6 / 待复习 8 / 已掌握 11”; weak-point bars; 4-week mastery trend; “今日复习计划 3 / 8”; “反复出错” table; selected-question preview with “题目 / 错因 / 掌握记录”; actions “重做此题 / 查看解析”
Typography: clean PingFang SC / Noto Sans SC-like sans serif, readable Chinese, strong data hierarchy, 8pt spacing rhythm, 44px touch targets
Constraints: practical implementable responsive layout; render specified Chinese verbatim; no gradients; no glassmorphism; no 3D charts; no illustration; no logo; no watermark; no device frame; no tiny illegible text; charts must be simple and readable; avoid dashboard clutter
Output intent: a single polished landscape tablet UI screen suitable as a design reference
```
