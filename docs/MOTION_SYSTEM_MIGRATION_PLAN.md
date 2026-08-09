# BookCourse AI 动效系统迁移计划

## 1. 文档状态

- 状态：已完成分阶段实施与验收。
- 目标：将全局范围动效统一为 `350ms`，将局部范围动效统一到 `150ms`、`180ms`、`200ms` 三档，并让每个有限动效使用与其语义对应的缓动曲线。
- 实施方式：严格串行。每一步都必须遵循“实现 → 独立审核 → 自动化验证 → 门禁放行”，审核未通过时不得进入下一步。
- 产品约束：移动优先、温和清晰、避免喧闹的常驻动画；动效必须表达导航层级、状态变化或操作反馈。
- 无障碍约束：完整支持 `prefers-reduced-motion`，动效不能是理解状态的唯一方式。

## 2. 目标与非目标

### 2.1 目标

1. 页面、全屏模态层、Sheet、AI Dialog 及其 Scrim 统一使用 `350ms` 的全局时间轴。
2. 按压、文字、图标、Toast、成功/错误反馈、筛选器、折叠、卡片、图片、进度和闪卡等局部动效统一到 `150–200ms`。
3. 用语义化 token 区分全局进入、全局退出、局部进入、局部退出、局部状态和进度变化曲线。
4. 消除 `ease`、`ease-in`、`ease-out`、散落 `cubic-bezier()` 和 GSAP 硬编码时长造成的漂移。
5. 修复当前 `320ms` Presence 兜底会提前截断大于 320ms 动画的问题。
6. 页面切换改为 previous/current 双层重叠，避免旧页立即卸载后将 350ms 入场放大成空白或闪白。
7. 保持快速连续导航、焦点管理、滚动恢复、reduced motion 和动画取消语义正确。
8. 建立覆盖 token、状态机、真实浏览器、多视口、性能和无障碍的测试证据。

### 2.2 非目标

- 不增加与状态无关的装饰动画。
- 不引入 bounce、elastic、spring overshoot 或页面加载编排。
- 不把业务轮询、上传延迟、API timer 当作视觉动效时长修改。
- 不把 Spinner、Skeleton 循环或直接拖拽机械压缩到 150–200ms。
- 不用 `transition: all`，不长期保留 `will-change`。

## 3. 范围定义

### 3.1 全局范围：350ms

全局动效会改变整个视口的页面语境、模态层级或主要任务上下文。

| 表面 | 当前时长 | 目标时长 | 备注 |
|---|---:|---:|---|
| 手机页面 forward/back | 240ms | 350ms | 保留方向，调整曲线 |
| 平板页面切换 | 240ms | 350ms | 保留纵向层级位移 |
| 矮横屏页面切换 | 180ms | 350ms | 仅缩短距离，不缩短时长 |
| replace 页面切换 | 140–180ms | 350ms | 使用较弱位移 |
| Action Sheet surface | 140–240ms | 350ms | Enter/Closing 同一时间轴 |
| Sheet Scrim | 140ms | 350ms | 与 surface 同步，不阻塞输入 |
| AI Dialog | 180–380ms | 350ms | 移除设备时长分叉 |
| AI Shared Surface / Origin Icon | 180–380ms | 350ms | 关键帧百分比编排在同一时间轴内 |
| AI Dialog Scrim | 140ms | 350ms | 使用全局透明度曲线 |

### 3.2 局部范围：150–200ms

| 等级 | 时长 | 使用场景 |
|---|---:|---|
| Local Fast | 150ms | Press、Hover、图标、颜色、边框、快速退出 |
| Local Base | 180ms | Toast、文字替换、成功/错误、图片、复选框、卡片 |
| Local Slow | 200ms | 折叠、筛选器、导航指示器、进度、闪卡、局部几何变化 |

局部映射：

| 动效 | 当前 | 目标 |
|---|---:|---:|
| 按钮/图标按压 | 90–140ms | 150ms |
| 导航图标激活 | 140ms | 150ms |
| 导航 GSAP 选中背景 | 240ms | 200ms |
| Toast 进入/退出 | 180/140ms | 180/150ms |
| 文字状态进入/退出 | 180/140ms | 180/150ms |
| 成功标记、勾选、错误 Shake | 180–240ms | 180ms |
| 图片加载完成揭示 | 140–180ms | 180ms |
| 本地卡片/内容进入 | 140–180ms | 180ms |
| 筛选器指示器 | 180–240ms | 200ms |
| 折叠展开 | 180–240ms | 200ms |
| Skeleton → Content | 240ms | 200ms |
| 确定性进度变化 | 320ms | 200ms |
| 闪卡下一张 | 140–180ms | 180ms |
| 闪卡翻转 | 180–340ms | 200ms |
| AI Orb 释放归位 | 180ms | 200ms |

### 3.3 明确例外

| 例外 | 规则 |
|---|---|
| Spinner | 保留约 1200ms 周期，使用 `linear` |
| Skeleton 呼吸 | 保留约 1200ms 周期，使用 `ease-in-out` 语义曲线 |
| Pointer 拖拽跟手 | `0ms`，直接响应输入 |
| 拖拽释放归位 | 200ms，局部进入曲线 |
| Reduced motion | 0–1ms 或同步最终状态，不等待 timer |
| 初始首页 | 不播放页面入场 |
| 同屏重复点击 | 不重播页面动画 |
| 业务 timer / API 轮询 | 非视觉动效，不修改 |
| Stagger delay | 单项最多 30ms，总延迟最多 120ms，最多前 5 项 |

## 4. Token 契约

### 4.1 Duration token

```css
:root {
  --motion-duration-global: 350ms;
  --motion-duration-local-fast: 150ms;
  --motion-duration-local-base: 180ms;
  --motion-duration-local-slow: 200ms;
  --motion-duration-loading: 1200ms;
}
```

旧的 `press / fast / base / surface / progress / flip` 在迁移完成前可临时保留别名；最终所有运行时选择器应迁移到新的语义 token，避免把全局与局部再次混在 `surface` 中。

### 4.2 Easing token

```css
:root {
  --motion-ease-global-enter: cubic-bezier(.25, 1, .5, 1);
  --motion-ease-global-exit: cubic-bezier(.5, 0, .75, 0);
  --motion-ease-local-enter: cubic-bezier(.22, 1, .36, 1);
  --motion-ease-local-exit: cubic-bezier(.32, 0, .67, 0);
  --motion-ease-local-state: cubic-bezier(.65, 0, .35, 1);
  --motion-ease-progress: cubic-bezier(.4, 0, .2, 1);
}
```

### 4.3 曲线规律

| 语义 | 曲线 | 场景 |
|---|---|---|
| Global Enter | ease-out-quart | 页面、Sheet、Dialog 入场 |
| Global Exit | ease-in-quart | 页面、Sheet、Dialog 退出 |
| Local Enter | ease-out-quint | Toast、文字、图片、成功反馈 |
| Local Exit | ease-in-cubic | Toast、文字、局部表面离场 |
| Local State | ease-in-out-cubic | Toggle、筛选、导航滑块、颜色状态 |
| Progress | 标准强调曲线 | 进度条和确定性数值变化 |
| Continuous | linear / loop ease-in-out | Spinner、呼吸循环 |

规则：

- 每个有限 CSS 动效必须引用语义 easing token。
- 不允许裸写 `ease`、`ease-in`、`ease-out`。
- GSAP 使用统一的 TypeScript duration 常量和明确 easing；禁止继续硬编码 `0.24`。
- 禁止 bounce、elastic、无语义 overshoot。
- 页面、Sheet、Dialog 优先只动画 `transform` 和 `opacity`。
- Blur/filter 只允许用于小面积、有限局部表面，并需浏览器验证。

## 5. ScreenTransition 双层方案

### 5.1 当前问题

当前页面只有新页面 `entering`，导航提交时旧页面立即卸载。直接将入场延长到 350ms 会扩大透明空档和闪白感。

### 5.2 目标结构

```text
导航提交
  ├─ previous：350ms 淡出 + 轻微反向位移
  └─ current：350ms 淡入 + 按方向进入
350ms 结束
  └─ 清理 previous，只保留 current
```

### 5.3 导航映射

| 方向 | Previous | Current |
|---|---|---|
| Forward | 向左轻移并淡出 | 从右侧 12px 淡入 |
| Back | 向右轻移并淡出 | 从左侧 12px 淡入 |
| Replace | 原位轻微淡出 | 从下方 6px 淡入 |
| Tablet | 纵向 6–8px | 时长仍为 350ms |
| Short landscape | 距离缩到 4–6px | 时长仍为 350ms |

### 5.4 交互与可访问性

Previous surface 在过渡期间必须：

- `pointer-events: none`；
- `inert`；
- `aria-hidden="true"`；
- 不接收焦点；
- 不覆盖 current 的滚动恢复；
- 不触发新的操作；
- 快速导航时不无限堆叠，只保留当前需要的两层。

Current surface 在导航提交后立即成为业务和焦点主表面，不等待 350ms 才可用。

### 5.5 状态机建议

若组件内状态过于复杂，新增：

- `src/motion/screenTransitionMachine.ts`
- `src/motion/screenTransitionMachine.test.ts`

纯状态快照至少保存 `current`、`previous`、`direction`、`generation` 和 `idle/transitioning`。陈旧 `animationend`、`animationcancel` 与 timer 只能结算自己的 generation。

## 6. Presence 兜底契约

现有固定 `320ms` 兜底必须在任何 350ms 全局动画上线前修改。

```ts
export const globalMotionDurationMs = 350;
export const globalMotionFallbackMs = 450;
export const localMotionMaxMs = 200;
export const localMotionFallbackMs = 300;
```

要求：

- `maxMotionMs?: typeof motionPresenceMaxMs` 改为 `maxMotionMs?: number`。
- ScreenTransition、Action Sheet、AI Dialog 使用 450ms。
- Toast 和普通局部 Presence 使用 300ms。
- `animationend` / `animationcancel` 是主要完成信号；timer 只防事件丢失。
- reduced motion 同步完成，不启动兜底。
- CSS 与 TypeScript 的时长由测试交叉断言，防止漂移。

## 7. 受影响文件

核心 token 与样式：

- `src/styles/tokens.css`
- `src/styles/motion.css`
- `src/styles/base.css`
- `src/styles/responsive.css`
- `src/styles/home.css`
- `src/styles/study.css`
- `src/styles/glass.css`
- `src/styles/device-preview.css`
- `src/styles/card-system.css`

React 与状态机：

- `src/motion/useMotionPresence.ts`
- `src/motion/ScreenTransition.tsx`
- `src/motion/navigationMachine.ts`（仅在方向语义确需调整时）
- `src/motion/index.ts`
- `src/components/ui.tsx`
- `src/App.tsx`
- 可新增 `src/motion/timing.ts`
- 可新增 `src/motion/screenTransitionMachine.ts`

测试：

- `src/motion/*.test.ts`
- `e2e/motion.spec.ts`
- `e2e/state-motion.spec.ts`
- 必要时更新与根节点数量、动效残留相关的其它 E2E。

## 8. 串行实施步骤与审核门禁

### 步骤 1：计划文档

- 实现：创建本文档。
- 审核：检查范围、token、曲线、双层页面、Presence、测试和回滚是否完整。
- 门禁：文档审核通过后才能改源码。

### 步骤 2：Duration / Easing token

- 实现：新增语义 duration/easing token；旧 token 仅保留兼容别名。
- 审核：逐项核对值、命名、reduced-motion 覆盖和未授权业务样式变化。
- 验证：token 单元/浏览器 computed style 测试。
- 门禁：token 契约稳定后进入 Presence。

### 步骤 3：Presence 兜底与类型

- 实现：增加 450/300ms 兜底，放宽 `maxMotionMs` 类型，分别接入全局和局部表面。
- 审核：检查 timer 清理、generation 隔离、animationcancel、unmount 和 reduced motion。
- 验证：fake clock 覆盖 299/300、349/350、449/450ms 边界。
- 门禁：不存在提前截断后进入页面重构。

### 步骤 4：页面双层过渡

- 实现：previous/current 重叠、350ms、方向与设备距离映射、焦点和滚动策略。
- 审核：重点检查双树副作用、快速导航、陈旧事件、DOM 清理和 a11y。
- 验证：状态机单测、Stage 2A、多视口、reduced motion。
- 门禁：idle 时恢复单根且无空白帧后进入模态表面。

### 步骤 5：Sheet / Scrim / AI Dialog

- 实现：所有全局模态时间轴统一 350ms，移除设备时长分叉。
- 审核：检查遮罩/表面同步、焦点陷阱、关闭可用性、Shared Surface 编排。
- 验证：Stage 2C/2D、多视口、自然时间完成与 450ms 兜底。
- 门禁：不存在截断和焦点回退后进入局部迁移。

### 步骤 6：局部动效与 GSAP

- 实现：局部动效迁移到 150/180/200ms，GSAP 选中背景改为 200ms 并使用明确曲线。
- 审核：检查分类正确、交互不滞后、stagger 封顶、循环例外未误改。
- 验证：Stage 3/4、state-motion、组件 computed style。
- 门禁：所有有限局部动效处于允许区间后进入清理。

### 步骤 7：硬编码与性能清理

- 实现：扫描所有 `animation/transition/duration/ease/cubic-bezier`，消除未批准硬编码和 legacy 冲突。
- 审核：确认无 `transition: all`、永久 `will-change`、随意布局属性动画。
- 验证：CSS 性能审计、静态搜索、lint/build。
- 门禁：例外清单之外没有漂移后进入总验证。

### 步骤 8：完整测试与视觉验收

- 实现：更新所有时长/曲线/根节点/兜底断言。
- 审核：要求测试证明需求，而不只是把旧期望替换成新数字。
- 验证：单元、motion E2E、state-motion、responsive、手机/横屏/iPad 视觉检查。
- 门禁：所有显式验收项均有当前证据后进入最终审计。

### 步骤 9：最终需求对照审计

- 逐项对照本文档与用户要求。
- 检查 git diff、未跟踪文件、运行时 computed style、测试结果和视觉证据。
- 不以“没有发现明显问题”代替完成证明。
- 只有全部要求被当前证据证明后才能宣布完成。

## 9. 测试矩阵

### 9.1 单元测试

- Duration/easing 常量值。
- Presence 300/450ms 边界。
- animationend、animationcancel、timer 三条结算路径。
- stale generation、rapid replace、unmount timer cleanup。
- ScreenTransition previous/current 状态演进。
- reduced motion 同步状态。

### 9.2 Playwright

- Stage 1：token 和 reduced-motion。
- Stage 2A：页面 `0.35s`、双层根、方向、取消、快速导航。
- Stage 2B：导航本地 150/200ms。
- Stage 2C：Sheet 350ms、Toast 150/180ms。
- Stage 2D：AI Dialog 所有设备 350ms，Shared Surface 同步。
- Stage 3/4：本地反馈全部在 150–200ms。
- Stage 5：无残留、无 `transition: all`、无永久 `will-change`、合成安全。

### 9.3 设备

- iPhone 17 Pro 竖屏与横屏。
- 小尺寸手机竖屏与矮横屏。
- iPad 竖屏与横屏。
- Device Preview fit 与实际尺寸模式。

### 9.4 视觉流程

1. 首页 → 上传 → 解析 → 目录确认。
2. 首页 → 课程库 → 课程 → 章节 → 原文。
3. 底部主导航连续切换。
4. 页面过渡中再次导航。
5. Sheet 与 AI Dialog 进入/退出。
6. Toast、成功、错误、筛选、折叠、闪卡。
7. 运行时切换 reduced motion。

## 10. 验收标准

- 所有全局表面 computed duration 为 `0.35s`。
- 所有有限局部动效为 `0.15s`、`0.18s` 或 `0.2s`。
- 连续循环只存在于批准例外中。
- 每个有限动效使用语义曲线；无裸写 `ease/ease-out`。
- 不存在 320ms 提前截断；全局兜底为 450ms，局部兜底为 300ms。
- 页面过渡期间无空白帧、无可交互旧页面、无焦点泄漏。
- 快速导航最终只保留正确 current 页面。
- Idle 时 previous 清理、动画/transform/will-change 无残留。
- Reduced motion 下无等待、无残留，操作语义与焦点保持完整。
- 无 `transition: all`，无永久 `will-change`，关键页面在目标设备上无明显掉帧。
- 单元、motion E2E、state-motion、responsive 和 build/lint 均通过。

## 11. 风险与回滚边界

| 风险 | 控制措施 | 回滚边界 |
|---|---|---|
| 350ms 放大页面空白 | 双层 previous/current 重叠 | 可只回滚页面双层步骤，不回滚 token/Presence |
| 双页面导致副作用或重复请求 | Previous inert、冻结快照、状态机单测 | 保留 350ms token，临时退回单层 crossfade |
| 固定 350ms 退出显慢 | 使用 global-exit 曲线，不阻塞 current | 需用户确认后才允许单独缩短退出；本计划默认保持 350ms |
| CSS/TS 时长漂移 | E2E 交叉断言 computed style 与 TS 常量 | 回滚对应步骤，不跳过断言 |
| GSAP 与 CSS 不同步 | 统一 TS 常量与语义曲线 | 只回滚导航局部步骤 |
| 滚动/焦点回归 | 导航与 a11y 专项测试 | 页面步骤不放行 |
| 低端设备掉帧 | transform/opacity 优先，多视口检查 | 移除局部 blur/filter，不改变时长契约 |
| Reduced motion 回归 | CSS + JS 双重测试 | 任一失败即阻止后续门禁 |

每一步应保持可单独审核和可单独回滚。不得用破坏性 Git 操作恢复状态；如需回退，只反向修改当前步骤拥有的文件和规则，并重新执行该步骤的验证。
