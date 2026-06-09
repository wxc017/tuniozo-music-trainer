# Solfège audio (pre-rendered mp3s)

The app plays each solfège syllable from a bundled mp3 **if present**, before
falling back to piper-wasm or the browser's speech voice. These are generated
from **Amazon Polly** (the same engine ipa-reader.com uses) by
`scripts/download_solfege_mp3.mjs`.

## Layout — one folder per solfège system

```
public/solfege/
  microtonal/   # the Universal / interval-spectrum gamut (Sais, Thay, Vail …)
  heathwaite/   # Andrew Heathwaite's Do-Re-Mi system (Do, Re, Mi, Ra, Du …)
```

Within each folder, files are named by their **IPA**, URL-encoded:

```
<encodeURIComponent(ipa)>.mp3      e.g.  doʊ → do%CA%8A.mp3 ,  saɪs → sa%C9%AAs.mp3
```

Keying by IPA (not spelling) means identical sounds share one file, and the two
systems never collide (e.g. microtonal "Fi" /fɪ/ vs Heathwaite "Fi" /fiː/ live
in separate folders). Each folder's `manifest.json` lists every `{ ipa, file,
labels }` for reference.

The frontend resolves the same path:
- `solfegeGamut.ts` → `solfege/microtonal/<ipa>.mp3`
- `piperSpeech.ts`  → `solfege/<system>/<ipa>.mp3`

## How to (re)generate

The IPA lists are read straight from source (`src/lib/solfegeGamut.ts` and the
`HEATHWAITE_IPA` map in `src/lib/solfegeSpeech.ts`), so they can't drift. You
need AWS credentials for an IAM user with `polly:SynthesizeSpeech`
(`AmazonPollyReadOnlyAccess`); Polly's free tier covers this many times over.

```powershell
$env:AWS_ACCESS_KEY_ID="AKIA..."
$env:AWS_SECRET_ACCESS_KEY="..."
$env:VOICE="Salli"     # any Polly voice; Salli is ipa-reader.com's default
node scripts/download_solfege_mp3.mjs

$env:FORCE="1"         # re-download files that already exist
```

Any syllable missing an mp3 simply falls back to piper / the browser voice.
