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

默认是完全离线的演示回答：未配置 Key 时，聊天界面和 Android debug APK 都不会访问网络。简单问候会得到普通聊天回复且不显示教材引用；明确的教材问题仍使用固定演示答案与本地页码。

如需本人短期调试直连，在 gitignored 的 `.env.local` 中创建以下内容后重新执行 `npm run android:sync`：

```text
VITE_DEEPSEEK_API_KEY=your_short_lived_personal_key
```

直连模式采用两阶段调用：第一请求只发送系统规则、有限对话历史、用户问题和 `search_textbook` 工具定义；模型对闲聊可直接回答。只有模型请求教材工具时，前端才在本地片段中全书检索，并在结果达到可靠性阈值后把有限片段作为工具结果回传。教材页码和引用始终由本地元数据生成，不由模型生成。

`VITE_DEEPSEEK_API_KEY` 会在 Vite 构建时进入浏览器或 APK 客户端产物，任何拿到产物的人都可能提取它。因此 BYOK 仅适合本人短期调试：不要提交 `.env.local`、不要分发包含该 Key 的构建，测试结束后立即撤销 Key。面向其他用户的版本必须改为服务端或 Serverless 代理。

从相邻 `study_app` 后端正式包刷新目录、125 张原文页图和全部 MinerU 配图：

```powershell
npm run demo:refresh
```

其中 `demo:assets` 会复制正式配图与缩略图、按已核验的 PDF 页范围映射 demo 章节，并把对应资产写入课程和课程讲解块。复制出的二进制图片只保留在本机并由 Git 忽略；生成的资产清单继续版本化，方便核验来源和数量。

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
