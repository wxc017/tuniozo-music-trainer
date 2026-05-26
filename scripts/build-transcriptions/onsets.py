# Fast onset + tempo detector for the blues library.
#
# Emits, per audio file, the note-attack times (spectral-flux peaks) and a rough
# tempo, so the app can pick a RANDOM window at play time that actually contains
# notes (>=2 onsets) rather than landing on silence/an intro.  Onsets are
# downsampled to keep the stored array small.
#
#   python onsets.py <audio>
# prints JSON: { "dur": seconds, "bpm": int, "onsets": [seconds, ...] }

import subprocess, sys, json, numpy as np

SR = 11025
HOP = 512
FRAME = 1024

CAP_SEC = 180   # analyse only the first 3 minutes (enough onsets; skips fades)

def load(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "quiet", "-i", path, "-t", str(CAP_SEC), "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
        capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

def main():
    path = sys.argv[1]
    x = load(path)
    dur = round(len(x) / SR, 2)
    if len(x) < FRAME * 8:
        print(json.dumps({"dur": dur, "bpm": 100, "onsets": []})); return

    n = 1 + (len(x) - FRAME) // HOP
    win = np.hanning(FRAME).astype(np.float32)
    # Spectral-flux novelty curve + per-frame RMS energy.
    prev = None
    flux = np.zeros(n, dtype=np.float32)
    rms = np.zeros(n, dtype=np.float32)
    for i in range(n):
        seg = x[i * HOP: i * HOP + FRAME]
        rms[i] = np.sqrt(np.mean(seg * seg) + 1e-9)
        mag = np.abs(np.fft.rfft(seg * win))
        if prev is not None:
            flux[i] = np.maximum(0.0, mag - prev).sum()
        prev = mag
    if flux.max() > 0:
        flux /= flux.max()

    # Sustained-loudness gate: a real "band playing" stretch is loud for ~1s, not
    # a lone transient (a crowd shout in a quiet gap).  Keep onsets only where the
    # LOCAL-MEAN energy is a decent fraction of the track's loudest sustained level.
    esmooth = max(3, int(1.0 * SR / HOP))                # ~1 s energy window
    ekernel = np.ones(esmooth, dtype=np.float32) / esmooth
    energy = np.convolve(rms, ekernel, "same")
    egate = 0.33 * float(energy.max()) if energy.max() > 0 else 0.0

    # Peak-pick: local maximum above an adaptive (local-mean) threshold, AND in a
    # sustained-loud region.
    win_f = max(3, int(0.15 * SR / HOP))                 # ~150 ms smoothing window
    kernel = np.ones(win_f, dtype=np.float32) / win_f
    local = np.convolve(flux, kernel, "same")
    onsets = []
    last = -1.0
    for i in range(1, n - 1):
        if energy[i] < egate:                            # quiet gap → skip (e.g. crowd-only)
            continue
        if flux[i] > local[i] + 0.04 and flux[i] >= flux[i - 1] and flux[i] > flux[i + 1]:
            t = i * HOP / SR
            if t - last > 0.07:                          # min 70 ms between onsets
                onsets.append(round(float(t), 2)); last = t

    # Tempo from the median inter-onset interval (clamped to a sane range).
    bpm = 100
    if len(onsets) > 4:
        iois = np.diff(onsets)
        iois = iois[(iois > 0.15) & (iois < 1.5)]
        if len(iois):
            bpm = int(max(60, min(200, round(60.0 / float(np.median(iois))))))

    # Downsample to <=400 onsets (enough to vet windows, keeps JSON small).
    if len(onsets) > 400:
        idx = np.linspace(0, len(onsets) - 1, 400).astype(int)
        onsets = [onsets[j] for j in idx]

    print(json.dumps({"dur": dur, "bpm": bpm, "onsets": onsets}))

main()
