/** A scanned repository. The hierarchy is organization → repository → skill. */
export type Repository = {
  /** `owner/name`, for example `JetBrains/kotlin`; a local directory's name. */
  id: string;
  organization: string;
  name: string;
  /** `https://github.com/<owner>/<repo>`, or a local directory's file:// URL. */
  url: string;
  /** The scanned commit; empty for a local directory. */
  commit: string;
};

/** One distinct SKILL.md content, shared by every linked source location. */
export type Skill = {
  /** The alphabetically first `repo:path` among its source locations. */
  id: string;
  /** Complete UTF-8 text, without whitespace or line-ending normalization. */
  content: string;
  name: string;
  description: string;
  /** Source locations ordered by `repo:path`. */
  links: SkillLink[];
};

export type SkillLink = {
  repository: string;
  path: string;
  url: string;
  /** The scanned GitHub commit; omitted for local files. */
  commit?: string;
};

/**
 * The SKILL.md file, from where its repository is: on GitHub at the scanned commit,
 * `https://github.com/<owner>/<repo>/blob/<commit>/<path>`; in a local directory, the file itself.
 */
export function skillLink(repository: Repository, path: string): SkillLink {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return {
    repository: repository.id,
    path,
    url: repository.commit ? `${repository.url}/blob/${repository.commit}/${encoded}` : `${repository.url}/${encoded}`,
    ...(repository.commit ? { commit: repository.commit } : {}),
  };
}

/** By name, then by ID: the same order everywhere, whatever the locale. */
export function sortSkills(skills: Skill[]): Skill[] {
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...skills].sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id));
}
