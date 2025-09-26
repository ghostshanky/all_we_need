// scripts/generate.js - Advanced Site Generator for all_we_need
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
const OUT_DIR = path.join(REPO_ROOT, 'docs'); // GitHub Pages serves from docs/
const TEMPLATES_DIR = path.join(REPO_ROOT, 'templates');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const SITE_URL = 'https://allweneed.github.io';

// Utility functions
async function fetchJSON(url, headers = {}) {
  try {
    const res = await fetch(url, { 
      headers, 
      timeout: 20000,
      'User-Agent': 'allweneed-site-generator/1.0'
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('fetchJSON error', url, err && err.message);
    return null;
  }
}

function ensureOut() {
  if (fs.existsSync(OUT_DIR)) {
    try {
      fs.rmSync(OUT_DIR, { recursive: true, force: true });
    } catch (err) {
      console.warn('Warning: Could not remove docs directory, it may be in use');
      // Try to clear contents instead
      try {
        const files = fs.readdirSync(OUT_DIR);
        files.forEach(file => {
          try {
            fs.rmSync(path.join(OUT_DIR, file), { recursive: true, force: true });
          } catch (e) {
            console.warn(`Warning: Could not remove ${file}`);
          }
        });
      } catch (e) {
        console.warn('Warning: Could not clear docs directory contents');
      }
    }
  }
  try {
    mkdirp.sync(path.join(OUT_DIR, 'projects'));
    mkdirp.sync(path.join(OUT_DIR, 'assets'));
  } catch (err) {
    console.warn('Warning: Could not create directories, they may already exist');
  }
}

function copyStaticAssets() {
  // Copy assets if exists
  if (fs.existsSync(ASSETS_DIR)) {
    const dest = path.join(OUT_DIR, 'assets');
    mkdirp.sync(dest);
    fs.readdirSync(ASSETS_DIR).forEach(f => {
      fs.copyFileSync(path.join(ASSETS_DIR, f), path.join(dest, f));
    });
  }
  
  // Copy template files
  const templates = ['styles.css', 'logo.svg', 'search.js'];
  templates.forEach(file => {
    const src = path.join(TEMPLATES_DIR, file);
    const dest = path.join(OUT_DIR, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  });
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, s => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[s]));
}

function renderLayout(title, description, body, canonical, additionalHead = '') {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description || '')}" />
  <link rel="canonical" href="${canonical}" />
  <meta name="robots" content="index,follow" />
  
  <!-- SEO & Social Meta -->
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description || '')}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="all_we_need" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description || '')}" />
  
  <!-- Favicon & Theme -->
  <link rel="icon" href="/logo.svg" />
  <meta name="theme-color" content="#0b6efd" />
  
  <!-- Styles -->
  <link rel="stylesheet" href="/styles.css" />
  ${additionalHead}
</head>
<body>
<header class="site-header" id="site-header">
  <div class="header-content">
    <a class="brand" href="/"><img src="/logo.svg" alt="All We Need" /> <span>all_we_need</span></a>
    <nav class="nav-links">
      <a href="/">Home</a>
      <a href="/projects/">Projects</a>
      <a href="https://github.com/ghostshanky/allweneed.github.io">GitHub</a>
    </nav>
    <div class="search-icon-container" id="search-icon" style="display: none;">
      <button class="search-icon-btn" onclick="focusMainSearch()">🔍</button>
    </div>
  </div>
</header>
<main class="container">
${body}
</main>
<footer class="site-footer">
  <div class="footer-content">
    <div>
      <p>MIT License · Open source · Built with ❤️</p>
      <p>Auto-generated from <a href="https://github.com/ghostshanky/allweneed.github.io">GitHub repository</a></p>
    </div>
    <div class="footer-links">
      <a href="/sitemap.xml">Sitemap</a>
      <a href="https://github.com/ghostshanky/allweneed.github.io/blob/main/CONTRIBUTING.md">Contribute</a>
    </div>
  </div>
</footer>
<script src="/search.js"></script>
</body>
</html>`;
}

function projectCardHtml(p) {
  const logoTag = p.logo ? 
    `<img class="project-logo" src="${p.logo}" alt="${escapeHtml(p.title)} logo" loading="lazy" />` : 
    `<div class="project-logo placeholder"></div>`;
  
  const contributorsHtml = (p.contributors || []).slice(0, 4).map(c => 
    `<a class="contrib" href="${c.html_url}" target="_blank" rel="noopener" title="${escapeHtml(c.login)}">${escapeHtml(c.login)}</a>`
  ).join(' ');
  
  const tagsHtml = (p.tags || []).slice(0, 3).map(tag => 
    `<span class="tag">${escapeHtml(tag)}</span>`
  ).join('');
  
  return `<article class="project-card" data-slug="${p.slug}" data-tags="${(p.tags || []).join(' ')}">
    <a class="project-link" href="${p.page}" aria-label="View ${escapeHtml(p.title)} details">
      <div class="project-left">${logoTag}</div>
      <div class="project-body">
        <h3>${escapeHtml(p.title)}</h3>
        <p class="desc">${escapeHtml(p.description || '')}</p>
        <div class="tags">${tagsHtml}</div>
        <div class="meta">
          <span class="site-link">
            <a href="${p.link}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
              ${escapeHtml(hostnameOnly(p.link))}
            </a>
          </span>
          ${contributorsHtml ? `<span class="contributors">${contributorsHtml}</span>` : ''}
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
  try {
    const u = new URL(link);
    
    // GitHub repo - use owner avatar
    if (u.hostname === 'github.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const owner = parts[0];
        const ownerData = await fetchJSON(`https://api.github.com/users/${owner}`, 
          GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {});
        if (ownerData && ownerData.avatar_url) return ownerData.avatar_url;
      }
    }
  } catch (err) {}
  
  // Fallback to Google favicon service
  try {
    const domain = (new URL(link)).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  } catch (err) {
    return '/logo.svg';
  }
}

async function getContributorsForGithubRepo(link) {
  try {
    const u = new URL(link);
    if (u.hostname !== 'github.com') return [];
    
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return [];
    
    const [owner, repo] = parts;
    const api = `https://api.github.com/repos/${owner}/${repo}/contributors?per_page=10`;
    const data = await fetchJSON(api, 
      GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {});
    
    if (!data) return [];
    
    return data.map(d => ({
      login: d.login,
      html_url: `https://github.com/${d.login}`,
      avatar_url: d.avatar_url,
      contributions: d.contributions
    }));
  } catch (err) {
    return [];
  }
}

async function build() {
  console.log('🚀 Starting site generation...');
  ensureOut();
  copyStaticAssets();

  if (!fs.existsSync(PROJECTS_DIR)) {
    console.log('📁 Creating projects directory...');
    mkdirp.sync(PROJECTS_DIR);
  }

  const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.md'));
  console.log(`📄 Found ${files.length} project files`);

  const projects = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(PROJECTS_DIR, file), 'utf8');
    const parsed = matter(raw);
    const contentHtml = marked(parsed.content || '');
    const fm = parsed.data || {};
    
    // Validate required fields
    if (!fm.title || !fm.link || !fm.description) {
      console.warn(`⚠️  Skipping ${file}: missing required frontmatter fields`);
      continue;
    }
    
    const slug = slugify(fm.title, { lower: true, strict: true });
    const title = fm.title;
    const link = fm.link;
    const description = fm.description;
    const tags = Array.isArray(fm.tags) ? fm.tags : [];
    const screenshot = fm.screenshot || null;
    const page = `/projects/${slug}.html`;

    console.log(`🔄 Processing: ${title}`);
    
    const logo = await getLogoForLink(link);
    const contributors = await getContributorsForGithubRepo(link);

    const projectData = {
      slug, title, link, description, tags, screenshot, page, logo, contributors, 
      contentHtml, rawMarkdown: parsed.content
    };
    projects.push(projectData);

    // Generate individual project page
    const projectBody = `
      <article class="project-full">
        <header class="project-header">
          <img class="project-header-logo" src="${projectData.logo}" alt="${escapeHtml(title)} logo" />
          <div class="project-info">
            <h1>${escapeHtml(title)}</h1>
            <p class="project-description">${escapeHtml(description)}</p>
            <div class="project-actions">
              <a class="cta-primary" href="${link}" target="_blank" rel="noopener">Visit Project</a>
              ${link.includes('github.com') ? 
                `<a class="cta-secondary" href="${link}" target="_blank" rel="noopener">View Source</a>` : ''}
            </div>
            ${tags.length ? `<div class="project-tags">
              ${tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
            </div>` : ''}
            ${contributors.length ? `<div class="contributors-section">
              <h3>Contributors</h3>
              <div class="contributors-list">
                ${contributors.map(c => `
                  <a href="${c.html_url}" target="_blank" rel="noopener" class="contributor">
                    <img src="${c.avatar_url}" alt="${escapeHtml(c.login)}" />
                    <span>${escapeHtml(c.login)}</span>
                  </a>
                `).join('')}
              </div>
            </div>` : ''}
          </div>
        </header>

        ${contentHtml ? `<section class="project-content">
          ${contentHtml}
        </section>` : ''}
        
        <div class="back-to-home">
          <a href="/">← Back to all projects</a>
        </div>
      </article>
    `;
    
    const projectHtml = renderLayout(
      `${title} · all_we_need`, 
      description, 
      projectBody, 
      `${SITE_URL}${page}`
    );
    fs.writeFileSync(path.join(OUT_DIR, 'projects', `${slug}.html`), projectHtml, 'utf8');
  }

  // Group projects by tags for homepage
  const categories = {};
  for (const p of projects) {
    const projectTags = p.tags && p.tags.length ? p.tags : ['Other'];
    projectTags.forEach(tag => {
      if (!categories[tag]) categories[tag] = [];
      categories[tag].push(p);
    });
  }

  // Sort categories by number of projects (descending)
  const sortedCategories = Object.entries(categories)
    .sort(([,a], [,b]) => b.length - a.length);

  let categorySections = '';
  for (const [tag, items] of sortedCategories) {
    const cards = items.map(projectCardHtml).join('\n');
    const isCollapsible = items.length > 6;
    
    categorySections += `
      <section class="category" data-category="${escapeHtml(tag)}">
        <div class="category-header">
          <h2>${escapeHtml(tag)} <span class="count">(${items.length})</span></h2>
          ${isCollapsible ? `<button class="show-more" data-category="${escapeHtml(tag)}">Show all</button>` : ''}
        </div>
        <div class="projects-grid ${isCollapsible ? 'limited' : ''}" data-category-grid="${escapeHtml(tag)}">
          ${cards}
        </div>
      </section>`;
  }

  // Homepage
  const statsHtml = `
    <div class="stats">
      <div class="stat">
        <span class="stat-number">${projects.length}</span>
        <span class="stat-label">Projects</span>
      </div>
      <div class="stat">
        <span class="stat-number">${Object.keys(categories).length}</span>
        <span class="stat-label">Categories</span>
      </div>
      <div class="stat">
        <span class="stat-number">${projects.reduce((acc, p) => acc + (p.contributors || []).length, 0)}</span>
        <span class="stat-label">Contributors</span>
      </div>
    </div>
  `;

  const indexBody = `
    <section class="hero">
      <h1>all_we_need</h1>
      <p class="lead">Discover amazing developer tools, hidden gems, and useful resources curated by the community.</p>
      <div class="search-container">
        <input id="main-search" type="text" placeholder="🔍 Search what are you looking for..." />
        <div id="search-results" class="search-results" style="display: none;"></div>
      </div>
      ${statsHtml}
    </section>

    <div id="categories-container">
      ${categorySections}
    </div>
    
    <div id="no-results" class="no-results" style="display: none;">
      <h3>No projects found</h3>
      <p>Try different keywords or browse categories above.</p>
    </div>
  `;

  const indexHtml = renderLayout(
    'all_we_need · Developer Tools & Hidden Gems', 
    'Discover amazing developer tools, hidden gems, and useful resources curated by the community.', 
    indexBody, 
    SITE_URL
  );
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), indexHtml, 'utf8');

  // Projects listing page
  const projectsListingBody = `
    <h1>All Projects</h1>
    <p>Browse our complete collection of ${projects.length} developer tools and resources.</p>
    <div class="projects-grid">
      ${projects.map(projectCardHtml).join('\n')}
    </div>
  `;
  fs.writeFileSync(
    path.join(OUT_DIR, 'projects', 'index.html'), 
    renderLayout('All Projects · all_we_need', 'Browse all projects', projectsListingBody, `${SITE_URL}/projects/`), 
    'utf8'
  );

  // Export projects data for search
  const projectsData = projects.map(p => ({
    title: p.title,
    link: p.link,
    description: p.description,
    tags: p.tags || [],
    logo: p.logo,
    slug: p.slug,
    page: p.page,
    contributors: (p.contributors || []).map(c => c.login)
  }));
  
  fs.writeFileSync(
    path.join(OUT_DIR, 'projects.json'),
    JSON.stringify(projectsData, null, 2),
    'utf8'
  );

  // Generate sitemap
  const xml = create({ version: '1.0' })
    .ele('urlset', { xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9' });
  
  function addUrl(url, lastmod = new Date().toISOString(), priority = '0.5') {
    xml.ele('url')
      .ele('loc').txt(url).up()
      .ele('lastmod').txt(lastmod).up()
      .ele('priority').txt(priority).up()
      .up();
  }
  
  addUrl(`${SITE_URL}/`, new Date().toISOString(), '1.0');
  addUrl(`${SITE_URL}/projects/`, new Date().toISOString(), '0.8');
  
  for (const p of projects) {
    addUrl(`${SITE_URL}${p.page}`, new Date().toISOString(), '0.7');
  }
  
  fs.writeFileSync(path.join(OUT_DIR, 'sitemap.xml'), xml.end({ prettyPrint: true }), 'utf8');

  // Generate robots.txt
  const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml

# Optimize crawling
Crawl-delay: 1
`;
  fs.writeFileSync(path.join(OUT_DIR, 'robots.txt'), robotsTxt, 'utf8');

  console.log(`✅ Site generated successfully!`);
  console.log(`📊 Generated ${projects.length} projects in ${Object.keys(categories).length} categories`);
  console.log(`📁 Output directory: ${OUT_DIR}`);
}

// Run build if called directly
if (require.main === module) {
  build().catch(err => {
    console.error('❌ Build failed:', err);
    process.exit(1);
  });
}

module.exports = { build };