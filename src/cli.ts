#!/usr/bin/env node
// The Node client: a GitHub repository through the GitHub API, or a local directory; stdout and
// stderr. Nothing is stored.
import type { AddressInfo } from 'node:net';
import { run } from './commands.ts';
import { AtlasError } from './core/errors.ts';
import { openGitHub, parseGitHubUrl } from './core/github.ts';
import { openDirectory } from './local.ts';
import { createWebServer } from './web/server.ts';

const token = process.env.GITHUB_TOKEN || undefined;

process.exitCode = await run(process.argv.slice(2), {
  open: (input) => (parseGitHubUrl(input) ? openGitHub(input, { fetch, token }) : openDirectory(input)),
  print: (text) => console.log(text),
  error: (text) => console.error(text),
  // Local only: the web view listens on the loopback interface.
  serve: (port) => new Promise((resolve, reject) => {
    // Filled once listening: the forwarded address needs the port actually in use.
    const allowedHosts: string[] = [];
    const server = createWebServer({ fetch, token, allowedHosts });
    server.once('error', (error) => reject(new AtlasError(`Cannot start the web view: ${error.message}`)));
    server.listen(port, '127.0.0.1', () => {
      const { port: listening } = server.address() as AddressInfo;
      allowedHosts.push(...codespaceHost(listening));
      resolve(`http://localhost:${listening}`);
    });
  }),
});

/** In a GitHub Codespace, the forwarded address of the port, which reaches the server under its own Host. */
function codespaceHost(port: number): string[] {
  const { CODESPACE_NAME: name, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: domain } = process.env;
  return name && domain ? [`${name}-${port}.${domain}`] : [];
}
