import { afterEach, describe, expect, it, vi } from "vitest";
import { deepSeekConfig, deepSeekKeySetupMessage } from "../config/deepseek";
import type { ApiAsset, ApiChapter, ApiChunk, RagQuery } from "../types/api";
import { DemoRepository } from "./DemoRepository";
import {
  askDeepSeekWithLocalRag,
  createLocalCitation,
  DeepSeekDirectError,
  LOCAL_TEXTBOOK_RELIABILITY_THRESHOLD,
  rankLocalChunks
} from "./DeepSeekRag";

const originalDeepSeekConfig = { ...deepSeekConfig };

afterEach(() => {
  Object.assign(deepSeekConfig, originalDeepSeekConfig);
  vi.restoreAllMocks();
});

const chapters: ApiChapter[] = [
  {
    chapter_id: "chapter-genetics",
    level: 1,
    source_title: "遗传的分子基础",
    ai_title: "遗传的分子基础",
    page_start: 12,
    page_end: 28,
    confidence: 1,
    status: "ready",
    source: "fixture"
  },
  {
    chapter_id: "chapter-evolution",
    level: 1,
    source_title: "生物的进化",
    ai_title: "生物的进化",
    page_start: 74,
    page_end: 90,
    confidence: 1,
    status: "ready",
    source: "fixture"
  }
];

const chunks: ApiChunk[] = [
  {
    chunk_id: "dna-structure",
    book_id: "book-1",
    chapter_id: "chapter-genetics",
    page_start: 15,
    page_end: 15,
    printed_page_start: 13,
    content_type: "paragraph",
    text: "DNA 分子通常由两条反向平行的脱氧核苷酸链组成，碱基按照互补配对原则连接。",
    asset_ids: ["asset-dna"],
    key_concepts: ["DNA", "碱基互补配对", "脱氧核苷酸"],
    source_metadata: { pdf_pages: [15], printed_pages: [13] }
  },
  {
    chunk_id: "natural-selection",
    book_id: "book-1",
    chapter_id: "chapter-evolution",
    page_start: 80,
    page_end: 80,
    content_type: "paragraph",
    text: "自然选择使适应环境的变异逐渐积累，种群的基因频率可能随之改变。",
    asset_ids: [],
    key_concepts: ["自然选择", "种群", "基因频率"]
  }
];

const assets: ApiAsset[] = [
  {
    asset_id: "asset-dna",
    book_id: "book-1",
    chapter_id: "chapter-genetics",
    source_type: "extracted",
    page: 15,
    type: "figure",
    caption: "DNA 结构示意图",
    bbox: [0, 0, 100, 100],
    image_url: "/fixture/dna.webp",
    thumbnail_url: "/fixture/dna-thumb.webp",
    source_page_image_url: "/fixture/page-15.webp",
    source_chunk_ids: ["dna-structure"],
    concepts: ["DNA"]
  }
];

const ragQuery: RagQuery = {
  book_id: "book-1",
  chapter_id: "chapter-genetics",
  history: [{ role: "user", content: "上一题我没理解。" }],
  question: "DNA 的碱基互补配对是什么？"
};

function enableDirectCallForTest() {
  deepSeekConfig.mode = "auto";
  deepSeekConfig.apiKey = "test-key";
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function getRequestBody(fetchMock: { mock: { calls: unknown[][] } }, index: number) {
  const call = fetchMock.mock.calls[index] as [unknown, RequestInit | undefined] | undefined;
  return JSON.parse(String(call?.[1]?.body)) as {
    messages: Array<{
      role: string;
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
      tool_call_id?: string;
    }>;
    tools?: Array<{ function: { name: string } }>;
    tool_choice?: string;
  };
}

function textbookToolCall(argumentsText: string, id = "call_textbook") {
  return {
    id,
    type: "function",
    function: {
      name: "search_textbook",
      arguments: argumentsText
    }
  };
}

describe("two-stage local textbook tool routing", () => {
  it("answers a greeting in one direct request without sending textbook text or citations", async () => {
    enableDirectCallForTest();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      choices: [{ message: { content: "你好！今天想聊什么？" } }]
    }));

    const response = await askDeepSeekWithLocalRag({
      ...ragQuery,
      question: "你好"
    }, { assets, chapters, chunks });

    expect(fetchMock).toHaveBeenCalledOnce();
    const firstBody = getRequestBody(fetchMock, 0);
    expect(firstBody.tool_choice).toBe("auto");
    expect(firstBody.tools?.[0]?.function.name).toBe("search_textbook");
    expect(firstBody.messages.at(-1)).toMatchObject({ role: "user", content: "你好" });
    expect(JSON.stringify(firstBody.messages)).not.toContain("DNA 分子通常由两条");
    expect(response).toMatchObject({
      answer: "你好！今天想聊什么？",
      citations: [],
      related_assets: []
    });
  });

  it("fails with a controlled error when the first response has no choices or no displayable content", async () => {
    enableDirectCallForTest();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ choices: [] }))
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: null } }]
      }));

    await expect(askDeepSeekWithLocalRag(ragQuery, { assets, chapters, chunks }))
      .rejects.toBeInstanceOf(DeepSeekDirectError);
    await expect(askDeepSeekWithLocalRag(ragQuery, { assets, chapters, chunks }))
      .rejects.toThrow("DeepSeek 没有返回可显示的回答");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("executes a reliable textbook tool call and returns only injected local citations", async () => {
    enableDirectCallForTest();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        choices: [{
          message: {
            content: null,
            tool_calls: [textbookToolCall(JSON.stringify({ query: "DNA 碱基互补配对" }))]
          }
        }]
      }))
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: "DNA 的碱基会按互补配对原则连接。" } }]
      }));

    const response = await askDeepSeekWithLocalRag(ragQuery, { assets, chapters, chunks });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = getRequestBody(fetchMock, 0);
    const secondBody = getRequestBody(fetchMock, 1);
    expect(JSON.stringify(firstBody.messages)).not.toContain("DNA 分子通常由两条");
    expect(secondBody.tool_choice).toBe("none");
    expect(secondBody.messages).toContainEqual(expect.objectContaining({
      role: "assistant",
      tool_calls: [expect.objectContaining({ id: "call_textbook" })]
    }));
    const toolResult = secondBody.messages.find((message) => message.role === "tool");
    expect(toolResult).toMatchObject({ role: "tool", tool_call_id: "call_textbook" });
    expect(toolResult?.content).toContain("reliable_textbook_match");
    expect(toolResult?.content).toContain("DNA 分子通常由两条");
    expect(response).toMatchObject({
      answer: "DNA 的碱基会按互补配对原则连接。",
      citations: [{
        chunk_id: "dna-structure",
        page: 15,
        location_label: "教材第 13 页（PDF 第 15 页）"
      }],
      related_assets: [{ asset_id: "asset-dna" }]
    });
    expect(response.citations.map((citation) => citation.chunk_id)).toEqual(["dna-structure"]);
  });

  it("returns a tool result for every tool_call_id and deduplicates the limited injected source union", async () => {
    enableDirectCallForTest();
    const multiChunks: ApiChunk[] = [
      chunks[0]!,
      {
        chunk_id: "dna-replication",
        book_id: "book-1",
        chapter_id: "chapter-genetics",
        page_start: 16,
        page_end: 16,
        printed_page_start: 14,
        content_type: "paragraph",
        text: "DNA 复制会让遗传信息在细胞分裂前得到准确传递。",
        asset_ids: ["asset-dna-replication"],
        key_concepts: ["DNA"],
        source_metadata: { pdf_pages: [16], printed_pages: [14] }
      },
      {
        chunk_id: "dna-expression",
        book_id: "book-1",
        chapter_id: "chapter-genetics",
        page_start: 17,
        page_end: 17,
        printed_page_start: 15,
        content_type: "paragraph",
        text: "DNA 上的遗传信息可以在细胞中表达并影响性状。",
        asset_ids: ["asset-dna-expression"],
        key_concepts: ["DNA"],
        source_metadata: { pdf_pages: [17], printed_pages: [15] }
      },
      {
        chunk_id: "dna-mutation",
        book_id: "book-1",
        chapter_id: "chapter-genetics",
        page_start: 18,
        page_end: 18,
        printed_page_start: 16,
        content_type: "paragraph",
        text: "DNA 的碱基序列发生改变时可能形成基因突变。",
        asset_ids: ["asset-dna-mutation"],
        key_concepts: ["DNA"],
        source_metadata: { pdf_pages: [18], printed_pages: [16] }
      }
    ];
    const multiAssets: ApiAsset[] = multiChunks.map((chunk) => ({
      asset_id: "asset-" + chunk.chunk_id,
      book_id: "book-1",
      chapter_id: "chapter-genetics",
      source_type: "extracted",
      page: chunk.page_start,
      type: "figure",
      caption: chunk.chunk_id + " 示意图",
      bbox: [0, 0, 100, 100],
      image_url: "/fixture/" + chunk.chunk_id + ".webp",
      thumbnail_url: "/fixture/" + chunk.chunk_id + "-thumb.webp",
      source_page_image_url: "/fixture/page-" + chunk.page_start + ".webp",
      source_chunk_ids: [chunk.chunk_id],
      concepts: ["DNA"]
    }));
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        choices: [{
          message: {
            content: null,
            tool_calls: [
              textbookToolCall(JSON.stringify({ query: "DNA" }), "call_dna_one"),
              textbookToolCall(JSON.stringify({ query: "DNA" }), "call_dna_two")
            ]
          }
        }]
      }))
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: "DNA 相关内容已根据教材片段整理。" } }]
      }));

    const response = await askDeepSeekWithLocalRag(ragQuery, {
      assets: multiAssets,
      chapters,
      chunks: multiChunks
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = getRequestBody(fetchMock, 1);
    const toolMessages = secondBody.messages.filter((message) => message.role === "tool");
    expect(toolMessages.map((message) => message.tool_call_id).sort())
      .toEqual(["call_dna_one", "call_dna_two"]);
    const injectedSourceIds = new Set(toolMessages.flatMap((message) => {
      const result = JSON.parse(message.content ?? "{}") as {
        sources?: Array<{ chunk_id: string }>;
      };
      return result.sources?.map((source) => source.chunk_id) ?? [];
    }));
    expect(injectedSourceIds.size).toBe(3);
    expect(response.citations).toHaveLength(3);
    expect(new Set(response.citations.map((citation) => citation.chunk_id))).toEqual(injectedSourceIds);
    expect(new Set(response.related_assets.flatMap((asset) => asset.source_chunk_ids))).toEqual(injectedSourceIds);
  });

  it("fails with a controlled error when the second stage has no displayable content", async () => {
    enableDirectCallForTest();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        choices: [{
          message: {
            content: null,
            tool_calls: [textbookToolCall(JSON.stringify({ query: "DNA 碱基互补配对" }))]
          }
        }]
      }))
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: null } }]
      }));

    await expect(askDeepSeekWithLocalRag(ragQuery, { assets, chapters, chunks }))
      .rejects.toThrow("DeepSeek 没有返回可显示的回答");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = getRequestBody(fetchMock, 1);
    expect(secondBody.messages.find((message) => message.role === "tool")?.content)
      .toContain("reliable_textbook_match");
  });

  it("does not inject a low-relevance tool result or create a citation", async () => {
    enableDirectCallForTest();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        choices: [{
          message: {
            content: null,
            tool_calls: [textbookToolCall(JSON.stringify({ query: "今天天气怎么样" }))]
          }
        }]
      }))
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: "我没有可靠的教材内容可用于这个问题。" } }]
      }));

    const response = await askDeepSeekWithLocalRag(ragQuery, { assets, chapters, chunks });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = getRequestBody(fetchMock, 1);
    const toolResult = secondBody.messages.find((message) => message.role === "tool");
    expect(toolResult?.content).toContain("no_reliable_textbook_match");
    expect(toolResult?.content).not.toContain("DNA 分子通常由两条");
    expect(response.citations).toEqual([]);
    expect(response.related_assets).toEqual([]);
    expect(response.confidence).toBe("low");
  });

  it("treats the current chapter as a small boost rather than a hard retrieval filter", () => {
    const ranked = rankLocalChunks(
      "自然选择如何改变种群的基因频率？",
      chunks,
      "chapter-genetics"
    );

    expect(ranked[0]?.chunk.chunk_id).toBe("natural-selection");
    expect(ranked.some(({ chunk }) => chunk.chunk_id === "dna-structure")).toBe(true);
    expect(ranked[0]?.score).toBeGreaterThan(LOCAL_TEXTBOOK_RELIABILITY_THRESHOLD);
  });

  it("returns a controlled no-match result for an unknown tool", async () => {
    enableDirectCallForTest();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: "call_unknown",
              type: "function",
              function: {
                name: "unknown_tool",
                arguments: "{}"
              }
            }]
          }
        }]
      }))
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: "我无法依据教材确认这个请求。" } }]
      }));

    const response = await askDeepSeekWithLocalRag(ragQuery, { assets, chapters, chunks });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = getRequestBody(fetchMock, 1);
    const toolResult = secondBody.messages.find((message) => message.role === "tool");
    expect(toolResult).toMatchObject({ tool_call_id: "call_unknown" });
    expect(toolResult?.content).toContain("工具不可用");
    expect(response.citations).toEqual([]);
    expect(response.related_assets).toEqual([]);
  });

  it("returns a no-match tool result for malformed tool arguments without throwing", async () => {
    enableDirectCallForTest();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        choices: [{
          message: {
            content: null,
            tool_calls: [textbookToolCall("{not valid json")]
          }
        }]
      }))
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: "我需要更具体的问题才能依据教材说明。" } }]
      }));

    const response = await askDeepSeekWithLocalRag(ragQuery, { assets, chapters, chunks });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = getRequestBody(fetchMock, 1);
    const toolResult = secondBody.messages.find((message) => message.role === "tool");
    expect(toolResult?.content).toContain("检索参数无效");
    expect(response.citations).toEqual([]);
    expect(response.related_assets).toEqual([]);
  });

  it("fails before network access when no personal key is configured", async () => {
    deepSeekConfig.mode = "auto";
    deepSeekConfig.apiKey = "";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(askDeepSeekWithLocalRag(ragQuery, { assets, chapters, chunks }))
      .rejects.toThrow(deepSeekKeySetupMessage);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps provider authentication failures without exposing a key or provider payload", async () => {
    enableDirectCallForTest();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      error: {
        message: "provider diagnostic containing test-key and a serialized request body"
      }
    }, 401));

    const error = await askDeepSeekWithLocalRag(ragQuery, { assets, chapters, chunks })
      .catch((failure: unknown) => failure);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(error).toBeInstanceOf(DeepSeekDirectError);
    expect(String((error as Error).message)).toContain("DeepSeek API Key 无效");
    expect(String((error as Error).message)).not.toContain("test-key");
    expect(String((error as Error).message)).not.toContain("serialized request body");
  });

  it("maps fetch failures to a controlled connection error without exposing request data", async () => {
    enableDirectCallForTest();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("network failure containing test-key and DNA 的碱基互补配对是什么？")
    );

    const error = await askDeepSeekWithLocalRag(ragQuery, { assets, chapters, chunks })
      .catch((failure: unknown) => failure);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(error).toBeInstanceOf(DeepSeekDirectError);
    expect(String((error as Error).message)).toContain("无法连接 DeepSeek");
    expect(String((error as Error).message)).not.toContain("test-key");
    expect(String((error as Error).message)).not.toContain(ragQuery.question);
  });

  it("creates a citation from local metadata rather than model-generated page data", () => {
    const [ranked] = rankLocalChunks("DNA 的碱基互补配对", chunks, "chapter-genetics");
    if (!ranked) throw new Error("Expected a local textbook chunk");

    expect(createLocalCitation(ranked, chapters)).toMatchObject({
      chapter_id: "chapter-genetics",
      chapter_title: "遗传的分子基础",
      chunk_id: "dna-structure",
      location_label: "教材第 13 页（PDF 第 15 页）",
      page: 15,
      retrieval_method: "on-device-keyword-rag"
    });
  });
});

describe("offline demo fallback", () => {
  it("answers simple greetings without citations or a network request when no key exists", async () => {
    deepSeekConfig.mode = "auto";
    deepSeekConfig.apiKey = "";
    const repository = new DemoRepository();
    const fetchMock = vi.spyOn(globalThis, "fetch");

    for (const question of ["你好", "嗨！", "早上好"]) {
      const response = await repository.queryRag({
        book_id: "book_biology_2",
        chapter_id: "c2s1",
        question
      });
      expect(response.answer).toContain("你好");
      expect(response.citations).toEqual([]);
      expect(response.related_assets).toEqual([]);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the existing fixed demo answer for an explicit textbook question", async () => {
    deepSeekConfig.mode = "demo";
    const repository = new DemoRepository();

    const response = await repository.queryRag({
      book_id: "book_biology_2",
      chapter_id: "c2s1",
      question: "请结合原文给一个受精作用的例子"
    });

    expect(response.citations[0]).toMatchObject({
      chunk_id: "chunk_c2s1_19",
      page: 19,
      location_label: "教材第 24 页（PDF 第 19 页）"
    });
  });
});
