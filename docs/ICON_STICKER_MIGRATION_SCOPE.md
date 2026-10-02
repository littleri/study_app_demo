# 彩色徽章图标改为贴纸式卡通图标：修改范围

完成日期：2026-10-02。当前界面中仍在使用的下列徽章入口已替换为 `StickerIcon`，包含 33 款自定义彩色 SVG 图形和统一贴纸容器样式。

## 目标风格

沿用项目现有的贴纸式视觉语言：深色边框和图形描边、多色底板、偏移硬阴影、不对称圆角及轻微旋转。现有参考是个人页积分、视频生成弹窗、学习画像问卷。

## 已完成的 16 组使用场景

按使用位置列出。同一 SVG 图形在不同位置出现时，需分别处理对应的容器和状态；本表不是去重后的图形数量。

| 组 | 页面 / 使用位置 | 需要处理的图标和状态 | 组件入口 | 样式容器 |
| --- | --- | --- | --- | --- |
| 1 | 首页和学习页的章节工具 | 作业 `ClipboardCheck`、闪卡 `Layers3`、错题 `BookX`、笔记 `NotebookPen` | `src/components/study/ChapterToolCards.tsx:22`、`:109` | `.study-tool-card-icon`；定义见 `chapter-tools.css`，另有 `study.css` 和 `home.css` 覆盖 |
| 2 | 首页快捷入口 | 学习计划 `CalendarDays`、错题复习 `CircleAlert`、课程资料 `Upload` | `src/screens/HomeScreen.tsx:85`、`:95` | `.home-global-action-icon`，包含 `is-plan` / `is-mistakes` / `is-upload` 配色 |
| 3 | 首页和学习页的空状态 | 首页无课程 `BookOpenText`；学习页无课程 `Upload`、无可用课程 `LibraryBig` | `src/components/home/HomeBookCarousel.tsx:239`；`src/screens/StudyScreen.tsx:355` | `.home-book-empty > span`、`.study-empty-icon` |
| 4 | 学习页课程和计划标识、桌面侧栏课程 | 学习计划提示 `Check`、无封面课程的小占位图标 `LibraryBig`、侧栏课程 `BookOpenCheck` | `src/screens/StudyScreen.tsx:551`、`:595`；`src/components/ui.tsx:444` | `.study-plan-icon`、`.study-book-cover-placeholder`、`.primary-nav .nav-course-mark` |
| 5 | 学习计划页概览 | 计划概览日历 `CalendarDays` | `src/screens/StudyPlanScreen.tsx:188` | `.plan-hero-card .book-summary-icon` |
| 6 | 新手引导及创建 / 调整课程 | 称呼步骤 `Sparkles`、目标步骤 `BookOpen`、时间步骤 `Clock3`、创建 / 调整课程题头 `BookOpen` | `src/features/courses/FlowScreens.tsx:127`、`:144`、`:164`、`:373` | `.learning-flow-symbol`；学习画像问卷下的同名容器已是贴纸，应保留其现有样式 |
| 7 | 学习建议和课程资料 | 学习建议 `CalendarDays`、书籍资料 `BookOpen`、本地文件 `FilePlus2` | `src/features/courses/HomeScreens.tsx:13`、`:149` | `.learning-recommendation-icon`、`.course-space-book-icon` |
| 8 | 新建笔记、笔记列表、笔记详情 | 新建：文字 `NotebookPen`、手写 `PenLine`、语音 `Mic2`；列表和详情：文字 `FileText`、手写 `PenLine`、语音 `Mic2` | `src/screens/sheets/NoteTypeSheetContent.tsx:15`、`:70`；`src/screens/NotesScreen.tsx:22`、`:179`、`:216` | `.note-type-icon`、`.study-note-kind-icon`，包含文字 / 手写 / 语音的全部配色 |
| 9 | 原文里的文字笔记标记 | 文字批注气泡 `MessageSquareText` | `src/features/studyNotes/SourceTextAnnotationLayer.tsx:54`、`:78` | `.source-text-note-marker > span`，包含展开和悬停状态 |
| 10 | 作业页 | 作业进度题头 `BookOpenCheck`；判断题 `CheckCircle2`、选择题 `ListChecks`、简答题 `FileText` | `src/screens/AssignmentScreen.tsx:34`、`:232`、`:267` | `.assignment-progress-icon`、`.assignment-exercise-kicker > span` |
| 11 | 作业诊断结果页 | 诊断完成 `CheckCircle2`、诊断解析 `BookOpenCheck`、学习提示 `Lightbulb` | `src/screens/DiagnosisScreen.tsx:92`、`:110`、`:144` | `.diagnosis-status-icon`、`.diagnosis-section-heading > span` |
| 12 | 错题本 | 复习概览 `CalendarClock`、错因 `RotateCcw`；同容器的复习重点 `Target` 一并适配；加载 `BookOpenCheck`、异常 `AlertCircle`、无结果 `Search`、全部完成 / 无待复习 `CheckCircle2` | `src/screens/MistakeBookScreen.tsx:388`、`:466`、`:473`、`:501`、`:505`、`:527`、`:534` | `.mistake-overview-icon`、`.mistake-detail-block-icon`、`.mistake-state-icon`；重点的底板目前是白色，属于同组件变体 |
| 13 | 个人页 | 今日任务：待完成 `BookOpen`、已完成 `Check`；无学习计划 `CalendarCheck2`。当前个人页已无原课程行徽章入口 | `src/screens/ProfileScreen.tsx` | `.profile-task-icon`、`.profile-plan-empty-icon` |
| 14 | AI 对话和原文 AI 面板 | AI 消息 / 回复等待 `Bot`、用户消息 `User`、原文 AI 面板 `Sparkles`、教材引用 `BookOpenCheck` | `src/components/ui.tsx:1816`、`:1869`、`:2101`；`src/features/studyNotes/SourceRegionAiPanel.tsx:297`；引用卡调用见 `src/screens/sheets/ChatSheetContent.tsx:149` | `.ai-message-avatar`，包括 AI / 用户两种配色；`.source-region-ai-avatar`、`.citation-icon` |
| 15 | 上传、解析、目录确认和课程生成的完成提示 | 已上传、解析阶段完成、目录确认完成和课程生成成功的 `CheckCircle2` 贴纸；课程生成保留勾选绘制动画的原有挂钩 | `src/screens/ParseReadyScreen.tsx`；`src/screens/ProcessingScreen.tsx`；`src/screens/ChapterConfirmScreen.tsx`；`src/screens/CourseReadyScreen.tsx` | `.upload-success-mark`、完成阶段的 `.stage-row > span`、`.chapter-status-mark`、`.course-ready-success-mark` |
| 16 | 章节目录冲突提示 | 冲突警告 `AlertTriangle` | `src/screens/ChapterConfirmScreen.tsx:829` | `.chapter-conflict-icon` |

## 同步完成的白底徽章

以下白底或半透明白底徽章已同步替换。原个人页无课程徽章在当前界面中已移除，因此不再有对应迁移入口。

| 位置 | 图标 | 组件入口 | 样式容器 |
| --- | --- | --- | --- |
| 错题核心解释 | `BrainCircuit` | `src/screens/MistakeBookScreen.tsx:352` | `.mistake-core-icon` |
| AI 对话题头 | `Bot` | `src/components/ui.tsx:1770` | `.ai-avatar` |
| 解析确认页的默认文件封面内图标 | `FileText` | `src/screens/ParseReadyScreen.tsx:127` | `.parse-ready-cover-icon`；这是封面占位中的图标底板 |

## 已经是贴纸式的使用位置

- 个人页积分硬币：`.profile-credits-icon`，`src/styles/profile.css:50`。
- 视频生成确认和加载界面的相机 / 星星组合：`.lesson-video-confirm-icon`，`src/styles/base.css`。
- 学习画像问卷题头：`.learning-diagnosis-question > .learning-flow-symbol`，`src/styles/courses.css:352`。
- 学习画像问卷选项：`.learning-diagnosis-option-icon`，`src/styles/courses.css:360`；包含按选项顺序变化的颜色和旋转角度。

## 范围边界和实现注意

- 普通文字按钮里的图标、工具栏选中状态、语音录制 / 播放按钮、发送按钮属于操作控件；本清单以独立徽章底板为范围。
- 社区课程的整张缺省封面属于封面占位；实际书籍封面和云朵品牌位图不属于徽章转换清单。学习页小课程标识和个人页课程标识已单独列入上表。
- `QuickAction`、`SettingsRow`、`BookMini`、`CourseCover` 在当前 TSX 中只有定义，未发现业务调用；相关旧样式不计作当前界面的迁移入口。
- 学习画像问卷与新手引导共用 `.learning-flow-symbol`，需要结合父容器区分。
- 状态勾选已有进场动画。贴纸的旋转和硬阴影应与现有动画兼容，保留 SVG 勾选的绘制动画和完成状态反馈。

## 引导页学习目标

引导页三步题头统一使用贴纸图标，第二步的四个数字占位已替换为下列图形。图标位于原数字区域的中心，选项的点击、选中状态与偏好值继续沿用原实现。

| 选项 | 图形 | SVG 名称 |
| --- | --- | --- |
| 系统学习 | 彩色书本组合 | `LibraryBig` |
| 备考冲刺 | 靶心与箭头 | `Target` |
| 能力提升 | 上升图表 | `TrendingUp` |
| 日常兴趣 | 爱心与小星星 | `Heart` |

第三步保留原有时间选项布局，题头的时钟已采用同一贴纸样式。

## 实现和预览

- `src/components/icons/stickerArtwork.ts`：33 款图形、中文名称和语义配色，采用彩色填充及统一深色轮廓。
- `src/components/icons/StickerIcon.tsx`：共享 SVG 渲染入口，兼容原有尺寸和 SVG 属性；可传入状态勾选动画的路径类名。
- `src/styles/sticker-icons.css`：按实际徽章容器应用不对称圆角、深色边框、硬阴影与独立的 CSS `rotate`；原有基于 `transform` 的动画继续工作。
- `docs/icons/sticker-tools.png`：16 款学习和笔记图标，从实际 `StickerIcon` 组件渲染。
- `docs/icons/sticker-states.png`：17 款状态、AI 和学习目标图标，从实际 `StickerIcon` 组件渲染。
- `docs/icons/sticker-onboarding-icons.png`：引导页四个学习目标图标的放大预览。
- `docs/icons/sticker-onboarding-preview.png`：引导页第二步和第三步的实际截图。
- `docs/icons/sticker-home.jpg`、`sticker-assignment.jpg`、`sticker-notes.jpg`：当前本地应用的实际截图。

已核对首页、作业页、笔记列表、新建笔记弹窗及引导页的实际显示；构建、相关文件 ESLint 及 361 项既有测试通过。
