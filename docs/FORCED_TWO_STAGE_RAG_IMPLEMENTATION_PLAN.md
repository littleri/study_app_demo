# 前端强制两阶段 RAG 改造计划

## 目标

本次改造把当前的可选 Tool Call 问答升级为固定的两阶段教材问答协议：

1. 每条非空用户消息都先调用一次 LLM，由它生成 `search_textbook` 检索请求；第一阶段不得直接产出最终回答，也不得携带教材正文。
2. 前端收到 Tool Call 后调用浏览器本地 `TextbookRetriever`，使用混合向量/BM25 检索、可靠阈值过滤和章节轻量先验。
3. 无论检索是否命中，都进行第二次 LLM 调用；命中时最多携带 3 个真实教材 chunks，未命中时携带结构化 `no_reliable_textbook_match`。
4. 教材 citation 只能由实际注入第二阶段的本地 chunks 生成。模型输出的页码、引用或“已检索”声明不能成为 citation。
5. RAG 命中时，AI 回答气泡显示明确的“查看教材原文”入口；未命中时显示受控的无来源状态，不显示假页码或假入口。

## 固定数据流

```text
用户问题 + 当前教材/章节 metadata + 最近历史
        |
        v
第一阶段 LLM（检索规划器）
  tools = [search_textbook]
  tool_choice = 强制 search_textbook
  不含教材正文，不接受为最终回答
        |
        v
浏览器本地 TextbookRetriever
  BGE cosine + BM25 + 章节轻量先验
  Top-5 排序 -> 可靠阈值过滤 -> 最多 Top-3 注入
        |
        +-- 命中：role=tool 携带真实 chunks
        |
        +-- 未命中：role=tool 携带 no_reliable_textbook_match
        |
        v
第二阶段 LLM（学生回答器）
  保留 assistant.tool_calls / tool_call_id
  tool_choice = none
        |
        v
回答 + 仅由 injected chunks 生成的 citations
        |
        v
回答气泡：命中时显示教材原文入口；未命中时无假来源
```

## 实施内容

### 1. 查询与响应契约

- 为 `RagQuery` 增加可选 `context`，包含教材标题、章节标题、小节标题、页码标签和关键概念。
- 为 `RagResponse` 增加 `retrieval` 摘要，包含是否尝试、状态、方法、命中数和错误码。
- 两个聊天入口都必须提交相同的 context，避免全局 AI 和章节 Sheet 行为分叉。

### 2. 强制第一阶段 Tool Call

- 扩展 DeepSeek `tool_choice` 类型以支持指定 function。
- 第一阶段使用强制 `search_textbook`，并降低 planner 阶段 token 上限。
- 删除“第一阶段无 Tool Call 就直接返回普通回答”的路径。
- 若 provider 未遵循 forced Tool Call，前端构造一个以用户问题为 query 的受控本地 Tool Call 兜底，仍确保执行 RAG 和第二阶段。

### 3. 两套系统消息

- 第一阶段是检索规划器：结合 context 消解“本章、本节、这里”等指代，只生成检索 Tool Call。
- 第二阶段是学生回答器：有来源时只依据 Tool sources 陈述教材事实；无来源时不得声称来自教材或生成页码。
- 第一阶段消息不得包含 chunk 正文；第二阶段只包含经过可靠阈值过滤的有限 chunks。

### 4. 本地检索与章节范围

- 保持全书候选、Top-5、可靠阈值、Top-3 注入和稳定去重。
- 为 `TextbookSearchRequest` 增加 `chapterScopeIds`。
- 根据章节树计算当前节点及后代 ID；`chunk.chapter_id` 或 `chunk.section_id` 位于 scope 时应用章节 prior。
- 当前章节只提供轻量 prior，不作为硬过滤，允许跨章节更强证据胜出。
- Worker、BM25 fallback 和 hybrid 空命中的词法救援必须使用相同 scope。

### 5. 气泡中的教材原文入口

- 复用现有 `AiAssistantMessage.citations`、`openCitationSource()` 和 Source Reader。
- 把当前“来源于 / 查看该页”区域升级为气泡内的“教材原文依据”区，显示章节、真实页码、受控摘录和“查看教材原文”按钮。
- 多个 citation 按真实页去重；点击后打开同一 citation 的 `retrieved_chunk_text`。
- 无命中时显示“当前教材未检索到可靠原文”，不渲染原文按钮。

### 6. 无命中与失败策略

- 问候：虽然仍执行 RAG 和第二次 LLM，但自然回答，不展示检索术语或来源入口。
- 教材问题无命中：说明当前教材证据不足，引导具体化，不生成教材页码。
- 一般问题无命中：可做简短一般回答，但不得标注为教材结论。
- 索引不可用：第二阶段收到结构化不可用结果；UI 不制造 citation。
- 网络或第二阶段失败：保持现有受控错误，不返回只有 Tool Result 的半成品答案。

## 预计修改文件

- `src/types/api.ts`
- `src/rag/types.ts`
- `src/rag/retrievalMath.ts`
- `src/rag/textbookRag.worker.ts`
- `src/services/TextbookRetriever.ts`
- `src/services/DeepSeekRag.ts`
- `src/services/DemoRepository.ts`
- `src/components/ui.tsx`
- `src/screens/sheets/ChatSheetContent.tsx`
- `src/styles/base.css`
- 对应 Vitest 与 Playwright 测试

## 验收标准

- [x] 每条非空在线问题都执行一次教材检索。
- [x] 每条非空在线问题都执行两次 LLM 请求。
- [x] 第一次请求强制 `search_textbook` 且不含教材正文。
- [x] Provider 未返回 Tool Call 时仍通过受控兜底执行本地检索。
- [x] 第二次请求携带实际命中 chunks 或结构化无命中结果。
- [x] 最多注入 3 个可靠、去重 chunks。
- [x] Citation 仅来自实际注入 chunks。
- [x] RAG 命中时气泡显示“查看教材原文”。
- [x] 点击入口打开同一 citation 的本地原文和真实页码。
- [x] RAG 未命中时不显示原文按钮或教材页码。
- [x] 当前 `c2s1` 能给 `c2s1a/c2s1b` chunks 应用章节 prior。
- [x] 全局 AI 与章节 Sheet 使用相同协议。
- [x] 单元测试、目标 E2E、TypeScript 构建与 RAG 校验通过。

## 测试清单

1. DeepSeek 第一次请求使用 forced function tool choice。
2. 普通问题、教材问题和问候都固定产生两次 provider 请求。
3. 第一阶段不含任何 fixture/corpus 正文。
4. 第二阶段保留 `assistant.tool_calls` 与对应 `role=tool`。
5. 可靠命中产生真实 citation；无命中产生空 citation。
6. Provider 不遵循 Tool Call 时使用本地 fallback query，不能直接回答。
7. `c2s1` scope 能命中并加权 `c2s1a/c2s1b`，但不硬过滤跨章节结果。
8. 回答气泡存在原文入口、页码去重和正确跳转；无命中不显示假入口。
9. Vitest mock 两次 DeepSeek 响应并验证第二次请求携带 chunk 正文；Playwright 验证气泡来源入口和原文跳转。
10. 所有 provider 测试使用 mock，不发送真实 Key 或真实网络请求。

## 执行结果（2026-08-23）

- TypeScript 项目检查通过。
- 本次变更涉及文件的定向 ESLint 检查通过。
- Vitest 全量回归通过：34 个测试文件、282 个测试。
- AI 对话目标 Playwright 流程通过：手机/平板、横屏/竖屏共 4 个项目。
- 生产构建通过；引用教材页资产校验通过（125 个已发布页资产）。
- 生物教材 RAG 校验通过：171 个 chunks、125 页、可靠阈值 0.6037。
- Provider 单元测试全部使用 mock；Playwright 显式禁用个人 Key，没有发出真实 DeepSeek 请求。

仓库级 `npm run lint` 仍会扫描 `android/app/build` 构建产物和历史录屏脚本，因此存在与本次改造无关的既有 lint 错误；本次修改涉及的 TypeScript/TSX 文件已单独检查并通过。
