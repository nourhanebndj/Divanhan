"use strict";

/* =========================================
   INITIALISATION
========================================= */

const BUCKET = "menu-images";
const MAX_IMAGE_SIZE = 1400;
const ACCEPTED_IMAGES = ["image/jpeg", "image/png", "image/webp"];
const IDLE_LIMIT_MS = 30 * 60 * 1000;

const config = window.SUPABASE_CONFIG || {};
const isConfigured = Boolean(config.url && config.anonKey);

const db = isConfigured
  ? window.supabase.createClient(config.url, config.anonKey)
  : null;

const state = {
  categories: [],
  dishes: [],
  editingDish: null,
  editingCategory: null,
  photoFile: null,
  photoRemoved: false,
  previewUrl: null
};

const $ = id => document.getElementById(id);


/* =========================================
   UTILITAIRES
========================================= */

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPrice(price) {
  if (price === null || price === undefined) {
    return "";
  }
  return `${String(price).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} DA`;
}

function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* Les photos d'origine sont enregistrées relativement à la racine du site. */
function photoUrl(photo) {
  if (!photo) {
    return "";
  }
  return photo.startsWith("./") ? `../${photo.slice(2)}` : photo;
}

function cssUrl(url) {
  const safe = url.replace(
    /['"()\\\s<>]/g,
    char => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`
  );
  return `url('${safe}')`;
}

/* Chemin dans le bucket, ou null pour une photo livrée avec le site. */
function storagePath(photo) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = (photo || "").indexOf(marker);
  return index === -1 ? null : decodeURIComponent(photo.slice(index + marker.length));
}

function errorMessage(error) {
  const messages = {
    "23505": "Cette catégorie existe déjà.",
    "23503": "Cette catégorie contient encore des plats : déplacez-les ou supprimez-les d'abord.",
    "23001": "Cette catégorie contient encore des plats : déplacez-les ou supprimez-les d'abord.",
    "42501": "Ce compte n'a pas le droit d'effectuer cette action."
  };
  if (messages[error?.code]) {
    return messages[error.code];
  }
  console.error(error);
  return "Une erreur est survenue. Vérifiez votre connexion et réessayez.";
}

let toastTimer = null;

function showToast(message, isError = false) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.hidden = false;

  /* Au-dessus d'une modale ouverte, qui occupe la couche supérieure du navigateur. */
  const openDialog = document.querySelector("dialog[open]");
  (openDialog || document.body).appendChild(toast);

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, isError ? 6000 : 3000);
}

function setFormError(id, message) {
  const element = $(id);
  element.textContent = message || "";
  element.hidden = !message;
}


/* =========================================
   CONNEXION
========================================= */

async function isCurrentUserAdmin() {
  const { data, error } = await db.rpc("is_admin");

  if (error) {
    throw error;
  }
  return data === true;
}

function closeDialogs() {
  document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
}

function showLogin(message) {
  closeDialogs();
  state.categories = [];
  state.dishes = [];
  $("dishRows").innerHTML = "";
  $("categoryRows").innerHTML = "";
  $("dashboard").hidden = true;
  $("authScreen").hidden = false;
  setFormError("loginError", message);
}

async function enterDashboard(user) {
  if (!(await isCurrentUserAdmin())) {
    await db.auth.signOut();
    showLogin(`Le compte ${user.email} n'est pas autorisé à administrer la carte.`);
    return;
  }

  $("authScreen").hidden = true;
  $("dashboard").hidden = false;
  startIdleWatch();
  await refreshData();
}

async function handleLogin(event) {
  event.preventDefault();

  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;

  if (!email || !password) {
    setFormError("loginError", "Renseignez votre e-mail et votre mot de passe.");
    return;
  }

  const submit = $("loginSubmit");
  submit.disabled = true;
  setFormError("loginError", "");

  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
      setFormError(
        "loginError",
        error.status === 400
          ? "E-mail ou mot de passe incorrect."
          : "Connexion impossible pour le moment. Réessayez."
      );
      return;
    }

    $("loginPassword").value = "";
    await enterDashboard(data.user);

  } catch (error) {
    setFormError("loginError", errorMessage(error));
  } finally {
    submit.disabled = false;
  }
}

async function handleLogout() {
  stopIdleWatch();
  await db.auth.signOut();
  showLogin("");
}


/* =========================================
   DÉCONNEXION APRÈS INACTIVITÉ
========================================= */

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll"];
let lastActivity = 0;
let idleTimer = null;

function markActivity() {
  lastActivity = Date.now();
}

function startIdleWatch() {
  stopIdleWatch();
  markActivity();
  ACTIVITY_EVENTS.forEach(name => {
    window.addEventListener(name, markActivity, { passive: true });
  });

  /* Une comparaison d'horloge reste juste après une mise en veille. */
  idleTimer = setInterval(async () => {
    if (Date.now() - lastActivity < IDLE_LIMIT_MS) {
      return;
    }
    stopIdleWatch();
    await db.auth.signOut();
    showLogin("Session fermée après 30 minutes d'inactivité.");
  }, 30000);
}

function stopIdleWatch() {
  clearInterval(idleTimer);
  ACTIVITY_EVENTS.forEach(name => {
    window.removeEventListener(name, markActivity);
  });
}


/* =========================================
   DONNÉES
========================================= */

async function refreshData() {
  const [categories, dishes] = await Promise.all([
    db.from("categories").select("*").order("position").order("id"),
    db.from("dishes").select("*").order("position").order("id")
  ]);

  const error = categories.error || dishes.error;

  if (error) {
    showToast(errorMessage(error), true);
    return;
  }

  state.categories = categories.data;
  state.dishes = dishes.data;
  renderAll();
}

function nextPosition(items) {
  return items.reduce((max, item) => Math.max(max, item.position), 0) + 1;
}

/* Échange la position de deux éléments voisins. */
async function swapPositions(table, a, b) {
  const first = await db.from(table).update({ position: b.position }).eq("id", a.id);
  const second = first.error
    ? first
    : await db.from(table).update({ position: a.position }).eq("id", b.id);

  if (second.error) {
    showToast(errorMessage(second.error), true);
  }

  await refreshData();
}


/* =========================================
   AFFICHAGE
========================================= */

function renderAll() {
  renderFilterOptions();
  renderDishes();
  renderCategories();
}

function categoryName(id) {
  return state.categories.find(category => category.id === id)?.name || "";
}

function renderFilterOptions() {
  const filter = $("dishFilter");
  const current = filter.value;
  const options = state.categories
    .map(category => `<option value="${category.id}">${escapeHTML(category.name)}</option>`)
    .join("");

  filter.innerHTML = `<option value="">Toutes les catégories</option>${options}`;
  filter.value = state.categories.some(category => String(category.id) === current)
    ? current
    : "";

  $("dishCategory").innerHTML = options;
}

function visibleDishes() {
  const search = slugify($("dishSearch").value);
  const categoryId = Number($("dishFilter").value) || null;

  return state.dishes.filter(dish =>
    (!categoryId || dish.category_id === categoryId) &&
    (!search || slugify(dish.name).includes(search))
  );
}

function renderDishes() {
  const dishes = visibleDishes();
  const container = $("dishRows");
  const total = state.dishes.length;
  const hidden = state.dishes.filter(dish => !dish.is_available).length;

  $("dishCount").textContent =
    `${total} plat${total > 1 ? "s" : ""}` +
    (hidden ? `, dont ${hidden} masqué${hidden > 1 ? "s" : ""}` : "");

  if (!dishes.length) {
    container.innerHTML = `
      <div class="empty">
        ${total ? "Aucun plat ne correspond à cette recherche." : "Aucun plat pour le moment. Ajoutez le premier !"}
      </div>
    `;
    return;
  }

  /* Le tri n'a de sens que sur la liste complète ou une catégorie, pas sur une recherche. */
  const canSort = !$("dishSearch").value.trim();

  container.innerHTML = dishes.map((dish, index) => {
    const name = escapeHTML(dish.name);
    const url = photoUrl(dish.photo);
    const thumb = url
      ? `<div class="row-thumb" style="background-image:${escapeHTML(cssUrl(url))}"></div>`
      : `<div class="row-thumb"><i class="fa-regular fa-image" aria-hidden="true"></i></div>`;

    return `
      <article class="row ${dish.is_available ? "" : "is-hidden"}" data-id="${dish.id}">
        ${thumb}
        <div class="row-main">
          <h3 class="row-title">${name}</h3>
          <p class="row-meta">
            ${escapeHTML(categoryName(dish.category_id))}${dish.is_available ? "" : " · Masqué"}
          </p>
        </div>
        <p class="row-price">${escapeHTML(formatPrice(dish.price))}</p>
        <div class="row-actions">
          <button type="button" class="icon-link" data-action="up" aria-label="Monter ${name}" title="Monter" ${canSort && index > 0 ? "" : "disabled"}>
            <i class="fa-solid fa-arrow-up"></i>
          </button>
          <button type="button" class="icon-link" data-action="down" aria-label="Descendre ${name}" title="Descendre" ${canSort && index < dishes.length - 1 ? "" : "disabled"}>
            <i class="fa-solid fa-arrow-down"></i>
          </button>
          <button type="button" class="icon-link" data-action="toggle" aria-label="${dish.is_available ? "Masquer" : "Afficher"} ${name}" title="${dish.is_available ? "Masquer du site" : "Afficher sur le site"}">
            <i class="fa-regular ${dish.is_available ? "fa-eye" : "fa-eye-slash"}"></i>
          </button>
          <button type="button" class="icon-link" data-action="edit" aria-label="Modifier ${name}" title="Modifier">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button type="button" class="icon-link danger" data-action="delete" aria-label="Supprimer ${name}" title="Supprimer">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function renderCategories() {
  const container = $("categoryRows");

  if (!state.categories.length) {
    container.innerHTML = `<div class="empty">Aucune catégorie pour le moment.</div>`;
    return;
  }

  container.innerHTML = state.categories.map((category, index) => {
    const name = escapeHTML(category.name);
    const count = state.dishes.filter(dish => dish.category_id === category.id).length;

    return `
      <article class="row row-category" data-id="${category.id}">
        <div class="row-main">
          <h3 class="row-title">${name}</h3>
          <p class="row-meta">${count} plat${count > 1 ? "s" : ""}</p>
        </div>
        <div class="row-actions">
          <button type="button" class="icon-link" data-action="up" aria-label="Monter ${name}" title="Monter" ${index > 0 ? "" : "disabled"}>
            <i class="fa-solid fa-arrow-up"></i>
          </button>
          <button type="button" class="icon-link" data-action="down" aria-label="Descendre ${name}" title="Descendre" ${index < state.categories.length - 1 ? "" : "disabled"}>
            <i class="fa-solid fa-arrow-down"></i>
          </button>
          <button type="button" class="icon-link" data-action="edit" aria-label="Renommer ${name}" title="Renommer">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button type="button" class="icon-link danger" data-action="delete" aria-label="Supprimer ${name}" title="Supprimer">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
      </article>
    `;
  }).join("");
}


/* =========================================
   PHOTOS
========================================= */

/* Réduit les photos de téléphone pour qu'elles restent légères sur le site. */
async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIZE / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext("2d");
  context.fillStyle = "#1b1916";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error("Conversion impossible"))),
      "image/jpeg",
      0.85
    );
  });
}

async function uploadPhoto(file) {
  const blob = await prepareImage(file);
  const path = `${crypto.randomUUID()}.jpg`;

  const { error } = await db.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    cacheControl: "31536000"
  });

  if (error) {
    throw error;
  }

  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/* Le plat est déjà enregistré : un échec ici laisse juste un fichier orphelin. */
async function removeStoredPhoto(photo) {
  const path = storagePath(photo);

  if (!path) {
    return;
  }

  const { error } = await db.storage.from(BUCKET).remove([path]);

  if (error) {
    console.warn("Photo non supprimée du stockage :", error);
  }
}

function setPhotoPreview(url) {
  const preview = $("photoPreview");
  preview.style.backgroundImage = url ? cssUrl(url) : "";
  preview.innerHTML = url ? "" : `<i class="fa-regular fa-image" aria-hidden="true"></i>`;
  $("removePhotoBtn").hidden = !url;
}

function clearPreviewUrl() {
  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
  }
}

function handlePhotoChosen() {
  const file = $("dishPhoto").files[0];

  if (!file) {
    return;
  }

  if (!ACCEPTED_IMAGES.includes(file.type)) {
    setFormError("dishError", "Format non pris en charge : choisissez une photo JPG, PNG ou WebP.");
    $("dishPhoto").value = "";
    return;
  }

  setFormError("dishError", "");
  clearPreviewUrl();
  state.photoFile = file;
  state.photoRemoved = false;
  state.previewUrl = URL.createObjectURL(file);
  setPhotoPreview(state.previewUrl);
}

function handlePhotoRemoved() {
  clearPreviewUrl();
  state.photoFile = null;
  state.photoRemoved = true;
  $("dishPhoto").value = "";
  setPhotoPreview("");
}


/* =========================================
   FORMULAIRE PLAT
========================================= */

function openDishDialog(dish = null) {
  if (!state.categories.length) {
    showToast("Créez d'abord une catégorie.", true);
    return;
  }

  state.editingDish = dish;
  state.photoFile = null;
  state.photoRemoved = false;
  clearPreviewUrl();

  $("dishDialogTitle").textContent = dish ? "Modifier le plat" : "Ajouter un plat";
  $("dishName").value = dish?.name || "";
  $("dishDescription").value = dish?.description || "";
  $("dishPrice").value = dish?.price ?? "";
  $("dishCategory").value = dish?.category_id || $("dishFilter").value || state.categories[0].id;
  $("dishAvailable").checked = dish ? dish.is_available : true;
  $("dishPhoto").value = "";
  setPhotoPreview(photoUrl(dish?.photo));
  setFormError("dishError", "");

  $("dishDialog").showModal();
  $("dishName").focus();
}

function readDishForm() {
  const name = $("dishName").value.trim();
  const rawPrice = $("dishPrice").value.trim();
  const price = rawPrice === "" ? null : Number(rawPrice);

  if (!name) {
    return { error: "Le nom du plat est obligatoire." };
  }

  if (price !== null && (!Number.isInteger(price) || price < 0)) {
    return { error: "Le prix doit être un nombre entier positif, en dinars." };
  }

  return {
    values: {
      name,
      description: $("dishDescription").value.trim(),
      price,
      category_id: Number($("dishCategory").value),
      is_available: $("dishAvailable").checked
    }
  };
}

async function handleDishSubmit(event) {
  event.preventDefault();

  const { values, error: validationError } = readDishForm();

  if (validationError) {
    setFormError("dishError", validationError);
    return;
  }

  const submit = $("dishSubmit");
  const editing = state.editingDish;
  const previousPhoto = editing?.photo || null;
  let uploadedPhoto = null;

  submit.disabled = true;
  submit.textContent = "Enregistrement…";
  setFormError("dishError", "");

  try {
    if (state.photoFile) {
      uploadedPhoto = await uploadPhoto(state.photoFile);
      values.photo = uploadedPhoto;
    } else if (state.photoRemoved) {
      values.photo = null;
    }

    const query = editing
      ? db.from("dishes").update(values).eq("id", editing.id)
      : db.from("dishes").insert({ ...values, position: nextPosition(state.dishes) });

    const { error } = await query;

    if (error) {
      throw error;
    }

    if (previousPhoto && "photo" in values) {
      await removeStoredPhoto(previousPhoto);
    }

    $("dishDialog").close();
    showToast(editing ? "Plat modifié." : "Plat ajouté.");
    await refreshData();

  } catch (error) {
    if (uploadedPhoto) {
      await removeStoredPhoto(uploadedPhoto);
    }
    setFormError("dishError", errorMessage(error));
  } finally {
    submit.disabled = false;
    submit.textContent = "Enregistrer";
  }
}

async function toggleDish(dish) {
  const { error } = await db
    .from("dishes")
    .update({ is_available: !dish.is_available })
    .eq("id", dish.id);

  if (error) {
    showToast(errorMessage(error), true);
    return;
  }

  showToast(dish.is_available ? "Plat masqué du site." : "Plat affiché sur le site.");
  await refreshData();
}

async function deleteDish(dish) {
  const confirmed = await askConfirmation(
    "Supprimer ce plat ?",
    `« ${dish.name} » sera retiré définitivement de la carte.`
  );

  if (!confirmed) {
    return;
  }

  const { error } = await db.from("dishes").delete().eq("id", dish.id);

  if (error) {
    showToast(errorMessage(error), true);
    return;
  }

  await removeStoredPhoto(dish.photo);
  showToast("Plat supprimé.");
  await refreshData();
}


/* =========================================
   FORMULAIRE CATÉGORIE
========================================= */

function openCategoryDialog(category = null) {
  state.editingCategory = category;

  $("categoryDialogTitle").textContent = category ? "Renommer la catégorie" : "Ajouter une catégorie";
  $("categoryName").value = category?.name || "";
  setFormError("categoryError", "");

  $("categoryDialog").showModal();
  $("categoryName").focus();
}

async function handleCategorySubmit(event) {
  event.preventDefault();

  const name = $("categoryName").value.trim();
  const editing = state.editingCategory;
  const slug = slugify(name);

  if (!slug) {
    setFormError("categoryError", "Le nom de la catégorie est obligatoire.");
    return;
  }

  const submit = $("categorySubmit");
  submit.disabled = true;
  setFormError("categoryError", "");

  /* Le slug reste identique lors d'un renommage. */
  const { error } = editing
    ? await db.from("categories").update({ name }).eq("id", editing.id)
    : await db.from("categories").insert({
        name,
        slug,
        position: nextPosition(state.categories)
      });

  submit.disabled = false;

  if (error) {
    setFormError("categoryError", errorMessage(error));
    return;
  }

  $("categoryDialog").close();
  showToast(editing ? "Catégorie renommée." : "Catégorie ajoutée.");
  await refreshData();
}

async function deleteCategory(category) {
  const count = state.dishes.filter(dish => dish.category_id === category.id).length;

  if (count) {
    showToast(
      `« ${category.name} » contient ${count} plat${count > 1 ? "s" : ""} : déplacez-les ou supprimez-les d'abord.`,
      true
    );
    return;
  }

  const confirmed = await askConfirmation(
    "Supprimer cette catégorie ?",
    `L'onglet « ${category.name} » disparaîtra de la carte.`
  );

  if (!confirmed) {
    return;
  }

  const { error } = await db.from("categories").delete().eq("id", category.id);

  if (error) {
    showToast(errorMessage(error), true);
    return;
  }

  showToast("Catégorie supprimée.");
  await refreshData();
}


/* =========================================
   CONFIRMATION
========================================= */

function askConfirmation(title, text) {
  const dialog = $("confirmDialog");

  $("confirmTitle").textContent = title;
  $("confirmText").textContent = text;

  return new Promise(resolve => {
    const finish = result => {
      $("confirmOk").onclick = null;
      $("confirmCancel").onclick = null;
      dialog.oncancel = null;
      dialog.close();
      resolve(result);
    };

    $("confirmOk").onclick = () => finish(true);
    $("confirmCancel").onclick = () => finish(false);
    dialog.oncancel = event => {
      event.preventDefault();
      finish(false);
    };

    dialog.showModal();
    $("confirmCancel").focus();
  });
}


/* =========================================
   ÉVÉNEMENTS
========================================= */

function handleDishRowClick(event) {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const id = Number(button.closest(".row").dataset.id);
  const dish = state.dishes.find(item => item.id === id);
  const list = visibleDishes();
  const index = list.findIndex(item => item.id === id);

  switch (button.dataset.action) {
    case "up":
      return swapPositions("dishes", dish, list[index - 1]);
    case "down":
      return swapPositions("dishes", dish, list[index + 1]);
    case "toggle":
      return toggleDish(dish);
    case "edit":
      return openDishDialog(dish);
    case "delete":
      return deleteDish(dish);
  }
}

function handleCategoryRowClick(event) {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const id = Number(button.closest(".row").dataset.id);
  const index = state.categories.findIndex(item => item.id === id);
  const category = state.categories[index];

  switch (button.dataset.action) {
    case "up":
      return swapPositions("categories", category, state.categories[index - 1]);
    case "down":
      return swapPositions("categories", category, state.categories[index + 1]);
    case "edit":
      return openCategoryDialog(category);
    case "delete":
      return deleteCategory(category);
  }
}

function switchView(view) {
  document.querySelectorAll(".view-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
  $("dishesView").hidden = view !== "dishes";
  $("categoriesView").hidden = view !== "categories";
}

function bindEvents() {
  $("loginForm").addEventListener("submit", handleLogin);
  $("logoutBtn").addEventListener("click", handleLogout);

  document.querySelectorAll(".view-tab").forEach(tab => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  $("addDishBtn").addEventListener("click", () => openDishDialog());
  $("addCategoryBtn").addEventListener("click", () => openCategoryDialog());

  $("dishForm").addEventListener("submit", handleDishSubmit);
  $("categoryForm").addEventListener("submit", handleCategorySubmit);

  $("dishPhoto").addEventListener("change", handlePhotoChosen);
  $("removePhotoBtn").addEventListener("click", handlePhotoRemoved);

  $("dishSearch").addEventListener("input", renderDishes);
  $("dishFilter").addEventListener("change", renderDishes);

  $("dishRows").addEventListener("click", handleDishRowClick);
  $("categoryRows").addEventListener("click", handleCategoryRowClick);

  document.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });

  /* La notification revient sur la page quand une modale se ferme. */
  document.querySelectorAll("dialog").forEach(dialog => {
    dialog.addEventListener("close", () => document.body.appendChild($("toast")));
  });
}


/* =========================================
   DÉMARRAGE
========================================= */

document.addEventListener("DOMContentLoaded", async () => {

  /* Refuse l'affichage dans une iframe (protection contre le clickjacking). */
  if (window.top !== window.self) {
    return;
  }

  if (!isConfigured) {
    $("authScreen").hidden = false;
    $("configNotice").hidden = false;
    $("loginForm").hidden = true;
    return;
  }

  bindEvents();

  /* Session révoquée ou expirée, y compris depuis un autre onglet. */
  db.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT") {
      stopIdleWatch();
      showLogin($("loginError").textContent);
    }
  });

  try {
    const { data: { session } } = await db.auth.getSession();

    if (session) {
      await enterDashboard(session.user);
    } else {
      showLogin("");
    }

  } catch (error) {
    showLogin(errorMessage(error));
  }

});
