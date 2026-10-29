import { describe, it, expect } from "vitest";
import { dragTransform, hitTransform } from "../src/tools/free-transform";
const frame = [
  { x: 10, y: 20 },
  { x: 110, y: 20 },
  { x: 110, y: 70 },
  { x: 10, y: 70 },
];
describe("Free transform gestures", () => {
  it("rotates outside a rotated frame, moves inside and prioritizes handles", () => {
    const diamond=[{x:0,y:50},{x:50,y:0},{x:100,y:50},{x:50,y:100}];
    expect(hitTransform(diamond,{x:50,y:50},1,true).action).toBe("move");
    expect(hitTransform(diamond,{x:5,y:5},1,true).action).toBe("rotate");
    expect(hitTransform(diamond,{x:180,y:100},1,true).action).toBe("rotate");
    expect(hitTransform(diamond,diamond[0],1,true).action).toBe("scale");
    expect(hitTransform(diamond,diamond[0],1,true,true).action).toBe("distort");
    expect(hitTransform(frame,{x:110,y:45},1,true,true)).toEqual({action:"scale",handle:5});
  });
  it("snaps Ctrl movement to 10 texture pixels without changing the frame", () => {
    const start = { x: 60, y: 45 }, end = { x: 73, y: 34 };
    const moved = dragTransform(frame, start, end, { action: "move", handle: -1 }, false, false, true);
    expect(moved).toEqual(frame.map(p => ({x: p.x + 10, y: p.y - 10})));
    const unsnapped = dragTransform(frame, start, end, { action: "move", handle: -1 }, false, false, false);
    expect(unsnapped[0]).toEqual({x: 23, y: 9});
  });
  it("snaps Ctrl rotation to 5 degrees in both directions, taking priority over Shift", () => {
    for (const [degrees, expected] of [[7, 5], [8, 10], [-8, -10]]) {
      const angle = degrees * Math.PI / 180;
      const next = dragTransform(frame, {x: 110, y: 45},
        {x: 60 + 50 * Math.cos(angle), y: 45 + 50 * Math.sin(angle)},
        {action: "rotate", handle: -1}, true, false, true);
      expect(Math.atan2(next[1].y-next[0].y, next[1].x-next[0].x) * 180 / Math.PI).toBeCloseTo(expected);
      expect((next[0].x + next[2].x) / 2).toBeCloseTo(60);
      expect((next[0].y + next[2].y) / 2).toBeCloseTo(45);
      expect(Math.hypot(next[1].x-next[0].x, next[1].y-next[0].y)).toBeCloseTo(100);
    }
  });
  it("snaps an already rotated frame to an absolute 5 degree angle", () => {
    const at = (degrees: number) => ({x: 60 + 50 * Math.cos(degrees * Math.PI / 180), y: 45 + 50 * Math.sin(degrees * Math.PI / 180)});
    const initial = dragTransform(frame, at(0), at(7), {action: "rotate", handle: -1}, false, false);
    const next = dragTransform(initial, at(7), at(8), {action: "rotate", handle: -1}, false, false, true);
    expect(Math.atan2(next[1].y-next[0].y, next[1].x-next[0].x) * 180 / Math.PI).toBeCloseTo(10);
  });
  it("scales a corner proportionally around its opposite corner", () => {
    const next = dragTransform(
      frame,
      frame[2],
      { x: 210, y: 120 },
      { action: "scale", handle: 2 },
      false,
      false,
    );
    expect(next).toEqual([
      { x: 10, y: 20 },
      { x: 210, y: 20 },
      { x: 210, y: 120 },
      { x: 10, y: 120 },
    ]);
  });
  it("allows Shift nonuniform scaling and Alt center scaling", () => {
    expect(
      dragTransform(
        frame,
        frame[2],
        { x: 210, y: 95 },
        { action: "scale", handle: 2 },
        true,
        false,
      )[2],
    ).toEqual({ x: 210, y: 95 });
    const next = dragTransform(
      frame,
      frame[2],
      { x: 160, y: 95 },
      { action: "scale", handle: 2 },
      false,
      true,
    );
    expect(next[0]).toEqual({ x: -40, y: -5 });
    expect(next[2]).toEqual({ x: 160, y: 95 });
  });
  it("rotates around the center and scales along rotated frame axes", () => {
    const rotated = dragTransform(
      frame,
      { x: 110, y: 45 },
      { x: 60, y: 95 },
      { action: "rotate", handle: -1 },
      false,
      false,
    );
    expect(rotated[0].x).toBeCloseTo(85);
    expect(rotated[0].y).toBeCloseTo(-5);
    const next = dragTransform(
      rotated,
      rotated[2],
      { x: -15, y: 195 },
      { action: "scale", handle: 2 },
      false,
      false,
    );
    expect(next[0]).toEqual(rotated[0]);
    expect(
      Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y),
    ).toBeCloseTo(200);
  });
  it("moves one corner for distortion without resampling the other corners", () => {
    const next = dragTransform(
      frame,
      frame[0],
      { x: 30, y: 10 },
      { action: "distort", handle: 0 },
      false,
      false,
    );
    expect(next[0]).toEqual({ x: 30, y: 10 });
    expect(next.slice(1)).toEqual(frame.slice(1));
  });
  it("snaps side scaling to 10-pixel dimensions and preserves the fixed edge", () => {
    const hit = { action: "scale" as const, handle: 5 };
    const next = dragTransform(frame, {x:110,y:45}, {x:123,y:45}, hit, false, false, true);
    expect(next[0]).toEqual(frame[0]); expect(next[3]).toEqual(frame[3]);
    expect(next[1].x-next[0].x).toBeCloseTo(110);
    expect(next[2].y-next[1].y).toBeCloseTo(50);
    const free = dragTransform(frame, {x:110,y:45}, {x:123,y:45}, hit, false, false, false);
    expect(free[1].x-free[0].x).toBeCloseTo(113);
  });
  it("snaps proportional, nonuniform and centered corner scaling", () => {
    const hit = {action:"scale" as const,handle:2};
    const next = dragTransform(frame, frame[2], {x:123,y:76.5}, hit, false, false, true);
    expect(next[0]).toEqual(frame[0]);
    expect(next[1].x-next[0].x).toBeCloseTo(110);
    expect(next[2].y-next[1].y).toBeCloseTo(55);
    const stretch = dragTransform(frame, frame[2], {x:123,y:87}, hit, true, false, true);
    expect(stretch[1].x-stretch[0].x).toBeCloseTo(110);
    expect(stretch[2].y-stretch[1].y).toBeCloseTo(70);
    const centered = dragTransform(frame, frame[2], {x:123,y:76.5}, hit, false, true, true);
    expect((centered[0].x+centered[2].x)/2).toBeCloseTo(60);
    expect((centered[0].y+centered[2].y)/2).toBeCloseTo(45);
    expect(centered[1].x-centered[0].x).toBeCloseTo(130);
  });
  it("snaps resizing along rotated axes and keeps mirrored scales finite", () => {
    const rotated=frame.map(p=>({x:-p.y,y:p.x}));
    const next=dragTransform(rotated,{x:-45,y:110},{x:-45,y:123},{action:"scale",handle:5},false,false,true);
    expect(next[0]).toEqual(rotated[0]);
    expect(Math.hypot(next[1].x-next[0].x,next[1].y-next[0].y)).toBeCloseTo(110);
    const mirrored=dragTransform(frame,{x:110,y:45},{x:-3,y:45},{action:"scale",handle:5},false,false,true);
    expect(mirrored[1].x-mirrored[0].x).toBeCloseTo(-10);
    const tiny=dragTransform(frame,{x:110,y:45},{x:10,y:45},{action:"scale",handle:5},false,false,true);
    expect(tiny.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);
    expect(tiny[1].x-tiny[0].x).toBeCloseTo(10);
  });
});
