"use strict";

/* =========================================
   VARIABLES
========================================= */

let DISHES = [];
let CATEGORY_NAMES = {};

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

    const url = String(item.photo).replace(
      /['"()\\\s<>&]/g,
      char => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`
    );

    return `
      background-image: url('${url}');
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

function formatPrice(price) {

  if (price === null || price === undefined) {
    return "";
  }

  const amount = String(price).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    " "
  );

  return `${amount} DA`;
}


async function fetchJSON(url, options) {

  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(
      `Erreur HTTP ${response.status}`
    );
  }

  return response.json();
}


/* Les règles de la base ne renvoient que les plats disponibles. */

async function fetchMenuFromSupabase(config) {

  const options = {
    headers: { apikey: config.anonKey },
    signal: AbortSignal.timeout(8000)
  };

  const base = `${config.url}/rest/v1`;

  const [categories, dishes] = await Promise.all([
    fetchJSON(
      `${base}/categories?select=id,slug,name&order=position,id`,
      options
    ),
    fetchJSON(
      `${base}/dishes?select=category_id,name,description,price,photo&order=position,id`,
      options
    )
  ]);

  const slugs = new Map(
    categories.map(category => [category.id, category.slug])
  );

  return {
    categories,
    dishes: dishes.map(dish => ({
      name: dish.name,
      desc: dish.description,
      price: formatPrice(dish.price),
      cat: slugs.get(dish.category_id),
      photo: dish.photo
    }))
  };
}


async function fetchMenu() {

  const config = window.SUPABASE_CONFIG || {};

  if (config.url && config.anonKey) {

    try {

      return await fetchMenuFromSupabase(config);

    } catch (error) {

      console.warn(
        "Supabase indisponible, utilisation de menu.json :",
        error
      );
    }
  }

  return fetchJSON("./data/menu.json", {
    cache: "no-cache"
  });
}


async function loadMenu() {

  const container = document.getElementById("dishes");

  if (!container) {
    return;
  }

  try {

    const data = await fetchMenu();

    const categories = Array.isArray(data.categories)
      ? data.categories
      : [];

    CATEGORY_NAMES = Object.fromEntries(
      categories.map(category => [category.slug, category.name])
    );

    DISHES = Array.isArray(data.dishes)
      ? data.dishes
      : [];

    renderCategoryTabs(categories);

    renderDishes("all");

  } catch (error) {

    console.error(
      "Impossible de charger la carte :",
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

    updateSlider();

    return;
  }


  container.innerHTML =
    filtered
      .map(item => {

        const name =
          escapeHTML(item.name);

        const desc =
          escapeHTML(item.desc);

        const price =
          escapeHTML(item.price);

        const cat =
          escapeHTML(CATEGORY_NAMES[item.cat] || item.cat);

        const style =
          photoStyle(item);

        return `
          <article class="dish-card">

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


  container.scrollLeft = 0;

  updateSlider();
}


/* =========================================
   SLIDER MENU
========================================= */

function sliderMetrics(track) {

  const cards =
    track.querySelectorAll(".dish-card");

  if (!cards.length) {
    return { total: 0, step: 0, visible: 0 };
  }

  const step =
    cards.length > 1
      ? cards[1].offsetLeft - cards[0].offsetLeft
      : cards[0].offsetWidth;

  return {
    total: cards.length,
    step,
    visible: Math.max(
      1,
      Math.floor(
        (track.clientWidth + (step - cards[0].offsetWidth) + 1) / step
      )
    )
  };
}


function updateSlider() {

  const track =
    document.getElementById("dishes");

  const controls =
    document.getElementById("sliderControls");

  if (!track || !controls) {
    return;
  }

  const { total, step, visible } =
    sliderMetrics(track);

  const maxScroll =
    track.scrollWidth - track.clientWidth;

  controls.hidden = maxScroll <= 1;

  if (controls.hidden) {
    return;
  }

  const atEnd =
    track.scrollLeft >= maxScroll - 1;

  /* Numéro de la dernière carte entièrement visible. */
  const current = atEnd
    ? total
    : Math.min(
        total,
        Math.round(track.scrollLeft / step) + visible
      );

  document.getElementById("sliderCount").textContent =
    `${String(current).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;

  document.getElementById("sliderProgress").style.width =
    `${(current / total) * 100}%`;

  document.getElementById("sliderPrev").disabled =
    track.scrollLeft <= 1;

  document.getElementById("sliderNext").disabled =
    atEnd;
}


function moveSlider(direction) {

  const track =
    document.getElementById("dishes");

  const { step, visible } =
    sliderMetrics(track);

  const reduceMotion =
    window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

  track.scrollBy({
    left: direction * step * visible,
    behavior: reduceMotion ? "auto" : "smooth"
  });
}


function initSlider() {

  const track =
    document.getElementById("dishes");

  const previous =
    document.getElementById("sliderPrev");

  const next =
    document.getElementById("sliderNext");

  if (!track || !previous || !next) {
    return;
  }

  previous.addEventListener(
    "click",
    () => moveSlider(-1)
  );

  next.addEventListener(
    "click",
    () => moveSlider(1)
  );

  track.addEventListener(
    "scroll",
    updateSlider,
    { passive: true }
  );

  window.addEventListener(
    "resize",
    updateSlider
  );
}


/* =========================================
   FILTRES MENU
========================================= */

function renderCategoryTabs(categories) {

  const tabs =
    document.getElementById("menuTabs");

  if (!tabs) {
    return;
  }

  tabs.insertAdjacentHTML(
    "beforeend",
    categories
      .map(category => `
        <button
          type="button"
          class="menu-tab"
          data-category="${escapeHTML(category.slug)}"
        >
          ${escapeHTML(category.name)}
        </button>
      `)
      .join("")
  );
}


function initCategoryFilters() {

  const tabs =
    document.getElementById("menuTabs");

  if (!tabs) {
    return;
  }

  tabs.addEventListener("click", event => {

    const tab =
      event.target.closest(".menu-tab");

    if (!tab) {
      return;
    }

    tabs
      .querySelectorAll(".menu-tab")
      .forEach(item => {
        item.classList.remove("active");
      });

    tab.classList.add("active");

    const category =
      tab.dataset.category || "all";

    renderDishes(category);

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

    initSlider();

    loadMenu();


    /* ANIMATIONS */

    initRevealElements();


    /* SCROLL */

    initSmoothScroll();


    /* FOOTER */

    initFooterYear();

  }
);