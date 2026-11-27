// Clusters of saved skills by the words they share (spec/web.md#clusters).

/** A skill as saved in a text file: one line, `<name>: <description>`. */
export type SavedSkill = { name: string; description: string };

export type Cluster = { word: string; skills: SavedSkill[] };

export type Clustering = { clusters: Cluster[]; unclustered: SavedSkill[] };

/** Words too common to say what a skill is about. */
const COMMON = new Set([
  'about', 'after', 'also', 'been', 'before', 'being', 'both', 'could', 'covers', 'does', 'each', 'from', 'have',
  'here', 'into', 'just', 'like', 'make', 'more', 'most', 'need', 'needs', 'only', 'other', 'over', 'should', 'skill',
  'skills', 'some', 'such', 'than', 'that', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'under', 'used', 'uses', 'using', 'were', 'what', 'when', 'whenever', 'which', 'will', 'with', 'would', 'your',
]);

/** One skill per line, split at the first `:`, both parts trimmed; no `:` → no description; blank lines are ignored. */
export function parseSavedSkills(text: string): SavedSkill[] {
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    const colon = line.indexOf(':');
    return colon === -1
      ? { name: line.trim(), description: '' }
      : { name: line.slice(0, colon).trim(), description: line.slice(colon + 1).trim() };
  });
}

/** Name and description, lowercased, split at anything but a–z and 0–9; words of 4+ characters, not common ones. */
export function wordsOf(skill: SavedSkill): Set<string> {
  const words = `${skill.name} ${skill.description}`.toLowerCase().split(/[^a-z0-9]+/);
  return new Set(words.filter((word) => word.length >= 4 && !COMMON.has(word)));
}

/**
 * The shared words heuristic: while some word is had by two or more of the skills not yet in a
 * cluster, the word had by most of them (a tie: the first in code-point order) makes a cluster of
 * those skills. Skills keep their input order; the rest are unclustered.
 */
export function clusterSkills(skills: SavedSkill[]): Clustering {
  const words = skills.map(wordsOf);
  let left = skills.map((_, index) => index);
  const clusters: Cluster[] = [];
  for (;;) {
    const holders = new Map<string, number[]>();
    for (const index of left) {
      for (const word of words[index]) {
        const list = holders.get(word);
        if (list) list.push(index);
        else holders.set(word, [index]);
      }
    }
    let best: [string, number[]] | undefined;
    for (const entry of holders) {
      const [word, list] = entry;
      if (list.length < 2) continue;
      if (!best || list.length > best[1].length || (list.length === best[1].length && word < best[0])) best = entry;
    }
    if (!best) break;
    const [word, members] = best;
    clusters.push({ word, skills: members.map((index) => skills[index]) });
    const taken = new Set(members);
    left = left.filter((index) => !taken.has(index));
  }
  return { clusters, unclustered: left.map((index) => skills[index]) };
}
