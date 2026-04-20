"""
PDMX Folk Song Extractor — Spreadsheet-Authoritative Version
==============================================================
Uses the Folk Songs Spreadsheet (CSV) as the authoritative source for:
  - Tonal functions (chords): "IV, V, I", "V/V, VIm, IV, V, I", etc.
  - Starting note (solfege degree): 1, 3, 5, etc.
  - Starting beat: "1", "2 de", "2 di", etc.
  - Melodic range: "9th: 5, - 6", "8ve: 1 - 8", etc.
  - Tonality, metre, swing, tradition, rhythm functions

Uses the PDMX dataset (250K+ MuseScore public-domain scores) for:
  - Actual melody note data (pitches, durations, measure positions)
  - Key verification

The spreadsheet chord info is assigned to bars using a simple
harmonic-rhythm model informed by the melody's pitch content.

Prerequisites:
  pip install pandas tqdm

Usage:
  python pdmx_folk_songs.py --pdmx-root ~/PDMX/PDMX
"""

import argparse
import csv
import json
import os
import re
import sys
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional

import pandas as pd
from tqdm import tqdm

def safe_print(s: str):
    """tqdm.write with safe encoding for Windows cp1252."""
    tqdm.write(s.encode("ascii", "replace").decode("ascii"))

# ── Config ────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR / "folk_songs_output"
OUTPUT_DIR.mkdir(exist_ok=True)

DEFAULT_PDMX_ROOT = Path(os.path.expanduser("~/PDMX/PDMX"))
DEFAULT_CSV = Path(os.path.expanduser("~/Downloads/Folk songs spreadsheet - Sheet1.csv"))

PC_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

FIFTHS_TO_TONIC_PC = {
    -7: 11, -6: 6, -5: 1, -4: 8, -3: 3, -2: 10, -1: 5,
    0: 0, 1: 7, 2: 2, 3: 9, 4: 4, 5: 11, 6: 6, 7: 1,
}

# semitones → (degree, accidental) for major
SEMI_DEG_MAJ = {
    0: (1, None), 1: (1, "#"), 2: (2, None), 3: (3, "b"),
    4: (3, None), 5: (4, None), 6: (4, "#"), 7: (5, None),
    8: (6, "b"), 9: (6, None), 10: (7, "b"), 11: (7, None),
}
SEMI_DEG_MIN = {
    0: (1, None), 1: (2, "b"), 2: (2, None), 3: (3, None),
    4: (3, "#"), 5: (4, None), 6: (5, "b"), 7: (5, None),
    8: (6, None), 9: (6, "#"), 10: (7, None), 11: (7, "#"),
}


# ── CSV parsing ───────────────────────────────────────────────────────

def parse_csv_songs(csv_path: Path) -> list[dict]:
    """Parse the folk songs spreadsheet, return enriched song dicts."""
    with open(csv_path, encoding="utf-8") as f:
        rows = list(csv.reader(f))

    songs = []
    for row in rows[3:]:
        if len(row) < 11:
            continue
        raw_name = row[1].strip()
        if not raw_name:
            continue
        # Skip header-like rows and separator rows
        if raw_name in ("I IV V", "Im bIII bVII (Vm)") or raw_name.startswith("I "):
            continue

        tonality = row[10].strip() if len(row) > 10 else ""
        if not tonality:
            continue  # spacer row

        # Clean title: remove solfege hint and chord suffix
        # e.g. "Frere Jacques (Do 1) - I" → "Frere Jacques"
        clean = re.split(r'\s*[\(\[]', raw_name)[0]
        clean = re.split(r'\s*-\s*[IVivmb#\(\s]+$', clean)[0].strip().strip(',')
        if not clean:
            continue

        # Extract starting note (preserve trailing comma = below-tonic marker)
        starting_note_raw = row[13].strip() if len(row) > 13 else ""
        starting_note = starting_note_raw  # keep raw form including trailing ","

        # Extract chords from tonal functions column
        tonal_functions = row[11].strip() if len(row) > 11 else ""

        songs.append({
            "title": clean,
            "raw_name": raw_name,
            "tradition": row[2].strip() if len(row) > 2 else "",
            "rough_date": row[3].strip() if len(row) > 3 else "",
            "metre": row[5].strip() if len(row) > 5 else "",
            "swing": row[6].strip() if len(row) > 6 else "",
            "rhythm_functions": row[7].strip() if len(row) > 7 else "",
            "starting_beat": row[8].strip() if len(row) > 8 else "",
            "tonality": tonality,
            "tonal_functions": tonal_functions,
            "melodic_range": row[12].strip() if len(row) > 12 else "",
            "starting_note": starting_note,
        })

    return songs


def parse_tonal_functions(tf: str) -> list[str]:
    """
    Parse the tonal functions string into a list of chord symbols.
    "IV, V, I" → ["I", "IV", "V"]
    "(V)V, VIm, IV, V, I" → ["V/V", "VIm", "IV", "V", "I"]
    "[IVm], V, Im" → ["Im", "V", "IVm"]

    Returns chords in the ORDER listed (most advanced first, I/Im last).
    We reverse to get functional order: I first, then IV, V, etc.
    """
    if not tf or "no traditional harmony" in tf.lower() or tf.lower() == "none":
        return ["I"]

    # Remove square bracket annotations like "[can add V]", "[uses Fi #4]"
    tf = re.sub(r'\[can add [^\]]*\]', '', tf)
    tf = re.sub(r'\[uses [^\]]*\]', '', tf)
    tf = re.sub(r'\[.*?in bridge\]', '', tf)
    tf = re.sub(r'\[.*?in verse[^\]]*\]', '', tf)

    # Extract chord symbols: I, Im, IV, IVm, V, VIm, bVII, (V)V, (V)IV, #IV, etc.
    # Also handle optional brackets: [IVm]
    chords = re.findall(
        r'\[?\(V\)[IVim#b]+m?\]?|'
        r'\[?b?#?[IViv]+m?(?:dim|aug|o)?\]?',
        tf
    )

    # Clean up brackets and convert (V)X → V/X notation for secondary dominants
    cleaned = []
    for c in chords:
        c = c.strip("[]")
        if c.startswith("(V)"):
            c = "V/" + c[3:]
        if c and c not in cleaned:
            cleaned.append(c)

    if not cleaned:
        return ["I"]

    # The spreadsheet lists "most advanced function first, all include I"
    # So the order is: advanced → basic.  We keep this order for assignment.
    return cleaned


# ── Title matching ────────────────────────────────────────────────────

ALT_TITLES: dict[str, list[str]] = {
    "Frere Jacques": ["Frère Jacques", "Brother John", "Are You Sleeping"],
    "Old McDonald": ["Old MacDonald Had a Farm", "Old MacDonald", "Old McDonald"],
    "Twinkle Twinkle/Baa Baa Black Sheep": ["Twinkle Twinkle Little Star", "Twinkle Twinkle",
                                              "Ah vous dirai-je Maman", "Baa Baa Black Sheep"],
    "When The Saints": ["When the Saints Go Marching In", "Oh When the Saints"],
    "This Old Man/Barney's \"I Love You\"": ["This Old Man"],
    "She'll Be Coming Round the Mountain": ["She'll Be Comin' Round the Mountain"],
    "Aura Lee / Love Me Tender": ["Aura Lee", "Love Me Tender"],
    "Oh Susanna": ["Oh! Susanna", "Oh Susannah"],
    "The Itsy Bitsy Spider": ["Itsy Bitsy Spider", "Incy Wincy Spider"],
    "Danny Boy": ["Londonderry Air"],
    "Dem Bones": ["Dry Bones"],
    "Big Ben/Westminster Chimes": ["Westminster Chimes", "Big Ben"],
    "Brahms' Hungarian Dance": ["Hungarian Dance No 5", "Hungarian Dance No. 5"],
    "Greensleeves": ["What Child Is This"],
    "Drunken Sailor": ["What Shall We Do with the Drunken Sailor"],
    "Hava Nagila": ["Hava Naguila", "Havah Nagilah"],
    "Siúl a Rún": ["Siul a Run", "Shule Aroon"],
    "Lamma Bada": ["Lamma Bada Yatathanna"],
    "Malagueña": ["Malaguena"],
    "Pokarekare Ana": ["Pokare Kare Ana"],
    "Rock a Bye Baby": ["Rock-a-bye Baby"],
    "B-I-N-G-O": ["BINGO"],
    "Lil' Liza Jane": ["Li'l Liza Jane", "Little Liza Jane", "Lil Liza Jane"],
    "O Holy Night": ["Cantique de Noel"],
    "Down By The Riverside": ["Down by the Riverside"],
    "Scarborough Fair": ["Scarborough Fair"],
    "Shenandoah": ["Oh Shenandoah"],
    "The Water is Wide": ["The Water Is Wide", "O Waly Waly"],
    "Swing Low, Sweet Chariot": ["Swing Low Sweet Chariot"],
    "My Bonnie Lies Over the Ocean": ["My Bonnie"],
    "Raisins and Almonds": ["Rozhinkes mit Mandlen"],
    "Turkey in the Straw/Do Your Ears Hang Low": ["Turkey in the Straw", "Do Your Ears Hang Low"],
    "All The Pretty Little Horses": ["All the Pretty Little Horses", "Hush-a-bye"],
    "Heads, Shoulders, Knees and Toes": ["Heads Shoulders Knees and Toes"],
    "Santa Claus is Coming to Down": ["Santa Claus Is Coming to Town"],
    "The ants go marching one by one": ["The Ants Go Marching"],
    "There's a Hole in my Bucket": ["There's a Hole in My Bucket"],
    "Leaves are Falling": ["Leaves Are Falling"],
    "Shalom Aleichem": ["Shalom Aleichem"],
    "We Wish You a Merry Christmas": ["We Wish You a Merry Christmas"],
    "Joshua Fit the Battle of Jericho": ["Joshua Fit the Battle", "Joshua Fought the Battle"],
    "Happy Birthday": ["Happy Birthday to You"],
    "Wayfaring Stranger": ["Poor Wayfaring Stranger"],
    "Amazing Grace": ["Amazing Grace"],
    "You Are My Sunshine": ["You Are My Sunshine"],
    "Good King Wenceslas": ["Good King Wenceslas"],
    "Jolly Old Saint Nicholas": ["Jolly Old Saint Nicholas"],
    "If You're Happy and You Know It": ["If You're Happy"],
    "Row Your Boat": ["Row Row Row Your Boat"],
    "Three Blind Mice": ["Three Blind Mice"],
    "Pop Goes The Weasel": ["Pop Goes the Weasel"],
    "Deck The Halls": ["Deck the Halls"],
    "Auld Lang Syne": ["Auld Lang Syne"],
    "Jingle Bells": ["Jingle Bells"],
    "Erie Canal": ["Low Bridge Everybody Down", "Erie Canal"],
    "Wade in the Water": ["Wade in the Water"],
    "Skip to my Lou": ["Skip to My Lou"],
    "Go Tell Aunt Rhody": ["Go Tell Aunt Rhody"],
    "The Farmer In The Dell": ["The Farmer in the Dell"],
    "Wheels on the Bus": ["Wheels on the Bus"],
    "The Muffin Man": ["The Muffin Man"],
    "This Little Light of Mine": ["This Little Light of Mine"],
    "All Around My Hat": ["All Around My Hat"],
    "She Moved Through the Fair": ["She Moved Through the Fair"],
    "Ring Around the Rosy": ["Ring Around the Rosie", "Ring a Ring o Roses"],
    "London Bridge": ["London Bridge Is Falling Down"],
    "Mary Had a Little Lamb": ["Mary Had a Little Lamb"],
    "Hot Cross Buns": ["Hot Cross Buns"],
}

# Manual PDMX path overrides for songs where automatic ranking picks the wrong version.
# Keys are the canonical spreadsheet title, values are the PDMX "path" field.
PDMX_OVERRIDES: dict[str, str] = {
    "Danny Boy": "./data/Y/M/QmYM5YCtBPPygpGcVMuqPTbYLukjJpST99GDZUVew5b5Y2.json",  # "Danny Boy C major"
}


def normalize_title(t: str) -> str:
    t = t.lower()
    t = re.sub(r"[''`\u2019]", "'", t)
    t = re.sub(r'[^\w\s\']', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def title_similarity(a: str, b: str) -> float:
    na, nb = normalize_title(a), normalize_title(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    if na in nb or nb in na:
        return 0.95
    return SequenceMatcher(None, na, nb).ratio()


def best_title_match_score(csv_title: str, pdmx_title: str) -> float:
    best = title_similarity(csv_title, pdmx_title)
    for alt in ALT_TITLES.get(csv_title, []):
        best = max(best, title_similarity(alt, pdmx_title))
    return best


# ── PDMX search ──────────────────────────────────────────────────────

def load_pdmx_csv(pdmx_root: Path) -> pd.DataFrame:
    csv_path = pdmx_root / "PDMX.csv"
    if not csv_path.exists():
        print(f"ERROR: PDMX.csv not found at {csv_path}")
        sys.exit(1)
    print(f"Loading PDMX.csv...")
    df = pd.read_csv(csv_path, low_memory=False)
    print(f"  {len(df)} scores")
    return df


def find_pdmx_candidates(
    csv_song: dict, df: pd.DataFrame, min_score: float = 0.55
) -> list[dict]:
    """Find PDMX candidates for a CSV song entry."""
    title = csv_song["title"]
    search_terms = [normalize_title(title)]
    for alt in ALT_TITLES.get(title, []):
        search_terms.append(normalize_title(alt))

    keywords = set()
    for term in search_terms:
        for word in term.split():
            if len(word) > 2:
                keywords.add(word)

    if not keywords:
        return []

    mask = pd.Series(False, index=df.index)
    for col in ('title', 'song_name'):
        if col in df.columns:
            series = df[col].fillna("").str.lower()
            for kw in keywords:
                mask = mask | series.str.contains(kw, case=False, na=False, regex=False)

    filtered = df[mask]
    if len(filtered) == 0:
        return []

    candidates = []
    for idx, row in filtered.iterrows():
        best_score = 0.0
        best_cand_title = ""
        for col in ('title', 'song_name'):
            if col not in df.columns:
                continue
            ct = str(row[col]) if pd.notna(row[col]) else ""
            sc = best_title_match_score(title, ct)
            if sc > best_score:
                best_score = sc
                best_cand_title = ct

        if best_score < min_score:
            continue

        n_notes = int(row.get("n_notes", 0)) if pd.notna(row.get("n_notes")) else 0
        # Penalize pedagogical / arrangement / reharmonization titles
        # Check ALL name fields (title, song_name) — any pedagogical flag taints it
        title_field = str(row.get("title", "")) if pd.notna(row.get("title")) else ""
        song_name_field = str(row.get("song_name", "")) if pd.notna(row.get("song_name")) else ""
        pedagogical_penalty = (
            is_pedagogical(best_cand_title) or
            is_pedagogical(title_field) or
            is_pedagogical(song_name_field)
        )
        candidates.append({
            "pdmx_title": best_cand_title,
            "match_score": best_score,
            "data_path": str(row["path"]) if pd.notna(row.get("path")) else "",
            "n_notes": n_notes,
            "n_tracks": int(row.get("n_tracks", 1)) if pd.notna(row.get("n_tracks")) else 1,
            "rating": float(row.get("rating", 0)) if pd.notna(row.get("rating")) else 0.0,
            "n_favorites": int(row.get("n_favorites", 0)) if pd.notna(row.get("n_favorites")) else 0,
            "is_pedagogical": pedagogical_penalty,
        })

    # Goldilocks ranking: prefer 30-200 note versions (simple folk melody)
    def note_score(n: int) -> float:
        if 30 <= n <= 200:
            return 1.0
        if n < 30:
            return n / 30.0
        return 200.0 / n

    # Sort: clean titles beat pedagogical ones, then goldilocks notes, then ratings
    candidates.sort(key=lambda c: (
        c["match_score"],
        not c["is_pedagogical"],  # False (clean) sorts before True (pedagogical)
        note_score(c["n_notes"]),
        -c["n_tracks"],
        c["rating"],
        c["n_favorites"],
    ), reverse=True)

    return candidates


# Words that indicate an arrangement / lesson / reharmonization — not the
# original traditional melody.  Candidates containing these get deprioritized.
PEDAGOGICAL_KEYWORDS = [
    "reharm", "reharmonization", "reharmonisation",
    "demonstration", "demo ", "lesson", "tutorial", "exercise",
    "secondary dominant", "analysis", "theory",
    "arrangement for", "arr.", "arranged",
    "variation", "variations",
    "jazz version", "jazz arr",
    "easy piano", "advanced",
    "etude", "study no",
]

def is_pedagogical(title: str) -> bool:
    t = title.lower()
    return any(kw in t for kw in PEDAGOGICAL_KEYWORDS)


# ── MusicRender extraction ────────────────────────────────────────────

def extract_melody_from_musicrender(
    data: dict, csv_song: dict
) -> Optional[dict]:
    """
    Extract melody notes from PDMX MusicRender JSON, then assign chords
    from the CSV's tonal_functions field using harmonic-rhythm analysis.
    """
    resolution = data.get("resolution", 480)
    tracks = data.get("tracks", [])
    if not tracks:
        return None

    # Key signature
    key_sigs = data.get("key_signatures", [])
    fifths = key_sigs[0].get("fifths", 0) if key_sigs else 0
    mode_str = key_sigs[0].get("mode") if key_sigs else None
    tonic_pc = FIFTHS_TO_TONIC_PC.get(fifths, 0)

    # Determine mode from CSV tonality
    tonality = csv_song.get("tonality", "Major").lower()
    is_minor = any(m in tonality for m in ("minor", "aeolian", "dorian", "phrygian", "hijaz", "nahawand", "locrian", "bayati"))
    mode = "minor" if is_minor else "major"
    if mode_str and "minor" in str(mode_str).lower():
        mode = "minor"

    # Time signature
    ts_list = data.get("time_signatures", [])
    ts = ts_list[0] if ts_list else {}
    ts_num = ts.get("numerator", 4)
    ts_den = ts.get("denominator", 4)
    time_sig = f"{ts_num}/{ts_den}"

    # Collect notes, tag with track index
    all_notes = []
    track_avg_pitch = []
    for i, t in enumerate(tracks):
        if t.get("is_drum"):
            continue
        notes = [n for n in t.get("notes", []) if not n.get("is_grace", False)]
        for n in notes:
            n["_track"] = i
        if notes:
            avg = sum(n["pitch"] for n in notes) / len(notes)
            track_avg_pitch.append((i, avg))
            all_notes.extend(notes)

    if not all_notes:
        return None

    # Group by measure
    measures: dict[int, list[dict]] = defaultdict(list)
    for n in all_notes:
        measures[n["measure"]].append(n)

    if len(measures) < 4:
        return None

    # Identify melody track (highest average pitch)
    melody_track_idx = None
    if len(track_avg_pitch) > 1:
        melody_track_idx = max(track_avg_pitch, key=lambda x: x[1])[0]

    # Detect whether the (single) track is monophonic — no overlapping notes.
    # For monophonic tracks, ALL notes are melody; no pitch-based split is needed.
    is_monophonic = False
    if melody_track_idx is None and len(tracks) == 1:
        sorted_notes = sorted(all_notes, key=lambda n: n["time"])
        overlaps = 0
        for i in range(len(sorted_notes) - 1):
            if sorted_notes[i]["time"] + sorted_notes[i]["duration"] > sorted_notes[i + 1]["time"]:
                overlaps += 1
        is_monophonic = overlaps == 0

    # Median pitch for polyphonic single-track splitting (unused when monophonic)
    all_pitches = sorted(n["pitch"] for n in all_notes)
    median_pitch = all_pitches[len(all_pitches) // 2]

    # Reference tonic octave: set so the first melody note produces the
    # correct scale degree from the spreadsheet.  Fallback: place the tonic
    # in the octave at or just below the melody's lowest note.
    if melody_track_idx is not None:
        mel_notes_all = sorted([n for n in all_notes if n["_track"] == melody_track_idx],
                               key=lambda n: n["time"])
    elif is_monophonic:
        # Single monophonic track: all notes are melody
        mel_notes_all = sorted(all_notes, key=lambda n: n["time"])
    else:
        mel_notes_all = sorted([n for n in all_notes if n["pitch"] >= median_pitch],
                               key=lambda n: n["time"])
    if not mel_notes_all:
        mel_notes_all = sorted(all_notes, key=lambda n: n["time"])

    # Set ref_tonic so that most melody notes land in the 1-7 range.
    # Use the average melody pitch to find the right octave, then floor.
    avg_mel = sum(n["pitch"] for n in mel_notes_all) / len(mel_notes_all)
    ref_tonic = int((avg_mel - tonic_pc) / 12) * 12 + tonic_pc
    # Adjust: if the average degree would be > 4, shift down one octave
    avg_deg_raw = (avg_mel - ref_tonic) / 12 * 7
    if avg_deg_raw > 5:
        ref_tonic += 12
    elif avg_deg_raw < 2:
        ref_tonic -= 12

    semi_map = SEMI_DEG_MIN if is_minor else SEMI_DEG_MAJ

    # Parse available chords from CSV
    available_chords = parse_tonal_functions(csv_song.get("tonal_functions", ""))

    # Build per-MEASURE output bars (1 bar = 1 measure, not per-beat)
    output_bars = []
    for m_num in sorted(measures.keys()):
        m_notes = measures[m_num]

        # Separate melody from accompaniment
        if melody_track_idx is not None:
            mel = sorted([n for n in m_notes if n["_track"] == melody_track_idx],
                         key=lambda n: n["time"])
        elif is_monophonic:
            # Monophonic source: all notes are melody
            mel = sorted(m_notes, key=lambda n: n["time"])
        else:
            mel = sorted([n for n in m_notes if n["pitch"] >= median_pitch],
                         key=lambda n: n["time"])
            if not mel:
                mel = sorted(m_notes, key=lambda n: n["time"])

        if not mel:
            continue

        # Build melody beats for the entire measure
        melody_beats = []
        for n in mel:
            semitones = (n["pitch"] - tonic_pc) % 12
            deg_num, acc = semi_map.get(semitones, (1, None))
            octave_diff = (n["pitch"] - ref_tonic) // 12
            final_degree = deg_num + 7 * octave_diff
            dur = round(n["duration"] / resolution * 4) / 4
            if dur <= 0:
                dur = 0.25
            beat: dict = {"degree": final_degree, "duration": dur}
            if acc:
                beat["accidental"] = acc
            melody_beats.append(beat)

        if not melody_beats:
            continue

        # Pad partial bars with rests (degree 0) so each bar fills the time sig.
        # Pickup bar (first bar if short): prepend rest at start.
        # Incomplete trailing bar: append rest at end.
        bar_beats_target = ts_num * (4.0 / ts_den)  # beats per bar in quarter notes
        total_dur = sum(b["duration"] for b in melody_beats)
        missing = bar_beats_target - total_dur
        if missing > 0.01:
            first_note_time = mel[0]["time"] if mel else 0
            bar_start_time = (m_num - 1) * ts_num * resolution * (4 / ts_den)
            offset_from_bar_start = (first_note_time - bar_start_time) / resolution
            if offset_from_bar_start > 0.25:
                # Notes don't start at beat 1 — prepend rest
                melody_beats.insert(0, {"degree": 0, "duration": round(offset_from_bar_start * 4) / 4})
                # Recompute missing after prepending
                total_dur = sum(b["duration"] for b in melody_beats)
                missing = bar_beats_target - total_dur
            if missing > 0.01:
                # Still short — append rest at end
                melody_beats.append({"degree": 0, "duration": round(missing * 4) / 4})

        # Assign chord using MELODY pitch classes, weighted by duration (skip rests)
        mel_pc_dur = [((n["pitch"] - tonic_pc) % 12, n["duration"]) for n in mel]
        chord_roman = assign_chord_from_list(mel_pc_dur, available_chords, is_minor)

        output_bars.append({
            "melody": melody_beats,
            "chordRoman": chord_roman,
        })

    if len(output_bars) < 4:
        return None

    # Validate and fix starting note against spreadsheet
    csv_start_raw = csv_song.get("starting_note", "").strip()
    csv_start = csv_start_raw.rstrip(",")
    # A trailing comma means "below tonic" (e.g., "5," = Sol below, "7," = Ti below)
    is_below_tonic = csv_start_raw.endswith(",")

    if csv_start and output_bars:
        first_beat = output_bars[0]["melody"][0]
        first_deg = first_beat["degree"]
        first_acc = first_beat.get("accidental")
        first_deg_mod = ((first_deg - 1) % 7) + 1

        csv_acc = None
        csv_deg_str = csv_start
        if csv_start.startswith("b"):
            csv_acc = "b"
            csv_deg_str = csv_start[1:]
        elif csv_start.startswith("#"):
            csv_acc = "#"
            csv_deg_str = csv_start[1:]
        try:
            csv_deg = int(csv_deg_str)
        except ValueError:
            csv_deg = None

        if csv_deg is not None:
            # Check scale degree match (ignoring octave)
            if first_deg_mod != csv_deg or first_acc != csv_acc:
                return None  # wrong melody — reject

            # Determine the expected degree value
            if is_below_tonic:
                expected_deg = csv_deg - 7  # e.g., "7," → 0, "5," → -2
            else:
                expected_deg = csv_deg       # e.g., "1" → 1, "3" → 3, "5" → 5

            # Compute octave shift needed
            octave_shift = expected_deg - first_deg  # in scale degrees
            if octave_shift != 0:
                # Apply shift to ALL melody notes in ALL bars
                for bar in output_bars:
                    for beat in bar["melody"]:
                        beat["degree"] += octave_shift

    # For songs without starting_note, auto-fix: shift so first note is in 0-7 range
    elif output_bars:
        first_deg = output_bars[0]["melody"][0]["degree"]
        first_deg_mod = ((first_deg - 1) % 7) + 1  # 1-7
        # Target: first_deg_mod (default to main octave)
        target = first_deg_mod
        octave_shift = target - first_deg
        if octave_shift != 0:
            for bar in output_bars:
                for beat in bar["melody"]:
                    beat["degree"] += octave_shift

    # Normalize all degrees to the 1-7 range (no apostrophes or commas).
    # Skip rests (degree 0) — they stay as 0.
    for bar in output_bars:
        for beat in bar["melody"]:
            d = beat["degree"]
            if d == 0:
                continue  # rest sentinel
            beat["degree"] = ((d - 1) % 7) + 1

    key_name = f"{PC_NAMES[tonic_pc]} {mode}"
    return {
        "key": key_name,
        "timeSignature": time_sig,
        "bars": output_bars,
        "num_notes": sum(len(b["melody"]) for b in output_bars),
    }


# ── Chord assignment from CSV chord vocabulary ───────────────────────

# Map Roman numeral roots to semitone offsets from tonic
ROMAN_TO_SEMI = {
    "I": 0, "bII": 1, "#I": 1, "II": 2, "bIII": 3, "#II": 3,
    "III": 4, "IV": 5, "#IV": 6, "bV": 6, "V": 7,
    "bVI": 8, "#V": 8, "VI": 9, "bVII": 10, "#VI": 10, "VII": 11,
}

def chord_to_pitch_classes(chord: str, is_minor: bool) -> list[int]:
    """Convert a Roman numeral chord to its expected pitch classes (semitones from tonic)."""
    c = chord
    secondary = False
    if c.startswith("V/"):
        c = c[2:]
        secondary = True
    elif c.startswith("(V)"):  # legacy format, just in case
        c = c[3:]
        secondary = True

    root_match = re.match(r'^(b?#?[IViv]+)', c)
    if not root_match:
        return [0, 4, 7]

    root_str = root_match.group(1).upper()
    suffix = c[len(root_match.group(1)):]

    target_semi = ROMAN_TO_SEMI.get(root_str, 0)

    if secondary:
        # (V)X = "V of X" = secondary dominant.
        # Root is a perfect 5th above X's root.  E.g. (V)V in C = D (not G).
        # Dominant quality: major triad with possible b7.
        root_semi = (target_semi + 7) % 12
        # Secondary dominant triad pitches
        return [(root_semi + iv) % 12 for iv in [0, 4, 7]]

    root_semi = target_semi
    is_lower = root_match.group(1)[0].islower() or root_match.group(1)[-1].islower()
    is_min = "m" in suffix.lower() or is_lower
    is_dim = "dim" in suffix.lower() or "o" in suffix.lower()
    is_aug = "aug" in suffix.lower() or "+" in suffix.lower()

    if is_dim:
        intervals = [0, 3, 6]
    elif is_aug:
        intervals = [0, 4, 8]
    elif is_min:
        intervals = [0, 3, 7]
    else:
        intervals = [0, 4, 7]

    return [(root_semi + iv) % 12 for iv in intervals]


def chord_characteristic_tones(chord: str) -> set[int]:
    """
    Return the tones that DEFINE this chord as special (non-diatonic for
    secondary dominants).  These must be present in the melody for a
    secondary dominant to be chosen.

    V/V in major = D major = D, F#, A. The F# is the "characteristic"
    altered tone that distinguishes it from V (G-B-D).
    V/IV in major = C major = same as I, so no characteristic alteration.
    V/VIm in major = E major = E, G#, B. G# is the characteristic tone.
    """
    if chord.startswith("V/"):
        target = chord[2:]
    elif chord.startswith("(V)"):
        target = chord[3:]
    else:
        return set()
    root_match = re.match(r'^(b?#?[IViv]+)', target)
    if not root_match:
        return set()

    root_str = root_match.group(1).upper()
    target_semi = ROMAN_TO_SEMI.get(root_str, 0)
    sec_root = (target_semi + 7) % 12

    # Third of the secondary dominant is the altered/characteristic tone
    # (since secondary dominants are always MAJOR, their 3rd is often #4/#5 etc.)
    third = (sec_root + 4) % 12
    # The b7 is also characteristic
    b7 = (sec_root + 10) % 12
    return {third, b7}


def assign_chord_from_list(
    melody_pc_dur: list, available_chords: list[str], is_minor: bool
) -> str:
    """
    Pick the best chord from the CSV's chord vocabulary for this bar.
    melody_pc_dur: list of either pitch-class ints OR (pc, duration) tuples.

    Strategy:
    - Weight each melody note by its duration (longer = more harmonic weight).
    - First and last notes get extra weight (downbeat + cadence).
    - Secondary dominants require their characteristic altered tone to appear.
    - Tonic chord (I/Im) gets modest bias as most common.
    """
    if not melody_pc_dur:
        return available_chords[-1] if available_chords else "I"
    if len(available_chords) == 1:
        return available_chords[0]

    # Normalize: support either plain pc ints or (pc, duration) tuples
    if isinstance(melody_pc_dur[0], tuple):
        notes = melody_pc_dur
    else:
        notes = [(pc, 1.0) for pc in melody_pc_dur]

    # Duration-weighted pitch-class weights
    pc_weights: dict[int, float] = defaultdict(float)
    for pc, dur in notes:
        pc_weights[pc] += dur

    # Add downbeat emphasis
    first_pc = notes[0][0]
    last_pc = notes[-1][0]
    pc_weights[first_pc] += 1.5  # downbeat bonus
    pc_weights[last_pc] += 0.5   # cadence bonus

    pc_set = set(pc_weights.keys())
    total_weight = sum(pc_weights.values())

    tonic_chord = available_chords[-1]

    best_chord = tonic_chord
    best_score = -1e9

    for chord in available_chords:
        chord_pcs = set(chord_to_pitch_classes(chord, is_minor))

        # Weighted hits = sum of weights of melody notes that are chord tones
        hits = sum(pc_weights.get(pc, 0) for pc in chord_pcs)
        # Weighted misses = non-chord tones
        misses = sum(pc_weights.get(pc, 0) for pc in pc_set - chord_pcs)

        # Coverage ratio (0-1): what fraction of melodic weight is in-chord
        coverage = hits / max(total_weight, 0.01)

        score = coverage * 10 - misses * 0.5

        # First note is chord tone = strong indicator
        if first_pc in chord_pcs:
            score += 3

        # Tonic bias (modest)
        if chord == tonic_chord:
            score += 1

        # Penalize secondary dominants without their altered tone
        if chord.startswith("V/") or chord.startswith("(V)"):
            char_tones = chord_characteristic_tones(chord)
            if not char_tones or not (char_tones & pc_set):
                score -= 15
            else:
                score += 1

        # Slight penalty for chromatic chords (bVII, bVI)
        if re.match(r'^b', chord):
            score -= 0.5

        if score > best_score:
            best_score = score
            best_chord = chord

    return best_chord


# ── Main ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdmx-root", type=Path, default=DEFAULT_PDMX_ROOT)
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--output", type=Path, default=OUTPUT_DIR / "folk_songs_pdmx.json")
    parser.add_argument("--max-candidates", type=int, default=15)
    parser.add_argument("--songs", nargs="*", default=None)
    args = parser.parse_args()

    # 1. Parse spreadsheet
    csv_songs = parse_csv_songs(args.csv)
    print(f"Parsed {len(csv_songs)} songs from spreadsheet")

    # Filter to only the songs we have in HarmonyWorkshop (or all if --songs given)
    # Build list of songs to process
    if args.songs:
        csv_songs = [s for s in csv_songs if any(
            normalize_title(t) in normalize_title(s["title"]) or
            normalize_title(s["title"]) in normalize_title(t)
            for t in args.songs
        )]

    # 2. Load PDMX
    df = load_pdmx_csv(args.pdmx_root)

    results = []
    not_found = []

    print(f"\nProcessing {len(csv_songs)} songs...\n")

    for csv_song in tqdm(csv_songs, desc="Songs"):
        title = csv_song["title"]
        safe_print(f"\n{'='*60}")
        safe_print(f"Song: {title}")
        safe_print(f"  Tonality: {csv_song['tonality']}")
        safe_print(f"  Tonal functions: {csv_song['tonal_functions']}")
        safe_print(f"  Starting note: {csv_song['starting_note']}")
        safe_print(f"  Melodic range: {csv_song['melodic_range']}")
        safe_print(f"  Starting beat: {csv_song['starting_beat']}")

        chords = parse_tonal_functions(csv_song["tonal_functions"])
        safe_print(f"  Parsed chords: {chords}")

        # Search PDMX
        candidates = find_pdmx_candidates(csv_song, df)
        if not candidates:
            safe_print(f"  NOT FOUND in PDMX")
            not_found.append(title)
            continue

        # Apply manual override if one exists for this song
        override_path = PDMX_OVERRIDES.get(title)
        if override_path:
            # Move the overridden candidate to the front (or inject it)
            override_match = [c for c in candidates if c.get("data_path") == override_path]
            if override_match:
                candidates = override_match + [c for c in candidates if c.get("data_path") != override_path]
                safe_print(f"  OVERRIDE: forcing \"{override_match[0]['pdmx_title']}\" ({override_path})")
            else:
                # Override not in matched candidates — inject it manually
                row = df[df['path'] == override_path]
                if len(row) > 0:
                    r = row.iloc[0]
                    injected = {
                        "pdmx_title": str(r.get("title", "")),
                        "match_score": 1.0,
                        "data_path": override_path,
                        "n_notes": int(r.get("n_notes", 0)) if pd.notna(r.get("n_notes")) else 0,
                        "n_tracks": int(r.get("n_tracks", 1)) if pd.notna(r.get("n_tracks")) else 1,
                        "rating": float(r.get("rating", 0)) if pd.notna(r.get("rating")) else 0.0,
                        "n_favorites": int(r.get("n_favorites", 0)) if pd.notna(r.get("n_favorites")) else 0,
                        "is_pedagogical": False,
                    }
                    candidates = [injected] + candidates
                    safe_print(f"  OVERRIDE: injected \"{injected['pdmx_title']}\"")

        safe_print(f"  PDMX: {len(candidates)} candidates")
        for i, c in enumerate(candidates[:3]):
            safe_print(f"    [{i+1}] \"{c['pdmx_title']}\" notes={c['n_notes']} "
                        f"tracks={c['n_tracks']} rating={c['rating']:.1f}")

        success = False
        for c in candidates[:args.max_candidates]:
            data_path = c.get("data_path", "")
            if not data_path:
                continue
            full_path = args.pdmx_root / data_path.lstrip("./")
            if not full_path.exists():
                continue

            try:
                with open(full_path, encoding="utf-8") as f:
                    mr_data = json.load(f)
            except Exception:
                continue

            song_data = extract_melody_from_musicrender(mr_data, csv_song)
            if song_data is None:
                continue

            safe_print(f"    Extracted: {song_data['num_notes']} notes, "
                        f"{len(song_data['bars'])} bars, key={song_data['key']}")

            # Show sample bars
            for b in song_data["bars"][:3]:
                degs = " ".join(
                    f"{'#' if n.get('accidental')=='#' else 'b' if n.get('accidental')=='b' else ''}{n['degree']}"
                    for n in b["melody"]
                )
                safe_print(f"      [{b['chordRoman']:>8s}] {degs}")

            song_id = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
            result = {
                "id": song_id,
                "title": title,
                "key": song_data["key"],
                "timeSignature": song_data["timeSignature"],
                "bars": song_data["bars"],
                # Spreadsheet metadata
                "tradition": csv_song["tradition"],
                "tonality": csv_song["tonality"],
                "metre": csv_song["metre"],
                "swing": csv_song["swing"],
                "rhythm_functions": csv_song["rhythm_functions"],
                "starting_beat": csv_song["starting_beat"],
                "tonal_functions": csv_song["tonal_functions"],
                "melodic_range": csv_song["melodic_range"],
                "starting_note": csv_song["starting_note"],
                "pdmx_source": c["pdmx_title"],
                "match_score": c["match_score"],
            }
            results.append(result)
            success = True
            break

        if not success:
            safe_print(f"  FAILED: no usable PDMX version")
            not_found.append(title)

    # Write output
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"  Spreadsheet songs: {len(csv_songs)}")
    print(f"  Extracted: {len(results)}")
    print(f"  Not found: {len(not_found)}")
    if not_found:
        print(f"\n  Missing:")
        for t in not_found:
            print(f"    - {t.encode('ascii', 'replace').decode('ascii')}")
    print(f"\n  Output: {args.output}")


if __name__ == "__main__":
    main()
