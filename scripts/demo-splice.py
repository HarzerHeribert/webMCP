"""Splice hand-captured footage into the recorded picture, before the cut.

`demo:record` films the Playwright beats and nothing else — it cannot drive
ChatGPT's desktop app, so the one shot proving a real agent calls these tools
has to be captured by a person and dropped in afterwards.

This inserts that clip at a named beat, writes `demo/out/spliced.mp4`, and
rewrites `demo/timings.json` so the beat it was inserted at is the clip's own
narration and everything after it shifts by the clip's length. `demo:cut` then
works exactly as it did before.

    python3 scripts/demo-splice.py <clip.mp4> <new-beat-id> <before-beat-id>
"""
import json, pathlib, subprocess, sys

root = pathlib.Path(__file__).resolve().parent.parent
if len(sys.argv) != 4:
    sys.exit(__doc__)
clip, beat_id, before = root / sys.argv[1], sys.argv[2], sys.argv[3]
if not clip.exists():
    sys.exit(f"no such clip: {clip}")

video = next(root.glob("demo/out/**/*.webm"), None)
if video is None:
    sys.exit("no recording found — run: npm run demo:record")

def dur(p):
    return float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
        capture_output=True, text=True, check=True).stdout.strip())

timings = json.loads((root / "demo/timings.json").read_text())
try:
    i = next(k for k, b in enumerate(timings) if b["id"] == before)
except StopIteration:
    sys.exit(f"no beat {before!r} in timings.json")
at = timings[i]["at"]

clip_len, tmp = dur(clip), root / "demo/out/_splice"
tmp.mkdir(exist_ok=True)

# Both halves are re-encoded to the clip's own parameters. The recording is
# 25fps VP8 and the clip is 30fps H.264; the concat demuxer needs one format,
# and `demo:cut` re-encodes to 30fps H.264 regardless.
enc = ["-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
       "-pix_fmt", "yuv420p", "-r", "30", "-vf", "scale=1920:1200,setsar=1", "-an"]
# Splicing before the first beat means there is no head: the clip opens the
# film. Half a second of the page loading in front of it would be worse than
# nothing, so that case cuts one part rather than two.
cuts = [("tail", ["-ss", f"{at:.3f}"])] if at < 1.0 else [
    ("head", ["-to", f"{at:.3f}"]), ("tail", ["-ss", f"{at:.3f}"])]
parts = []
for name, args in cuts:
    out = tmp / f"{name}.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(video), *args, *enc, str(out)], check=True)
    parts.append(out)

order = (clip, parts[0]) if at < 1.0 else (parts[0], clip, parts[1])
listing = tmp / "list.txt"
listing.write_text("".join(f"file '{p}'\n" for p in order))
spliced = root / "demo/out/spliced.mp4"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
                "-i", str(listing), "-c", "copy", str(spliced)], check=True)

# The clip takes the slot the beat after it used to start in; that beat and
# every later one move by the clip's length.
for b in timings[i:]:
    b["at"] = round(b["at"] + clip_len, 3)
timings.insert(i, {"id": beat_id, "at": at})
(root / "demo/timings.json").write_text(json.dumps(timings, indent=1) + "\n")

print(f"spliced {clip.name} ({clip_len:.1f}s) as {beat_id!r}, before {before!r} at {at:.1f}s")
print(f"picture {dur(video):.1f}s → {dur(spliced):.1f}s")
