const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');
const fetch = require('node-fetch');
const mkdirp = require('mkdirp');
const slugify = require('slugify');
const { create } = require('xmlbuilder2');

const REPO_ROOT = process.cwd();
const PROJECTS_DIR = path.join(REPO_ROOT, 'projects');
const ASSETS_DIR = path.join(REPO_ROOT, 'assets');
const OUT_DIR = path.join(REPO_ROOT, 'docs'); // GitHub Pages will serve from docs/

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''; // provided by action (read-only token ok)

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
  mkdirp.sync(path.join(OUT_DIR, 'projects'));
  mkdirp.sync(path.join(OUT_DIR, 'assets'));
}

function copyStaticAssets() {
  // copy /assets if exists
  if (fs.existsSync(ASSETS_DIR)) {
    const dest = path.join(OUT_DIR, 'assets');
    mkdirp.sync(dest);
    fs.readdirSync(ASSETS_DIR).forEach(f => {
      fs.copyFileSync(path.join(ASSETS_DIR, f), path.join(dest, f));
    });
  }
  // copy css
  fs.copyFileSync(path.join(__dirname, '..', 'templates', 'styles.css'), path.join(OUT_DIR, 'styles.css'));
  fs.copyFileSync(path.join(__dirname, '..', 'templates', 'logo.png'), path.join(OUT_DIR, 'logo.png'));
  fs.copyFileSync(path.join(__dirname, '..', 'templates', 'search.js'), path.join(OUT_DIR, 'search.js'));
}

function renderLayout(title, description, body, canonical) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description || '')}" />
  <link rel="canonical" href="${canonical}" />
  <meta name="robots" content="index,follow" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
<header class="site-header">
  <a class="brand" href="/"><img src="/logo.png" alt="All We Need" height="25" width="25" /> <span>all_we_need</span></a>
  <nav>
    <a href="/">Home</a>
    <a href="/projects">Projects</a>
    <a href="https://github.com/ghostshanky/all_we_need">Repo</a>
  </nav>
</header>
<div class="loader" id="sys-loader">
  <div class="loader-text">SYSTEM INITIALIZING...</div>
</div>
<script>
  window.addEventListener('load', () => {
    const loader = document.getElementById('sys-loader');
    if(loader) {
      setTimeout(() => {
        loader.classList.add('hidden');
      }, 1000);
    }
  });
</script>
<main class="container">
${body}
</main>
<footer class="site-footer">
  <div>MIT License · Open source · Built with ❤️</div>
  <div>Auto-generated</div>
</footer>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '<', '>': '>', '"': '"', "'": "&#39;" }[s]));
}

function projectCardHtml(p) {
  const logoTag = p.logo ? `<img class="project-logo" src="${p.logo}" alt="${escapeHtml(p.title)} logo" />` : `<div class="project-logo placeholder"></div>`;
  const contributorsHtml = (p.contributors || []).slice(0, 6).map(c => `<a class="contrib" href="${c.html_url}" target="_blank" rel="noopener">${escapeHtml(c.login)}</a>`).join(' ');
  return `<article class="card">
    <a class="card-link" href="${p.page}" aria-label="${escapeHtml(p.title)}" style="text-decoration:none; color:inherit;">
      <div class="card-body">
        <div class="card-title">
          <span>${escapeHtml(p.title)}</span>
          ${logoTag}
        </div>
        <p class="card-desc">${escapeHtml(p.description || '')}</p>
        <div class="card-tags">
          ${(p.tags || ['Tool']).map(t => `<span class="tag">${t}</span>`).join('')}
        </div>
      </div>
    </a>
  </article>`;
}

function hostnameOnly(url) {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return url;
  }
}

async function getLogoForLink(link) {
  // If link is a GitHub repo, return owner avatar
  try {
    const u = new URL(link);
    if (u.hostname === 'github.com') {
      // parse /owner/repo
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const owner = parts[0];
        // fetch owner avatar
        const ownerData = await fetchJSON(`https://api.github.com/users/${owner}`, GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {});
        if (ownerData && ownerData.avatar_url) return ownerData.avatar_url;
      }
    }
  } catch (err) { }
  // fallback: use google s2 favicons
  try {
    const domain = (new URL(link)).hostname;
    // Use Google favicon service
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  } catch (err) {
    return '/logo.png';
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
    // return array of {login, html_url, avatar_url}
    return data.map(d => ({ login: d.login, html_url: `https://github.com/${d.login}`, avatar_url: d.avatar_url }));
  } catch (err) {
    return [];
  }
}

async function build() {
  ensureOut();
  copyStaticAssets();

  const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.md'));
  const projects = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(PROJECTS_DIR, file), 'utf8');
    const parsed = matter(raw);
    const contentHtml = marked(parsed.content || '');
    const fm = parsed.data || {};
    const slug = slugify(fm.title || path.basename(file, '.md'), { lower: true, strict: true });
    const link = fm.link || '';
    const title = fm.title || path.basename(file, '.md');
    const description = fm.description || fm.excerpt || (parsed.content || '').split('\n').find(Boolean) || '';
    const screenshot = fm.screenshot || null;
    const page = `/projects/${slug}.html`;

    const logo = await getLogoForLink(link);
    const contributors = await getContributorsForGithubRepo(link);

    const projectData = { slug, title, link, description, screenshot, page, logo, contributors, contentHtml, rawMarkdown: parsed.content };
    projects.push(projectData);

    // write project page
    const projectBody = `
      <article class="project-full">
        <header class="project-header">
          <img class="project-header-logo" src="${projectData.logo}" alt="${escapeHtml(title)} logo" />
          <div>
            <h1>${escapeHtml(title)}</h1>
            <p class="muted">${escapeHtml(description)}</p>
            <p><a class="cta" href="${link}" target="_blank" rel="noopener">Visit project</a>
              <a class="repo-link" href="${link}" target="_blank" rel="noopener"> (source)</a></p>
            <div class="contributors-list">
              ${projectData.contributors.map(c => `<a href="${c.html_url}" target="_blank" rel="noopener">${escapeHtml(c.login)}</a>`).join(' ')}
            </div>
          </div>
        </header>

        <section class="project-content">
          ${contentHtml}
        </section>
      </article>
    `;
    const projectHtml = renderLayout(`${title} · all_we_need`, description, projectBody, `https://allweneed.pages.dev${page}`);
    fs.writeFileSync(path.join(OUT_DIR, 'projects', `${slug}.html`), projectHtml, 'utf8');
  }

  // export JSON for client-side search
  fs.writeFileSync(
    path.join(OUT_DIR, 'projects.json'),
    JSON.stringify(projects.map(p => ({
      title: p.title,
      link: p.link,
      description: p.description,
      tags: p.tags || [],
      logo: p.logo,
      slug: p.slug,
      contributors: (p.contributors || []).map(c => c.login)
    })), null, 2)
  );

  // group projects by tags
  const categories = {};
  for (const p of projects) {
    const tags = p.tags && p.tags.length ? p.tags : ["Other"];
    tags.forEach(tag => {
      if (!categories[tag]) categories[tag] = [];
      categories[tag].push(p);
    });
  }

  let categorySections = "";
  for (const [tag, items] of Object.entries(categories)) {
    const cards = items.map(projectCardHtml).join("\n");
    const collapsed = items.length > 6
      ? `<div class="grid limited" data-tag="${tag}">${cards}</div>
         <button class="show-more btn-primary" data-tag="${tag}">Show more</button>`
      : `<div class="grid">${cards}</div>`;
    categorySections += `
      <section class="category">
        <h2>${escapeHtml(tag)}</h2>
        ${collapsed}
      </section>`;
  }

  // index page
  const indexBody = `
    <section class="hero">
      <h1>all_we_need</h1>
      <p class="lead">Access the world's most coveted developer tools.</p>
      <div class="search-container">
        <input id="search" type="text" placeholder="SEARCH DATABASE..." />
      </div>
    </section>
    ${categorySections}
    <script src="https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.min.js"></script>
    <script src="/search.js"></script>
  `;
  const indexHtml = renderLayout('all_we_need · Dev tools and hidden gems', 'Community curated dev tools and websites.', indexBody, 'https://allweneed.pages.dev/');
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), indexHtml, 'utf8');

  // projects listing page (optional)
  // projects listing page (optional)
  const projectsListingBody = `<h1>Projects</h1><div class="grid">${projects.map(projectCardHtml).join('\n')}</div>`;
  fs.writeFileSync(path.join(OUT_DIR, 'projects', 'index.html'), renderLayout('Projects · all_we_need', 'All projects', projectsListingBody, 'https://allweneed.pages.dev/projects'), 'utf8');

  // sitemap
  const xml = create({ version: '1.0' }).ele('urlset', { xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9' });
  function addUrl(u, lastmod = (new Date()).toISOString()) {
    xml.ele('url').ele('loc').txt(u).up().ele('lastmod').txt(lastmod).up().up();
  }
  addUrl('https://allweneed.pages.dev/');
  addUrl('https://allweneed.pages.dev/projects/');
  for (const p of projects) addUrl(`https://allweneed.pages.dev${p.page}`);
  fs.writeFileSync(path.join(OUT_DIR, 'sitemap.xml'), xml.end({ prettyPrint: true }), 'utf8');

  // robots
  fs.writeFileSync(path.join(OUT_DIR, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: https://allweneed.pages.dev/sitemap.xml\n`, 'utf8');

  console.log('Site generated in', OUT_DIR);
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
