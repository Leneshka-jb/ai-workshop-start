import { AtlasError, GitHubUnavailableError } from './errors.ts';
import { SKIPPED_DIRECTORIES } from './find.ts';
import type { Source } from './scan.ts';

/** The part of `fetch` the core uses, so tests and the browser can pass their own. */
export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export type GitHubOptions = {
  fetch: Fetch;
  /** Optional authentication for a higher GitHub API rate limit. */
  token?: string;
};

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

/** `https://github.com/owner/repo`, with or without the scheme, a trailing slash or `.git`. */
export function parseGitHubUrl(input: string): { owner: string; repo: string } | undefined {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(input.trim());
  return match ? { owner: match[1], repo: match[2] } : undefined;
}

/** `https://github.com/owner`, with or without the scheme or a trailing slash: an organization or a user. */
export function parseGitHubOwnerUrl(input: string): { owner: string } | undefined {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/?$/i.exec(input.trim());
  return match ? { owner: match[1] } : undefined;
}

/** What GitHub says about a repository, in its own answer and in an organization's listing. */
export type RepositoryInfo = { full_name: string; default_branch: string };

/** Resolves the default branch to a commit and lists the files that may be skills. */
export async function openGitHub(input: string, options: GitHubOptions): Promise<Source> {
  const name = parseGitHubUrl(input);
  if (!name) throw new AtlasError(`Not a GitHub repository URL: ${input}`);
  const github = client(options);
  const info = await github.json<RepositoryInfo>(
    `${API}/repos/${name.owner}/${name.repo}`,
    `Repository not found: https://github.com/${name.owner}/${name.repo}`,
  );
  return pinned(github, info);
}

/** An organization (or a user) and every repository it owns, each ready to be opened as a Source. */
export type Organization = {
  /** The login as GitHub spells it. */
  id: string;
  url: string;
  repositories: RepositoryInfo[];
  open(repository: RepositoryInfo): Promise<Source>;
};

const PAGE_SIZE = 100;

/** Lists every repository of the organization or user, page by page until a short page. */
export async function openOrganization(input: string, options: GitHubOptions): Promise<Organization> {
  const name = parseGitHubOwnerUrl(input);
  if (!name) throw new AtlasError(`Not a GitHub organization URL: ${input}`);
  const github = client(options);
  const account = await github.json<{ login: string; type: string }>(
    `${API}/users/${name.owner}`,
    `Organization not found: https://github.com/${name.owner}`,
  );
  const login = account.login;
  const list = account.type === 'Organization'
    ? `${API}/orgs/${login}/repos?type=all&per_page=${PAGE_SIZE}`
    : `${API}/users/${login}/repos?type=owner&per_page=${PAGE_SIZE}`;
  const repositories: RepositoryInfo[] = [];
  for (let page = 1; ; page++) {
    const batch = await github.json<RepositoryInfo[]>(`${list}&page=${page}`);
    repositories.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return {
    id: login,
    url: `https://github.com/${login}`,
    repositories,
    // A client per repository, so its listings are released after its scan; the token only if
    // the organization did not refuse it for SAML SSO.
    open: (info) => pinned(client({ fetch: options.fetch, token: github.token() }), info),
  };
}

async function pinned(github: Client, info: RepositoryInfo): Promise<Source> {
  const id = info.full_name;
  const { sha } = await github.json<{ sha: string }>(`${API}/repos/${id}/commits/${encodePath(info.default_branch)}`);
  const paths = await treePaths(github, id, sha);
  const [organization, repo] = id.split('/');
  return {
    repository: { id, organization, name: repo, url: `https://github.com/${id}`, commit: sha },
    paths,
    warnings: [],
    read: (path) => github.raw(`${RAW}/${id}/${sha}/${encodePath(path)}`),
  };
}

type Tree = { truncated: boolean; tree: { path: string; mode: string; type: string; sha: string }[] };

/** List the pinned tree, splitting oversized trees until every directory is covered. */
async function treePaths(github: Client, id: string, sha: string): Promise<string[]> {
  const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}?recursive=1`);
  if (!tree.truncated) return files(tree);
  // A truncated recursive answer may omit entire subtrees; start again with all immediate entries.
  const shallow = await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}`);
  if (shallow.truncated) throw new AtlasError(`GitHub returned an incomplete directory listing for ${id} at ${sha}`);
  const subtrees = await Promise.all(shallow.tree
    .filter((entry) => entry.type === 'tree' && !SKIPPED_DIRECTORIES.has(entry.path))
    .map(async (entry) => (await treePaths(github, id, entry.sha)).map((path) => `${entry.path}/${path}`)));
  return files(shallow).concat(subtrees.flat());
}

/** Regular files only: a symbolic link's content is its target, not a SKILL.md. */
function files(tree: Tree): string[] {
  return tree.tree.filter((item) => item.type === 'blob' && item.mode !== '120000').map((item) => item.path);
}

type Client = ReturnType<typeof client>;

function client({ fetch, token }: GitHubOptions) {
  const accept = { Accept: 'application/vnd.github+json' };
  // Cleared when an organization refuses the token for SAML SSO: its public repositories
  // still answer without one, so the rest of the scan goes on anonymously.
  let authorization = token ? `Bearer ${token}` : undefined;
  const answers = new Map<string, Promise<unknown>>(); // identical subtrees can occur at multiple paths

  async function get(url: string, init?: { headers: Record<string, string> }): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      throw new GitHubUnavailableError(`Cannot reach GitHub: ${describe(error)}`);
    }
  }

  async function failure(response: Response): Promise<{ status: number; text: string }> {
    const body: unknown = await response.json().catch(() => undefined);
    const message = (body as { message?: unknown } | undefined)?.message;
    return { status: response.status, text: typeof message === 'string' ? message : '' };
  }

  async function request(url: string, notFound: string): Promise<unknown> {
    const sent = authorization;
    let response = await get(url, { headers: sent ? { ...accept, Authorization: sent } : accept });
    if (response.ok) return response.json();
    let { status, text } = await failure(response);
    if (sent && status === 403 && /SAML/i.test(text)) {
      authorization = undefined;
      response = await get(url, { headers: accept });
      if (response.ok) return response.json();
      ({ status, text } = await failure(response));
      if (status === 404) {
        throw new AtlasError(`${notFound}; if it is private, authorize GITHUB_TOKEN for the organization's SAML SSO`);
      }
    }
    if (status === 404) throw new AtlasError(notFound);
    if ((status === 403 || status === 429) && /rate limit/i.test(text)) {
      const advice = authorization ? 'try again in a minute'
        : token ? "authorize GITHUB_TOKEN for the organization's SAML SSO" : 'set GITHUB_TOKEN';
      throw new GitHubUnavailableError(`GitHub rate limit reached; ${advice}`);
    }
    if (status === 401) throw new GitHubUnavailableError('GitHub rejected the token in GITHUB_TOKEN');
    throw new AtlasError(`GitHub answered ${status} for ${url}${text && `: ${text}`}`);
  }

  return {
    /** The token, unless an organization refused it for SAML SSO. */
    token: () => (authorization ? token : undefined),
    /** A GitHub API answer; `notFound` explains a 404. */
    json<T>(url: string, notFound = `Not found on GitHub: ${url}`): Promise<T> {
      if (!answers.has(url)) answers.set(url, request(url, notFound));
      return answers.get(url) as Promise<T>;
    },
    /** A file's bytes at the scanned commit, or undefined if it is not there. */
    async raw(url: string): Promise<Uint8Array | undefined> {
      // A private repository's files are only readable with the token.
      const response = await get(url, authorization ? { headers: { Authorization: authorization } } : undefined);
      if (response.status === 404) return undefined;
      if (!response.ok) throw new AtlasError(`GitHub answered ${response.status} for ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}
