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
  // Current Repo logic for leaderboard
  // We want merged PRs to THIS repo: ghostshanky/allweneed.github.io
  // This might be rate limited if we fetch too many.
  // For now, let's fetch the last 100 PRs and aggregate.
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

  // Copy search.js if in templates, else we need to create it
  // The user provided search.js in doc implies it exists in root or assets.
  // I will write search.js in next step to templates or assets using write_to_file
  // For now assuming it is in templates
  const searchJsSrc = path.join(TEMPLATES_DIR, 'search.js');
  if (fs.existsSync(searchJsSrc)) fs.copyFileSync(searchJsSrc, path.join(OUT_DIR, 'search.js'));

  // Copy branding
  if (fs.existsSync(path.join(REPO_ROOT, 'logo.png'))) fs.copyFileSync(path.join(REPO_ROOT, 'logo.png'), path.join(OUT_DIR, 'logo.png'));

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

    const project = {
      title: data.title,
      slug: slug,
      link: data.link,
      description: data.description,
      tags: data.tags || [],
      logo: data.logo || ghDetails.ownerAvatar || '/logo.png', // Priority: Frontmatter -> GitHub Owner -> Fallback
      contributors: ghDetails.contributors || [],
      content: htmlContent,
      full_path: `/projects/${slug}.html`
    };

    projects.push(project);

    // Generate Project Page
    let pHtml = projectTemplate
      .replace(/{{title}}/g, escapeHtml(project.title))
      .replace(/{{description}}/g, escapeHtml(project.description))
      .replace(/{{link}}/g, project.link)
      .replace('{{content}}', project.content);

    // Inject Logo
    const logoHtml = `<img src="${project.logo}" alt="${project.title}" class="w-16 h-16 rounded-xl object-cover border border-neutral-800">`;
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

  // Group by Tags
  const tagsMap = {};
  projects.forEach(p => {
    p.tags.forEach(t => {
      if (!tagsMap[t]) tagsMap[t] = [];
      tagsMap[t].push(p);
    });
  });

  let projectsHtml = '';
  for (const [tag, group] of Object.entries(tagsMap)) {
    projectsHtml += `
         <div class="mb-16 group/section">
            <div class="flex items-center justify-between mb-6">
                <h3 class="text-2xl font-semibold capitalize text-neutral-200 flex items-center gap-2">
                    <span class="text-blue-500">#</span> ${escapeHtml(tag)}
                </h3>
                <!-- Toggle button could be implemented in client JS, for now just static grid -->
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         `;

    group.forEach(p => {
      projectsHtml += `
             <a href="${p.full_path}" class="project-card block p-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 relative overflow-hidden group">
                <div class="flex justify-between items-start mb-4">
                    <h4 class="text-xl font-bold group-hover:text-blue-400 transition">${escapeHtml(p.title)}</h4>
                    <img src="${p.logo}" class="w-10 h-10 rounded-lg object-cover bg-neutral-800">
                </div>
                <p class="text-neutral-400 text-sm mb-6 line-clamp-2 h-10">${escapeHtml(p.description)}</p>
                <div class="flex items-center justify-between mt-auto">
                    <div class="flex -space-x-2">
                         ${p.contributors.slice(0, 3).map(c => `<img src="${c.avatar_url}" class="w-6 h-6 rounded-full border border-neutral-900">`).join('')}
                    </div>
                    <span class="text-xs font-mono text-neutral-600 group-hover:text-neutral-400 transition">View Project →</span>
                </div>
             </a>
             `;
    });

    projectsHtml += `</div></div>`;
  }

  indexHtml = indexHtml.replace('<!-- categories injected by JS -->', projectsHtml);

  // Inject Weekly Contributors (To Home)
  // For now, let's use the leaderboard data
  const leaderboard = await getLeaderboardData();
  const top7 = leaderboard.slice(0, 7);

  let contributorsHtml = '';
  top7.forEach((c, i) => {
    // Stacked styling handled in CSS
    contributorsHtml += `
            <a href="${c.html_url}" target="_blank" class="relative group" style="z-index: ${20 - i}">
                <img src="${c.avatar_url}" 
                     alt="${c.login}"
                     class="w-12 h-12 md:w-16 md:h-16 rounded-full object-cover shadow-xl bg-neutral-800"
                     title="${c.login} (${c.count} PRs)">
                <div class="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition text-xs whitespace-nowrap bg-black/80 px-2 py-1 rounded pointer-events-none">
                    ${c.login}
                </div>
            </a>
        `;
  });
  indexHtml = indexHtml.replace('<!-- injected avatars -->', contributorsHtml);

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), indexHtml);

  // 5. Generate Leaderboard HTML
  const leaderboardTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, 'leaderboard.html'), 'utf8');
  let lbHtml = leaderboardTemplate;

  let lgRows = leaderboard.map((c, i) => `
        <tr class="hover:bg-neutral-800/30 transition">
            <td class="px-6 py-4 text-neutral-500 font-mono">#${i + 1}</td>
            <td class="px-6 py-4 flex items-center gap-3">
                <img src="${c.avatar_url}" class="w-8 h-8 rounded-full">
                <a href="${c.html_url}" target="_blank" class="hover:underline hover:text-white">${c.login}</a>
            </td>
            <td class="px-6 py-4 text-right font-mono text-neutral-300">${c.count}</td>
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
