import { findSkills } from './find.ts';
import { skillLink, sortSkills, type Repository, type Skill } from './model.ts';
import { parseSkill } from './parse.ts';

/** A repository to scan: its files, and how to read them. */
export type Source = {
  repository: Repository;
  /** Every file path, relative to the repository root. */
  paths: string[];
  /** What listing the files had to leave out. */
  warnings: string[];
  /** The file's bytes, or undefined if it is not there. */
  read(path: string): Promise<Uint8Array | undefined>;
};

export type ScanResult = { repository: Repository; skills: Skill[]; warnings: string[] };

/** fetch → find → group → parse. Nothing is stored: the result is all there is. */
export async function scan(source: Source): Promise<ScanResult> {
  const files = findSkills(source.paths, source.repository.name);
  // The files are read at the same time: on GitHub, each one is a request.
  const results = await Promise.all(files.map(async (file) => {
    const bytes = await source.read(file.path);
    return { file, bytes, hash: bytes === undefined ? undefined : await fingerprint(bytes) };
  }));
  const buckets = new Map<string, ContentGroup[]>();
  const skills: Skill[] = [];
  const warnings = [...source.warnings];
  // Promise.all preserves the sorted source order, regardless of read completion order.
  for (const { file, bytes, hash } of results) {
    if (bytes === undefined || hash === undefined) {
      warnings.push(`${file.path}: listed, but not found at the scanned commit; skipped`);
      continue;
    }
    const bucket = buckets.get(hash) ?? [];
    let group = bucket.find((candidate) => sameBytes(candidate.bytes, bytes));
    if (!group) {
      const content = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
      const parsed = parseSkill(content);
      const skill: Skill = {
        id: `${source.repository.id}:${file.path}`,
        content,
        name: parsed.name ?? file.name,
        description: parsed.description,
        links: [],
      };
      group = { bytes, skill, warning: parsed.warning };
      bucket.push(group);
      buckets.set(hash, bucket);
      skills.push(skill);
    }
    group.skill.links.push(skillLink(source.repository, file.path));
    if (group.warning) warnings.push(`${file.path}: ${group.warning}`);
  }
  return {
    repository: source.repository,
    skills: sortSkills(skills),
    warnings,
  };
}

type ContentGroup = { bytes: Uint8Array; skill: Skill; warning?: string };

async function fingerprint(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Hashes only narrow the search: equality always means identical bytes. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}
