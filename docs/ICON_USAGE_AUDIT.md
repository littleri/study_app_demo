# 图标使用盘点（贴纸迁移前快照）

盘点日期：2026-10-02。

本文件记录替换前的图标来源和样式统计。彩色徽章入口现已迁移到 33 款自定义彩色 SVG 贴纸图标，包含新手引导中的四个学习目标图标；当前实现和图集见 `src/components/icons/StickerIcon.tsx`、`src/components/icons/stickerArtwork.ts` 和 `docs/ICON_STICKER_MIGRATION_SCOPE.md`。下文原有数量按迁移前口径保留。

## 统计口径

- 扫描当前工作区 `src` 下的 66 个非测试 TSX 文件，并核对样式文件、依赖和品牌资源。
- 基于当前未提交的文件内容统计，未替换任何业务图标。
- 图标名称只计可渲染的组件，排除 `type LucideIcon` 等类型声明。
- JSX 调用点按源码位置计数；循环中的调用只计一处，不代表某个页面同时可见的图标数量。
- 通过配置映射渲染的 `<Icon />` 等调用单独统计。
- 已在当前本地学习页核对实际画面和计算样式；其他页面的分类依据当前组件与 CSS。
- 视觉类别按呈现方式划分，同一个 Lucide 图形可以出现在不同类别中，类别不能直接相加计算图标总数。

## 数量总览

| 项目 | 数量 / 结论 |
| --- | --- |
| 第三方图标库 | 1 个：`lucide-react`，项目声明及本地安装版本均为 `1.18.0` |
| 引用 Lucide 的文件 | 42 个 |
| 可渲染的 Lucide 导入名称 | 79 个 |
| 合并别名后的 Lucide 图形 | 76 种 |
| 直接使用 Lucide 组件的 JSX 调用点 | 272 处 |
| 通过映射渲染的图标调用点 | 7 处，其中主导航还包含自定义指南针 |
| 内联 SVG 定义 | 8 处：5 处图标相关，3 处插图 / 进度图形 |
| 固定 `size` 参数 | 21 种，范围为 12–56；包含动态图标调用 |
| JSX 文本和字符串中的 Emoji 图标 | 未发现 |
| 其他图标库 / 字体图标 | 未发现 Phosphor、Heroicons、React Icons、Iconify、Material Symbols 或 Font Awesome 的业务使用 |

## 图标来源

1. **Lucide React SVG**：业务功能图标的主要来源，采用单色、圆角端点和圆角连接的线性图形。
2. **手写内联 SVG**：发现导航指南针、课程就绪勾选符号及 iOS 状态栏；另外还有头像插图和进度环。
3. **PNG / WebP 品牌位图**：侧栏云朵标识、AI 助手入口和品牌反馈。PWA / Android 启动图标属于应用身份资源，未混入业务操作图标计数。

## 当前的五类视觉呈现

| 视觉呈现 | 图形和样式特征 | 主要使用位置 | 代表代码 |
| --- | --- | --- | --- |
| 标准线性图标 | 图形本体为单色描边、通常不填充；颜色随文本或状态变化。存在局部加粗变体。 | 导航、返回、关闭、搜索、上传、删除、文档、按钮及阅读工具栏 | `src/components/ui.tsx`、`src/screens/SourceReaderScreen.tsx` |
| 彩色底板徽章 | 线性图标放在浅紫、浅绿、浅蓝等底板上；圆角方形或圆形容器形成双色层次。选中或完成状态也有白色图标配实色底板。 | 章节工具卡、首页快捷入口、笔记类型选择、新手引导、完成和异常状态 | `src/components/study/ChapterToolCards.tsx:109`、`src/styles/chapter-tools.css:183`、`src/styles/study-notes.css:71` |
| 贴纸式图标组合 | 积分硬币、视频与星星组合，以及学习画像问卷的题头和选项；配多色底板、深色边框、硬阴影和旋转；部分星星带黄色填充。 | 个人页积分入口、视频生成确认弹窗、视频加载界面、学习画像问卷 | `src/styles/profile.css:50`、`src/screens/LessonVideoConfirmDialog.tsx:67`、`src/screens/LessonAnimationDialog.tsx:296`、`src/styles/courses.css:352` |
| 云朵品牌位图入口 | 多色卡通云朵和对白气泡；图形细节由 PNG / WebP 素材决定。 | 侧栏品牌标识、悬浮 AI 助手、课时 AI 聊天入口 | `src/components/ui.tsx:405`、`src/components/ui.tsx:741`、`src/screens/LessonAiChatEntry.tsx:26` |
| iOS 系统实心符号 | 信号和 Wi-Fi 为实心路径；电池由 SVG 端帽和 CSS 边框 / 电量构成。 | 设备预览中的状态栏 | `src/components/IosStatusBar.tsx:21` |

自定义发现指南针的 24×24 网格、2 单位描边和圆角端点与 Lucide 接近，归入标准线性风格。它的来源独立，但没有形成一套不同的业务图标风格。

旧 CSS 中仍有 `gradient`、`glass` 等命名。当前 `tokens.css` 已把多个渐变变量映射为纯色，`card-system.css` 也覆盖了若干旧图标底板，因此不能仅凭旧变量名把它们算成额外的渐变图标风格。

## 自定义 SVG 的逐项分类

| 文件和位置 | 图形 | 分类 |
| --- | --- | --- |
| `src/components/ui.tsx:254` | `DiscoveryCompassIcon`，发现导航指南针 | 业务线性图标 |
| `src/screens/CourseReadyScreen.tsx:49` | 动画勾选符号，32×32 网格、3 单位描边 | 状态图标 |
| `src/components/IosStatusBar.tsx:21` | 蜂窝信号 | 系统图标 |
| `src/components/IosStatusBar.tsx:33` | Wi-Fi | 系统图标 |
| `src/components/IosStatusBar.tsx:47` | 电池端帽 | 系统图标的组成部分 |
| `src/screens/ProfileScreen.tsx:35` | 虚线轮廓、紫色填充和白色加号的个人画像 | 头像 / 插图，单独统计 |
| `src/screens/ProfileScreen.tsx:187` | 学习计划进度环 | 数据图形，单独统计 |
| `src/screens/StudyScreen.tsx:302` | 章节进度环 | 数据图形，单独统计 |

## 尺寸、描边和容器差异

固定 `size` 值为：`12、13、14、15、16、17、18、19、20、21、22、23、24、25、26、30、31、34、38、42、56`。还有一处根据展示变体在 `22` 和 `30` 之间切换。尺寸参数不等于最终显示尺寸，CSS 和选中动画可能进一步改变它。

272 处直接调用中，最常见的尺寸是 `18`（71 处）、`17`（31 处）、`16`（29 处）、`19`（27 处）、`20`（25 处）。大的图标多见于空状态或提示区域。

| 描边来源 | 值 | 当前用途 / 说明 |
| --- | --- | --- |
| Lucide 默认值 | 2 | 260 处直接 JSX 调用没有显式改写 `strokeWidth`；其中部分仍受 CSS 覆盖 |
| JSX 显式值 | 2.2 | 积分图标 |
| JSX 显式值 | 2.3 | 视频图标 |
| JSX 显式值 | 2.5 | 选项、完成反馈、星星等 |
| JSX 显式值 | 2.8 | 个人页已完成任务勾选 |
| JSX 显式值 | 3 | 部分勾选 / 完成状态 |
| 导航 CSS 覆盖 | 2.35 | 当前底部导航实测生效值，见 `src/styles/base.css:2802` |

`base.css:379` 中较早的导航 `2.25` 规则被后面的 `2.35` 覆盖，不再单独算成当前导航风格。头像插图和进度环使用的 `5`、`5.25`、`6`、`7` 等线宽属于独立插图 / 数据图形，不与小尺寸业务图标直接比较。

底板也没有统一尺寸：章节工具图标容器为 28×28、圆角 9；窄容器下缩至 24×24、圆角 8。笔记类型底板为 44×44、圆角 13；视频组合底板为 64×64，使用不对称圆角。

## 同图形别名

本地安装包确认以下名称对应同一个图标组件：

| 名称组 | 含义 |
| --- | --- |
| `CircleAlert` / `AlertCircle` | 圆形警告 |
| `Loader2` / `LoaderCircle` | 加载圆环 |
| `CirclePlay` / `PlayCircle` | 圆形播放 |

因此 79 个名称对应 76 种不同图形。后续可以统一名称，减少检索和维护成本。

## 高频图标

以下为直接 JSX 调用次数，不含动态映射展开后的实例：

| 图标 | 调用点 |
| --- | ---: |
| `FileText` | 18 |
| `Check` | 18 |
| `ChevronRight` | 15 |
| `Plus` | 14 |
| `Upload` | 14 |
| `BookOpen` | 14 |
| `BookOpenCheck` | 12 |
| `Sparkles` | 12 |
| `X` | 10 |
| `CheckCircle2` | 9 |

## 逐文件清单

“名称数”在单个文件内去重，跨文件会重复，不能直接相加得到全项目 79 个名称。

| 文件 | 名称数 | 直接调用点 | 动态调用点 |
| --- | ---: | ---: | ---: |
| `src/App.tsx` | 1 | 1 | 0 |
| `src/components/home/HomeBookCarousel.tsx` | 3 | 3 | 0 |
| `src/components/home/SelectedBookWorkspace.tsx` | 10 | 18 | 0 |
| `src/components/study/ChapterToolCards.tsx` | 5 | 1 | 1 |
| `src/components/ui.tsx` | 21 | 24 | 2 |
| `src/features/courses/AddMaterialsSheetContent.tsx` | 4 | 4 | 0 |
| `src/features/courses/FlowScreens.tsx` | 26 | 16 | 2 |
| `src/features/courses/HomeScreens.tsx` | 9 | 10 | 0 |
| `src/features/studyNotes/InkAnnotationSurface.tsx` | 3 | 3 | 0 |
| `src/features/studyNotes/SourceRegionAiPanel.tsx` | 3 | 3 | 0 |
| `src/features/studyNotes/SourceTextAnnotationLayer.tsx` | 1 | 1 | 0 |
| `src/features/studyNotes/SourceTextNotePanel.tsx` | 6 | 6 | 0 |
| `src/screens/AssignmentScreen.tsx` | 9 | 8 | 1 |
| `src/screens/ChapterConfirmScreen.tsx` | 9 | 11 | 0 |
| `src/screens/CommunityBookScreen.tsx` | 1 | 1 | 0 |
| `src/screens/CommunityCover.tsx` | 1 | 1 | 0 |
| `src/screens/CommunityScreen.tsx` | 4 | 4 | 0 |
| `src/screens/CourseReadyScreen.tsx` | 2 | 3 | 0 |
| `src/screens/DiagnosisScreen.tsx` | 6 | 6 | 0 |
| `src/screens/ExportPreviewScreen.tsx` | 2 | 2 | 0 |
| `src/screens/FlashcardScreen.tsx` | 2 | 3 | 0 |
| `src/screens/HomeScreen.tsx` | 3 | 4 | 0 |
| `src/screens/LessonAnimationDialog.tsx` | 5 | 6 | 0 |
| `src/screens/LessonScreen.tsx` | 4 | 5 | 0 |
| `src/screens/LessonVideoConfirmDialog.tsx` | 2 | 2 | 0 |
| `src/screens/LibraryScreen.tsx` | 4 | 4 | 0 |
| `src/screens/MistakeBookScreen.tsx` | 13 | 21 | 0 |
| `src/screens/NotesScreen.tsx` | 9 | 12 | 0 |
| `src/screens/ParseReadyScreen.tsx` | 4 | 5 | 0 |
| `src/screens/ProcessingScreen.tsx` | 3 | 3 | 0 |
| `src/screens/ProfileScreen.tsx` | 7 | 11 | 0 |
| `src/screens/shared.tsx` | 3 | 6 | 0 |
| `src/screens/sheets/BookSwitcherSheetContent.tsx` | 4 | 4 | 0 |
| `src/screens/sheets/EditChapterSheetContent.tsx` | 3 | 3 | 0 |
| `src/screens/sheets/NoteSheetContent.tsx` | 2 | 2 | 0 |
| `src/screens/sheets/NoteTypeSheetContent.tsx` | 3 | 0 | 1 |
| `src/screens/sheets/SourceSheetContent.tsx` | 3 | 3 | 0 |
| `src/screens/SourceReaderScreen.tsx` | 12 | 16 | 0 |
| `src/screens/StudyPlanScreen.tsx` | 3 | 6 | 0 |
| `src/screens/StudyScreen.tsx` | 6 | 17 | 0 |
| `src/screens/UploadScreen.tsx` | 3 | 3 | 0 |
| `src/screens/VoiceNoteScreen.tsx` | 9 | 10 | 0 |
| **合计** | **全项目去重为 79** | **272** | **7** |

## 后续统一的切入点

1. **尺寸与描边**：按使用场景定义小图标、常规操作、导航、空状态的尺寸档位及对应线宽，收敛相近的随意取值。
2. **语义映射**：统一学习计划、闪卡、作业、错题、笔记、原文和 AI 的图标映射。例如错题入口在侧栏使用 `ListChecks`，章节工具使用 `BookX`，首页使用 `CircleAlert`。
3. **底板规则**：明确哪些图标裸露显示、哪些使用浅色徽章，并统一容器圆角、尺寸和语义色。当前章节工具与笔记入口已有不同颜色体系。
4. **贴纸组合**：个人页积分、视频生成和学习画像问卷已经使用深色边框、硬阴影和轻微旋转，可以作为彩色徽章迁移到贴纸风格的现有参考。具体修改范围见 `docs/ICON_STICKER_MIGRATION_SCOPE.md`。
5. **渲染入口和别名**：现有 `IconButton` 管理按钮容器，`Button.icon` 接受任意 ReactNode，尚未统一图标参数。可以集中图标渲染约定并收敛三组别名。

云朵品牌位图、iOS 状态栏、头像插图和进度环承担不同角色，适合单独保留规范。后续业务图标统一可以以现有 Lucide 线性图形为基础展开。
