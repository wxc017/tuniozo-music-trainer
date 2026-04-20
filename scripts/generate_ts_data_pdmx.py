"""
Generate folkSongData.ts from PDMX JSON (which now includes spreadsheet metadata).
"""

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DEFAULT_INPUT = SCRIPT_DIR / "folk_songs_output" / "folk_songs_pdmx.json"
TS_PATH = SCRIPT_DIR.parent / "src" / "lib" / "folkSongData.ts"


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def bar_to_ts(bar: dict) -> str:
    melody_parts = []
    for beat in bar["melody"]:
        parts = [f"degree:{beat['degree']}", f"duration:{beat['duration']}"]
        if beat.get("accidental"):
            parts.append(f'accidental:"{beat["accidental"]}"')
        melody_parts.append("{" + ",".join(parts) + "}")
    return f'      {{melody:[{",".join(melody_parts)}],chordRoman:"{esc(bar["chordRoman"])}"}}'


def song_to_ts(song: dict) -> str:
    bars_ts = ",\n".join(bar_to_ts(b) for b in song["bars"])
    return (
        f'  {{\n'
        f'    id:"{esc(song["id"])}",\n'
        f'    title:"{esc(song["title"])}",\n'
        f'    key:"{esc(song["key"])}",\n'
        f'    timeSignature:"{esc(song["timeSignature"])}",\n'
        f'    bars:[\n{bars_ts},\n    ],\n'
        f'  }}'
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=TS_PATH)
    args = parser.parse_args()

    with open(args.input, encoding="utf-8") as f:
        songs = json.load(f)

    # Group by tonality > metre > swing (from spreadsheet metadata embedded in JSON)
    groups: dict[tuple, list] = defaultdict(list)
    for s in songs:
        key = (s.get("tonality", "Major"), s.get("metre", "Duple"), s.get("swing", "Straight"))
        groups[key].append(s)

    TONALITY_ORDER = [
        "Major", "Major pentatonic", "Minor", "Minor pentatonic", "Minor, full",
        "Dorian", "Dorian/aeolian", "Mixolydian", "Aeolian", "Phrygian",
        "Phrygian Dominant", "Lydian", "Hijaz", "Hijaz-Nahawand",
        "Minor (Nahawand) [Verse 3 modulates to relative Major/Ajam]",
        "Bayati", "Locrian",
    ]

    lines = [
        '// Auto-generated folk song data for HarmonyWorkshop',
        '// Source: PDMX dataset (melody) + Folk Songs Spreadsheet (harmony/metadata)',
        '// Organization: Tonality > Metre > Swing',
        'import type { FolkSong, SongBar, MelodyBeat } from "@/components/HarmonyWorkshop";',
        '',
        'export const FOLK_SONG_LIBRARY: FolkSong[] = [',
    ]

    emitted: set[tuple] = set()
    total = 0

    for tonality in TONALITY_ORDER:
        for metre in ["Duple", "Triple", "10=3+2+2+3", ""]:
            for swing in ["Straight", "Swing", ""]:
                key = (tonality, metre, swing)
                if key not in groups:
                    continue
                emitted.add(key)
                label = f"{tonality} / {metre}" + (f" / {swing}" if swing else "")
                count = len(groups[key])
                lines.append(f"  // ── {label} ({count} songs) ──")
                for s in groups[key]:
                    lines.append(song_to_ts(s) + ",")
                    total += 1
                lines.append("")

    for key in sorted(groups.keys()):
        if key in emitted:
            continue
        emitted.add(key)
        label = f"{key[0]} / {key[1]}" + (f" / {key[2]}" if key[2] else "")
        count = len(groups[key])
        lines.append(f"  // ── {label} ({count} songs) ──")
        for s in groups[key]:
            lines.append(song_to_ts(s) + ",")
            total += 1
        lines.append("")

    lines.append("];")
    lines.append("")
    lines.append("export interface FolkSongGroup {")
    lines.append("  tonality: string;")
    lines.append("  metre: string;")
    lines.append("  swing: string;")
    lines.append("  label: string;")
    lines.append("  count: number;")
    lines.append("}")
    lines.append("")
    lines.append("export const FOLK_SONG_GROUPS: FolkSongGroup[] = [")

    for key in sorted(emitted):
        tonality, metre, swing = key
        count = len(groups[key])
        label = f"{tonality} / {metre}" + (f" / {swing}" if swing else "")
        lines.append(
            f'  {{tonality:"{esc(tonality)}",metre:"{esc(metre)}",'
            f'swing:"{esc(swing)}",label:"{esc(label)}",count:{count}}},'
        )

    lines.append("];")

    args.output.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {total} songs to {args.output}")
    print(f"Groups: {len(emitted)}")


if __name__ == "__main__":
    main()
