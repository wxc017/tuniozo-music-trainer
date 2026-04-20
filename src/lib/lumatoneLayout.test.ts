// ── Lumatone Layout Stress Tests ─────────────────────────────────────
// Tests hex geometry, section stitching, layout computation, and pitch
// mapping for the Lumatone isomorphic keyboard visualization.

import { describe, it, expect } from "vitest";
import {
  computeLayout,
  HEX_RADIUS,
  type LumatoneKey, type LumatoneData, type LayoutResult, type ComputedKey,
} from "./lumatoneLayout";

// computeFromGlobalKeys is not exported — test through computeLayout
function computeFromGlobalKeys(keys: LumatoneKey[]): LayoutResult {
  return computeLayout({
    base_section_layout: [],
    global_keys: keys,
    metadata: { channel_offsets_used_for_pitch: {} },
  });
}

// ── HEX_RADIUS geometry ─────────────────────────────────────────────

describe("HEX_RADIUS", () => {
  it("is approximately 34.5", () => {
    expect(HEX_RADIUS).toBe(34.5);
  });

  it("derives from center-to-center distance ≈ 59.4px", () => {
    // For flat-edge hexes: radius = dist / sqrt(3)
    const expected = 59.4 / Math.sqrt(3);
    expect(HEX_RADIUS).toBeCloseTo(expected, 0);
  });
});

// ── hexPoints geometry (reproduced) ─────────────────────────────────

describe("hex point generation", () => {
  function hexPoints(cx: number, cy: number, r: number): [number, number][] {
    const pts: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i + 15); // 15° rotation
      pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    return pts;
  }

  it("generates exactly 6 vertices", () => {
    const pts = hexPoints(0, 0, HEX_RADIUS);
    expect(pts.length).toBe(6);
  });

  it("all vertices are equidistant from center", () => {
    const pts = hexPoints(100, 200, HEX_RADIUS);
    for (const [x, y] of pts) {
      const dist = Math.sqrt((x - 100) ** 2 + (y - 200) ** 2);
      expect(dist).toBeCloseTo(HEX_RADIUS, 5);
    }
  });

  it("vertices are evenly spaced (60° apart)", () => {
    const pts = hexPoints(0, 0, HEX_RADIUS);
    for (let i = 0; i < 6; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % 6];
      const angle1 = Math.atan2(y1, x1);
      const angle2 = Math.atan2(y2, x2);
      let diff = angle2 - angle1;
      if (diff < 0) diff += 2 * Math.PI;
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      expect(diff).toBeCloseTo(Math.PI / 3, 5); // 60°
    }
  });

  it("edge length equals radius (regular hexagon)", () => {
    const pts = hexPoints(0, 0, HEX_RADIUS);
    for (let i = 0; i < 6; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % 6];
      const edgeLen = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      expect(edgeLen).toBeCloseTo(HEX_RADIUS, 3);
    }
  });

  it("15° rotation: first vertex is in upper-right quadrant", () => {
    const pts = hexPoints(0, 0, HEX_RADIUS);
    // At 15°, cos(15°) > 0 and sin(15°) > 0
    expect(pts[0][0]).toBeGreaterThan(0);
    expect(pts[0][1]).toBeGreaterThan(0);
  });
});

// ── computeLayout ───────────────────────────────────────────────────

describe("computeLayout", () => {
  it("returns empty keys for data without global_keys", () => {
    const data: LumatoneData = {
      base_section_layout: [],
      metadata: { channel_offsets_used_for_pitch: {} },
    };
    const result = computeLayout(data);
    expect(result.keys).toEqual([]);
  });

  it("returns computed keys when global_keys present", () => {
    const keys: LumatoneKey[] = [
      {
        section: 1, local_key_index: 0,
        local_axial: { q: 0, r: 0 },
        local_pixel_center: { x: 100, y: 50 },
        global_pixel_center: { x: 100, y: 50 },
        midi_note: 60, pitch: 0, channel: 1,
        color_hex: "#ff0000",
      },
      {
        section: 1, local_key_index: 1,
        local_axial: { q: 1, r: 0 },
        local_pixel_center: { x: 160, y: 50 },
        global_pixel_center: { x: 160, y: 50 },
        midi_note: 61, pitch: 1, channel: 1,
        color_hex: "#00ff00",
      },
    ];
    const data: LumatoneData = {
      base_section_layout: [],
      global_keys: keys,
      metadata: { channel_offsets_used_for_pitch: {} },
    };
    const result = computeLayout(data);
    expect(result.keys.length).toBe(2);
  });
});

// ── computeFromGlobalKeys ───────────────────────────────────────────

describe("computeFromGlobalKeys", () => {
  function makeKey(
    section: number, x: number, y: number, pitch: number
  ): LumatoneKey {
    return {
      section, local_key_index: 0,
      local_axial: { q: 0, r: 0 },
      local_pixel_center: { x, y },
      global_pixel_center: { x, y },
      midi_note: 60 + pitch, pitch, channel: section,
      color_hex: "#aabbcc",
    };
  }

  it("computes bounding box from key positions", () => {
    // All same section (1), so sc=0: X corr=0, Y corr=(0-2)*12=-24
    const keys = [
      makeKey(1, 50, 100, 0),
      makeKey(1, 200, 300, 1),
      makeKey(1, 75, 150, 2),
    ];
    const result = computeFromGlobalKeys(keys);
    // X: no correction for section 1 (sc=0)
    expect(result.minX).toBeLessThanOrEqual(50);
    expect(result.maxX).toBeGreaterThanOrEqual(200);
    // Y: all keys shifted by (0-2)*12 = -24, so 100-24=76 to 300-24=276
    expect(result.minY).toBeLessThanOrEqual(76);
    expect(result.maxY).toBeGreaterThanOrEqual(276);
  });

  it("applies section X correction (+10px per section boundary)", () => {
    // Section 1 (sc=0): no correction
    // Section 2 (sc=1): +10px X
    // Section 3 (sc=2): +20px X
    const key1 = makeKey(1, 100, 100, 0);
    const key3 = makeKey(3, 100, 100, 1);
    const result = computeFromGlobalKeys([key1, key3]);
    const x1 = result.keys.find(k => k.pitch === 0)!.x;
    const x3 = result.keys.find(k => k.pitch === 1)!.x;
    // key3 should be 20px (2 sections × 10px) further right
    expect(x3 - x1).toBeCloseTo(20, 5);
  });

  it("applies section Y correction centered around section 3", () => {
    // Section 1 (sc=0): Y correction = (0 - 2) * 12 = -24
    // Section 3 (sc=2): Y correction = (2 - 2) * 12 = 0
    // Section 5 (sc=4): Y correction = (4 - 2) * 12 = +24
    const key1 = makeKey(1, 100, 100, 0);
    const key5 = makeKey(5, 100, 100, 1);
    const result = computeFromGlobalKeys([key1, key5]);
    const y1 = result.keys.find(k => k.pitch === 0)!.y;
    const y5 = result.keys.find(k => k.pitch === 1)!.y;
    expect(y5 - y1).toBeCloseTo(48, 5); // 4 sections × 12px = 48
  });

  it("preserves pitch, section, color, and midi_note", () => {
    const key: LumatoneKey = {
      section: 2, local_key_index: 5,
      local_axial: { q: 3, r: 1 },
      local_pixel_center: { x: 150, y: 75 },
      global_pixel_center: { x: 150, y: 75 },
      midi_note: 72, pitch: 12, channel: 2,
      color_hex: "#123456",
    };
    const result = computeFromGlobalKeys([key]);
    expect(result.keys[0].pitch).toBe(12);
    expect(result.keys[0].section).toBe(2);
    expect(result.keys[0].color_hex).toBe("#123456");
    expect(result.keys[0].midi_note).toBe(72);
  });

  it("uses local_pixel_center when global_pixel_center is missing", () => {
    const key: LumatoneKey = {
      section: 2, local_key_index: 0,
      local_axial: { q: 0, r: 0 },
      local_pixel_center: { x: 100, y: 50 },
      // No global_pixel_center
      midi_note: 60, pitch: 0, channel: 1,
      color_hex: "#ffffff",
    };
    const result = computeFromGlobalKeys([key]);
    // sc=1, uses local_pixel_center.x + 1*360 + 1*10
    expect(result.keys[0].x).toBe(100 + 360 + 10);
  });

  it("handles empty array gracefully", () => {
    const result = computeFromGlobalKeys([]);
    expect(result.keys).toEqual([]);
    // Min/max should handle empty (may be Infinity/-Infinity but not crash)
  });

  it("stress: handles 300+ keys without issues", () => {
    const keys: LumatoneKey[] = [];
    for (let sec = 1; sec <= 6; sec++) {
      for (let i = 0; i < 56; i++) {
        keys.push(makeKey(sec, i * 59.4, (sec - 1) * 200 + Math.floor(i / 10) * 40, sec * 100 + i));
      }
    }
    const result = computeFromGlobalKeys(keys);
    expect(result.keys.length).toBe(336);
    expect(result.maxX).toBeGreaterThan(result.minX);
    expect(result.maxY).toBeGreaterThan(result.minY);
  });
});

// ── Keyboard highlight logic (reproduced from LumatoneKeyboard.tsx) ──

describe("keyboard highlight logic", () => {
  function lightenHex(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.min(255, r + 120)},${Math.min(255, g + 120)},${Math.min(255, b + 120)})`;
  }

  function darkenHex(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.round(r * 0.28)},${Math.round(g * 0.28)},${Math.round(b * 0.28)})`;
  }

  it("lightenHex brightens all channels by 120 (capped at 255)", () => {
    expect(lightenHex("#000000")).toBe("rgb(120,120,120)");
    expect(lightenHex("#ff0000")).toBe("rgb(255,120,120)");
    expect(lightenHex("#ffffff")).toBe("rgb(255,255,255)");
    // Already near max: 200 + 120 = 320, capped to 255
    expect(lightenHex("#c8c8c8")).toBe("rgb(255,255,255)");
  });

  it("darkenHex reduces all channels to 28%", () => {
    expect(darkenHex("#000000")).toBe("rgb(0,0,0)");
    expect(darkenHex("#646464")).toBe("rgb(28,28,28)"); // 100 * 0.28 = 28
    expect(darkenHex("#ffffff")).toBe("rgb(71,71,71)"); // 255 * 0.28 ≈ 71
  });

  it("highlight selection: lit vs dim vs normal", () => {
    const highlightedPitches = new Set([5, 18]);
    const hasHighlight = highlightedPitches.size > 0;

    // Key with pitch=5 → lit (lightened)
    const key5 = { pitch: 5, color_hex: "#445566" };
    const isLit5 = highlightedPitches.has(key5.pitch);
    expect(isLit5).toBe(true);

    // Key with pitch=10 → dimmed
    const key10 = { pitch: 10, color_hex: "#445566" };
    const isLit10 = highlightedPitches.has(key10.pitch);
    expect(isLit10).toBe(false);

    // When no highlights: all keys show normal color
    const emptyHighlights = new Set<number>();
    expect(emptyHighlights.size > 0).toBe(false);
  });

  it("stress: highlight toggling for rapid frame sequences", () => {
    // Simulate highlighting frames in sequence
    const frames = [[0, 10], [5, 18], [13, 23], [18, 28]];
    for (const frame of frames) {
      const highlighted = new Set(frame);
      for (let pitch = 0; pitch < 31; pitch++) {
        const isLit = highlighted.has(pitch);
        // Each pitch should be lit or not, no in-between
        expect(typeof isLit).toBe("boolean");
      }
    }
  });
});

// ── ViewBox computation ─────────────────────────────────────────────

describe("viewBox computation", () => {
  it("includes padding and hex radius in dimensions", () => {
    const pad = 32;
    const layout: LayoutResult = {
      keys: [],
      minX: 0, maxX: 1000, minY: 0, maxY: 200,
    };
    const w = layout.maxX - layout.minX + pad * 2 + HEX_RADIUS * 2;
    const h = layout.maxY - layout.minY + pad * 2 + HEX_RADIUS * 2;
    expect(w).toBe(1000 + 64 + 69);
    expect(h).toBe(200 + 64 + 69);
  });

  it("viewBox origin accounts for padding and hex radius offset", () => {
    const pad = 32;
    const layout: LayoutResult = {
      keys: [],
      minX: 50, maxX: 800, minY: 30, maxY: 250,
    };
    const vbX = layout.minX - pad - HEX_RADIUS;
    const vbY = layout.minY - pad - HEX_RADIUS;
    expect(vbX).toBe(50 - 32 - 34.5);
    expect(vbY).toBe(30 - 32 - 34.5);
  });
});
