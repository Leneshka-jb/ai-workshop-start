// `/scan <GitHub URL>` in an issue or pull request comment: the reply the GitHub Action posts.
// The same scan and output as the CLI; only GitHub repositories, never the runner's own files.
import { run } from '../commands.ts';
import type { Fetch } from '../core/github.ts';
import { openGitHub, parseGitHubUrl } from '../core/github.ts';
import { AtlasError } from '../core/errors.ts';

export type CommentOptions = { fetch: Fetch; token?: string };

/** The scan command in a comment's first line, or undefined when the comment is not one. */
export function parseCommand(body: string): string[] | undefined {
  const [first = ''] = body.split(/\r?\n/, 1);
  const words = first.trim().split(/\s+/);
  return words[0] === '/scan' ? words.slice(1) : undefined;
}

/** The Markdown reply to a comment, or undefined when the comment is not a scan command. */
export async function replyTo(body: string, options: CommentOptions): Promise<string | undefined> {
  const args = parseCommand(body);
  if (!args) return undefined;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(['scan', ...args], {
    open: async (input) => {
      if (!parseGitHubUrl(input)) throw new AtlasError(`Not a GitHub repository URL: ${input}`);
      return openGitHub(input, options);
    },
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  if (code !== 0) return `Skill Atlas could not scan:\n\n${block(stderr.join('\n').replace('skill-atlas scan <GitHub URL | directory>', '/scan <GitHub URL>'))}`;
  const reply = block(stdout.join('\n'));
  if (stderr.length === 0) return reply;
  const summary = stderr.length === 1 ? '1 warning' : `${stderr.length} warnings`;
  return `${reply}\n\n<details><summary>${summary}</summary>\n\n${block(stderr.join('\n'))}\n\n</details>`;
}

/** Repository text as a code block: shown as text, no Markdown, no @mentions. */
function block(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}
