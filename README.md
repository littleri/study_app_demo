# Study App Demo

用于复刻 `D:\code\study_app\frontend` 核心体验并制作 iOS 风格宣传动画的独立前端仓库。

## 当前状态

计划第 1–5 项已完成：已冻结源仓库基线、建立独立前端、迁移 P0 体验、替换为本地 `DemoRepository`，并使用指定 125 页扫描型 PDF 通过 MinerU 生成并校验课程 fixtures。原始 PDF、MinerU 原始输出和模型缓存均只保留在本机，不进入 Git。

启动和校验：

```powershell
npm ci
npm run demo:validate
npm run dev
```

内容重建需要本机 PDF 路径和 MinerU 环境，详见 [docs/CONTENT_PROVENANCE.md](./docs/CONTENT_PROVENANCE.md)。视觉素材来源见 [docs/ASSET_PROVENANCE.md](./docs/ASSET_PROVENANCE.md)，源仓库基线见 [docs/SOURCE_BASELINE.md](./docs/SOURCE_BASELINE.md)。

## 已确认的输入

- 源前端：`D:\code\study_app\frontend`
- 技术栈：React、TypeScript、Vite、Vitest、Playwright
- 示范教材：`C:\Users\asd25\Desktop\示范文件\人教版高中生物必修2遗传与进化 (人民教育出版社, 课程教材研究所, 生物课程教材研究开发中心.pdf`
- 教材状态：125 页、约 38.8 MB、未加密、扫描型 PDF，需要 OCR

## 仓库原则

- 运行时不依赖真实后端、账号、网络或在线 AI。
- PDF 只在构建内容时作为本地输入，不提交原始教材到 Git。
- 演示数据、解析进度、交互路径和动画节奏均可复现；上传时间和聊天消息 ID 仅用于 UI 展示，不作为课程结果的一部分。
- 不改动源仓库；迁移只读取经确认的源文件快照。
