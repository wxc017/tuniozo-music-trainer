# Lumatone Layout JSON — Generation Guide

How to create a `lumatone_layout_Xedo.json` from a `.ltn` file for any EDO.

---

## 1. What the app needs

The app loads one JSON per EDO from `public/lumatone_layout_Xedo.json` (or `lumatone_layout.json` for 31-EDO). The file name is determined by `getLayoutFile(edo)` in `src/lib/edoData.ts`.

The JSON has this structure:

```json
{
  "metadata": {
    "edo": 41,
    "source": "...",
    "channel_offsets_used_for_pitch": {
      "1": -123, "2": -82, "3": -41, "4": 0, "5": 41, "6": 82
    }
  },
  "base_section_layout": [ /* section 1 keys */ ],
  "global_keys": [ /* all 280 keys across 5 sections */ ],
  "lookup_by_pitch": { /* pitch -> [{section, key_index, channel, midi_note}] */ },
  "section_x_step_used": 360
}
```

Each key entry in `global_keys`:

```json
{
  "section": 1,
  "local_key_index": 0,
  "channel": 1,
  "midi_note": 33,
  "pitch": -90,
  "local_axial": { "q": 0, "r": 0 },
  "local_pixel_center": { "x": 34.3, "y": 49.3 },
  "color_name": "dark_navy",
  "color_hex": "#020030",
  "global_axial": { "q": 0, "r": 0 },
  "global_pixel_center": { "x": 34.3, "y": 49.3 }
}
```

---

## 2. The .ltn file format

A `.ltn` file has 5 boards (`[Board0]` through `[Board4]`), one per Lumatone section. Each board has 56 keys (indices 0-55):

```
[Board0]
Key_0=33          # MIDI note number
Chan_0=1          # MIDI channel (1-6)
Col_0=020030      # hex color (no #)
Key_1=40
Chan_1=1
Col_1=86F6FF
...
Key_55=22
Chan_55=2
Col_55=1F0000
```

**Board N = Section N+1** in the JSON (Board0 = Section 1, etc).

---

## 3. The hex grid geometry (CRITICAL)

All EDOs share the **same physical hex grid**. Each section is a trapezoid of 56 hexagonal keys arranged in axial coordinates `(q, r)`. The positions never change between EDOs.

### Section shape (56 keys)

| q (column) | r values (rows) | count |
|-----------|-----------------|-------|
| 0         | 0, 1            | 2     |
| 1         | 0, 1, 2, 3, 4   | 5     |
| 2         | -1, 0, 1, 2, 3, 4 | 6   |
| 3         | -1, 0, 1, 2, 3, 4 | 6   |
| 4         | -2, -1, 0, 1, 2, 3 | 6  |
| 5         | -2, -1, 0, 1, 2, 3 | 6  |
| 6         | -3, -2, -1, 0, 1, 2 | 6 |
| 7         | -3, -2, -1, 0, 1, 2 | 6 |
| 8         | -4, -3, -2, -1, 0, 1 | 6 |
| 9         | -3, -2, -1, 0, 1  | 5   |
| 10        | -1, 0             | 2    |

Total: 2+5+6+6+6+6+6+6+6+5+2 = 56

### Key index scanning order

**Key index 0-55 maps to hex positions by scanning q ascending, r ascending within each q.**

```
key_index  0 -> (q=0, r= 0)
key_index  1 -> (q=0, r= 1)
key_index  2 -> (q=1, r= 0)
key_index  3 -> (q=1, r= 1)
key_index  4 -> (q=1, r= 2)
key_index  5 -> (q=1, r= 3)
key_index  6 -> (q=1, r= 4)
key_index  7 -> (q=2, r=-1)
key_index  8 -> (q=2, r= 0)
key_index  9 -> (q=2, r= 1)
key_index 10 -> (q=2, r= 2)
...etc
```

This means `.ltn` Key_0 is at hex position (0,0), Key_1 at (0,1), Key_2 at (1,0), and so on.

### Pixel positions per (q, r)

These are fixed for all EDOs (from the Lumatone hardware geometry):

```
(q= 0, r= 0) -> ( 34.3,  49.3)    (q= 0, r= 1) -> ( 91.5,  34.5)
(q= 1, r= 0) -> ( 75.5,  90.5)    (q= 1, r= 1) -> (133.5,  76.5)
(q= 1, r= 2) -> (189.5,  60.5)    (q= 1, r= 3) -> (247.5,  46.5)
(q= 1, r= 4) -> (305.5,  32.5)    (q= 2, r=-1) -> ( 59.5, 148.5)
(q= 2, r= 0) -> (117.5, 132.5)    (q= 2, r= 1) -> (173.5, 118.5)
(q= 2, r= 2) -> (231.5, 104.5)    (q= 2, r= 3) -> (289.5,  88.5)
(q= 2, r= 4) -> (347.5,  74.5)    (q= 3, r=-1) -> (101.5, 190.5)
(q= 3, r= 0) -> (157.5, 176.5)    (q= 3, r= 1) -> (215.5, 160.5)
(q= 3, r= 2) -> (273.5, 146.5)    (q= 3, r= 3) -> (331.5, 132.5)
(q= 3, r= 4) -> (387.5, 116.5)    (q= 4, r=-2) -> ( 85.5, 248.5)
(q= 4, r=-1) -> (141.5, 232.5)    (q= 4, r= 0) -> (199.5, 218.5)
(q= 4, r= 1) -> (257.5, 202.5)    (q= 4, r= 2) -> (315.5, 188.5)
(q= 4, r= 3) -> (371.5, 174.5)    (q= 5, r=-2) -> (125.5, 290.5)
(q= 5, r=-1) -> (183.5, 274.5)    (q= 5, r= 0) -> (241.5, 260.5)
(q= 5, r= 1) -> (299.5, 246.5)    (q= 5, r= 2) -> (355.5, 230.5)
(q= 5, r= 3) -> (413.5, 216.5)    (q= 6, r=-3) -> (109.5, 346.5)
(q= 6, r=-2) -> (167.5, 332.5)    (q= 6, r=-1) -> (225.5, 318.5)
(q= 6, r= 0) -> (283.5, 302.5)    (q= 6, r= 1) -> (339.5, 288.5)
(q= 6, r= 2) -> (397.5, 274.5)    (q= 7, r=-3) -> (151.5, 390.5)
(q= 7, r=-2) -> (209.5, 374.5)    (q= 7, r=-1) -> (267.5, 360.5)
(q= 7, r= 0) -> (323.5, 346.5)    (q= 7, r= 1) -> (381.5, 330.5)
(q= 7, r= 2) -> (439.5, 316.5)    (q= 8, r=-4) -> (135.5, 446.5)
(q= 8, r=-3) -> (193.5, 432.5)    (q= 8, r=-2) -> (251.5, 416.5)
(q= 8, r=-1) -> (307.5, 402.5)    (q= 8, r= 0) -> (365.5, 388.5)
(q= 8, r= 1) -> (423.5, 372.5)    (q= 9, r=-3) -> (235.5, 474.5)
(q= 9, r=-2) -> (291.5, 460.5)    (q= 9, r=-1) -> (349.5, 444.5)
(q= 9, r= 0) -> (407.5, 430.5)    (q= 9, r= 1) -> (464.8, 416.5)
(q=10, r=-1) -> (391.5, 488.5)    (q=10, r= 0) -> (449.5, 472.5)
```

---

## 4. Channel offsets and pitch calculation

The Lumatone uses 6 MIDI channels to cover the full pitch range. Each channel has a base offset:

```
channel 1: offset = -(EDO * 3)
channel 2: offset = -(EDO * 2)
channel 3: offset = -(EDO * 1)
channel 4: offset =  0
channel 5: offset = +(EDO * 1)
channel 6: offset = +(EDO * 2)
```

For 41-EDO: `{1: -123, 2: -82, 3: -41, 4: 0, 5: 41, 6: 82}`

**Pitch** for each key: `pitch = channel_offset + midi_note`

The pitch value is in EDO steps relative to a reference. Pitch 0 = C4 (middle C) in the audio engine. The app uses `C4 = 4 * EDO` as the absolute step for middle C.

---

## 5. Section global positioning

The 5 sections tile left-to-right with a fixed X offset:

```
section N global_x = local_x + (N - 1) * 360
section N global_y = local_y
```

The rendering code in `lumatoneLayout.ts` applies small corrections for hex grid alignment across section boundaries:

```
rendered_x = global_x + (section - 1) * 10    // SECTION_X_CORRECTION
rendered_y = global_y + (section - 3) * 12     // SECTION_Y_CORRECTION, centered on section 3
```

---

## 6. Color names

The `.ltn` file uses 6-digit hex colors. Map them to names for readability:

| Hex      | Name          |
|----------|---------------|
| 020030   | dark_navy     |
| 86F6FF   | light_cyan    |
| 1F0000   | dark_red      |
| FF975F   | light_orange  |
| 342C00   | dark_brown    |
| D8D8D8   | light_gray    |
| 003A06   | dark_green    |

These are the standard Lumatone palette colors. Other `.ltn` files may use different colors — add new names as needed.

---

## 7. Step-by-step: generating a new JSON

### Input needed
- A `.ltn` file for the target EDO
- The EDO number

### Process

1. **Parse the .ltn file**: Extract `Key_N`, `Chan_N`, `Col_N` for each board (0-4), each key (0-55).

2. **Compute channel offsets**: `offset[ch] = (ch - 4) * EDO` for channels 1-6.

3. **Build the (q,r) scan order**: Use the column structure table from section 3 above. Scan q ascending, r ascending within each q. This gives you a list of 56 `(q, r)` pairs.

4. **For each section (1-5) and each key_index (0-55)**:
   - Get the `.ltn` data: `note = Key_N`, `chan = Chan_N`, `col = Col_N` from `Board[section-1]`
   - Get the hex position: `(q, r) = scan_order[key_index]`
   - Look up pixel center from the position table
   - Compute: `pitch = channel_offset[chan] + note`
   - Compute: `global_pixel_center = (local_x + (section-1)*360, local_y)`

5. **Assemble the JSON** with `metadata`, `base_section_layout`, `global_keys`, `lookup_by_pitch`, and `section_x_step_used: 360`.

6. **Save** to `public/lumatone_layout_Xedo.json`.

7. **Register** the EDO in `src/lib/edoData.ts` `SUPPORTED_EDOS` and add a case in `getLayoutFile()` if the naming convention doesn't match.

### Quick sanity checks
- Total keys should be 280 (56 * 5)
- Each section should span exactly 1 octave (EDO unique pitches)
- Pitch at (q=0, r=0) in section 1 should be `channel_offset[board0_chan0] + board0_key0`
- Colors should form roughly horizontal bands across the keyboard (isomorphic layout property)
- Adjacent hexes in the same row should differ by the EDO's generator interval

---

## 8. Reference: the generation script

See the Python script used to generate these JSONs at the bottom of this file.

```python
import json

EDO = 41  # change this

# Channel offsets
ch_offsets = {str(ch): (ch - 4) * EDO for ch in range(1, 7)}

# Section hex grid: (q, r) scan order — q ascending, r ascending
SECTION_GRID = []
col_ranges = [
    (0, [0, 1]),
    (1, [0, 1, 2, 3, 4]),
    (2, [-1, 0, 1, 2, 3, 4]),
    (3, [-1, 0, 1, 2, 3, 4]),
    (4, [-2, -1, 0, 1, 2, 3]),
    (5, [-2, -1, 0, 1, 2, 3]),
    (6, [-3, -2, -1, 0, 1, 2]),
    (7, [-3, -2, -1, 0, 1, 2]),
    (8, [-4, -3, -2, -1, 0, 1]),
    (9, [-3, -2, -1, 0, 1]),
    (10, [-1, 0]),
]
for q, rs in col_ranges:
    for r in rs:
        SECTION_GRID.append((q, r))

# Pixel positions per (q, r) — from Lumatone hardware geometry
# (Copy the full table from section 3 above into a dict)
QR_TO_PX = {
    (0,0):(34.3,49.3),(0,1):(91.5,34.5),
    (1,0):(75.5,90.5),(1,1):(133.5,76.5),(1,2):(189.5,60.5),(1,3):(247.5,46.5),(1,4):(305.5,32.5),
    (2,-1):(59.5,148.5),(2,0):(117.5,132.5),(2,1):(173.5,118.5),(2,2):(231.5,104.5),(2,3):(289.5,88.5),(2,4):(347.5,74.5),
    (3,-1):(101.5,190.5),(3,0):(157.5,176.5),(3,1):(215.5,160.5),(3,2):(273.5,146.5),(3,3):(331.5,132.5),(3,4):(387.5,116.5),
    (4,-2):(85.5,248.5),(4,-1):(141.5,232.5),(4,0):(199.5,218.5),(4,1):(257.5,202.5),(4,2):(315.5,188.5),(4,3):(371.5,174.5),
    (5,-2):(125.5,290.5),(5,-1):(183.5,274.5),(5,0):(241.5,260.5),(5,1):(299.5,246.5),(5,2):(355.5,230.5),(5,3):(413.5,216.5),
    (6,-3):(109.5,346.5),(6,-2):(167.5,332.5),(6,-1):(225.5,318.5),(6,0):(283.5,302.5),(6,1):(339.5,288.5),(6,2):(397.5,274.5),
    (7,-3):(151.5,390.5),(7,-2):(209.5,374.5),(7,-1):(267.5,360.5),(7,0):(323.5,346.5),(7,1):(381.5,330.5),(7,2):(439.5,316.5),
    (8,-4):(135.5,446.5),(8,-3):(193.5,432.5),(8,-2):(251.5,416.5),(8,-1):(307.5,402.5),(8,0):(365.5,388.5),(8,1):(423.5,372.5),
    (9,-3):(235.5,474.5),(9,-2):(291.5,460.5),(9,-1):(349.5,444.5),(9,0):(407.5,430.5),(9,1):(464.8,416.5),
    (10,-1):(391.5,488.5),(10,0):(449.5,472.5),
}

COLOR_NAMES = {
    "020030":"dark_navy","86F6FF":"light_cyan","1F0000":"dark_red",
    "FF975F":"light_orange","342C00":"dark_brown","D8D8D8":"light_gray",
    "003A06":"dark_green",
}

SECTION_X_STEP = 360

def parse_ltn(text):
    """Parse .ltn text into boards[0..4][0..55] = {note, chan, col}"""
    boards = {}
    current_board = None
    for line in text.strip().split('\n'):
        line = line.strip()
        if line.startswith('[Board'):
            current_board = int(line[6])
            boards[current_board] = {}
        elif '=' in line and current_board is not None:
            key, val = line.split('=', 1)
            parts = key.split('_')
            if len(parts) == 2 and parts[1].isdigit():
                idx = int(parts[1])
                field = parts[0]
                if idx not in boards[current_board]:
                    boards[current_board][idx] = {}
                boards[current_board][idx][field] = val
    return boards

def generate_json(boards, edo):
    ch_offsets = {str(ch): (ch - 4) * edo for ch in range(1, 7)}
    global_keys = []
    base_section = []
    lookup = {}

    for board_idx in range(5):
        section = board_idx + 1
        board = boards[board_idx]
        for key_idx in range(56):
            entry = board[key_idx]
            note = int(entry['Key'])
            chan = int(entry['Chan'])
            col = entry['Col'].upper()
            q, r = SECTION_GRID[key_idx]
            px, py = QR_TO_PX[(q, r)]
            pitch = ch_offsets[str(chan)] + note

            key_entry = {
                "section": section,
                "local_key_index": key_idx,
                "channel": chan,
                "midi_note": note,
                "pitch": pitch,
                "local_axial": {"q": q, "r": r},
                "local_pixel_center": {"x": px, "y": py},
                "color_name": COLOR_NAMES.get(col, f"#{col}"),
                "color_hex": f"#{col}",
                "global_axial": {"q": q, "r": r},
                "global_pixel_center": {
                    "x": px + board_idx * SECTION_X_STEP,
                    "y": py,
                },
            }
            global_keys.append(key_entry)
            if section == 1:
                base_section.append(key_entry)

            pk = str(pitch)
            if pk not in lookup:
                lookup[pk] = []
            lookup[pk].append({
                "section": section,
                "key_index": key_idx,
                "channel": chan,
                "midi_note": note,
            })

    return {
        "metadata": {
            "edo": edo,
            "source": f"Generated from .ltn with correct key mapping (q asc, r asc)",
            "channel_offsets_used_for_pitch": ch_offsets,
        },
        "base_section_layout": base_section,
        "global_keys": global_keys,
        "lookup_by_pitch": lookup,
        "section_x_step_used": SECTION_X_STEP,
    }

# Usage:
# with open("my_layout.ltn") as f:
#     boards = parse_ltn(f.read())
# result = generate_json(boards, EDO)
# with open(f"public/lumatone_layout_{EDO}edo.json", "w") as f:
#     json.dump(result, f, indent=4)
```
