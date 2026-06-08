// ── IPA → speech (AWS Polly) ────────────────────────────────────────
// Tiny AWS Lambda that turns an IPA string into spoken MP3 via Amazon Polly's
// <phoneme alphabet="ipa"> SSML, and returns it base64-encoded (matching what
// the Tunizo frontend expects).  Deploy as a Lambda Function URL (see README).
//
// The @aws-sdk/* packages are preinstalled in the Lambda Node.js runtime, so no
// bundling/`npm install` is needed — just paste this file.

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

const polly = new PollyClient({});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const json = (statusCode, value) => ({
  statusCode,
  headers: { ...CORS, "Content-Type": "application/json" },
  body: JSON.stringify(value),
});

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method ?? event?.httpMethod;
  if (method === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body ?? {});
    const ipa = String(body.text ?? "").trim().replace(/[<>"]/g, "");   // sanitize for SSML
    const voice = String(body.voice ?? "Brian");
    if (!ipa) return json(400, "missing text");

    const ssml = `<speak><phoneme alphabet="ipa" ph="${ipa}">-</phoneme></speak>`;
    const out = await polly.send(new SynthesizeSpeechCommand({
      Text: ssml,
      TextType: "ssml",
      OutputFormat: "mp3",
      VoiceId: voice,            // Brian, Amy, Joanna, Matthew, Salli, …
    }));

    const bytes = await out.AudioStream.transformToByteArray();
    return json(200, Buffer.from(bytes).toString("base64"));
  } catch (err) {
    return json(500, String(err?.message ?? err));
  }
};
