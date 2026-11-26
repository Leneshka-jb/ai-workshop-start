/** A source file and its fallback name; content grouping happens after reading. */
export type SkillFile = { path: string; name: string };

/** Directories excluded from project scans at every depth. */
export const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules']);

/**
 * Every file named exactly SKILL.md, named after its directory (a SKILL.md at the
 * root after the repository). Source paths are unique and alphabetically ordered.
 */
export function findSkills(paths: string[], repositoryName: string): SkillFile[] {
  return [...new Set(paths)]
    .filter((path) => {
      const segments = path.split('/');
      return segments.at(-1) === 'SKILL.md' && !segments.slice(0, -1).some((part) => SKIPPED_DIRECTORIES.has(part));
    })
    .sort()
    .map((path) => ({ path, name: path.split('/').at(-2) ?? repositoryName }));
}
