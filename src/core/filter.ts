import type { Skill } from './model.ts';

/**
 * The skills whose name or description contains the text, ignoring case; the order is kept.
 * The text is trimmed, and an empty text keeps every skill. `toLowerCase` is locale-independent.
 */
export function filterSkills(skills: Skill[], text: string): Skill[] {
  const needle = text.trim().toLowerCase();
  if (!needle) return skills;
  return skills.filter((skill) => skill.name.toLowerCase().includes(needle) || skill.description.toLowerCase().includes(needle));
}
