# iOS 设备预览与高清录制审核标准

## 1. 审核结论规则

问题分级：

- **P0 阻断**：数据丢失、应用不可用、安全问题、普通入口无法访问、递归 iframe 或构建失败。
- **P1 严重**：核心设备切换/录制模式错误、iframe 重载导致状态丢失、关键页面或导航不可操作、明显错误布局。
- **P2 一般**：可访问性不达标、尺寸偏差、水平溢出、测试缺口、视觉问题足以影响演示或录制。
- **P3 轻微**：不影响任务完成的小型视觉或代码整洁问题。

通过条件：

1. P0、P1、P2 数量均为 0。
2. P3 必须被明确记录，且不能影响设备模拟、录制、可访问性或后续独立布局扩展。
3. 所有自动化命令通过，主代理完成 iPhone、iPad 和至少一个高清录制模式的真实浏览器视觉检查。

## 2. 功能验收清单

### AC-01 入口与递归保护（P0）

- `/` 渲染设备预览工作台，并且只创建一个 iframe。
- 公开 URL 不依赖 `preview=devices`；旧参数会从工作台 URL 中清理。
- 工作台 iframe 的地址固定为 `/?embedded=device-preview`。
- `/?embedded=device-preview` 渲染普通应用内容，不嵌套工作台。
- embedded 内部入口始终以应用内容为准，页面不会递归创建 iframe。
- 非法设备、方向或质量参数安全回退至默认值，不白屏、不抛出未捕获错误。

### AC-02 精确逻辑视口（P1）

- iPhone 17 Pro 竖屏 iframe content viewport 为 402 × 874。
- iPhone 17 Pro 横屏 iframe content viewport 为 874 × 402。
- iPad Pro 11″ 竖屏 iframe content viewport 为 834 × 1194。
- iPad Pro 11″ 横屏 iframe content viewport 为 1194 × 834。
- 检查值来自 iframe 内层 `window.innerWidth/innerHeight`，不是只检查外层标签文案。
- 尺寸误差不得超过 1 CSS px。

### AC-03 稳定 iframe 与状态保留（P0/P1）

- 切换设备、方向、Fit/2x/3x/4K 时使用同一个 iframe DOM 节点。
- iframe `src`、加载次数和内层应用根节点不发生无理由变化。
- 从首页进入课程/学习/上传等页面后切换设备，仍停留在当前页面。
- 输入框中的唯一测试文本在设备和方向切换后保留。
- 清晰度切换不关闭当前弹层或 AI 助手，不重置学习状态。
- 设备或质量值不得作为 iframe、`App`、`AppProvider`、`main` 或当前 Screen 的 React `key`。

### AC-04 Phone 布局（P1）

- iPhone 竖屏显示模拟 iOS 状态栏，时间为 9:41，并显示蜂窝、Wi-Fi 和电池图标。
- iPhone 竖屏显示 Home Indicator。
- 主导航在底部横向显示四项，活动项可识别。
- 内容默认为单列，关键操作不被状态栏、底部导航或 Home Indicator 遮挡。
- 短横屏手机保持 phone 布局族与底部导航，不错误进入 Pad rail。
- `.app-shell[data-device-layout="phone"]` 与实际逻辑视口一致。

### AC-05 Pad 布局（P1）

- iPad 不显示模拟 iPhone 状态栏和 Home Indicator。
- 主导航为左侧纵向 rail，四项操作均可见和可点击。
- 页面内容使用 Pad 可用宽度，已有多列/主从布局不退化为窄手机列。
- 弹层使用现有 iPad 居中 Dialog 或侧边面板契约，并保持在 visual viewport 内。
- `.app-shell[data-device-layout="pad"]` 与实际逻辑视口一致。

### AC-06 共享数据与独立外壳（P1）

- Phone/Pad 使用同一个 API、Repository、课程数据和 AppContext。
- 设备外壳可以分别修改导航和页面编排，不要求复制业务 Screen。
- 布局切换不重新调用只应在首次挂载执行的初始化请求。
- 页面 `<main>` 与当前 Screen 在 Phone/Pad 切换时保持挂载；局部输入状态不因 Chrome 变体切换而丢失。

### AC-07 自适应预览（P2）

- 默认预览完整显示在工作台可用区域内并居中。
- 自适应比例不大于 1，窄窗口不产生工作台页面的意外水平溢出。
- ResizeObserver 变化后比例正确更新，无无限循环、NaN、负值或控制台异常。
- 设备逻辑尺寸不因外层自适应缩放改变。

### AC-08 HD 2x 与 Retina 3x（P1）

- iPhone 竖屏 2x 输出为 804 × 1748，3x 为 1206 × 2622。
- iPad 竖屏 2x 输出为 1668 × 2388，3x 为 2502 × 3582。
- 横屏输出按方向后的逻辑尺寸乘倍率。
- 高清模式允许画布滚动查看，不能悄悄回退为 Fit 尺寸。
- iframe 内媒体查询仍读取逻辑尺寸；iPhone 3x 不得因 1206 输出宽度进入 Pad 布局。

### AC-09 4K 录制画布（P1）

- 竖屏输出画布严格为 2160 × 3840。
- 横屏输出画布严格为 3840 × 2160。
- 设备内容保持宽高比、完整可见并居中，不被拉伸或裁掉关键内容。
- 剩余背景稳定、无透明脏边和子像素抖动。
- 页面明确显示逻辑视口和输出画布的区别。

### AC-10 参数化录制链接（P2）

- 设备、方向、清晰度和 chrome 状态可由 URL 初始化。
- 控制变更使用 `history.replaceState` 或等效无重载方式同步 URL。
- 使用 `chrome=0` 可隐藏控制栏；`Escape` 可恢复，或明确通过 URL 恢复。
- 刷新参数化链接可复现相同设备与输出画布。

## 3. 可访问性验收

### AC-11 键盘与语义（P2）

- 设备、方向、清晰度控制均为原生 button。
- 每组控制具有可访问名称，当前项使用 `aria-pressed="true"`。
- Tab 顺序与视觉顺序一致，Enter/Space 可以切换。
- 所有可见控制的点击区域至少 44 × 44 CSS px。
- `:focus-visible` 清晰可见，不能只依赖浏览器不稳定的默认轮廓。
- iframe 有描述性 `title`。

### AC-12 状态与动效（P2）

- 设备/输出信息的辅助技术通知简短且不会随每一帧 resize 重复播报。
- 颜色不是表达当前选择的唯一方式。
- `prefers-reduced-motion: reduce` 下功能完整、切换直接到最终状态且无强制大幅动画。

## 4. 视觉验收

主代理必须在实际浏览器中逐项检查并保存必要截图作为审查证据：

1. iPhone 17 Pro 402 × 874 首页：状态栏、顶部内容、底部导航、Home Indicator。
2. iPad Pro 11″ 834 × 1194 首页：左侧 rail、多列内容、无手机状态栏。
3. 从一个有输入或弹层状态的页面进行 iPhone → iPad → iPhone 切换。
4. iPhone Retina 3x 或 iPad HD 2x 全尺寸画布，检查输出文案与内容清晰度。
5. 4K 竖屏画布，检查居中、留白和边缘。
6. 工作台窄窗口 Fit 模式，检查控制栏换行和无溢出。

视觉失败条件包括：

- 导航、状态栏或内容互相遮挡；
- iPhone/iPad Chrome 同时出现；
- 设备边框被错误采入全尺寸内容区域；
- 文字、图标或 1px 线在稳定状态下出现明显模糊或半像素抖动；
- 高清模式显示的输出尺寸与真实宿主几何不一致；
- 工作台控制栏压缩 iframe 的逻辑视口。

## 5. 自动化测试矩阵

### 必须执行的命令

```powershell
npm run lint
npm run test
npm run build
npm run test:e2e:demo
npx playwright test e2e/device-preview.spec.ts --project=iphone-17-pro
npm run test:responsive
```

如果实现修改了 motion、弹层、导航 DOM 或动画相关 CSS，还必须执行：

```powershell
npm run test:motion
npm run test:state-motion
```

最终合入前推荐执行 `npm run test:e2e` 全量回归。若全量回归因已有快照环境差异失败，必须证明失败与本次改动无关；不能仅以“测试太慢”为由跳过。

### 单元测试最低覆盖

- 四组设备方向逻辑尺寸。
- 2x/3x 输出尺寸。
- 竖屏/横屏 4K 画布尺寸与 fit scale。
- URL 参数合法值、非法值与默认值。
- 自适应 scale 的上限、窄宽、矮高和零尺寸边界。

### E2E 最低覆盖

- 公开 `/` 直接进入工作台。
- 工作台无递归 iframe。
- 四种逻辑视口的内层尺寸。
- 切换前后 iframe identity、加载计数和页面状态。
- Phone/Pad 状态栏与导航契约。
- Fit/2x/3x/4K 宿主几何。
- URL 参数复现与 chrome 隐藏/恢复。
- 键盘操作、`aria-pressed`、44 px 点击区域。
- 工作台和内层应用均无意外水平溢出。

## 6. 代码审核检查

- preset 和尺寸计算集中定义，没有散落的 402、874、834、1194、2160、3840。
- 工作台模块不被业务 screens 反向依赖。
- 没有新增不必要的生产依赖。
- iframe 使用同源相对 URL，不放宽 sandbox 或跨域权限。
- 所有 observer、media query listener、event listener 在卸载时清理。
- URL 更新不会污染浏览器历史栈。
- TypeScript 无 `any` 逃逸；导出类型与函数职责清晰。
- CSS 使用项目 token，控制栏有窄屏和 reduced-motion 处理。
- 内部 embedded 应用的现有 E2E selector 和可访问性语义未被无理由破坏。
- 对复杂尺寸计算有注释说明“为什么”，不重复代码本身。

## 7. 回派与复审流程

1. 主代理按本标准审核 Luna max 的 diff。
2. 每个问题写明等级、复现步骤、期望与涉及文件。
3. P0/P1/P2 回派同一个 Luna max 修复；不得由“看起来可以”替代验证。
4. 修复后重跑最小相关测试，再跑完整必需测试集。
5. 重复浏览器视觉验收，确认修复没有引入另一设备回归。
6. 只有达到本文件的通过条件后，才允许最终提交和推送。

