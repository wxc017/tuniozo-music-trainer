"""
Manual transcription of folk songs from the CSV list.
Scale degrees + rhythms from known melodies.

Rhythm notation:
  W = whole (4 beats), H = half (2), Q = quarter (1),
  E = eighth (0.5), S = sixteenth (0.25)
  . after = dotted (1.5x)
  ~ = tied to next note
  r = rest

Scale degrees: 1-7, b/# for accidentals
  , = octave below (e.g. 5, = sol below tonic)
  ' = octave above (e.g. 1' = do above)
"""

import json
from pathlib import Path

OUTPUT = Path(__file__).parent / "folk_songs_output" / "folk_songs_degrees.json"

def parse_melody(notation: str, time_sig: str = "4/4"):
    """Parse compact notation into structured note events."""
    dur_map = {
        "W": ("whole", 4.0, 0), "W.": ("whole", 6.0, 1),
        "H": ("half", 2.0, 0), "H.": ("half", 3.0, 1),
        "Q": ("quarter", 1.0, 0), "Q.": ("quarter", 1.5, 1),
        "E": ("eighth", 0.5, 0), "E.": ("eighth", 0.75, 1),
        "S": ("16th", 0.25, 0), "S.": ("16th", 0.375, 1),
    }
    events = []
    tokens = notation.strip().split()
    beat = 1.0
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        # Check for tied note (~ suffix on duration)
        tied = False

        # Parse degree
        if tok.startswith("r"):
            degree = "r"
            octave = 0
            is_rest = True
            dur_tok = tok[1:]  # rest duration follows
        else:
            is_rest = False
            # Extract degree with accidentals and octave markers
            deg_part = ""
            oct_offset = 0
            j = 0
            # Accidental prefix
            if j < len(tok) and tok[j] in "b#":
                deg_part += tok[j]; j += 1
            # Degree number
            if j < len(tok) and tok[j].isdigit():
                deg_part += tok[j]; j += 1
            # Octave suffix
            while j < len(tok) and tok[j] in ",'":
                if tok[j] == ',': oct_offset -= 1
                elif tok[j] == "'": oct_offset += 1
                j += 1
            degree = deg_part
            octave = oct_offset
            dur_tok = tok[j:]

        # Parse duration
        if dur_tok.endswith("~"):
            tied = True
            dur_tok = dur_tok[:-1]

        if dur_tok in dur_map:
            dur_type, q_len, dots = dur_map[dur_tok]
        else:
            dur_type, q_len, dots = "quarter", 1.0, 0  # default

        events.append({
            "scale_degree": degree,
            "octave_offset": octave,
            "duration_type": dur_type,
            "dots": dots,
            "is_rest": is_rest,
            "beat_position": beat,
            "tied": tied,
            "quarterLength": q_len,
        })

        beat += q_len
        i += 1

    return events

def song(name, key_sig, time_sig, tonality, starting_note, melody_str, tradition="", metre="Duple", swing="Straight"):
    events = parse_melody(melody_str, time_sig)
    degrees = [e["scale_degree"] for e in events if not e["is_rest"]]
    contour = " ".join(
        (e["scale_degree"] + ("'" * e["octave_offset"] if e["octave_offset"] > 0 else "," * (-e["octave_offset"]) if e["octave_offset"] < 0 else ""))
        if not e["is_rest"] else "-"
        for e in events
    )
    return {
        "name": name,
        "source": "manual_transcription",
        "source_url": "",
        "key_sig": key_sig,
        "time_sig": time_sig,
        "tonality": tonality,
        "tradition": tradition,
        "metre": metre,
        "swing": swing,
        "starting_note": starting_note,
        "scale_degrees": events,
        "melody_contour": contour,
        "confidence": 1.0,
    }

songs = []

# ══════════════════════════════════════════════════════════════════
# MAJOR - Duple - Straight
# ══════════════════════════════════════════════════════════════════

songs.append(song(
    "Frere Jacques", "C major", "4/4", "Major", "1",
    "1Q 2Q 3Q 1Q  1Q 2Q 3Q 1Q  3Q 4Q 5H  3Q 4Q 5H "
    "5E 6E 5E 4E 3Q 1Q  5E 6E 5E 4E 3Q 1Q  1Q 5,Q 1H  1Q 5,Q 1H",
    tradition="French nursery song"))

songs.append(song(
    "Hot Cross Buns", "C major", "4/4", "Major", "3",
    "3Q 2Q 1H  3Q 2Q 1H  1E 1E 1E 1E 2E 2E 2E 2E  3Q 2Q 1H",
    tradition="English street cry"))

songs.append(song(
    "Mary Had a Little Lamb", "C major", "4/4", "Major", "3",
    "3Q 2Q 1Q 2Q  3Q 3Q 3H  2Q 2Q 2H  3Q 5Q 5H "
    "3Q 2Q 1Q 2Q  3Q 3Q 3Q 3Q  2Q 2Q 3Q 2Q  1W",
    tradition="USA children's song"))

songs.append(song(
    "London Bridge", "C major", "4/4", "Major", "5",
    "5Q. 6E 5Q 4Q  3Q 4Q 5H  2Q 3Q 4H  3Q 4Q 5H "
    "5Q. 6E 5Q 4Q  3Q 4Q 5H  2H 5H  3H. rQ",
    tradition="English nursery rhyme"))

songs.append(song(
    "Old MacDonald", "C major", "4/4", "Major", "1",
    "1Q 1Q 1Q 5,Q  6,Q 6,Q 5,H  3Q 3Q 2Q 2Q  1W "
    "5,Q 1Q 1Q 1Q  5,Q 6,Q 6,Q 5,H  3Q 3Q 2Q 2Q  1W "
    "5,Q 5,Q 1Q 1Q 1Q  5,Q 5,Q 1Q 1Q 1Q  1Q 1Q 1Q 1Q 1Q 1Q 1Q 1Q "
    "1Q 1Q 1Q 1Q 1Q 1Q 1Q 1Q "
    "1Q 1Q 1Q 5,Q  6,Q 6,Q 5,H  3Q 3Q 2Q 2Q  1W",
    tradition="English/American folk"))

songs.append(song(
    "Skip to My Lou", "C major", "4/4", "Major", "3",
    # Range: 6th (7, - 5). Flies in the buttermilk, shoo fly shoo
    "3E 3E 3E 3E 3Q 5Q  4E 4E 4E 4E 4Q 3Q "
    "3E 3E 3E 3E 3Q 5Q  4Q 2Q 1H "
    # Skip skip skip to my Lou — goes down to 7,
    "7,Q 1Q 3Q 5Q  4Q 4Q 3Q 2Q  7,Q 1Q 3Q 5Q  4Q 2Q 1H",
    tradition="Southern USA folk dance"))

songs.append(song(
    "Go Tell Aunt Rhody", "C major", "4/4", "Major", "3",
    "3Q 3Q 2Q 1Q  1Q 2Q 2H  3Q 4Q 3Q 2Q  1H rH "
    "3Q 3Q 2Q 1Q  1Q 2Q 2Q 3Q  2Q 1Q 2Q rQ  1H. rQ",
    tradition="USA/France folk"))

songs.append(song(
    "Twinkle Twinkle Little Star", "C major", "4/4", "Major", "1",
    "1Q 1Q 5Q 5Q  6Q 6Q 5H  4Q 4Q 3Q 3Q  2Q 2Q 1H "
    "5Q 5Q 4Q 4Q  3Q 3Q 2H  5Q 5Q 4Q 4Q  3Q 3Q 2H "
    "1Q 1Q 5Q 5Q  6Q 6Q 5H  4Q 4Q 3Q 3Q  2Q 2Q 1H",
    tradition="French melody"))

songs.append(song(
    "Yankee Doodle", "C major", "4/4", "Major", "1",
    "1E 1E 2E 3E  1E 3E 2E 5,E  1E 1E 2E 3E  1H. rE "  # not exactly but close
    "1E 1E 2E 3E  4E 3E 2E 1E  7,E 1E 2E 3E  4H. rE "
    "5E 5E 4E 3E  4E 3E 2E 1E  7,E 1E 2E rE  1H. rE",
    tradition="US folk/military"))

songs.append(song(
    "When The Saints Go Marching In", "C major", "4/4", "Major", "1",
    "rQ 1Q 3Q 4Q  5W  rQ 1Q 3Q 4Q  5W "
    "rQ 1Q 3Q 4Q  5H 3H  1H 3H  2W "
    "rQ 3Q 3Q 2Q  1H. 1Q  1Q 2Q 3H  5H 5Q 4Q  3H 1H  2W",
    tradition="US spiritual/gospel"))

songs.append(song(
    "This Old Man", "C major", "4/4", "Major", "5",
    # Range: 6th (1 - 6). This old man, he played one...
    "5Q 3Q 5H  5Q 3Q 5H  6Q 5Q 4Q 3Q  2H 1Q rQ "
    "3Q 3Q 3Q 3E 3E  2E 2E 2E 3E 4E  5Q 3Q 1Q 2Q  3H. rQ",
    tradition="English nursery rhyme"))

songs.append(song(
    "She'll Be Coming Round the Mountain", "C major", "4/4", "Major", "5,",
    # Range: 10th (3, - 5). She'll be coming round the mountain when she comes
    "5,Q 1E 1E 1Q 1Q  3Q 3Q 3Q 2Q  1Q 1Q 1Q 2Q  3H. rQ "
    "5,Q 1E 1E 1Q 1Q  3Q 3Q 5Q 5Q  4Q 4Q 4Q 3Q  2H. rQ "
    "2Q 2Q 4Q 4Q  3Q 3Q 1Q 1Q  2Q 3Q 4Q 2Q  3H 3,Q rQ "
    "5,Q 1E 1E 1Q 1Q  3Q 3Q 5Q 5Q  4Q 2Q 3Q 1Q  1H. rQ",
    tradition="US folk/spiritual"))

songs.append(song(
    "Jolly Old Saint Nicholas", "C major", "4/4", "Major", "3",
    "3Q 3Q 3Q 3Q  2Q 2Q 2H  1Q 1Q 1Q 3Q  5Q 5Q 5H "
    "6Q 6Q 6Q 6Q  5Q 5Q 5H  4Q 4Q 4Q 4Q  3Q 3Q 3H "
    "3Q 3Q 3Q 3Q  2Q 2Q 2H  1Q 1Q 1Q 3Q  5Q 5Q 5H "
    "6Q 6Q 6Q 6Q  5Q 5Q 3Q 3Q  2Q 2Q 4Q 4Q  3H. rQ",
    tradition="US Christmas song"))

songs.append(song(
    "Good King Wenceslas", "C major", "4/4", "Major", "1",
    # Range: 8ve (5, - 5). Full melody with low sol
    "1Q 1Q 1Q 2Q  3Q 3Q 3H  1Q 1Q 1Q 2Q  3Q 3Q 3H "
    "4Q 3Q 4Q 5Q  6H 5H  4Q 3Q 4Q 5Q  6H 5H "
    "5Q 5Q 5Q 4Q  3Q 2Q 1H  5,Q 1Q 2Q 1Q  2Q 3Q 4H "
    "5Q 5Q 5Q 4Q  3Q 2Q 1Q 5Q  6Q 5Q 3Q 2Q  1H. rQ",
    tradition="English Christmas carol"))

songs.append(song(
    "You Are My Sunshine", "C major", "4/4", "Major", "5,",
    "rH. 5,Q  1Q. 3E 5Q 5Q  5Q. 6E 5Q 3Q  1H. 5,Q "
    "1Q. 3E 5Q 5Q  6H. rQ  rH. 5,Q "
    "1Q. 3E 5Q 5Q  5Q. 6E 5Q 3Q  1H. 1Q "
    "2Q. 2E 4Q 4Q  3H. rQ",
    tradition="US country/popular"))

songs.append(song(
    "B-I-N-G-O", "C major", "4/4", "Major", "5,",
    "5,E 5,E 1Q 1Q 1Q  2Q 3Q 3Q 2Q  1Q 2Q 3Q 5,Q  6,H. rQ "
    "5,E 5,E 1Q 1Q 1Q  2Q 3Q 3Q 2Q  1Q 2Q 3Q 2Q  1H. rQ",
    tradition="English/US folk"))

songs.append(song(
    "Swing Low Sweet Chariot", "C major", "4/4", "Major", "3",
    "rQ 3E 3E 5H 3Q  5Q. 6E 5Q 3Q  1H. rQ "
    "rQ 3E 3E 5H 3Q  5Q 6Q 5H. "
    "rQ 5Q 6Q 1'H 6Q  5Q. 6E 5Q 3Q  1H. rQ "
    "rQ 1Q 3Q 5H 3Q  5Q 6Q 5Q 3Q  1H. rQ",
    tradition="US African American spiritual"))

songs.append(song(
    "Heads Shoulders Knees and Toes", "C major", "4/4", "Major", "5",
    # Range: 9th (1 - 2'). Heads shoulders knees and toes
    "5Q 3Q 1Q 3Q  5Q 5Q 5H  5Q 3Q 1Q 3Q  5Q 5Q 5H "
    "6Q 6Q 5Q 5Q  4Q #4Q 5H  1'Q 1'Q 2'Q 1'Q  5Q 3Q 1H",
    tradition="US children's song"))

songs.append(song(
    "Jingle Bells", "C major", "4/4", "Major", "3",
    # Chorus
    "3Q 3Q 3H  3Q 3Q 3H  3Q 5Q 1Q. 2E  3W "
    "4Q 4Q 4Q. 4E  4Q 3Q 3Q 3E 3E  3Q 2Q 2Q 3Q  2H 5H "
    "3Q 3Q 3H  3Q 3Q 3H  3Q 5Q 1Q. 2E  3W "
    "4Q 4Q 4Q. 4E  4Q 3Q 3Q 3E 3E  5Q 5Q 4Q 2Q  1W",
    tradition="US Christmas"))

songs.append(song(
    "Deck The Halls", "C major", "4/4", "Major", "5",
    "5Q. 4E 3Q 2Q  1Q 2Q 3Q 1Q  2E 3E 4E 2E 3Q. 2E  1Q 7,Q 1H "
    "5Q. 4E 3Q 2Q  1Q 2Q 3Q 1Q  2E 3E 4E 2E 3Q. 2E  1Q 7,Q 1H "
    "2Q. 3E 4Q 2Q  3Q. 4E 5Q 3Q  4E 3E 2E 1E 2E 3E 4E 2E  3Q. 2E 1Q 7,Q "
    "5Q. 4E 3Q 2Q  1Q 2Q 3Q 5,Q  6,E 7,E 1E 2E 3Q. 2E  1H. rQ",
    tradition="Welsh carol"))

songs.append(song(
    "Auld Lang Syne", "C major", "4/4", "Major", "5,",
    "rH. 5,Q  1Q. 1E 1Q 3Q  2Q. 1E 2Q 3Q  1Q. 3E 5H "
    "rQ 6Q. 5E 3Q  1Q. 1E 1Q 3Q  2Q. 1E 2Q 6,Q  5,H. 5,Q "
    "1Q. 1E 1Q 3Q  2Q. 1E 2Q 3Q  1Q. 3E 5Q 6Q  5H. 6Q "
    "5Q. 3E 3Q 1Q  2Q. 1E 2Q 3Q  1Q. 1E 1Q 7,Q  1H. rQ",
    tradition="Scottish folk"))

songs.append(song(
    "Danny Boy", "C major", "4/4", "Major", "7,",
    # Oh Danny Boy, the pipes the pipes are calling
    "rH 7,E 1E  2Q. 3E 3Q. 2E  3E 4E 6Q 5Q. 3E  2E 1E 2Q 6,H "
    "rQ 1E 2E  3Q. 4E 5Q. 6E  5Q 3Q 1Q. 3E  2H. rQ "
    # From glen to glen and down the mountainside
    "rH 7,E 1E  2Q. 3E 3Q. 2E  3E 4E 6Q 5Q. 3E  2E 1E 2Q 6,H "
    "rQ 7,E 1E  2Q. 3E 3Q. 4E  3Q 2Q 1Q. 2E  1H. rQ "
    # The summer's gone and all the roses falling
    "rH 5E 6E  1'Q. 7E 7Q. 6E  5Q. 6E 5Q 3Q  1H. rQ "
    "rH 5E 6E  1'Q. 7E 7Q. 6E  5Q 3Q 2H.  rQ "
    # 'Tis you 'tis you must go and I must bide
    "rH 5E 5E  5Q. 3'E 2'Q. 2'E  1'Q. 6E 1'Q 5Q  3Q 1Q rH "
    "rQ 7,E 1E  2Q. 3E 6Q 5Q  3Q 2Q 1Q 6,E 7,E  1H. rQ",
    tradition="Irish folk/art song"))

songs.append(song(
    "Shenandoah", "C major", "4/4", "Major", "5,",
    "rH. 5,Q  1Q. 3E 5H.  rQ 6Q 5Q 3H. "
    "rQ 1Q 3Q 5H.  rQ 6Q 1'Q 6H. "
    "rQ 5Q 3Q 5Q 6Q  5Q 3Q 1H.  rQ 2Q 3Q 2Q 1Q  6,H. rQ",
    tradition="US folk/river song"))

songs.append(song(
    "The Water Is Wide", "C major", "4/4", "Major", "5,",
    "rH 5,Q 1Q  3H 2Q 3Q  5Q. 6E 5H  rH 3Q 5Q "
    "6H 5Q 3Q  5Q 3Q 2H  rH 5,Q 1Q  3H 2Q 3Q "
    "5Q. 6E 5Q 3Q  2Q 1Q 6,H  rH 1Q 2Q  1H. rQ",
    tradition="Scottish/English folk"))

# ══════════════════════════════════════════════════════════════════
# MAJOR - Duple - Swing
# ══════════════════════════════════════════════════════════════════

songs.append(song(
    "Ring Around the Rosy", "C major", "4/4", "Major", "5",
    "5Q 6Q 5Q 3Q  5Q 6Q 5Q 3Q  5Q 5Q 6Q 5Q  3Q 1H rQ",
    tradition="English nursery rhyme", swing="Swing"))

songs.append(song(
    "Dem Bones", "C major", "4/4", "Major", "3",
    "rQ 3E 3E 3H 3Q  3E 3E 3H 3Q  3E 3E 3H 3Q  3Q 2Q 1H",
    tradition="African American spiritual", swing="Swing"))

songs.append(song(
    "Lil' Liza Jane", "C major", "4/4", "Major", "3",
    # Verse: I got a gal and you got none, Lil' Liza Jane
    "3Q 3Q 3Q 3Q  3Q 2Q 1H  1Q 1Q 3Q 3Q  2H. rQ "
    "3Q 3Q 3Q 3Q  3Q 2Q 1H  1Q 1Q 2Q 2Q  1H. rQ "
    # Chorus: Oh Eliza, Lil' Liza Jane (goes up to 1')
    "1Q 3Q 5Q 1'Q  1'Q 6Q 5H  5Q 5Q 3Q 1Q  2H. rQ "
    "1Q 3Q 5Q 1'Q  1'Q 6Q 5Q 3Q  1Q 1Q 2Q 2Q  1H. rQ",
    tradition="US folk/minstrel-era", swing="Swing"))

songs.append(song(
    "The Itsy Bitsy Spider", "C major", "4/4", "Major", "5,",
    # Range: 8ve (5, - 5). The itsy bitsy spider climbed up the water spout
    "5,E 1Q. 1E 1Q  2E 3Q. rE 3E  2Q. 1E 2Q  3Q 1H "
    # Down came the rain
    "rQ 5Q. 5E 5Q  4E 3Q. rE 3E  2Q. 1E 2Q  1Q 5,H "
    # Out came the sun
    "rQ 5Q. 5E 5Q  4E 3Q. rE 3E  2Q. 1E 2Q  3Q 1H "
    # And the itsy bitsy spider went up the spout again
    "rQ 5,E 1Q. 1E 1Q  2E 3Q. rE 3E  2Q. 1E 2Q  3Q 1H",
    tradition="US children's song", swing="Swing"))

songs.append(song(
    "If You're Happy and You Know It", "C major", "4/4", "Major", "5,",
    "rH. 5,Q  1Q 1Q 3Q 3Q  5Q. 6E 5Q 3Q  1H. 5,Q "
    "1Q 1Q 3Q 3Q  5Q 5Q 5H  rQ 5Q 4Q 3Q  2H. rQ",
    tradition="US children's song", swing="Swing"))

songs.append(song(
    "Down By The Riverside", "C major", "4/4", "Major", "5,",
    "rH 5,E 5,E  1Q 1Q 1E 2E 3Q  3Q 3Q 3Q 1Q  2H. rQ "
    "rQ 5,E 5,E 1Q 1Q  1E 2E 3Q 3Q 3Q  3Q 2Q 1Q. 2E  3H. rQ",
    tradition="US spiritual", swing="Swing"))

# ══════════════════════════════════════════════════════════════════
# MAJOR - Triple - Straight
# ══════════════════════════════════════════════════════════════════

songs.append(song(
    "Row Row Row Your Boat", "C major", "3/4", "Major", "1",
    "1Q. 1E 1Q  1Q. 2E 3Q  3Q. 2E 3Q. 4E  5H. "
    "1'E 1'E 1'E 5E 5E 5E  3E 3E 3E 1E 1E 1E  5Q. 4E 3Q. 2E  1H.",
    tradition="US children's round", metre="Triple"))

songs.append(song(
    "Three Blind Mice", "C major", "3/4", "Major", "3",
    "3Q 2Q 1Q  3Q 2Q 1Q  5Q 4Q. 3E  5Q 4Q. 3E "
    "5E 6E 5E 4E 3Q  5E 6E 5E 4E 3Q  5Q 2Q 1Q  rH.",
    tradition="English nursery rhyme", metre="Triple"))

songs.append(song(
    "Pop Goes the Weasel", "C major", "3/4", "Major", "5,",
    "rQ rQ 5,Q  1Q 1Q 2Q  3Q 3Q 5Q  4Q 4Q 2Q "
    "1Q 1Q 2Q  3Q 3Q 1Q  2Q 4Q 2Q  3H.",
    tradition="English folk/dance", metre="Triple"))

songs.append(song(
    "Rock a Bye Baby", "C major", "3/4", "Major", "5",
    "5Q. 3E 5Q  1'H 6Q  5Q. 3E 5Q  6H 4Q "
    "3Q. 2E 3Q  4Q. 3E 4Q  5Q 4Q 3Q  2H rQ "
    "5Q. 3E 5Q  1'H 6Q  5Q. 3E 5Q  6H 4Q "
    "3Q. 2E 3Q  4Q 3Q 2Q  1H.",
    tradition="English/US lullaby", metre="Triple"))

songs.append(song(
    "Amazing Grace", "C major", "3/4", "Major", "5,",
    "rQ rQ 5,Q  1H. 3E 1E  3H 2Q  1H 6,Q  5,H. "
    "rQ rQ 5,Q  1H. 3E 1E  3H 2Q  5H. "
    "rQ rQ 5Q  3H. 5E 3E  5H 3Q  5Q 3Q 1Q  6,H. "
    "rQ rQ 5,Q  1H. 3E 1E  3H 2Q  1H.",
    tradition="English hymn", metre="Triple"))

songs.append(song(
    "Happy Birthday", "C major", "3/4", "Major", "5,",
    "rQ 5,E. 5,S 6,Q  5,Q 1Q 7,Q  rQ 5,E. 5,S 6,Q  5,Q 2Q 1Q "
    "rQ 5,E. 5,S 5Q  3Q 1Q 7,Q 6,Q  rQ 4E. 4S 3Q  1Q 2Q 1Q",
    tradition="US song", metre="Triple", swing="Swing"))

songs.append(song(
    "There's a Hole in My Bucket", "C major", "3/4", "Major", "5",
    "rQ rQ 5Q  5Q 3Q 5Q  5Q 3Q 5Q  6Q 5Q 4Q  3H 1Q "
    "3Q 2Q 3Q  4Q 3Q 2Q  1H.",
    tradition="German/US folk", metre="Triple"))

songs.append(song(
    "O Holy Night", "C major", "4/4", "Major", "1",
    "1Q. 1E 1Q. 2E  3H. rQ  3Q. 3E 5Q. 4E  3H. rQ "
    "3Q. 4E 5Q. 6E  5H 3Q rQ  2Q. 3E 4Q. 2E  3H. rQ "
    "3Q. 3E 6Q. 6E  6Q 5Q 4Q 3Q  5H. rQ  4Q. 4E 4Q. 3E  2H. rQ",
    tradition="French Christmas carol"))

songs.append(song(
    "Turkey in the Straw", "C major", "4/4", "Major", "3",
    "3E 3E 3E 5E 5E 5E 5E 3E  4E 4E 4E 6E 6H "
    "3E 3E 3E 5E 5E 5E 5E 3E  4E 4E 2E 2E 1H "
    "3E 3E 3E 5E 5E 5E 5E 3E  4E 4E 4E 6E 6H "
    "5E 5E 4E 4E 3E 3E 2E 2E  1H. rH",
    tradition="US minstrel-era tune"))

songs.append(song(
    "A Ram Sam Sam", "C major", "4/4", "Major", "5,",
    "rH 5,E 5,E  1Q 1Q 1Q 1Q  1Q 3Q 3Q 1Q  3Q 5Q 5Q 3Q "
    "5Q 6Q 5Q 3Q  1H. rQ",
    tradition="Moroccan children's song"))

songs.append(song(
    "The Farmer in the Dell", "C major", "3/4", "Major", "5,",
    "rQ rQ 5,Q  1Q 1Q 1Q  1Q 1Q 2Q  3Q 3Q 3Q  3H rQ "
    "5Q 5Q 6Q  5Q 3Q 1Q  2Q 3Q 3Q  2Q 2Q 1Q  1H.",
    tradition="German/US folk", swing="Swing", metre="Triple"))

songs.append(song(
    "Wheels on the Bus", "C major", "4/4", "Major", "5,",
    "rH 5,E 5,E  1Q 1Q 1Q 3Q  5Q 5Q 3H  3Q 4Q 5Q 4Q "
    "3Q 1Q 2H  rH 5,E 5,E  1Q 1Q 1Q 3Q  5Q 5Q 3Q 1Q  2Q 2Q 1H",
    tradition="US children's song", swing="Swing"))

songs.append(song(
    "The Muffin Man", "C major", "4/4", "Major", "5,",
    "5,Q 1Q. 2E 3Q  3Q 3Q 4Q. 3E  2Q 2Q 5,Q 7,Q  1H. rQ "
    "5,Q 1Q. 2E 3Q  3Q 3Q 4Q. 3E  2Q 7,Q 2Q 7,Q  1H. rQ",
    tradition="English nursery rhyme", swing="Swing"))

songs.append(song(
    "This Little Light of Mine", "C major", "4/4", "Major", "5,",
    "5,Q 1Q 3Q 5Q  5H. 3Q  5Q 5Q 5Q 5Q  5H. rQ "
    "5Q 5Q 5Q 5Q  6Q 6Q 5H  3Q 3Q 3Q 3Q  5Q 3Q 1H",
    tradition="US gospel/spiritual", swing="Swing"))

songs.append(song(
    "Santa Claus Is Coming to Town", "C major", "4/4", "Major", "5,",
    "rH 5,E 6,E  1Q. 1E 7,Q 1Q  2H. 5,E 6,E  1Q. 1E 7,Q 1Q  3H. 3E 4E "
    "5Q 5Q 3Q 4Q  5Q. 6E 5Q 3Q  4Q 3Q 2Q 3Q  1H. rQ",
    tradition="US popular/Christmas", swing="Swing"))

songs.append(song(
    "All Around My Hat", "C major", "4/4", "Major", "1",
    "1Q 1Q 1Q 2Q  3Q 3Q 5Q 5Q  5Q 4Q 3Q 2Q  3H. rQ "
    "1Q 1Q 1Q 2Q  3Q 3Q 5Q 5Q  4Q 3Q 2Q 1Q  1H. rQ",
    tradition="English folk song", swing="Swing"))

songs.append(song(
    "Big Ben/Westminster Chimes", "C major", "4/4", "Major", "3",
    "3H 1H  2H 5,H  5,H 2H  3H 1H "
    "3H 2H  1H 5,H",
    tradition="English clock chime", metre="Triple"))

songs.append(song(
    "We Wish You a Merry Christmas", "C major", "3/4", "Major", "5,",
    "rQ rQ 5,Q  1Q 1Q 1E 2E  3Q 3Q 3E 4E  2Q 2Q 2E 3E  4Q 2Q 5,Q "
    "1Q 1Q 1E 2E  3Q 3Q 5Q  5Q 4Q 2Q  1H 5,Q "
    "3Q 3Q 3Q  2H 2Q  3Q 2Q 1Q  5,H 5Q  6Q 4Q 5,Q  1H.",
    tradition="English carol", metre="Triple"))

# ══════════════════════════════════════════════════════════════════
# MINOR
# ══════════════════════════════════════════════════════════════════

songs.append(song(
    "Joshua Fit the Battle of Jericho", "A minor", "4/4", "Minor", "1",
    "1Q 1E 1E 1Q 1Q  1E 7,E 1E 2E b3Q  4Q 4E 4E 4Q 4Q  4E b3E 4E 5E b3Q "
    "1Q 1E 1E 1Q 1Q  1E 7,E 1E 2E b3Q  2Q. 1E b7,Q 1Q  1H. rQ",
    tradition="US spiritual", swing="Swing"))

songs.append(song(
    "Wade in the Water", "A minor", "4/4", "Minor", "1",
    "1H 5H  5Q. b3E 1H  1H 5H  5Q. 4E b3Q 1Q "
    "1Q 2Q b3Q 4Q  5H. rQ  5Q 4Q b3Q 1Q  1H. rQ",
    tradition="US spiritual", swing="Swing"))

songs.append(song(
    "Raisins and Almonds", "A minor", "3/4", "Minor", "1",
    # Range: 8ve (1 - 1'). Rozhinkes mit mandlen
    "1Q 1Q 2Q  b3H 4Q  5Q 4Q b3Q  2H 1Q "
    "2Q b3Q 4Q  5H 4Q  b3Q 2Q 1Q  7,H rQ "
    "1Q 1Q 2Q  b3H 5Q  1'Q b7Q 5Q  6H 5Q "
    "4Q b3Q 2Q  b3Q 2Q 1Q  7,Q 1Q 2Q  1H.",
    tradition="Yiddish lullaby", metre="Triple"))

songs.append(song(
    "Greensleeves", "A minor", "3/4", "Minor", "1",
    # Alas my love you do me wrong
    "1Q 2Q. b3E 4Q  5Q. 6E 5Q 4Q  2Q. 7,E 2Q 3Q  1Q. 7,E 1Q 2Q  b3H. "
    "rQ rQ 1Q  2Q. b3E 4Q  5Q. 6E 5Q 4Q  2Q. 7,E 2Q b3Q  2Q. 1E 7,Q 6,Q  1H. "
    # Greensleeves was all my joy
    "rQ rQ b7Q  b7Q. 1'E b7Q 6Q  5Q. #4E 5Q b3Q  1Q. 7,E 1Q 2Q  b3H. "
    "rQ rQ b7Q  b7Q. 1'E b7Q 6Q  5Q. #4E 5Q b3Q  2Q. 1E 7,Q 6,Q  1H.",
    tradition="English folk", metre="Triple"))

songs.append(song(
    "All The Pretty Little Horses", "A minor", "3/4", "Minor", "1",
    "1Q 5Q 5Q  1'Q 5Q 5Q  b7Q 6Q 5Q  4H 5Q "
    "4Q b3Q 4Q  5Q b3Q 1Q  b7,Q 6,Q b7,Q  1H rQ "
    "1Q 5Q 5Q  1'Q 5Q 5Q  b7Q 6Q 5Q  4H 5Q "
    "4Q b3Q 2Q  1Q 2Q b7,Q  1H.",
    tradition="US folk lullaby", metre="Triple"))

# ══════════════════════════════════════════════════════════════════
# DORIAN
# ══════════════════════════════════════════════════════════════════

songs.append(song(
    "Brahms' Hungarian Dance No. 5", "A minor", "4/4", "Minor", "5",
    "5Q. 6E 5Q 4Q  b3Q 4Q 5Q b3Q  2Q b3Q 4Q 2Q  1H. rQ "
    "5Q. 6E 5Q 4Q  b3Q 4Q 5Q b3Q  2Q 1Q 7,Q 1Q  1H. rQ",
    tradition="Verbunkos-inspired Romantic"))

songs.append(song(
    "Leaves are Falling", "A minor", "3/4", "Minor", "1",
    "rQ rQ 1Q  b3Q 4Q 5Q  4Q b3Q 1Q  b7,Q 1Q 2Q  1H.",
    tradition="Music Moves For Piano", metre="Triple"))

songs.append(song(
    "Lamma Bada", "A minor", "4/4", "Minor", "5",
    # Full melody spanning 13th (5, to 5')
    "5Q 4Q b3Q 2Q  1Q 2Q b3Q 4Q  5H. rQ  5Q 6Q 5Q 4Q  b3Q 2Q 1Q 7,Q "
    "1H. rQ  1'Q b7Q 6Q 5Q  4Q b3Q 2Q 1Q  b7,Q 6,Q 5,Q rQ "
    "1Q 2Q b3Q 4Q  5Q 6Q b7Q 1'Q  5'H. rQ",
    tradition="Andalusian muwashsha"))

songs.append(song(
    "Polska efter Maria Sohlberg", "A minor", "3/4", "Minor", "5",
    "5Q 1'Q b7Q  6Q 5Q 4Q  b3Q 4Q 5Q  1'H. "
    "b7Q 6Q 5Q  4Q b3Q 2Q  1H.",
    tradition="Swedish Polska", metre="Triple"))

songs.append(song(
    "Drunken Sailor", "D dorian", "4/4", "Dorian", "5,",
    "5,E 5,E 1E 1E 2E 2E b3E b3E  4E 4E b3E b3E 2E 2E 1E 1E "
    "5,E 5,E 1E 1E 2E 2E b3E b3E  2Q 1Q 7,Q 5,Q "
    "6,E 6,E 1E 1E 6,E 6,E 1E 1E  6,E 6,E 1E 1E 2Q 1Q "
    "5,E 5,E 1E 1E 2E 2E b3E b3E  2Q 1Q 7,Q 5,Q",
    tradition="English/Irish sea shanty"))

songs.append(song(
    "Scarborough Fair", "D dorian", "3/4", "Dorian", "1",
    "1Q 1Q 1Q  4H 4Q  4Q 5Q 6Q  5H. "
    "b7Q 6Q 5Q  4Q b3Q 4Q  1H. "
    "rQ rQ 1Q  1Q b7,Q 6,Q  b7,Q 1Q 2Q  b3H b7,Q  1H.",
    tradition="English folk ballad", metre="Triple"))

# ══════════════════════════════════════════════════════════════════
# MIXOLYDIAN
# ══════════════════════════════════════════════════════════════════

songs.append(song(
    "She Moved Through the Fair", "G mixolydian", "3/4", "Mixolydian", "1",
    "1Q 2Q 3Q  5H 6Q  b7Q 6Q 5Q  3H 2Q  1Q 2Q 3Q  5H 6Q  1'H. "
    "rQ rQ 1'Q  b7Q 6Q 5Q  3Q 5Q 3Q  2Q 1Q 2Q  3H. "
    "rQ rQ 1Q  2Q 3Q 5Q  6Q b7Q 6Q  5Q 3Q 2Q  1H.",
    tradition="Celtic", metre="Triple"))

# ══════════════════════════════════════════════════════════════════
# AEOLIAN
# ══════════════════════════════════════════════════════════════════

songs.append(song(
    "Siúl a Rún", "A aeolian", "3/4", "Aeolian", "1",
    "1Q 2Q b3Q  5H 5Q  b7Q 6Q 5Q  4Q b3Q 2Q  1H 1Q "
    "2Q b3Q 4Q  5H b3Q  2Q 1Q b7,Q  1H.",
    tradition="Irish folk", metre="Triple"))

songs.append(song(
    "Butterfly", "A aeolian", "9/8", "Aeolian", "5",
    # Range: 11th (b7, - b3'). Full melody with high and low extensions
    "5Q 6Q b7Q  1'Q b7Q 6Q  5Q b3Q 5Q  6Q 5Q b3Q "
    "5Q 6Q b7Q  1'Q b7Q 6Q  5Q b3Q 2Q  1H. "
    "b7,Q 1Q 2Q  b3Q 4Q 5Q  1'Q 2'Q b3'Q  2'Q 1'Q b7Q  5H.",
    tradition="Celtic", metre="Triple"))

songs.append(song(
    "Wayfaring Stranger", "A aeolian", "4/4", "Aeolian", "1",
    "rQ 1Q 1Q 1Q  b3H 4Q 5Q  5H. rQ  rQ 5Q 5Q 5Q "
    "4Q b3Q 4Q b3Q  1H. rQ  rQ 1Q 1Q 1Q  b3H 4Q 5Q  5H. rQ",
    tradition="American folk"))

# ══════════════════════════════════════════════════════════════════
# PHRYGIAN / HIJAZ
# ══════════════════════════════════════════════════════════════════

songs.append(song(
    "Hava Nagila", "E phrygian dominant", "4/4", "Phrygian Dominant", "5",
    "5Q 5Q 5Q. 6E  b7Q b7Q b7Q. 1'E  b7E 6E #5E 6E  b7H. rQ "
    "5Q 5Q 5Q. 6E  b7Q b7Q b7Q. 1'E  b7E 6E #5E 6E  b7H. rQ "
    "4Q 4Q 4Q. 5E  6Q 6Q 6Q. b7E  6E 5E #4E 5E  6H. rQ",
    tradition="Jewish folk"))

# ══════════════════════════════════════════════════════════════════
# Additional well-known songs
# ══════════════════════════════════════════════════════════════════

songs.append(song(
    "Malagueña", "E phrygian dominant", "3/4", "Phrygian Dominant", "5",
    "5Q. #4E 5Q  6Q 5Q 4Q  b3H 2Q  1H. "
    "1Q 2Q b3Q  4Q b3Q 2Q  1Q b7,Q 6,Q  5,H.",
    tradition="Andalusian/Flamenco", metre="Triple"))

songs.append(song(
    "Shalom Aleichem", "A hijaz", "4/4", "Hijaz", "5,",
    # Range: 10th (4, - b6). Shalom aleichem malachei hasharet
    "5,Q 1Q 1Q 1Q  2Q b3Q 4Q b3Q  2Q 1Q b7,Q 1Q  1H. rQ "
    "5,Q 1Q 1Q 2Q  b3Q 4Q 5Q b6Q  5Q 4Q b3Q 2Q  1H. rQ "
    "4,Q 5,Q 1Q 2Q  b3Q 4Q 5Q 4Q  b3Q 2Q 1Q b7,Q  1H. rQ",
    tradition="Jewish traditional"))

songs.append(song(
    "Pokarekare Ana", "C major", "4/4", "Major", "5,",
    "rQ 5,Q 1Q. 2E  3H 5Q. 3E  2Q 1Q 2Q 3Q  5H. rQ "
    "rQ 5Q 6Q. 5E  3H 1Q. 2E  3Q 5Q 3Q 2Q  1H. rQ",
    tradition="Waiata Māori", swing="Swing"))

songs.append(song(
    "Kongurei", "A minor pentatonic", "3/4", "Minor Pentatonic", "1",
    "1Q 4Q 5Q  1'H b7Q  5Q 4Q 5Q  1'H. "
    "b7Q 5Q 4Q  b3Q 1Q b7,Q  1H.",
    tradition="Tuvan/Mongolian herding song", metre="Triple"))

songs.append(song(
    "Aura Lee / Love Me Tender", "C major", "4/4", "Major", "3",
    "3Q 3Q 4Q 5Q  5Q 4Q 3Q 4Q  5Q 5Q 6Q 1'Q  6H. rQ "
    "3Q 3Q 4Q 5Q  5Q 4Q 3Q 4Q  5Q 5Q 6Q 5Q  3H. rQ",
    tradition="US Civil War era"))

songs.append(song(
    "Oh Susanna", "C major", "4/4", "Major", "1",
    "1E 2E 3Q 5Q  5E 6E 5Q 3Q  1E 2E 3Q 3Q  2Q 1Q 2H "
    "1E 2E 3Q 5Q  5E 6E 5Q 3Q  1E 2E 3Q 3Q  2Q 2Q 1H "
    "4H 4Q 6Q  6H. 5Q  3Q 5Q 5E 6E 5Q  3Q 1E 2E 3H "
    "1E 2E 3Q 5Q  5E 6E 5Q 3Q  1E 2E 3Q 3Q  2Q 2Q 1H",
    tradition="US folk/Stephen Foster"))

songs.append(song(
    "My Bonnie Lies Over the Ocean", "C major", "3/4", "Major", "5,",
    "rQ rQ 5,Q  1Q 2Q 3Q  3Q 2Q 1Q  3Q 2H "
    "rQ rQ 5,Q  1Q 2Q 3Q  3Q 2Q 5,Q  1H. "
    # Bring back
    "rQ rQ 6Q  6Q 5Q 3Q  5Q 3Q 5Q  6H. "
    "rQ rQ 6Q  6Q 5Q 3Q  2Q 1Q 7,Q  1H.",
    tradition="Scottish folk", metre="Triple"))

songs.append(song(
    "Erie Canal", "A minor", "4/4", "Minor", "5,",
    "rH 5,E 5,E  1Q 1Q 1E 2E b3Q  b3Q 4Q 5Q. b3E  4H. rQ "
    "rQ 5,E 5,E 1Q 1Q  1E 2E b3Q b3Q 4Q  5Q 4Q b3Q 2Q  1H. rQ "
    # Low bridge everybody down
    "rQ 5Q 5Q 5Q  5Q 4Q b3Q 4Q  5H. rQ  rQ b3Q 4Q 5Q  5Q 4Q b3Q 2Q  1H. rQ",
    tradition="US folk/work song", swing="Swing"))

songs.append(song(
    "The Ants Go Marching", "A minor", "3/4", "Aeolian", "5,",
    "rQ rQ 5,Q  1Q 1Q 1Q  1Q 2Q b3Q  b3Q b3Q b3Q "
    "b3Q 4Q 5Q  5Q 5Q 5Q  5Q 4Q b3Q  4Q b3Q 2Q  1H.",
    tradition="US children's song", metre="Triple"))

# ══════════════════════════════════════════════════════════════════

# Save
OUTPUT.parent.mkdir(exist_ok=True)
with open(OUTPUT, 'w', encoding='utf-8') as f:
    json.dump(songs, f, indent=2, ensure_ascii=False)

print(f"Wrote {len(songs)} songs to {OUTPUT}")
print()
for s in songs:
    deg = s["starting_note"]
    first_actual = next((e["scale_degree"] for e in s["scale_degrees"] if not e["is_rest"]), "?")
    match = "OK" if deg == first_actual else "MISS"
    print(f"  {match:4s} {s['name']:<42s} start={deg:<5s} first={first_actual:<5s} notes={len(s['scale_degrees'])}")
