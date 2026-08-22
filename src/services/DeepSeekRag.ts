import { Capacitor, CapacitorHttp } from "@capacitor/core";
import {
  deepSeekConfig,
  deepSeekKeySetupMessage,
  hasDirectDeepSeekKey
} from "../config/deepseek";
import type {
  ApiAsset,
  ApiChapter,
  ApiChunk,
  Citation,
  RagQuery,
  RagResponse
} from "../types/api";

type DeepSeekSystemMessage = {
  role: "system";
  content: string;
};

type DeepSeekHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type DeepSeekToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type DeepSeekAssistantToolMessage = {
  role: "assistant";
  content: string | null;
  tool_calls: DeepSeekToolCall[];
};

type DeepSeekToolMessage = {
  role: "tool";
  tool_call_id: string;
  content: string;
};

type DeepSeekMessage =
  | DeepSeekSystemMessage
  | DeepSeekHistoryMessage
  | DeepSeekAssistantToolMessage
  | DeepSeekToolMessage;

type DeepSeekToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, {
        type: string;
        description: string;
      }>;
      required: string[];
      additionalProperties: boolean;
    };
  };
};

type DeepSeekRequestOptions = {
  tools?: DeepSeekToolDefinition[];
  toolChoice?: "auto" | "none";
};

type DeepSeekAssistantResponse = {
  content: string | null;
  toolCalls: DeepSeekToolCall[];
};

type SearchToolInvocation = {
  call: DeepSeekToolCall;
  query: string;
  rankedChunks: RankedChunk[];
};

export type DeepSeekRagCorpus = {
  assets: ApiAsset[];
  chapters: ApiChapter[];
  chunks: ApiChunk[];
};

export type RankedChunk = {
  chunk: ApiChunk;
  score: number;
};

/**
 * A local chunk must cross this score before its text is sent to the provider
 * or surfaced as a citation. A matching declared key concept alone scores 3,
 * while incidental shared characters remain well below this threshold.
 */
export const LOCAL_TEXTBOOK_RELIABILITY_THRESHOLD = 2.4;

/**
 * The direct-call mode never sends more than this many textbook chunks in one
 * tool result. Full textbook indexing and vector retrieval are deliberately
 * deferred to the separate frontend RAG plan.
 */
export const LOCAL_TEXTBOOK_CONTEXT_LIMIT = 3;

const CURRENT_CHAPTER_BOOST = 0.2;
const TOOL_QUERY_MAX_LENGTH = 500;
const TOOL_CHUNK_MAX_LENGTH = 1_800;

export const searchTextbookTool: DeepSeekToolDefinition = {
  type: "function",
  function: {
    name: "search_textbook",
    description: "Search locally bundled textbook passages only when the student needs reliable evidence from the current course textbook. Do not use this for greetings, casual chat, or questions that do not need textbook evidence.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "A concise Chinese search query that captures the textbook concept or claim to verify."
        }
      },
      required: ["query"],
      additionalProperties: false
    }
  }
};

export class DeepSeekDirectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepSeekDirectError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeForSearch(value: string) {
  return value
    .toLocaleLowerCase("zh-CN")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function characterOverlap(left: string, right: string) {
  const leftCharacters = new Set(left);
  const rightCharacters = new Set(right);
  if (leftCharacters.size === 0 || rightCharacters.size === 0) return 0;
  let shared = 0;
  leftCharacters.forEach((character) => {
    if (rightCharacters.has(character)) shared += 1;
  });
  return shared / leftCharacters.size;
}

function chunkSearchText(chunk: ApiChunk) {
  return chunk.key_concepts.join(" ") + " " + chunk.text;
}

function longestUsefulSharedPhrase(question: string, searchable: string) {
  const ignored = new Set([
    "什么", "怎么", "为何", "为什么", "请问", "解释", "一下", "一个",
    "原文", "教材", "结合", "给我", "可以", "如何", "能否", "问题",
    "这个", "那个", "学习", "知识"
  ]);
  const maximumLength = Math.min(8, question.length);
  for (let length = maximumLength; length >= 3; length -= 1) {
    for (let start = 0; start <= question.length - length; start += 1) {
      const phrase = question.slice(start, start + length);
      if (ignored.has(phrase)) continue;
      if (searchable.includes(phrase)) return length;
    }
  }
  return 0;
}

/**
 * Lightweight on-device keyword retrieval for the currently bundled fixture.
 *
 * Every chunk stays eligible. The active chapter earns only CURRENT_CHAPTER_BOOST,
 * so a clearly stronger result from another chapter must still win. The
 * reliability threshold is intentionally applied by the tool executor rather
 * than here so callers can inspect ranked candidates for diagnostics and tests.
 */
export function rankLocalChunks(
  question: string,
  chunks: ApiChunk[],
  chapterId?: string | null,
  limit = LOCAL_TEXTBOOK_CONTEXT_LIMIT
) {
  const normalizedQuestion = normalizeForSearch(question);

  return chunks
    .map<RankedChunk>((chunk) => {
      const searchable = normalizeForSearch(chunkSearchText(chunk));
      const conceptHits = chunk.key_concepts.reduce(
        (count, concept) => count + (normalizedQuestion.includes(normalizeForSearch(concept)) ? 1 : 0),
        0
      );
      const sharedPhraseLength = longestUsefulSharedPhrase(normalizedQuestion, searchable);
      const phraseEvidence = sharedPhraseLength > 0
        ? Math.min(2.2, (sharedPhraseLength - 2) * 0.55)
        : 0;
      const fullQuestionMatch = normalizedQuestion.length > 3 && searchable.includes(normalizedQuestion) ? 2 : 0;
      const chapterBoost = chapterId === chunk.chapter_id ? CURRENT_CHAPTER_BOOST : 0;
      return {
        chunk,
        score: (
          (characterOverlap(normalizedQuestion, searchable) * 0.45)
          + (conceptHits * 3)
          + phraseEvidence
          + fullQuestionMatch
          + chapterBoost
        )
      };
    })
    .sort((left, right) => right.score - left.score || left.chunk.page_start - right.chunk.page_start)
    .slice(0, Math.max(0, limit));
}

export function selectReliableLocalChunks(
  question: string,
  chunks: ApiChunk[],
  chapterId?: string | null
) {
  return rankLocalChunks(question, chunks, chapterId)
    .filter((item) => item.score >= LOCAL_TEXTBOOK_RELIABILITY_THRESHOLD);
}

function asPageNumberList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    : [];
}

function createCitationExcerpt(text: string) {
  const sentence = text
    .split(/[。！？!?]/)
    .map((item) => item.trim())
    .find(Boolean)
    ?? text.trim();
  return sentence.length > 180 ? sentence.slice(0, 177) + "…" : sentence;
}

export function createLocalCitation(
  ranked: RankedChunk,
  chapters: ApiChapter[]
): Citation {
  const { chunk, score } = ranked;
  const metadata = chunk.source_metadata ?? {};
  const pdfPages = asPageNumberList(metadata.pdf_pages);
  const printedPages = asPageNumberList(metadata.printed_pages);
  const page = pdfPages[0] ?? chunk.page_start;
  const printedPage = printedPages[0] ?? chunk.printed_page_start ?? null;
  const chapter = chapters.find((item) => item.chapter_id === chunk.chapter_id);
  const quote = createCitationExcerpt(chunk.text);

  return {
    chapter_id: chunk.chapter_id,
    chapter_title: chapter?.source_title ?? "教材原文",
    page,
    chunk_id: chunk.chunk_id,
    quote,
    score: Number(score.toFixed(3)),
    retrieval_method: "on-device-keyword-rag",
    source_type: "textbook",
    location_type: "page",
    location_label: printedPage
      ? "教材第 " + printedPage + " 页（PDF 第 " + page + " 页）"
      : "PDF 第 " + page + " 页",
    source_metadata: {
      ...metadata,
      retrieval_quote: quote
    }
  };
}

function trimForPrompt(value: string, maximumLength: number) {
  const compact = value.trim();
  return compact.length > maximumLength ? compact.slice(0, maximumLength - 1) + "…" : compact;
}

function normalizeHistory(history: RagQuery["history"]): DeepSeekHistoryMessage[] {
  if (!history) return [];
  const messages: DeepSeekHistoryMessage[] = [];
  history.forEach((item) => {
    const role = item.role;
    const content = item.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return;
    const text = content.trim();
    if (text) messages.push({ role, content: trimForPrompt(text, 1_200) });
  });
  return messages.slice(-8);
}

function getProviderErrorMessage(_payload: unknown, status: number) {
  if (status === 401 || status === 403) return "DeepSeek API Key 无效、已过期或无权限。";
  if (status === 429) return "DeepSeek 请求过于频繁或当前额度不足，请稍后再试。";
  return "DeepSeek 请求失败（HTTP " + status + "）。";
}

function parseProviderPayload(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

async function requestDeepSeek(messages: DeepSeekMessage[], options: DeepSeekRequestOptions = {}) {
  const url = deepSeekConfig.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const body = {
    model: deepSeekConfig.model,
    messages,
    max_tokens: deepSeekConfig.maxTokens,
    stream: false,
    thinking: { type: "disabled" },
    ...(options.tools
      ? {
          tools: options.tools,
          tool_choice: options.toolChoice ?? "auto"
        }
      : {})
  };
  const headers = {
    Authorization: "Bearer " + deepSeekConfig.apiKey.trim(),
    "Content-Type": "application/json"
  };

  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.post({
      url,
      headers,
      data: body,
      connectTimeout: 30_000,
      readTimeout: 60_000
    });
    const payload = parseProviderPayload(response.data);
    if (response.status < 200 || response.status >= 300) {
      throw new DeepSeekDirectError(getProviderErrorMessage(payload, response.status));
    }
    return payload;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const payload = parseProviderPayload(await response.text());
  if (!response.ok) {
    throw new DeepSeekDirectError(getProviderErrorMessage(payload, response.status));
  }
  return payload;
}

function readToolCalls(value: unknown) {
  if (!Array.isArray(value)) return [] as DeepSeekToolCall[];
  return value.flatMap((item) => {
    if (!isRecord(item) || !isRecord(item.function)) return [];
    const id = item.id;
    const type = item.type;
    const name = item.function.name;
    const argumentsText = item.function.arguments;
    if (
      typeof id !== "string"
      || !id.trim()
      || type !== "function"
      || typeof name !== "string"
      || !name.trim()
      || typeof argumentsText !== "string"
    ) {
      return [];
    }
    return [{
      id,
      type: "function" as const,
      function: {
        name,
        arguments: argumentsText
      }
    }];
  });
}

function readAssistantResponse(payload: unknown): DeepSeekAssistantResponse | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return null;
  const firstChoice = payload.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) return null;
  const content = firstChoice.message.content;
  return {
    content: typeof content === "string" && content.trim() ? content.trim() : null,
    toolCalls: readToolCalls(firstChoice.message.tool_calls)
  };
}

function parseSearchToolQuery(argumentsText: string) {
  try {
    const parsed = JSON.parse(argumentsText) as unknown;
    if (!isRecord(parsed) || typeof parsed.query !== "string") return null;
    const query = parsed.query.trim();
    return query ? trimForPrompt(query, TOOL_QUERY_MAX_LENGTH) : null;
  } catch {
    return null;
  }
}

function toolNoReliableMatch(message: string) {
  return JSON.stringify({
    status: "no_reliable_textbook_match",
    message,
    sources: []
  });
}

function toolReliableMatches(
  rankedChunks: RankedChunk[],
  chapters: ApiChapter[]
) {
  const citations = rankedChunks.map((item) => createLocalCitation(item, chapters));
  return JSON.stringify({
    status: "reliable_textbook_match",
    sources: rankedChunks.map(({ chunk }, index) => ({
      chunk_id: chunk.chunk_id,
      chapter_id: chunk.chapter_id,
      chapter_title: citations[index]?.chapter_title ?? "教材原文",
      pdf_page: citations[index]?.page ?? chunk.page_start,
      textbook_page: asPageNumberList(chunk.source_metadata?.printed_pages)[0]
        ?? chunk.printed_page_start
        ?? null,
      text: trimForPrompt(chunk.text, TOOL_CHUNK_MAX_LENGTH)
    }))
  });
}

function prepareToolFollowup(
  toolCalls: DeepSeekToolCall[],
  corpus: DeepSeekRagCorpus,
  chapterId?: string | null
) {
  const searchInvocations: SearchToolInvocation[] = [];
  const queryByCallId = new Map<string, string | null>();

  toolCalls.forEach((call) => {
    if (call.function.name !== searchTextbookTool.function.name) return;
    const query = parseSearchToolQuery(call.function.arguments);
    queryByCallId.set(call.id, query);
    if (!query) return;
    searchInvocations.push({
      call,
      query,
      rankedChunks: selectReliableLocalChunks(query, corpus.chunks, chapterId)
    });
  });

  const strongestByChunkId = new Map<string, RankedChunk>();
  searchInvocations.forEach((invocation) => {
    invocation.rankedChunks.forEach((ranked) => {
      const existing = strongestByChunkId.get(ranked.chunk.chunk_id);
      if (!existing || ranked.score > existing.score) {
        strongestByChunkId.set(ranked.chunk.chunk_id, ranked);
      }
    });
  });
  const injectedChunks = [...strongestByChunkId.values()]
    .sort((left, right) => right.score - left.score || left.chunk.page_start - right.chunk.page_start)
    .slice(0, LOCAL_TEXTBOOK_CONTEXT_LIMIT);
  const injectedChunkIds = new Set(injectedChunks.map(({ chunk }) => chunk.chunk_id));
  const invocationByCallId = new Map(searchInvocations.map((item) => [item.call.id, item]));

  const toolMessages = toolCalls.map<DeepSeekToolMessage>((call) => {
    if (call.function.name !== searchTextbookTool.function.name) {
      return {
        role: "tool",
        tool_call_id: call.id,
        content: toolNoReliableMatch("该工具不可用。请不要编造教材页码或教材出处。")
      };
    }

    const query = queryByCallId.get(call.id);
    if (!query) {
      return {
        role: "tool",
        tool_call_id: call.id,
        content: toolNoReliableMatch("检索参数无效，未查询教材。请不要编造教材页码或教材出处。")
      };
    }

    const invocation = invocationByCallId.get(call.id);
    const callChunks = invocation?.rankedChunks.filter(
      ({ chunk }) => injectedChunkIds.has(chunk.chunk_id)
    ) ?? [];
    return {
      role: "tool",
      tool_call_id: call.id,
      content: callChunks.length > 0
        ? toolReliableMatches(callChunks, corpus.chapters)
        : toolNoReliableMatch("没有可靠教材命中。请不要引用教材页码；可直接说明当前教材片段不足，或回答无需教材证据的部分。")
    };
  });

  return { injectedChunks, toolMessages };
}

function selectRelatedAssets(assets: ApiAsset[], rankedChunks: RankedChunk[]) {
  const chunkIds = new Set(rankedChunks.map(({ chunk }) => chunk.chunk_id));
  return assets
    .filter((asset) => asset.source_chunk_ids.some((chunkId) => chunkIds.has(chunkId)))
    .slice(0, 3);
}

function responseConfidence(rankedChunks: RankedChunk[]) {
  const highestScore = rankedChunks[0]?.score ?? 0;
  if (highestScore < LOCAL_TEXTBOOK_RELIABILITY_THRESHOLD) return "low";
  return highestScore >= LOCAL_TEXTBOOK_RELIABILITY_THRESHOLD + 2 ? "high" : "medium";
}

function asDirectError(error: unknown) {
  if (error instanceof DeepSeekDirectError) return error;
  return new DeepSeekDirectError("无法连接 DeepSeek。请检查网络、个人 Key 和 API 服务状态。");
}

function assistantSystemMessage(): DeepSeekSystemMessage {
  return {
    role: "system",
    content: [
      "你是中文学习助手。先判断用户是在正常闲聊、一般学习交流，还是需要核验当前教材中的事实。",
      "对于你好、问候、寒暄、轻松聊天或不需要教材证据的问题，直接自然回答，不调用教材工具，也不要杜撰出处。",
      "只有在用户明确询问当前教材中的概念、原文、页码、事实或需要教材依据的题目解析时，才调用 search_textbook。",
      "调用工具时，query 应是能代表待核验概念的简洁中文检索词。",
      "工具返回可靠来源时，只依据其中有限的教材片段陈述教材事实；工具返回无可靠命中时，不得编造教材内容、教材页码或引用。",
      "最终回答面向学生，不提及内部工具、检索流程、模型选择或内部判断。"
    ].join("\n")
  };
}

/**
 * Direct BYOK chat with optional local textbook evidence.
 *
 * Request one intentionally contains no textbook text. The model may either
 * answer immediately (for a greeting or non-textbook request) or ask for the
 * local search_textbook tool. Only a reliable local result is included in
 * request two, and every returned citation is recreated from that injected
 * local chunk rather than from model output.
 */
export async function askDeepSeekWithLocalRag(
  query: RagQuery,
  corpus: DeepSeekRagCorpus
): Promise<RagResponse> {
  if (!hasDirectDeepSeekKey()) throw new DeepSeekDirectError(deepSeekKeySetupMessage);

  const question = query.question.trim();
  if (!question) throw new DeepSeekDirectError("请输入要提问的问题。");
  if (question.length > 2_000) throw new DeepSeekDirectError("问题过长，请控制在 2,000 个字符以内。");

  const initialMessages: DeepSeekMessage[] = [
    assistantSystemMessage(),
    ...normalizeHistory(query.history),
    { role: "user", content: question }
  ];

  let firstPayload: unknown;
  try {
    firstPayload = await requestDeepSeek(initialMessages, {
      tools: [searchTextbookTool],
      toolChoice: "auto"
    });
  } catch (error) {
    throw asDirectError(error);
  }

  const firstResponse = readAssistantResponse(firstPayload);
  if (!firstResponse) {
    throw new DeepSeekDirectError("DeepSeek 没有返回可显示的回答，请重试。");
  }

  if (firstResponse.toolCalls.length === 0) {
    if (!firstResponse.content) {
      throw new DeepSeekDirectError("DeepSeek 没有返回可显示的回答，请重试。");
    }
    return {
      answer: firstResponse.content,
      citations: [],
      related_assets: [],
      confidence: "low"
    };
  }

  const { injectedChunks, toolMessages } = prepareToolFollowup(
    firstResponse.toolCalls,
    corpus,
    query.chapter_id
  );
  const followupMessages: DeepSeekMessage[] = [
    ...initialMessages,
    {
      role: "assistant",
      content: firstResponse.content,
      tool_calls: firstResponse.toolCalls
    },
    ...toolMessages
  ];

  let secondPayload: unknown;
  try {
    secondPayload = await requestDeepSeek(followupMessages, {
      tools: [searchTextbookTool],
      toolChoice: "none"
    });
  } catch (error) {
    throw asDirectError(error);
  }

  const secondResponse = readAssistantResponse(secondPayload);
  if (!secondResponse?.content) {
    throw new DeepSeekDirectError("DeepSeek 没有返回可显示的回答，请重试。");
  }

  const citations = injectedChunks.map((item) => createLocalCitation(item, corpus.chapters));
  return {
    answer: secondResponse.content,
    citations,
    related_assets: selectRelatedAssets(corpus.assets, injectedChunks),
    confidence: responseConfidence(injectedChunks)
  };
}
