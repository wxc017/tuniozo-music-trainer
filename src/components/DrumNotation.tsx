import React from "react";
import { GridType, GRID_SUBDIVS } from "@/lib/drumData";

// ── Staff / layout constants ───────────────────────────────────────────────
//
//  y=  0  HH beam anchor (stem tops)
//  y= 12  HH notehead  (above staff, on a space)
//  y= 26  Staff line 5 (top)
//  y= 34  Staff line 4
//  y= 42  Staff line 3  ← snare notehead
//  y= 50  Staff line 2
//  y= 58  Staff line 1 (bottom)
//  y= 70  Bass drum notehead (below staff, with ledger line)
//  y= 82  BD beam anchor (stem bottoms)
//
const SVG_H = 110;

const HH_Y       = 12;
const HH_BEAM_Y  = 0;

const STAFF_LINES = [26, 34, 42, 50, 58] as const;
const SN_Y       = 42;
const SN_BEAM_Y  = 18;

const BD_Y       = 70;
const BD_BEAM_Y  = 82;

// ── Helpers ────────────────────────────────────────────────────────────────

const nx = (i: number, cw: number) => i * cw + cw / 2;

// ── Props ──────────────────────────────────────────────────────────────────

interface DrumNotationProps {
  grid: GridType;
  hhHits?: number[];
  hhOpen?: number[];
  snareHits?: number[];
  ghostHits?: number[];
  doubleHits?: number[];
  bassHits?: number[];
  cellWidth?: number;
  showHH?: boolean;
  showSN?: boolean;
  showBD?: boolean;
  interactive?: boolean;
  onToggleSnare?: (pos: number) => void;
  onToggleBass?: (pos: number) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DrumNotation({
  grid = "16th",
  hhHits = [],
  hhOpen = [],
  snareHits = [],
  ghostHits = [],
  doubleHits = [],
  bassHits = [],
  cellWidth = 18,
  showHH = true,
  showSN = true,
  showBD = true,
  interactive = false,
  onToggleSnare,
  onToggleBass,
}: DrumNotationProps) {
  const subdivs  = GRID_SUBDIVS[grid];
  const beatSize = grid === "16th" ? 4 : grid === "triplet" ? 3 : grid === "quintuplet" ? 5 : grid === "septuplet" ? 7 : grid === "32nd" ? 8 : 2;
  const numBeats = subdivs / beatSize;
  const W = subdivs * cellWidth;

  // ── Proportional scale ──────────────────────────────────────────────────
  const sc = Math.max(1, Math.min(3.5, cellWidth / 18));

  const nhRx    = 4.5 + (sc - 1) * 1.8;   // square half-size x
  const nhRy    = 3.5 + (sc - 1) * 1.4;   // square half-size y (keep for stem calc)
  const xSz     = 5   + (sc - 1) * 2.5;   // × arm half-length
  const xStroke = Math.min(3, 1.8 + (sc - 1) * 0.5);  // × stroke width
  const beamThick = Math.min(6, 3.5 + (sc - 1) * 1.3);
  const beamGap   = Math.min(10, 4.5 + (sc - 1) * 2.2);
  const stemW   = Math.min(2.5, 1.5 + (sc - 1) * 0.4);
  const flagW   = 7 * sc;
  const flagH   = 5.5 * sc;
  const flagH2  = 4 * sc;

  // ── Beam count per grid ─────────────────────────────────────────────────
  // 8th → 1 beam, triplet → 1 beam, 16th/quintuplet/septuplet → 2 beams
  const beamCount = beatSize === 8 ? 3 : (beatSize === 4 || beatSize === 5 || beatSize === 7) ? 2 : 1;

  // ── Notes in a beat group ───────────────────────────────────────────────
  const inBeat = (arr: number[], b: number) =>
    arr.filter(h => h >= b * beatSize && h < (b + 1) * beatSize);

  // ── Voice renderer ───────────────────────────────────────────────────────
  function renderVoice(
    hits: number[],
    noteY: number,
    beamAnchorY: number,
    stemDir: "up" | "down",
    noteType: "x" | "open-x" | "fill" | "ghost" | "double",
    color: string,
    keySuffix: string,
  ) {
    if (hits.length === 0) return null;

    const fd = stemDir === "up" ? 1 : -1;

    // Stem: from notehead edge to beam anchor
    const stemStart = stemDir === "up"
      ? noteY - nhRy + 1
      : noteY + nhRy - 1;
    const stemEnd = stemDir === "up"
      ? beamAnchorY + 3
      : beamAnchorY - 3;

    const elems: React.ReactNode[] = [];

    // ── Stems ──────────────────────────────────────────────────────────
    for (const i of hits) {
      elems.push(
        <line key={`st-${keySuffix}-${i}`}
          x1={nx(i, cellWidth)} y1={stemStart}
          x2={nx(i, cellWidth)} y2={stemEnd}
          stroke={color} strokeWidth={stemW} />,
      );
    }

    // ── Beams / flags per beat group ────────────────────────────────────
    for (let b = 0; b < numBeats; b++) {
      const grp = inBeat(hits, b);
      if (grp.length === 0) continue;

      if (grp.length >= 2) {
        const x1 = nx(grp[0], cellWidth);
        const x2 = nx(grp[grp.length - 1], cellWidth);
        // Draw beamCount beams
        for (let bm = 0; bm < beamCount; bm++) {
          elems.push(
            <line key={`bm${bm}-${keySuffix}-${b}`}
              x1={x1} y1={stemEnd + fd * beamGap * bm}
              x2={x2} y2={stemEnd + fd * beamGap * bm}
              stroke={color} strokeWidth={beamThick} />,
          );
        }
        // Sub-beam pairs (secondary 16th beam only connects consecutive pairs)
        if (beamCount >= 2) {
          for (let k = 0; k < grp.length - 1; k += 2) {
            if (k + 1 < grp.length) {
              const sx1 = nx(grp[k], cellWidth);
              const sx2 = nx(grp[k + 1], cellWidth);
              elems.push(
                <line key={`sb-${keySuffix}-${b}-${k}`}
                  x1={sx1} y1={stemEnd + fd * beamGap * beamCount}
                  x2={sx2} y2={stemEnd + fd * beamGap * beamCount}
                  stroke={color} strokeWidth={beamThick * 0.8} opacity={0.65} />,
              );
            }
          }
        }
      } else {
        // Isolated note: draw beamCount flags
        const x = nx(grp[0], cellWidth);
        const anchor = stemEnd;
        for (let fl = 0; fl < beamCount; fl++) {
          const offset = fl * flagH2 * fd;
          elems.push(
            <path key={`fl${fl}-${keySuffix}-${b}`}
              d={`M ${x} ${anchor + offset} Q ${x + flagW * 0.7} ${anchor + offset + fd * flagH * 0.5} ${x + flagW} ${anchor + offset + fd * flagH}`}
              stroke={color} strokeWidth={stemW * 1.1} fill="none" />,
          );
        }
      }
    }

    // ── Noteheads ────────────────────────────────────────────────────────
    for (const i of hits) {
      const x = nx(i, cellWidth);
      if (noteType === "x") {
        // Hi-hat closed: bold ×
        elems.push(
          <line key={`na-${keySuffix}-${i}`}
            x1={x - xSz} y1={noteY - xSz} x2={x + xSz} y2={noteY + xSz}
            stroke={color} strokeWidth={xStroke} strokeLinecap="round" />,
          <line key={`nb-${keySuffix}-${i}`}
            x1={x + xSz} y1={noteY - xSz} x2={x - xSz} y2={noteY + xSz}
            stroke={color} strokeWidth={xStroke} strokeLinecap="round" />,
        );
      } else if (noteType === "open-x") {
        // Hi-hat open: circle
        const r = nhRx * 1.05;
        elems.push(
          <circle key={`nh-${keySuffix}-${i}`}
            cx={x} cy={noteY} r={r}
            fill="none" stroke={color} strokeWidth={xStroke * 0.9} />,
        );
      } else if (noteType === "ghost") {
        // Ghost: small circle outline + parentheses
        const r  = nhRx * 0.82;
        const pOff = r + 2.5;
        const fs = Math.max(9, r * 2.8);
        elems.push(
          <circle key={`nh-${keySuffix}-${i}`}
            cx={x} cy={noteY} r={r}
            fill="none" stroke={color} strokeWidth={1.2} opacity={0.55} />,
          <text key={`p1-${keySuffix}-${i}`}
            x={x - pOff} y={noteY + r * 0.4 + 1}
            fill={color} fontSize={fs} fontFamily="serif"
            textAnchor="middle" opacity={0.55}>(</text>,
          <text key={`p2-${keySuffix}-${i}`}
            x={x + pOff} y={noteY + r * 0.4 + 1}
            fill={color} fontSize={fs} fontFamily="serif"
            textAnchor="middle" opacity={0.55}>)</text>,
        );
      } else if (noteType === "double") {
        // Double stroke: two small squares stacked just above the note head
        const sw = nhRx * 0.9;
        const sh = nhRy * 0.75;
        const gap = 2;
        const topEdge = noteY - nhRy - gap;
        elems.push(
          <rect key={`na-${keySuffix}-${i}`}
            x={x - sw} y={topEdge - sh * 4 - 1}
            width={sw * 2} height={sh * 2}
            fill={color} opacity={0.85} rx={1} />,
          <rect key={`nb-${keySuffix}-${i}`}
            x={x - sw} y={topEdge - sh * 2}
            width={sw * 2} height={sh * 2}
            fill={color} opacity={0.85} rx={1} />,
        );
      } else {
        // Default filled notehead: square with slightly rounded corners
        elems.push(
          <rect key={`nh-${keySuffix}-${i}`}
            x={x - nhRx} y={noteY - nhRy}
            width={nhRx * 2} height={nhRy * 2}
            fill={color} rx={1.5} />,
        );
      }
    }

    return <>{elems}</>;
  }

  const pureGhosts  = ghostHits.filter(g => !snareHits.includes(g) && !doubleHits.includes(g));
  const pureDoubles = doubleHits.filter(d => !snareHits.includes(d));
  const hasBD = bassHits.length > 0;

  return (
    <svg width={W} height={SVG_H} style={{ display: "block", overflow: "visible" }}>

      {/* ── 5-line staff (always visible) ─────────────────────────── */}
      {STAFF_LINES.map(y => (
        <line key={y} x1={0} y1={y} x2={W} y2={y}
          stroke="#2e2e2e" strokeWidth={1} />
      ))}

      {/* BD ledger line */}
      {showBD && hasBD && (
        <line x1={0} y1={BD_Y} x2={W} y2={BD_Y}
          stroke="#252525" strokeWidth={0.8} />
      )}

      {/* Beat bar lines */}
      {Array.from({ length: numBeats + 1 }, (_, b) => {
        const isEdge = b === 0 || b === numBeats;
        return (
          <line key={b}
            x1={b * beatSize * cellWidth} y1={STAFF_LINES[0] - 2}
            x2={b * beatSize * cellWidth} y2={STAFF_LINES[4] + 2}
            stroke={isEdge ? "#444" : "#202020"}
            strokeWidth={isEdge ? 1.5 : 1} />
        );
      })}

      {/* ── Hi-hat closed (×) ──────────────────────────────────────── */}
      {showHH && renderVoice(hhHits, HH_Y, HH_BEAM_Y, "up", "x", "#7aaa7a", "hh")}

      {/* ── Hi-hat open (○) ────────────────────────────────────────── */}
      {showHH && renderVoice(hhOpen, HH_Y, HH_BEAM_Y, "up", "open-x", "#e0a040", "hho")}

      {/* ── Ghost snare ────────────────────────────────────────────── */}
      {showSN && renderVoice(pureGhosts, SN_Y, SN_BEAM_Y, "up", "ghost", "#6060aa", "gh")}

      {/* ── Double strokes ─────────────────────────────────────────── */}
      {showSN && renderVoice(pureDoubles, SN_Y, SN_BEAM_Y, "up", "double", "#c8a050", "db")}

      {/* ── Snare ──────────────────────────────────────────────────── */}
      {showSN && renderVoice(snareHits, SN_Y, SN_BEAM_Y, "up", "fill", "#9999ee", "sn")}

      {/* ── Bass drum ──────────────────────────────────────────────── */}
      {showBD && renderVoice(bassHits, BD_Y, BD_BEAM_Y, "down", "fill", "#e06060", "bd")}

      {/* ── Interactive hit zones ──────────────────────────────────── */}
      {interactive && showSN && Array.from({ length: subdivs }, (_, i) => (
        <rect key={`si-${i}`}
          x={i * cellWidth + 1} y={SN_Y - 18}
          width={cellWidth - 2} height={36}
          rx={3}
          fill="#9999ee"
          fillOpacity={snareHits.includes(i) ? 0.12 : 0}
          stroke={snareHits.includes(i) ? "#9999ee" : "transparent"}
          strokeWidth={0.5}
          cursor="pointer"
          style={{ userSelect: "none" }}
          onClick={() => onToggleSnare?.(i)} />
      ))}
      {interactive && showBD && Array.from({ length: subdivs }, (_, i) => (
        <rect key={`bi-${i}`}
          x={i * cellWidth + 1} y={BD_Y - 18}
          width={cellWidth - 2} height={36}
          rx={3}
          fill="#e06060"
          fillOpacity={bassHits.includes(i) ? 0.12 : 0}
          stroke={bassHits.includes(i) ? "#e06060" : "transparent"}
          strokeWidth={0.5}
          cursor="pointer"
          style={{ userSelect: "none" }}
          onClick={() => onToggleBass?.(i)} />
      ))}
    </svg>
  );
}
