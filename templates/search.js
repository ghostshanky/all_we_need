// search.js - Advanced search functionality with category folding
(function() {
  'use strict';
  
  let projectsData = [];
  let fuse = null;
  let isSearchActive = false;
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  async function init() {
    await loadProjectsData();
    setupSearch();
    setupCategoryToggles();
    setupScrollBehavior();
  }
  
  // Load projects data for search
  async function loadProjectsData() {
    try {
      const response = await fetch('/projects.json');
      projectsData = await response.json();
      
      // Initialize Fuse.js for fuzzy search
      const fuseScript = document.createElement('script');
      fuseScript.src = 'https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.min.js';
      fuseScript.onload = () => {
        fuse = new Fuse(projectsData, {
          keys: ['title', 'description', 'tags', 'contributors'],
          threshold: 0.3,
          includeScore: true,
          minMatchCharLength: 2
        });
      };
      document.head.appendChild(fuseScript);
    } catch (error) {
      console.warn('Failed to load projects data:', error);
    }
  }
  
  // Setup search functionality
  function setupSearch() {
    const searchInput = document.getElementById('main-search');
    const searchResults = document.getElementById('search-results');
    const categoriesContainer = document.getElementById('categories-container');
    const noResults = document.getElementById('no-results');
    
    if (!searchInput) return;
    
    let searchTimeout;
    
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        performSearch(e.target.value.trim());
      }, 300);
    });
    
    // Clear search on escape
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        clearSearch();
      }
    });
    
    // Hide results when clicking outside
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        if (isSearchActive && searchInput.value.trim() === '') {
          clearSearch();
        }
      }
    });
  }
  
  // Perform the actual search
  function performSearch(query) {
    const searchResults = document.getElementById('search-results');
    const categoriesContainer = document.getElementById('categories-container');
    const noResults = document.getElementById('no-results');
    
    if (!query || !fuse) {
      clearSearch();
      return;
    }
    
    isSearchActive = true;
    
    // Perform fuzzy search
    const results = fuse.search(query);
    
    if (results.length === 0) {
      // Show no results
      categoriesContainer.style.display = 'none';
      searchResults.style.display = 'none';
      noResults.style.display = 'block';
    } else {
      // Show search results
      displaySearchResults(results);
      categoriesContainer.style.display = 'none';
      noResults.style.display = 'none';
      searchResults.style.display = 'block';
    }
    
    // Update URL without page reload
    const url = new URL(window.location);
    url.searchParams.set('q', query);
    window.history.pushState({}, '', url);
  }
  
  // Display search results
  function displaySearchResults(results) {
    const searchResults = document.getElementById('search-results');
    
    const resultsHtml = results.map(result => {
      const project = result.item;
      const score = (1 - result.score) * 100;
      
      return `
        <div class="search-result-item" onclick="window.location.href='${project.page}'">
          <div class="project-card" style="margin: 0; box-shadow: none; border: none;">
            <div class="project-link" style="padding: 0;">
              <div class="project-left">
                <img class="project-logo" src="${project.logo}" alt="${escapeHtml(project.title)}" />
              </div>
              <div class="project-body">
                <h3>${highlightMatches(project.title, query)}</h3>
                <p class="desc">${highlightMatches(project.description, query)}</p>
                <div class="tags">
                  ${project.tags.slice(0, 3).map(tag => 
                    `<span class="tag">${highlightMatches(tag, query)}</span>`
                  ).join('')}
                </div>
                <div class="meta">
                  <span class="site-link">
                    <a href="${project.link}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
                      ${getHostname(project.link)}
                    </a>
                  </span>
                  <span class="search-score" style="font-size: 0.75rem; color: var(--text-muted)">
                    ${Math.round(score)}% match
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    searchResults.innerHTML = `
      <div style="padding: 1rem; background: var(--bg-alt); border-bottom: 1px solid var(--border);">
        <strong>${results.length} result${results.length !== 1 ? 's' : ''} found</strong>
      </div>
      ${resultsHtml}
    `;
  }
  
  // Clear search and restore default view
  function clearSearch() {
    const searchInput = document.getElementById('main-search');
    const searchResults = document.getElementById('search-results');
    const categoriesContainer = document.getElementById('categories-container');
    const noResults = document.getElementById('no-results');
    
    isSearchActive = false;
    
    if (searchInput) searchInput.value = '';
    if (searchResults) searchResults.style.display = 'none';
    if (categoriesContainer) categoriesContainer.style.display = 'block';
    if (noResults) noResults.style.display = 'none';
    
    // Clear URL search params
    const url = new URL(window.location);
    url.searchParams.delete('q');
    window.history.pushState({}, '', url);
  }
  
  // Setup category show/hide toggles
  function setupCategoryToggles() {
    const showMoreButtons = document.querySelectorAll('.show-more');
    
    showMoreButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const category = e.target.dataset.category;
        const grid = document.querySelector(`[data-category-grid="${category}"]`);
        
        if (grid) {
          const isExpanded = grid.classList.contains('expanded');
          
          if (isExpanded) {
            grid.classList.remove('expanded');
            button.textContent = 'Show all';
          } else {
            grid.classList.add('expanded');
            button.textContent = 'Show less';
          }
        }
      });
    });
  }
  
  // Setup scroll behavior for search icon
  function setupScrollBehavior() {
    const header = document.getElementById('site-header');
    const searchIcon = document.getElementById('search-icon');
    const mainSearch = document.getElementById('main-search');
    
    if (!header || !searchIcon || !mainSearch) return;
    
    let lastScrollY = window.scrollY;
    
    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      const heroHeight = document.querySelector('.hero')?.offsetHeight || 400;
      
      if (scrollY > heroHeight / 2) {
        // Show search icon in header
        searchIcon.style.display = 'block';
        header.style.background = 'rgba(255, 255, 255, 0.98)';
      } else {
        // Hide search icon
        searchIcon.style.display = 'none';
        header.style.background = 'rgba(255, 255, 255, 0.95)';
      }
      
      lastScrollY = scrollY;
    });
  }
  
  // Focus main search from header icon
  window.focusMainSearch = function() {
    const mainSearch = document.getElementById('main-search');
    if (mainSearch) {
      mainSearch.focus();
      mainSearch.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
  
  // Highlight search matches in text
  function highlightMatches(text, query) {
    if (!query || !text) return escapeHtml(text);
    
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return escapeHtml(text).replace(regex, '<mark style="background: yellow; padding: 0;">$1</mark>');
  }
  
  // Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Escape regex special characters
  function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  // Get hostname from URL
  function getHostname(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
  
  // Handle URL search params on page load
  function handleInitialSearch() {
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('q');
    
    if (query) {
      const searchInput = document.getElementById('main-search');
      if (searchInput) {
        searchInput.value = query;
        // Small delay to ensure Fuse.js is loaded
        setTimeout(() => performSearch(query), 500);
      }
    }
  }
  
  // Initialize search from URL on load
  setTimeout(handleInitialSearch, 100);
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.getElementById('main-search');
      if (searchInput) {
        searchInput.focus();
      }
    }
  });
  
  // Add search shortcuts info
  const searchInput = document.getElementById('main-search');
  if (searchInput) {
    searchInput.setAttribute('title', 'Search projects (Ctrl+K)');
  }
  
})();