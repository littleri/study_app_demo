import { describe, expect, it } from "vitest";
import { createSilentWavBlob, createStudyNoteId } from "./repository";

describe("study note repository helpers", () => {
  it("creates type-prefixed unique note ids", () => {
    const first = createStudyNoteId("voice");
    const second = createStudyNoteId("voice");
    expect(first).toMatch(/^voice-note-/u);
    expect(second).not.toBe(first);
  });

  it("creates a valid local WAV fallback with a RIFF header", async () => {
    const blob = createSilentWavBlob(1);
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44 + 8_000 * 2);
    const bytes = await blob.arrayBuffer();
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WAVE");
  });
});
