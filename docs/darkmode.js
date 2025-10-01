document.addEventListener('DOMContentLoaded', () => {
  const toggleInput = document.querySelector('.switch__input');
  const body = document.body;

  // Load saved theme from localStorage
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    body.classList.add('dark');
    if (toggleInput) toggleInput.checked = true;
  }

  if (toggleInput) {
    toggleInput.addEventListener('change', () => {
      body.classList.toggle('dark');
      if (body.classList.contains('dark')) {
        localStorage.setItem('theme', 'dark');
      } else {
        localStorage.setItem('theme', 'light');
      }
    });
  }
});
