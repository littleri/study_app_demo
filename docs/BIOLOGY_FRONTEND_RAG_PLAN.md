# 生物教材前端完整 RAG 方案（方案二）

## 目标、边界与与方案一的关系

本方案将指定的《人教版高中生物必修 2：遗传与进化》离线构建为随前端静态发布的完整教材检索库。浏览器运行时不解析整本 PDF，不依赖业务后端、远程向量数据库或远程模型；它在 Web Worker 内加载版本化索引，返回带真实教材页码和 PDF 页码的有限片段。

方案二与方案一职责不同，二者必须同时保留：

- 方案一见 [AI_ASSISTANT_RAG_ROUTING_PLAN.md](./AI_ASSISTANT_RAG_ROUTING_PLAN.md)。它先判断闲聊还是需要教材证据的问题，并负责 DeepSeek Tool Call 两阶段协议、上下文注入边界和最终回答。
- 方案二见本文。它提供完整教材语料、页码映射、BM25、语义向量、浏览器 Worker、质量报告和降级路径。只有方案一路由到 search_textbook 时才调用 TextbookRetriever。

学生界面仅在有可靠证据时显示“来源于教材第 N 页”和“查看该页”。它不暴露模型名、Demo RAG、向量、BM25、阈值、Tool Call 或内部检索决策。

当前语料边界必须如实披露：

- 源 PDF 为 125 页扫描文件，大小 38,847,801 bytes，SHA-256 为 d35ca6844f22e87bef5cd3deb286c7965f386ba13924a8195eddaefa41db533a。
- 同批 MinerU 原始导出同样是固定可信输入：content_list SHA-256 为 3f448ccbf6e3be4bf73768604d4973caf070320ed930a94d78e5bebd2314e55d，middle.json SHA-256 为 4137d7d7e993b551dbb08acbaae5e8ba55d06be2af87438389ef66cbc413245f。源校验器和构建器在解析 JSON 前同时核验这三个哈希；即使页数和 JSON 结构仍然正确，任一内容篡改也会 fail-closed。
- 目录后源 PDF 直接进入第 2 章，缺少第 1 章正文。构建器不会从互联网、其他版次或其他教材补齐；manifest 中以 missing_chapter_one_body=true 显式记录。
- PDF 第 1–9 页不是第 1 章正文，而是唯一的顶层 `frontmatter` 节点：`教材封面、前言与目录`。实际可用教材章节为第 2–7 章，共 6 章；seed、generated directory、manifest、build-report 和所有覆盖这些页的 chunks 都必须使用这一相同语义，不能用页码或连续编号猜成“第 1 章 遗传因子的发现”。
- PDF 第 6 页在 MinerU content_list 中有记录但无可用文本。构建器只从同批 middle.json 的 preproc_blocks 恢复目录文本，并标为 recovered_from_middle_preproc，绝不静默漏页。
- 原始 PDF、MinerU 原始缓存、模型下载缓存、APK、local.properties 和任何 Key 均不可提交。可发布的只有经校验的静态派生产物。

## 已实现的数据流

~~~text
离线：PDF + 已校验 MinerU content_list / middle
                  |
  OCR 清洗、页码恢复、章节映射、语义段落切块
                  |
   chunks + page-map + BM25 + 512 维 Float32 vectors
                  |
      50 条评测集自动校准阈值，写入 manifest/reports
                  |
                  v
 public/rag/biology-required-2-rag-v1/ + 固定本地模型/WASM

运行时：方案一路由层 --仅 Tool Call--> TextbookRetriever
                                            |
                                    单一、懒加载 Web Worker
                                            |
                         BGE 语义召回 + BM25 + 章节轻量先验
                                            |
                         Top-5 去重 -> 可靠阈值 -> Top-3 注入
                                            |
                              实际注入 chunk 的本地 metadata -> citation
~~~

Worker 的模型加载只允许同源静态资源：

~~~ts
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/rag/models/";
pipeline("feature-extraction", "Xenova/bge-small-zh-v1.5", {
  revision: "75c43b069aac4d136ba6bc1122f995fedcfd2781",
  dtype: "int8",
  local_files_only: true
});
~~~

模型、索引或 WASM 缺失时只能退化到本地 BM25 或无教材回答；不得下载 Hugging Face 模型、调用远程检索服务或伪造教材页码。

## 离线构建流程

构建入口为 npm run rag:build。它先运行 scripts/prepare-rag-model.mjs，再运行 scripts/build-biology-rag.mjs。

1. 固定输入和来源校验

   scripts/validate-biology-rag-source.mjs 与 scripts/build-biology-rag.mjs 都先校验 PDF、content_list 和 middle.json 的固定可信 SHA-256，再校验 PDF 125 页、content_list 的 2,013 条记录和 middle.json 的 125 页。路径存在但内容不匹配、页数不匹配或缺少第 6 页恢复材料均直接失败，不会用“结构相同”的篡改 OCR 导出继续构建。

2. 按页提取、OCR 清洗和恢复

   每段保留 MinerU 内容记录索引、原 OCR 文本哈希和 PDF 页。清洗统一 Unicode、空白和换行并移除重复的页眉页脚式噪声，不重新猜测页码。第 6 页恢复文本也有独立来源哈希。

3. 章节与页映射

   每页保存 pdf_page，正文页保存教材印刷页。封面、前言、目录、空白和异常页不丢弃，而是在 page-map 中以内容类型和 OCR 状态显式标注。PDF 第 1–9 页映射到 `frontmatter`，标题固定为“教材封面、前言与目录”；当前构建 125/125 页可追溯，no_text_documented_pages 为空。

4. 语义段落切块

   切块不跨章节或小节，目标 320–700 个中文字符，约 80 字重叠，且最多跨两个连续 PDF 页。每块保存稳定 chunk_id、章节/标题路径、教材页、PDF 页、原文、关键概念、vector_position 和完整源记录。

   因隔离小节或页边界无法达到 320 字的块可保留，但必须标 chunking_exception。当前有 12 个透明例外，最短 148 字，最大块为 700 字；它们均列入 build-report，不能作为静默漏切。

5. 关键词和语义索引

   - BM25 使用固定中文单字/二元词与拉丁词 tokenizer，索引标题、关键概念与正文。
   - 语义模型固定为 Xenova/bge-small-zh-v1.5，revision 75c43b069aac4d136ba6bc1122f995fedcfd2781。
   - ONNX int8 文件的 SHA-256 固定为 b9837c19ce154ff0726d398ee77abbc03a7faf0476c6f93016c84e531be7ebb5。
   - 使用 CLS pooling、L2 normalisation、查询前缀“为这个句子生成表示以用于检索相关文章：”，生成固定 512 维 Float32 向量。

6. 构建报告与静态校验

   build-report 与 evaluation-report 都回填 PDF、content_list、middle 的固定可信哈希；npm run rag:validate 交叉检查它们与 manifest/常量一致，再检查 schema、artifact 哈希、向量长度、125 页覆盖、前置页语义、评测门槛、临时文件和 65 MiB 发布预算。若 `missing_chapter_one_body=true`，seed/generated directory 只能有一个覆盖 PDF 第 1–9 页的顶层节点，且必须是 `frontmatter` / “教材封面、前言与目录”；覆盖这些页的 corpus chunk、manifest 和 build-report descriptor 任一漂移都会 fail-closed。阈值同样 fail-closed：`manifest.retrieval.high_confidence_threshold`、`minimum_evidence_threshold`、`lexical_fallback_threshold` 必须逐项等于 `evaluation-report.selected_thresholds`，且等于 `manifest.retrieval.calibration.selected_thresholds`；calibration 的 report SHA-256 必须承诺相同的 `evaluation_report` artifact。事后把 58.6248 改回 1.2288、修改 hybrid 阈值或改写 evaluation report 都会被一致性/文件哈希检查拒绝。这样发布校验虽不需要保留原 PDF，也不会接受来源链路、目录边界或校准结果被替换的报告。

## 发布目录、版本和实际体积

当前 corpus version 是 biology-required-2-rag-v1，schema version 是 1。

~~~text
public/rag/
├─ biology-required-2-rag-v1/
│  ├─ manifest.json          版本、输入/模型哈希、阈值、artifact 清单
│  ├─ chunks.json            原文、稳定 ID、章节和页码
│  ├─ bm25.json              关键词倒排索引
│  ├─ vectors.f32            171 × 512 × Float32
│  ├─ page-map.json          125 页 OCR/印刷页/恢复状态/哈希
│  ├─ evaluation-set.json    固定 50 条评测问题
│  ├─ evaluation-report.json 指标和阈值扫描
│  └─ build-report.json      覆盖、切块、重复率、体积
├─ models/Xenova/bge-small-zh-v1.5/
│  ├─ tokenizer/config/vocab/onnx/model_int8.onnx
│  └─ model-manifest.json
└─ runtime/wasm/
   ├─ ort-wasm-simd-threaded.jsep.mjs
   └─ ort-wasm-simd-threaded.jsep.wasm
~~~

| 项目 | 当前值 |
| --- | ---: |
| PDF 覆盖 | 125 / 125 页 |
| MinerU 内容记录 | 2,013 |
| 恢复页 | PDF 第 6 页 |
| chunks | 171 |
| 可检索文本 | 83,946 字符 |
| vectors.f32 | 350,208 bytes |
| chunks/BM25/页映射等索引 artifact | 7,872,946 bytes |
| 重复 chunk 比率 | 0 |
| 全部静态 RAG（模型、WASM、索引） | 54,112,227 bytes |

manifest 是唯一运行时入口。不得绕过它硬编码文件名。教材、OCR、切块、tokenizer、模型或源 PDF 变化时必须重新构建、重新评测、重新校验，并升级 corpus version 或 schema version。

## 数据契约

契约位于 src/rag/types.ts，以下名称保持稳定，供方案一路由和前端功能调用。

~~~ts
type RagManifest = {
  schema_version: number;
  corpus_version: string;
  book_id: string;
  source: {
    sha256: string;
    pdf_page_count: number;
    missing_chapter_one_body: boolean;
    content_scope: string;
    frontmatter: {
      chapter_id: "frontmatter";
      title: "教材封面、前言与目录";
      pdf_page_start: 1;
      pdf_page_end: 9;
    };
  };
  mineru?: {
    content_list_sha256: string;  // 固定可信 OCR 导出
    middle_sha256: string;
    content_list_entries: number;
    page_count: number;
  };
  embeddings: {
    model_id: string;
    revision: string;
    model_int8_sha256: string;
    dimension: 512;
    pooling: "cls";
    normalize: true;
    query_prefix: string;
    provider: "wasm";
    wasm_threads: 1;
  };
  retrieval: {
    algorithm_version: string;
    weights: { semantic: number; bm25: number; chapterPrior: number };
    high_confidence_threshold: number;
    minimum_evidence_threshold: number;
    lexical_fallback_threshold: number;
    calibration: {
      report_path: string;
      report_sha256: string;
      selected_thresholds: {
        high_confidence: number;
        minimum_evidence: number;
        lexical_fallback: number;
      };
    } | null;
  };
  artifacts: Record<string, { path: string; bytes: number; sha256: string }>;
};

type RagChunk = {
  chunk_id: string;
  book_id: string;
  chapter_id: string;
  section_id: string;
  title_path: string[];
  page_start: number;              // PDF 页
  page_end: number;
  printed_page_start: number | null;
  text: string;                    // 受控原文
  source_metadata: { pdf_pages: number[]; printed_pages: number[] };
  vector_position: number;
};

type RagSearchRequest = {
  query: string;
  chapterId?: string | null;       // 只作先验，绝非硬过滤
  limit?: number;                  // 最大 5
  reliableOnly?: boolean;
};

type RagSearchResult = {
  status: "idle" | "loading" | "ready" | "lexical_fallback" | "unavailable";
  method: "on-device-hybrid-rag" | "on-device-bm25-fallback" | "unavailable";
  corpus_version: string | null;
  high_confidence_threshold: number | null;
  minimum_evidence_threshold: number | null;
  hits: Array<{
    chunk: RagChunk;
    score: number;
    semantic_score: number | null;
    bm25_score: number;
    chapter_prior: number;
    reliable: boolean;
  }>;
};

type RagCitation = {
  chunk_id: string;
  chapter_id: string;
  pdf_page: number;
  textbook_page: number | null;
  quote: string;
};
~~~

最终 RagCitation 只从实际命中、实际注入的 RagChunk 本地生成。模型文本中的页码不参与 citation 生成；阅读器只根据 citation 的真实 PDF 页跳转。

## 浏览器检索、性能与缓存

TextbookRetriever 持有一个懒创建模块 Worker。闲聊和未触发方案一 Tool Call 时不会下载完整索引或启动模型。Worker 会校验 manifest 的版本、模型 revision、512 维、125 页覆盖和单线程约束，再并行加载 chunks、BM25 与 vectors.f32。缓存不完整时用 cache reload 重试一次。

ONNX Runtime 使用一个 Worker 和一个 WASM 线程。JSEP mjs 被同源读取后转换为 Worker Blob URL，配对 wasm 使用稳定的同源 URL；这样既不访问网络，也规避 Vite 开发服务器把动态 public mjs 误当源码 import 的问题。浏览器 Cache Storage 可缓存这些静态资源。

模型初始化不会令聊天永久 loading：

- 每个 Worker 请求有 1.8 秒软时限；超时立即由主线程同源 BM25 回退。
- Worker 可以在后台继续一次本地预热；15 秒仍无响应则终止 Worker、清理所有 pending 请求。
- 主线程索引加载也有 4 秒受控时限。

所有 chunks 都可参与召回；当前章节仅是 0.05 权重的一部分，不能硬过滤跨章节结果。

~~~text
hybrid score =
  0.75 × cosine(query vector, chunk vector)
+ 0.20 × normalised BM25(query, chunk)
+ 0.05 × same current chapter prior
~~~

先取最多 Top-5 去重候选，方案一路由最多注入 Top-3。语义模型不可用时使用独立、经正负例校准的 BM25 原始分数阈值，响应显式标记为 on-device-bm25-fallback。即使语义 Worker 正常，若保守 hybrid 阈值没有任何可靠命中，主线程也可以使用相同的独立 BM25 阈值做一次“词法证据救援”；这不降低 hybrid 阈值，且 BM25 仍无可靠命中时维持无 citation。词法阈值绝不从正例分数任意缩放，也不靠问候词黑名单：它以 BM25 top-1 的正例正确性、16 条非教材负例、精确率和误引率扫描得到。

## 阈值校准与评测

scripts/evaluate-biology-rag.mjs 在固定 50 条集合上扫描候选阈值，并将选择结果写回 manifest。

| 阈值或指标 | 当前结果 |
| --- | ---: |
| high_confidence_threshold | 0.6037 |
| minimum_evidence_threshold | 0.6037 |
| BM25 fallback threshold | 58.6248 |
| Recall@5 | 1.0000 |
| Top-3 章节或页码命中率 | 0.9706 |
| 已接受 citation 精确率 | 0.9524 |
| 假 citation 率 | 0 |
| 高阈值下已接受正例召回 | 0.5882 |

BM25-only 降级另有独立验收，不复用 hybrid 分数：50 条集中只有 3 条能在词法 top-1 上安全通过，词法可引用精确率为 1.0000、非教材假 citation 率为 0、已接受正例召回为 0.0882。这个召回偏低是有意的安全边界：中文单字/二元词 BM25 会让闲聊与通用学习问题产生非零共现分数，因此在 Worker 失败或 hybrid 空命中时宁可不引用教材，也不能把弱词法重叠伪造成教材证据。语义 Worker 可用时仍由 hybrid 指标决定正常召回。

发布门槛是 Recall@5 不低于 85%、Top-3 章节/页不低于 85%、可引用精确率不低于 95%、假引用率不高于 5%。0.5882 的已接受正例召回必须如实记录：当前阈值刻意保守，会拒绝一部分可回答问题以避免弱证据引用。若需提高它，必须扩充和人工审查评测集后重新校准，不能直接降低阈值。

## 与 LLM、引用和来源面板的衔接

方案一的第一阶段请求仅带系统规则、清理后的历史、用户问题和 search_textbook Tool 定义，tool_choice 为 auto，绝不能预先塞入教材正文。

当且仅当模型调用 Tool：

1. 路由层调用 TextbookRetriever.search 并要求 reliableOnly。
2. 达到可靠阈值时构造最多 3 条受控 sources；低于阈值则 Tool 结果为“无可靠教材命中”，不注入正文、不创建 citation。
3. 第二阶段保留原 assistant.tool_calls，并按每个 tool_call_id 追加 role=tool 结果。
4. citations 与 related_assets 仅来自实际注入 chunk 的并集，绝不接受模型生成的页码。

来源图片必须同样真实：只有 source_type 为 extracted、source_chunk_ids 精确包含 citation chunk_id、具有 source_page_image_url，并且该 URL 位于 `src/data/published-citation-source-page-assets.json` 的 tracked + SHA-256 发布清单中的资产才可作为教材原页。ai_generated、裁剪 image_url、示意图、固定 fallback 图和未提交的 MinerU 页图均不得冒充教材页面。当前清单为空，因此无图来源路径是默认：来源面板仍显示真实页码、可选择摘录和做笔记；“查看该页”打开同一 citation chunk 的内置本地原文片段，而不是请求 `/assets/textbook/pages/*`。该内置原文视图在 citation 有 sourceText 时优先显示 citation 自带的实际 `chapter_title`；PDF 第 1–9 页的受控 title 是实际发布 descriptor “教材封面、前言与目录”，而非靠页码猜测第 1 章。`rag:validate:source-assets` 与 `rag:validate` 双向验证未来页图：每个清单项都必须存在、被 Git 跟踪并匹配 SHA-256；`public/assets/textbook/pages` 中每个支持格式的文件也都必须已登记。`npm run build` 在 Vite 复制前校验 `public`、复制后校验 `dist`，`android:sync` 还会校验 Android 的复制目标，因此空清单要求 public、dist、Android assets 和 APK 都没有任何此类页图，防止 clean clone/APK 中出现 404。原始页扫描若需要本机保留，只能位于 gitignored 的 `.cache/unpublished-textbook-pages`，不能由 demo 刷新流程写回 public。

## 失败与降级

| 场景 | 行为 | 是否生成教材 citation |
| --- | --- | --- |
| manifest/chunks/vectors 缺失或损坏 | Worker reload 一次；仍失败为 unavailable | 否 |
| Worker 不可创建、error、messageerror 或 postMessage 失败 | 清理/终止后主线程 BM25 回退 | 仅可靠 BM25 |
| 本地语义模型或 WASM 不可用 | 保持本地 BM25，不连接远程模型 | 仅可靠 BM25 |
| hybrid 没有可靠结果但 BM25 有直接强证据 | 用独立 BM25 阈值一次性救援，不放宽 hybrid 阈值 | 仅可靠 BM25 |
| Worker 超过软时限 | 及时 BM25 回退，后台预热有界 | 仅可靠 BM25 |
| 弱网或静态资产超过 4 秒 | unavailable 或无教材回答 | 否 |
| 相关性不足、闲聊、无关问题 | 普通回答或说明无可靠依据 | 否 |
| 缓存损坏 | reload 一次后无教材回答 | 否 |
| 教材页没有合格发布页面图 | 打开同一 citation chunk 的内置原文片段，保留真实教材/PDF 页码 | 不添加无关图片 |
| 移动端低内存 / Worker 被禁 | 轻量 BM25；索引也不可用则无教材回答 | 仅可靠 BM25 |

“你好”“嗨”“早上好”等是非教材路径，不应因默认章节上下文而强制命中教材。

## 安全、版本、包体与版权

- 静态索引、模型、报告和页映射不得含 Key、令牌、绝对本机密钥路径或用户数据。
- VITE_DEEPSEEK_API_KEY 仅可来自 gitignored 的 .env.local。它会进入前端构建，故仅适合个人短期调试、不可分发；服务端代理是多人生产使用的另一个问题。
- manifest schema/version、源 PDF/MinerU/model/artifact/runtime 的 SHA-256 一起形成可复现边界；evaluation artifact 的哈希和三方阈值承诺也属于该边界。内容、模型或阈值校准变化时必须重建、重新评测、重新校验，旧 vectors 或旧报告不得与新 chunks 混用。
- 当前静态 RAG 约 51.60 MiB。按需懒加载和缓存降低首屏影响，但不能消除下载、安装包体积和低端设备内存风险。
- 技术上可构建不等于获得公开再分发授权。教材文本、索引和页面资源仍受版权、授权和地区发行限制，发布前须确认权利范围。

## 实施状态、测试和发布验收

| 阶段 | 状态 | 交付物 |
| --- | --- | --- |
| 教材解析与质量报告 | 已完成 | 页恢复、125 页 page-map、build report |
| 索引构建 | 已完成 | chunks、BM25、512D vectors、manifest |
| 前端 Worker | 已完成 | textbookRag.worker.ts、TextbookRetriever |
| 对话接入 | 已完成 | DeepSeekRag、DemoRepository 的按需接入 |
| 教材页跳转与来源真实性 | 已完成 | citation 页码、内置无图原文视图、发布页图 tracked/hash 守卫 |
| 性能与降级 | 已完成 | Worker/索引时限、BM25 回退、缓存重试 |
| 发布验证 | 自动化已完成 | scoped lint、完整 Vitest、build、E2E、Android sync/APK 检查 |

已纳入命令：

~~~powershell
npm run rag:validate:source
npm run rag:build
npm run rag:evaluate
npm run rag:validate:source-assets
npm run rag:validate
npm run demo:validate
npm run demo:directory
npm exec vitest run src/rag/retrievalMath.test.ts src/services/TextbookRetriever.test.ts src/services/DeepSeekRag.test.ts scripts/rag-common.test.ts scripts/citation-source-assets.test.ts src/screens/sheets/citationSource.test.ts
npm run build
playwright test e2e/lesson-ai-chat.spec.ts
~~~

已确认的结果：

- 源校验通过，PDF 和 MinerU 都为 125 页，第 6 页恢复状态已记录。
- rag:validate 与 rag:validate:source-assets 通过：171 chunks、125 页、54,112,227 bytes、hybrid 阈值 0.6037、BM25 降级阈值 58.6248；当前受发布清单认可的 citation 页图为 0 个，故所有 citation 使用可用的内置原文片段路径。本轮将 public 下遗留的 125 张 JPEG / 38,740,082 bytes 安全移动到可恢复、gitignored 的 `.cache/unpublished-textbook-pages`；清单为空时 public、dist、Android assets 和 APK 页图均为 0。新增双向 validator 回归覆盖未登记页图、空清单目录与已登记 tracked/hash 一致的 build-copy 情形。
- 50 条 hybrid 评测达到发布门槛；独立 BM25 降级扫描也达到 1.0000 精确率、0 假 citation。固定哈希 helper 的 mutation 单测证明 content_list 或 middle 内容任意变化都会在解析前失败；校准 mutation 单测还证明降低 manifest lexical/hybrid 阈值、修改 evaluator 阈值或改写 evaluation-report 文件都会 fail-closed。另有 frontmatter mutation 回归：在 `missing_chapter_one_body=true` 时，seed、generated directory、corpus chunk 或 build-report 将 PDF 第 1–9 页映射为第 1 章均会失败；真实集成测试直接读取 generated chapters 与公开 PDF 第 1 页 chunk，确认查询“普通高中课程标准实验教科书遗传与进化”的覆盖证据生成标题“教材封面、前言与目录”，同时第 2 章命中仍保留真实章名。
- scoped ESLint 通过；完整 Vitest 为 33 个文件、271 个测试通过，覆盖 Worker 不可创建、永久无响应软/硬超时、error、messageerror、默认浏览器 fetch receiver、BM25 回退/词法救援、索引失效和无可靠命中不伪造 citation；其中“你好”即使有非零 BM25 共现分数，也在 Worker 失败、超时和 hybrid 空命中的三个路径上返回空命中。新增回归还覆盖 manifest/evaluation 阈值篡改、evaluation artifact 重写、未跟踪/哈希错误或未登记的 citation 页资源、清单与 dist copy 的双向页图校验、复合/否定/概念夹带问题、数学/未知书与 biology 的 book/section 隔离、配置 Key 时非 biology 不直连 provider，以及离线回答与 citation quote 的一致性；还以服务端渲染验证前言/目录 citation 使用传入的真实 title 和实际 PDF 位置，并验证抽取摘录会跳过 OCR 问句提示、始终保持原文连续子串。
- DeepSeekRag 单测覆盖 Tool 协议、工具异常和 citation 边界；所有 provider 测试均 mock，未发送真实 DeepSeek 请求。
- Headless Chromium 已用本地模型完成 on-device-hybrid-rag，返回 512 维语义命中；拦截记录中 Hugging Face、CDN 和 DeepSeek 外网请求均为 0。
- lesson-ai-chat E2E 阻断 DeepSeek、Hugging Face、jsDelivr 和未发布的 `/assets/textbook/pages/*`；默认无 Key 的复合/概念夹带问题不产生 citation，可靠本地命中仍显示页码且“查看该页”打开内置原文片段。它还断言噬菌体问题的离线回答含实质教材原文、不会退化为“这一结果说明了什么”式的提问提示，并且跳转后仍显示同一 citation 页码。
- npm run android:sync 和 JBR 21 的 assembleDebug 均成功。APK 位于 android/app/build/outputs/apk/debug/app-debug.apk，大小 111,708,874 bytes，SHA-256 为 cba9310956e1095b8ea708d044b22ec5b868e522f788e61f3d519f4fbc3d2b13；解包后 17/17 个 RAG asset 与 public/rag 哈希全部一致，核心 corpus（manifest、chunks、BM25、vectors、页映射、两份报告、评测集）、模型、tokenizer 和 WASM 均存在。citation 页图发布清单为 0，public、dist、Android assets 与 APK 的 `assets/public/assets/textbook/pages/` 都为 0；最终审计未发现 PDF、`.cache`、local.properties、.env、MinerU 原始 `content_list`/`middle` 或 RAG tmp 条目（正式发布的 `mineru_*.jpg/png` 教材插图不被误判为原始缓存）。

已完成自动化验证；发布前仍需人工保留以下真机证据：

1. 真机手测首开与缓存后二次加载，包括首次模型/索引下载对交互的影响。
2. 真机弱网、禁 Worker 和低内存下确认 BM25 或无教材回答的可见行为。
3. 真机确认跨章节问题、教材页跳转、无图摘录、选择文字和做笔记流程。

## 维护规则

日常先运行 npm run rag:validate 检查已发布静态资产。只有需要重建时才提供本机 PDF 与 MinerU 路径，并运行 source validate、build、evaluate、validate。构建失败时不得用另一版教材、未验证临时文档或网络抓取内容补页。新教材版本必须有新的 corpus version 和独立评测报告，不能覆盖 biology-required-2-rag-v1。
