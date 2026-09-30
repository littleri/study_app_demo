# Demo UI 文字风格基线

这份文档把当前 Demo 的界面风格转写为可复用的纯文字约束，用于不上传参考截图时的文生图，以及后续 React/CSS 界面校准。

## 视觉性格

- 面向学生的平板学习产品：可信、轻盈、亲和，但不幼稚。
- 以内容和学习动作优先，不使用营销海报式构图，也不使用未来感仪表盘。
- 信息量可以充足，但必须通过留白、分组、字重和低对比底色保持安静、易扫读。

## 画布与布局

- 主画幅：Android 平板竖屏，逻辑尺寸约 `834 × 1194`；生成稿使用 `1024 × 1536`。
- 页面底色：冷调浅灰蓝 `#F6F8FB`，大面积留白。
- 左侧保留细长的白色胶囊导航栏，带非常克制的冷色阴影。
- 主内容区采用清楚的两栏或主从结构；教材页、列表和详情应有明确视觉主次。
- 不新增第五个底部或侧边主导航项，笔记功能始终嵌入教材和学习上下文。

## 色彩

- 主操作紫：`#7C3AED`，用于主按钮、选中项和关键强调。
- 正文：`#20263A`；次级文字使用冷灰蓝，约 `#667085`。
- 边框：`#D7DEE8`，尽量使用 1px 轻描边。
- 辅助色只低饱和、小面积使用：淡紫、粉蓝、薄荷绿和浅粉。
- 语音波形附近允许非常轻的紫蓝色光晕，其他区域不使用霓虹或强发光。

## 表面与组件

- 主表面为白色，圆角以 `14–16px` 为主。
- 阴影轻、短、低透明；卡片边界更多依靠描边和底色差，不依赖厚重投影。
- 组件使用原生感线性图标、明确标签和至少 48dp 的触控区域。
- 主按钮为紫色实心圆角按钮；次按钮为白底描边；弱操作使用纯文字或低对比底色。
- 选中态采用浅紫底、紫色描边或紫色图标，不使用大面积渐变。

## 字体与信息层级

- 使用现代中文无衬线界面字体观感。
- 页面标题深色加粗；卡片标题中等字重；说明、时间和页码使用小号冷灰文字。
- 文案短、直接、动作导向；状态流程同时展示文字，不能只依赖动画表达。
- 生成图中的中文只用于构图参考，最终准确文案由 React 组件渲染。

## 学习内容表现

- 教材原页是手写批注页的视觉主体，笔迹覆盖在教材之上而不是独立白板。
- 笔迹以紫色钢笔、淡紫或粉蓝荧光笔为主，必须保持原文可读。
- 语音页面用真实感波形、计时和大号录音控制建立焦点，但整体仍保持克制。
- 结果页面始终并列保留原始内容与 AI 整理结果，避免让整理版看起来覆盖或替代原始内容。

## 禁止项

- 不使用玻璃拟态、深色模式、霓虹、高亮金属材质或强烈光效。
- 不使用过多渐变、过多悬浮卡片、密集数据图表或科幻控制台。
- 不生成手机外框、iPhone、灵动岛、真实平板硬件、手或触控笔实拍。
- 不把按钮、图标和文字做成照片纹理；界面应看起来可以直接由 React、CSS、Canvas 和线性图标实现。

## 文生图统一前缀

> Create a high-fidelity UI reference image for a Chinese Android tablet education app in portrait orientation, no device frame. Use a very pale cool gray-blue canvas #F6F8FB, a slim tall white pill navigation rail at the far left, clean white surfaces with 14–16px rounded corners, 1px #D7DEE8 borders and restrained cool shadows. Use #20263A for primary text, #667085 for secondary text and #7C3AED for primary actions, with sparse pale lavender, powder blue, mint and blush accents. Use modern Chinese sans-serif typography, native outline icons, wide tablet touch targets, disciplined spacing and calm educational-product hierarchy. Avoid glassmorphism, neon, dark mode, glossy gradients, futuristic dashboards, excessive floating cards, phone frames, hardware mockups, hands and photo-textured controls.

