export interface LumatoneKey {
  section: number;
  local_key_index: number;
  local_axial: { q: number; r: number };
  local_pixel_center: { x: number; y: number };
  global_pixel_center?: { x: number; y: number };
  channel_delta?: number;
  midi_note: number;
  color_name?: string;
  color_hex: string;
  pitch: number;
  channel: number;
}

export interface LumatoneData {
  base_section_layout: Record<string, unknown>[];
  global_keys?: LumatoneKey[];
  metadata: {
    channel_offsets_used_for_pitch: Record<string, number>;
  };
}

// Hex center-to-center distance in all layout JSONs is ~59.4px.
// For adjacent flat-edge hexes to tessellate: radius = dist / sqrt(3).
// 59.4 / sqrt(3) ≈ 34.3. We use 34.5 for a slight overlap that hides
// sub-pixel gaps from section stitching corrections.
const HEX_RADIUS = 34.5;

export interface ComputedKey {
  pitch: number;
  section: number;
  color_hex: string;
  x: number;
  y: number;
  midi_note: number;
  channel: number;
  local_key_index: number;
}

export interface LayoutResult {
  keys: ComputedKey[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function computeLayout(data: LumatoneData): LayoutResult {
  if (data.global_keys && data.global_keys.length > 0) {
    return computeFromGlobalKeys(data.global_keys);
  }
  return { keys: [], minX: 0, maxX: 800, minY: 0, maxY: 200 };
}

const SECTION_X_STEP = 360;
// The JSON section offsets are (360, 0) per section, but actual cross-section
// adjacent keys have step (6, -68). The nearest valid hex axis is (16, -56).
// Correction needed: +10px X and +12px Y per section boundary.
const SECTION_X_CORRECTION = 10;
const SECTION_Y_CORRECTION = 12;

function computeFromGlobalKeys(globalKeys: LumatoneKey[]): LayoutResult {
  const computed: ComputedKey[] = globalKeys.map(k => {
    const gpc = k.global_pixel_center;
    const sc = k.section - 1;
    // global_pixel_center encodes X spread correctly but cross-section adjacent keys
    // need a nudge of (+10, +12) per boundary to land on the true hex grid.
    // Y correction is centered around section 3 (sc=2) so the overall tilt stays subtle.
    const x = gpc
      ? gpc.x + sc * SECTION_X_CORRECTION
      : k.local_pixel_center.x + sc * SECTION_X_STEP + sc * SECTION_X_CORRECTION;
    const y = gpc
      ? gpc.y + (sc - 2) * SECTION_Y_CORRECTION
      : k.local_pixel_center.y + sc * SECTION_Y_CORRECTION;
    return {
      pitch: k.pitch,
      section: k.section,
      color_hex: k.color_hex,
      x,
      y,
      midi_note: k.midi_note,
      channel: k.channel,
      local_key_index: k.local_key_index,
    };
  });

  const xs = computed.map(k => k.x);
  const ys = computed.map(k => k.y);
  return {
    keys: computed,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export { HEX_RADIUS };
