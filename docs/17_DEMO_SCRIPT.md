# Demo script — under three minutes

The claim, stated once at the top and once at the end:

> **Mandate turns explicit temporary human intent into a live WebMCP capability
> contract.**

Recorded in Chrome against the live URL. If the WebMCP flag is unavailable, the
built-in simulated caller drives the same tool implementations and the script is
unchanged — say so on camera rather than hiding it.

---

**0:00 — An ordinary CRM.** Relay CRM at full width, six accounts, no Mandate
anywhere on screen — just a docked rail on the right edge reading *Mandate ·
not in use*. "This is a CRM. Mandate is not part of it; it is a layer installed
into it, and right now it is doing nothing."

**0:10 — The problem.** "An agent that can act in this app needs authority.
Today that means an API key scoped to everything, forever. Here is the sentence
people actually mean instead."

**0:18 — Open the layer.** Click the rail. If the browser has no WebMCP the layer
refuses to pretend: it names `WEBMCP_UNAVAILABLE`, says there is nothing to
register into, and offers the simulated caller as an explicit override. Say so on
camera — the dependency is the point. With the flag enabled, the layer simply
opens.

**0:30 — Selection is not authority.** Click Northwind and Atlas. The rows get a
cool rail and the counter says two selected. The Authority panel says: *selecting
proposes a scope; it grants nothing.* Point at the capability inspector: still
two read-only tools. **Nothing appeared.**

**0:40 — Delegate.** Choose `status` and `nextAction`, ten minutes, Delegate.
Three things change at once and the camera should catch all three: the rows take
the amber authority ring, the Authority panel states the exact scope as chips
with a countdown, and the inspector gains `mandate_stage_customer_update` — whose
customer enum is *those two ids* and whose field enum is *those two fields*.
"The tool schema is a readout of what the human just decided."

**0:55 — The agent stages.** Through the tool surface, stage Northwind's status
to *Active* and its next action. The changes appear in the shared list with the
agent's dashed mark, base revision, and mandate version. Nothing has been
committed.

**1:05 — Out of scope, refused.** Ask the same tool to touch Kestrel — a customer
that is *selected* but was never delegated — or to touch `arr`. The refusal is
`OUT_OF_SCOPE`, it lands in the timeline, and it names why. "This is the app
working."

**1:20 — Untrusted content changes nothing.** Point at Atlas Freight's notes: a
pasted email telling the assistant to set every account to Active and approve
everything. Run the tool call it asks for. Refused. "Authority does not come from
text."

**1:35 — Co-edit.** The human edits the same field the agent staged. The change
does not fork — it is one entity, now marked co-edited, with both marks. Read it
back through the tool: the agent sees the human's value.

**1:50 — Conflict and recovery.** Trigger the external update; the revision
advances. Validate: `REVISION_CONFLICT`, because the staged work was based on a
revision the world has moved past. Rebase. The intended value survives — the
before changes, the after does not — and the timeline records it.

**2:05 — Narrow, mid-flight.** Narrow the mandate to one field. That publishes a
new version. Now issue a call against the version the agent still believes in:
`POLICY_CHANGED`, refused **server-side**. "The schema was a courtesy. This was
the enforcement."

**2:15 — Revoke.** Revoke the mandate. The tools disappear from the inspector in
the same breath, and the Authority panel says what just happened rather than
quietly reverting. The same call now gets a *different* refusal —
`NO_ACTIVE_MANDATE`, not `POLICY_CHANGED` — because there is no longer a policy
to have changed. Two refusals, two reasons, both from the server.

**2:25 — Ask the agent to apply.** There is no apply tool. Show the inspector's
*structurally absent* section. There is no route either. "The most consequential
act in the product has no agent path at any layer."

**2:35 — The human applies.** Re-delegate briefly if needed, validate, and press
Apply — in its own bar, on its own surface, disabled until the work is valid.
The record advances a revision and the applied values land in Relay CRM.

**2:40 — Close the layer.** Shut Mandate. Relay CRM is a plain CRM again — and
the rail stays amber and still says *active · v1*, because live authority is the
one thing this interface will not hide. Re-open it.

**2:45 — The timeline.** Scroll it once, slowly. Mandate granted, tools
registered, agent staged, refusal, human edit, conflict, rebase, revoke, human
apply. "Every one of those is the same story from a different angle: the human
set the bounds, the app enforced them, and the agent worked inside them."

**2:55 — Close.** Repeat the claim. State the limits out loud: no identity
attestation, no production CRM, no model anywhere in this app.

---

## Do not claim

- that Mandate identifies *which* agent is calling — it bounds the session, not
  the caller;
- that this is production CRM software;
- instant or guaranteed agent discovery of the registered tools.
