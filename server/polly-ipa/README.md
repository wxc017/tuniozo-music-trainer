# IPA → speech (AWS Polly) — Tunizo solfège audio

Exact IPA playback for the solfège palette, using Amazon Polly's
`<phoneme alphabet="ipa">` SSML. Same engine ipa-reader.com uses, but it's
*yours* (stable, no CORS surprises, no rate limits).

`index.mjs` is a self-contained AWS Lambda — the `@aws-sdk/*` libraries ship in
the Lambda Node.js runtime, so there's nothing to `npm install` or bundle.

## Deploy (Lambda Function URL — ~3 min)

1. **Create the function**
   - Lambda → Create function → Author from scratch.
   - Runtime: **Node.js 20.x** (or 18.x). Architecture: any.
   - Paste `index.mjs` into the editor (file `index.mjs`, handler `index.handler`). Deploy.

2. **Grant Polly permission**
   - Configuration → Permissions → click the execution role → add an inline policy:
     ```json
     { "Version": "2012-10-17",
       "Statement": [{ "Effect": "Allow", "Action": "polly:SynthesizeSpeech", "Resource": "*" }] }
     ```

3. **Expose a URL with CORS**
   - Configuration → Function URL → Create.
   - Auth type: **NONE** (it only synthesizes speech; or use IAM if you prefer).
   - Configure CORS: Allow origin `*` (or your site origin), allow header `content-type`, allow method `POST`.
   - Copy the Function URL.

4. **Point the app at it**
   - In `App/.env` (or `.env.local`):
     ```
     VITE_IPA_ENDPOINT=https://<your-id>.lambda-url.<region>.on.aws/
     ```
   - Restart `npm run dev`. The solfège buttons now play exact IPA from your Polly.

## Request / response contract

```
POST  { "text": "θeɪ", "voice": "Brian" }     // text = IPA
200   "<base64 mp3>"                            // JSON-encoded base64 string
```

The frontend plays it via `new Audio("data:audio/mpeg;base64," + body)`.
If `VITE_IPA_ENDPOINT` is unset it falls back to the public ipa-reader endpoint,
and if that fails, to the browser's speech synth on the solfège spelling.

## Notes
- Voices: `Brian` `Amy` `Emma` (en-GB), `Joanna` `Matthew` `Salli` `Kevin` (en-US). Pass via `voice`.
- Polly's standard engine fully supports `<phoneme>`; some neural voices restrict SSML, so this uses the standard engine (no `Engine` field).
- Cost is negligible (a few characters per call; first 5M chars/month are free for 12 months).
