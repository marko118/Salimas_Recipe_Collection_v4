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
const clearMealPlanBtn = document.getElementById("clearMealPlanBtn"); // ✅ new

/* --- Category list --- */
const categories = [
  "Produce", "Dairy & Eggs", "Meat & Fish",
  "Pantry", "Frozen", "Snacks", "Toiletries", "Other"
];

let items = [];

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

    items
      .filter(i => (i.category || "Other") === cat && i.active === true)
      .forEach(i => {
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

    // --- delete on double-click ---
    span.ondblclick = async () => {
      const id = span.closest(".item-row").dataset.id;
      const name = span.textContent.trim();
      if (confirm(`Delete "${name}" from list?`)) {
        try {
          const res = await fetch(`/api/shopping_list/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error(await res.text());
          await loadShoppingList();
        } catch (err) {
          console.error("Delete failed:", err);
        }
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
if (clearBtn) {
  clearBtn.onclick = async () => {
    if (confirm("Start a new shopping list for everyone?")) {
      try {
        const res = await fetch("/api/shopping_list/clear", { method: "POST" });
        if (!res.ok) throw new Error(await res.text());
        await loadShoppingList(); // reloads empty list
        console.log("🧹 Cleared: new shared list started.");
      } catch (err) {
        console.error("Clear failed:", err);
      }
    }
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
    catBox.addEventListener("dragover", e => e.preventDefault());
    catBox.addEventListener("drop", async e => {
      e.preventDefault();
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
   5. Ingredient input → add on Enter
   =============================== */
if (ingredientInput) {
  ingredientInput.addEventListener("keydown", async e => {
    if (e.key === "Enter") {
      e.preventDefault();
      const name = ingredientInput.value.trim();
      if (!name) return;
      const cat = detectCategory(name);
      await addNewItem(name, cat);
      ingredientInput.value = "";
    }
  });
}

/* ===============================
   6. Add new item (de-dupe safe)
   =============================== */
async function addNewItem(name, category) {
  try {
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

    // prevent duplicates in memory
    const lower = name.toLowerCase();
    const exists = items.some(
      i => i.id === data.id || i.name.toLowerCase() === lower
    );

    if (!exists) {
      items.push({
  id: data.id,
  name: data.name || name,
  category: data.category || category,
  crossed: false,
  amount: "",
  active: true    // ✅ ensure it passes render filter
});

    } else {
      // update existing category if changed
      items = items.map(i =>
        i.id === data.id
          ? { ...i, category: data.category || i.category }
          : i
      );
    }

    renderShoppingList(); // refresh UI
    console.log(`✅ Added/updated '${name}' in category '${category}'.`);
  } catch (err) {
    console.error("addNewItem() failed:", err);
  }
}

/* ===============================
   7. Clear meal plan (independent)
   =============================== */
if (clearMealPlanBtn) {
  clearMealPlanBtn.onclick = () => {
    if (confirm("Clear all meal plan selections?")) {
      const selects = document.querySelectorAll("#mealGridContainer select");
      selects.forEach(sel => (sel.value = ""));
      console.log("Meal plan cleared");
    }
  };
}




if (clearMealPlanBtn) {
  clearMealPlanBtn.onclick = () => {
    if (confirm("Clear all meal plan selections?")) {
      const selects = document.querySelectorAll("#mealGridContainer select");
      selects.forEach(sel => (sel.value = ""));
      console.log("Meal plan cleared");
    }
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
    alert("💾 Planner saved successfully.");
  };
}

/* ===============================
   9. Overlay list
   =============================== */
if (generateBtn) {
  generateBtn.onclick = async () => {
    const overlay = document.getElementById("overlay");
    const content = document.getElementById("overlayContent");
    const dateBox = document.getElementById("overlayDate");

    dateBox.textContent = new Date().toLocaleString();
    content.innerHTML = "";

    categories.forEach(cat => {
      const catItems = items.filter(i => i.category === cat && i.active === true);
      if (!catItems.length) return;
      const header = document.createElement("div");
      header.textContent = cat.toUpperCase() + ":";
      header.style.fontWeight = "bold";
      content.appendChild(header);
      catItems.forEach(i => {
        const line = document.createElement("div");
        line.textContent = `• ${i.name}${i.amount ? ` (${i.amount})` : ""}`;
        if (i.crossed) {
          line.style.textDecoration = "line-through";
          line.style.opacity = "0.6";
        }
        content.appendChild(line);
      });
    });

    overlay.hidden = false;
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
  "Snacks": ["crisps","bar","chocolate","sweet","biscuit","snack"],
  "Toiletries": ["soap","toothpaste","tooth","colgate","aquafresh","shampoo","roll","tissue"],
  "Other": []
};

function detectCategory(name) {
  const lower = name.toLowerCase();
  for (const [cat, words] of Object.entries(KEYMAP)) {
    if (words.some(w => lower.includes(w))) return cat;
  }
  return "Other";
}

/* ===============================
   11. Init
   =============================== */
document.addEventListener("DOMContentLoaded", loadShoppingList);
