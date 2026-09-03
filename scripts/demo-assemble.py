"""Cut the recorded picture together with the narration.

`demo/timings.json` says when each beat actually began on camera, and
`demo/audio/<id>.wav` is that beat's line. Delaying each clip to its own beat is
the whole edit: no waveform lining-up by hand, and re-recording stays a one-command
operation because the timings come back out of the run that produced the video.

    python3 scripts/demo-assemble.py
"""
import json, pathlib, shutil, subprocess, sys

root = pathlib.Path(__file__).resolve().parent.parent
# `demo-splice.py` writes `spliced.mp4` when hand-captured footage has been
# dropped into the recording; it is the picture then, and `timings.json` was
# rewritten to match it. Without it the raw Playwright recording is the picture.
video = root / "demo/out/spliced.mp4"
if not video.exists():
    video = next(root.glob("demo/out/**/*.webm"), None)
if video is None:
    sys.exit("no recording found — run: npx playwright test -c playwright.demo.config.ts")

timings = json.loads((root / "demo/timings.json").read_text())
out = root / "demo/mandate-demo.mp4"

duration = float(subprocess.run(
    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)],
    capture_output=True, text=True, check=True).stdout.strip())

inputs, filters, labels = ["-i", str(video)], [], []
for i, beat in enumerate(timings):
    wav = root / f"demo/audio/{beat['id']}.wav"
    if not wav.exists():
        sys.exit(f"missing narration clip: {wav}")
    inputs += ["-i", str(wav)]
    ms = int(beat["at"] * 1000)
    filters.append(f"[{i + 1}:a]adelay={ms}|{ms}[a{i}]")
    labels.append(f"[a{i}]")

filters.append(
    "".join(labels) + f"amix=inputs={len(labels)}:normalize=0:dropout_transition=0[mix]"
)
# Broadcast-ish loudness so it is not quiet next to every other submission.
filters.append("[mix]loudnorm=I=-16:TP=-1.5:LRA=11[a]")
filters.append(f"[0:v]fade=t=in:st=0:d=0.6,fade=t=out:st={duration - 0.9:.2f}:d=0.8[v]")

cmd = [
    "ffmpeg", "-y", *inputs,
    "-filter_complex", ";".join(filters),
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart", str(out),
]
print(f"picture {duration:.1f}s · {len(timings)} narration clips")
subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

size = out.stat().st_size / 1e6
final = float(subprocess.run(
    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)],
    capture_output=True, text=True, check=True).stdout.strip())
mm, ss = divmod(final, 60)
print(f"wrote {out.relative_to(root)} — {int(mm)}:{ss:04.1f}, {size:.1f} MB")
if final > 180:
    sys.exit("OVER THREE MINUTES — the challenge rejects it")
