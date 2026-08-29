import { useState } from 'react';
import { useWebMcp } from '../webmcp/provider.tsx';
import type { ToolResult } from '../webmcp/provider.tsx';

interface JsonSchemaProp {
  type?: string;
  enum?: unknown[];
  const?: unknown;
  description?: string;
}
interface JsonSchemaObject {
  properties?: Record<string, JsonSchemaProp>;
  required?: string[];
}

/**
 * A test harness, not an agent: this panel calls the exact tool
 * implementations `WebMcpProvider` would hand a real WebMCP-capable browser,
 * with a human picking the tool and typing every argument by hand. Nothing
 * here decides what to call — that is what lets the whole demo run in a
 * browser with the WebMCP flag off (`docs/05_WEBMCP_CONTRACT.md`).
 *
 * Inputs are seeded from the tool's live `inputSchema` but stay editable: the
 * schema communicates the delegated scope, it does not enforce it
 * (`docs/12_DECISIONS.md` D-005) — the server does that. Typing a customer id
 * the schema didn't suggest is exactly how to see an `OUT_OF_SCOPE` refusal.
 */
export function AgentConsole() {
  const webmcp = useWebMcp();
  const tools = webmcp.descriptors;
  const [selected, setSelected] = useState<string>('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ToolResult | null>(null);
  const [running, setRunning] = useState(false);

  const tool = tools.find((t) => t.name === selected) ?? null;
  const schema = (tool?.inputSchema ?? {}) as JsonSchemaObject;
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  function selectTool(name: string) {
    setSelected(name);
    setResult(null);
    const t = tools.find((x) => x.name === name);
    const p = ((t?.inputSchema ?? {}) as JsonSchemaObject).properties ?? {};
    const next: Record<string, string> = {};
    for (const [key, s] of Object.entries(p)) {
      if (s.const !== undefined) next[key] = String(s.const);
      else if (Array.isArray(s.enum) && s.enum.length === 1) next[key] = String(s.enum[0]);
    }
    setValues(next);
  }

  async function run() {
    if (!tool) return;
    setRunning(true);
    setResult(null);
    const input: Record<string, unknown> = {};
    for (const key of Object.keys(props)) {
      const raw = values[key];
      if (raw === undefined || raw === '') continue;
      input[key] = props[key].type === 'integer' ? Number(raw) : raw;
    }
    try {
      setResult(await webmcp.invoke(tool.name, input));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <span className="panel__title">Simulated caller</span>
        <span className="panel__count">{tools.length} callable</span>
      </div>
      <div className="panel__body webmcp-console">
        <div className="callout webmcp-console__banner">
          <div className="callout__body">
            <span className="callout__title">Test harness — no model, no agent.</span>
            Picks a currently registered tool and runs its real implementation directly. A
            human chooses every argument; nothing here decides anything on its own.
          </div>
        </div>

        {tools.length === 0 ? (
          <p className="empty">
            <span className="empty__lead">No tool is registered.</span>
            Delegate a mandate to make one callable.
          </p>
        ) : (
          <>
            <div className="webmcp-console__picker">
              {tools.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  className={`btn btn--sm ${selected === t.name ? '' : 'btn--quiet'}`}
                  onClick={() => selectTool(t.name)}
                >
                  {t.name}
                </button>
              ))}
            </div>

            {tool && (
              <form
                className="webmcp-console__form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run();
                }}
              >
                {Object.keys(props).length === 0 ? (
                  <p className="dim webmcp-console__hint">This tool takes no input.</p>
                ) : (
                  Object.entries(props).map(([key, s]) => {
                    const opts = Array.isArray(s.enum) ? s.enum.map(String) : [];
                    const listId = `${tool.name}-${key}-options`;
                    return (
                      <label key={key} className="webmcp-console__field">
                        <span className="webmcp-console__label">
                          {key}
                          {required.has(key) ? ' *' : ''}
                        </span>
                        <input
                          className="webmcp-console__input"
                          list={opts.length ? listId : undefined}
                          value={values[key] ?? ''}
                          onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                          placeholder={s.description ?? (opts.length ? opts.join(' | ') : key)}
                        />
                        {opts.length > 0 && (
                          <datalist id={listId}>
                            {opts.map((o) => (
                              <option key={o} value={o} />
                            ))}
                          </datalist>
                        )}
                      </label>
                    );
                  })
                )}
                <button className="btn btn--sm" type="submit" disabled={running}>
                  {running ? 'Running…' : `Run ${tool.name}`}
                </button>
              </form>
            )}

            {result && (
              <div
                className={`webmcp-console__result ${
                  result.ok ? 'webmcp-console__result--ok' : 'webmcp-console__result--error'
                }`}
              >
                <span className={`chip ${result.ok ? 'chip--ok' : 'chip--danger'}`}>
                  <span className="chip__dot" />
                  {result.ok ? 'ok' : result.error.code}
                </span>
                <pre className="mono">{JSON.stringify(result.ok ? result.data : result.error, null, 2)}</pre>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
