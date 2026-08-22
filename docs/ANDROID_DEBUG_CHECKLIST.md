# Android Debug APK 验收清单

这份清单对应当前的 Capacitor Android 工程。它的目标是先验证真实 WebView 壳、系统输入和设备交互；不代表“上传并解析新教材”已经成为正式功能。

## 第一次在 Android Studio 打开

1. 在 Android Studio 选择 **Open**，打开 `D:\code\study_app_demo\android`，不要打开仓库根目录。
2. 若出现 SDK 缺失提示，在 **SDK Manager** 安装 Android 16 / API 36、Android SDK Build-Tools 和 Android SDK Platform-Tools；项目当前的 `compileSdk` 与 `targetSdk` 都是 36，`minSdk` 是 24。
3. 用 USB 调试或 Android 模拟器选择一台设备，点击 **Run**。首次 Gradle 同步会使用 Android Studio 自带的 JDK 并生成机器本地的 `android/local.properties`。
4. 如需从命令行确认设备，Android Studio 的 Terminal 或普通 PowerShell 中执行 `adb devices`；确认状态为 `device`。

## 离线 APK 验收

保持 gitignored 的 `.env.local` 中未配置 `VITE_DEEPSEEK_API_KEY`，从 Android Studio 运行 debug 版本。依次验证：

- 点击底部导航、课程卡片、抽屉和“问 AI”按钮；所有触摸区域均可用。
- 在聊天输入框输入、收起软键盘，再点击 Android 系统返回键：应依次收起键盘、关闭当前弹层、回退页面，最后才将 App 置于后台。
- 横竖屏切换后，内容不应被 iOS 假状态栏或 Home Indicator 挤占；Android 原生状态栏应显示在 WebView 外。
- 从“上传教材”选择一个 PDF，确认 Android 系统文件选择器可以打开、选择后文件名能显示。当前 Demo 只模拟保存与解析进度，不会把该 PDF 解析成可检索教材。
- 在课程内提问，确认聊天标签显示“离线演示回答”，且飞行模式下依旧可完成该流程。

## 临时 DeepSeek 直连验收

1. 在仓库根目录创建 gitignored 的 `.env.local`，写入 `VITE_DEEPSEEK_API_KEY=你的短期个人Key`；不要把真实值写入源码或 `.env.example`。
2. 运行 `npm run android:sync`，回到 Android Studio 重新运行 App。
3. 在已加载的示例课程中提问，确认闲聊不显示教材引用、教材问题只显示本地检索命中的页码，并确认“查看”能打开对应原页。
4. 断网或撤销 Key 后，确认错误信息清楚；测试结束立即删除 `.env.local` 中的 Key、重新构建，并在 DeepSeek 控制台撤销该短期 Key。

`VITE_DEEPSEEK_API_KEY` 会进入浏览器或 APK 客户端产物，只适合本人短期调试。不要分发包含该 Key 的 APK。

## 每次前端改动后的同步流程

```powershell
cd D:\code\study_app_demo
npm run android:sync
```

然后在 Android Studio 点击 **Run** 或 **Build > Build APK(s)**。若需要命令行打包，确保 Android Studio 的 SDK 与 JDK 已初始化后运行 `npm run android:apk`。
