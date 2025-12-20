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
      full_path: `projects/${slug}.html` // Relative path for local navigation
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

    fs.writeFileSync(path.join(OUT_DIR, 'projects', `${slug}.html`), pHtml);
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
                    // ${escapeHtml(tag)}
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
                     <img src="${p.logo}" class="w-12 h-12 rounded-xl object-cover bg-neutral-900 shadow-lg group-hover:shadow-white/10 transition-all duration-500 group-hover:rotate-6 group-hover:scale-110">
                     <svg class="w-6 h-6 text-neutral-700 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                </div>
                <h4 class="text-2xl font-bold mb-2 group-hover:text-white transition-colors tracking-tight">${escapeHtml(p.title)}</h4>
                <p class="text-neutral-500 text-sm leading-relaxed mb-6 line-clamp-2 h-10">${escapeHtml(p.description)}</p>
                
                <div class="flex items-center justify-between border-t border-white/5 pt-4">
                    <span class="text-xs font-mono text-neutral-600">By ${p.contributors[0] ? p.contributors[0].login : 'Community'}</span>
                    <div class="flex -space-x-2 opacity-50 group-hover:opacity-100 transition-opacity">
                         ${p.contributors.slice(0, 3).map(c => `<img src="${c.avatar_url}" class="w-6 h-6 rounded-full border border-neutral-900">`).join('')}
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

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), indexHtml);


  // -------------------------------------------------------------------------
  // 5. Generate Projects Index (projects/index.html) - ALL TAGS VISIBLE
  // -------------------------------------------------------------------------

  // Reuse indexHtml as base, but replace the content area with the FULL list
  let projectsIndexHtml = indexHtml;

  // Fix Relative Paths for Subdirectory
  projectsIndexHtml = projectsIndexHtml
    .replace(/href="styles.css"/g, 'href="../styles.css"')
    .replace(/src="search.js"/g, 'src="../search.js"')
    .replace(/src="js\/animations.js"/g, 'src="../js/animations.js"')
    .replace(/href="index.html"/g, 'href="../index.html"')
    .replace(/href="projects\/index.html"/g, 'href="index.html"')
    .replace(/href="projects\/index.html"/g, 'href="index.html"')
    .replace(/href="leaderboard.html"/g, 'href="../leaderboard.html"')
    .replace(/href="about.html"/g, 'href="../about.html"')
    .replace(/href="projects\//g, 'href="') // Fix project links
    .replace(/src="logo.png"/g, 'src="../logo.png"');

  // Change Title
  projectsIndexHtml = projectsIndexHtml.replace('<title>All We Need — curated for devs</title>', '<title>Projects — All We Need</title>');

  // -------------------------------------------------------------------------
  // 6. Generate About Page (Simple Copy)
  // -------------------------------------------------------------------------
  const aboutHtml = fs.readFileSync(path.join(TEMPLATES_DIR, 'about.html'), 'utf-8');
  fs.writeFileSync(path.join(OUT_DIR, 'about.html'), aboutHtml);

  // Generate HTML for ALL sections (using allSortedTags)
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
                     <img src="${p.logo}" class="w-12 h-12 rounded-xl object-cover bg-neutral-900 shadow-lg group-hover:shadow-white/10 transition-all duration-500 group-hover:rotate-6 group-hover:scale-110">
                     <svg class="w-6 h-6 text-neutral-700 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                </div>
                <h4 class="text-2xl font-bold mb-2 group-hover:text-white transition-colors tracking-tight">${escapeHtml(p.title)}</h4>
                <p class="text-neutral-500 text-sm leading-relaxed mb-6 line-clamp-2 h-10">${escapeHtml(p.description)}</p>
                
                <div class="flex items-center justify-between border-t border-white/5 pt-4">
                    <span class="text-xs font-mono text-neutral-600">By ${p.contributors[0] ? p.contributors[0].login : 'Community'}</span>
                    <div class="flex -space-x-2 opacity-50 group-hover:opacity-100 transition-opacity">
                         ${p.contributors.slice(0, 3).map(c => `<img src="${c.avatar_url}" class="w-6 h-6 rounded-full border border-neutral-900">`).join('')}
                    </div>
                </div>
             </a>
             `).join('')}
             </div>
         </div>
  `).join('');

  // Replace Hero
  // Inject Fullscreen Background (Leaderboard Style)
  // Inject Fullscreen Background (Leaderboard Style)
  const fullscreenBg = `
    <!-- Layer 2-5: Cinematic BG (Fullscreen Fixed) -->
    <div class="cinematic-bg fixed top-0 left-0 w-full h-full z-0">
        <img src="https://cdn.prod.website-files.com/68e3c26f7edb22bc9e5314b2/68e7e742b6fb64146d029e04_drone-static-render-01-p-2000.jpg"
            class="cinematic-fallback" alt="Background">
        <!-- Titan Video -->
        <video class="cinematic-video"
            src="https://player.vimeo.com/progressive_redirect/playback/1125885665/rendition/1080p/file.mp4?loc=external&signature=91ed1c37b465ed963ab425e7997235d66b2aeaf48146a96806b383bb2e2f0c4a"
            preload="auto" muted loop playsinline autoplay style="opacity: 1 !important; filter: none !important;"></video>
        <div class="cinematic-overlay"></div>
        <div class="absolute inset-0 bg-neutral-950/80"></div>
    </div>
  `;
  // Insert after body tag (approximate)
  if (projectsIndexHtml.includes('<div class="noise-overlay"></div>')) {
    projectsIndexHtml = projectsIndexHtml.replace('<div class="noise-overlay"></div>', '<div class="noise-overlay"></div>' + fullscreenBg);
  } else {
    projectsIndexHtml = projectsIndexHtml.replace('<body class="bg-neutral-950 text-neutral-100 antialiased">', '<body class="bg-neutral-950 text-neutral-100 antialiased">' + fullscreenBg);
  }

  // Ensure Body/Main content sits ABOVE the video
  projectsIndexHtml = projectsIndexHtml.replace('<main', '<main class="relative z-10"'); // If main exists
  projectsIndexHtml = projectsIndexHtml.replace('id="projects"', 'id="projects" class="relative z-10"'); // Ensure projects container is above
  projectsIndexHtml = projectsIndexHtml.replace('<footer class="', '<footer class="relative z-10 '); // Ensure footer is above

  // Replace Hero (Transparent, no video inside)
  projectsIndexHtml = projectsIndexHtml.replace(/<section id="hero"[\s\S]*?<\/section>/, `
    <section class="relative z-10 max-w-7xl mx-auto px-6 pt-40 pb-32 text-center overflow-hidden min-h-[40vh] flex flex-col justify-center items-center border-b border-white/5 bg-transparent">
        <h1 class="text-5xl md:text-7xl font-bold tracking-tight mb-4 relative z-20 bg-clip-text text-transparent bg-gradient-to-b from-white via-white/90 to-white/50">All Projects</h1>
        <p class="text-neutral-500 font-mono text-sm uppercase tracking-widest relative z-20">Curated Resources</p>
    </section>
  `);

  // Remove Stats & Narrative
  projectsIndexHtml = projectsIndexHtml.replace(/<section id="stats"[\s\S]*?<\/section>/, '');
  projectsIndexHtml = projectsIndexHtml.replace(/<section id="narrative"[\s\S]*?<\/section>/, '');
  projectsIndexHtml = projectsIndexHtml.replace(/<section id="contributors-section"[\s\S]*?<\/section>/, '');

  // Inject Full Grid
  // Replaces the existing projects section (which only has top 5 or placeholder) with the FULL list
  projectsIndexHtml = projectsIndexHtml.replace(
    /<section id="projects"[\s\S]*?<\/section>/,
    `<section id="projects" class="max-w-7xl mx-auto px-6 py-32 min-h-screen">
            ${allProjectsGrid}
        </section>`
  );

  ensureDir(path.join(OUT_DIR, 'projects'));
  fs.writeFileSync(path.join(OUT_DIR, 'projects', 'index.html'), projectsIndexHtml);


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

  // Simple filter handling (Active Class) - strictly handling "All" for simpler build
  // For real filtering we'd need multiple files or JS. The template has JS hook. 
  lbHtml = lbHtml.replace('{{active_all}}', 'text-white font-bold'); // Default

  fs.writeFileSync(path.join(OUT_DIR, 'leaderboard.html'), lbHtml);

  // 6. JSON Outputs
  fs.writeFileSync(path.join(OUT_DIR, 'projects.json'), JSON.stringify(projects, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'leaderboard.json'), JSON.stringify(leaderboard, null, 2));

  console.log("Build Complete!");
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
