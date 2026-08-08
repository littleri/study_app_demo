# iOS 设备预览与高清录制实施计划

## 1. 目标与本轮边界

本轮将用于演示和录制的设备预览工作台设为唯一公开入口，并为后续分别设计 iPhone 与 iPad 界面建立稳定的布局分层。

本轮必须完成：

1. 公开入口 `/` 直接渲染设备预览工作台。
2. 实际应用仅通过工作台 iframe 的内部地址 `/?embedded=device-preview` 渲染。
3. 在同一个工作台中切换 iPhone 17 Pro 与 iPad Pro 11 英寸的竖屏/横屏逻辑视口。
4. 切换设备、方向或输出清晰度时不重载内嵌应用，不丢失当前页面、输入和学习状态。
5. 提供自适应、HD 2x、Retina 3x 与 4K 录制画布模式。
6. 把设备外壳与业务页面分离，允许后续分别扩展 Phone 与 Pad 的导航、页面编排和交互表面。
7. 增加单元测试和 Playwright 端到端测试，并保持现有测试通过。

本轮不做整套页面的重复实现。课程数据、API、导航状态、学习进度、表单数据、弹层状态和页面组件继续共享；只建立可独立演进的设备布局外壳，并验证手机底部导航与 iPad 左侧导航的差异。

## 2. 关键设计原则

### 2.1 逻辑视口与输出分辨率分离

应用的响应式判断必须基于真实的逻辑视口，而不是对 `.app-shell` 做视觉缩放。工作台使用同源 `iframe`，iframe 的 `width` 和 `height` 始终等于设备逻辑尺寸，因而内层媒体查询、`visualViewport`、安全区和容器查询都按真实设备宽高工作。

外层工作台只负责：

- 将逻辑视口按比例缩放到可见区域；
- 在录制模式中把逻辑视口放大到目标输出画布；
- 显示设备、方向、清晰度和最终输出尺寸；
- 保持 iframe 节点和 `src` 稳定。

不得直接把 iPhone iframe 设置为 1206 px 宽来模拟 3x，否则内层会错误进入 iPad/桌面布局。

### 2.2 共享业务状态，独立设备布局

`App`、`AppProvider` 与页面状态位于布局分支之上。Phone/Pad 变体只控制外壳层：状态栏、标题栏、主导航、内容网格插槽、弹层呈现锚点和设备专属装饰。

切换变体时，承载当前页面的 `<main>` 和页面子树必须保持稳定 identity。不得使用设备名作为页面或 iframe 的 React `key`，不得通过重建 `AppProvider` 切换布局。

### 2.3 单一公开入口

入口规则固定为：

1. 查询参数存在 `embedded=device-preview` 时渲染内部应用内容；
2. 其他所有公开地址均渲染设备预览工作台。

因此 iframe 的固定地址为 `/?embedded=device-preview`，不会递归渲染工作台。公开 URL 不再依赖 `preview=devices`，工作台同步 URL 时会移除该旧参数。

## 3. 设备与输出规格

### 3.1 逻辑设备 preset

| 设备 | 竖屏逻辑视口 | 横屏逻辑视口 | 布局族 |
| --- | ---: | ---: | --- |
| iPhone 17 Pro | 402 × 874 | 874 × 402 | phone |
| iPad Pro 11″ | 834 × 1194 | 1194 × 834 | pad |

Phone/Pad 断点继续遵守现有契约：宽度至少 768 px 且高度至少 600 px 时使用 Pad rail，其余使用 Phone bottom navigation。这样短横屏手机仍使用手机导航。

### 3.2 清晰度 preset

| 模式 | 行为 | iPhone 竖屏输出 | iPad 竖屏输出 |
| --- | --- | ---: | ---: |
| 自适应预览 | 等比缩放至当前工作区，最大不超过 1x | 动态 | 动态 |
| HD 2x | 逻辑宽高乘 2 | 804 × 1748 | 1668 × 2388 |
| Retina 3x | 逻辑宽高乘 3 | 1206 × 2622 | 2502 × 3582 |
| 4K | 固定画布，内容等比居中并保留背景留白 | 2160 × 3840 | 2160 × 3840 |

横屏 4K 画布为 3840 × 2160。4K 模式不得拉伸设备内容；使用 `min(canvasWidth / logicalWidth, canvasHeight / logicalHeight)` 计算内容缩放，并在剩余区域显示可配置但稳定的录制背景。

HD/Retina 模式的工作台宿主尺寸等于逻辑尺寸乘倍率。录制时可使用浏览器或 OBS Browser Source 打开参数化工作台，并把采集窗口设置为工作台显示的输出尺寸。前端只能定义稳定的 CSS 输出画布，不能伪称已修改操作系统或浏览器的硬件 DPR。

## 4. 推荐文件结构

实现应尽量限制在以下清晰边界中；如果根据现有代码需要调整文件名，可以调整，但职责不得混合回业务页面。

```text
src/
  preview/
    devicePreview.ts              # 类型、preset、尺寸与缩放纯函数
    DevicePreviewStudio.tsx       # 工作台状态、稳定 iframe 与画布
    DevicePreviewToolbar.tsx      # 设备/清晰度/方向控制
    devicePreview.test.ts         # preset 与输出尺寸单元测试
  layouts/
    useDeviceLayout.ts            # 订阅既有响应式断点
    PhoneChrome.tsx               # 手机状态栏/底部导航外壳
    PadChrome.tsx                 # iPad 左侧 rail 外壳
  styles/
    device-preview.css            # 仅工作台样式
e2e/
  device-preview.spec.ts          # 工作台功能、状态与几何契约
```

现有 `src/components/ui.tsx` 中的 `AppShell` 可以拆分或组合上述外壳，但业务 Screen 不应 import 工作台模块。

## 5. 分阶段实施

### 阶段 A：纯配置与入口分流

1. 在 `devicePreview.ts` 定义 `DeviceId`、`Orientation`、`QualityId`、`DevicePreset` 和 `OutputGeometry`。
2. 使用 readonly 常量保存设备尺寸，不在 JSX 或 CSS 中重复魔法数字。
3. 提供纯函数：
   - 获取方向后的逻辑宽高；
   - 获取 1x/2x/3x 输出宽高；
   - 获取 4K 画布与内容缩放；
   - 解析并校验 URL 参数，非法值回退至默认值。
4. 在 `main.tsx` 做最小入口分流；仅内部 embedded 地址渲染原 `App`，其余地址渲染工作台。
5. iframe 的 `src` 使用固定常量 `/?embedded=device-preview`，并设置有意义的 `title`。

### 阶段 B：设备预览工作台

1. 工作台包含一个顶部控制栏和一个可滚动/居中的画布区。
2. 默认设备为 iPhone 17 Pro，默认方向为竖屏，默认清晰度为自适应。
3. 设备、方向、清晰度可以用 URL 参数初始化，并在变更时使用 `history.replaceState` 同步，便于录制链接复用；不得因此导航或重载 iframe。
4. 同一个 iframe 元素只更新尺寸样式，不改变 `src`、`key` 或 DOM identity。
5. 自适应缩放使用 `ResizeObserver` 读取可用画布尺寸，计算 `min(1, availableWidth / logicalWidth, availableHeight / logicalHeight)`；处理零尺寸与组件卸载。
6. 工作台显示以下只读信息：逻辑视口、输出画布、当前缩放和布局族。
7. 录制模式允许画布超出浏览器窗口并滚动，不得为了“看得下”再次缩小 HD/Retina 的目标输出尺寸。

### 阶段 C：Phone/Pad 外壳分层

1. 使用与 CSS 相同的媒体条件订阅布局族；推荐 `matchMedia('(min-width: 768px) and (min-height: 600px)')` 与 `useSyncExternalStore`，避免渲染阶段直接读取不可订阅的 `window.innerWidth`。
2. Phone 外壳负责：
   - iOS 模拟状态栏；
   - 四项底部导航；
   - Home Indicator；
   - 单列内容默认插槽；
   - 手机弹层/Bottom Sheet 的定位上下文。
3. Pad 外壳负责：
   - 隐藏手机状态栏与 Home Indicator；
   - 左侧 navigation rail；
   - 宽屏多列内容默认插槽；
   - 居中 Dialog 或侧边面板的定位上下文。
4. `main` 页面子树在布局切换时保持挂载。允许 Chrome/nav 子树切换，但不允许页面、Provider、API hooks 和全局学习状态重建。
5. 在 `.app-shell` 暴露 `data-device-layout="phone|pad"`，用于 CSS、自动化测试与后续页面专属编排；它必须反映实际逻辑视口，而不是工作台按钮的文本值。
6. 继续复用当前 Screen 组件。本轮只验证 Home、Library/课程、Lesson、Notes、Upload 和 AI 助手在两个布局族中可用，不复制业务实现。

### 阶段 D：高清录制画布

1. 自适应模式使用紧凑设备框和工作台背景，适合交互检查。
2. HD/Retina 模式输出严格的倍数画布，并隐藏不必要的设备阴影以避免采集边界不确定。
3. 4K 模式输出固定 2160 × 3840 或 3840 × 2160 画布，设备内容等比居中。
4. 增加“隐藏控制栏/录制模式”能力，可通过 URL 参数复现，例如：
   `/?device=iphone-17-pro&orientation=portrait&quality=retina-3x&chrome=0`
5. 控制栏隐藏后仍提供明确恢复方式：URL 改回 `chrome=1`，并允许 `Escape` 恢复；不能形成无法退出的页面状态。
6. 页面背景、设备边界和 iframe 不应出现子像素抖动；输出宽高和偏移尽量取整数。

### 阶段 E：可访问性与交互细节

1. 三组控制分别使用可理解的组标签。
2. 切换按钮使用原生 `<button>` 和 `aria-pressed`，当前值不只依赖颜色表达。
3. 所有交互目标至少 44 × 44 CSS px，键盘可聚焦，并有清晰的 `:focus-visible`。
4. 输出尺寸变更通过 `aria-live="polite"` 的短文本通知，但不要在连续 ResizeObserver 更新时频繁播报。
5. iframe 使用描述性 `title`；装饰设备边框对辅助技术隐藏。
6. 尊重 `prefers-reduced-motion`，设备切换可直接到最终状态，不依赖动画完成业务操作。

### 阶段 F：测试与回归

1. 为所有 preset 和输出计算增加 Vitest 单元测试。
2. 新增 `device-preview.spec.ts`，优先在一个浏览器项目运行，不把相同工作台测试无意义地复制四遍。
3. 在 E2E 中保存 iframe `ElementHandle` 或唯一标识，切换设备后确认仍是同一节点、`src` 未变且内层页面状态保留。
4. 检查 iPhone 与 iPad 的状态栏、导航形态、无水平溢出、最小交互尺寸和键盘操作。
5. 检查自适应、2x、3x、4K 的宿主几何和显示的尺寸文案。
6. 执行完整 `lint`、Vitest、build、现有 Demo E2E、responsive E2E 与新增工作台 E2E。

## 6. 状态保留验证场景

至少覆盖以下真实操作，而不是只比较 iframe URL：

1. 在内层应用从首页进入另一个页面；切到 iPad，页面不回首页。
2. 打开可编辑输入，输入唯一文本；切换设备和方向后文本仍存在。
3. 打开 AI 助手或一个弹层；切换清晰度后弹层状态保持且仍在视口内。
4. 内层滚动到非零位置；清晰度切换不得因为 iframe reload 回到顶部。设备尺寸切换允许浏览器进行必要的布局滚动校正，但不得重载应用。

## 7. 实施约束与风险控制

- 不新增重量级路由、状态管理或设备模拟依赖；当前需求可用 React、CSS 和浏览器 API 完成。
- 不修改 MinerU/PDF 数据链路；设备工作台只影响展示层。
- 不把工作台状态塞入业务 `AppContext`。
- 不用 User-Agent 猜设备，统一按逻辑视口决定布局族。
- 不通过复制整套 Screen 来制造 Phone/Pad 差异。
- 不删除或重写现有响应式、motion 与 safe-area 契约；若必须调整，需先增加针对性测试。
- 公开 `/` 必须稳定渲染工作台；原应用 DOM 与行为通过内部 embedded 入口维持现有测试契约。

## 8. 提交顺序

1. 基线提交已推送到公开仓库。
2. 本计划和审核标准作为独立文档提交。
3. 实现代码由 Luna max 完成，但不由子代理提交或推送。
4. 主代理审核 diff、运行测试并做浏览器视觉验收。
5. P0/P1/P2 问题回派同一 Luna max 修复并复审。
6. 验收通过后由主代理创建最终提交并推送到 `main`。

