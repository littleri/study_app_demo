import { describe, expect, it } from "vitest";
import { containImageRect, normalizedInkPoint, strokeHitTest } from "./ink";
import type { InkStroke } from "./types";

describe("normalized ink coordinates", () => {
  it("maps a textbook image to its actual contained rectangle in portrait and landscape", () => {
    const portrait = containImageRect(600, 800, 650, 920);
    const landscape = containImageRect(800, 600, 650, 920);
    expect(portrait.width).toBeCloseTo(565.22, 1);
    expect(portrait.left).toBeCloseTo(17.39, 1);
    expect(landscape.height).toBe(600);
    expect(landscape.left).toBeCloseTo(188.04, 1);
    for (const rectangle of [portrait, landscape]) {
      const center = normalizedInkPoint(rectangle.left + rectangle.width / 2, rectangle.top + rectangle.height / 2, rectangle);
      expect(center.x).toBeCloseTo(0.5);
      expect(center.y).toBeCloseTo(0.5);
    }
  });

  it("stores points relative to the textbook image rather than screen pixels", () => {
    const point = normalizedInkPoint(250, 375, { left: 50, top: 75, width: 400, height: 600 }, 0.7, 123);
    expect(point).toEqual({ x: 0.5, y: 0.5, pressure: 0.7, t: 123 });
  });

  it("clamps input outside the drawable page", () => {
    expect(normalizedInkPoint(-10, 900, { left: 0, top: 0, width: 400, height: 600 }, 1.5, 1))
      .toEqual({ x: 0, y: 1, pressure: 1, t: 1 });
  });
});

describe("whole-stroke eraser hit testing", () => {
  const stroke: InkStroke = {
    id: "stroke-1",
    tool: "pen",
    color: "#7c3aed",
    width: 0.006,
    opacity: 0.92,
    points: [
      { x: 0.1, y: 0.2, pressure: 0.5, t: 1 },
      { x: 0.9, y: 0.2, pressure: 0.5, t: 2 }
    ]
  };

  it("matches a point near any line segment", () => {
    expect(strokeHitTest(stroke, { x: 0.5, y: 0.205, pressure: 0.5, t: 3 })).toBe(true);
  });

  it("does not erase an unrelated stroke", () => {
    expect(strokeHitTest(stroke, { x: 0.5, y: 0.4, pressure: 0.5, t: 3 })).toBe(false);
  });
});
