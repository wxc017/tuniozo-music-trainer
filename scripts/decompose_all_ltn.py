"""Batch-decompose every .ltn in the Single-ring / Multi-ring folders into the
app's lumatone_layout_<edo>edo.json format.

- One layout per EDO (parsed from the filename's leading number).
- If several .ltn exist for the same EDO, the most recently modified wins.
- Curated layouts we already ship (12/17/19/31/41/53) are left untouched.

Run: python scripts/decompose_all_ltn.py
"""
import json, os, re, glob

HOME = os.path.expanduser("~")
SINGLE = os.path.join(HOME, "OneDrive/Desktop/lumatone/Single ring-*/Single ring")
MULTI = os.path.join(HOME, "OneDrive/Desktop/lumatone/Multi-ring-*/Multi-ring")
# Prefer single-ring layouts everywhere; only these EDOs come from multi-ring.
MULTI_ONLY = {34, 35}
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public")
KEEP = {12, 17, 19, 31, 41, 53}   # curated — don't overwrite

col_ranges = [
    (0, [0, 1]), (1, [0, 1, 2, 3, 4]),
    (2, [-1, 0, 1, 2, 3, 4]), (3, [-1, 0, 1, 2, 3, 4]),
    (4, [-2, -1, 0, 1, 2, 3]), (5, [-2, -1, 0, 1, 2, 3]),
    (6, [-3, -2, -1, 0, 1, 2]), (7, [-3, -2, -1, 0, 1, 2]),
    (8, [-4, -3, -2, -1, 0, 1]), (9, [-3, -2, -1, 0, 1]), (10, [-1, 0]),
]
SECTION_GRID = [(q, r) for q, rs in col_ranges for r in rs]
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
SECTION_X_STEP = 360

def parse_ltn(text):
    boards, cur = {}, None
    for line in text.replace("\r", "").split("\n"):
        line = line.strip()
        if line.startswith("[Board"):
            cur = int(line[6:line.index("]")]); boards[cur] = {}
        elif "=" in line and cur is not None:
            key, val = line.split("=", 1)
            parts = key.split("_")
            if len(parts) == 2 and parts[1].isdigit():
                boards[cur].setdefault(int(parts[1]), {})[parts[0]] = val
    return boards

def generate_json(boards, edo):
    # channels 1..16 → octave offsets (ch-4)*edo (small EDOs use many channels)
    ch = {str(c): (c - 4) * edo for c in range(1, 17)}
    global_keys, base_section = [], []
    for board_idx in range(5):
        board = boards[board_idx]
        for ki in range(56):
            e = board[ki]
            note = int(e["Key"]); chan = int(e["Chan"]); col = e["Col"].upper()
            q, r = SECTION_GRID[ki]; px, py = QR_TO_PX[(q, r)]
            pitch = ch[str(chan)] + note
            entry = {
                "section": board_idx + 1, "local_key_index": ki, "channel": chan,
                "midi_note": note, "pitch": pitch,
                "local_axial": {"q": q, "r": r},
                "local_pixel_center": {"x": px, "y": py},
                "color_hex": f"#{col}",
                "global_axial": {"q": q, "r": r},
                "global_pixel_center": {"x": px + board_idx * SECTION_X_STEP, "y": py},
            }
            global_keys.append(entry)
            if board_idx == 0:
                base_section.append(entry)
    return {"metadata": {"edo": edo, "channel_offsets_used_for_pitch": ch},
            "base_section_layout": base_section, "global_keys": global_keys}

# collect newest .ltn per EDO
best = {}   # edo -> (mtime, path)
def scan(pattern, only=None):
    for d in glob.glob(pattern):
        for path in glob.glob(os.path.join(d, "*.ltn")):
            m = re.match(r"(\d+)", os.path.basename(path))
            if not m:
                continue
            edo = int(m.group(1))
            if only is not None and edo not in only:
                continue
            mt = os.path.getmtime(path)
            if edo not in best or mt > best[edo][0]:
                best[edo] = (mt, path)

scan(SINGLE)                 # single-ring for everything that has one
scan(MULTI, only=MULTI_ONLY) # plus the few multi-ring-only EDOs we keep

made, skipped, failed = [], [], []
for edo, (mt, path) in sorted(best.items()):
    if edo in KEEP:
        skipped.append(edo); continue
    try:
        with open(path, encoding="utf-8", errors="ignore") as f:
            boards = parse_ltn(f.read())
        data = generate_json(boards, edo)
        out = os.path.join(OUT_DIR, f"lumatone_layout_{edo}edo.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        made.append(edo)
        print(f"OK  {edo:>3}edo  {len(data['global_keys'])} keys  <- {os.path.basename(path)}")
    except Exception as ex:
        failed.append((edo, str(ex)))
        print(f"FAIL {edo:>3}edo  {os.path.basename(path)} — {ex}")

# delete any lumatone_layout_*.json whose EDO we no longer keep (old multi-ring).
final = set(best) | KEEP
removed = []
for p in glob.glob(os.path.join(OUT_DIR, "lumatone_layout_*edo.json")):
    m = re.search(r"_(\d+)edo\.json$", os.path.basename(p))
    if m and int(m.group(1)) not in final:
        os.remove(p); removed.append(int(m.group(1)))

print(f"\nmade {len(made)}: {sorted(made)}")
print(f"kept curated: {sorted(skipped)}")
print(f"removed (no longer kept): {sorted(removed)}")
print(f"final EDOs: {sorted(final)}")
if failed:
    print(f"failed: {failed}")
