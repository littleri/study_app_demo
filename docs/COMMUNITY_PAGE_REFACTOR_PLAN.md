# BookCourse AI 社区页改进与实施计划

> 目标：在不改变全局导航和学习主流程的前提下，将社区页重构为符合现有 BookCourse AI 纯色主题的内容发现页；手机端必须提供清晰的书籍分类和两列书籍列表，并修复“点击任意书籍都进入第一本书”的数据链路问题。

## 1. 设计依据

- 产品原则：原书优先、下一步明确、轻量陪伴、状态透明、触控友好。
- 视觉基准：[`design/community-ios-books-grid-reference-v3-flat.png`](design/community-ios-books-grid-reference-v3-flat.png)。
- 现有主题：复用 `src/styles/tokens.css` 中的浅灰蓝背景、白色内容面、深藏青文字、冷灰边框和纯紫色主操作。
- 设备重点：iPhone 竖屏 402×874；同时保证窄屏、手机横屏和 iPad 不发生溢出或不可操作。
- 无障碍目标：语义标题、可感知的筛选状态、清晰焦点、主要触控目标至少 44×44px、支持减少动态效果。

## 2. 现状信息架构

当前社区页的阅读顺序为：

1. 全局页头“社区 / 发现同学共享的 AI 课程”。
2. 泛化说明大卡“看看同学们正在学什么”。
3. “共享课程包”列表。
4. 单条静态“社区动态”。
5. 全局 AI 助手和四项主导航。

已确认的问题：

- 手机端被响应式 CSS 强制为单列，和双列书籍浏览目标冲突。
- 没有书籍分类、教材版本、年级等检索所需的信息维度。
- 顶部说明卡没有给出一个明确、与当前教材相关的下一步。
- 四张书籍卡都只执行 `go("communityBook")`；详情页和导入页固定读取 `communityBooks[0]`，因此用户总会看到第一本书。
- 社区样式分散在 `base.css`、`responsive.css` 和最后覆盖的 `card-system.css` 中，继续叠加规则容易产生级联回归。
- 当前四张封面素材都来自生物教材，无法准确表达数学、物理等分类。

## 3. 目标信息架构

```text
全局页头：社区 / 发现同学分享的优质课程
  └─ 搜索入口（逐步增强，不遮挡标题）

与你教材匹配
  └─ 紧凑横向推荐卡：封面、匹配标签、课程名、教材元数据、查看操作

书籍分类
  └─ 全部 / 生物 / 数学 / 物理 / 化学

热门书籍
  └─ 手机端两列书籍网格
      └─ 封面 / 学科 / 标题 / 年级与版本 / 学习人数
  └─ 无匹配结果时提供明确空状态与“查看全部”操作

全局能力
  └─ 沿用现有 AI 助手与首页 / 社区 / 学习 / 我的导航
```

## 4. 范围与非目标

### 本次范围

- 重构社区静态数据契约和分类筛选函数。
- 保存当前选中的社区书籍，并让详情页、导入页读取正确书籍。
- 重构主社区页的 JSX 信息架构和交互。
- 新增独立 `community.css`，在最终卡片系统之后导入，隔离社区页样式。
- 所有受支持视口的社区书籍列表均保持两列：手机竖屏、手机横屏、iPad 竖屏与 iPad/桌面横向布局都使用相同的两列信息结构；宽屏通过限制内容宽度和增加留白控制卡片尺度，而不是扩成第三列。
- 新增社区专项单元测试和端到端测试，并更新保护旧单列布局的断言。
- 为数学、物理条目提供与学科相符的本地封面资产，保留现有图片失败回退机制。

### 非目标

- 不接入真实社区后端 API。
- 不重构全局 `PrimaryNav`、AI 助手或全局主题 token。
- 不清理 `base.css` 中与本次页面无关的历史声明。
- 不在社区页复制第二套底部导航或 AI 悬浮按钮。
- 不改变社区详情页和导入成功页的主要业务流程。

## 5. 分步实施与审核门禁

每一步完成后必须先更新本文件的状态和审核记录，由独立 subagent 复核代码范围、验收证据和残留问题。审核未通过时只修复当前步骤，不进入下一步。

| 步骤 | 内容 | 状态 | 审核状态 |
|---|---|---|---|
| 0 | 建立计划、代码与浏览器基线 | 已完成 | PASS |
| 1 | 社区数据契约、筛选纯函数与选中书籍状态 | 已完成 | PASS |
| 2 | 主社区页信息架构、分类与搜索交互 | 已完成 | PASS |
| 3 | 纯色视觉、双列网格、响应式与封面资产 | 已完成 | PASS |
| 4 | 专项 E2E、全量回归、视觉与无障碍终审 | 已完成 | PASS |

### 步骤 0：计划与基线

改动边界：

- 只新增本计划文档，不修改 `src/` 和 `e2e/`。
- 读取现有社区页面、数据、导航、主题 token、CSS 导入顺序及参考图。
- 记录重构前的 iPhone 页面截图和 DOM 信息架构。

验收证据：

- [x] 计划包含目标 IA、范围、分步边界、每步验收标准和审核记录。
- [x] 现状截图确认手机端为单列列表，证据：[`design/community-before-refactor-baseline.png`](design/community-before-refactor-baseline.png)。
- [x] `npm run build` 通过：TypeScript 编译及 Vite production build 成功；仅保留既有的 chunk-size 与本地证书提示。
- [x] `npm test` 通过：13 个测试文件、58 个测试。
- [x] `npm run lint` 通过：ESLint 无错误输出。
- [ ] 响应式 Playwright 基线：默认端口 4173 被占用；改用 4175 后全套用例超过 120 秒超时。本问题记为基线环境限制。步骤 4 将按测试文件和项目拆分运行，例如 `npx playwright test e2e/responsive.spec.ts --project iphone-17-pro`、`--project iphone-17-pro-landscape`、`--project ipad-pro-11`、`--project ipad-pro-11-landscape`，并为每条命令提供独立测试端口和充足超时。
- [x] 独立 subagent 第二次审核通过，允许进入步骤 1。

回滚范围：删除本 Markdown 文件即可；不会影响运行时代码。

### 步骤 1：数据契约、筛选函数与选中书籍状态

预计文件：

- `src/data/mockBook.ts`
- 新增 `src/screens/communityCatalog.ts`
- 新增 `src/screens/communityCatalog.test.ts`
- `src/context/AppContext.tsx`
- `src/App.tsx`
- `src/screens/CommunityScreen.tsx`
- `src/screens/CommunityBookScreen.tsx`
- `src/screens/CommunityImportScreen.tsx`

实施内容：

- 为社区书籍补充 `subject`、`grade`、`version`、可选 `volume`、`featured` 等结构化字段。
- 提供“全部 / 生物 / 数学 / 物理 / 化学”稳定分类表。
- 将筛选、关键词匹配、按 ID 查找及非法 ID fallback 写成纯函数。
- 在 App Context 中保存 `selectedCommunityBookId`；点击书卡时先写入 ID，再导航。
- 详情页和导入页按选中 ID 读取书籍，不再直接固定使用数组第一项。

验收标准：

- “全部”保持原始顺序并返回 4 本；“生物”返回 2 本；数学、物理各返回正确条目；化学显示空结果。
- 标题、学科、年级和版本均可被关键词检索。
- 合法 ID 返回对应书籍；非法 ID 采用明确且经过测试的 fallback。
- 详情页和导入页不存在直接写死 `communityBooks[0]` 的读取逻辑。
- 点击第二、第三或第四本书后，详情页和导入成功页必须保持同一个选中书籍 ID；返回社区页后仍能继续选择其他书籍。
- 单元测试、lint、build 全部通过；不修改任何 CSS 或共享导航。

审核门禁：

- subagent 审查数据模型、纯函数边界、Context 依赖和详情链路。
- 对本步骤运行 `git diff --check`、`npm test`、`npm run lint`、`npm run build`。
- 审核结论写入第 6 节后，才可进入步骤 2。

### 步骤 2：信息架构与交互

预计文件：

- `src/screens/CommunityScreen.tsx`
- 必要时小范围扩展 `src/components/ui.tsx` 与 `src/App.tsx`，将已有 `HeaderBar.rightAction` 安全透传给社区搜索入口。
- 新增或更新社区交互测试。

实施内容：

- 用“与你教材匹配”紧凑推荐卡替代泛化大 hero。
- 添加“书籍分类”和“热门书籍”分区。
- 分类使用真实按钮和 `aria-pressed`；切换后更新结果说明。
- 提供可展开的搜索输入，带可见标签或等价的可访问名称；支持清除。
- 化学或搜索无结果时显示教学型空状态，并提供“查看全部”。
- 继续复用 `CommunityCover`；不复制全局 AI 和主导航。

验收标准：

- 页面可见“与你教材匹配”“书籍分类”“热门书籍”。
- 分类项恰好为全部、生物、数学、物理、化学。
- 默认 4 张卡；数学筛选只剩《函数与导数》；恢复全部后重新显示 4 张。
- `aria-pressed`、搜索标签、结果数量反馈和空状态语义正确。
- 点击不同书卡进入对应详情。
- 键盘可以依次访问搜索、分类和书卡。

审核门禁：

- subagent 独立复核 DOM 语义、交互状态和导航链路。
- 运行单元测试、lint、build，并通过浏览器 DOM 快照验证上述内容。
- 审核结论写入第 6 节后，才可进入步骤 3。

### 步骤 3：纯色视觉、封面与响应式布局

预计文件：

- 新增 `src/styles/community.css`
- `src/main.tsx`
- `src/screens/CommunityCover.tsx`（仅在封面语义需要扩展时）
- `public/assets/community/` 下的本地封面资源
- `docs/ASSET_PROVENANCE.md`
- `scripts/capture-community-evidence.mjs`
- 必要的响应式旧断言更新

实施内容：

- 独立社区样式在 `card-system.css` 后导入，避免旧 `responsive.css` 将手机网格覆盖成单列。
- 所有社区 UI 面使用既有纯色 token；禁止 UI 渐变、玻璃模糊和宽阴影。
- 手机竖屏书籍列表严格为两列；封面使用 3:4 比例；标题限制行数并保持卡高一致。
- 使用明确且统一的列数契约：402×681/874 手机竖屏为 2 列；756×352 与 874×402 手机横屏为 2 列；834×1194/1210 iPad 竖屏为 2 列；1194/1210×834 iPad 横屏及桌面宽度为 2 列。
- 宽屏社区内容区设置合理的最大宽度，避免两张卡被无意义拉宽；所有尺寸保持分类和书籍信息一致，不隐藏核心功能。
- 交互元素触控区至少 44px；hover 不承载唯一功能；focus-visible 清晰可见。
- 数学、物理封面使用本地资产并具备准确替代文本；保留失败 fallback。
- 在 `docs/ASSET_PROVENANCE.md` 为每个新增封面记录来源、生成/原创/迁移/派生类型、用途、对应书籍和“仅内部 Demo，公开发布前核验”的授权状态；若使用 ImageGen，同时记录提示词文件和生成产物路径，不将其描述为教材抽取图。
- 社区专属 CSS 不修改 `.primary-nav`、`.nav-selection` 或全局 `.ai-orb` 规则。

验收标准：

- iPhone 402px 宽度下四卡为 2×2，同列宽度误差小于 1 CSS px，无横向溢出。
- 756×352、834×1194 和 1194×834 下仍为两列；`expectStageSixCommunityGrid` 的手机旧 1 列、短横屏旧 3 列和宽屏旧 3 列断言同步更新为 2 列，iPad 原有 2 列断言保持不变。
- 页面背景为 `#f6f8fb`，内容面为 `#ffffff`，选中态为纯 `#7c3aed`。
- 社区专属元素 `background-image: none`、`backdrop-filter: none`；不含 `linear-gradient` 或 `radial-gradient`。
- 402×874、手机横屏和 iPad 三种视图均完成截图审核。
- 封面加载失败时卡片几何稳定。
- provenance 清单能逐一映射新增封面和社区书籍，且说明生成方式与授权状态。

审核门禁：

- subagent 复核 CSS 作用域、token 使用、级联优先级和响应式几何。
- 浏览器读取计算样式、卡片矩形与截图；修复缺陷后重新审核。
- 审核结论写入第 6 节后，才可进入步骤 4。

### 步骤 4：测试与最终审核

预计文件：

- 新增 `e2e/community.spec.ts`
- 更新 `e2e/responsive.spec.ts` 中旧的手机 1 列、短横屏 3 列和宽屏 3 列断言；所有支持视口统一为 2 列。
- 必要时迁移 `e2e/motion.spec.ts` 对旧 `.community-hero` 的断言。

验证命令：

```powershell
npm run lint
npm test
npm run build
npx playwright test e2e/community.spec.ts
npx playwright test e2e/tab-bar.spec.ts
npx playwright test e2e/p2-card-system.spec.ts
npx playwright test e2e/responsive.spec.ts
npx playwright test e2e/motion.spec.ts --grep "Community"
```

最终验收：

- 内容、分类、搜索、两列几何、纯色计算样式和正确详情链路都有自动化证据。
- 社区 → 详情 → 导入流程可达；首页、学习、我的导航无回归。
- AI 助手仍可见、可打开；底部导航保持四项与现有选中态。
- 浏览器无 console error、page error、横向溢出或断裂图片。
- 计划中的所有要求均有测试、浏览器状态、截图或代码位置支持。
- 最终 subagent 审核无阻断问题后，方可标记完成。

## 6. 审核记录

### 步骤 0

- 审核者：subagent `community_architecture_audit`。
- 第一次审核：FAIL。阻断项为新增封面缺少 provenance 边界、横屏/iPad/桌面列数契约不明确、已完成基线缺少可追溯证据。
- 修订证据：已将 `docs/ASSET_PROVENANCE.md` 纳入步骤 3；所有支持视口明确为两列；基线截图已保存至 [`design/community-before-refactor-baseline.png`](design/community-before-refactor-baseline.png)；build、13 files/58 tests、lint 摘要已记录；Playwright 补偿方案已拆分到具体项目。
- 第二次审核：PASS。subagent 已核对 provenance、列数契约、截图尺寸与命令摘要，确认步骤 0 可进入步骤 1。
- 当前结论：审核通过，步骤 0 完成。
- 遗留项：响应式全套 E2E 基线受到端口占用和执行超时影响；不阻断计划建立，但必须在步骤 4 通过拆分项目复验。

### 步骤 1

- 审核者：subagent `community_architecture_audit`（待复核）。
- 结论：实施完成，等待独立审核。
- 代码证据：新增 `CommunityBook`/`CommunitySubject` 数据契约、`communityCatalog.ts` 纯函数、App Context 的 `selectedCommunityBookId`，详情页和导入页改为 `resolveCommunityBook(selectedCommunityBookId)`。
- 自动化证据：目录专项测试 5/5；`npm test` 为 14 files / 63 tests；`npm run lint`、`npm run build`、`git diff --check` 均通过。
- 浏览器证据：当前工作树 `http://127.0.0.1:5176/?embedded=device-preview` 中点击第三本《函数与导数系统提升课》，详情标题唯一匹配 1 次，导入成功文案唯一匹配 1 次。
- 范围证据：本步骤没有修改任何 CSS、全局导航或 AI 助手实现。
- 第一次审核：FAIL。实现已包含 `subject` 搜索字段，但测试缺少“数学”学科关键词的直接断言；同时记录了导入页闪卡指标仍固定为 24 的非阻断一致性建议。
- 修订：补充“数学”学科检索与“生物 + 人教版”组合检索断言；导入页章节和闪卡指标改为读取当前 `book` 数据。
- 修订后证据：目录专项测试 5/5、全量 14 files / 63 tests、lint、build、diff check 再次全部通过；等待第二次独立审核。
- 第二次审核：PASS。subagent 确认学科检索和组合条件证据完整，导入页指标与选中书籍保持一致，且无 CSS、导航或 AI 助手范围外改动。
- 当前结论：审核通过，步骤 1 完成，可进入步骤 2。

### 步骤 2

- 审核者：subagent `community_architecture_audit`（待复核）。
- 结论：实施完成，等待独立审核。
- 结构证据：社区页按“搜索入口 → 与你教材匹配 → 书籍分类 → 热门书籍”重排；分类组包含且仅包含全部、生物、数学、物理、化学；保留 `.community-hero` 作为唯一局部进入动效 surface。
- 交互证据：浏览器默认显示 4 张书卡；数学筛选后为 1 张且 `aria-pressed=true`；恢复全部后为 4 张；搜索“北师大版”结果为 1；化学分类显示带“查看全部”操作的空状态；空状态恢复后为 4 张。
- 语义证据：搜索开关具有 `aria-expanded/aria-controls`，搜索框有可见 label，分类使用 `role=group` 和 `aria-pressed`，结果摘要使用 `aria-live=polite`，推荐“查看”和热门“全部”操作有上下文明确的 accessible name。
- 链路证据：书卡继续在导航前写入 `selectedCommunityBookId`，推荐卡“查看”也使用同一 `openCommunityBook` 路径。
- 自动化证据：全量 14 files / 63 tests、lint、build、diff check 通过。
- 范围证据：本步骤未修改 CSS、共享 `PrimaryNav` 或 AI 助手；纯色布局和几何留待步骤 3。
- 独立审核：PASS。subagent 确认目标 IA、分类与搜索组合、空状态恢复、详情链路、原生键盘语义和 `.community-hero` motion 兼容均通过，无范围外改动。
- 当前结论：审核通过，步骤 2 完成，可进入步骤 3。

### 步骤 3

- 审核者：subagent `community_architecture_audit`（待复核）。
- 结论：实施完成，等待独立审核。
- 样式证据：新增 `src/styles/community.css` 并在 `card-system.css` 后导入；社区卡片计算样式为纯白 `rgb(255, 255, 255)`、`background-image: none`、`backdrop-filter: none`，分类选中态为纯紫 `rgb(124, 58, 237)` 且高度 44px。源码扫描无 `gradient`，阴影仅搜索圆钮使用克制的 `0 2px 6px`，其余社区内容面均为 `none`。
- 几何证据：`scripts/capture-community-evidence.mjs` 在 402×874、756×352、834×1194、1194×834 四个视口中均读取到 2 列 / 2 行、同宽误差 0 CSS px、无横向溢出；列宽分别为 179.922、342.766、330.156、404 CSS px。
- 截图证据：[`design/community-after-refactor-iphone-portrait.png`](design/community-after-refactor-iphone-portrait.png)、[`design/community-after-refactor-iphone-landscape.png`](design/community-after-refactor-iphone-landscape.png)、[`design/community-after-refactor-ipad-portrait.png`](design/community-after-refactor-ipad-portrait.png)、[`design/community-after-refactor-ipad-landscape.png`](design/community-after-refactor-ipad-landscape.png)。
- 封面证据：使用 Codex 内置 ImageGen 独立生成数学、物理封面，提示词保存在 [`design/community-book-covers-v1.prompt.md`](design/community-book-covers-v1.prompt.md)；运行时资产优化为 768×1024 WebP，分别为 22,410 与 36,258 bytes。四个视口中所有封面 `imageLoaded=true`，数学和物理分别加载 `/assets/community/functions-derivatives-cover-v1.webp` 与 `/assets/community/force-motion-cover-v1.webp`。
- 来源证据：`docs/ASSET_PROVENANCE.md` 已逐一记录两张封面的生成方式、用途、对应书籍、内部 Demo 授权状态，并明确不是 MinerU 教材抽取图。
- 范围证据：社区 CSS 未声明 `.primary-nav`、`.nav-selection`、`.ai-orb`；共享导航和 AI 助手实现未修改。
- 自动化证据：`npm test` 为 14 files / 63 tests；`npm run lint`、`npm run build`、`git diff --check` 均通过。浏览器控制台 error/warn 为空；production build 仅保留既有 chunk-size 与本地证书提示。
- 第一次独立审核：FAIL。阻断项为响应式旧断言仍保护 1/3 列、截图脚本中的页面上下文缺少 ESLint 浏览器全局声明、两处样式值没有复用现有 token；另建议把真实 `.screen-content` 内部溢出与边界纳入证据。
- 修订：`expectStageSixCommunityGrid` 统一断言 2 列，并新增不依赖课程 fixture 的成对视口社区用例；证据脚本补充 browser globals、`.screen-content` client/scroll width、网格/卡片边界；搜索钮阴影改用 `--glass-shadow-soft`，生物标签背景改用 `--color-surface-soft`。
- 修订后证据：社区响应式专项 E2E 在 `iphone-17-pro`、`iphone-17-pro-landscape`、`ipad-pro-11`、`ipad-pro-11-landscape` 四项目均通过（4/4）；lint、14 files / 63 tests、build、diff check 再次通过；源码扫描未发现社区 CSS 中的渐变或硬编码色值。
- 既有套件说明：四项目并行运行完整 `responsive.spec.ts` 时为 44 passed / 73 failed / 3 skipped；失败均在进入社区断言之前，被历史 Stage 4/5/6 fixture 的“继续学习”准备步骤阻断。单项目串行复跑同样在该 fixture 处失败，因此不将其误记为本步骤通过；本次新增的无 fixture 社区响应式用例完整覆盖两列断言并已 4/4 通过，完整旧 fixture 问题保留到步骤 4 的回归审计中单独说明。
- 当前结论：已修复第一次审核的全部步骤 3 阻断项，等待第二次独立审核。
- 第二次独立审核：PASS。subagent 确认两列断言、无 fixture 的 paired-viewports 专项测试、lint browser globals、token 复用、内部溢出/边界证据和完整套件失败披露均准确，无新的阻断项。
- 当前结论：审核通过，步骤 3 完成，可进入步骤 4。

### 步骤 4

- 审核者：subagent `community_architecture_audit`（待复核）。
- 结论：实施与验证完成，等待最终独立审核。
- 专项测试：新增 `e2e/community.spec.ts`，覆盖目标 IA、五分类、版本搜索、空状态恢复、AI 与四项主导航、四项目初始/paired viewport 两列几何、纯色计算样式、44px 触控、键盘焦点、数学书详情与导入一致性、ImageGen 封面加载及失败回退。首次为 7/16，通过测试定位并修复短横屏搜索按钮被 header spacer 截获的问题，同时收紧测试的浮点和语义定位；修订后四项目 16/16 PASS。
- 响应式保护：`e2e/responsive.spec.ts` 的无课程 fixture 社区 paired-viewports 用例在四项目 4/4 PASS；覆盖 402×681↔402×874、756×352↔874×402、834×1194↔834×1210、1194×834↔1210×834。
- 导航回归：`e2e/tab-bar.spec.ts` 四项目 12/12 PASS，社区仍使用共享四项主导航和现有紫色选中胶囊。
- 动效回归：`e2e/motion.spec.ts --grep "Community"` 中直接验证真实社区封面成功重建和失败回退的用例四项目 8/8 PASS；另外 8 项在进入社区前被历史 Stage 4C 课程 fixture 的 `.daily-task-copy .button` 前置步骤阻断。
- 卡片系统回归：`e2e/p2-card-system.spec.ts` 中不依赖历史 Library fixture 的导航与 device-preview 级联用例四项目 8/8 PASS；另外 12 项在 `.library-course-grid` 前置步骤阻断，失败位置未进入社区页面。
- 完整响应式套件：四项目并行结果为 44 passed / 73 failed / 3 skipped；所有失败均在历史 Stage 4/5/6 课程准备链路、Library 或 `.daily-task-copy` 前置步骤发生。本次改动未修改 Home/Library/课程 fixture，社区独立测试、社区响应式测试及共享导航测试均全绿，因此将该失败明确归类为既有测试基础设施债务，而非把完整套件误记为通过。
- 单元与构建：`npm run lint` PASS；`npm test` 为 14 files / 63 tests PASS；`npm run build` PASS；`git diff --check` PASS。构建只保留既有 chunk-size 和本地 HTTPS 证书提示。
- 浏览器终审：当前工作树 `http://127.0.0.1:5176/?embedded=device-preview` 的 DOM 顺序为搜索 → 匹配推荐 → 书籍分类 → 热门书籍；四张封面可见，控制台 error/warn 为空。最终截图包括 [`design/community-after-refactor-desktop.png`](design/community-after-refactor-desktop.png) 以及步骤 3 的四目标视口截图。
- 视觉终审：短横屏搜索入口改为在 ≥700px 时回到内容区顶部，真实点击不再被 header spacer 截获；四视口证据脚本复跑仍为两列 / 两行、同宽误差 0、document 与 `.screen-content` 均无横向溢出、网格和卡片均在边界内、所有图片加载成功。
- 最终独立审核：PASS。subagent 确认社区专项 16/16、paired responsive 4/4、tab-bar 12/12、直接社区 motion 8/8、非 Library-fixture P2 8/8 均提供了足够的本次范围放行证据；横屏搜索修复作用域正确，完整 diff 未引入共享导航或 AI 助手回归。
- 当前结论：步骤 4 审核通过，社区页重构整体完成并可在本次授权范围内放行。
- 非阻断测试债务：完整 responsive 的 73 个历史课程 fixture 失败与 3 个跳过、motion 复合场景的 8 个前置失败、P2 的 12 个 Library 前置失败仍需后续修复；在这些 fixture 修复并全量复跑前，不得表述为“整个仓库 E2E 全绿”。

## 7. 完成结论

- 目标信息架构、分类搜索、空状态、两列书籍浏览和正确书籍详情/导入链路已经落地。
- 社区页使用现有浅灰蓝背景、白色内容面和纯紫主色，无 UI 渐变、无毛玻璃内容卡、无宽阴影。
- 手机竖屏、手机横屏、iPad 竖屏、iPad 横屏及其 paired 尺寸均保持两列；触控、键盘焦点、图片失败回退和无横向溢出均有自动化证据。
- 数学与物理封面由 Codex 内置 ImageGen 生成并优化为本地 WebP；提示词、原始生成位置、应用产物和授权边界均已记录。
- 四个实施步骤均经过独立 subagent 审核；步骤 0、1、3 的首次 FAIL 已修复并复审 PASS，步骤 2 与步骤 4 首次审核 PASS。

## 8. 后续界面收敛：搜索前置与推荐分类

本节记录在上述重构完成后的增量调整，并覆盖第 2、4 步中关于旧推荐卡和五分类默认态的历史描述。

- 删除独立的“与你教材匹配”推荐卡及其 `.community-hero` 局部进入动效；社区页不再用大卡片重复表达单本推荐。
- 搜索框改为页面顶部常驻入口，占据原推荐卡的信息层级位置；输入关键词时在内部使用全量书籍检索，界面不再显示容易与推荐态冲突的“全部”分类，清除搜索后恢复此前分类。
- 可见分类顺序更新为“推荐、生物、数学、物理、化学、历史、地理、语文、英语”，默认进入“推荐”，并用数据字段 `recommended` 返回推荐课程，继续保持两列布局。
- 删除分类区的可见标题，缩短搜索、分类轨道和热门书籍之间的纵向间距；热门书籍标题右侧不再重复提供“全部”按钮。
- 分类控件取消图标、边框、胶囊圆角和填充色；选中态仅使用加粗文字与紫色上指小三角，同时维持至少 44px 的触控高度和原生按钮键盘语义。
- 手机端浅灰色分类轨道使用 `--content-x` 反向抵消页面留白，背景横跨内容视口两侧；标签仍与正文左边缘对齐，并可通过原生触控横向滑动访问更多学科，滚动条保持隐藏。
- 桌面设备预览补充鼠标按住拖动：移动超过 4px 后才捕获指针并滚动轨道，拖动结束会抑制误触；普通轻点仍然选择分类，触摸设备继续使用原生滑动。
- 轨道右侧增加固定的展开按钮；展开后在文档流内显示完整分类网格，不遮挡书卡，选择后自动收起并更新筛选结果。
- 社区专项测试同步覆盖：推荐默认态、常驻全局搜索、九个可见分类、无“全部”标签、全宽灰底、横向滚动、展开分类、无胶囊计算样式、选中指示符、两列几何、空状态恢复、封面回退及详情/导入链路。

## 9. 本地 PDF 教材转为社区课程

- 从用户提供的 `C:\Users\asd25\Desktop\示范文件` 读取 7 本 PDF；既有生物教材沿用现有课程，新增高等数学、高中数学、理论力学、高中物理、高中英语和高中化学 6 门分享课程。AZW3 不在本次 PDF 范围内。
- 使用 Poppler 渲染每本 PDF 首页并逐张视觉核对，封面统一优化为 768 × 1024 WebP；英语首页为横向印刷展开稿，单独裁取右侧正封面。
- 课程学科、层级、版本、册次、描述和章节来自 PDF 文件名、元数据、目录书签、前置目录页和实际章节页；大学教材使用“大学”层级并分别归入数学、物理分类。
- 六门新增课程均进入推荐列表，同时支持学科筛选、关键词检索、课程详情、章节列表和导入成功链路；原有社区课程保留。
- 封面来源与授权边界已记录在 `docs/ASSET_PROVENANCE.md`，源 PDF 未被修改。
- 社区专项测试扩展为四设备共 20/20 PASS，覆盖六张 PDF 封面加载、10 门全量课程两列布局，以及 PDF 化学课程的详情与导入链路；独立响应式 4/4、直接社区封面动效 8/8 PASS。

## 10. 封面层级与分类滚动提示

- 删除课程列表上方的可见“热门书籍”标题，保留动态结果数量，并通过“社区课程”区域名称维持清晰的可访问语义。
- 两列列表中的课程封面统一增加 3px 白色装帧边和既有轻量阴影 token；阴影仅用于区分封面纸张与白色书卡，不扩散到书卡、搜索框或页面背景。
- 分类展开按钮左侧增加 48px 局部渐隐遮罩，提示分类轨道仍可左右拖动。该渐变是滚动可发现性的功能性边缘提示，不作为页面主题或内容背景使用。
- 分类列表右侧预留与渐隐宽度一致的滚动空间，确保最末分类能够完全滑出遮罩后被看清和点击；原生触控滚动、鼠标拖动、隐藏滚动条与 44px 触控目标保持不变。
- 验证结果：社区四设备专项 E2E 20/20、独立响应式用例 4/4、14 个单元测试文件共 63 项、lint、build 与 `git diff --check` 全部通过；手机端浏览器终审确认封面比例、渐隐提示、下拉分类和可访问区域名称均正确。
- 搜索框的占位文案与无障碍名称统一精简为“搜索课程”，详细的可检索字段继续由实际搜索能力承载，不再把字段清单堆叠在输入框内。

## 11. 社区发现控件吸顶

- 搜索栏与分类栏组合为单一的 `.community-discovery-controls` 吸顶区域；课程列表纵向滚动时两者保持固定关系并一起停留在全局标题栏下方。
- 吸附区域在滚动容器内使用 `top: 0`，由 `.screen-content.with-header` 已有的安全区、标题栏高度和布局间距负责实际屏幕偏移，避免重复叠加；手机、横屏与 iPad 共用同一结构契约。
- 吸顶区域使用现有页面背景 token 覆盖下方滚动内容，并以 1px 分隔层级，不使用毛玻璃或宽阴影；层级低于全局标题栏和导航、高于课程卡片。
- 完整分类菜单保留在吸顶区域的正常文档流中，展开后仍可访问全部九类，不会被滚动容器裁切。
- 社区滚动容器补充与“全局页头 + 搜索栏 + 分类栏”总高度一致的 `scroll-padding-top`，键盘聚焦、自动滚动和短横屏空状态操作不会被吸顶区域遮挡。
- 全局 AI 浮钮在社区页读取吸顶区域的实时底边并约束到其下方，避免遮挡分类按钮；完整分类菜单展开且短横屏空间不足时，浮钮暂时隐藏，菜单收起后恢复，其他页面的浮钮行为不变。
- iPhone 竖屏下，社区标题与系统状态栏底部仅保留 4px 间距，并同步将搜索区上移 8px 维持原有紧凑节奏；标题栏增加从屏幕顶端延伸到吸顶搜索区的实色背景，与搜索和分类背景无缝衔接，书籍滚动时不会从顶部固定组件后方透出。
- 教材入口卡片改为“封面居中、书名、版本与学习人数、右下角紫色进入动作”的信息结构，移除卡片内与顶部分类栏重复的学科胶囊；外框取消描边并使用现有 `0 4px 8px` 小投影 token，整卡仍是唯一点击目标。
- 社区搜索框接入 Figma `education1` 节点 `106:59544` 的 iOS 键盘结构：浅灰实色面板、三段课程联想词、QWERTY 键位、Shift、退格、空格和蓝色完成键；键盘通过应用外壳 Portal 覆盖底部导航，输入支持光标插入、选区替换、Unicode 退格、建议词和完成收起。
