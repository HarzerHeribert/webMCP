# The demo video, and how to make another one

`demo/mandate-demo.mp4` — **2:55**, 1600×1000, H.264 + AAC, ~12 MB. Under the
challenge's three-minute limit with 4 seconds to spare — anything added from
here needs something else trimmed, and the assembler exits non-zero rather than
write a file over three minutes.

It opens on the problem rather than on the software: two cards from
`demo/cards.html`, in the product's own tokens, driven by the same beat clock.
A third card once showed the compiled schema; it was cut because the software
shows the real one twenty seconds later, and telling before showing is what a
three-minute budget cannot afford.
It closes on a *second* host application — the same layer installed into a
deployment console, where the compiled tool has renamed itself — in the product
form, which is the shortest way to say that none of this was ever about CRMs.

Between that and the last beat sits 19 seconds of **ChatGPT's desktop app**
driving the deployed site through site tools: a change staged inside the
mandate, two refusals with different reasons, and the model answering that it
cannot commit because no apply tool is registered — then a human pressing the
button. The spinners are jump-cut; nothing else is. `docs/17_DEMO_SCRIPT.md`
records the one priming prompt that shot opens with, and what it therefore does
*not* prove.

Nothing in it is staged footage. Every agent action is a real
`document.modelContext.executeTool` call against the tools the page registered,
in Google Chrome launched with `--enable-features=WebMCP`. `localhost` is a
secure origin, so the API is present there exactly as it is on the deployed
site, and the run is the flagged path rather than the simulated caller. The
recorder asserts that before it films anything:

```ts
expect(live, 'flagged Chrome must expose document.modelContext').toBe('object');
```

## Four commands

```sh
npm run demo:voice    # narration → demo/audio/*.wav + demo/durations.json
npm run demo:record   # picture   → demo/out/**/video.webm + demo/timings.json
python3 scripts/demo-splice.py demo/captures/chatgpt-segment.mp4 chatgpt close
npm run demo:cut      # both      → demo/mandate-demo.mp4
```

The third is optional and only exists because of what it splices. Playwright
cannot drive ChatGPT's desktop app, so the one shot proving a *real* agent calls
these tools had to be captured by a person. `demo-splice.py` inserts that clip
before a named beat, writes `demo/out/spliced.mp4`, and rewrites
`demo/timings.json` so the clip owns its own narration and every later beat
shifts by its length. `demo:cut` prefers `spliced.mp4` when it exists and is
otherwise unchanged.

Re-running the splice on already-spliced timings would shift them twice. After
any `demo:record`, `timings.json` is clean and the splice runs once.

`demo/narration.json` is the single source for what is said and what the
lower-third caption reads at each beat. Change a line there, re-run all three,
and the cut re-times itself.

## Why it stays in sync without anyone editing to a waveform

The two halves are made in the wrong order on purpose. `demo:voice` synthesises
each line **first** and writes down how long it turned out to be. `demo:record`
reads those durations and holds each beat on screen for at least that long,
then writes down when each beat actually started. `demo:cut` delays each
narration clip to its own beat's start.

So the pacing is derived from the speech, and the edit is derived from the
recording. Nobody lines anything up by hand, and re-recording after a UI change
is one command rather than an afternoon.

## What is local, and what the repo does not carry

The voice is **Kokoro**, an 82M-parameter model running on the CPU from a local
file — no network call, no API key, consistent with D-003's "no model calls in
this project" (that decision governs the *product*; this is build tooling, and
it never runs in the app).

```sh
python3 -m venv .venv-tts && .venv-tts/bin/pip install kokoro-onnx soundfile
mkdir -p .tts-models && cd .tts-models && curl -LO \
  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx && curl -LO \
  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

`.venv-tts/`, `.tts-models/`, `demo/out/`, `demo/captures/` and `demo/*.mp4` are
git-ignored: the tooling is tracked, the 350 MB of model weights, the screen
captures and the render are not.

## The two pieces of overlay chrome

`demo/overlay.ts` injects a pointer and a lower third, both styled as video
furniture rather than as part of the product, and neither present in `src/`.
They exist because a Playwright run is missing exactly two things a viewer
needs: Playwright drives the DOM directly, so controls change with no visible
cause, and a WebMCP call through `document.modelContext` is invisible by
construction — its only trace is its effect. The pointer says where; the caption
says which call.

## Before publishing

Watch it with sound. The narration is synthetic, and a synthetic voice
mispronouncing a term is the kind of thing only a listener catches. Swapping in
a human read means replacing `demo/audio/*.wav` and re-running `demo:cut` —
the timings still apply as long as the clips stay roughly the same length.
