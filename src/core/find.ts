/** A source file and its fallback name; content grouping happens after reading. */
export type SkillFile = { path: string; name: string };

/** Where agents keep a repository's own skills. */
export const SKILL_ROOTS = ['.agents/skills', '.claude/skills', '.github/skills', 'agent/skills'];

/**
 * Every file named exactly SKILL.md, named after its directory (a SKILL.md at the
 * root after the repository). Source paths are unique and alphabetically ordered.
 */
export function findSkills(paths: string[], repositoryName: string): SkillFile[] {
  return [...new Set(paths)]
    .filter((path) => path.split('/').at(-1) === 'SKILL.md')
    .sort()
    .map((path) => ({ path, name: path.split('/').at(-2) ?? repositoryName }));
}
