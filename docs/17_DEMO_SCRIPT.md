# Demo script

**The script is now `demo/narration.json`.** It holds every line of narration
and every lower-third caption, it is what `scripts/demo-narrate.py` speaks and
what `demo/record.spec.ts` paces against, and `docs/21_DEMO_VIDEO.md` explains
the pipeline. This file used to hold a hand-written running order; keeping two
scripts meant keeping one of them wrong, and the one that is executed wins.

What stays here is the part no generator enforces.

The claim, stated once at the top and once at the end:

> **Mandate turns explicit temporary human intent into a live WebMCP capability
> contract.**

Recorded in Chrome with `--enable-features=WebMCP`, so every agent action on
camera is a real `document.modelContext.executeTool` call. The recorder refuses
to film otherwise.

## Do not claim

- that Mandate identifies *which* agent is calling — it bounds the session, not
  the caller;
- that "apply is a human action" is enforced. The tool surface genuinely has no
  apply, but a browser-driving agent can press the button like anybody else
  (`docs/18_LIMITATIONS.md`). The mandate is the boundary;
- that a revoked mandate removes tools from the browser's registry. It cannot;
  the compiled surface empties and the server refuses the call
  (`docs/20_WEBMCP_FIELD_NOTES.md` §6);
- that this is production software, in either host;
- instant or guaranteed agent discovery of the registered tools;
- **that the agent could not have gone around the tools.** The ChatGPT capture
  opens with one priming prompt asking it to use the page's tools, not to work
  around a refusal, and to quote refusals verbatim. That is ordinary prompting
  and it fakes nothing — every call in the shot is a real `executeTool` call and
  every refusal comes from the server. But it is *cooperation obtained by
  asking*, not behaviour the page enforced, and the film must not imply
  otherwise. What happens without that prompt is in `docs/18_LIMITATIONS.md`:
  the agent goes looking for the human's buttons and says so.

## What the recording must show, whatever the running order

1. Selection that grants nothing, next to delegation that grants something.
2. A tool schema that is a readout of the human's decision — the enums.
3. Two refusals with *different* reasons, both from the server.
4. Untrusted content asking for an action, and not getting it.
5. That there is no apply tool and no route behind one.
6. The product form, so the instrument is not mistaken for the product.
7. A second host application, so the mechanism is not mistaken for a CRM
   feature.
