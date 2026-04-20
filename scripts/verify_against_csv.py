"""
Verify folk song transcriptions against the CSV metadata.
Checks: starting note, melodic range, tonality, and internal consistency.
"""

import json, csv, re, os
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
INPUT = SCRIPT_DIR / "folk_songs_output" / "folk_songs_degrees.json"
CSV_PATH = Path(os.path.expanduser("~/Downloads/Folk songs spreadsheet - Sheet1.csv"))

DEGREE_TO_SEMITONES = {
    "1": 0, "b2": 1, "2": 2, "#2": 3, "b3": 3, "3": 4, "#3": 5,
    "4": 5, "#4": 6, "b5": 6, "5": 7, "#5": 8, "b6": 8,
    "6": 9, "#6": 10, "b7": 10, "7": 11,
}

def degree_to_number(d: str) -> int:
    """Convert degree string to scale step number (1-7)."""
    return int(re.search(r'\d', d).group()) if re.search(r'\d', d) else 0

def degree_to_semitones(d: str, octave: int = 0) -> int:
    return DEGREE_TO_SEMITONES.get(d, 0) + octave * 12

def parse_csv_range(range_str: str):
    """Parse melodic range like '9th: 5, - 6' -> (low_deg, high_deg, interval_name)."""
    if not range_str:
        return None
    m = re.match(r'(\d+)(?:th|st|nd|rd|ve)?:\s*(.+)', range_str.strip())
    if not m:
        return None
    interval = int(m.group(1))
    endpoints = m.group(2)
    parts = re.split(r'\s*-\s*', endpoints)
    if len(parts) == 2:
        low = parts[0].strip().rstrip(',').strip()
        high = parts[1].strip().rstrip("'").strip()
        return {"interval": interval, "low": low, "high": high}
    return {"interval": interval, "low": "", "high": ""}

def get_melody_range(events):
    """Get the actual melodic range in semitones and degree endpoints."""
    notes = [(e["scale_degree"], e["octave_offset"]) for e in events if not e["is_rest"]]
    if not notes:
        return None
    semitones = [degree_to_semitones(d, o) for d, o in notes]
    low_idx = semitones.index(min(semitones))
    high_idx = semitones.index(max(semitones))
    span = max(semitones) - min(semitones)
    # Convert span to interval (semitones -> scale degrees roughly)
    # 0=unison, 2=2nd, 4=3rd, 5=4th, 7=5th, 9=6th, 11=7th, 12=8ve
    SEMI_TO_INTERVAL = {0:1, 1:2, 2:2, 3:3, 4:3, 5:4, 6:4, 7:5, 8:6, 9:6, 10:7, 11:7, 12:8}
    interval = SEMI_TO_INTERVAL.get(span % 12, 8) + (span // 12) * 7
    return {
        "low_degree": notes[low_idx][0],
        "low_oct": notes[low_idx][1],
        "high_degree": notes[high_idx][0],
        "high_oct": notes[high_idx][1],
        "span_semitones": span,
        "interval": interval,
    }

def check_internal_consistency(events):
    """Check for common transcription errors."""
    issues = []
    notes = [e for e in events if not e["is_rest"]]

    # Check for impossible intervals (more than an octave jump)
    for i in range(1, len(notes)):
        s1 = degree_to_semitones(notes[i-1]["scale_degree"], notes[i-1]["octave_offset"])
        s2 = degree_to_semitones(notes[i]["scale_degree"], notes[i]["octave_offset"])
        jump = abs(s2 - s1)
        if jump > 12:
            issues.append(f"Large jump ({jump} semitones) at note {i}: {notes[i-1]['scale_degree']}->{notes[i]['scale_degree']}")

    # Check total duration makes sense (not too short or long)
    total_beats = sum(e["quarterLength"] for e in events)
    if total_beats < 4:
        issues.append(f"Very short: only {total_beats} beats")
    if total_beats > 200:
        issues.append(f"Very long: {total_beats} beats")

    # Check for repeated notes (same degree+octave 4+ times in a row)
    for i in range(3, len(notes)):
        if all(notes[j]["scale_degree"] == notes[i]["scale_degree"] and
               notes[j]["octave_offset"] == notes[i]["octave_offset"]
               for j in range(i-3, i+1)):
            issues.append(f"4+ repeated notes at {i}: {notes[i]['scale_degree']}")
            break

    return issues

def main():
    with open(INPUT, encoding="utf-8") as f:
        songs = json.load(f)

    with open(CSV_PATH, encoding="utf-8") as f:
        rows = list(csv.reader(f))

    # Build CSV lookup: clean name -> row data
    csv_data = {}
    for row in rows[3:]:
        if len(row) > 13 and row[1].strip():
            raw = row[1].strip()
            clean = re.split(r'\s*[\(\[]', raw)[0]
            clean = re.split(r'\s*-\s*[IViv]+', clean)[0].strip().strip(',')
            if clean:
                csv_data[clean.lower()] = {
                    "raw_name": raw,
                    "starting_note": row[13].strip() if len(row) > 13 else "",
                    "tonality": row[10].strip() if len(row) > 10 else "",
                    "range": row[12].strip() if len(row) > 12 else "",
                    "metre": row[5].strip() if len(row) > 5 else "",
                    "starting_beat": row[8].strip() if len(row) > 8 else "",
                }

    print(f"{'Song':<42s} {'Start':>5s} {'Range':>8s} {'Consist':>8s} {'Overall':>8s}")
    print("=" * 80)

    total = 0
    passed = 0
    failed_songs = []

    for s in songs:
        name = s["name"]
        events = s.get("scale_degrees", [])
        if not events:
            continue
        total += 1

        # Find CSV match — use best similarity score, not substring
        csv_match = None
        best_score = 0
        for csv_name, csv_row in csv_data.items():
            from difflib import SequenceMatcher
            score = SequenceMatcher(None, name.lower(), csv_name).ratio()
            if score > best_score and score > 0.5:
                best_score = score
                csv_match = csv_row

        checks = {"start": "?", "range": "?", "consist": "?"}

        # 1. Check starting note
        if csv_match and csv_match["starting_note"]:
            expected_start = csv_match["starting_note"].strip().rstrip(",").strip()
            first_note = next((e for e in events if not e["is_rest"]), None)
            if first_note:
                actual_start = first_note["scale_degree"]
                checks["start"] = "OK" if expected_start == actual_start else f"MISS({expected_start})"

        # 2. Check melodic range
        if csv_match and csv_match["range"]:
            parsed_range = parse_csv_range(csv_match["range"])
            actual_range = get_melody_range(events)
            if parsed_range and actual_range:
                expected_interval = parsed_range["interval"]
                actual_interval = actual_range["interval"]
                # Allow +/- 1 degree tolerance
                if abs(expected_interval - actual_interval) <= 1:
                    checks["range"] = "OK"
                else:
                    checks["range"] = f"MISS({expected_interval}th vs {actual_interval}th)"

        # 3. Internal consistency
        issues = check_internal_consistency(events)
        if issues:
            checks["consist"] = f"WARN({len(issues)})"
        else:
            checks["consist"] = "OK"

        # Overall
        fails = sum(1 for v in checks.values() if v.startswith("MISS"))
        warns = sum(1 for v in checks.values() if v.startswith("WARN"))
        if fails == 0 and warns == 0:
            overall = "PASS"
            passed += 1
        elif fails == 0:
            overall = "WARN"
            passed += 1  # still count as passed
        else:
            overall = "FAIL"
            failed_songs.append((name, checks))

        start_str = checks["start"][:8]
        range_str = checks["range"][:12]
        consist_str = checks["consist"][:10]

        color = "" if overall == "PASS" else ""
        print(f"  {name:<40s} {start_str:>8s} {range_str:>12s} {consist_str:>10s} {overall:>8s}")

    print(f"\n{'='*80}")
    print(f"TOTAL: {total}  |  PASS: {passed}  |  FAIL: {total - passed}")
    print(f"Pass rate: {passed/max(1,total)*100:.0f}%")

    if failed_songs:
        print(f"\nFAILED SONGS:")
        for name, checks in failed_songs:
            print(f"  {name}: {checks}")

if __name__ == "__main__":
    main()
