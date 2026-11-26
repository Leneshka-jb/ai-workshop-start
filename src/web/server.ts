// The web view: a page with a repository link input, and a JSON endpoint that scans it.
// Only GitHub repositories: the page must not read the server's own files.
import { createServer, type Server } from 'node:http';
import { AtlasError } from '../core/errors.ts';
import { openGitHub, parseGitHubUrl, type Fetch } from '../core/github.ts';
import { scan } from '../core/scan.ts';
import { PAGE } from './page.ts';

export type WebOptions = {
  fetch: Fetch;
  /** Optional authentication for a higher GitHub API rate limit. */
  token?: string;
};

/** `GET /`: the page. `GET /api/scan?repo=<GitHub URL>`: the scan result as JSON. Nothing is stored. */
export function createWebServer(options: WebOptions): Server {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const send = (status: number, type: string, body: string) => {
      response.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
      response.end(body);
    };
    const json = (status: number, body: unknown) => send(status, 'application/json', JSON.stringify(body));

    if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
    if (url.pathname === '/') return send(200, 'text/html', PAGE);
    if (url.pathname !== '/api/scan') return json(404, { error: 'Not found' });

    const repo = url.searchParams.get('repo')?.trim() ?? '';
    if (!parseGitHubUrl(repo)) return json(400, { error: `Not a GitHub repository URL: ${repo}` });
    try {
      json(200, await scan(await openGitHub(repo, options)));
    } catch (error) {
      if (error instanceof AtlasError) json(502, { error: error.message });
      else json(500, { error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` });
    }
  });
}
