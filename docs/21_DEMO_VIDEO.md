# The demo video, and how to make another one

`demo/mandate-demo.mp4` — **2:46**, 1600×1000, H.264 + AAC, ~12 MB. Under the
challenge's three-minute limit with 14 seconds to spare.

It opens on the problem rather than on the software: three cards from
`demo/cards.html`, in the product's own tokens, driven by the same beat clock.
It closes by flipping the header's audience switch to **User** — the instrument
puts itself away and what is left is the shipping shape.

Nothing in it is staged footage. Every agent action is a real
`document.modelContext.executeTool` call against the tools the page registered,
in Google Chrome launched with `--enable-features=WebMCP`. `localhost` is a
secure origin, so the API is present there exactly as it is on the deployed
site, and the run is the flagged path rather than the simulated caller. The
recorder asserts that before it films anything:

```ts
expect(live, 'flagged Chrome must expose document.modelContext').toBe('object');
```

## Three commands

```sh
npm run demo:voice    # narration → demo/audio/*.wav + demo/durations.json
npm run demo:record   # picture   → demo/out/**/video.webm + demo/timings.json
npm run demo:cut      # both      → demo/mandate-demo.mp4
```

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

`.venv-tts/`, `.tts-models/`, `demo/out/` and `demo/*.mp4` are git-ignored: the
tooling is tracked, the 350 MB of model weights and the render are not.

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
