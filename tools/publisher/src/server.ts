import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getRemoteConfig } from 'firebase-admin/remote-config';
import { corsOriginAllowed, parsePayload, publish, validate, type RcApi } from './handlers';

const here = dirname(fileURLToPath(import.meta.url));
// Minimal .env loader (tools/publisher/.env, gitignored). Only sets GOOGLE_APPLICATION_CREDENTIALS.
const envFile = join(here, '..', '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && m[1] === 'GOOGLE_APPLICATION_CREDENTIALS' && !process.env[m[1]])
      process.env[m[1]] = m[2]!.replace(/^"|"$/g, '');
  }
}

const PORT = 8787;
const HOST = '127.0.0.1';
let api: RcApi | null = null;
let initError: string | null = null;
try {
  initializeApp({ credential: applicationDefault(), projectId: 'route-lab-f50dc' });
  api = getRemoteConfig() as unknown as RcApi;
} catch (e) {
  initError = e instanceof Error ? e.message : String(e);
}

function send(res: ServerResponse, status: number, body: unknown, origin?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (corsOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin!;
    headers['Vary'] = 'Origin';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 100_000) throw new Error('body too large');
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

createServer(async (req, res) => {
  const origin = req.headers.origin;
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {}, origin);
    if (req.url === '/health' && req.method === 'GET') {
      return send(
        res,
        200,
        {
          ok: api !== null,
          projectId: 'route-lab-f50dc',
          credentialsConfigured: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
          error: initError,
        },
        origin,
      );
    }
    if ((req.url === '/validate' || req.url === '/publish') && req.method === 'POST') {
      if (!api) return send(res, 503, { ok: false, error: initError ?? 'not initialised' }, origin);
      const p = parsePayload(await readJson(req));
      if (!p.ok) return send(res, 400, { ok: false, errors: p.errors }, origin);
      const out =
        req.url === '/validate' ? await validate(api, p.value) : await publish(api, p.value);
      return send(res, 200, out, origin);
    }
    send(res, 404, { ok: false, error: 'not found' }, origin);
  } catch (e) {
    send(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) }, origin);
  }
}).listen(PORT, HOST, () => console.log(`RouteLab publisher on http://${HOST}:${PORT}`));
