"""Music bed for the feature video: an arranged, royalty-free track synthesized from scratch.

Usage: python3 music.py <timing.json> <out_dir>
timing.json: {"total": seconds, "reveal": s, "groove": s, "breakdown": s, "finale": s, "end_chord": s, "cuts": [s, ...]}
Writes stems (pads, keys, bass, drums, fx) as 44.1 kHz stereo wav into out_dir; mix.sh adds reverb and mixes.
"""
import json
import sys
import wave

import numpy as np

SR = 44100
BPM = 100
BEAT = 60 / BPM
BAR = BEAT * 4

T = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
N = int(SR * T["total"]) + SR
rng = np.random.default_rng(7)


def midi(m):
    return 440 * 2 ** ((m - 69) / 12)


def stereo():
    return np.zeros((N, 2))


def place(buf, start_s, sig, pan=0.5, gain=1.0):
    s = int(start_s * SR)
    if s >= N or s + len(sig) <= 0:
        return
    sig = sig[: N - s]
    buf[s : s + len(sig), 0] += sig * gain * (1 - pan) * 2 ** 0.5 * 0.71
    buf[s : s + len(sig), 1] += sig * gain * pan * 2 ** 0.5 * 0.71


def env(n, a, r, sustain=1.0):
    e = np.full(n, sustain)
    ai, ri = max(1, int(a * SR)), max(1, int(r * SR))
    e[:ai] = np.linspace(0, sustain, ai)
    e[-ri:] *= np.linspace(1, 0, ri)
    return e


def lowpass(x, cutoff):
    # one-pole, gentle
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


# Bar grid anchored so the reveal lands on a downbeat.
grid0 = T["reveal"] - BAR * round(T["reveal"] / BAR)
bars = [grid0 + i * BAR for i in range(-1, int(T["total"] / BAR) + 3)]
bars = [b for b in bars if b > -BAR]

# Two progressions, alternated every 8 bars so the track keeps moving.
PROG_INTRO = [[45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [48, 55, 60, 64, 67], [43, 50, 55, 59, 62]]  # Am F C G
PROG_A = [[48, 55, 60, 64, 67], [43, 50, 55, 59, 62], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60]]  # C G Am F
PROG_B = [[41, 48, 53, 57, 60], [43, 50, 55, 59, 62], [40, 47, 52, 55, 59], [45, 52, 57, 60, 64]]  # F G Em Am
PROG_LIFT = [[41, 48, 53, 57, 65], [43, 50, 55, 62, 67], [45, 52, 57, 64, 69], [43, 50, 55, 62, 67]]  # F G Am G

pads, keys, bass, drums, fx = stereo(), stereo(), stereo(), stereo(), stereo()


def section(t):
    if t < T["reveal"]:
        return "intro"
    if t >= T["end_chord"]:
        return "end"
    if t >= T["finale"]:
        return "finale"
    if T["breakdown"] <= t < T["breakdown"] + 2 * BAR:
        return "breakdown"
    return "main"


def chord_for(i, t):
    sec = section(t)
    if sec == "intro":
        return PROG_INTRO[i % 4]
    if sec == "finale":
        return PROG_LIFT[i % 4]
    k = int((t - T["reveal"]) // (8 * BAR))
    return (PROG_A if k % 2 == 0 else PROG_B)[i % 4]


def pad_note(f, n, bright):
    tt = np.arange(n) / SR
    det = [0.997, 1.0, 1.004]
    v = sum(np.sin(2 * np.pi * f * d * tt) + bright * 0.3 * np.sin(2 * np.pi * 2 * f * d * tt) for d in det) / 3
    return v


for bi, b in enumerate(bars):
    if b >= T["end_chord"]:
        break
    sec = section(max(b, 0))
    ch = chord_for(bi, max(b, 0))
    n = int(BAR * 1.08 * SR)
    bright = 0.4 if sec == "intro" else 1.0
    gain = 0.045 if sec == "intro" else 0.055
    e = env(n, 0.5 if sec == "intro" else 0.25, 0.6)
    for k, m in enumerate(ch):
        place(pads, b, pad_note(midi(m), n, bright) * e, pan=0.3 + 0.1 * k, gain=gain)

    # Bass: whole notes in the intro, a pushing eighth-note pattern later (varies by section).
    root = midi(ch[0] - 12)
    if sec == "intro":
        if b >= 4:
            tt = np.arange(int(BAR * SR)) / SR
            place(bass, b, np.sin(2 * np.pi * root * tt) * env(len(tt), 0.3, 0.8), gain=0.10)
    elif sec in ("main", "finale"):
        pattern = [0, 1.5, 2, 3, 3.5] if (bi // 4) % 2 == 0 else [0, 0.5, 2, 2.5, 3.5]
        for p in pattern:
            nn = int(BEAT * 0.45 * SR)
            tt = np.arange(nn) / SR
            sig = (np.sin(2 * np.pi * root * tt) + 0.25 * np.sin(2 * np.pi * 2 * root * tt)) * np.exp(-tt * 5) * np.minimum(1, tt * 300)
            place(bass, b + p * BEAT, sig, gain=0.17)

    # Keys: plucked arpeggio from the reveal; the pattern changes every 4 bars.
    if sec in ("main", "breakdown", "finale"):
        notes = [ch[2] + 12, ch[3] + 12, ch[4] + 12, ch[3] + 12]
        if (bi // 4) % 2 == 1:
            notes = [ch[4] + 12, ch[2] + 12, ch[3] + 12, ch[2] + 24]
        steps = 8 if sec != "breakdown" else 4
        for q in range(steps):
            nn = int(0.6 * SR)
            tt = np.arange(nn) / SR
            f = midi(notes[q % 4])
            sig = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * 2 * f * tt) + 0.1 * np.sin(2 * np.pi * 3 * f * tt)) * np.exp(-tt * 7) * np.minimum(1, tt * 500)
            place(keys, b + q * (BAR / steps), sig, pan=0.25 + 0.5 * (q % 2), gain=0.045 if sec != "finale" else 0.055)

    # Drums: kick from the reveal, clap on 2 and 4 from the first feature, hats on the off-beats.
    if sec in ("main", "finale"):
        for q in range(4):
            t0 = b + q * BEAT
            nn = int(0.3 * SR)
            tt = np.arange(nn) / SR
            kf = 48 + 100 * np.exp(-tt * 35)
            place(drums, t0, np.sin(2 * np.pi * np.cumsum(kf) / SR) * np.exp(-tt * 12), gain=0.30)
            if t0 >= T["groove"] and q in (1, 3):
                cn = int(0.18 * SR)
                noise = rng.standard_normal(cn)
                clap = lowpass(noise, 2500) * np.exp(-np.arange(cn) / SR * 22)
                place(drums, t0, clap, gain=0.22)
            hn = int(0.05 * SR)
            hat = np.diff(np.concatenate([[0], rng.standard_normal(hn)])) * np.exp(-np.arange(hn) / SR * 70)
            place(drums, t0 + BEAT / 2, hat, pan=0.65, gain=0.035)
        # A short fill into every 8th bar.
        if bi % 8 == 7:
            for q in range(4):
                tn = int(0.12 * SR)
                tom = np.sin(2 * np.pi * (180 - 25 * q) * np.arange(tn) / SR) * np.exp(-np.arange(tn) / SR * 18)
                place(drums, b + 3 * BEAT + q * BEAT / 4, tom, gain=0.16)

# Riser into the reveal and the finale, a soft impact on each.
for hit in (T["reveal"], T["finale"]):
    rn = int(2.2 * SR)
    noise = rng.standard_normal(rn)
    ramp = np.linspace(0, 1, rn) ** 2
    rise = np.zeros(rn)
    acc = 0.0
    for i in range(rn):
        a = np.exp(-2 * np.pi * (300 + 6000 * ramp[i]) / SR)
        acc = (1 - a) * noise[i] + a * acc
        rise[i] = acc
    place(fx, hit - 2.2, rise * ramp, gain=0.06)
    bn = int(1.6 * SR)
    tt = np.arange(bn) / SR
    boom = np.sin(2 * np.pi * (40 + 30 * np.exp(-tt * 6)) * tt) * np.exp(-tt * 2.5)
    place(fx, hit, boom, gain=0.32)

# A gentle whoosh on each scene change.
for c in T["cuts"]:
    wn = int(0.7 * SR)
    noise = rng.standard_normal(wn)
    shape = np.sin(np.linspace(0, np.pi, wn)) ** 2
    w = lowpass(noise, 1800) * shape
    place(fx, c - 0.35, w, pan=0.4, gain=0.05)

# The ending: a held C major chord (with the low C) that rings out instead of a loop fading away.
end = T["end_chord"]
n = int((T["total"] - end + 0.8) * SR)
for k, m in enumerate([36, 48, 55, 60, 64, 67, 72, 76]):
    sig = pad_note(midi(m), n, 1.0) * env(n, 0.04, n / SR * 0.85)
    place(pads, end, sig * np.exp(-np.arange(n) / SR * 0.35), pan=0.3 + 0.06 * k, gain=0.07)
for m in [72, 76, 79, 84]:
    nn = int(3.0 * SR)
    tt = np.arange(nn) / SR
    f = midi(m)
    place(keys, end, (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt)) * np.exp(-tt * 1.4), pan=0.5, gain=0.05)
bn = int(2.5 * SR)
tt = np.arange(bn) / SR
place(fx, end, np.sin(2 * np.pi * (38 + 25 * np.exp(-tt * 5)) * tt) * np.exp(-tt * 1.8), gain=0.30)


def write(name, buf):
    buf = buf[: int(SR * T["total"])]
    peak = np.max(np.abs(buf)) or 1
    data = (np.clip(buf / max(peak, 1.0), -1, 1) * 32767).astype(np.int16)
    w = wave.open(f"{OUT}/{name}.wav", "wb")
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(data.tobytes())
    w.close()


for name, buf in [("pads", pads), ("keys", keys), ("bass", bass), ("drums", drums), ("fx", fx)]:
    write(name, buf)
print("stems written")
