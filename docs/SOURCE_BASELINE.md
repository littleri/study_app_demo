# 源仓库迁移基线

记录时间：2026-08-02

源仓库：`D:\code\study_app`

源前端：`D:\code\study_app\frontend`

目标仓库：`D:\code\study_app_demo`

## 迁移约束

- 只读取源仓库，不在源仓库写入或整理文件。
- 以批准时的当前工作树作为视觉基线，不假设 Git HEAD 等于当前页面。
- 原始教材 PDF 只作为本地 MinerU 输入，不复制进目标仓库。
- 目标 Demo 运行时不依赖后端、网络、账号或在线 AI。

## 源工作树状态

源分支：`codex/frontend-changes`

开始迁移时源仓库存在未提交修改：

- `.gitignore`
- `frontend/index.html`
- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/src/components/ui.tsx`
- `frontend/src/main.tsx`
- `frontend/src/screens/HomeScreen.tsx`
- `frontend/src/styles/base.css`
- `frontend/src/styles/motion.css`
- `frontend/src/styles/responsive.css`
- `frontend/src/styles/tokens.css`
- `frontend/vite.config.ts`
- 新增 `frontend/public/assets/brand/home-learning-path.webp`
- 审核时另发现未跟踪 `frontend/public/assets/brand/cloud-mascot-turnaround.png`（1,385,108 bytes，SHA-256 `15BF5014D4E1B269555F752BE70A22544B64ABD9E6B023410BDBE7B75171119B`）；本任务未创建、移动或删除该文件，现按源工作树现状保留并纳入基线。
- 新增 `frontend/public/icons/`
- 新增 `frontend/public/manifest.webmanifest`
- 新增 `frontend/public/sw.js`
- 新增 `frontend/src/styles/home.css`

## 关键文件 SHA-256

```text
frontend/package.json: 3A2CD516E03EB8692F85E3D86A86BBC088B4776EC7E55E2A129C2414DBADE082
frontend/package-lock.json: 2F9660FA54FDB06263BF1FE05D3303E497BEE94C3D97510ECFBB9E2D696A0175
frontend/src/App.tsx: FE3CCCB620F6530C60FC8E42FFF7E1A9CC7453861403468B343C81F9982494A9
frontend/src/components/ui.tsx: 24C0EFE4A8903D6CB63E2895E91F12EEE5FC0DA94E933E015675C0063614431C
frontend/src/data/mockBook.ts: FBE49C3ECB53DC28F7FA22BD7CD89B4F6587857A261ECC6E27C97A257F8BEDF2
frontend/src/api/bookcourseApi.ts: D65AA4476B3EEA1D040B174FBC9BC972807D50F30EB1A654A2880B091BDEF084
frontend/src/styles/tokens.css: C1DAB542FE9A1EE912CC8CDF4BC281B3DA9E916350A7399374843034087BE3FE
frontend/src/styles/base.css: 66F4223B7286ECE334028C85FE2612297F2FC5D6B5A4D42D79129E37580190E5
frontend/src/styles/responsive.css: 9A79298E364CEFF03756B6441DC5DA8F25E79D9AA9FE1C5A6042D8DBED3285E3
frontend/src/styles/motion.css: 503BE05D5408B1BF1AAB39313DB22FA341A4AA9D0692FB7544C9BB3FA7129723
```

## 依赖锁定基线

从源 `package-lock.json` 读取的解析版本：

```text
react 19.2.7
react-dom 19.2.7
vite 8.0.16
typescript 6.0.3
@vitejs/plugin-react 6.0.2
lucide-react 1.18.0
vitest 4.1.9
playwright 1.61.0
```
