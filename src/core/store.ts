// The skill-atlas file: repositories and their skills, saved to be loaded later without GitHub.
// JSON Lines, one record per line; the format is in spec/store.md. No Node APIs here: the caller
// reads and writes the file.
import { AtlasError } from './errors.ts';
import type { Repository, Skill, SkillLink } from './model.ts';

export const STORE_VERSION = 1;

/** What a file holds: one repository, or an organization's repositories, each with its skills. */
export type Stored = {
  /** The organization the repositories were listed from; null for a single repository or directory. */
  organization: { id: string; url: string } | null;
  /** Skills null: listed, but not scanned. */
  repositories: { repository: Repository; skills: Skill[] | null }[];
  warnings: string[];
};

/** The whole file: a header, every repository followed by its skills, then the warnings. */
export function formatStore(stored: Stored): string {
  const lines: unknown[] = [
    { type: 'skill-atlas', version: STORE_VERSION, organization: stored.organization, repositories: stored.repositories.length },
  ];
  for (const { repository, skills } of stored.repositories) {
    const { id, organization, name, url, commit } = repository;
    lines.push({ type: 'repository', id, organization, name, url, commit, skills: skills && skills.length });
    for (const { id, name, description, links, content } of skills ?? []) {
      lines.push({ type: 'skill', id, name, description, links: links.map(link), content });
    }
  }
  for (const text of stored.warnings) lines.push({ type: 'warning', text });
  return lines.map((line) => JSON.stringify(line)).join('\n') + '\n';
}

/** Reads a file written by formatStore; anything else is an AtlasError naming the file and line. */
export function parseStore(text: string, file: string): Stored {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  let number = 0;
  const fail = (reason: string): never => {
    throw new AtlasError(`${file}: line ${number}: ${reason}`);
  };
  const records = lines.map((line, index) => {
    number = index + 1;
    try {
      const record: unknown = JSON.parse(line);
      return isObject(record) ? record : fail('not a JSON object');
    } catch (error) {
      if (error instanceof AtlasError) throw error;
      return fail('not valid JSON');
    }
  });

  number = 1;
  const header = records[0];
  if (header?.type !== 'skill-atlas') throw new AtlasError(`Not a skill-atlas file: ${file}`);
  if (header.version !== STORE_VERSION) {
    throw new AtlasError(`${file}: unsupported skill-atlas file version ${JSON.stringify(header.version)}; expected ${STORE_VERSION}`);
  }
  const organization = header.organization === null ? null : {
    id: string(header.organization, 'id', fail, 'organization'),
    url: string(header.organization, 'url', fail, 'organization'),
  };
  const expected = count(header.repositories, fail, 'repositories');

  const stored: Stored = { organization, repositories: [], warnings: [] };
  let current: { skills: Skill[] | null; expected: number | null } | undefined;
  const close = () => {
    if (current && (current.skills?.length ?? null) !== current.expected) {
      fail(`expected ${current.expected} skills for the repository above, found ${current.skills?.length ?? 0}`);
    }
  };
  for (const [index, record] of records.entries()) {
    if (index === 0) continue;
    number = index + 1;
    if (record.type === 'repository') {
      if (stored.warnings.length) fail('a repository after the warnings');
      close();
      const skills = record.skills === null ? null : count(record.skills, fail, 'skills');
      const repository: Repository = {
        id: string(record, 'id', fail),
        organization: string(record, 'organization', fail),
        name: string(record, 'name', fail),
        url: string(record, 'url', fail),
        commit: string(record, 'commit', fail),
      };
      current = { skills: skills === null ? null : [], expected: skills };
      stored.repositories.push({ repository, skills: current.skills });
    } else if (record.type === 'skill') {
      if (!current || stored.warnings.length) fail('a skill outside a repository');
      if (!current!.skills) fail('a skill of a repository that was not scanned');
      if (!Array.isArray(record.links) || record.links.length === 0) fail('"links" must be a non-empty array');
      current!.skills!.push({
        id: string(record, 'id', fail),
        content: string(record, 'content', fail),
        name: string(record, 'name', fail),
        description: string(record, 'description', fail),
        links: (record.links as unknown[]).map((value) => readLink(value, fail)),
      });
    } else if (record.type === 'warning') {
      if (!stored.warnings.length) close();
      stored.warnings.push(string(record, 'text', fail));
    } else {
      fail(`unknown record type ${JSON.stringify(record.type)}`);
    }
  }
  if (!stored.warnings.length) close();
  if (stored.repositories.length !== expected) {
    throw new AtlasError(`${file}: expected ${expected} repositories, found ${stored.repositories.length}; the file is incomplete`);
  }
  return stored;
}

function link({ repository, path, url, commit }: SkillLink) {
  return commit === undefined ? { repository, path, url } : { repository, path, url, commit };
}

function readLink(value: unknown, fail: (reason: string) => never): SkillLink {
  if (!isObject(value)) return fail('every link must be an object');
  const result: SkillLink = {
    repository: string(value, 'repository', fail, 'link'),
    path: string(value, 'path', fail, 'link'),
    url: string(value, 'url', fail, 'link'),
  };
  if (value.commit !== undefined) result.commit = string(value, 'commit', fail, 'link');
  return result;
}

type Record_ = Record<string, unknown>;

function isObject(value: unknown): value is Record_ {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function string(record: unknown, key: string, fail: (reason: string) => never, owner?: string): string {
  const value = isObject(record) ? record[key] : undefined;
  return typeof value === 'string' ? value : fail(`"${owner ? `${owner}.` : ''}${key}" must be a string`);
}

function count(value: unknown, fail: (reason: string) => never, key: string): number {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : fail(`"${key}" must be a count`);
}
