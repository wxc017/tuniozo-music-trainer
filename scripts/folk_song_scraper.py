"""
Folk Song Scraper & Scale Degree Extractor
==========================================
Searches multiple free databases for folk songs from a CSV list,
downloads the best versions, and extracts scale degrees + rhythms.

Sources:
  1. abcnotation.com (800K+ tunes in ABC format)
  2. The Session API (Irish/Celtic tunes)
  3. Essen Folk Song Database (kern format via GitHub)
  4. musescore.com search (community arrangements)

Output: JSON with scale degrees and rhythms for each song.
"""

import csv
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional
from difflib import SequenceMatcher

import requests

# music21 for parsing ABC/MIDI/MusicXML
import music21
from music21 import converter, note, stream, key, pitch, meter, duration

# ── Config ─────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR / "folk_songs_output"
CACHE_DIR = SCRIPT_DIR / "folk_songs_cache"
CSV_PATH = Path(os.path.expanduser("~/Downloads/Folk songs spreadsheet - Sheet1.csv"))

OUTPUT_DIR.mkdir(exist_ok=True)
CACHE_DIR.mkdir(exist_ok=True)

HEADERS = {"User-Agent": "FolkSongScraper/1.0 (educational music research)"}

# ── Data types ─────────────────────────────────────────────────────────

@dataclass
class NoteEvent:
    scale_degree: str          # e.g. "1", "b3", "#4", "5"
    octave_offset: int         # 0 = same octave as tonic, +1 = octave above, -1 = below
    duration_type: str         # "whole", "half", "quarter", "eighth", "16th", etc.
    dots: int                  # number of dots
    is_rest: bool
    beat_position: float       # position within measure (1-based)
    tied: bool                 # tied to next note

@dataclass
class SongResult:
    name: str
    source: str                # which database it came from
    source_url: str
    key_sig: str               # e.g. "C major", "A minor"
    time_sig: str              # e.g. "4/4", "3/4"
    tonality: str              # from CSV
    scale_degrees: list        # list of NoteEvent dicts
    abc_text: str = ""         # raw ABC if available
    confidence: float = 0.0    # how well the title matched
    melody_contour: str = ""   # compact representation: "1 2 3 1 | 1 2 3 1 | 3 4 5 - |"

@dataclass
class SearchResult:
    title: str
    source: str
    url: str
    abc_or_data: str
    match_score: float


# ── Title matching ─────────────────────────────────────────────────────

def clean_title(raw: str) -> str:
    """Extract just the song name from the CSV format."""
    # Remove parenthetical scale degree info and harmony info
    name = re.split(r'\s*[\(\[]', raw)[0]
    # Remove " - I V IV" style suffix
    name = re.split(r'\s*-\s*[IViv]+', name)[0]
    name = name.strip().strip(',').strip()
    return name

def title_similarity(a: str, b: str) -> float:
    """Fuzzy title matching score 0-1."""
    a_clean = re.sub(r'[^a-z0-9 ]', '', a.lower()).strip()
    b_clean = re.sub(r'[^a-z0-9 ]', '', b.lower()).strip()
    if not a_clean or not b_clean:
        return 0.0
    # Exact substring match is very strong
    if a_clean in b_clean or b_clean in a_clean:
        return 0.95
    return SequenceMatcher(None, a_clean, b_clean).ratio()


# ── Source 1: abcnotation.com ──────────────────────────────────────────

def search_abcnotation(title: str) -> list[SearchResult]:
    """Search abcnotation.com for a song title."""
    results = []
    try:
        url = f"https://abcnotation.com/searchTunes?q={requests.utils.quote(title)}&f=c&o=a&s=0"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return results
        html = resp.text
        # Find all tune page links (deduplicate)
        tune_links = list(dict.fromkeys(re.findall(r'href="(/tunePage\?a=[^"]+)"', html)))
        for link in tune_links[:5]:  # top 5 unique links
            tune_url = f"https://abcnotation.com{link}"
            # abcnotation search is title-based, so results are already relevant
            # Give high score since the search itself filtered by title
            results.append(SearchResult(
                title=title, source="abcnotation",
                url=tune_url, abc_or_data="", match_score=0.85
            ))
    except Exception as e:
        print(f"  [abcnotation] Error searching '{title}': {e}")
    return results

def fetch_abc_from_abcnotation(url: str) -> str:
    """Fetch ABC notation from an abcnotation.com tune page."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return ""
        # Look for ABC in <pre> tags first (most reliable)
        match = re.search(r'<pre[^>]*>(.*?)</pre>', resp.text, re.DOTALL)
        if match:
            pre_text = match.group(1).strip()
            # Extract just the ABC portion (starts with X: or %)
            abc_match = re.search(r'(%[^\n]*\n)?(X:\d+.*)', pre_text, re.DOTALL)
            if abc_match:
                return abc_match.group(0).strip()
        # Fallback: look for X: lines in the HTML
        match = re.search(r'(X:\d+\nT:[^\n]+\n(?:.*?\n)*?(?:[A-Ga-g].*\n?)+)', resp.text, re.MULTILINE)
        if match:
            return match.group(1).strip()
    except Exception as e:
        print(f"  [abcnotation] Error fetching ABC: {e}")
    return ""


# ── Source 2: The Session API ──────────────────────────────────────────

def search_thesession(title: str) -> list[SearchResult]:
    """Search The Session for a tune."""
    results = []
    try:
        url = f"https://thesession.org/tunes/search?q={requests.utils.quote(title)}&format=json"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return results
        data = resp.json()
        for tune in data.get("tunes", [])[:5]:
            tune_name = tune.get("name", "")
            score = title_similarity(title, tune_name)
            if score > 0.4:
                tune_id = tune.get("id", "")
                results.append(SearchResult(
                    title=tune_name, source="thesession",
                    url=f"https://thesession.org/tunes/{tune_id}?format=json",
                    abc_or_data="", match_score=score
                ))
    except Exception as e:
        print(f"  [thesession] Error searching '{title}': {e}")
    return results

def fetch_abc_from_thesession(url: str) -> str:
    """Fetch ABC from The Session API."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return ""
        data = resp.json()
        settings = data.get("settings", [])
        if settings:
            # Pick the most popular setting (first one, or highest member count)
            best = settings[0]
            abc_body = best.get("abc", "")
            if not abc_body:
                return ""
            # Reconstruct full ABC with proper headers
            tune_name = data.get("name", "Unknown")
            tune_type = data.get("type", "reel")
            key_sig = best.get("key", "C")
            # Determine meter from tune type
            meter_map = {"jig": "6/8", "reel": "4/4", "hornpipe": "4/4",
                         "polka": "2/4", "waltz": "3/4", "slide": "12/8",
                         "slip jig": "9/8", "march": "4/4", "barndance": "4/4"}
            meter = meter_map.get(tune_type, "4/4")
            # The Session ABC uses | for bar lines but sometimes omits L:
            full_abc = f"X:1\nT:{tune_name}\nM:{meter}\nL:1/8\nK:{key_sig}\n{abc_body}\n"
            return full_abc
    except Exception as e:
        print(f"  [thesession] Error fetching ABC: {e}")
    return ""


# ── Source 3: Direct ABC search via folksongsearch ─────────────────────

def search_folktunefinder(title: str) -> list[SearchResult]:
    """Search folktunefinder.com for ABC tunes."""
    results = []
    try:
        url = f"https://www.folktunefinder.com/search?q={requests.utils.quote(title)}"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return results
        # Parse results from HTML
        matches = re.findall(r'<a href="(/tunes/\d+)"[^>]*>([^<]+)</a>', resp.text)
        for link, tune_title in matches[:5]:
            score = title_similarity(title, tune_title)
            if score > 0.4:
                results.append(SearchResult(
                    title=tune_title, source="folktunefinder",
                    url=f"https://www.folktunefinder.com{link}",
                    abc_or_data="", match_score=score
                ))
    except Exception as e:
        print(f"  [folktunefinder] Error: {e}")
    return results


# ── ABC → Scale Degrees ───────────────────────────────────────────────

def abc_to_scale_degrees(abc_text: str, expected_tonality: str = "") -> Optional[SongResult]:
    """Parse ABC notation and extract scale degrees + rhythms."""
    try:
        score = converter.parse(abc_text, format='abc')
    except Exception as e:
        print(f"  [parse] Error parsing ABC: {e}")
        return None

    # Get the melody part (first part) — convert to list to avoid iterator exhaustion
    parts = score.parts
    if not parts:
        melody = list(score.flatten().notesAndRests)
    else:
        melody = list(parts[0].flatten().notesAndRests)

    # Determine key — prefer the key signature from the score, fallback to analysis
    k = None
    key_sigs = score.recurse().getElementsByClass(key.KeySignature)
    key_keys = score.recurse().getElementsByClass(key.Key)
    if key_keys:
        k = key_keys[0]
    elif key_sigs:
        k = key_sigs[0].asKey()
    if not k:
        try:
            k = score.analyze('key')
        except Exception:
            k = key.Key('C')
    if not k:
        k = key.Key('C')

    tonic = k.tonic
    mode = k.mode if hasattr(k, 'mode') else 'major'

    # Override with expected tonality if provided
    if expected_tonality:
        tl = expected_tonality.lower()
        if 'minor' in tl:
            mode = 'minor'
        elif 'dorian' in tl:
            mode = 'dorian'
        elif 'mixolydian' in tl:
            mode = 'mixolydian'
        elif 'phrygian' in tl:
            mode = 'phrygian'
        elif 'lydian' in tl:
            mode = 'lydian'
        elif 'aeolian' in tl:
            mode = 'minor'
        elif 'major' in tl:
            mode = 'major'

    # Get time signature
    ts = score.recurse().getElementsByClass(meter.TimeSignature)
    time_sig = str(ts[0]) if ts else "4/4"
    time_sig = re.search(r'(\d+/\d+)', str(time_sig))
    time_sig = time_sig.group(1) if time_sig else "4/4"

    # Convert each note to scale degree
    events: list[dict] = []
    contour_parts: list[str] = []
    tonic_midi = tonic.midi % 12

    # Pre-compute average pitch for octave reference
    note_midis = [n.pitch.midi for n in melody if isinstance(n, note.Note)]
    avg_pitch = sum(note_midis) / max(1, len(note_midis)) if note_midis else 60
    ref_tonic_oct = int(round((avg_pitch - tonic_midi) / 12)) * 12 + tonic_midi

    for elem in melody:
        if isinstance(elem, note.Rest):
            events.append({
                "scale_degree": "r",
                "octave_offset": 0,
                "duration_type": elem.duration.type,
                "dots": elem.duration.dots,
                "is_rest": True,
                "beat_position": float(elem.offset) % (4.0) + 1,
                "tied": False,
                "quarterLength": float(elem.duration.quarterLength),
            })
            contour_parts.append("-")
        elif isinstance(elem, note.Note):
            # Calculate semitones from tonic (relative to nearest tonic octave)
            interval_semitones = elem.pitch.midi - tonic_midi
            semitones = interval_semitones % 12
            # Octave offset relative to the melody's tonic octave (pre-computed)
            octave_offset = round((elem.pitch.midi - ref_tonic_oct) / 12)

            # Map semitones to scale degree names (chromatic)
            DEGREE_MAP = {
                0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4",
                6: "#4", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7"
            }
            degree = DEGREE_MAP.get(semitones, str(semitones))

            # Check for ties
            tied = elem.tie is not None and elem.tie.type in ('start', 'continue')

            events.append({
                "scale_degree": degree,
                "octave_offset": octave_offset,
                "duration_type": elem.duration.type,
                "dots": elem.duration.dots,
                "is_rest": False,
                "beat_position": float(elem.offset) % 4.0 + 1,
                "tied": tied,
                "quarterLength": float(elem.duration.quarterLength),
            })

            # Build contour string
            deg_str = degree
            if octave_offset > 0:
                deg_str += "'" * octave_offset
            elif octave_offset < 0:
                deg_str += "," * (-octave_offset)
            contour_parts.append(deg_str)

    # Build compact contour string
    contour = " ".join(contour_parts)

    return SongResult(
        name="",
        source="",
        source_url="",
        key_sig=f"{tonic.name} {mode}",
        time_sig=time_sig,
        tonality=mode,
        scale_degrees=[e for e in events],
        abc_text=abc_text[:500],
        confidence=0.0,
        melody_contour=contour,
    )


# ── Main search orchestrator ───────────────────────────────────────────

def search_all_sources(title: str) -> list[SearchResult]:
    """Search all sources for a song, return ranked results."""
    all_results: list[SearchResult] = []

    print(f"  Searching abcnotation.com...")
    abc_results = search_abcnotation(title)
    all_results.extend(abc_results)
    time.sleep(0.5)  # rate limit

    print(f"  Searching The Session...")
    all_results.extend(search_thesession(title))
    time.sleep(0.5)

    print(f"  Searching folktunefinder...")
    all_results.extend(search_folktunefinder(title))
    time.sleep(0.5)

    # Sort by match score, but boost abcnotation results (more reliable for nursery rhymes)
    for r in all_results:
        if r.source == "abcnotation":
            r.match_score += 0.1  # small boost for abcnotation
    all_results.sort(key=lambda r: r.match_score, reverse=True)
    return all_results


def fetch_abc(result: SearchResult) -> str:
    """Fetch ABC text for a search result."""
    cache_key = re.sub(r'[^a-z0-9]', '_', result.url.lower())[:120]
    cache_path = CACHE_DIR / f"{cache_key}.abc"

    if cache_path.exists():
        return cache_path.read_text(encoding='utf-8')

    abc = ""
    if result.source == "abcnotation":
        abc = fetch_abc_from_abcnotation(result.url)
    elif result.source == "thesession":
        abc = fetch_abc_from_thesession(result.url)

    if abc:
        cache_path.write_text(abc, encoding='utf-8')
        # Update match score based on actual title from ABC
        t_match = re.search(r'T:\s*(.+)', abc)
        if t_match:
            actual_title = t_match.group(1).strip()
            result.match_score = title_similarity(result.title, actual_title)
            result.title = actual_title

    return abc


def process_song(csv_row: dict) -> Optional[dict]:
    """Process a single song from the CSV."""
    raw_name = csv_row.get("Song Name", "").strip()
    if not raw_name:
        return None

    title = clean_title(raw_name)
    if not title or title.lower() in ("", "i iv v"):
        return None

    tonality = csv_row.get("Tonality", "Major")
    tradition = csv_row.get("Tradition", "")
    time_sig_hint = csv_row.get("Metre", "")

    print(f"\n{'='*60}")
    print(f"Song: {title}")
    print(f"  Tradition: {tradition.encode('ascii', 'replace').decode()}, Tonality: {tonality}")

    # Search all sources
    results = search_all_sources(title)

    if not results:
        print(f"  NO RESULTS FOUND")
        return {"name": title, "status": "not_found", "tonality": tonality}

    # Try each result until we get a valid parse
    for i, result in enumerate(results[:5]):
        print(f"  [{i+1}] {result.source}: {result.title} (match: {result.match_score:.2f})")
        abc = fetch_abc(result)
        if not abc:
            print(f"      No ABC text available")
            continue

        # Verify the actual ABC title matches our search
        abc_title_match = re.search(r'T:\s*(.+)', abc)
        if abc_title_match:
            actual_title = abc_title_match.group(1).strip()
            actual_score = title_similarity(title, actual_title)
            print(f"      ABC title: \"{actual_title}\" (title match: {actual_score:.2f})")
            if actual_score < 0.4:
                print(f"      REJECTED: title mismatch")
                continue
            result.match_score = actual_score

        parsed = abc_to_scale_degrees(abc, tonality)
        if parsed and len(parsed.scale_degrees) > 4:
            parsed.name = title
            parsed.source = result.source
            parsed.source_url = result.url
            parsed.confidence = result.match_score

            print(f"      SUCCESS: {len(parsed.scale_degrees)} notes, key={parsed.key_sig}")
            print(f"      Contour: {parsed.melody_contour[:80]}...")

            return asdict(parsed)
        else:
            print(f"      Parse failed or too few notes")

    print(f"  COULD NOT PARSE any version")
    return {"name": title, "status": "parse_failed", "tonality": tonality}


# ── Main ───────────────────────────────────────────────────────────────

def main():
    # Read CSV
    if not CSV_PATH.exists():
        print(f"CSV not found: {CSV_PATH}")
        sys.exit(1)

    songs = []
    with open(CSV_PATH, newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        rows = list(reader)

    # Find header row (row 3 in the CSV, 0-indexed row 2)
    header_idx = 2
    headers = rows[header_idx]

    # Clean headers
    col_map = {}
    for i, h in enumerate(headers):
        h = h.strip()
        if 'Song Name' in h or h == 'Song Name':
            col_map['Song Name'] = i
        elif 'Tradition' in h:
            col_map['Tradition'] = i
        elif 'Metre' in h:
            col_map['Metre'] = i
        elif 'Tonality' in h:
            col_map['Tonality'] = i
        elif 'Straight/Swing' in h:
            col_map['Straight/Swing'] = i

    print(f"Column mapping: {col_map}")

    # Process each song row
    results = []
    for row_idx, row in enumerate(rows[header_idx + 1:], start=header_idx + 2):
        if len(row) <= max(col_map.values()):
            continue

        song_name = row[col_map.get('Song Name', 1)].strip() if col_map.get('Song Name') is not None else ""
        if not song_name or song_name.startswith('(') or song_name in ('I IV V',):
            continue

        csv_data = {
            'Song Name': song_name,
            'Tradition': row[col_map.get('Tradition', 2)] if col_map.get('Tradition') is not None else "",
            'Metre': row[col_map.get('Metre', 5)] if col_map.get('Metre') is not None else "",
            'Tonality': row[col_map.get('Tonality', 10)] if col_map.get('Tonality') is not None else "Major",
        }

        result = process_song(csv_data)
        if result:
            results.append(result)

        # Rate limit
        time.sleep(1.0)

    # Save results
    output_path = OUTPUT_DIR / "folk_songs_degrees.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    # Summary
    found = sum(1 for r in results if r.get('status') != 'not_found' and r.get('status') != 'parse_failed')
    not_found = sum(1 for r in results if r.get('status') == 'not_found')
    parse_failed = sum(1 for r in results if r.get('status') == 'parse_failed')

    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"  Total songs: {len(results)}")
    print(f"  Found & parsed: {found}")
    print(f"  Not found: {not_found}")
    print(f"  Parse failed: {parse_failed}")
    print(f"  Output: {output_path}")


if __name__ == "__main__":
    main()
