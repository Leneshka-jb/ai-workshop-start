import { AtlasError, GitHubUnavailableError } from './errors.ts';
import type { Organization } from './github.ts';
import { scan } from './scan.ts';

/** One repository of an organization: its unique skills, or null if it could not be scanned. */
export type RepositoryCount = { id: string; name: string; url: string; skills: number | null };

export type OrganizationResult = {
  organization: { id: string; url: string };
  repositories: RepositoryCount[];
  warnings: string[];
};

/** Repositories scanned at the same time: enough to be quick, few enough to be polite to GitHub. */
const PARALLEL = 8;

/**
 * Every repository of the organization, each scanned on its own (fetch → find → group → parse),
 * counted and sorted by `owner/name`. A repository that cannot be scanned gets a warning; GitHub
 * being unavailable stops the whole scan.
 */
export async function scanOrganization(organization: Organization): Promise<OrganizationResult> {
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const infos = [...organization.repositories].sort((a, b) => compare(a.full_name, b.full_name));
  const results: { count: RepositoryCount; warnings: string[] }[] = new Array(infos.length);
  let next = 0;
  let stopped = false; // once GitHub is unavailable, the other workers start nothing new
  async function worker() {
    while (!stopped && next < infos.length) {
      const index = next++;
      const info = infos[index];
      const id = info.full_name;
      const count: RepositoryCount = { id, name: id.split('/')[1], url: `https://github.com/${id}`, skills: null };
      try {
        const result = await scan(await organization.open(info));
        count.skills = result.skills.length;
        results[index] = { count, warnings: result.warnings.map((warning) => `${id}: ${warning}`) };
      } catch (error) {
        if (!(error instanceof AtlasError) || error instanceof GitHubUnavailableError) {
          stopped = true;
          throw error;
        }
        results[index] = { count, warnings: [`${id}: ${error.message}; not scanned`] };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, infos.length) }, worker));
  return {
    organization: { id: organization.id, url: organization.url },
    repositories: results.map((result) => result.count),
    warnings: results.flatMap((result) => result.warnings),
  };
}
