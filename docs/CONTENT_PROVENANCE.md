# 课程内容来源与 MinerU 管线

课程内容生成必须使用本地 MinerU，不在浏览器运行时执行 OCR。

## 命令顺序

```powershell
$env:DEMO_PDF_PATH = "C:\path\to\approved-textbook.pdf"
npm run demo:mineru
npm run demo:content
npm run demo:validate
```

`demo:mineru` 调用 `.venv-mineru\Scripts\python.exe -m magic_pdf.tools.cli`，使用中文 OCR 模式，把原始结果写入 `.cache\mineru\<pdf_sha256>\runs\<run_id>\`。每次扫描使用全新的 run 目录，成功后以原子方式更新 `.cache\mineru\latest.json`，不会把上一次运行的 JPG 或 JSON 混入本次 manifest；manifest 还记录 `run_id` 和 ingestion 脚本 SHA-256。原 PDF 不会被复制到仓库。

本轮实际输入的 SHA-256 为 `d35ca6844f22e87bef5cd3deb286c7965f386ba13924a8195eddaefa41db533a`；运行时为 `magic-pdf 1.3.12`，命令参数为 `-m ocr -l ch`，manifest 记录 125 页、原始输出文件清单及每个文件的 SHA-256。扫描预检使用 PyMuPDF `get_text("text")`，结果为 0 个文本字符、0 个有文本层页面，因此明确进入 OCR。版面模型和 OCR 权重来自本机 MinerU 模型缓存；manifest 同时记录模型文件 SHA-256。当前安装运行时没有暴露上游模型仓库 commit，因此 `model_repository.revision` 明确记录为 `null`，不能把未验证的版本号写成事实。

`demo:content` 会实际读取 MinerU 的 manifest、Markdown、middle JSON 和 content list，按 `page_idx` 建立 PDF 页与教材印刷页映射，从 content list 条目重建 P0 chunks，并从 middle JSON 保留页面结构块哈希。人工策划的闪卡、题目、学习计划和导航基线位于独立的 `src/data/seed/curated-content.json`；它不是 generated 输出的输入，生成后的 fixtures 只写入 `src/data/generated/`，因此删除 generated 文件后仍可从独立策划输入和最新 MinerU manifest 重建。

脚本还会实际读取本次 manifest 指向的 Markdown 和 content list，并要求其中出现“减数分裂”“同源染色体”“姐妹染色单体”“受精作用”四个 P0 术语；校验结果写入 fixtures 的 `provenance.grounding`。每条课程引用都会保存原始 OCR 文本、PDF 页、教材印刷页、content list 条目索引/哈希和 middle block 哈希，校验器会逐条确认引用文本存在于对应 MinerU 页面。

本轮 P0 页码关系为：章节标题 PDF 第 11 页 / 教材第 16 页；同源染色体与姐妹染色单体正文 PDF 第 13 页 / 教材第 18 页；受精作用正文 PDF 第 19 页 / 教材第 24 页。`page_idx 10` 的教材第 16 页由 `middle.json` 页脚候选和既有页图页脚共同复核；如果后续 MinerU 版本出现页脚 OCR 冲突，冲突会保存在 `provenance.printed_page_mapping`，不会静默覆盖。

## 版权和审阅

- 原始 PDF、完整 MinerU 输出和中间缓存均不提交 Git。
- 固定 fixtures 只保留 P0 宣传故事需要的内容和最短必要引用。
- 第 2 章第 1 节是本轮核心范围，必须人工抽查页码、章节标题、同源染色体/姐妹染色单体的表述。
- fixtures 生成后先运行 `npm run demo:validate`，再交给 `sol high` 做代码、流程和内容引用审核。
