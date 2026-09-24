"use strict";

/* =========================================
   VARIABLES
========================================= */

let DISHES = [];

let heroIndex = 0;
let heroInterval = null;


/* =========================================
   HERO
========================================= */

const HEROES = [
  "./assets/images/hero_section1.jpg",
  "./assets/images/hero_section2.jpg",
  "./assets/images/hero_section3.jpg"
];


/* =========================================
   UTILITAIRE
========================================= */

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================
   STYLE IMAGE PRODUIT
========================================= */

function photoStyle(item) {

  if (item.photo) {
    return `
      background-image: url('${item.photo}');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    `;
  }

  if (item.grad) {
    return `
      background: ${item.grad};
    `;
  }

  return `
    background:
      linear-gradient(
        135deg,
        #403a31,
        #1c1a17
      );
  `;
}

/* =========================================
   CHARGEMENT DU MENU
========================================= */

async function loadMenu() {

  const container = document.getElementById("dishes");

  if (!container) {
    return;
  }

  try {

    const response = await fetch("./data/menu.json", {
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error(
        `Erreur HTTP ${response.status}`
      );
    }

    const data = await response.json();

    DISHES = Array.isArray(data.dishes)
      ? data.dishes
      : [];

    renderDishes("all");

  } catch (error) {

    console.error(
      "Impossible de charger menu.json :",
      error
    );

    container.innerHTML = `
      <div class="menu-error">
        <i class="fa-solid fa-circle-exclamation"></i>
        <p>
          Impossible de charger la carte pour le moment.
        </p>
      </div>
    `;
  }
}


/* =========================================
   AFFICHAGE DES PLATS
========================================= */

function renderDishes(filter = "all") {

  const container =
    document.getElementById("dishes");

  if (!container) {
    return;
  }

  const filtered =
    filter === "all"
      ? DISHES
      : DISHES.filter(
          item =>
            String(item.cat || "")
              .toLowerCase() ===
            String(filter).toLowerCase()
        );


  if (!filtered.length) {

    container.innerHTML = `
      <div class="menu-error">
        Aucun plat disponible dans cette catégorie.
      </div>
    `;

    return;
  }


  container.innerHTML =
    filtered
      .map((item, index) => {

        const name =
          escapeHTML(item.name);

        const desc =
          escapeHTML(item.desc);

        const price =
          escapeHTML(item.price);

        const cat =
          escapeHTML(item.cat);

        const style =
          photoStyle(item);

        return `
          <article
            class="dish-card reveal"
            style="transition-delay:${index * 50}ms"
          >

            <div
              class="dish-image"
              style="${style}"
              role="img"
              aria-label="${name}"
            ></div>

            <div class="dish-content">

              <div class="dish-top">

                <h3 class="dish-name">
                  ${name}
                </h3>

                ${
                  price
                    ? `
                      <span class="dish-price">
                        ${price}
                      </span>
                    `
                    : ""
                }

              </div>

              ${
                desc
                  ? `
                    <p class="dish-description">
                      ${desc}
                    </p>
                  `
                  : ""
              }

              ${
                cat
                  ? `
                    <span class="dish-category">
                      ${cat}
                    </span>
                  `
                  : ""
              }

            </div>

          </article>
        `;
      })
      .join("");


  initRevealElements();
}


/* =========================================
   FILTRES MENU
========================================= */

function initCategoryFilters() {

  const tabs =
    document.querySelectorAll(".menu-tab");

  if (!tabs.length) {
    return;
  }

  tabs.forEach(tab => {

    tab.addEventListener("click", () => {

      tabs.forEach(item => {
        item.classList.remove("active");
      });

      tab.classList.add("active");

      const category =
        tab.dataset.category || "all";

      renderDishes(category);

    });

  });
}


/* =========================================
   HERO
========================================= */

function showHero(index) {

  const bg =
    document.getElementById("heroBg");

  const counter =
    document.getElementById("count");

  if (!bg || !HEROES.length) {
    return;
  }

  heroIndex =
    (index + HEROES.length) %
    HEROES.length;


  bg.style.backgroundImage =
    `url("${HEROES[heroIndex]}")`;


  if (counter) {

    const current =
      String(heroIndex + 1).padStart(2, "0");

    const total =
      String(HEROES.length).padStart(2, "0");

    counter.textContent =
      `${current} / ${total}`;
  }
}


/* =========================================
   HERO PRECEDENT
========================================= */

function previousHero() {

  showHero(heroIndex - 1);

  restartHeroAutoplay();
}


/* =========================================
   HERO SUIVANT
========================================= */

function nextHero() {

  showHero(heroIndex + 1);

  restartHeroAutoplay();
}


/* =========================================
   HERO AUTOPLAY
========================================= */

function startHeroAutoplay() {

  stopHeroAutoplay();

  heroInterval =
    setInterval(() => {

      showHero(heroIndex + 1);

    }, 6000);
}


function stopHeroAutoplay() {

  if (heroInterval) {

    clearInterval(heroInterval);

    heroInterval = null;
  }
}


function restartHeroAutoplay() {

  startHeroAutoplay();
}


/* =========================================
   REVEAL
========================================= */

function initRevealElements() {

  const elements =
    document.querySelectorAll(
      ".reveal:not(.reveal-observed)"
    );

  if (!elements.length) {
    return;
  }


  if (!("IntersectionObserver" in window)) {

    elements.forEach(element => {
      element.classList.add("in");
    });

    return;
  }


  const observer =
    new IntersectionObserver(
      entries => {

        entries.forEach(entry => {

          if (entry.isIntersecting) {

            entry.target.classList.add("in");

            observer.unobserve(
              entry.target
            );
          }

        });

      },
      {
        threshold: 0.12,
        rootMargin: "0px 0px -40px 0px"
      }
    );


  elements.forEach(element => {

    element.classList.add(
      "reveal-observed"
    );

    observer.observe(element);

  });
}


/* =========================================
   SMOOTH SCROLL
========================================= */

function initSmoothScroll() {

  const links =
    document.querySelectorAll(
      'a[href^="#"]'
    );

  links.forEach(link => {

    link.addEventListener(
      "click",
      event => {

        const href =
          link.getAttribute("href");

        if (
          !href ||
          href === "#" ||
          href.length <= 1
        ) {
          return;
        }

        const target =
          document.querySelector(href);

        if (!target) {
          return;
        }

        event.preventDefault();

        target.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

      }
    );

  });
}


/* =========================================
   FOOTER ANNÉE
========================================= */

function initFooterYear() {

  const year =
    document.getElementById("year");

  if (year) {
    year.textContent =
      new Date().getFullYear();
  }
}


/* =========================================
   PRECHARGEMENT HERO
========================================= */

function preloadHeroImages() {

  HEROES.forEach(src => {

    const image =
      new Image();

    image.src = src;

  });
}


/* =========================================
   DOM READY
========================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    /* HERO */

    showHero(0);

    preloadHeroImages();

    startHeroAutoplay();


    /* BOUTONS HERO */

    const previous =
      document.getElementById("prev");

    const next =
      document.getElementById("next");


    if (previous) {

      previous.addEventListener(
        "click",
        previousHero
      );

    }


    if (next) {

      next.addEventListener(
        "click",
        nextHero
      );

    }


    /* PAUSE HERO AU SURVOL */

    const hero =
      document.getElementById("hero");

    if (hero) {

      hero.addEventListener(
        "mouseenter",
        stopHeroAutoplay
      );

      hero.addEventListener(
        "mouseleave",
        startHeroAutoplay
      );

    }


    /* MENU */

    initCategoryFilters();

    loadMenu();


    /* ANIMATIONS */

    initRevealElements();


    /* SCROLL */

    initSmoothScroll();


    /* FOOTER */

    initFooterYear();

  }
);