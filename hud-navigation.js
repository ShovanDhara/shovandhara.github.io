(function () {
  const nav = document.querySelector(".hud-nav");
  const links = Array.from(document.querySelectorAll("[data-nav-link]"));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let currentFrame = 0;
  let ticking = false;

  if (!nav || !links.length) {
    return;
  }

  const sections = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  const easeOutQuart = (progress) => 1 - Math.pow(1 - progress, 4);

  const getOffset = () => {
    if (window.innerWidth <= 720) {
      return 24;
    }

    const navHeight = nav.getBoundingClientRect().height;
    return navHeight + 28;
  };

  const setActiveLink = (id) => {
    links.forEach((link) => {
      const isActive = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("is-active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  const updateActiveSection = () => {
    const offset = getOffset() + 36;
    let activeSection = sections[0];

    sections.forEach((section) => {
      if (section.offsetTop - offset <= window.scrollY) {
        activeSection = section;
      }
    });

    if (activeSection) {
      setActiveLink(activeSection.id);
    }

    ticking = false;
  };

  const requestActiveUpdate = () => {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(updateActiveSection);
    }
  };

  const smoothScrollTo = (target) => {
    const startY = window.scrollY;
    const targetY = Math.max(
      0,
      target.getBoundingClientRect().top + window.scrollY - getOffset(),
    );
    const distance = targetY - startY;

    window.cancelAnimationFrame(currentFrame);

    if (reducedMotion.matches || Math.abs(distance) < 4) {
      window.scrollTo(0, targetY);
      setActiveLink(target.id);
      return;
    }

    const duration = Math.min(1250, Math.max(620, Math.abs(distance) * 0.62));
    let startTime = 0;

    const step = (time) => {
      if (!startTime) {
        startTime = time;
      }

      const progress = Math.min((time - startTime) / duration, 1);
      const easedProgress = easeOutQuart(progress);

      window.scrollTo(0, startY + distance * easedProgress);

      if (progress < 1) {
        currentFrame = window.requestAnimationFrame(step);
      } else {
        setActiveLink(target.id);
      }
    };

    currentFrame = window.requestAnimationFrame(step);
  };

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = document.querySelector(link.getAttribute("href"));

      if (!target) {
        return;
      }

      event.preventDefault();
      smoothScrollTo(target);
      history.pushState(null, "", link.getAttribute("href"));
    });
  });

  window.addEventListener("scroll", requestActiveUpdate, { passive: true });
  window.addEventListener("resize", requestActiveUpdate);
  updateActiveSection();
})();
