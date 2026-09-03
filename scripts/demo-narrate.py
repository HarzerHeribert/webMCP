"""Synthesise the demo narration locally, one wav per beat, and record how long
each one is.

The durations are the point: `demo/record.spec.ts` reads them and holds each
beat on screen for at least as long as its line takes to say, so the picture and
the voice stay in step without anyone editing to a waveform. Nothing here calls
a network service — Kokoro runs on the CPU from a local model file.

    .venv-tts/bin/python scripts/demo-narrate.py
"""
import numpy as np
import json, pathlib, sys
from kokoro_onnx import Kokoro
import soundfile as sf

root = pathlib.Path(__file__).resolve().parent.parent
spec = json.loads((root / "demo/narration.json").read_text())
out = root / "demo/audio"
out.mkdir(parents=True, exist_ok=True)

kokoro = Kokoro(str(root / ".tts-models/kokoro-v1.0.onnx"), str(root / ".tts-models/voices-v1.0.bin"))

durations, total = {}, 0.0
for beat in spec["beats"]:
    samples, rate = kokoro.create(beat["say"], voice=spec["voice"], speed=spec["speed"], lang="en-us")
    # Kokoro pads every utterance with silence at both ends. Left in, that pad
    # is heard between beats as a hesitation — the narration stops and starts
    # rather than running on, so it is trimmed back to the speech itself.
    #
    # Fricatives are quiet. The "f" of "fine-grained" sits well under a gate set
    # for vowels, so a 0.004 threshold trimmed the consonant off the front of the
    # very first word in the film. This one is low enough to hear them.
    loud = np.flatnonzero(np.abs(samples) > 0.0012)
    if loud.size:
        pad = int(rate * 0.06)
        samples = samples[max(0, loud[0] - pad):min(len(samples), loud[-1] + pad)]

    # Then a lead of real silence at each end, with the anti-click ramp living
    # entirely inside it. The speech is never faded, so every clip opens at full
    # volume on its first consonant, and still starts from a zero sample.
    lead = np.zeros(int(rate * 0.05), dtype="float32")
    samples = np.concatenate([lead, samples.astype("float32"), lead])
    ramp = int(rate * 0.08)
    samples[:ramp] *= np.linspace(0.0, 1.0, ramp, dtype="float32")
    samples[-ramp:] *= np.linspace(1.0, 0.0, ramp, dtype="float32")

    path = out / f"{beat['id']}.wav"
    sf.write(path, samples, rate)
    seconds = len(samples) / rate
    durations[beat["id"]] = round(seconds, 3)
    total += seconds
    print(f"  {beat['id']:<10} {seconds:5.2f}s")

(root / "demo/durations.json").write_text(json.dumps(durations, indent=2) + "\n")
print(f"\nspeech total {total:.1f}s ({total/60:.2f} min) across {len(durations)} beats")
if total > 165:
    print("WARNING: speech alone is over 2:45; the cut will not fit three minutes", file=sys.stderr)
