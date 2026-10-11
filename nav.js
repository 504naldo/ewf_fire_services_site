const menuToggle = document.querySelector('.menu-toggle');
const primaryNav = document.getElementById('primary-nav');

if (menuToggle && primaryNav) {
  const setOpen = (open) => {
    primaryNav.classList.toggle('open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };

  menuToggle.addEventListener('click', () => setOpen(!primaryNav.classList.contains('open')));
  primaryNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
}
