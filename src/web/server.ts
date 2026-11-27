// The web view: a page with a repository link input, and a JSON endpoint that scans it.
// Only GitHub repositories: the page must not read the server's own files, save the one fixed file of saved skills.
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { clusterSkills, parseSavedSkills } from '../core/cluster.ts';
import { AtlasError } from '../core/errors.ts';
import { filterSkills } from '../core/filter.ts';
import { openGitHub, openOrganization, parseGitHubOwnerUrl, parseGitHubUrl, type Fetch } from '../core/github.ts';
import { scanOrganization } from '../core/organization.ts';
import { scan } from '../core/scan.ts';
import { PAGE } from './page.ts';

export type WebOptions = {
  fetch: Fetch;
  /** Optional authentication for a higher GitHub API rate limit. */
  token?: string;
  /** Host headers accepted besides localhost, 127.0.0.1 and [::1] on the server's port. */
  allowedHosts?: string[];
  /** The saved skills that /api/clusters groups; data/jetbrainsSkills.txt by default. */
  savedSkills?: string;
};

/** Where the saved skills are, as the API names it; never a path from the request. */
const SAVED_SKILLS = 'data/jetbrainsSkills.txt';
const SAVED_SKILLS_FILE = fileURLToPath(new URL(`../../${SAVED_SKILLS}`, import.meta.url));

/**
 * `GET /`: the page. `GET /api/scan?repo=<GitHub URL>[&filter=<text>]`: the scan result as JSON,
 * the skills that match the filter and the total before filtering.
 * `GET /api/organization?org=<GitHub URL>`: its repositories and their skill counts. Nothing is stored.
 * `GET /api/clusters`: the skills saved in data/jetbrainsSkills.txt, clustered by the words they share.
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
  if (url.pathname === '/api/scan') {
    const repo = url.searchParams.get('repo')?.trim() ?? '';
    if (!parseGitHubUrl(repo)) return json(400, { error: `Not a GitHub repository URL: ${repo}` });
    return answer(json, async () => {
      const { repository, skills, warnings } = await scan(await openGitHub(repo, options));
      return { repository, skills: filterSkills(skills, url.searchParams.get('filter') ?? ''), total: skills.length, warnings };
    });
  }
  if (url.pathname === '/api/organization') {
    const org = url.searchParams.get('org')?.trim() ?? '';
    if (!parseGitHubOwnerUrl(org)) return json(400, { error: `Not a GitHub organization URL: ${org}` });
    return answer(json, async () => scanOrganization(await openOrganization(org, options)));
  }
  if (url.pathname === '/api/clusters') {
    let text: string;
    try {
      text = await readFile(options.savedSkills ?? SAVED_SKILLS_FILE, 'utf8');
    } catch (error) {
      const reason = (error as NodeJS.ErrnoException).code ?? (error instanceof Error ? error.message : String(error));
      return json(500, { error: `Cannot read ${SAVED_SKILLS}: ${reason}` });
    }
    const skills = parseSavedSkills(text);
    return json(200, { source: SAVED_SKILLS, total: skills.length, ...clusterSkills(skills) });
  }
  return json(404, { error: 'Not found' });
}

/** The result as JSON; an explained failure is a 502 with its message, anything else goes up as a 500. */
async function answer(json: Json, work: () => Promise<unknown>) {
  try {
    json(200, await work());
  } catch (error) {
    if (!(error instanceof AtlasError)) throw error;
    json(502, { error: error.message });
  }
}
