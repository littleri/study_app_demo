import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceReaderScreen } from "./SourceReaderScreen";

const contextMock = vi.hoisted(() => vi.fn());

vi.mock("../context/AppContext", () => ({
  useAppContext: contextMock
}));

vi.mock("../components/ui", async () => {
  const React = await import("react");
  return {
    Button: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("button", props, children),
    Card: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("section", props, children),
    Pill: ({ children }: { children: React.ReactNode }) => React.createElement("span", null, children)
  };
});

vi.mock("../motion", async () => {
  const React = await import("react");
  return {
    SkeletonReveal: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    useImageMotion: () => ({
      imageRef: { current: null },
      onError: vi.fn(),
      onLoad: vi.fn(),
      settleAnimation: vi.fn(),
      state: "ready"
    }),
    useLocalMotionItem: (motionKey: string) => ({
      attributes: {},
      motionKey,
      state: "idle"
    })
  };
});

function renderSourceReader({
  title,
  page,
  sourceText,
  chapters,
  locationLabel
}: {
  title: string;
  page: number;
  sourceText: string;
  chapters: Array<{ source_title: string; page_start: number; page_end: number }>;
  locationLabel: string;
}) {
  contextMock.mockReturnValue({
    back: vi.fn(),
    go: vi.fn(),
    parsedChapters: chapters.map((chapter, index) => ({
      ...chapter,
      chapter_id: `chapter-${index}`,
      ai_title: chapter.source_title,
      level: 1,
      confidence: 1,
      status: "ready",
      source: "fixture"
    })),
    parsedScanResult: {
      book_id: "book_biology_2",
      filename: "人教版高中生物必修2.pdf",
      file_type: "pdf",
      page_count: 125,
      has_text_layer: true,
      needs_ocr: false,
      source_unit: "page",
      source_locations: [{ index: page, label: locationLabel }],
      quality_warnings: []
    },
    sourcePageTarget: {
      bookId: "book_biology_2",
      title,
      pageStart: page,
      pageEnd: page,
      sourceText
    },
    showToast: vi.fn(),
    uploadedFile: {
      bookId: "book_biology_2",
      name: "人教版高中生物必修2.pdf"
    }
  });

  return renderToStaticMarkup(<SourceReaderScreen />);
}

afterEach(() => {
  contextMock.mockReset();
  vi.restoreAllMocks();
});

describe("SourceReaderScreen citation headings", () => {
  it("does not mislabel a front-matter citation as the missing chapter-one body", () => {
    const markup = renderSourceReader({
      title: "教材前言与目录",
      page: 3,
      sourceText: "本书目录与使用说明。",
      chapters: [{
        // This deliberately overlapping parser entry proves a citation title
        // wins over any page-number guess for front matter.
        source_title: "错误的前置页解析标题",
        page_start: 1,
        page_end: 9
      }],
      locationLabel: "PDF 第 3 页 · 目录"
    });

    expect(markup).toContain("教材前言与目录");
    expect(markup).not.toContain("第 1 章");
    expect(markup).not.toContain("错误的前置页解析标题");
    expect(markup).toContain("PDF 第 3 页 · 目录");
  });

  it("renders the actual citation chapter title and mapped PDF page", () => {
    const markup = renderSourceReader({
      title: "第 3 章 基因的本质",
      page: 40,
      sourceText: "赫尔希和蔡斯的实验表明 DNA 是遗传物质。",
      chapters: [{
        source_title: "错误的页面猜测标题",
        page_start: 40,
        page_end: 40
      }],
      locationLabel: "PDF 第 40 页 · 第 3 章 基因的本质"
    });

    expect(markup).toContain("第 3 章 基因的本质");
    expect(markup).not.toContain("错误的页面猜测标题");
    expect(markup).toContain("PDF 第 40 页 · 第 3 章 基因的本质");
  });
});
