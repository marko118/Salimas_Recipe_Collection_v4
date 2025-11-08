/* ===============================
   Planner v3 – Persistent Version (Revised for Planner.html)
   Uses /api/shopping_list backend
   =============================== */

console.log("Planner v3 – API-linked mode loaded (Planner.html).");

/* --- DOM references (updated IDs) --- */
const listContainer = document.getElementById("categoryGrid");   // ✅ updated
const ingredientInput = document.getElementById("ingredientInput");
const clearBtn = document.getElementById("clearListBtn");        // ✅ updated
const generateBtn = document.getElementById("exportBtn");        // ✅ updated
const saveBtn = document.getElementById("savePlannerBtn");       // ✅ new
const loadBtn = document.getElementById("loadPlannerBtn"); // ✅ new
const clearMealPlanBtn = document.getElementById("clearMealPlanBtn"); // ✅ new

/* --- Category list --- */
const categories = [
  "Dairy & Eggs",
  "Meat & Fish",
  "Chilled",
  "Frozen",
  "Produce",
  "Pantry",
  "Snacks & Drinks",
  "Toiletries",
  "Household",
  "Other"
];


let items = [];

// Prevent double add when selecting from suggestions
window.selectingSuggestion = false;

/* ===============================
   1. Fetch & Render
   =============================== */
async function loadShoppingList() {
  try {
    const res = await fetch("/api/shopping_list");
    items = await res.json();   // <— replaces the array, not append
  } catch (err) {
    console.error("Failed to load shopping list:", err);
    items = [];
  }
  renderShoppingList();
}

function renderShoppingList() {
  listContainer.innerHTML = "";

  categories.forEach(cat => {
    const box = document.createElement("div");
    box.className = "category";
    box.dataset.cat = cat;

    const title = document.createElement("h3");
    title.textContent = cat;
    box.appendChild(title);

    const ul = document.createElement("ul");
    ul.className = "item-list";

    const catItems = items.filter(
      i => (i.category || "Other") === cat && i.active === true
    );

    // ✅ Add .empty class if no items in this category
if (catItems.length === 0) {
  box.classList.add("empty");
  // ⛔ no placeholder text — keep box empty for drag/drop
} else {
  catItems.forEach(i => {

        const li = document.createElement("li");
        li.className = "item-row";
        li.draggable = true;
        li.dataset.id = i.id;
        li.dataset.category = cat;

        li.innerHTML = `
          <span class="item-name" style="${i.crossed ? "text-decoration:line-through;opacity:0.6;" : ""}">
            ${i.name}
          </span>
          <input type="text" class="amount-input" data-id="${i.id}" value="${i.amount || ""}" placeholder="1">
        `;
        ul.appendChild(li);
      });
    }

    box.appendChild(ul);
    listContainer.appendChild(box);
  });

  attachHandlers();
  enableDragDrop();
}


/* ===============================
   2. Handlers & Updates
   =============================== */
function attachHandlers() {
  // --- strike-through toggle (ordered/purchased) ---
  document.querySelectorAll(".item-name").forEach(span => {
    span.onclick = async () => {
      const id = span.closest(".item-row").dataset.id;
      const crossed = !span.style.textDecoration.includes("line-through");

      // update UI immediately
      span.style.textDecoration = crossed ? "line-through" : "none";
      span.style.opacity = crossed ? "0.6" : "1";

      try {
        const res = await fetch(`/api/shopping_list/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ crossed })
        });
        if (!res.ok) throw new Error(await res.text());
      } catch (err) {
        console.error("Cross toggle failed:", err);
      }
    };

    // --- delete on double-click (single confirm with red flash) ---
    span.ondblclick = async () => {
      const id = span.closest(".item-row").dataset.id;
      const name = span.textContent.trim();
      const li = span.closest(".item-row");

      // brief red flash to signal delete
      li.style.transition = "color 0.3s ease";
      li.style.color = "#b71c1c";

      const confirmDelete = confirm(`Delete "${name}" from list?`);
      if (!confirmDelete) {
        // cancelled → reset colour
        li.style.color = "";
        return;
      }

      try {
        const res = await fetch(`/api/shopping_list/${id}`, { method: "DELETE" });
        if (res.ok) {
          showToast(`🗑️ "${name}" removed`, "warn");
          await loadShoppingList();
        } else {
          showToast("⚠️ Delete failed", "warn");
          li.style.color = "";
        }
      } catch (err) {
        console.error("Delete failed:", err);
        showToast("⚠️ Delete error", "warn");
        li.style.color = "";
      }
    };
  });

  // --- update amount field live ---
  document.querySelectorAll(".amount-input").forEach(inp => {
    inp.oninput = async () => {
      const id = inp.dataset.id;
      const amount = inp.value.trim();
      try {
        const res = await fetch(`/api/shopping_list/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount })
        });
        if (!res.ok) throw new Error(await res.text());
      } catch (err) {
        console.error("Amount update failed:", err);
      }
    };
  });
}


/* ===============================
   3. Clear List button
   =============================== */
/* ===============================
   Clear List (double-tap confirm with red flash)
   =============================== */
if (clearBtn) {
  let confirmTimeout = null;

  clearBtn.onclick = async () => {
    if (clearBtn.dataset.confirm === "true") {
      // --- Second tap confirmed ---
      clearBtn.textContent = "Clearing...";
      clearBtn.disabled = true;
      clearBtn.classList.remove("warn");

      try {
        await fetch("/api/shopping_list/clear", { method: "POST" });
        showToast("🧹 Shopping list cleared", "success");
        await loadShoppingList();
      } catch (err) {
        console.error("Clear failed:", err);
        showToast("⚠️ Couldn't clear list", "warn");
      } finally {
        clearBtn.textContent = "Clear";
        clearBtn.disabled = false;
        clearBtn.dataset.confirm = "false";
      }
      return;
    }

    // --- First tap: ask for confirmation ---
    clearBtn.dataset.confirm = "true";
    clearBtn.classList.add("warn");             // 🔴 turn red
    const originalText = clearBtn.textContent;
    clearBtn.textContent = "Confirm Clear";

    // Reset after 3 seconds if not tapped again
    confirmTimeout = setTimeout(() => {
      clearBtn.textContent = originalText;
      clearBtn.dataset.confirm = "false";
      clearBtn.classList.remove("warn");        // reset color
    }, 3000);
  };
}


/* ===============================
   4. Drag & Drop between categories
   =============================== */
function enableDragDrop() {
  const allCats = document.querySelectorAll(".category");
  let dragged = null;

  document.querySelectorAll(".item-row").forEach(row => {
    row.addEventListener("dragstart", () => {
      dragged = row;
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      dragged = null;
    });
  });

  allCats.forEach(catBox => {
    // ✅ highlight while dragging over
    catBox.addEventListener("dragover", e => {
      e.preventDefault();
      catBox.classList.add("drag-over");
    });

    // ✅ remove highlight when leaving
    catBox.addEventListener("dragleave", () => {
      catBox.classList.remove("drag-over");
    });

    // ✅ handle drop + cleanup
    catBox.addEventListener("drop", async e => {
      e.preventDefault();
      catBox.classList.remove("drag-over");
      if (!dragged) return;

      const newCat = catBox.dataset.cat;
      const id = dragged.dataset.id;

      try {
        const res = await fetch(`/api/shopping_list/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: newCat })
        });
        if (!res.ok) throw new Error(await res.text());
        await loadShoppingList();
      } catch (err) {
        console.error("Category move failed:", err);
      }
    });
  });
}


/* ===============================
   5. Ingredient input → add on Enter (manual only)
   =============================== */
if (ingredientInput) {
  ingredientInput.addEventListener("keydown", async e => {
    const suggestBox = document.getElementById("suggestBox");

    // --- Enter pressed ---
    if (e.key === "Enter") {
      e.preventDefault();

      // If we're selecting or a suggestion is highlighted, skip manual add
      const activeItem = suggestBox.querySelector(".active");
      if (window.selectingSuggestion || (!suggestBox.hidden && activeItem)) {
        return; // let Section 6B handle it
      }

      // Otherwise add the manually typed text
      const name = ingredientInput.value.trim();
      if (!name) return;

      const detected = detectCategory(name);
      const cat = detected === "Other" ? null : detected;

      await addNewItem(name, cat);
      ingredientInput.value = "";
      suggestBox.hidden = true; // close suggestions
    }
  });
}



/* ===============================
   6. Add new item (de-dupe safe)
   =============================== */
async function addNewItem(name, category) {
  try {
    // Normalize name
    const lower = name.toLowerCase().trim();

    // 🔒 If the item already exists in the current list, reuse its stored category
    const existing = items.find(i => i.name.toLowerCase() === lower);
    if (existing) {
      category = existing.category || category || "Other";
    }

    const res = await fetch("/api/shopping_list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category })
    });

    if (!res.ok) {
      console.error("Add item failed:", await res.text());
      return;
    }

    const data = await res.json();
    if (!data || !data.id) {
      console.warn("No valid item data returned:", data);
      return;
    }

    const exists = items.some(
      i => i.id === data.id || i.name.toLowerCase() === lower
    );

    if (!exists) {
      items.push({
        id: data.id,
        name: data.name || name,
        category: data.category || category || "Other",
        crossed: false,
        amount: "",
        active: true
      });
    } else {
      items = items.map(i =>
        i.id === data.id
          ? { ...i, category: data.category || i.category }
          : i
      );
    }

    renderShoppingList();

    // 🎨 Highlight the newly added list item
    const targetCat = data.category || category || "Other";
    const catBox = document.querySelector(`.category[data-cat="${targetCat}"]`);

    if (catBox) {
      // find the last list item inside this category
      const listItems = catBox.querySelectorAll("li.item-row");
      const newestItem = listItems[listItems.length - 1];
      if (newestItem) {
        newestItem.classList.add("flash");
        setTimeout(() => newestItem.classList.remove("flash"), 700);
      }
    }

    console.log(`✅ Added/updated '${name}' in category '${targetCat}'.`);
  } catch (err) {
    console.error("addNewItem() failed:", err);
  }
}



/* ===============================
   6B. Suggestion dropdown with keyboard navigation
   =============================== */
if (ingredientInput) {
  const suggestBox = document.getElementById("suggestBox");
  let activeIndex = -1;

  async function showSuggestions(query) {
    if (!query) {
      suggestBox.hidden = true;
      return;
    }

    try {
      const res = await fetch(`/api/shopping_list/suggestions?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(await res.text());
      const suggestions = await res.json();

      suggestBox.innerHTML = "";
      activeIndex = -1;

      // === sort so “starts with” appear first ===
      const startsWith = [];
      const contains = [];
      suggestions.forEach(name => {
        name.toLowerCase().startsWith(query.toLowerCase())
          ? startsWith.push(name)
          : contains.push(name);
      });
      const sorted = [...startsWith, ...contains];

      sorted.forEach(name => {
        const item = document.createElement("div");
        item.className = "suggest-item";
        item.textContent = name;

        item.onclick = async () => {
          window.selectingSuggestion = true;
          const detected = detectCategory(name);
          const cat = detected === "Other" ? null : detected;
          await addNewItem(name, cat);
          ingredientInput.value = "";
          suggestBox.hidden = true;
          window.selectingSuggestion = false;
        };

        suggestBox.appendChild(item);
      });

      // hide if perfect match already typed
      const exactMatch = sorted.some(s => s.toLowerCase() === query.toLowerCase());
      suggestBox.hidden = sorted.length === 0 || exactMatch;
    } catch (err) {
      console.error("Suggestion fetch failed:", err);
      suggestBox.hidden = true;
    }
  }

  ingredientInput.addEventListener("input", e => {
    const query = e.target.value.trim();
    showSuggestions(query);
  });

  ingredientInput.addEventListener("keydown", async e => {
    const items = suggestBox.querySelectorAll(".suggest-item");
    if (suggestBox.hidden || items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < items.length) {
        window.selectingSuggestion = true;
        const name = items[activeIndex].textContent;
        const detected = detectCategory(name);
        const cat = detected === "Other" ? null : detected;
        await addNewItem(name, cat);
        ingredientInput.value = "";
        suggestBox.hidden = true;
        window.selectingSuggestion = false;
      }
      return;
    } else {
      return;
    }

    items.forEach((item, idx) =>
      item.classList.toggle("active", idx === activeIndex)
    );
  });

  // hide box when clicking outside or clearing field
  document.addEventListener("click", e => {
    if (!suggestBox.contains(e.target) && e.target !== ingredientInput) {
      suggestBox.hidden = true;
    }
  });
}


/* ===============================
   7. Clear meal plan (independent)
   =============================== */
/* ===============================
   Clear Meal Plan (double-tap confirm)
   =============================== */
if (clearMealPlanBtn) {
  let confirmTimeout = null;

  clearMealPlanBtn.onclick = async () => {
    if (clearMealPlanBtn.dataset.confirm === "true") {
      // --- Second tap confirmed ---
      clearMealPlanBtn.textContent = "Clearing...";
      clearMealPlanBtn.disabled = true;

      // 1️⃣ Remove saved plan from localStorage
      localStorage.removeItem("salimaMealPlan");

      // 2️⃣ Clear the visual grid
      const grid = document.getElementById("mealGridContainer");
      if (grid) grid.innerHTML = "";

      // 3️⃣ Rebuild empty grid (respect current toggle)
      const startDay = document.getElementById("dayToggle")?.value || "sun";
      if (typeof buildMealGrid === "function") {
        buildMealGrid(startDay);
      }

      // 4️⃣ Show feedback
      showToast("🧽 Meal plan cleared");

      // 5️⃣ Reset button
      clearMealPlanBtn.textContent = "Clear Meal Plan";
      clearMealPlanBtn.disabled = false;
      clearMealPlanBtn.dataset.confirm = "false";

      return;
    }

    // --- First tap: ask for confirmation ---
    clearMealPlanBtn.dataset.confirm = "true";
    const originalText = clearMealPlanBtn.textContent;
    clearMealPlanBtn.textContent = "Tap again to confirm";

    confirmTimeout = setTimeout(() => {
      clearMealPlanBtn.textContent = originalText;
      clearMealPlanBtn.dataset.confirm = "false";
    }, 3000);
  };
}




/* ===============================
   8. Save Planner (combined snapshot)
   =============================== */
if (saveBtn) {
  saveBtn.onclick = async () => {
    const plannerData = {
      timestamp: new Date().toISOString(),
      shopping_list: items,
      recipes: JSON.parse(localStorage.getItem("selectedRecipes") || "[]"),
      meal_plan: document.getElementById("mealGridContainer").innerHTML
    };
    await fetch("/api/planner/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(plannerData)
    });
    showToast("💾 Planner saved successfully.");
  };
}


/* ===============================
   Load Planner button
   =============================== */
if (loadBtn) {
  loadBtn.onclick = async () => {
    try {
      // 1️⃣ Fetch list of saved plans
      const res = await fetch("/api/planner/list");
      const plans = await res.json();

      if (!plans.length) {
        showToast("No saved plans found", "warn");
        return;
      }

      // 2️⃣ Ask user which plan to load
      const names = plans
        .map(p => `${p.id}: ${p.name} (${p.created.slice(0, 16)})`)
        .join("\n");
      const choice = prompt(
        `Enter the ID of the plan to load:\n\n${names}`
      );
      if (!choice) return;

      // 3️⃣ Fetch and load the chosen plan
      const loadRes = await fetch(`/api/planner/load/${choice.trim()}`);
      if (!loadRes.ok) throw new Error(await loadRes.text());
      const planData = await loadRes.json();

      console.log("Loaded plan:", planData);

      // === Apply loaded plan data to UI ===
if (!planData || Object.keys(planData).length === 0) {
  showToast("⚠️ This saved plan is empty", "warn");
  return;
}

// 1️⃣ Replace shopping list data and re-render
if (planData.shoppingList && Array.isArray(planData.shoppingList)) {
  items = planData.shoppingList;
  renderShoppingList();
}

// 2️⃣ Restore recipes + ingredients
if (planData.recipes && Array.isArray(planData.recipes) && planData.recipes.length > 0) {
  localStorage.setItem("selectedRecipes", JSON.stringify(planData.recipes));
  if (typeof loadSelectedRecipes === "function") {
    await loadSelectedRecipes();
  } else {
    console.warn("planner_recipes.js not yet loaded");
  }
}

// 3️⃣ Restore meal plan grid (AFTER everything else)
if (planData.mealPlanHTML) {
  const grid = document.getElementById("mealGridContainer");
  if (grid) grid.innerHTML = planData.mealPlanHTML;
}





      // 4️⃣ Refresh UI
      attachHandlers();
      enableDragDrop();

      showToast(`✅ "${planData.planName || "Meal Plan"}" loaded`, "success");
    } catch (err) {
      console.error("Load failed:", err);
      showToast("⚠️ Couldn't load plan", "warn");
    }
  };
}



/* ===============================
   9. Copy / Share current shopping list
   =============================== */
if (generateBtn) {
  generateBtn.onclick = () => {
    const lines = [];
    categories.forEach(cat => {
      const catItems = items.filter(i => i.category === cat && i.active === true);
      if (!catItems.length) return;

      lines.push(`${cat.toUpperCase()}:`);
      catItems.forEach(i => {
        const symbol = i.crossed ? "✗" : "•";
        const name = i.amount ? `${i.name} (${i.amount})` : i.name;
        lines.push(`${symbol} ${name}`);
      });
      lines.push(""); // blank line between categories
    });

    const plainText = lines.join("\n");
    navigator.clipboard.writeText(plainText)
      .then(() => showToast("📋 Shopping list copied to clipboard"))
      .catch(() => showToast("⚠️ Copy failed", "warn"));
  };
}




/* ===============================
   10. Category detection
   =============================== */
const KEYMAP = {
  "Dairy & Eggs": ["milk","cheese","cream","butter","yog","egg"],
  "Produce": ["apple","banana","tomato","onion","pepper","carrot","potato","garlic","lettuce","spinach","herb","lemon","lime","mushroom","broccoli"],
  "Meat & Fish": ["chicken","beef","lamb","ham","bacon","pork","turkey","fish","salmon","tuna","sausage","mince"],
  "Frozen": ["frozen","peas","ice","chips","sweetcorn","berries","pizza"],
  "Pantry": ["bread","rice","pasta","oil","salt","flour","spice","sugar","sauce","tin","jar","stock","broth","cereal"],
  "Snacks & Drinks": ["crisps","bar","chocolate","sweet","biscuit","snack","juice","soda","cola","drink","coffee","tea"],
  "Toiletries": ["soap","toothpaste","tooth","colgate","aquafresh","shampoo","roll","tissue"],
  "Other": []
};

function detectCategory(name) {
  const lower = name.toLowerCase();
  for (const [cat, words] of Object.entries(KEYMAP)) {
    for (const w of words) {
      const regex = new RegExp(`\\b${w}\\b`, "i"); // match whole word only
      if (regex.test(lower)) return cat;
    }
  }
  return "Other";
}

/* ===============================
   11. Toast Notifications
   =============================== */
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // fade out
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
  }, 2200);

  // remove from DOM
  setTimeout(() => toast.remove(), 3000);
}

// === SAVE PLANNER SNAPSHOT ===
async function maybeSavePlanner() {
  const confirmSave = confirm("Would you like to save this meal plan for later?");
  if (!confirmSave) return;

  const snapshot = collectPlannerSnapshot();

  try {
    const response = await fetch("/api/planner/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: snapshot, name: snapshot.planName })
    });
    const result = await response.json();

    if (result.status === "ok") {
      showToast(`Meal Plan Saved (${result.name})`, "success");
    } else {
      showToast("Error saving meal plan", "error");
    }
  } catch (err) {
    console.error("Save failed:", err);
    showToast("Network error saving plan", "error");
  }
}

/* ===============================
   SNAPSHOT COLLECTOR
   =============================== */
function collectPlannerSnapshot() {
  const gridHTML = document.getElementById("mealGridContainer")?.innerHTML || "";
  const recipes = JSON.parse(localStorage.getItem("selectedRecipes") || "[]");
  const shoppingList = items || [];

  const { cycle, startDay, gridDates } = determinePlannerCycle();

  return {
    timestamp: new Date().toISOString(),
    planName: `Week of ${gridDates[startDay]}`,
    startDay,
    cycle,
    gridDates,
    mealPlanHTML: gridHTML,
    recipes,
    shoppingList
  };
}

function determinePlannerCycle() {
  const today = new Date();
  const day = today.getDay(); // 0=Sun ... 6=Sat
  let cycle, startDay;

  if (day >= 1 && day <= 3) { // Mon–Wed → mid-week plan
    cycle = "Wed–Sun";
    startDay = "Wednesday";
  } else {
    cycle = "Sun–Wed";
    startDay = "Sunday";
  }

  const gridDates = getGridDates(startDay, today);
  return { cycle, startDay, gridDates };
}

function getGridDates(startDay, refDate) {
  const gridDays = startDay === "Sunday"
    ? ["Sunday", "Monday", "Tuesday", "Wednesday"]
    : ["Wednesday", "Thursday", "Friday", "Sunday"];

  const dates = {};
  let base = new Date(refDate);
  base.setDate(base.getDate() + ((7 + gridDays.indexOf(startDay) - base.getDay()) % 7));

  gridDays.forEach((day, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    dates[day] = d.toISOString().split("T")[0];
  });

  return dates;
}



/* ===============================
   12. Init
   =============================== */
document.addEventListener("DOMContentLoaded", loadShoppingList);
