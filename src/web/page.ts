// The page the web view serves: one input, then the skills. Plain DOM, text only, no innerHTML
// for anything that came from a repository.
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
  input { flex: 1; padding: .55rem .7rem; font: inherit; border: 1px solid #8888; border-radius: 6px; }
  button { padding: .55rem 1rem; font: inherit; border-radius: 6px; border: 1px solid #8888; cursor: pointer; }
  #status { margin: 1rem 0; color: #888; }
  #status.error { color: #d33; }
  .skill { border: 1px solid #8884; border-radius: 8px; padding: .75rem 1rem; margin: .75rem 0; }
  .skill h2 { font-size: 1.05rem; margin: 0 0 .25rem; }
  .skill p { margin: 0 0 .4rem; }
  .skill ul { margin: 0; padding-left: 1.1rem; font-size: .85rem; word-break: break-all; }
  details { margin-top: 1rem; color: #b80; font-size: .9rem; }
</style>
</head>
<body>
<h1>Skill Atlas</h1>
<form id="form">
  <input id="repo" name="repo" type="url" required placeholder="https://github.com/owner/repo" aria-label="Repository link">
  <button type="submit">Scan</button>
</form>
<div id="status" role="status"></div>
<div id="skills"></div>
<details id="warnings" hidden><summary></summary><ul></ul></details>
<script>
const $ = (id) => document.getElementById(id);
const el = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };

$('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const repo = $('repo').value.trim();
  const status = $('status');
  status.className = '';
  status.textContent = 'Scanning…';
  $('skills').replaceChildren();
  $('warnings').hidden = true;
  $('form').querySelector('button').disabled = true;
  try {
    const response = await fetch('/api/scan?repo=' + encodeURIComponent(repo));
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    show(result);
  } catch (error) {
    status.className = 'error';
    status.textContent = error.message;
  } finally {
    $('form').querySelector('button').disabled = false;
  }
});

function show({ repository, skills, warnings }) {
  $('status').textContent = repository.id + ' · ' + skills.length + (skills.length === 1 ? ' skill' : ' skills');
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
