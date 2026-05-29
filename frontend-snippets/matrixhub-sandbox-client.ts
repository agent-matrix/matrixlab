export type SandboxSession = {
  session_id: string;
  status: string;
  expires_at: number;
  stream_url: string;
};

export type SandboxEvent = {
  session_id: string;
  step: string;
  status: 'start' | 'ok' | 'error';
  message: string;
  data?: Record<string, unknown>;
};

export async function createSandboxSession(apiBase: string, token: string, catalogId: string): Promise<SandboxSession> {
  const res = await fetch(`${apiBase}/v1/sandbox/sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ catalog_id: catalogId, ttl_seconds: 600 }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function subscribeSandboxEvents(apiBase: string, session: SandboxSession, onEvent: (ev: SandboxEvent) => void): EventSource {
  // EventSource cannot set Authorization headers. In production, prefer an HTTP-only
  // same-site cookie, or create a short-lived signed stream URL from the backend.
  const es = new EventSource(`${apiBase}${session.stream_url}`);
  es.onmessage = (msg) => onEvent(JSON.parse(msg.data));
  es.addEventListener('done', () => es.close());
  es.onerror = () => es.close();
  return es;
}

export async function listSandboxTools(apiBase: string, token: string, sessionId: string) {
  const res = await fetch(`${apiBase}/v1/sandbox/sessions/${sessionId}/tools`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function callSandboxTool(apiBase: string, token: string, sessionId: string, name: string, args: Record<string, unknown>) {
  const res = await fetch(`${apiBase}/v1/sandbox/sessions/${sessionId}/tools/call`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, arguments: args }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteSandboxSession(apiBase: string, token: string, sessionId: string) {
  const res = await fetch(`${apiBase}/v1/sandbox/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
