// Neowow Business Blueprint — Scripts

(function () {
  'use strict';

  // ---- Scroll-aware nav ----
  const nav = document.getElementById('nav');
  let lastScroll = 0;

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y > 80) {
      nav.style.boxShadow = '0 1px 12px rgba(0,0,0,0.5)';
    } else {
      nav.style.boxShadow = 'none';
    }
    lastScroll = y;
  }, { passive: true });

  // ---- Intersection Observer fade-in (fallback for browsers without scroll-timeline) ----
  if (!CSS.supports('animation-timeline', 'scroll()')) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transition = 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    document.querySelectorAll('.fade-in').forEach((el) => {
      el.style.opacity = '0';
      observer.observe(el);
    });
  }

  // ---- Staggered card entrances ----
  const cardObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const cards = entry.target.querySelectorAll('.matrix-card, .timeline-item, .revenue-panel, .arch-layer, .growth-step, .loop-node, .token-step, .revenue-item');
          cards.forEach((card, i) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(12px)';
            setTimeout(() => {
              card.style.transition = 'opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
              card.style.opacity = '1';
              card.style.transform = 'translateY(0)';
            }, 80 * i);
          });
          cardObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  document.querySelectorAll('.matrix-grid, .timeline, .revenue-layout, .arch-stack, .growth-path, .loop-diagram, .token-flow, .revenue-items').forEach((el) => {
    cardObserver.observe(el);
  });

  // ---- Smooth scroll for nav links ----
  document.querySelectorAll('.nav-links a').forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href.startsWith('#')) {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });
})();
