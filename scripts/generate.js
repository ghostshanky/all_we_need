const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');
const fetch = require('node-fetch');
const mkdirp = require('mkdirp');
const slugify = require('slugify');

// Configuration
const REPO_ROOT = process.cwd();
const PROJECTS_DIR = path.join(REPO_ROOT, 'projects');
const TEMPLATES_DIR = path.join(REPO_ROOT, 'templates');
const ASSETS_DIR = path.join(REPO_ROOT, 'assets'); // If any standard assets
const OUT_DIR = path.join(REPO_ROOT, 'docs');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

// Category Renaming Map
const categoryMap = {
  'ai': 'AI & Models',
  'utilities': 'Utilities & Tools',
  'media-tools': 'Media Downloaders',
  'developer-tools': 'Developer Productivity',
  'security': 'Security & Privacy',
  'education': 'Learning & Resources'
};

// Github API Headers
const HEADERS = GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {};

// Helpers
async function fetchJSON(url) {
  try {
    console.log(`Fetching ${url}...`);
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      console.warn(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`Error fetching ${url}:`, err.message);
    return null;
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) mkdirp.sync(dir);
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": "&#39;" }[s]));
}

function minifyHtml(html) {
  if (!html) return html;
  // Remove comments but keep google verification if present (just in case)
  return html.replace(/<!--(?![\s\S]*?google-site-verification)[\s\S]*?-->/g, '');
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

// -------------------------------------------------------------------------
// DATA FETCHING
// -------------------------------------------------------------------------

async function getRepoDetails(link) {
  if (!link || !link.includes('github.com')) return {};
  try {
    const u = new URL(link);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return {};
    const owner = parts[0];
    const repo = parts[1];

    // Fetch Repo Info for stars/forks (optional, but good for sorting)
    // Fetch Contributors
    const contributorsUrl = `https://api.github.com/repos/${owner}/${repo}/contributors?per_page=5`;
    const contributors = await fetchJSON(contributorsUrl) || [];

    // Fetch Repo Owner Avatar (logo fallback)
    const ownerUrl = `https://api.github.com/users/${owner}`;
    const ownerData = await fetchJSON(ownerUrl);

    return {
      contributors: contributors.map(c => ({ login: c.login, avatar_url: c.avatar_url, html_url: c.html_url })),
      ownerAvatar: ownerData ? ownerData.avatar_url : null,
      repoPath: `${owner}/${repo}`
    };
  } catch (e) {
    return {};
  }
}

async function getLeaderboardData() {
  const repo = 'ghostshanky/allweneed.github.io';
  const prsUrl = `https://api.github.com/repos/${repo}/pulls?state=closed&per_page=100&sort=updated&direction=desc`;

  const prs = await fetchJSON(prsUrl) || [];
  const mergedPrs = prs.filter(pr => pr.merged_at); // Only merged

  // Aggregate
  const stats = {}; // user -> { count, avatar, url, last_merged }

  mergedPrs.forEach(pr => {
    const user = pr.user;
    if (!stats[user.login]) {
      stats[user.login] = {
        login: user.login,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
        count: 0,
        merged_dates: []
      };
    }
    stats[user.login].count++;
    if (pr.merged_at) {
      stats[user.login].merged_dates.push(pr.merged_at);
    }
  });

  return Object.values(stats).sort((a, b) => b.count - a.count);
}

// -------------------------------------------------------------------------
// BUILD STEPS
// -------------------------------------------------------------------------

async function build() {
  console.log("Starting Build...");

  // 1. Prepare Output
  if (fs.existsSync(OUT_DIR)) {
    // fs.rmSync(OUT_DIR, { recursive: true, force: true }); // Careful deleting docs if it's the repo root sometimes
  }
  ensureDir(OUT_DIR);
  ensureDir(path.join(OUT_DIR, 'projects'));
  ensureDir(path.join(OUT_DIR, 'css')); // if needed

  // 2. Copy Templates/Assets
  const stylesSrc = path.join(TEMPLATES_DIR, 'styles.css');
  if (fs.existsSync(stylesSrc)) fs.copyFileSync(stylesSrc, path.join(OUT_DIR, 'styles.css'));

  const bgScriptSrc = path.join(TEMPLATES_DIR, 'background-manager.js');
  if (fs.existsSync(bgScriptSrc)) fs.copyFileSync(bgScriptSrc, path.join(OUT_DIR, 'background-manager.js'));

  // Copy local assets
  if (fs.existsSync(ASSETS_DIR)) {
    fs.readdirSync(ASSETS_DIR).forEach(f => {
      copyRecursiveSync(path.join(ASSETS_DIR, f), path.join(OUT_DIR, f));
    });
  }

  // Custom Scripts (Search, Animations)
  try { fs.copyFileSync(path.join(TEMPLATES_DIR, 'search.js'), path.join(OUT_DIR, 'search.js')); } catch (e) { }

  // Create js dir and copy animations
  ensureDir(path.join(OUT_DIR, 'js'));
  try { fs.copyFileSync(path.join(TEMPLATES_DIR, 'animations.js'), path.join(OUT_DIR, 'js', 'animations.js')); } catch (e) { }

  try { fs.copyFileSync(path.join(REPO_ROOT, 'logo.png'), path.join(OUT_DIR, 'logo.png')); } catch (e) { }
  try { fs.copyFileSync(path.join(REPO_ROOT, 'favicon.png'), path.join(OUT_DIR, 'favicon.png')); } catch (e) { }
  try { fs.copyFileSync(path.join(TEMPLATES_DIR, '404.html'), path.join(OUT_DIR, '404.html')); } catch (e) { }

  // Copy Google Verification HTML files
  const rootFiles = fs.readdirSync(REPO_ROOT);
  rootFiles.forEach(file => {
    if (file.startsWith('google') && file.endsWith('.html')) {
      try {
        fs.copyFileSync(path.join(REPO_ROOT, file), path.join(OUT_DIR, file));
        console.log(`Copied verification file: ${file}`);
      } catch (e) { console.warn(`Failed to copy ${file}`); }
    }
  });

  // 3. Process Projects
  const projectFiles = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.md'));
  const projects = [];

  const projectTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, 'project.html'), 'utf8');

  for (const file of projectFiles) {
    const raw = fs.readFileSync(path.join(PROJECTS_DIR, file), 'utf8');
    const { data, content } = matter(raw);

    const slug = slugify(data.title || path.basename(file, '.md'), { lower: true, strict: true });
    const htmlContent = marked(content);

    // Enhance with GitHub Data
    const ghDetails = await getRepoDetails(data.link);

    // Determine Logo
    let logo = data.logo; // Priority 1: Frontmatter

    if (!logo && ghDetails.ownerAvatar) {
      logo = ghDetails.ownerAvatar; // Priority 2: GitHub Owner
    }

    if (!logo && data.link && !data.link.includes('github.com')) {
      // Priority 3: Google Favicon Service for non-GitHub links
      try {
        const domain = new URL(data.link).hostname;
        logo = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
      } catch (e) {
        console.warn(`Could not extract domain from ${data.link}`);
      }
    }

    if (!logo) {
      logo = 'logo.png'; // Priority 4: Fallback (relative filename)
    }

    const project = {
      title: data.title,
      slug: slug,
      link: data.link,
      description: data.description,
      tags: data.tags || [],
      logo: logo,
      contributors: ghDetails.contributors || [],
      content: htmlContent,
      full_path: `projects/${slug}.html`, // Relative path for local navigation
      date: data.date || '2020-01-01', // Default to old date if missing
      filename: file
    };

    projects.push(project);

    // Generate Project Page
    let pHtml = projectTemplate
      .replace(/{{title}}/g, escapeHtml(project.title))
      .replace(/{{description}}/g, escapeHtml(project.description))
      .replace(/{{link}}/g, project.link)
      .replace('{{content}}', project.content);

    // Inject Logo (Handle relative paths for sub-directory)
    const isUrl = (str) => str.startsWith('http') || str.startsWith('//');
    const projectPageLogo = isUrl(project.logo) ? project.logo : `../${project.logo}`;

    const logoHtml = `<img src="${projectPageLogo}" alt="${project.title}" class="w-16 h-16 rounded-xl object-cover border border-neutral-800 bg-neutral-900">`;
    pHtml = pHtml.replace('{{logo_html}}', logoHtml);

    // Inject Tags
    const tagsHtml = project.tags.map(t => `<span class="px-3 py-1 text-xs font-mono border border-neutral-800 rounded-full text-neutral-400 bg-neutral-900">${t}</span>`).join('');
    pHtml = pHtml.replace('{{tags_html}}', tagsHtml);

    // Inject Contributors
    const contribsHtml = project.contributors.slice(0, 5).map(c => `
            <a href="${c.html_url}" target="_blank" title="${c.login}">
                <img src="${c.avatar_url}" class="w-8 h-8 rounded-full border-2 border-neutral-900 hover:scale-110 transition relative z-0 hover:z-10">
            </a>
        `).join('') || '<span class="text-neutral-500 text-sm italic">No data</span>';
    pHtml = pHtml.replace('{{contributors_html}}', contribsHtml);

    // Repo Button
    const repoBtn = ghDetails.repoPath
      ? `<a href="https://github.com/${ghDetails.repoPath}" target="_blank" class="px-6 py-3 border border-neutral-700 text-neutral-300 font-medium rounded-lg hover:border-white hover:text-white transition">View Repository</a>`
      : '';
    pHtml = pHtml.replace('{{repo_button}}', repoBtn);

    // SEO Injection
    const canonicalUrl = `https://allweneed.pages.dev/projects/${slug}.html`;
    pHtml = pHtml.replace('{{canonical_url}}', canonicalUrl);

    // Inject Screenshot
    let screenshotHtml = '';
    if (data.screenshot) {
      const isUrl = (str) => str.startsWith('http') || str.startsWith('//');
      // If it's a local asset, prefix with ../ since we are in projects/ subdir
      const screenshotSrc = isUrl(data.screenshot) ? data.screenshot : `../${data.screenshot}`;

      screenshotHtml = `
        <div class="max-w-4xl mx-auto px-6 mb-16 animate-fade-in">
            <div class="relative group rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-neutral-900">
                <img src="${screenshotSrc}" alt="${escapeHtml(project.title)} Screenshot" class="w-full h-auto object-cover">
                <div class="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-3xl pointer-events-none"></div>
            </div>
        </div>
      `;
    }
    pHtml = pHtml.replace('{{screenshot_html}}', screenshotHtml);

    const structuredData = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "SoftwareApplication",
          "name": project.title,
          "description": project.description,
          "applicationCategory": "DeveloperApplication",
          "operatingSystem": "Web",
          "url": project.link,
          "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD"
          },
          "author": {
            "@type": "Person",
            "name": project.contributors[0] ? project.contributors[0].login : "Community"
          }
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            {
              "@type": "ListItem",
              "position": 1,
              "name": "Home",
              "item": "https://allweneed.pages.dev/"
            },
            {
              "@type": "ListItem",
              "position": 2,
              "name": "Projects",
              "item": "https://allweneed.pages.dev/projects/"
            },
            {
              "@type": "ListItem",
              "position": 3,
              "name": project.title,
              "item": canonicalUrl
            }
          ]
        }
      ]
    };
    pHtml = pHtml.replace('{{structured_data}}', JSON.stringify(structuredData));

    fs.writeFileSync(path.join(OUT_DIR, 'projects', `${slug}.html`), minifyHtml(pHtml));
  }

  // 4. Generate Index HTML
  const indexTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, 'index.html'), 'utf8');
  let indexHtml = indexTemplate;

  // Group by Tags and Sort by Count
  const tagsMap = {};
  projects.forEach(p => {
    p.tags.forEach(t => {
      if (!tagsMap[t]) tagsMap[t] = [];
      tagsMap[t].push(p);
    });
  });

  // Sort ALL tags by count
  const allSortedTags = Object.entries(tagsMap)
    .sort((a, b) => b[1].length - a[1].length);

  // --- NEW: Newly Added Section ---
  // Sort projects by creation time (newest first)
  let sortedByDate = [...projects].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Pin Viral Hooks (Oxaam and SSYouTube)
  const pinnedSlugs = ['unsplash', 'oxaam', 'ssyoutube'];
  const pinnedProjects = [];

  // Extract pinned projects
  for (const slug of pinnedSlugs) {
    const idx = sortedByDate.findIndex(p => p.filename.replace('.md', '').toLowerCase() === slug);
    if (idx !== -1) {
      pinnedProjects.push(sortedByDate[idx]);
      sortedByDate.splice(idx, 1);
    }
  }

  // Combine pinned + rest
  sortedByDate = [...pinnedProjects, ...sortedByDate].slice(0, 5); // display top 5

  let newlyAddedHtml = `
      <div class="mb-32">
          <div class="text-center mb-12">
               <h3 class="text-2xl font-mono uppercase tracking-widest text-white mb-2">// Newly Added</h3>
               <p class="text-neutral-500 text-sm">Fresh from the community pipeline</p>
          </div>

          <div class="flex overflow-x-auto gap-6 pb-8 snap-x snap-mandatory scrollbar-hide px-6">
              ${sortedByDate.map(p => {
    const isOxaam = p.filename.includes('oxaam');
    const glowClass = isOxaam ? 'border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.2)]' : 'border-white/5';
    const titleColor = isOxaam ? 'text-amber-400' : 'text-white';

    return `
                  <a href="${p.full_path}" class="block p-1 rounded-2xl relative group hover:scale-[1.02] transition-transform duration-500 w-[280px] shrink-0 snap-start">
                      <!-- Gradient Border Effect -->
                      <div class="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl opacity-50 group-hover:opacity-100 transition-opacity"></div>
                      
                      <div class="bg-neutral-900/90 backdrop-blur-xl h-full rounded-xl p-6 relative z-10 border ${glowClass} flex flex-col gap-4">
                          <div class="flex justify-between items-start">
                              <img src="${p.logo}" alt="${escapeHtml(p.title)}" class="w-10 h-10 rounded-lg bg-neutral-950 object-cover border border-white/10">
                              <span class="text-[10px] font-bold bg-white text-black px-2 py-0.5 rounded-full uppercase tracking-wider">New</span>
                          </div>
                          
                          <div>
                              <h4 class="text-lg font-bold ${titleColor} mb-1 group-hover:text-amber-300 transition-colors">${escapeHtml(p.title)}</h4>
                              <p class="text-neutral-400 text-xs line-clamp-2">${escapeHtml(p.description)}</p>
                          </div>

                          <div class="flex flex-wrap gap-1 mt-auto">
                              ${p.tags.slice(0, 2).map(t => `<span class="text-[10px] px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-400 border border-white/5">#${t}</span>`).join('')}
                          </div>
                      </div>
                  </a>
              `}).join('')}
          </div>
      </div>
  `;

  indexHtml = indexHtml.replace('<!-- newly_added injected by JS -->', newlyAddedHtml);

  // Top 5 for Main Display
  const topTags = allSortedTags.slice(0, 5);

  // View More: Remaining Tags (n-5)
  const remainingTags = allSortedTags.slice(5);

  let projectsHtml = '';

  // Generate Main Cards for Top 5
  for (const [tag, group] of topTags) {
    projectsHtml += `
         <div class="mb-32 group/section scroll-mt-24" id="${tag}">
            <div class="flex items-center justify-between mb-8 border-b border-neutral-900 pb-4">
                <h3 class="text-xl font-mono uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                    // ${escapeHtml(categoryMap[tag] || tag)}
                </h3>
                
                <!-- Navigation Arrows -->
                <div class="flex items-center gap-2">
                    <button onclick="document.getElementById('scroll-${tag}').scrollBy({left: -350, behavior: 'smooth'})" 
                            class="w-8 h-8 flex items-center justify-center rounded-full border border-neutral-800 text-neutral-500 hover:text-white hover:border-white hover:bg-white/10 transition-all active:scale-95">
                        &lt;
                    </button>
                    <button onclick="document.getElementById('scroll-${tag}').scrollBy({left: 350, behavior: 'smooth'})" 
                            class="w-8 h-8 flex items-center justify-center rounded-full border border-neutral-800 text-neutral-500 hover:text-white hover:border-white hover:bg-white/10 transition-all active:scale-95">
                        &gt;
                    </button>
                </div>
            </div>
            
            <div id="scroll-${tag}" class="flex overflow-x-auto gap-6 pb-8 snap-x snap-mandatory transition-all duration-500 scrollbar-hide" style="max-height: 2000px; opacity: 1;">
         `;

    group.forEach(p => {
      projectsHtml += `
             <a href="${p.full_path}" class="glass-card block p-8 rounded-3xl relative overflow-hidden group reveal-stagger hover:scale-[1.02] transition-transform duration-500 w-[300px] md:w-[350px] shrink-0 snap-center h-full flex flex-col justify-between">
                <div class="flex justify-between items-start mb-6">
                     <!-- Randomly beautiful favicon logic: Just ensure it pops -->
                     <img src="${p.logo}" alt="${escapeHtml(p.title)} Logo" class="w-12 h-12 rounded-xl object-cover bg-neutral-900 shadow-lg group-hover:shadow-white/10 transition-all duration-500 group-hover:rotate-6 group-hover:scale-110">
                     <svg class="w-6 h-6 text-neutral-700 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                </div>
                <h4 class="text-2xl font-bold mb-2 group-hover:text-white transition-colors tracking-tight">${escapeHtml(p.title)}</h4>
                <p class="text-neutral-500 text-sm leading-relaxed mb-6 line-clamp-2 h-10">${escapeHtml(p.description)}</p>
                
                <div class="flex items-center justify-between border-t border-white/5 pt-4">
                    <span class="text-xs font-mono text-neutral-600">By ${p.contributors[0] ? p.contributors[0].login : 'Community'}</span>
                    <div class="flex -space-x-2 opacity-50 group-hover:opacity-100 transition-opacity">
                         ${p.contributors.slice(0, 3).map(c => `<img src="${c.avatar_url}" alt="${c.login} Avatar" class="w-6 h-6 rounded-full border border-neutral-900">`).join('')}
                    </div>
                </div>
             </a>
             `;
    });

    projectsHtml += `</div></div>`;
  }

  // Generate "Explore More" Section for Remaining Tags
  if (remainingTags.length > 0) {
    projectsHtml += `
      <div class="mb-32 group/section scroll-mt-24">
          <div class="flex items-center justify-between mb-8 border-b border-neutral-900 pb-4">
              <h3 class="text-xl font-mono uppercase tracking-widest text-neutral-400">
                  // Explore More Categories
              </h3>
               <div class="flex items-center gap-2">
                    <button onclick="document.getElementById('more-tags').scrollBy({left: -350, behavior: 'smooth'})" 
                            class="w-8 h-8 flex items-center justify-center rounded-full border border-neutral-800 text-neutral-500 hover:text-white hover:border-white hover:bg-white/10 transition-all active:scale-95">
                        &lt;
                    </button>
                    <button onclick="document.getElementById('more-tags').scrollBy({left: 350, behavior: 'smooth'})" 
                            class="w-8 h-8 flex items-center justify-center rounded-full border border-neutral-800 text-neutral-500 hover:text-white hover:border-white hover:bg-white/10 transition-all active:scale-95">
                        &gt;
                    </button>
                </div>
          </div>

          <div id="more-tags" class="flex overflow-x-auto gap-6 pb-8 transition-all duration-500 scrollbar-hide" data-auto-scroll="true">
              ${[...remainingTags, ...remainingTags, ...remainingTags, ...remainingTags].map(([tag, group]) => `
                  <a href="projects/index.html" class="glass-card block p-6 rounded-3xl relative overflow-hidden group hover:scale-[1.05] transition-transform duration-500 w-[240px] shrink-0 flex flex-col gap-4 border border-white/5 bg-neutral-950/20">
                      <div class="flex justify-between items-center">
                          <span class="font-mono text-base text-white font-bold uppercase tracking-wider truncate">#${escapeHtml(tag)}</span>
                          <span class="text-xs text-neutral-500 font-mono bg-neutral-900 px-2 py-1 rounded">${group.length}</span>
                      </div>
                      
                      <!-- Icon Collage -->
                      <div class="grid grid-cols-4 gap-2 pt-2">
                          ${group.slice(0, 8).map(p => `
                              <img src="${p.logo}" 
                                   alt="${escapeHtml(p.title)} Logo"
                                   class="w-8 h-8 rounded-md bg-neutral-900 object-cover opacity-50 group-hover:opacity-100 transition-opacity duration-300"
                                   title="${escapeHtml(p.title)}">
                          `).join('')}
                          ${group.length > 8 ? `<div class="w-8 h-8 rounded-md bg-neutral-900 flex items-center justify-center text-[10px] text-neutral-500 font-mono">+${group.length - 8}</div>` : ''}
                      </div>

                      <div class="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                  </a>
              `).join('')}
          </div>
      </div>
      `;
  }

  indexHtml = indexHtml.replace('<!-- projects injected by JS -->', projectsHtml);

  // Inject Weekly Contributors (To Home)
  // For now, let's use the leaderboard data
  const leaderboard = await getLeaderboardData();
  // 4. Generate Top Contributors Stack (Top 7)
  const topContributors = leaderboard.slice(0, 7);
  const stackHtml = topContributors.map(c => `
    <a href="${c.html_url}" target="_blank" class="avatar-item relative w-16 h-16 rounded-full border-2 border-neutral-950 overflow-hidden transition-all duration-300">
        <img src="${c.avatar_url}" alt="${c.login}" class="w-full h-full object-cover">
    </a>
  `).join('');

  // Inject into Index
  indexHtml = indexHtml.replace(/<!-- injected avatars.*?-->[\s\S]*?<\/div>/, `${stackHtml}</div>`); // ensure variable name matches usage

  // Calculate Real Stats
  const totalProjects = projects.length;
  // Use leaderboard for contributors count
  const totalContributors = leaderboard.length;
  // Calculate total merges (PRs)
  const totalPRs = leaderboard.reduce((acc, c) => acc + c.count, 0);

  // Replace Stats in Index HTML (Targeting specific dummy values from template)
  // Template values: 104 (Projects), 42 (Contributors), 850 (PRs)
  indexHtml = indexHtml.replace(/data-target="104"/g, `data-target="${totalProjects}"`);
  indexHtml = indexHtml.replace(/data-target="42"/g, `data-target="${totalContributors}"`);
  indexHtml = indexHtml.replace(/data-target="850"/g, `data-target="${totalPRs}"`);

  // Inject Global Data for Search (Avoids Fetch/CORS issues)
  const dataScript = `
    <script>
      window.ALL_PROJECTS = ${JSON.stringify(projects)};
      window.LEADERBOARD = ${JSON.stringify(leaderboard)};
    </script>
  `;
  indexHtml = indexHtml.replace('</body>', `${dataScript}</body>`);

  // HIGHLIGHT ACTIVE LINK: HOME
  const baseLinkClass = 'hover:text-white transition-colors duration-300';
  const activeLinkClass = 'text-white font-bold hover:text-white transition-colors duration-300';

  // Mobile Classes (Updated for "Solid Dark" Menu)
  // Mobile Classes (Updated for "Inspired" Menu - Targeting Inner Span)
  // Mobile Classes (Updated for "Inspired V2" Menu - Targeting Inner Span)
  // Mobile Classes (Updated for "Right Drawer" Menu)
  const mobileBaseClass = 'mobile-link text-xl font-mono text-neutral-400 hover:text-white transition-colors tracking-wide';
  const mobileActiveClass = 'mobile-link text-xl font-mono text-white transition-colors tracking-wide';

  // WRITE INDEX.HTML
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), minifyHtml(indexHtml));

  // -------------------------------------------------------------------------
  // 5. Generate Projects Index (projects/index.html) - CLEAN REBUILD
  // -------------------------------------------------------------------------

  // Generate HTML for ALL sections (using allSortedTags) - MUST BE DEFINED BEFORE USAGE
  const allProjectsGrid = allSortedTags.map(([tag, group]) => `
         <div class="mb-32 group/section scroll-mt-24" id="${escapeHtml(tag)}">
             <div class="flex items-center justify-between mb-8 border-b border-neutral-900 pb-4">
                 <h3 class="text-xl font-mono uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                     // ${escapeHtml(tag)}
                 </h3>
                 <span class="text-xs font-mono text-neutral-600 bg-neutral-900 px-3 py-1 rounded-full">${group.length} items</span>
             </div>
             
              <div class="flex overflow-x-auto gap-8 pb-12 snap-x snap-mandatory scrollbar-hide -mx-6 px-6 relative" id="scroll-${tag}">
              ${group.map(p => `
              <a href="${p.full_path.replace('projects/', '')}" class="glass-card block p-8 rounded-3xl relative overflow-hidden group reveal-stagger hover:scale-[1.02] transition-transform duration-500 w-[300px] md:w-[350px] shrink-0 snap-center h-full flex flex-col justify-between">
                 <div class="flex justify-between items-start mb-6">
                      <img src="${p.logo}" alt="${escapeHtml(p.title)} Logo" class="w-12 h-12 rounded-xl object-cover bg-neutral-900 shadow-lg group-hover:shadow-white/10 transition-all duration-500 group-hover:rotate-6 group-hover:scale-110">
                      <svg class="w-6 h-6 text-neutral-700 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                 </div>
                 <h4 class="text-2xl font-bold mb-2 group-hover:text-white transition-colors tracking-tight">${escapeHtml(p.title)}</h4>
                 <p class="text-neutral-500 text-sm leading-relaxed mb-6 line-clamp-2 h-10">${escapeHtml(p.description)}</p>
                 
                 <div class="flex items-center justify-between border-t border-white/5 pt-4">
                     <span class="text-xs font-mono text-neutral-600">By ${p.contributors[0] ? p.contributors[0].login : 'Community'}</span>
                     <div class="flex -space-x-2 opacity-50 group-hover:opacity-100 transition-opacity">
                          ${p.contributors.slice(0, 3).map(c => `<img src="${c.avatar_url}" alt="${c.login} Avatar" class="w-6 h-6 rounded-full border border-neutral-900">`).join('')}
                     </div>
                 </div>
              </a>
              `).join('')}
              </div>
          </div>
   `).join('');

  // Use Leaderboard Template as the base (Matches User Request for consistent Header/Background)
  let projectsTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, 'leaderboard.html'), 'utf8');
  let projectsIndexHtml = projectsTemplate;

  projectsIndexHtml = projectsIndexHtml
    .replace('<title>Leaderboard — All We Need</title>', '<title>Projects — All We Need</title>')
    .replace('Leaderboard — All We Need', 'Projects — All We Need');

  // Fix Relative Paths for Subdirectory
  projectsIndexHtml = projectsIndexHtml
    .replace(/href="styles.css"/g, 'href="../styles.css"')
    .replace(/src="search.js"/g, 'src="../search.js"')
    .replace(/src="js\/animations.js"/g, 'src="../js/animations.js"')
    .replace(/href="index.html"/g, 'href="../index.html"')
    .replace(/href="projects\/index.html"/g, 'href="index.html"')
    .replace(/href="leaderboard.html"/g, 'href="../leaderboard.html"')
    .replace(/href="about.html"/g, 'href="../about.html"')
    .replace(/src="logo.png"/g, 'src="../logo.png"')
    .replace(/href="favicon.png"/g, 'href="../favicon.png"');

  // Highlight PROJECTS (Desktop) & Mobile
  // Since we use LEADERBOARD base, it has "Leaderboard" active. We must unset it and set "Projects".
  // Note: "Projects" link now points to "index.html" (as fixed above: projects/index.html -> index.html).

  projectsIndexHtml = projectsIndexHtml.replace(`${activeLinkClass}">Leaderboard`, `${baseLinkClass}">Leaderboard`); // Unset Leaderboard Desktop
  projectsIndexHtml = projectsIndexHtml.replace(`${mobileActiveClass}">Leaderboard`, `${mobileBaseClass}">Leaderboard`); // Unset Leaderboard Mobile

  // Set Projects Active (Desktop)
  projectsIndexHtml = projectsIndexHtml.replace(`href="index.html" class="${baseLinkClass}">Projects`, `href="index.html" class="${activeLinkClass}">Projects`);
  // Set Projects Active (Mobile)
  projectsIndexHtml = projectsIndexHtml.replace(`href="index.html" class="${mobileBaseClass}">Projects`, `href="index.html" class="${mobileActiveClass}">Projects`);

  // INJECT GLOBAL VIDEO
  // Uses user-provided CloudFront Signed URL (Note: This will expire!)
  const newVideoUrl = "https://d3v55qvjb2v012.cloudfront.net/C0IV/2025/12/22/13/00/cTl3IcnYKZI/sc.mp4?&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9kM3Y1NXF2amIydjAxMi5jbG91ZGZyb250Lm5ldC9DMElWLzIwMjUvMTIvMjIvMTMvMDAvY1RsM0ljbllLWkkvc2MubXA0PyIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc2NjQwOTIxNH19fV19&Signature=QebcC3Ifq33OKeQXLgEDb1ttjVyzV3nuw6S~tO0jG4SfGBJFvh5jxXJDWy8t9IKHA~urh~P7LfwUtrM1USfo-RQt76LMsKkAZkjwfV3rlEt4ySsjgtRLA7Wb3YAbPo9HlKmY3Z~6x6bHUHI0QLw64iz1hd1QUWwOPaZAh79Uim0_&Key-Pair-Id=APKAI4E2RN57D46ONMEQ";

  // Replace the src and ensure autoplay is present
  // Matches previous injection or the original Vimeo link
  projectsIndexHtml = projectsIndexHtml.replace(
    /src="https:\/\/player\.vimeo\.com\/.*?"(?: autoplay)?/,
    `src="${newVideoUrl}" autoplay`
  );

  // Ensure Opacity is lower to make it darker (User Request)
  // Was 1.0, changing to 0.4 to match "other videos" / darker aesthetic
  projectsIndexHtml = projectsIndexHtml.replace('data-opacity="0.8"', 'style="opacity: 0.4 !important;"');


  // REPLACE MAIN CONTENT
  // Leaderboard template has <main ...> ... </main>
  // We replace it with the Projects Header + Grid.

  const projectsMainHtml = `
    <main class="max-w-7xl mx-auto px-6 pt-40 pb-20 min-h-screen animate-fade-in relative z-10">
        <div class="text-center mb-16">
            <h1 class="text-4xl md:text-5xl font-bold tracking-tightest mb-4">Projects</h1>
            <p class="text-neutral-500 font-mono text-sm uppercase tracking-widest">Curated Engineering Excellence</p>
        </div>
        
        <div class="space-y-20">
            ${allProjectsGrid}
        </div>
    </main>
  `;

  projectsIndexHtml = projectsIndexHtml.replace(/<main[\s\S]*?<\/main>/, projectsMainHtml);

  ensureDir(path.join(OUT_DIR, 'projects'));
  fs.writeFileSync(path.join(OUT_DIR, 'projects', 'index.html'), minifyHtml(projectsIndexHtml));


  // -------------------------------------------------------------------------
  // 6. Generate About Page
  // -------------------------------------------------------------------------
  projectsIndexHtml = projectsIndexHtml.replace('<title>All We Need — curated for devs</title>', '<title>Projects — All We Need</title>');

  // STRIP HOME SECTIONS (Hero, Stats, Narrative, Weekly Contributors)




  // -------------------------------------------------------------------------
  // 6. Generate About Page (Dynamic Grid)
  // -------------------------------------------------------------------------
  let aboutHtml = fs.readFileSync(path.join(TEMPLATES_DIR, 'about.html'), 'utf-8');

  // Generate Community Grid HTML
  const communityGridHtml = leaderboard.map(c => `
    <div class="relative group">
        <a href="${c.html_url}" target="_blank">
            <img src="${c.avatar_url}" 
                class="w-10 h-10 rounded-full border border-neutral-800 grayscale group-hover:grayscale-0 group-hover:border-white transition-all duration-300 transform group-hover:scale-110 cursor-pointer object-cover bg-neutral-900">
        </a>
        <!-- Tooltip -->
        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-neutral-900 border border-white/10 rounded-lg text-[10px] font-mono text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-20 shadow-xl translate-y-2 group-hover:translate-y-0">
            ${c.login}
        </div>
    </div>
  `).join('');

  // Inject Data
  aboutHtml = aboutHtml.replace('{{community_grid}}', communityGridHtml);
  aboutHtml = aboutHtml.replace('${total_contributors}', leaderboard.length);

  // Highlight ABOUT
  aboutHtml = aboutHtml.replace(`href="about.html" class="${baseLinkClass}"`, `href="about.html" class="${activeLinkClass}"`);
  aboutHtml = aboutHtml.replace(`href="about.html" class="${mobileBaseClass}"`, `href="about.html" class="${mobileActiveClass}"`);
  fs.writeFileSync(path.join(OUT_DIR, 'about.html'), minifyHtml(aboutHtml));

  // 6. Generate Leaderboard HTML
  const leaderboardTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, 'leaderboard.html'), 'utf8');
  let lbHtml = leaderboardTemplate;

  let lgRows = leaderboard.map((c, i) => `
        <tr class="hover:bg-white/5 transition group">
            <td class="px-6 py-6 text-neutral-500 font-mono text-xs">${i + 1 < 10 ? '0' + (i + 1) : i + 1}</td>
            <td class="px-6 py-6 flex items-center gap-4">
                <img src="${c.avatar_url}" class="w-10 h-10 rounded-full border border-neutral-800 grayscale group-hover:grayscale-0 transition-all">
                <a href="${c.html_url}" target="_blank" class="font-medium text-neutral-300 group-hover:text-white transition-colors">${c.login}</a>
            </td>
            <td class="px-6 py-6 text-right font-mono text-neutral-500 group-hover:text-white transition-colors">${c.count}</td>
        </tr>
    `).join('');

  lbHtml = lbHtml.replace('{{leaderboard_rows}}', lgRows);

  // Highlight LEADERBOARD
  const lbBaseLinkClass = 'hover:text-white transition-colors duration-300';
  const lbActiveLinkClass = 'text-white font-bold hover:text-white transition-colors duration-300';
  lbHtml = lbHtml.replace(`href="leaderboard.html" class="${lbBaseLinkClass}"`, `href="leaderboard.html" class="${lbActiveLinkClass}"`);

  // Mobile Highlight (Updated for Solid Dark Menu)
  // Mobile Highlight (Updated for Inspired Menu)
  // Mobile Highlight (Updated for Inspired V2 Menu)
  // Mobile Highlight (Updated for "Right Drawer" Menu)
  const lbMobileBase = 'mobile-link text-xl font-mono text-neutral-400 hover:text-white transition-colors tracking-wide';
  const lbMobileActive = 'mobile-link text-xl font-mono text-white transition-colors tracking-wide';
  lbHtml = lbHtml.replace(`href="leaderboard.html" class="${lbMobileBase}"`, `href="leaderboard.html" class="${lbMobileActive}"`);

  lbHtml = lbHtml.replace('{{active_all}}', 'text-white font-bold'); // Default

  fs.writeFileSync(path.join(OUT_DIR, 'leaderboard.html'), minifyHtml(lbHtml));

  // 6. JSON Outputs
  fs.writeFileSync(path.join(OUT_DIR, 'projects.json'), JSON.stringify(projects, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'leaderboard.json'), JSON.stringify(leaderboard, null, 2));

  // 7. Generate Sitemap
  // 7. Generate Sitemap
  console.log("Generating Sitemap...");
  const baseUrl = "https://allweneed.pages.dev";
  // Use YYYY-MM-DD format for wider compatibility
  const today = new Date().toISOString().split('T')[0];

  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${today}</lastmod>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/projects/</loc>
    <lastmod>${today}</lastmod>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/leaderboard.html</loc>
    <lastmod>${today}</lastmod>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/about.html</loc>
    <lastmod>${today}</lastmod>
    <priority>0.8</priority>
  </url>`;

  projects.forEach(p => {
    // p.full_path is 'projects/slug.html'
    // We keep extension for files, but if you want clean URLs for projects, verify server support.
    // GitHub Pages / Cloudflare Pages usually support clean URLs if .html exists.
    // Let's keep .html for leaf pages to be safe, but root/index should be clean.
    sitemap += `
  <url>
    <loc>${baseUrl}/${p.full_path}</loc>
    <lastmod>${today}</lastmod>
    <priority>0.7</priority>
  </url>`;
  });

  sitemap += `
</urlset>`;

  fs.writeFileSync(path.join(OUT_DIR, 'sitemap.xml'), sitemap);
  // Also copy robots.txt to output
  try { fs.copyFileSync(path.join(REPO_ROOT, 'robots.txt'), path.join(OUT_DIR, 'robots.txt')); } catch (e) { console.warn("robots.txt not found"); }

  console.log("Build Complete!");
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
