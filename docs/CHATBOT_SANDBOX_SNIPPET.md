# MatrixLab chatbot sandbox API and copy/paste snippets

MatrixLab exposes a small code-cell API for chatbots, docs pages, and agent UIs that want a **Run** button like a code interpreter panel.

## API

```http
POST /code/run
Content-Type: application/json
```

Request:

```json
{
  "language": "python",
  "code": "print('Hello from MatrixLab sandbox')",
  "timeout": 120,
  "allow_network": false,
  "packages": []
}
```

Response:

```json
{
  "sandbox_id": "...",
  "language": "python",
  "exit_code": 0,
  "stdout": "Hello from MatrixLab sandbox\n",
  "stderr": "",
  "duration_ms": 1234,
  "timed_out": false,
  "truncated": false,
  "console": ["Run started", "Initializing environment", "No packages requested", "Running code", "Run completed in 1234ms"],
  "artifacts": []
}
```

`POST /chat/run` is an alias for chat UI integrations. `GET /snippets/chatbot` returns these snippets from the Runner.

## Copy/paste browser snippet

Paste this into any HTML-capable chatbot, markdown preview, internal docs page, or webview. Change `MATRIXLAB_URL` if your Runner is not local.

```html
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
  const TOKEN = "";
  const code = document.getElementById("matrixlab-code");
  const button = document.getElementById("matrixlab-run");
  const consoleEl = document.getElementById("matrixlab-console");

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
      consoleEl.textContent += `\nError: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  };
})();
</script>
```

## Python scrape example with network and packages

```bash
curl -sS http://localhost:8000/code/run \
  -H 'Content-Type: application/json' \
  -d @- <<'JSON'
{
  "language": "python",
  "allow_network": true,
  "packages": ["requests", "beautifulsoup4"],
  "code": "import requests\nfrom bs4 import BeautifulSoup\nhtml = requests.get('https://example.com', timeout=30).text\nsoup = BeautifulSoup(html, 'html.parser')\nprint(soup.title.get_text(strip=True))"
}
JSON
```

Security note: keep `allow_network` off unless the code truly needs egress, and use bearer auth (`MATRIXLAB_BEARER_TOKEN`) for shared runners. For production architecture, quotas, resource limits, learning-assessment patterns, and AI code-generation verification loops, see [`AI_ENGINEER_SANDBOX_INTEGRATION.md`](AI_ENGINEER_SANDBOX_INTEGRATION.md).
