// ── Download solfège syllable mp3s (AWS Polly, ipa-reader.com's backend) ──
// Reads App/public/solfege/manifest.json (solfège → IPA) and saves one mp3 per
// syllable into App/public/solfege/<name>.mp3, which speakSolfege() then plays
// before any fallback.
//
// ipa-reader.com calls AWS Polly straight from the browser using a public
// Cognito identity pool + SSML <phoneme alphabet="ipa">.  This script does the
// same with zero dependencies: it SigV4-signs the Polly SynthesizeSpeech
// requests itself (no aws-sdk needed).
//
// CREDENTIALS — two ways:
//   1) YOUR AWS account (recommended; free tier = 5M chars/mo, this needs ~300):
//        export AWS_ACCESS_KEY_ID=...   export AWS_SECRET_ACCESS_KEY=...
//        node scripts/download_solfege_mp3.mjs
//      The IAM user/role just needs the `polly:SynthesizeSpeech` permission.
//   2) ipa-reader.com's public Cognito pool (no AWS account) — NOTE: as of
//      2026 their unauth role no longer grants polly:SynthesizeSpeech, so this
//      returns 403.  Left in as a fallback in case they re-open it.
//
//   VOICE=Joanna node scripts/download_solfege_mp3.mjs # any Polly voice
//   FORCE=1 node scripts/download_solfege_mp3.mjs      # re-download existing
//   AWS_REGION=us-east-1 node scripts/download_solfege_mp3.mjs

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, createHmac } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../public/solfege");
const MANIFEST = join(OUT_DIR, "manifest.json");

const REGION = process.env.AWS_REGION || "us-west-2";
const IDENTITY_POOL_ID = "us-west-2:42521701-f77a-4555-8b1c-e160ad0210da"; // ipa-reader.com's public pool
const VOICE = process.env.VOICE || "Brian";
const FORCE = !!process.env.FORCE;

const fileFor = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "") + ".mp3";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => access(p).then(() => true).catch(() => false);
const sha256hex = (d) => createHash("sha256").update(d).digest("hex");
const hmac = (k, d) => createHmac("sha256", k).update(d).digest();

// ── Cognito: unauthenticated temporary credentials (public, no signing) ──
async function cognito(target, body) {
  const res = await fetch(`https://cognito-identity.${REGION}.amazonaws.com/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": `AWSCognitoIdentityService.${target}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Cognito ${target} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
async function getCredentials() {
  // Prefer real AWS credentials from the environment (these can actually call Polly).
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    console.log("Using AWS credentials from environment.");
    return {
      ak: process.env.AWS_ACCESS_KEY_ID,
      sk: process.env.AWS_SECRET_ACCESS_KEY,
      token: process.env.AWS_SESSION_TOKEN || "",
    };
  }
  console.log(`No AWS_* env creds — falling back to ipa-reader's Cognito pool (${IDENTITY_POOL_ID}).`);
  const { IdentityId } = await cognito("GetId", { IdentityPoolId: IDENTITY_POOL_ID });
  const { Credentials } = await cognito("GetCredentialsForIdentity", { IdentityId });
  return { ak: Credentials.AccessKeyId, sk: Credentials.SecretKey, token: Credentials.SessionToken };
}

// ── SigV4-signed Polly SynthesizeSpeech ──
async function pollySynthesize(creds, ipa, voiceId) {
  const host = `polly.${REGION}.amazonaws.com`;
  const path = "/v1/speech";
  const payload = JSON.stringify({
    OutputFormat: "mp3", SampleRate: "16000",
    Text: `<phoneme alphabet='ipa' ph='${ipa.replace(/\//g, "")}'></phoneme>`,
    TextType: "ssml", VoiceId: voiceId,
  });
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");   // 20240101T000000Z
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

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const entries = Object.entries(manifest);
  console.log(`Fetching Cognito credentials (pool ${IDENTITY_POOL_ID})…`);
  const creds = await getCredentials();
  console.log(`${entries.length} syllables · voice=${VOICE} · region=${REGION}\n`);

  let ok = 0, skip = 0, fail = 0;
  for (const [solfege, ipa] of entries) {
    const out = join(OUT_DIR, fileFor(solfege));
    if (!FORCE && (await exists(out))) { console.log(`skip  ${solfege}`); skip++; continue; }
    try {
      const buf = await pollySynthesize(creds, ipa, VOICE);
      if (buf.length < 200) throw new Error(`tiny file (${buf.length} B)`);
      await writeFile(out, buf);
      console.log(`ok    ${solfege.padEnd(6)} /${ipa}/  → ${fileFor(solfege)} (${buf.length} B)`);
      ok++;
    } catch (e) {
      console.warn(`FAIL  ${solfege.padEnd(6)} /${ipa}/  — ${e.message}`);
      fail++;
    }
    await sleep(150);
  }
  console.log(`\ndone — ${ok} downloaded, ${skip} skipped, ${fail} failed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
