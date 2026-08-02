# 教材视觉资产 provenance

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
