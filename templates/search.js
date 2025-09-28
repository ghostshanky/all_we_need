// templates/search.js
(async function() {
  const res = await fetch('/projects.json');
  const data = await res.json();

  const options = {
    keys: ['title', 'description', 'tags', 'contributors'],
    threshold: 0.4
  };
  const fuse = new Fuse(data, options);

  const input = document.getElementById('search');
  const sections = document.querySelectorAll('.category');
  const grids = document.querySelectorAll('.projects-grid');

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!q) {
      sections.forEach(s => s.style.display = '');
      grids.forEach(g => g.querySelectorAll('.project-card').forEach(c => c.style.display = ''));
      return;
    }
    const results = fuse.search(q).map(r => r.item.slug);
    sections.forEach(s => s.style.display = 'none'); // hide all
    grids.forEach(g => g.querySelectorAll('.project-card').forEach(c => {
      const slug = c.querySelector('a').getAttribute('href').split('/').pop().replace('.html','');
      c.style.display = results.includes(slug) ? '' : 'none';
    }));
    document.querySelector('.hero').insertAdjacentHTML('afterend',
      `<section class="category search-results"><h2>Search Results</h2></section>`);
  });

  // show more toggle
  document.querySelectorAll('.show-more').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      const grid = document.querySelector(`.projects-grid[data-tag="${tag}"]`);
      grid.classList.toggle('expanded');
      btn.textContent = grid.classList.contains('expanded') ? 'Show less' : 'Show more';
    });
  });
})();
