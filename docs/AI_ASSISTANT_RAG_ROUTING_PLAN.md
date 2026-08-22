# AI 助手按需教材检索路由方案

## 目标与本轮边界

本方案定义课程内 AI 助手如何先区分正常聊天与需要教材证据的学习问题，再决定是否检索本地教材片段。目标是让“你好”“嗨”“早上好”等正常交流得到自然回复，而不是因为用户停留在某一章节就被强行解释为教材问题；同时让真正需要教材依据的回答带有可追溯的本地页码引用。

本轮只实现路由与当前已打包教材片段的轻量本地检索：

- DeepSeek OpenAI-compatible Chat Completions 的官方 Function/Tool Call 消息协议。
- 当前前端已打包 chunks 的全候选关键词排序、可靠性阈值和有限上下文注入。
- 本地生成的引用和关联图片，不接受模型生成的页码。
- 无 Key 时的离线 Demo 问候与既有教材问答回退。

本文不定义 PDF 重建、OCR、切块、BM25、语义向量、Worker、缓存和整本教材覆盖率的构建细节；这些属于独立的“前端完整生物教材 RAG”方案（方案二），见 [BIOLOGY_FRONTEND_RAG_PLAN.md](./BIOLOGY_FRONTEND_RAG_PLAN.md)。方案二现已实现并接入 biology-required-2 的浏览器检索路径：它发布 125 页、171 个 chunks、版本化 BM25/512 维向量和 Web Worker。本路由文档仍只负责“何时调用”和“如何把受控结果回传给 LLM”，不能把路由层本身误表述为完整教材库。

## 设计边界

1. 教材检索不是默认步骤。模型能直接回答的正常聊天、礼貌问候和一般学习交流不应产生教材引用。
2. 当前章节不是筛选条件。所有可用 chunks 都能参与排序；当前章节只得到轻微排序加分，不能遮蔽跨章节的更强命中。
3. 只有实际作为 Tool 结果发送给模型的本地 chunks 才能生成最终 citations 或 related_assets。CitationCard 作为“教材原页”的图片只能取自该次响应中 source_type 为 extracted、source_chunk_ids 包含该 citation.chunk_id、具有 source_page_image_url，且该 URL 位于 `published-citation-source-page-assets.json` 的已跟踪、SHA-256 校验发布清单中的资产；必须使用该 source_page_image_url，不能使用 image_url 裁剪图。
4. 引用页码、教材页、PDF 页、章节标题和片段 ID 一律来自本地元数据，不能信任模型文本。
5. 客户端 BYOK 仅是个人短期调试能力，绝不是可安全分发的生产密钥方案。
6. 最终学生界面不展示模型名、Tool Call、检索评分、Demo RAG 等内部实现词；仅在有可靠来源时显示教材页码和查看入口。

ai_generated 资产、教材裁剪图或示意图均不能被当作“教材原页”。当前发布清单为空：本轮不发布原始教材页位图；125 张、38,740,082 bytes 的本机原始页扫描仅保存在 gitignored 的 `.cache/unpublished-textbook-pages`，因此任何 MinerU 本机路径都不会被选择。当 citation 没有合格的发布页图时，CitationCard 不展示任意固定教材插图；用户点击“查看该页”会打开内置的、由同一 citation chunk 生成的本地教材原文片段视图，保留真实教材/PDF 页码、可选择文字和做笔记入口，且绝不请求可能在 clean clone 中 404 的 `/assets/textbook/pages/*` 路径。发布检查双向验证清单和 `public/assets/textbook/pages`：未登记页图会在 build 前失败，输出到 dist/Android assets 后还会再校验；当前 public、dist、Android assets 与 APK 的页图计数均为 0。

## 两阶段数据流

```text
用户问题 + 最多 8 条清理后的历史
        |
        v
第一阶段：POST /chat/completions
  messages = 系统规则 + 历史 + 用户问题
  tools = [search_textbook]
  tool_choice = auto
  不含任何教材正文
        |
        +-- 普通 assistant content ------------------------+
        |                                                  |
        |                                                  v
        |                                      返回普通回答
        |                                      citations = []
        |                                      related_assets = []
        |
        +-- assistant.tool_calls: search_textbook ---------+
                                                           |
                                                           v
                                          浏览器本地检索所有 chunks
                                          当前章节仅有轻量加分
                                                           |
                             +-----------------------------+----------------------------+
                             |                                                          |
                             v                                                          v
                  最高结果低于可靠阈值                                      命中可靠的有限 Top-K
                  Tool result: 无可靠教材命中                              Tool result: 本地来源片段
                  不注入教材正文、无引用                                  仅注入片段正文与本地页码
                             |                                                          |
                             +-----------------------------+----------------------------+
                                                           |
                                                           v
第二阶段：POST /chat/completions
  追加原 assistant.tool_calls 消息
  追加 role=tool / tool_call_id 消息
  tools = [search_textbook], tool_choice = none
                                                           |
                                                           v
学生可见的最终回答 + 仅来自实际注入 chunks 的本地引用
```

第一阶段绝不能提前附加“当前章节片段”“前三个 chunks”或任何教材正文。这样问候语只需一次请求，且不会因提示词约束而被硬答成生物教材内容。

## Tool 契约

第一阶段提供以下 Function Tool。模型仅在确有必要核验当前教材事实、概念、原文、页码或需要教材依据的题目解析时调用它。

```json
{
  "type": "function",
  "function": {
    "name": "search_textbook",
    "description": "仅在学生需要当前课程教材证据时检索本地教材片段；不得用于问候、闲聊或不需要教材证据的问题。",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "概括待核验教材概念或事实的简洁中文检索词。"
        }
      },
      "required": ["query"],
      "additionalProperties": false
    }
  }
}
```

成功 Tool 结果的内容是 JSON，其中 sources 最多包含 3 条本地片段，每条含 chunk_id、chapter_id、chapter_title、pdf_page、可用的 textbook_page，以及有长度上限的 text。

没有可靠命中、无效 JSON 参数和未知工具都返回结构化的无可靠命中 Tool 结果；结果会明确要求模型不要编造教材页码或出处。无可靠命中不是错误，也不产生 citation。

第二阶段必须保留服务端返回的 assistant tool_calls 消息，并按每一个 tool_call_id 追加 role=tool 消息。这样遵循 Chat Completions 的工具调用关联规则，不把“工具结果”伪装为新的用户消息。

## 检索与阈值策略

当前实现位于 src/services/DeepSeekRag.ts，并导出以下稳定常量：

- LOCAL_TEXTBOOK_RELIABILITY_THRESHOLD = 2.4。
- LOCAL_TEXTBOOK_CONTEXT_LIMIT = 3。
- CURRENT_CHAPTER_BOOST = 0.2（内部常量）。

每个 chunk 都会参与排序。分数由以下轻量信号构成：

- 用户检索词完整包含一个声明的 key_concept：每个概念加 3 分；
- 有效连续词组与片段原文相交：按词组长度提供有限加分；
- 少量字符重合分数；
- 用户提供的完整检索词直接出现在片段中的额外加分；
- chunk 属于当前章节时仅加 0.2 分。

阈值 2.4 使“声明的教材概念命中”可通过，而仅有偶然汉字重合、当前章节加分或闲聊字词通常无法通过。阈值只在 Tool 执行后应用：排序结果可供诊断，但只有达到阈值的结果能进入模型上下文或学生引用。

上述 2.4 规则仅保留为非浏览器 fixture/非 biology 兼容回退。biology-required-2 在浏览器中的 Tool 调用已经优先使用方案二 TextbookRetriever：全书 171 chunks 混合召回、当前章节仅轻量先验、Top-5 去重、Top-3 注入，并使用 manifest 中自动校准的阈值。语义 Worker 失败或 hybrid 空命中时，独立 BM25 阈值也必须通过同一份正负例精确率/误引率校准；没有可靠词法证据时，Tool 结果只能是无可靠命中，不能生成 citation。发布校验会把 manifest 的 hybrid/minimum-evidence/lexical 三个阈值逐项锁定到 evaluation report 与 calibration 报告哈希，事后降低阈值会 fail-closed。完整数据结构、当前阈值和评测指标见 [BIOLOGY_FRONTEND_RAG_PLAN.md](./BIOLOGY_FRONTEND_RAG_PLAN.md)，不能将旧 fixture 分数当作完整教材质量承诺。

## 运行时数据契约

现有前端调用保持以下边界：

```ts
type RagQuery = {
  book_id: string;
  chapter_id?: string | null;
  question: string;
  history?: Array<Record<string, unknown>>;
};

type RagResponse = {
  answer: string;
  citations: Citation[];
  related_assets: ApiAsset[];
  confidence: "low" | "medium" | "high" | string;
};
```

| 路径 | 请求次数 | citations | related_assets | confidence |
| --- | ---: | --- | --- | --- |
| 第一阶段普通回答 | 1 | 空数组 | 空数组 | low |
| Tool 调用且可靠命中 | 2 | 仅本地注入 chunks | 仅 source_chunk_ids 关联到这些 chunks 的资产 | medium 或 high |
| Tool 调用但无可靠命中 | 2 | 空数组 | 空数组 | low |
| 无 Key 的离线问候 | 0 | 空数组 | 空数组 | low |
| 无 Key 的 biology 教材问题 | 0 | 仅完整静态语料的可靠命中 | 当前无发布页图；为本地 chunk 原文视图 | high 或 low |

Citation 的 page、location_label、quote、chunk_id 和 source_metadata 由 createLocalCitation 通过 ApiChunk 和 ApiChapter 生成。模型没有任何输入字段可直接控制这些值。

ChatSheetContent 为 citation 保存真实的 bookId 与 pdfPage，以及由 `createLocalCitation` 保存的 `retrieved_chunk_text`。它只会采用 source_type=extracted、与 citation.chunk_id 精确关联、存在 source_page_image_url、并且通过 `published-citation-source-page-assets.json` 的 tracked/hash 校验的资产。若没有这样的已发布资产，卡片缩略图保持为空，来源面板不渲染图片，而是显示受控摘录、可选择文字和“做笔记”流程；“查看该页”使用同一受控 chunk 的内置原文片段视图，并按 citation 的 bookId 和 pdfPage 显示真实位置，不使用 image_url 裁剪图、AI 图、固定示意图或本机页图路径。该视图有 sourceText 时以 citation 传入的实际 `chapter_title` 为标题，而不是按 PDF 页码猜章节；并且方案二的权威 seed/generated directory/manifest 明确把 PDF 1–9 页标为 `frontmatter` / “教材封面、前言与目录”，所以真实 citation 链路也不会把它们误标成缺失正文的第 1 章。

## 系统规则

第一阶段系统规则必须清楚表达以下行为：

1. 正常问候、寒暄、轻松聊天及不需要教材证据的问题直接回答，不调用教材 Tool。
2. 仅在需要当前教材事实、教材原文、页码、概念核验或教材依据的题目解析时调用 search_textbook。
3. Tool 有可靠来源时，只能依据有限来源片段陈述教材事实。
4. Tool 无可靠来源时，不得伪造教材内容、页码或引用。
5. 面向学生的最终内容不能解释内部工具、检索、模型选择或内部判断。

系统规则是模型侧的行为引导；可靠性阈值、有限上下文和本地 citation 生成仍由前端强制执行，不能只依赖提示词。

## 离线 Demo 与失败降级

### 没有 VITE_DEEPSEEK_API_KEY

默认模式不请求 DeepSeek 或任何远程模型。DemoRepository 对简单问候（例如“你好”“嗨”“早上好”）返回自然问候，citations 和 related_assets 都为空。浏览器内明确的 biology-required-2 教材问题会优先使用方案二的同源静态索引和真实 chunk 页码；若 Worker/模型不可用则按该方案退化到本地 BM25 或无教材回答。

无 Key 路径不存在按“受精作用”等词、教学意图或完整问题字符串挑选的固定 evidence-card，也不存在 Node fixture 的生物固定 citation。当前完整静态语料仅支持 biology-required-2：只有该书的 TextbookRetriever 返回可靠 hybrid/BM25 命中、且 chunk 的 `book_id` 与 section/chapter 都属于当前书本时，才以该命中 chunk 的原文生成回答和 citation；数学或未知书本不会回退到 biology chunks。复合问题、否定问题、题干中的概念夹带以及无可靠命中都明确返回无教材引用。这样离线模式可能保守地拒绝一部分问题，但不会用与提问不相符的 fixture 答案或页码冒充证据。

### 网络或 API 失败

拥有个人 Key 的直连请求出现网络、HTTP、权限或限流错误时，界面显示简洁的可恢复错误，不伪造教材回答或引用。错误文本不包含 API Key、完整请求内容或模型内部决策。

### Tool 参数或 Tool 名称异常

无效 JSON、缺少 query、空 query、未知工具或不可关联的 tool_call_id 不会抛出未处理异常。前端返回 role=tool 的无可靠命中结果并进行第二阶段回答；最终不会附加教材正文、citation 或 related_assets。

### 低相关性与空教材

无 chunks、无可靠 score 或只命中偶然字符时，Tool 结果明确为无可靠教材命中。模型可以回答一般部分或说明教材片段不足，但学生界面不能出现“来源于教材第 N 页”。

### 空模型内容或协议不完整

当 provider 不返回可显示 assistant content、Tool Call 没有可用 id，或第二阶段没有最终 content 时，抛出受控的 DeepSeekDirectError 并让界面提示重试。不会从中间 content、Tool JSON 或不完整响应中拼装用户答案。

## 安全要求

1. src/config/deepseek.ts 不包含 API Key；它只读取 gitignored 的 .env.local 中的 VITE_DEEPSEEK_API_KEY。
2. .env.local 不创建、不提交，也不应复制到示例数据、日志、测试快照或错误信息。
3. VITE 前缀变量会在前端构建时嵌入客户端。因此个人 BYOK 构建仍可被提取，只适合临时、自用、不可分发的调试。
4. 对外发布、多人使用、长期 Key、配额控制、审计和滥用防护必须迁移到服务端或 Serverless 代理。
5. 任何教材引用都必须是实际注入的本地 chunk；“模型声称的页码”永远不能成为引用依据。

## 实现状态（本轮）

已完成：

- DeepSeek 的第一阶段 tools + tool_choice:auto 请求，且第一请求不含教材正文。
- 普通 assistant content 的单请求返回路径，固定空 citations 和空 related_assets。
- search_textbook 的本地全候选排序、当前章节轻量加权、阈值、Top-K 限制和 Tool 回传。
- 第二阶段的 assistant.tool_calls 与 role=tool/tool_call_id 协议消息。
- 从实际注入 chunks 重建 citations，并将资产限制为 source_chunk_ids 精确关联。
- ChatSheet 的“教材原页”只接受与 citation.chunk_id 精确关联、source_type=extracted 且位于受跟踪/哈希校验发布清单中的 source_page_image_url；AI 生成图、资产 image_url 裁剪图、本机 MinerU 页图和任何固定回退图均不会进入来源面板。
- 没有合格原页图时，来源面板与全屏“查看该页”仍显示 citation 页码、可选择的受控摘录、做笔记动作和同一 chunk 的内置本地原文片段；入口不依赖未发布的 PDF 页图。
- 无效 Tool 参数、未知 Tool、低相关命中、空内容、无 Key 和网络错误的受控处理。
- 无 Key 的离线问候、完整静态语料的可靠命中，以及无命中时无引用的保守回退；不再存在固定教材 evidence-card。
- 读取 .env.local 的配置与 README 安全说明。
- `createCitationExcerpt` 从受控 chunk 中挑选可读的实质性陈述句：跳过短标签、纯标点和明显问句/练习提示，优先实验结论等陈述；若 OCR 没有可用句子则回退到同一 chunk 原文，绝不由模型或 UI 补写摘录。截断不添加省略号，故 quote 始终是源 chunk 的连续子串。
- 中性加载文案“正在准备回答…”，不在模型尚未决定前声称“正在检索当前章节”。

不由本文实现、但已由方案二独立完成并接入：

- 全书 PDF 解析、OCR 清洗、整本 chunks、BM25、512 维向量索引、Web Worker、缓存、版本化 manifest、125 页覆盖报告和跨章节语义检索评测。它们的发布边界、哈希、运行时超时/BM25 降级、包体和版权要求以 [BIOLOGY_FRONTEND_RAG_PLAN.md](./BIOLOGY_FRONTEND_RAG_PLAN.md) 为准。
- 生产可分发的密钥代理或服务端鉴权。
- 对真实 DeepSeek 账户的在线验收；本轮测试全部使用本地 mock，未发出真实网络请求。

## 测试与验收

Vitest 覆盖应至少验证：

1. “你好”的直连路径只发一次请求，第一请求含 tool_choice:auto 和 Tool 定义，但不含教材正文；响应没有 citation 或关联资产。
2. 高相关学习问题触发两次请求；第二请求含原 assistant.tool_calls 和对应的 role=tool/tool_call_id，且最终页码来自本地 metadata。
3. 低相关 Tool 查询发送无可靠命中结果，不注入片段，不创建引用。
4. 当前章节只是 boost：当跨章节命中明显更强时，跨章节 chunk 排在首位。
5. 无效 Tool arguments 不崩溃，仍返回受控的第二阶段回答且无引用。
6. 缺少 Key 时在任何 fetch 前失败为受控配置错误。
7. 离线 Demo 的“你好”“嗨”“早上好”都返回正常聊天与空引用；浏览器中的明确 biology 教材问题只使用方案二静态索引或其安全降级。数学书、未知书、复合问题、否定问题和概念夹带都不能触发 biology 固定 citation；可靠离线答案必须逐字由实际命中、book_id/section_id 对应当前书本的 chunk citation quote 支持。
8. Citation 的教材页和 PDF 页与 fixture 的 source_metadata 一致，而非模型输出。
9. Playwright 默认无 Key 场景阻断 DeepSeek、Hugging Face、CDN 和未发布教材页图请求；它断言零外联，并验证无可靠复合问题无 citation、可靠完整语料命中显示真实页码且“查看该页”打开内置本地原文片段。
10. 第一阶段缺少 choices、第一阶段没有 content 且没有 tool_calls、以及第二阶段空 content 都抛出受控 DeepSeekDirectError，不返回半成品 citations。
11. 多个 Tool Call 都有相同数量的 role=tool/tool_call_id 回传消息；可靠片段按稳定 ID 去重并受 Top-K 限制，最终 citation 与 related_assets 仅来自实际 Tool sources 的并集。
12. HTTP 401/429 与 fetch 网络异常映射为受控用户错误，错误内容不得包含 Key、请求体或 provider 原始诊断。
13. related_assets 为空时，CitationCard 不得显示固定教材插图；“查看该页”必须由 citation 的真实 PDF 页定位，并显示可选择摘录及做笔记入口，不得尝试加载未发布页图。
14. 纯函数测试验证 ai_generated 资产和只有裁剪 image_url 的资产均不能作为教材原页；只有与 citation.chunk_id 精确关联、且经发布清单验证的 extracted.source_page_image_url 才可被采用。clean-tree 资源校验必须同时验证文件存在、Git tracked 和 SHA-256。
15. book/section 隔离测试验证数学书、未知书和 biology 书中包含“第二次”“例”“受精作用”的输入不会触发固定 biology citation；只有当前 book_id、有效 chapter/section 层级和实际检索命中同时成立时才可生成 citation。
16. SourceReader 服务端渲染测试验证 PDF 1–9 的前言/目录 citation 不显示“第 1 章 遗传因子的发现”，实际 chapter citation 显示传入的 citation title 和实际 PDF 位置；同时真实链回归直接读取 generated chapters 与公开 PDF 第 1 页 frontmatter chunk，再由 createLocalCitation 生成来源，断言标题为“教材封面、前言与目录”，并确认实际第 2 章 chunk 仍显示真实章名。摘录测试验证问句开头 chunk 会选择实质原文、普通陈述保持原文、全短片段受控回退，并且离线答案严格等于 citation quote。

发布前至少运行：

```text
npm exec vitest run src/services/DeepSeekRag.test.ts src/screens/SourceReaderScreen.test.tsx src/screens/sheets/citationSource.test.ts scripts/rag-common.test.ts scripts/citation-source-assets.test.ts
npm exec vitest run src/rag/retrievalMath.test.ts src/services/TextbookRetriever.test.ts
npm exec eslint src/services/DeepSeekRag.ts src/services/DeepSeekRag.test.ts src/config/deepseek.ts src/services/DemoRepository.ts src/components/ui.tsx src/screens/SourceReaderScreen.tsx src/screens/SourceReaderScreen.test.tsx src/screens/sheets/ChatSheetContent.tsx src/screens/sheets/SourceSheetContent.tsx src/screens/sheets/citationSource.ts src/screens/sheets/citationSource.test.ts src/types/app.ts e2e/lesson-ai-chat.spec.ts
npm run build
playwright test e2e/lesson-ai-chat.spec.ts
npm run rag:validate:source-assets
npm run rag:validate
```

测试可以模拟 provider 响应，但不得使用真实 Key 或真实网络请求。真实账号连通性如需单独人工验证，应使用新建、短期、可撤销的个人 Key，并且不得把 Key、请求体或回答快照提交到仓库。
