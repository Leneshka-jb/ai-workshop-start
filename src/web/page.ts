// The page the web view serves: a link, then the skills under a filter applied as you type, or an organization's repositories.
// Plain DOM, text only, no innerHTML for anything that came from a repository.
export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skill Atlas</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { max-width: 52rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.45; }
  form { display: flex; gap: .5rem; }
  input { flex: 1; min-width: 0; padding: .55rem .7rem; font: inherit; border: 1px solid #8888; border-radius: 6px; }
  button { padding: .55rem 1rem; font: inherit; border-radius: 6px; border: 1px solid #8888; cursor: pointer; }
  #status { margin: 1rem 0; color: #888; }
  #filter { display: block; width: 16rem; max-width: 100%; box-sizing: border-box; margin: -.5rem 0 .5rem; padding: .3rem .5rem; font-size: .85rem; }
  #filter[hidden] { display: none; }
  #filter::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; display: none; }
  #status.error { color: #d33; }
  .skill { border: 1px solid #8884; border-radius: 8px; padding: .75rem 1rem; margin: .75rem 0; }
  .skill h2 { font-size: 1.05rem; margin: 0 0 .25rem; }
  .skill p { margin: 0 0 .4rem; }
  .repo { display: flex; align-items: center; gap: .75rem; border-bottom: 1px solid #8884; padding: .4rem 0; }
  .repo a { flex: 1; word-break: break-all; }
  .repo .count { color: #888; white-space: nowrap; }
  .repo button { padding: .25rem .7rem; font-size: .85rem; }
  .skill ul { margin: 0; padding-left: 1.1rem; font-size: .85rem; word-break: break-all; }
  details { margin-top: 1rem; color: #b80; font-size: .9rem; }
</style>
</head>
<body>
<h1>Skill Atlas</h1>
<form id="form">
  <input id="repo" name="repo" type="url" required placeholder="https://github.com/owner/repo or https://github.com/owner" aria-label="Repository or organization link">
  <button type="submit">Scan</button>
</form>
<div id="status" role="status"></div>
<input id="filter" name="filter" type="search" placeholder="Filter by name or description" aria-label="Filter skills" autocomplete="off" hidden>
<div id="skills"></div>
<details id="warnings" hidden><summary></summary><ul></ul></details>
<script>
const $ = (id) => document.getElementById(id);
const el = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };

/** The last repository scan, every skill; the filter is applied to it in the page, as you type. */
let scanned = null;

$('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const repo = $('repo').value.trim();
  const status = $('status');
  status.className = '';
  status.textContent = 'Scanning…';
  scanned = null;
  $('filter').hidden = true;
  $('skills').replaceChildren();
  $('warnings').hidden = true;
  $('form').querySelector('button').disabled = true;
  try {
    const organization = isOrganization(repo);
    const response = organization
      ? await fetch('/api/organization?org=' + encodeURIComponent(repo))
      : await fetch('/api/scan?repo=' + encodeURIComponent(repo));
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (organization) showOrganization(result);
    else {
      scanned = result;
      $('filter').hidden = false;
      show();
    }
  } catch (error) {
    status.className = 'error';
    status.textContent = error.message;
  } finally {
    $('form').querySelector('button').disabled = false;
  }
});

$('filter').addEventListener('input', () => { if (scanned) show(); });

const count = (n) => n + (n === 1 ? ' skill' : ' skills');

/** N skills; with a filter, M of N skills; or why there are none. */
function summary(shown, total, filter) {
  if (total === 0) return 'No skills found';
  if (!filter) return count(total);
  return shown === 0 ? 'No matching skills' : shown + ' of ' + count(total);
}

/** One path segment, such as https://github.com/JetBrains: an organization, not a repository. */
function isOrganization(input) {
  try {
    return new URL(input).pathname.split('/').filter(Boolean).length === 1;
  } catch {
    return false;
  }
}

function showOrganization({ organization, repositories, warnings }) {
  $('status').textContent = organization.id + ' · ' + repositories.length + (repositories.length === 1 ? ' repository' : ' repositories');
  for (const repository of repositories) {
    const row = el('div');
    row.className = 'repo';
    const a = el('a', repository.id);
    a.href = repository.url;
    a.target = '_blank';
    a.rel = 'noopener';
    const skills = el('span', repository.skills === null ? 'not scanned' : count(repository.skills));
    skills.className = 'count';
    const button = el('button', 'Scan');
    button.type = 'button';
    button.addEventListener('click', () => {
      $('repo').value = repository.url;
      $('form').requestSubmit();
    });
    row.append(a, skills, button);
    $('skills').append(row);
  }
  showWarnings(warnings);
}

/** The same match as the API: name or description contains the trimmed text, ignoring case; toLowerCase is locale-independent. */
function matches(skill, needle) {
  return skill.name.toLowerCase().includes(needle) || (skill.description || '').toLowerCase().includes(needle);
}

/** The last scan, through the current filter text. */
function show() {
  const { repository, skills: all, warnings } = scanned;
  const filter = $('filter').value.trim().toLowerCase();
  const skills = filter ? all.filter((skill) => matches(skill, filter)) : all;
  $('status').textContent = repository.id + ' · ' + summary(skills.length, all.length, filter);
  $('skills').replaceChildren();
  for (const skill of skills) {
    const card = el('article');
    card.className = 'skill';
    card.append(el('h2', skill.name));
    if (skill.description) card.append(el('p', skill.description));
    const links = el('ul');
    for (const link of skill.links) {
      const a = el('a', link.path);
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener';
      const item = el('li');
      item.append(a);
      links.append(item);
    }
    card.append(links);
    $('skills').append(card);
  }
  showWarnings(warnings);
}

function showWarnings(warnings) {
  $('warnings').hidden = true;
  if (warnings.length) {
    const box = $('warnings');
    box.querySelector('summary').textContent = warnings.length + (warnings.length === 1 ? ' warning' : ' warnings');
    box.querySelector('ul').replaceChildren(...warnings.map((warning) => el('li', warning)));
    box.hidden = false;
  }
}
</script>
</body>
</html>
`;
