"""Write an SRT from the narration, rather than letting YouTube guess.

Auto-captioning mangles exactly the words this film cannot afford to lose —
WebMCP, executeTool, mandate, OUT_OF_SCOPE. The timings are already known
exactly: `demo/timings.json` says when each beat starts and
`demo/durations.json` how long its line takes, so the only estimation here is
where to break one beat into readable cues, which is done on sentence
boundaries and weighted by character count.

    python3 scripts/demo-subtitles.py     # → demo/mandate-demo.srt
"""
import json, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
spec = json.loads((root / "demo/narration.json").read_text())
timings = {b["id"]: b["at"] for b in json.loads((root / "demo/timings.json").read_text())}
durations = json.loads((root / "demo/durations.json").read_text())

MAX = 84  # two comfortable lines of subtitle


def cues(text: str):
    """Sentence-ish chunks, then split anything still too long at a clause."""
    out: list[str] = []
    for part in re.split(r"(?<=[.:?])\s+", text.strip()):
        while len(part) > MAX:
            cut = part.rfind(" ", 0, MAX)
            for mark in (" — ", ", "):
                at = part.rfind(mark, 0, MAX)
                if at > MAX // 2:
                    cut = at + (len(mark) if mark == ", " else 1)
                    break
            out.append(part[:cut].strip())
            part = part[cut:].strip()
        if part:
            out.append(part)
    return out


def stamp(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


lines, n = [], 0
for beat in spec["beats"]:
    bid = beat["id"]
    if bid not in timings:
        sys.exit(f"{bid} is not in timings.json — run demo:record first")
    start, spoken = timings[bid], durations[bid]
    chunks = cues(beat["say"])
    # Speech is close enough to constant-rate that character count is a better
    # split than an equal one, and costs nothing.
    total = sum(len(c) for c in chunks)
    at = start
    for c in chunks:
        span = spoken * len(c) / total
        n += 1
        lines += [str(n), f"{stamp(at)} --> {stamp(at + span)}", c, ""]
        at += span

out = root / "demo/mandate-demo.srt"
out.write_text("\n".join(lines))
print(f"wrote {out.relative_to(root)} — {n} cues across {len(spec['beats'])} beats")
