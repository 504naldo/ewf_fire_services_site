(() => {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('primary-nav');
  if (!toggle || !nav) return;

  const services = nav.querySelector('.service-menu');
  const setOpen = (open) => {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    const icon = toggle.querySelector('i');
    if (icon) icon.className = open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
    if (!open && services) services.open = false;
  };

  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setOpen(false)));
  document.addEventListener('click', event => {
    if (!nav.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (services?.open) {
      services.open = false;
      services.querySelector('summary').focus();
    } else if (nav.classList.contains('open')) {
      setOpen(false);
      toggle.focus();
    }
  });
  const mobileQuery = window.matchMedia('(max-width: 1100px)');
  if (mobileQuery.addEventListener) {
    mobileQuery.addEventListener('change', () => setOpen(false));
  } else if (mobileQuery.addListener) {
    mobileQuery.addListener(() => setOpen(false));
  }

  // Collapse navigation only after its controls are ready. If this file fails
  // to load or initialize, the links remain visible without a dead menu button.
  setOpen(false);
  document.documentElement.classList.add('nav-ready');
})();
