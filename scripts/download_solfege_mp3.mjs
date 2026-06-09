// ── Download every solfège syllable as an mp3 (AWS Polly — ipa-reader.com's engine) ──
//
// ipa-reader.com is just a thin browser front-end for Amazon Polly's
// <phoneme alphabet="ipa"> SSML.  Its old public Cognito pool no longer grants
// polly:SynthesizeSpeech (returns 403 as of 2026), so this script calls Polly
// directly with YOUR AWS credentials and SigV4-signs the requests itself (no
// aws-sdk dependency).
//
// It collects every IPA string the app can actually speak — the microtonal
// gamut (src/lib/solfegeGamut.ts) AND the Heathwaite Do/Re/Mi system
// (HEATHWAITE_IPA in src/lib/solfegeSpeech.ts) — straight from source, dedupes
// each system, and writes one mp3 per unique IPA into a folder PER SYSTEM:
//
//     public/solfege/microtonal/<encodeURIComponent(ipa)>.mp3
//     public/solfege/heathwaite/<encodeURIComponent(ipa)>.mp3
//
// Separate folders keep the two systems from colliding (e.g. microtonal "Fi"
// /fɪ/ vs Heathwaite "Fi" /fiː/), and within a folder files are keyed by IPA
// (not spelling) so identical sounds share one file.  The frontend
// (solfegeGamut.ts / piperSpeech.ts) resolves the same name via
// `solfege/<system>/<encodeURIComponent(ipa)>.mp3`.
//
// USAGE (PowerShell):
//     $env:AWS_ACCESS_KEY_ID="AKIA..."
//     $env:AWS_SECRET_ACCESS_KEY="..."
//     $env:VOICE="Salli"        # any Polly voice — Salli (ipa-reader default) / Brian / Joanna / Matthew …
//     node scripts/download_solfege_mp3.mjs
//
//     $env:FORCE="1"            # re-download files that already exist
//     $env:AWS_REGION="us-west-2"
//
// The IAM user needs only the `polly:SynthesizeSpeech` permission
// (AmazonPollyReadOnlyAccess).  Polly's free tier (5M chars/mo) covers this
// ~10x over — the whole set is well under 1000 characters.

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, createHmac } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "..");
const SOLFEGE_DIR = resolve(APP, "public/solfege");

const REGION = process.env.AWS_REGION || "us-west-2";
const VOICE = process.env.VOICE || "Salli";
const FORCE = !!process.env.FORCE;

// Filename slug: pure-ASCII, percent-free, so it survives a static server
// URL-decoding the request path (encodeURIComponent's "%CA%8A" would decode
// back to a unicode char and miss the file).  Non-alphanumerics → "-<hex>"
// (zero-padded to 4) — deterministic and injective.  MUST match ipaSlug() in
// src/lib/solfegeGamut.ts and src/lib/piperSpeech.ts.
const ipaSlug = (ipa) =>
  Array.from(ipa).map(c => /[A-Za-z0-9]/.test(c) ? c : "-" + c.codePointAt(0).toString(16).padStart(4, "0")).join("");
const fileFor = (ipa) => ipaSlug(ipa) + ".mp3";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => access(p).then(() => true).catch(() => false);
const sha256hex = (d) => createHash("sha256").update(d).digest("hex");
const hmac = (k, d) => createHmac("sha256", k).update(d).digest();

// ── Collect every IPA the app can speak, straight from source ──────────────
// Returns one `ipa -> Set<label>` map per solfège system.
async function collectSyllables() {
  const newMap = () => new Map();
  const add = (map, ipa, label) => {
    if (!ipa) return;
    if (!map.has(ipa)) map.set(ipa, new Set());
    if (label) map.get(ipa).add(label);
  };

  // Microtonal gamut — `{ solfege: "Sais", ipa: "saɪs", ... }`
  const microtonal = newMap();
  const gamut = await readFile(resolve(APP, "src/lib/solfegeGamut.ts"), "utf8");
  for (const m of gamut.matchAll(/solfege:\s*"([^"]+)"[^}]*?ipa:\s*"([^"]+)"/g)) {
    add(microtonal, m[2], m[1]);
  }

  // Heathwaite solfège — the HEATHWAITE_IPA object in solfegeSpeech.ts
  const heathwaite = newMap();
  const speech = await readFile(resolve(APP, "src/lib/solfegeSpeech.ts"), "utf8");
  const block = speech.match(/const HEATHWAITE_IPA[^{]*\{([\s\S]*?)\n\};/);
  if (block) {
    for (const m of block[1].matchAll(/(\w+):\s*"([^"]+)"/g)) add(heathwaite, m[2], m[1]);
  }

  return { microtonal, heathwaite };
}

// ── Polly credentials (env only — no public Cognito fallback; it 403s now) ──
function getCredentials() {
  const ak = process.env.AWS_ACCESS_KEY_ID;
  const sk = process.env.AWS_SECRET_ACCESS_KEY;
  if (!ak || !sk) {
    throw new Error(
      "No AWS credentials. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY " +
      "(IAM user with polly:SynthesizeSpeech)."
    );
  }
  return { ak, sk, token: process.env.AWS_SESSION_TOKEN || "" };
}

// ── SigV4-signed Polly SynthesizeSpeech ────────────────────────────────────
async function pollySynthesize(creds, ipa, voiceId) {
  const host = `polly.${REGION}.amazonaws.com`;
  const path = "/v1/speech";
  // Match ipa-reader.com's polly.js: a bare <phoneme> element, no <speak> wrap.
  const payload = JSON.stringify({
    OutputFormat: "mp3", SampleRate: "16000",
    Text: `<phoneme alphabet='ipa' ph='${ipa.replace(/\//g, "")}'></phoneme>`,
    TextType: "ssml", VoiceId: voiceId,
  });
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");   // 20260609T123456Z
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(payload);

  const hasToken = !!creds.token;
  const canonicalHeaders =
    `content-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n` + (hasToken ? `x-amz-security-token:${creds.token}\n` : "");
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date" + (hasToken ? ";x-amz-security-token" : "");
  const canonicalRequest = ["POST", path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const scope = `${dateStamp}/${REGION}/polly/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac("AWS4" + creds.sk, dateStamp), REGION), "polly"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${creds.ak}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = {
    "Content-Type": "application/json",
    "X-Amz-Date": amzDate,
    "X-Amz-Content-Sha256": payloadHash,
    Authorization: authorization,
  };
  if (hasToken) headers["X-Amz-Security-Token"] = creds.token;
  const res = await fetch(`https://${host}${path}`, { method: "POST", headers, body: payload });
  if (!res.ok) throw new Error(`Polly HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function downloadSystem(creds, system, byIpa) {
  const dir = resolve(SOLFEGE_DIR, system);
  await mkdir(dir, { recursive: true });
  const entries = [...byIpa.entries()];   // [ipa, Set<label>]
  console.log(`\n[${system}] ${entries.length} unique IPA syllables → public/solfege/${system}/`);

  const manifest = [];
  let ok = 0, skip = 0, fail = 0;
  for (const [ipa, labels] of entries) {
    const file = fileFor(ipa);
    const out = resolve(dir, file);
    const labelStr = [...labels].join("/") || "—";
    manifest.push({ ipa, file, labels: [...labels] });
    if (!FORCE && (await exists(out))) { console.log(`skip  ${labelStr}`); skip++; continue; }
    try {
      const buf = await pollySynthesize(creds, ipa, VOICE);
      if (buf.length < 200) throw new Error(`tiny file (${buf.length} B)`);
      await writeFile(out, buf);
      console.log(`ok    ${labelStr.padEnd(14)} /${ipa}/  → ${file} (${buf.length} B)`);
      ok++;
    } catch (e) {
      console.warn(`FAIL  ${labelStr.padEnd(14)} /${ipa}/  — ${e.message}`);
      fail++;
    }
    await sleep(120);
  }

  manifest.sort((a, b) => a.ipa.localeCompare(b.ipa));
  await writeFile(resolve(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`[${system}] ${ok} downloaded, ${skip} skipped, ${fail} failed`);
  return { ok, skip, fail };
}

async function main() {
  const creds = getCredentials();
  const systems = await collectSyllables();
  console.log(`voice=${VOICE} · region=${REGION}`);

  const totals = { ok: 0, skip: 0, fail: 0 };
  for (const [system, byIpa] of Object.entries(systems)) {
    const r = await downloadSystem(creds, system, byIpa);
    totals.ok += r.ok; totals.skip += r.skip; totals.fail += r.fail;
  }
  console.log(`\nTOTAL — ${totals.ok} downloaded, ${totals.skip} skipped, ${totals.fail} failed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
