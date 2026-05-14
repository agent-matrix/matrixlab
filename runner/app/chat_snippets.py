from __future__ import annotations

CHATBOT_SNIPPET_HTML = r'''<!-- MatrixLab runnable code block: paste into any HTML-capable chatbot/webview -->
<div id="matrixlab-code-runner" style="font-family: Inter, system-ui, sans-serif; max-width: 920px; border: 1px solid #2f2f2f; border-radius: 18px; overflow: hidden; background: #1b1b1b; color: #f8fafc;">
  <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #303030;">
    <strong>⌘ Python</strong>
    <button id="matrixlab-run" style="border:1px solid #555;border-radius:999px;background:#222;color:white;padding:8px 16px;cursor:pointer">▷ Run</button>
  </div>
  <textarea id="matrixlab-code" spellcheck="false" style="box-sizing:border-box;width:100%;height:360px;padding:18px;background:#1b1b1b;color:#f8fafc;border:0;outline:0;font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical;">print("Hello from MatrixLab sandbox")</textarea>
  <pre id="matrixlab-console" style="margin:0;min-height:160px;padding:18px;background:#111;color:#bdbdbd;border-top:1px solid #303030;white-space:pre-wrap;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;">Console ready</pre>
</div>
<script>
(() => {
  const MATRIXLAB_URL = "http://localhost:8000";
  const TOKEN = ""; // optional MATRIXLAB_BEARER_TOKEN
  const code = document.getElementById("matrixlab-code");
  const button = document.getElementById("matrixlab-run");
  const consoleEl = document.getElementById("matrixlab-console");
  const log = (text) => { consoleEl.textContent += "\n" + text; };

  button.onclick = async () => {
    consoleEl.textContent = "Run started\nInitializing environment\nRunning code";
    button.disabled = true;
    try {
      const response = await fetch(`${MATRIXLAB_URL}/code/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
        },
        body: JSON.stringify({
          language: "python",
          code: code.value,
          timeout: 120,
          allow_network: false,
          packages: []
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || JSON.stringify(result));
      consoleEl.textContent = [
        ...(result.console || []),
        "",
        result.stdout ? `stdout:\n${result.stdout}` : "stdout: <empty>",
        result.stderr ? `stderr:\n${result.stderr}` : "stderr: <empty>",
        `exit_code=${result.exit_code} sandbox_id=${result.sandbox_id}`
      ].join("\n");
    } catch (error) {
      log(`Error: ${error.message}`);
    } finally {
      button.disabled = false;
    }
  };
})();
</script>'''

CHATBOT_SNIPPET_MARKDOWN = r'''```python
print("Hello from MatrixLab sandbox")
```

Run this code with MatrixLab:

```bash
curl -sS http://localhost:8000/code/run \
  -H 'Content-Type: application/json' \
  -d '{"language":"python","code":"print(\"Hello from MatrixLab sandbox\")","timeout":120}'
```
'''


def chatbot_snippets() -> dict:
    return {
        "html": CHATBOT_SNIPPET_HTML,
        "markdown": CHATBOT_SNIPPET_MARKDOWN,
        "api": {
            "endpoint": "POST /code/run",
            "request": {
                "language": "python",
                "code": "print('Hello from MatrixLab sandbox')",
                "timeout": 120,
                "allow_network": False,
                "packages": [],
            },
        },
    }
