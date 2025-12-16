const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');
const fetch = require('node-fetch');
const mkdirp = require('mkdirp');
const slugify = require('slugify'); // No changes needed
const { create } = require('xmlbuilder2');

const REPO_ROOT = process.cwd();
const PROJECTS_DIR = path.join(REPO_ROOT, 'projects');
const ASSETS_DIR = path.join(REPO_ROOT, 'assets');
const TEMP_REF_DIR = path.join(REPO_ROOT, 'temp_ref');
const OUT_DIR = path.join(REPO_ROOT, 'docs'); // GitHub Pages

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

async function fetchJSON(url, headers = {}) {
  try {
    const res = await fetch(url, { headers, timeout: 20000 });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('fetchJSON error', url, err && err.message);
    return null;
  }
}

function ensureOut() {
  if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
  }
  mkdirp.sync(OUT_DIR);
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    mkdirp.sync(dest);
    fs.readdirSync(src).forEach(function (childItemName) {
      copyRecursiveSync(path.join(src, childItemName),
        path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function copyStaticAssets() {
  // Mirror the reference structure in docs/
  // assets/css -> docs/css
  // assets/js -> docs/js
  // etc.
  // Copy Titan assets from temp_ref
  ['css', 'fonts', 'images', 'js'].forEach(folder => {
    const src = path.join(TEMP_REF_DIR, folder);
    const dest = path.join(OUT_DIR, folder);
    if (fs.existsSync(src)) {
      copyRecursiveSync(src, dest);
    }
  });

  // Copy local assets if they exist (overwriting Titan ones if needed, or adding new ones)
  if (fs.existsSync(ASSETS_DIR)) {
    fs.readdirSync(ASSETS_DIR).forEach(f => {
      copyRecursiveSync(path.join(ASSETS_DIR, f), path.join(OUT_DIR, f));
    });
  }
  // Copy legacy logo and search script just in case, but Titan uses its own structure
  try { fs.copyFileSync(path.join(__dirname, '..', 'templates', 'logo.png'), path.join(OUT_DIR, 'logo.png')); } catch (e) { }
  try { fs.copyFileSync(path.join(__dirname, '..', 'templates', 'search.js'), path.join(OUT_DIR, 'search.js')); } catch (e) { }
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": "&#39;" }[s]));
}

async function getLogoForLink(link) {
  try {
    const u = new URL(link);
    if (u.hostname === 'github.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const owner = parts[0];
        const ownerData = await fetchJSON(`https://api.github.com/users/${owner}`, GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {});
        if (ownerData && ownerData.avatar_url) return ownerData.avatar_url;
      }
    }
  } catch (err) { }
  try {
    const domain = (new URL(link)).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  } catch (err) {
    return '/logo.png'; // Fallback
  }
}

async function getContributorsForGithubRepo(link) {
  try {
    const u = new URL(link);
    if (u.hostname !== 'github.com') return [];
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return [];
    const owner = parts[0], repo = parts[1];
    const api = `https://api.github.com/repos/${owner}/${repo}/contributors?per_page=20`;
    const data = await fetchJSON(api, GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {});
    if (!data) return [];
    return data.map(d => ({ login: d.login, html_url: `https://github.com/${d.login}`, avatar_url: d.avatar_url }));
  } catch (err) {
    return [];
  }
}

function generateProjectCard(p) {
  // Adapted Titan Card Structure
  // We use the "Industry" grid item structure: 
  // <div id="w-node..." > <div class="heading-3 is-industry">...</div> </div>
  // But we enrich it.

  return `
  <div class="result-card" style="opacity: 1; transform: translate3d(0px, 0px, 0px) scale3d(1, 1, 1) rotateX(0deg) rotateY(0deg) rotateZ(0deg) skew(0deg, 0deg); transform-style: preserve-3d;">
    <a href="${p.link}" target="_blank" class="titan-card-link w-inline-block" style="display:block; padding: 20px; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; background: rgba(255,255,255,0.02); text-decoration: none; transition: border-color 0.3s;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
            <div data-text-move-left="" class="heading-3 is-industry" style="font-size: 1.5rem; margin:0;">${escapeHtml(p.title)}</div>
            ${p.logo ? `<img src="${p.logo}" style="width:30px; height:30px; border-radius:50%; object-fit:cover;">` : ''}
        </div>
        <p class="body-large" style="font-size: 0.9rem; color: #888; margin-bottom: 15px; line-height: 1.4;">${escapeHtml(p.description)}</p>
        <div class="titan-tags" style="display:flex; gap:8px; flex-wrap:wrap;">
            ${(p.tags || []).map(t => `<span style="font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; padding: 2px 6px; border: 1px solid #333; color: #666; border-radius: 4px; text-transform:uppercase;">${t}</span>`).join('')}
        </div>
    </a>
  </div>`;
}

async function build() {
  ensureOut();
  copyStaticAssets();

  // Load Reference Template
  let templateHtml = fs.readFileSync(path.join(TEMP_REF_DIR, 'index.html'), 'utf8');

  // Load Projects
  const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.md'));
  const projects = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(PROJECTS_DIR, file), 'utf8');
    const parsed = matter(raw);
    const fm = parsed.data || {};
    const slug = slugify(fm.title || path.basename(file, '.md'), { lower: true, strict: true });
    // ... basic parsing
    const link = fm.link || '';
    const title = fm.title || path.basename(file, '.md');
    const description = fm.description || '';
    const logo = await getLogoForLink(link);
    const contributors = await getContributorsForGithubRepo(link);

    projects.push({ title, link, description, tags: fm.tags, logo, slug, contributors });
  }

  // 1. Inject Hero Content
  // Inject Custom Titan CSS
  const customCssLink = '<link href="css/custom_titan.css" rel="stylesheet" type="text/css">';
  // Inject after the existing shared CSS or just before </head>
  const targetCss = 'css/tge-staging.webflow.shared.1da2e5c14.css" rel="stylesheet" type="text/css">';
  if (templateHtml.includes(targetCss)) {
    templateHtml = templateHtml.replace(targetCss, targetCss + '\n    ' + customCssLink);
  } else {
    templateHtml = templateHtml.replace('</head>', customCssLink + '\n</head>');
  }

  templateHtml = templateHtml.replace('A New Class of Ownership', 'all_we_need'); // Hero Title
  templateHtml = templateHtml.replace('Invitation Only.', 'For Devs.'); // Hero Sub
  templateHtml = templateHtml.replace(`Unmatched access to the`, `Curated access to the`); // Gradient text

  // Inject Search Bar in Hero
  const searchHtml = `
    <div class="search-wrapper" style="margin-top: 40px; position:relative; z-index: 10;">
        <input type="text" id="search-input" placeholder="SEARCH REPOSITORY..." style="
            width: 100%; 
            max-width: 500px; 
            background: rgba(0,0,0,0.5); 
            border: 1px solid rgba(255,255,255,0.2); 
            padding: 15px 20px; 
            color: #fff; 
            font-family: 'JetBrains Mono', monospace; 
            font-size: 1rem; 
            outline: none;
            backdrop-filter: blur(10px);
        ">
    </div>
  `;
  // Add search after hero subline text
  templateHtml = templateHtml.replace('world\'s most coveted opportunities.</div>', 'world\'s most coveted opportunities.</div>' + searchHtml);


  // 2. Inject Grid Content
  // Find the pioneers grid container
  // We'll replace the inner HTML of the grid with our cards.
  // The grid is identified by id="pioneers" -> div class="global-grid is-industry"
  const gridStartMarker = '<div id="pioneers"';
  const gridContentStart = '<div class="w-layout-grid global-grid is-industry">';

  // We construct the new grid HTML
  const cardsHtml = projects.map(p => generateProjectCard(p)).join('\n');

  // Replace the *entire* inner content of that grid div
  // Regex to find the grid div and replace its content
  // Note: Simple regex might be fragile if nested divs match. 
  // But the reference structure is flat-ish in that grid.
  // Let's iterate: find the start, find the closing div of that grid.

  let gridIndex = templateHtml.indexOf(gridContentStart);
  if (gridIndex !== -1) {
    const contentIndex = gridIndex + gridContentStart.length;
    // Heuristic: Find the closing div for this grid. 
    // Since we know the reference structure, let's look for the known end of that section or distinctive next element.
    // The grid ends before <div data-video="" class="full-video is-industry w-embed">
    const gridEndIndex = templateHtml.indexOf('<div data-video="" class="full-video is-industry w-embed">', contentIndex);

    if (gridEndIndex !== -1) {
      // Careful: there might be a closing </div> before the video div.
      // The structure is: <div class="grid"> ... </div> <div class="video"> 
      // So we should look for the last </div> before the video div.
      const slice = templateHtml.substring(contentIndex, gridEndIndex);
      const lastDivClose = slice.lastIndexOf('</div>');

      const pre = templateHtml.substring(0, contentIndex);
      const post = templateHtml.substring(contentIndex + lastDivClose); // keep the closing div

      // Inject our grid style override to support dynamic height cards
      const gridStyleOverride = `<style>
            .global-grid.is-industry { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; } 
            .titan-card-link:hover { border-color: #8898e7 !important; background: rgba(136, 152, 231, 0.05) !important; }
          </style>`;

      templateHtml = pre + gridStyleOverride + cardsHtml + post;
    }
  }

  // 3. Inject Search Script Logic
  const searchScript = `
  <script src="https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.min.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
        // Simple client-side search
        const cards = document.querySelectorAll('.result-card');
        const input = document.getElementById('search-input');
        
        input.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                const match = text.includes(term);
                card.style.display = match ? 'block' : 'none';
                card.style.opacity = match ? '1' : '0';
            });
        });
    });
  </script>
  `;
  templateHtml = templateHtml.replace('</body>', searchScript + '</body>');

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), templateHtml, 'utf8');

  // Also write projects.json for good measure
  fs.writeFileSync(path.join(OUT_DIR, 'projects.json'), JSON.stringify(projects, null, 2));

  console.log('Titan Clone Generated in docs/');
}

build().catch(console.error);
