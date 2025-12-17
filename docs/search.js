// Search and Interactions for All We Need

// Load Fuse.js from CDN if not already present
if (typeof Fuse === 'undefined') {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.min.js';
  script.onload = initApp;
  document.head.appendChild(script);
} else {
  initApp();
}

let fuse;
let projectsData = [];
let leaderboardData = [];

async function initApp() {
  console.log("All We Need: App Initialized");

  // Header Search Toggle Logic
  const header = document.getElementById('header');
  const heroInput = document.getElementById('searchInput');
  const headerBtn = document.getElementById('headerSearchBtn');

  // Scroll Observer
  if (heroInput && headerBtn) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) {
          // Hero input gone -> Show header button
          headerBtn.classList.remove('opacity-0', 'scale-75', 'pointer-events-none');
        } else {
          // Hero input visible -> Hide header button
          headerBtn.classList.add('opacity-0', 'scale-75', 'pointer-events-none');
        }
      });
    }, { threshold: 0.1 });

    observer.observe(heroInput);

    headerBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => heroInput.focus(), 500);
    });
  }

  // Load Data
  try {
    const [pRes, lRes] = await Promise.all([
      fetch('/projects.json').then(r => r.json()),
      fetch('/leaderboard.json').then(r => r.json())
    ]);
    projectsData = pRes;
    leaderboardData = lRes;

    initSearch();
    initLeaderboard();

  } catch (e) {
    console.error("Failed to load data", e);
  }
}

function initSearch() {
  const searchInput = document.getElementById('searchInput');
  const projectsContainer = document.getElementById('projects');

  if (!searchInput || !projectsContainer) return;

  // Preserve original HTML for restoring
  const originalContent = projectsContainer.innerHTML;

  fuse = new Fuse(projectsData, {
    keys: [
      { name: 'title', weight: 0.7 },
      { name: 'description', weight: 0.5 },
      { name: 'tags', weight: 0.4 },
      { name: 'contributors.login', weight: 0.3 }
    ],
    threshold: 0.4
  });

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();

    if (query.length === 0) {
      projectsContainer.innerHTML = originalContent;
      return;
    }

    const results = fuse.search(query).map(r => r.item);
    renderResults(results, projectsContainer);
  });
}

function renderResults(results, container) {
  if (results.length === 0) {
    container.innerHTML = `<div class="text-center text-neutral-500 py-20">No projects found.</div>`;
    return;
  }

  const html = `
        <div class="mb-16">
            <h3 class="text-xl font-semibold mb-6 flex items-center gap-2">
                Search Results <span class="text-sm font-normal text-neutral-500">(${results.length})</span>
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                ${results.map(p => `
                 <a href="${p.full_path}" class="glass-card block p-8 rounded-3xl relative overflow-hidden group reveal-stagger hover:scale-[1.02] transition-transform duration-500">
                    <div class="flex justify-between items-start mb-6">
                         <img src="${p.logo}" class="w-12 h-12 rounded-xl object-cover bg-neutral-900 shadow-lg group-hover:shadow-white/10 transition-all">
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
    `;

  container.innerHTML = html;
}

function initLeaderboard() {
  const tableBody = document.getElementById('leaderboard-body');
  if (!tableBody) return; // Not on leaderboard page

  // Check URL params
  const params = new URLSearchParams(window.location.search);
  const filter = params.get('filter') || 'all';

  const periods = {
    'daily': 1,
    'week': 7,
    'month': 30,
    'all': 99999
  };

  const daysLimit = periods[filter] || 99999;

  // Filter and Sort Data
  const now = new Date();

  const filteredUsers = leaderboardData.map(user => {
    // Count merges within limit
    const recentCount = user.merged_dates.filter(d => {
      const date = new Date(d);
      const diffTime = Math.abs(now - date);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= daysLimit;
    }).length;

    return { ...user, count: recentCount };
  })
    .filter(u => u.count > 0)
    .sort((a, b) => b.count - a.count);

  renderLeaderboard(filteredUsers, tableBody);
}

function renderLeaderboard(users, container) {
  if (users.length === 0) {
    container.innerHTML = `<tr><td colspan="3" class="px-6 py-8 text-center text-neutral-500">No active contributors in this period.</td></tr>`;
    return;
  }

  container.innerHTML = users.map((c, i) => `
        <tr class="hover:bg-neutral-800/30 transition">
            <td class="px-6 py-4 text-neutral-500 font-mono">#${i + 1}</td>
            <td class="px-6 py-4 flex items-center gap-3">
                <img src="${c.avatar_url}" class="w-8 h-8 rounded-full border border-neutral-800">
                <a href="${c.html_url}" target="_blank" class="hover:underline hover:text-white font-medium">${escapeHtml(c.login)}</a>
            </td>
            <td class="px-6 py-4 text-right font-mono text-blue-400">${c.count}</td>
        </tr>
    `).join('');
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": "&#39;" }[s]));
}
