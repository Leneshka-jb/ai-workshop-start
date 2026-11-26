// The web view: a page with a repository link input, and a JSON endpoint that scans it.
// Only GitHub repositories: the page must not read the server's own files.
import { createServer, type Server } from 'node:http';
import { AtlasError } from '../core/errors.ts';
import { filterSkills } from '../core/filter.ts';
import { openGitHub, parseGitHubUrl, type Fetch } from '../core/github.ts';
import { scan } from '../core/scan.ts';
import { PAGE } from './page.ts';

export type WebOptions = {
  fetch: Fetch;
  /** Optional authentication for a higher GitHub API rate limit. */
  token?: string;
  /** Host headers accepted besides localhost, 127.0.0.1 and [::1] on the server's port. */
  allowedHosts?: string[];
};

/**
 * `GET /`: the page. `GET /api/scan?repo=<GitHub URL>[&filter=<text>]`: the scan result as JSON,
 * the skills that match the filter and the total before filtering. Nothing is stored.
 * No request can stop the server: an unreadable URL is a 400, anything unexpected a 500.
 * Only requests addressed to this server are answered: any other Host header is a 421, so a
 * page that rebinds its own domain to this address cannot scan with the token.
 */
export function createWebServer(options: WebOptions): Server {
  return createServer((request, response) => {
    const send = (status: number, type: string, body: string) => {
      response.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
      response.end(body);
    };
    const json = (status: number, body: unknown) => send(status, 'application/json', JSON.stringify(body));

    if (!allowedHost(request.headers.host, request.socket.localPort, options.allowedHosts)) {
      return json(421, { error: 'Unknown host' });
    }
    handle(request.method, request.url, options, json, send).catch((error: unknown) => {
      const message = `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
      if (!response.headersSent) json(500, { error: message });
      else response.destroy();
    });
  });
}

/** The Host header names this server: a loopback name with its port, or an allowed host. */
function allowedHost(host: string | undefined, port: number | undefined, allowed: string[] = []): boolean {
  if (!host) return false;
  const name = host.toLowerCase();
  if (allowed.some((entry) => entry.toLowerCase() === name)) return true;
  return port !== undefined && ['localhost', '127.0.0.1', '[::1]'].some((loopback) => name === `${loopback}:${port}`);
}

type Json = (status: number, body: unknown) => void;
type Send = (status: number, type: string, body: string) => void;

async function handle(method: string | undefined, target: string | undefined, options: WebOptions, json: Json, send: Send) {
  let url: URL;
  try {
    url = new URL(target ?? '/', 'http://localhost');
  } catch {
    return json(400, { error: 'Bad request URL' });
  }

  if (method !== 'GET') return json(405, { error: 'Method not allowed' });
  if (url.pathname === '/') return send(200, 'text/html', PAGE);
  if (url.pathname !== '/api/scan') return json(404, { error: 'Not found' });

  const repo = url.searchParams.get('repo')?.trim() ?? '';
  if (!parseGitHubUrl(repo)) return json(400, { error: `Not a GitHub repository URL: ${repo}` });
  try {
    const { repository, skills, warnings } = await scan(await openGitHub(repo, options));
    json(200, { repository, skills: filterSkills(skills, url.searchParams.get('filter') ?? ''), total: skills.length, warnings });
  } catch (error) {
    if (!(error instanceof AtlasError)) throw error;
    json(502, { error: error.message });
  }
}
