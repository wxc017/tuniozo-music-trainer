# Pragmatic audio → melody transcription + solo-section finder (numpy + ffmpeg).
#
# basic-pitch (the polished AI tool) can't install on this Windows-ARM box
# (numba has no arm64 wheel), so this does a lightweight monophonic pitch +
# energy analysis: it's approximate (the user learns by ear anyway) but it
# locates the busy/loud region = the solo, and emits a rough melody for the
# Show-Answer notation.
#
#   python transcribe.py <audio> [window_sec]
# prints JSON: { soloStart, soloEnd, notes: [{midi, start, dur}] }

import subprocess, sys, json, numpy as np

SR = 22050
HOP = 512      # ~23ms frames — half the work of 256, plenty fine for solo-finding
FRAME = 2048

def load(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "quiet", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
        capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

def analyze(x):
    n = 1 + (len(x) - FRAME) // HOP if len(x) >= FRAME else 0
    win = np.hanning(FRAME)
    f0 = np.zeros(n); rms = np.zeros(n)
    fmin, fmax = 70.0, 1200.0
    lo, hi = int(SR / fmax), int(SR / fmin)
    for i in range(n):
        fr = x[i * HOP: i * HOP + FRAME] * win
        rms[i] = np.sqrt(np.mean(fr * fr) + 1e-9)
        # autocorrelation via FFT
        s = np.fft.rfft(fr, 2 * FRAME)
        ac = np.fft.irfft(s * np.conj(s))[:FRAME]
        if ac[0] <= 0: continue
        seg = ac[lo:hi]
        if len(seg) == 0: continue
        lag = lo + int(np.argmax(seg))
        if ac[lag] / ac[0] > 0.30:           # confident enough
            f0[i] = SR / lag
    return f0, rms

def main():
    path = sys.argv[1]
    window = float(sys.argv[2]) if len(sys.argv) > 2 else 24.0
    x = load(path)
    if len(x) < FRAME * 4:
        print(json.dumps({"error": "audio too short"})); return
    f0, rms = analyze(x)
    t = np.arange(len(f0)) * HOP / SR

    # Pick a `window`-sec stretch where the guitar is actually PLAYING — but NOT
    # restricted to the single busiest "solo" peak.  We require modest activity
    # (~>=2 notes/measure, approximated by the fraction of pitched+energetic
    # frames) and take the EARLIEST window that clears that bar, so clips come
    # from representative playing sections, not only the climactic solo.  Falls
    # back to the most-active window if nothing clears the bar.
    voiced = (f0 > 0) & (rms > rms.max() * 0.15)
    fpw = max(1, int(window * SR / HOP))
    score = np.convolve(voiced.astype(np.float32), np.ones(fpw), "valid")
    if len(score):
        intro = int(0.08 * len(score))                  # skip a short intro
        gate = 0.22 * fpw                                # ~>=2 notes/measure of activity
        qualifying = np.where(score[intro:] >= gate)[0]
        start_i = intro + int(qualifying[0]) if len(qualifying) else int(np.argmax(score))
    else:
        start_i = 0
    solo_start = round(float(t[start_i]), 2)
    solo_end = round(float(solo_start + window), 2)

    # Rough notes within the solo window: median-filter f0, segment by pitch.
    notes = []
    cur_midi, cur_start = None, None
    end_i = min(len(f0), start_i + fpw)
    for i in range(start_i, end_i):
        m = None
        if voiced[i] and f0[i] > 0:
            m = int(round(69 + 12 * np.log2(f0[i] / 440.0)))
        if m != cur_midi:
            if cur_midi is not None:
                dur = round(float(t[i] - cur_start), 3)
                if dur >= 0.08 and 40 <= cur_midi <= 96:
                    notes.append({"midi": cur_midi, "start": round(float(cur_start - t[start_i]), 3), "dur": dur})
            cur_midi, cur_start = m, t[i]
    # Crude tempo estimate from the median note onset spacing (clamped).
    onsets = [nn["start"] for nn in notes]
    iois = [b - a for a, b in zip(onsets, onsets[1:]) if 0.1 < (b - a) < 1.5]
    bpm = 100
    if iois:
        beat = float(np.median(iois))
        bpm = int(max(60, min(200, round(60.0 / beat))))
    print(json.dumps({"soloStart": solo_start, "soloEnd": solo_end, "bpm": bpm, "noteCount": len(notes), "notes": notes}))

main()
