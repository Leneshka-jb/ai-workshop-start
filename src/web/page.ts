// The page the web view serves: a link and the clusters of the saved skills, then a table of the skills under a filter applied as you type and a project choice,
// or a table of an organization's repositories.
// Plain DOM, text only, no innerHTML for anything that came from a repository.
export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skill Atlas</title>
<style>
  :root {
    color-scheme: light dark; font-family: system-ui, sans-serif;
    --accent: light-dark(#5b3cc4, #a78bfa); --accent-soft: light-dark(#efeaff, #2a2350);
    --line: light-dark(#e3e0ec, #3a3650); --stripe: light-dark(#faf9fd, #1c1a28); --muted: light-dark(#6b6880, #9b98b0);
    --surface: light-dark(#ffffff, #14131c);
  }
  body { max-width: 72rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.45; background: light-dark(#f6f5fa, #0e0d14); }
  h1 { margin: 0 0 1rem; font-size: 1.6rem; background: linear-gradient(90deg, var(--accent), light-dark(#d63384, #f472b6)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  form { display: flex; gap: .5rem; }
  input, select { flex: 1; min-width: 0; padding: .55rem .7rem; font: inherit; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
  input:focus, select:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  button { padding: .55rem 1rem; font: inherit; border-radius: 6px; border: 1px solid var(--accent); background: var(--accent); color: light-dark(#fff, #14131c); cursor: pointer; font-weight: 600; }
  button:disabled { opacity: .6; cursor: progress; }
  #status { margin: 1rem 0; color: var(--muted); font-weight: 600; }
  #filter { display: inline-block; width: 16rem; max-width: 100%; box-sizing: border-box; margin: -.5rem .5rem .75rem 0; padding: .3rem .5rem; font-size: .85rem; }
  #project { display: inline-block; width: auto; max-width: 100%; margin: -.5rem 0 .75rem; padding: .3rem .5rem; font-size: .85rem; }
  #filter[hidden], #project[hidden], #table[hidden] { display: none; }
  #filter::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; display: none; }
  #status.error { color: #d33; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; font-size: .92rem; }
  th { text-align: left; padding: .55rem .8rem; background: var(--accent-soft); color: var(--accent); font-size: .78rem; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid var(--line); }
  td { padding: .6rem .8rem; vertical-align: top; border-bottom: 1px solid var(--line); }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:nth-child(even) td { background: var(--stripe); }
  tbody tr:hover td { background: var(--accent-soft); }
  td.name { font-weight: 600; white-space: nowrap; color: var(--accent); }
  td.description { color: light-dark(#2d2b3a, #dcdae8); }
  td.links { width: 18rem; }
  td.links ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: .25rem; }
  td.links a { display: inline-block; font: .78rem ui-monospace, monospace; padding: .1rem .45rem; border-radius: 4px; background: var(--accent-soft); color: var(--accent); text-decoration: none; word-break: break-all; }
  td.links a:hover { text-decoration: underline; }
  td.count { color: var(--muted); white-space: nowrap; }
  td.action { width: 1%; }
  td.action button { padding: .25rem .7rem; font-size: .85rem; }
  .bar { display: flex; gap: .5rem; }
  .bar form { flex: 1; min-width: 0; }
  #clusterize { background: transparent; color: var(--accent); }
  #clusters { margin-top: 1rem; padding: .8rem 1rem 1rem; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
  #clusters[hidden] { display: none; }
  .clusters-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin-bottom: .6rem; color: var(--muted); font-weight: 600; }
  .clusters-head button { padding: .25rem .7rem; font-size: .85rem; }
  #clusters-status.error { color: #d33; }
  #cluster-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: .6rem; }
  .cluster { padding: .5rem .6rem; border: 1px solid var(--line); border-radius: 8px; background: var(--stripe); }
  .cluster h3 { margin: 0 0 .4rem; font-size: .85rem; color: var(--accent); }
  .cluster ul { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: .25rem; }
  .cluster li { font: .75rem ui-monospace, monospace; padding: .1rem .4rem; border-radius: 4px; background: var(--accent-soft); color: var(--accent); cursor: default; }
  details { margin-top: 1rem; color: #b80; font-size: .9rem; }
</style>
</head>
<body>
<h1>Skill Atlas</h1>
<div class="bar">
<form id="form">
  <input id="repo" name="repo" type="url" required placeholder="https://github.com/owner/repo or https://github.com/owner" aria-label="Repository or organization link">
  <button type="submit">Scan</button>
</form>
<button id="clusterize" type="button">Clasterize</button>
</div>
<section id="clusters" aria-label="Clusters of the saved skills" hidden>
  <div class="clusters-head"><span id="clusters-status" role="status"></span><button id="clusters-hide" type="button">Hide</button></div>
  <div id="cluster-list"></div>
</section>
<div id="status" role="status"></div>
<input id="filter" name="filter" type="search" placeholder="Filter by name or description" aria-label="Filter skills" autocomplete="off" hidden>
<select id="project" name="project" aria-label="Project" hidden></select>
<table id="table" hidden><thead><tr id="columns"></tr></thead><tbody id="skills"></tbody></table>
<details id="warnings" hidden><summary></summary><ul></ul></details>
<script>
const $ = (id) => document.getElementById(id);
const el = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
const cell = (className, ...children) => { const td = el('td'); td.className = className; td.append(...children); return td; };
const link = (text, url) => { const a = el('a', text); a.href = url; a.target = '_blank'; a.rel = 'noopener'; return a; };

/** The last repository scan, every skill; the filter and project are applied to it in the page, as you choose. */
let scanned = null;
/** The project option for every project; the root has its own value, since '' means every project. */
const ROOT = '.';

$('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const repo = $('repo').value.trim();
  const status = $('status');
  status.className = '';
  status.textContent = 'Scanning…';
  scanned = null;
  $('filter').hidden = true;
  $('project').hidden = true;
  $('table').hidden = true;
  $('skills').replaceChildren();
  $('warnings').hidden = true;
  $('warnings').open = false;
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
      showProjects();
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
$('project').addEventListener('change', () => { if (scanned) show(); });

/** The saved skills, clustered by the server: shown under the link form; a scan leaves them as they are. */
$('clusterize').addEventListener('click', async () => {
  const head = $('clusters-status');
  head.className = '';
  head.textContent = 'Clustering…';
  $('cluster-list').replaceChildren();
  $('clusters').hidden = false;
  $('clusterize').disabled = true;
  try {
    const response = await fetch('/api/clusters');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    showClusters(result);
  } catch (error) {
    head.className = 'error';
    head.textContent = error.message;
  } finally {
    $('clusterize').disabled = false;
  }
});
$('clusters-hide').addEventListener('click', () => { $('clusters').hidden = true; });

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

/**
 * The project of a SKILL.md path: its directories before the first hidden one (.agents, .claude, …) or skills;
 * without either, the directories above the skill's own. The repository root is ROOT.
 */
function projectOf(path) {
  const directories = path.split('/').slice(0, -1);
  const stop = directories.findIndex((name) => name.startsWith('.') || name === 'skills');
  const project = (stop === -1 ? directories.slice(0, -1) : directories.slice(0, stop)).join('/');
  return project || ROOT;
}

/** The table's column headings. */
function columns(...names) {
  $('columns').replaceChildren(...names.map((name) => el('th', name)));
}

function showOrganization({ organization, repositories, warnings }) {
  $('status').textContent = organization.id + ' · ' + repositories.length + (repositories.length === 1 ? ' repository' : ' repositories');
  columns('Repository', 'Skills', '');
  for (const repository of repositories) {
    const row = el('tr');
    const button = el('button', 'Scan');
    button.type = 'button';
    button.addEventListener('click', () => {
      $('repo').value = repository.url;
      $('form').requestSubmit();
    });
    row.append(
      cell('name', link(repository.id, repository.url)),
      cell('count', el('span', repository.skills === null ? 'not scanned' : count(repository.skills))),
      cell('action', button),
    );
    $('skills').append(row);
  }
  $('table').hidden = repositories.length === 0;
  showWarnings(warnings);
}

/** Every project of the last scan, sorted, with its number of skills; shown only when there are two or more. */
function showProjects() {
  const counts = new Map();
  for (const skill of scanned.skills) {
    for (const project of new Set(skill.links.map((l) => projectOf(l.path)))) counts.set(project, (counts.get(project) || 0) + 1);
  }
  const projects = [...counts.keys()].sort((a, b) => (a === ROOT ? -1 : b === ROOT ? 1 : a < b ? -1 : a > b ? 1 : 0));
  const option = (value, text) => { const node = el('option', text); node.value = value; return node; };
  $('project').replaceChildren(
    option('', 'All projects'),
    ...projects.map((project) => option(project, (project === ROOT ? '(repository root)' : project) + ' · ' + count(counts.get(project)))),
  );
  $('project').value = '';
  $('project').hidden = projects.length < 2;
}

/** The same match as the API: name or description contains the trimmed text, ignoring case; toLowerCase is locale-independent. */
function matches(skill, needle) {
  return skill.name.toLowerCase().includes(needle) || (skill.description || '').toLowerCase().includes(needle);
}

/** The last scan, through the chosen project and the current filter text. */
function show() {
  const { repository, warnings } = scanned;
  const project = $('project').value;
  const inProject = (l) => !project || projectOf(l.path) === project;
  const all = scanned.skills.filter((skill) => skill.links.some(inProject));
  const filter = $('filter').value.trim().toLowerCase();
  const skills = filter ? all.filter((skill) => matches(skill, filter)) : all;
  const where = project ? ' · ' + (project === ROOT ? '(repository root)' : project) : '';
  $('status').textContent = repository.id + where + ' · ' + summary(skills.length, all.length, filter);
  columns('Name', 'Description', 'Links');
  $('skills').replaceChildren();
  for (const skill of skills) {
    const row = el('tr');
    const links = el('ul');
    for (const l of skill.links.filter(inProject)) {
      const item = el('li');
      item.append(link(l.path, l.url));
      links.append(item);
    }
    const name = el('td', skill.name);
    name.className = 'name';
    const description = el('td', skill.description || '');
    description.className = 'description';
    row.append(name, description, cell('links', links));
    $('skills').append(row);
  }
  $('table').hidden = skills.length === 0;
  showWarnings(warnings);
}

/** N skills · M clusters, then each cluster with its skill names, the description on hover; the unclustered last. */
function showClusters({ total, clusters, unclustered }) {
  $('clusters-status').textContent = count(total) + ' · ' + clusters.length + (clusters.length === 1 ? ' cluster' : ' clusters');
  const group = (title, skills) => {
    const box = el('div');
    box.className = 'cluster';
    const names = el('ul');
    for (const skill of skills) {
      const item = el('li', skill.name);
      item.title = skill.description;
      names.append(item);
    }
    box.append(el('h3', title + ' · ' + count(skills.length)), names);
    return box;
  };
  const groups = clusters.map((cluster) => group(cluster.word, cluster.skills));
  if (unclustered.length) groups.push(group('Unclustered', unclustered));
  $('cluster-list').replaceChildren(...groups);
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
