import { describe, expect, it } from "vitest";
import { hitShape, rotateAround, shapeFrame } from "../src/tools/shape-geometry";

describe("Editable shape geometry", () => {
  it("keeps the frame size when corners rotate about the centre", () => {
    const a = { x: 0, y: 0 }, b = { x: 40, y: 20 }, c = { x: 20, y: 10 }, angle = Math.PI / 2;
    const frame = shapeFrame(rotateAround(a, c, angle), rotateAround(b, c, angle), angle);
    expect(frame.halfWidth).toBeCloseTo(20);
    expect(frame.halfHeight).toBeCloseTo(10);
    expect(frame.corners[0].x).toBeCloseTo(30);
    expect(frame.corners[0].y).toBeCloseTo(-10);
  });
  it("separates the body, the rotation ring and empty space", () => {
    const a = { x: 0, y: 0 }, b = { x: 40, y: 20 };
    expect(hitShape("rect", a, b, 0, { x: 20, y: 10 }, 1, 6)).toBe("body");
    expect(hitShape("rect", a, b, 0, { x: 44, y: 10 }, 1, 6)).toBe("rotate");
    expect(hitShape("rect", a, b, 0, { x: 60, y: 10 }, 1, 6)).toBeNull();
    expect(hitShape("ellipse", a, b, 0, { x: 1, y: 1 }, 1, 6)).toBe("rotate");
    expect(hitShape("polygon", { x: 0, y: 0 }, { x: 10, y: 0 }, 0, { x: 0, y: 14 }, 1, 6)).toBe("rotate");
    expect(hitShape("line", a, b, 0, { x: 20, y: 11 }, 2, 6)).toBe("body");
    expect(hitShape("line", a, b, 0, { x: 20, y: 16 }, 2, 6)).toBeNull();
  });
});
