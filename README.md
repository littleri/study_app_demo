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

## Android debug APK（Capacitor）

仓库已经包含 Capacitor 的 `android/` 原生工程。根路径 `/` 现在始终打开真实 App；仅在需要设计验收时，使用 `/?preview=device-preview` 打开设备预览工作台。

在第一次打开 Android Studio 前，先在本仓库运行：

```powershell
npm ci
npm run android:sync
npx cap doctor
```

这会构建 Web 应用并把它同步到 `android/`。之后用 Android Studio 打开 [android](./android) 文件夹，等待 Gradle 同步完成，再通过 **Run** 安装到真机；也可以在 SDK、JDK 和 `adb` 配置完成后使用：

```powershell
npm run android:run
# 或构建 debug APK
npm run android:apk
```

每次修改前端代码后，都先执行一次 `npm run android:sync`，再从 Android Studio 运行或重新构建 APK。
真机验收项目见 [docs/ANDROID_DEBUG_CHECKLIST.md](./docs/ANDROID_DEBUG_CHECKLIST.md)。

### 临时 DeepSeek 直连（个人 BYOK）

默认不访问 DeepSeek、Hugging Face、CDN 或业务后端：未配置 Key 时，聊天界面和 Android debug APK 使用随应用打包的本地资料。简单问候得到普通聊天回复且不显示教材引用；浏览器/Android 中明确的生物教材问题会优先检索完整静态教材库，并只显示由本地 chunk 生成的真实页码。没有浏览器 Worker 的 Node fixture 测试仍保留固定离线回答，以保持测试稳定。

如需本人短期调试直连，在 gitignored 的 `.env.local` 中创建以下内容后重新执行 `npm run android:sync`：

```text
VITE_DEEPSEEK_API_KEY=your_short_lived_personal_key
```

直连模式采用两阶段调用：第一请求只发送系统规则、有限对话历史、用户问题和 `search_textbook` 工具定义；模型对闲聊可直接回答。只有模型请求教材工具时，前端才在本地片段中全书检索，并在结果达到可靠性阈值后把有限片段作为工具结果回传。教材页码和引用始终由本地元数据生成，不由模型生成。

`VITE_DEEPSEEK_API_KEY` 会在 Vite 构建时进入浏览器或 APK 客户端产物，任何拿到产物的人都可能提取它。因此 BYOK 仅适合本人短期调试：不要提交 `.env.local`、不要分发包含该 Key 的构建，测试结束后立即撤销 Key。面向其他用户的版本必须改为服务端或 Serverless 代理。

### 完整前端生物教材 RAG

biology-required-2 的完整静态教材检索库位于 public/rag。它覆盖指定扫描 PDF 的 125/125 个 PDF 页，包含 171 个语义 chunks、BM25、512 维 BGE 向量、页码映射、50 条评测集和完全本地的 ONNX/WASM 运行时。当前静态 RAG 总体积为 54,112,227 bytes；模型、索引和 runtime 都按需由 Web Worker 加载，并在模型不可用、Worker 失败或资源超时时安全退化到本地 BM25 或无教材引用。BM25 降级阈值基于正负例独立校准：没有可靠词法证据时（包括闲聊的非零字词重合）只返回无教材引用。实际发布体积和 APK 审计值必须由 `npm run rag:validate` 与发布流程重新确认，不能手工猜测或复用旧构建数字。

完整架构、源 PDF 的“缺少第 1 章正文”边界、PDF 第 6 页恢复、哈希、版权和 Android 验收见 [docs/BIOLOGY_FRONTEND_RAG_PLAN.md](./docs/BIOLOGY_FRONTEND_RAG_PLAN.md)。路由层与 DeepSeek Tool Call 的边界见 [docs/AI_ASSISTANT_RAG_ROUTING_PLAN.md](./docs/AI_ASSISTANT_RAG_ROUTING_PLAN.md)。

需要复核或重建时使用：

~~~powershell
npm run rag:validate
npm run rag:evaluate
npm run rag:validate:source
npm run rag:build
~~~

source 校验与重新构建需要本机原 PDF 和经过确认的 MinerU 产物；它们不会提交到 Git。发布前应在无真实 Key 的环境中运行 rag validate、相关 Vitest、build、lesson AI E2E 以及 Android APK 资产检查。

从相邻 `study_app` 后端正式包刷新目录、125 张原始页扫描缓存和全部 MinerU 配图：

```powershell
npm run demo:refresh
```

其中 `demo:pages` 仅把 125 张原始页扫描写入 gitignored 的 `.cache/unpublished-textbook-pages`，不会写入 `public`、`dist`、Android assets 或 APK。本轮已将此前误落在 public 的 125 张 JPEG（38,740,082 bytes）完整迁移到该可恢复缓存；发布清单为 0，且 public、dist、Android assets 与 APK 中的页图均为 0。要发布任何教材页位图，必须先登记到 `src/data/published-citation-source-page-assets.json`，并同时满足受 Git 跟踪与 SHA-256 校验；空清单要求发布目录没有任何支持格式的页图。`demo:assets` 会复制正式配图与缩略图、按已核验的 PDF 页范围映射 demo 章节，并把对应资产写入课程和课程讲解块。复制出的二进制图片只保留在本机并由 Git 忽略；生成的资产清单继续版本化，方便核验来源和数量。

内容重建需要本机 PDF 路径和 MinerU 环境，详见 [docs/CONTENT_PROVENANCE.md](./docs/CONTENT_PROVENANCE.md)。视觉素材来源见 [docs/ASSET_PROVENANCE.md](./docs/ASSET_PROVENANCE.md)，源仓库基线见 [docs/SOURCE_BASELINE.md](./docs/SOURCE_BASELINE.md)。

## 已确认的输入

- 源前端：`D:\code\study_app\frontend`
- 技术栈：React、TypeScript、Vite、Vitest、Playwright
- 示范教材：`C:\Users\asd25\Desktop\示范文件\人教版高中生物必修2遗传与进化 (人民教育出版社, 课程教材研究所, 生物课程教材研究开发中心.pdf`
- 教材状态：125 页、约 38.8 MB、未加密、扫描型 PDF，需要 OCR

## 仓库原则

- 默认运行时不依赖真实后端、账号、网络或在线 AI；只有开发者在 gitignored 的 `.env.local` 设置短期个人 Key 时，课程内问答才会直连 DeepSeek。
- PDF 只在构建内容时作为本地输入，不提交原始教材到 Git。
- 演示数据、解析进度、交互路径和动画节奏均可复现；上传时间和聊天消息 ID 仅用于 UI 展示，不作为课程结果的一部分。
- 不改动源仓库；迁移只读取经确认的源文件快照。
