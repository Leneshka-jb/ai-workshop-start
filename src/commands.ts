// The skill-atlas commands. The same code serves the Node CLI and the browser
// terminal: everything that differs between them comes in through the context.
import { AtlasError } from './core/errors.ts';
import { parseGitHubOwnerUrl, parseGitHubUrl, type Organization } from './core/github.ts';
import type { Repository, Skill } from './core/model.ts';
import { scanOrganizationSkills } from './core/organization.ts';
import { scan, type Source } from './core/scan.ts';
import { formatStore, parseStore, type Stored } from './core/store.ts';

export type Context = {
  /** Opens what the user asked to scan. */
  open(input: string): Promise<Source>;
  print(text: string): void;
  /** Errors and warnings. */
  error(text: string): void;
  /** Lists a GitHub organization's repositories; absent where it cannot run. */
  openOrganization?(input: string): Promise<Organization>;
  /** Reads a skill-atlas file; absent where there are no files. */
  readFile?(path: string): Promise<string>;
  /** Writes a skill-atlas file, replacing it; absent where there are no files. */
  writeFile?(path: string, text: string): Promise<void>;
  /** Starts the web view on the port and returns its address; absent where it cannot run. */
  serve?(port: number): Promise<string>;
};

const usage = `Usage: skill-atlas <command>

  scan <GitHub URL | directory>   find every SKILL.md in a repository and print it
  save <URL | directory> <file>   scan a repository, organization or directory into a file
  load <file>                     print what a saved file holds, without scanning
  serve [port]                    open the web view on http://localhost:<port> (default 3000)
  help                            show this help`;

/** Runs one command; returns its exit code. */
export async function run(args: string[], context: Context): Promise<number> {
  const [command = 'help', ...rest] = args;
  try {
    if (command === 'scan') await scanCommand(rest, context);
    else if (command === 'save') await saveCommand(rest, context);
    else if (command === 'load') await loadCommand(rest, context);
    else if (command === 'serve') await serveCommand(rest, context);
    else if (command === 'help') context.print(usage);
    else throw new AtlasError(`Unknown command: ${command}\n\n${usage}`);
    return 0;
  } catch (error) {
    if (!(error instanceof AtlasError)) throw error;
    context.error(error.message);
    return 1;
  }
}

async function scanCommand(args: string[], context: Context) {
  if (args.length !== 1) throw new AtlasError('Usage: skill-atlas scan <GitHub URL | directory>');
  const result = await scan(await context.open(args[0]));
  printRepository(result.repository, result.skills, context);
  for (const warning of result.warnings) context.error(`warning: ${warning}`);
}

async function saveCommand(args: string[], context: Context) {
  if (args.length !== 2) throw new AtlasError('Usage: skill-atlas save <GitHub URL | GitHub organization URL | directory> <file>');
  const [input, file] = args;
  if (!context.writeFile) throw new AtlasError('Saving to a file is not available here');
  let stored: Stored;
  if (parseGitHubOwnerUrl(input) && !parseGitHubUrl(input)) {
    if (!context.openOrganization) throw new AtlasError('Scanning an organization is not available here');
    stored = await scanOrganizationSkills(await context.openOrganization(input));
  } else {
    const result = await scan(await context.open(input));
    stored = { organization: null, repositories: [{ repository: result.repository, skills: result.skills }], warnings: result.warnings };
  }
  await context.writeFile(file, formatStore(stored));
  const repositories = stored.repositories.length;
  const skills = stored.repositories.reduce((sum, { skills }) => sum + (skills?.length ?? 0), 0);
  context.print(`Saved ${plural(repositories, 'repository', 'repositories')}, ${plural(skills, 'skill', 'skills')} to ${file}`);
  for (const warning of stored.warnings) context.error(`warning: ${warning}`);
}

async function loadCommand(args: string[], context: Context) {
  if (args.length !== 1) throw new AtlasError('Usage: skill-atlas load <file>');
  if (!context.readFile) throw new AtlasError('Loading a file is not available here');
  const stored = parseStore(await context.readFile(args[0]), args[0]);
  if (stored.organization) {
    context.print(`${stored.organization.id} · ${plural(stored.repositories.length, 'repository', 'repositories')}`);
  }
  for (const { repository, skills } of stored.repositories) {
    if (stored.organization) context.print('');
    if (skills) printRepository(repository, skills, context);
    else context.print(`${repository.id} · not scanned`);
  }
  for (const warning of stored.warnings) context.error(`warning: ${warning}`);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

async function serveCommand(args: string[], context: Context) {
  const port = args.length === 0 ? 3000 : Number(args[0]);
  if (args.length > 1 || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new AtlasError('Usage: skill-atlas serve [port]');
  }
  if (!context.serve) throw new AtlasError('The web view is not available here');
  context.print(`Skill Atlas web view: ${await context.serve(port)}`);
}

/** `<owner>/<repo> · N skills`, then each skill's name, first sentence and all links. */
function printRepository(repository: Repository, skills: Skill[], { print }: Context) {
  print(`${repository.id} · ${plural(skills.length, 'skill', 'skills')}`);
  for (const skill of skills) {
    print(skill.description ? `${skill.name} — ${firstSentence(skill.description)}` : skill.name);
    for (const link of skill.links) print(`  ${link.url}`);
  }
}

function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}
