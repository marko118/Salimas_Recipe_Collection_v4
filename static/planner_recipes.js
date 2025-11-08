// === Planner v3 — Recipes in Planner (Interactive) ===
console.log("planner_recipes.js loaded");

const container = document.getElementById("recipesContainer");
const EXCLUDE_KEY = "salimaPlannerV3_excluded";  // shared with planner_v3.js

// --- Helpers to persist exclusions ---
function loadExcluded() {
  try { return JSON.parse(localStorage.getItem(EXCLUDE_KEY)) || {}; }
  catch { return {}; }
}
function saveExcluded(obj) {
  localStorage.setItem(EXCLUDE_KEY, JSON.stringify(obj));
}

// --- Load selected recipes from localStorage ---
async function loadSelectedRecipes() {
  const stored = JSON.parse(localStorage.getItem("selectedRecipes") || "[]");
  if (!stored.length) {
    container.innerHTML = "<p>No recipes selected yet.</p>";
    return;
  }

  const ids = stored.map(r => (r.id ? r.id : r)).filter(Boolean);
  try {
    const resp = await fetch(`/api/selected?ids=${ids.join(",")}`);
    const json = await resp.json();
    if (!json.meals || !json.meals.length) {
      container.innerHTML = "<p>No recipe data available.</p>";
      return;
    }
    renderRecipes(json.meals);
  } catch (err) {
    console.error("Error loading recipes:", err);
    container.innerHTML = "<p>Error loading recipes.</p>";
  }
}

// --- Render recipes with links, close buttons, and drag support ---
function renderRecipes(meals) {
  const excluded = loadExcluded();

  container.innerHTML = meals
    .map(meal => {
      const list = (meal.ingredients || [])
        .map(i => {
          const key = `${meal.id}:${i}`;
          const checked = !excluded[key];
          return `
            <li>
              <input type="checkbox" data-meal="${meal.id}" data-ing="${i}" ${checked ? "checked" : ""}>
              ${i}
            </li>
          `;
        })
        .join("");

      // --- Build recipe title and external link ---
      const externalLink = meal.url || meal.recipe_link || `/recipe/${meal.id}`;
      const titleHTML = `
        <a href="${externalLink}" target="_blank" rel="noopener noreferrer" class="link-icon" title="Open recipe source">🔗</a>
        <a href="/recipe/${meal.id}" class="recipe-title" title="View recipe details">${meal.name}</a>
      `;

      return `
        <div class="recipe-card" draggable="true" data-id="${meal.id}" data-recipe="${meal.name}">
          <div class="recipe-header">
            <h4>${titleHTML}</h4>
            <button class="remove-recipe" data-id="${meal.id}" title="Remove from planner">✖</button>
          </div>
          <ul>${list}</ul>
        </div>
      `;
    })
    .join("");

  attachRecipeHandlers();

  /* ===============================
     Add checked recipe ingredients to shopping list (preserves learned category)
     =============================== */
  const addToListBtn = document.getElementById("importFromRecipesBtn");

  if (addToListBtn) {
    addToListBtn.addEventListener("click", async () => {
      const checkedBoxes = document.querySelectorAll(
        "#recipesContainer input[type='checkbox']:checked"
      );

      if (!checkedBoxes.length) {
        showToast("No ingredients selected.");
        return;
      }

      let addedCount = 0;

      for (const box of checkedBoxes) {
        const ingredientName = (box.dataset.ing || "").trim();
        if (!ingredientName) continue;

        // 🧠 Detect category but send null for "Other" so backend keeps stored one
        let cat = detectCategory(ingredientName);
        if (!cat || cat === "Other") cat = null;

        await addNewItem(ingredientName, cat);
        addedCount++;

        // Visual feedback
        box.checked = false;
        box.disabled = true;
        box.style.opacity = "0.5";
      }

      showToast(`✅ Added ${addedCount} ingredients to shopping list.`);
    });
  }

  // --- Enable drag start for cards ---
  container.querySelectorAll(".recipe-card").forEach(card => {
    card.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", card.dataset.recipe);
      e.dataTransfer.effectAllowed = "copy";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  });

  // --- Handle remove button ---
  container.querySelectorAll(".remove-recipe").forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      let stored = JSON.parse(localStorage.getItem("selectedRecipes") || "[]");
      stored = stored.filter(r => r !== id && r.id !== id);
      localStorage.setItem("selectedRecipes", JSON.stringify(stored));
      btn.closest(".recipe-card").remove();
      showToast("❌ Recipe removed from planner", "warn");
      updateMealCount(); // keeps the count in sync
    };
  });
}


// --- Checkbox handler updates localStorage exclusions ---
function attachRecipeHandlers() {
  const excluded = loadExcluded();
  container.querySelectorAll("input[type='checkbox']").forEach(box => {
    box.onchange = () => {
      const key = `${box.dataset.meal}:${box.dataset.ing}`;
      if (box.checked) {
        delete excluded[key];
      } else {
        excluded[key] = true;
      }
      saveExcluded(excluded);
    };
  });
}

// --- Initial load ---
if (container) loadSelectedRecipes();
