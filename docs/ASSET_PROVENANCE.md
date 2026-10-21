# 教材视觉资产 provenance

## AI 助手状态图标

`public/assets/brand/ai-assistant/` 为用户确认后的云朵贴纸风透明 PNG，均由 Codex 内置 ImageGen 生成。状态盘点与完整提示词保存在 `docs/design/ip-exploration/ai-chat-states-preview-v1/`，头像提示词位于 `docs/design/ip-exploration/ai-chat-icon-preview-v1/generation-prompt.txt`。

| 文件 | 运行时使用 |
| --- | --- |
| `idle-right-v1.png` / `idle-left-v1.png` | 全局与章节入口右侧 / 左侧静止 |
| `pressed-v1.png` | 按下反馈，左侧通过 CSS 镜像 |
| `dragging-v1.png` | 拖动状态及弹窗展开 / 收起过渡，左侧拖动通过 CSS 镜像 |
| `avatar-v1.png` | 弹窗题头（44px）、等待与正常 AI 回复头像（32px） |

两处入口共用 `src/components/aiAssistantArtwork.ts` 的状态映射；用户消息头像保持现有样式。实际接入截图总览保存在 `docs/design/ip-exploration/ai-chat-integrated-v1/`；交互回归位于 `e2e/lesson-ai-chat.spec.ts`，覆盖状态素材、拖动吸附、对话操作及跨底部标签页保留位置。

## 云朵缺省状态插画

`public/assets/brand/empty-states/` 下的四张透明 PNG 由 Codex 内置 ImageGen 生成并抠图，沿用用户确认的蓝色云朵贴纸风与浅蓝色椭圆阴影。白底原图及完整提示词保存在 `docs/design/ip-exploration/empty-states-v1/`。

| 文件 | 接入场景 |
| --- | --- |
| `no-courses-v1.png` | 学习页尚无课程 |
| `no-notes-v1.png` | 我的笔记列表为空 |
| `no-results-v1.png` | 发现页搜索或分类没有匹配书籍 |
| `connection-error-v1.png` | 首页首次课程列表加载失败且无可展示课程 |

共享组件为 `src/components/EmptyStateIllustration.tsx`，实际显示尺寸在 `src/styles/empty-states.css` 中设为已确认预览尺寸的 90%。图片仅为装饰，状态与操作由相邻文字表达。实际接入后的三种视口截图总览保存在 `docs/design/ip-exploration/integrated-v1/`。

同风格的正面、侧面和背面形象探索图为 `docs/design/ip-exploration/cloud-sticker-three-views-v1.png`；提示词保存在同名 `.prompt.txt` 文件中，该图不作为运行时资源。

`public/assets/textbook/` 中的 WebP 不是本轮 MinerU 运行直接导出的文件，而是从源前端迁移的既有视觉基线。它们用于保持 Demo 的页面观感；课程正文和引用不把这些图片当作 OCR 证据，正文证据统一来自 `.cache/mineru` 中的 `content_list.json` / `middle.json`。

| 资产 | 来源 | MinerU 直接导出 | 课程页映射 | 授权状态 |
| --- | --- | ---: | --- | --- |
| `biology-cover-thumb.webp` | 源前端既有视觉基线 | 否 | 无 | 仅内部 Demo，公开发布前核验 |
| `biology-cover.webp` | 源前端既有视觉基线 | 否 | 无 | 仅内部 Demo，公开发布前核验 |
| `biology-catalog-1.webp` | 源前端既有视觉基线 | 否 | 无 | 仅内部 Demo，公开发布前核验 |
| `biology-catalog-2.webp` | 源前端既有视觉基线 | 否 | 无 | 仅内部 Demo，公开发布前核验 |
| `biology-chapter-2-open.webp` | 源前端既有视觉基线 | 否 | 第 2 章导航图 | 仅内部 Demo，公开发布前核验 |
| `biology-chapter-3-open.webp` | 源前端既有视觉基线 | 否 | 第 3 章导航图 | 仅内部 Demo，公开发布前核验 |
| `biology-chapter-section-open.webp` | 源前端既有视觉基线 | 否 | 章节导航图 | 仅内部 Demo，公开发布前核验 |
| `biology-illustration-cell-division.webp` | 源前端既有视觉基线 | 否 | 本地辅助示意图 | 仅内部 Demo，公开发布前核验 |
| `biology-lesson-meiosis-1.webp` | 源前端既有视觉基线 | 否 | PDF 第 11 页 / 教材第 16 页（人工抽查页脚） | 仅内部 Demo，公开发布前核验 |
| `biology-lesson-meiosis-2.webp` | 源前端既有视觉基线 | 否 | PDF 第 12 页 / 教材第 17 页（人工抽查页脚） | 仅内部 Demo，公开发布前核验 |

P0 课程的 `demo-state.json` 仍在每个 asset 记录 `source_origin`、`mineru_extracted`、`source_page_pdf`、`source_page_printed`、`authorization_status` 和 `provenance_note`。如果后续需要公开发布或把图片称为“从 PDF 抽取”，必须重新从已授权 PDF 通过 MinerU/图像导出管线生成，并更新此清单、哈希和授权证明。

## 社区课程封面

下列素材由 Codex 内置 ImageGen 为本地社区页 Demo 生成，不是教材扫描件、出版社封面、源前端迁移资产或 MinerU 抽取图。完整提示词记录在 [`design/community-book-covers-v1.prompt.md`](design/community-book-covers-v1.prompt.md)。

| 资产 | 来源与类型 | ImageGen 模式 | 社区书籍映射 | 授权状态 |
| --- | --- | --- | --- | --- |
| `community/functions-derivatives-cover-v1.webp` | 本次 AI 生成的原创 Demo 封面，经 768 × 1024 WebP 优化 | Codex 内置 ImageGen，非 CLI | 数学｜《函数与导数》 | 仅内部 Demo，公开发布前核验 |
| `community/force-motion-cover-v1.webp` | 本次 AI 生成的原创 Demo 封面，经 768 × 1024 WebP 优化 | Codex 内置 ImageGen，非 CLI | 物理｜《力与运动》 | 仅内部 Demo，公开发布前核验 |

### 本地 PDF 教材封面

下列社区封面来自用户提供的 `C:\Users\asd25\Desktop\示范文件` 中对应 PDF 首页。处理流程为 Poppler 渲染第一页、裁切正封面（英语为印刷展开稿）并统一优化为 768 × 1024 WebP；没有使用 ImageGen，也没有修改源 PDF。

| 资产 | 本地 PDF 来源 | 处理 | 社区书籍映射 | 授权状态 |
| --- | --- | --- | --- | --- |
| `community/higher-mathematics-vol1-7e-cover.webp` | 《高等数学·上册 第七版》PDF 第 1 页 | 居中裁切、WebP 优化 | 数学｜《高等数学·上册》 | 用户提供，仅内部 Demo，公开发布前核验 |
| `community/high-school-math-required-2-cover.webp` | 《高中数学必修第二册》PDF 第 1 页 | 居中裁切、WebP 优化 | 数学｜《数学必修第二册》 | 用户提供，仅内部 Demo，公开发布前核验 |
| `community/theoretical-mechanics-1-8e-cover.webp` | 《理论力学 I（第 8 版）》PDF 第 1 页 | 居中裁切、WebP 优化 | 物理｜《理论力学 I》 | 用户提供，仅内部 Demo，公开发布前核验 |
| `community/high-school-physics-required-3-cover.webp` | 《物理 必修第三册》PDF 第 1 页 | 居中裁切、WebP 优化 | 物理｜《物理必修第三册》 | 用户提供，仅内部 Demo，公开发布前核验 |
| `community/high-school-english-required-3-cover.webp` | 《英语 必修第三册》PDF 第 1 页印刷展开稿 | 裁取右侧正封面、WebP 优化 | 英语｜《英语必修第三册》 | 用户提供，仅内部 Demo，公开发布前核验 |
| `community/high-school-chemistry-required-2-cover.webp` | 《化学 必修第二册》PDF 第 1 页 | 居中裁切、WebP 优化 | 化学｜《化学必修第二册》 | 用户提供，仅内部 Demo，公开发布前核验 |
