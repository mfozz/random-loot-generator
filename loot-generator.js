
// === RLG Debug + Source Count Helpers ===
const RLG_DEBUG = () => {
  try { return game.settings.get("random-loot-generator", "debugLogging"); } catch (e) { return false; }
};
const rlgDebug = (...args) => { if (RLG_DEBUG()) console.debug("[RLG]", ...args); };

const _rlgCountCache = { packs: new Map(), folders: new Map(), tables: new Map() };

async function rlgCountPackItems(pack) {
  try {
    if (!pack || !pack.metadata || pack.metadata.type !== "Item") {
      rlgDebug(`Pack ${pack?.collection || 'unknown'} is not an Item compendium (type: ${pack?.metadata?.type || 'none'})`);
      return 0;
    }
    if (_rlgCountCache.packs.has(pack.collection)) {
      rlgDebug(`Cache hit for pack ${pack.collection}: ${_rlgCountCache.packs.get(pack.collection)} items`);
      return _rlgCountCache.packs.get(pack.collection);
    }
    const index = await pack.getIndex?.();
    const n = index?.size ?? 0;
    _rlgCountCache.packs.set(pack.collection, n);
    rlgDebug(`Counted ${n} items in pack ${pack.collection}`);
    return n;
  } catch (e) {
    rlgDebug("Pack count failed", pack?.collection, e);
    return 0;
  }
}

function rlgCountFolderItems(folderId) {
  try {
    if (!folderId) return 0;
    if (_rlgCountCache.folders.has(folderId)) return _rlgCountCache.folders.get(folderId);
    const folder = game.folders.get(folderId);
    if (!folder) return 0;
    let count = 0;
    const walk = (f) => {
      for (const d of (f.contents ?? [])) if (d?.documentName === "Item" || d?.constructor?.documentName === "Item") count++;
      for (const sf of (f.children ?? [])) walk(sf);
    };
    walk(folder);
    _rlgCountCache.folders.set(folderId, count);
    return count;
  } catch (e) {
    rlgDebug("Folder count failed", folderId, e);
    return 0;
  }
}

function rlgCountResolvableTableRows(table) {
  try {
    if (!table) return 0;
    if (_rlgCountCache.tables.has(table.id)) return _rlgCountCache.tables.get(table.id);

    const results = table.results ?? [];
    const resolvable = results.filter(r =>
      r?.type === "document" &&
      typeof r.documentCollection === "string" &&
      !!r.documentId
    ).length;

    _rlgCountCache.tables.set(table.id, resolvable);
    rlgDebug(`Counted table rows for ${table.name}: resolvable=${resolvable}`);
    return resolvable;
  } catch (e) {
    rlgDebug("Table count failed", table?.id, e);
    return 0;
  }
}




async function rlgDecorateSourceDialog(app, html) {
  rlgInsertStylesOnce(app);
  const $html = $(html);
  _rlgCountCache.packs.clear();
  _rlgCountCache.folders.clear();
  _rlgCountCache.tables.clear();
  rlgDebug("Cleared count cache for dialog render");

  // Wait longer for DOM to stabilize
  await new Promise(resolve => setTimeout(resolve, 300));

  const labels = $html.find('label').filter(function () {
    return $(this).find('input[name="compendium"], input[name="folder"], input[name="table"]').length > 0;
  });

  if (!labels.length) {
    rlgDebug("No matching labels found in dialog", app.title);
    return;
  }

for (const label of labels) {
  const $label = $(label);
  const $input = $label.find('input');
  const $span  = $label.find('span');
  if (!$span.length) {
    rlgDebug("No span found in label", $label.html());
    continue;
  }
  const type  = $input.attr('name');
  const value = $input.val();
  let count = 0;

  // Hoist for catch safety
  const currentText = $span.text().trim();

  try {
    if (type === 'compendium') {
      const pack = game.packs.get(value);
      count = await rlgCountPackItems(pack);
    } else if (type === 'folder') {
      count = rlgCountFolderItems(value);
    } else if (type === 'table') {
      const table = game.tables.get(value);
      count = rlgCountResolvableTableRows(table);
    }

    // Append "(N)" only if missing
    if (!/\(\d+\)$/.test(currentText)) {
      $span.text(`${currentText} (${count})`);
    }

    if (count === 0) {
      $label.addClass('rlg-source--disabled');
      $input.prop('disabled', true).prop('checked', false);
      $label.attr('title', game.i18n.localize("RLG.NoItemsFound"));
      $input.attr('title', game.i18n.localize("RLG.NoItemsFound"));
      $input.css({ cursor: 'not-allowed' });
      rlgDebug(`Applied rlg-source--disabled, unchecked, title, and cursor for ${type} source: ${value}`);
    } else {
      $label.removeClass('rlg-source--disabled');
      $input.prop('disabled', false);
      $label.removeAttr('title');
      $input.removeAttr('title');
      $input.css({ cursor: '' });
    }

    rlgDebug(`Decorated ${type} source: ${value} with count ${count}`);
  } catch (e) {
    rlgDebug(`Failed to decorate ${type} source: ${value}`, e);

    // Keep the "(N)" if already present; otherwise show (0)
    $span.text(/\(\d+\)$/.test(currentText) ? currentText : `${currentText} (0)`);

    $label.addClass('rlg-source--disabled');
    $input.prop('disabled', true).prop('checked', false);
    $label.attr('title', game.i18n.localize("RLG.NoItemsFound"));
    $input.attr('title', game.i18n.localize("RLG.NoItemsFound"));
    $input.css({ cursor: 'not-allowed' });
    rlgDebug(`Applied rlg-source--disabled, unchecked, title, and cursor for ${type} source: ${value} (error case)`);
    rlgDebug(`Label title: ${$label.attr('title')}, Input disabled: ${$input.prop('disabled')}, Input cursor: ${$input.css('cursor')}, Input title: ${$input.attr('title')}`);
  }
}


  // Re-apply attributes after a second delay to counter post-rendering changes
  setTimeout(() => {
    labels.each((i, label) => {
      const $label = $(label);
      const $input = $label.find('input');
      const type = $input.attr('name');
      const value = $input.val();
      const count = type === 'compendium' ? _rlgCountCache.packs.get(value) || 0 :
                    type === 'folder' ? _rlgCountCache.folders.get(value) || 0 :
                    type === 'table' ? _rlgCountCache.tables.get(value) || 0 : 0;
      if (count === 0) {
        $label.addClass('rlg-source--disabled');
        $input.prop('disabled', true);
        $input.prop('checked', false);
        $label.attr('title', game.i18n.localize("RLG.NoItemsFound"));
        $input.attr('title', game.i18n.localize("RLG.NoItemsFound"));
        $input.css({ cursor: 'not-allowed' });
        rlgDebug(`Re-applied attributes for ${type} source: ${value} after delay`);
        rlgDebug(`Re-applied - Label title: ${$label.attr('title')}, Input disabled: ${$input.prop('disabled')}, Input cursor: ${$input.css('cursor')}, Input title: ${$input.attr('title')}`);
      }
    });
  }, 500);
}


// === End Helpers ===



// === RLG Debug + Source Count Helpers ===
function rlgInsertStylesOnce(app) {
  const styleId = `rlg-styles-${app.id || 'global'}`;
  if (app.element?.[0].querySelector(`#${styleId}`) || document.querySelector(`#${styleId}`)) return;
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    div#${app.id || 'app'}.app.window-app.dialog.themed.theme-light input:disabled {
      cursor: not-allowed !important;
      pointer-events: none !important;
    }
    div#${app.id || 'app'}.app.window-app.dialog.themed.theme-light label:has(input:disabled) {
      pointer-events: none !important;
    }
  `;
  const dialogContent = app.element?.[0]?.querySelector('.dialog-content') || app.element?.[0] || document.head;
  dialogContent.appendChild(style);
  rlgDebug(`Inserted RLG styles for dialog ${app.id || 'global'} into ${dialogContent === document.head ? 'document.head' : 'dialog content'}`);
}

function rlgNormalizeRarity(r) {
  if (!r || typeof r !== "string") return "Common";
  const s = r.trim().toLowerCase();
  if (!s) return "Common";
  if (s.includes("very") && s.includes("rare")) return "Very Rare";
  return s.replace(/\b\w/g, c => c.toUpperCase());
}


class LootGenerator {
    constructor() {
        this.moduleName = "random-loot-generator";
        this.lootPreviewEnabled = false;
        this.selectedCompendiums = [];
        this.selectedFolders = [];
        this.selectedTables = [];
        this.generateLootForTokens = this.generateLootForTokens.bind(this);
        this.applyLoot = this.applyLoot.bind(this);
        
    }

    loadSettings() {
      try {
        console.log("Loading settings...");
        this.lootPreviewEnabled = game.settings.get(this.moduleName, "enableLootPreview");
let rawCompendiums = game.settings.get(this.moduleName, "selectedCompendiums"); 
        let loadedFolders = game.settings.get(this.moduleName, "selectedFolders") || [];
        let loadedTables = game.settings.get(this.moduleName, "lootTables") || [];

        console.log("Raw settings - Compendiums:", rawCompendiums, "Folders:", loadedFolders, "Tables:", loadedTables);

if (rawCompendiums === undefined) {
  // First run: use a sensible default.
  this.selectedCompendiums = ["dnd5e.tradegoods"];
} else if (typeof rawCompendiums === "string") {
  // Empty string means the GM explicitly chose "none".
  const parts = rawCompendiums.split(",").map(c => c.trim()).filter(Boolean);
  this.selectedCompendiums = parts.filter(comp => {
    const exists = game.packs.get(comp);
    if (!exists) console.warn(`Compendium ${comp} not found in game.packs`);
    return exists;
  });
} else if (Array.isArray(rawCompendiums)) {
  this.selectedCompendiums = rawCompendiums.filter(comp => {
    const exists = game.packs.get(comp);
    if (!exists) console.warn(`Compendium ${comp} not found in game.packs`);
    return exists;
  });
} else {
  // Any other saved type: treat as none.
  this.selectedCompendiums = [];
}


        this.selectedFolders = Array.isArray(loadedFolders)
            ? loadedFolders.filter(id => {
                const exists = game.folders.get(id);
                if (!exists) console.warn(`Folder ${id} not found in game.folders`);
                return exists;
            })
            : [];

        this.selectedTables = Array.isArray(loadedTables)
            ? loadedTables.filter(id => {
                const exists = game.tables.get(id);
                if (!exists) console.warn(`Table ${id} not found in game.tables`);
                return exists;
            })
            : [];

        // Log creatureTypeLoot settings for debugging
        let creatureTypeLoot = game.settings.get(this.moduleName, "creatureTypeLoot") || {};
        Object.entries(creatureTypeLoot).forEach(([type, settings]) => {
            console.log(`Creature type ${type} settings:`, {
                compendiums: settings.compendiums,
                folders: settings.folders,
                tables: settings.tables
            });
        });

        console.log("Processed selectedCompendiums:", this.selectedCompendiums);
        console.log("Processed selectedFolders:", this.selectedFolders);
        console.log("Processed selectedTables:", this.selectedTables);
        console.log("Settings loaded:", {
            lootPreviewEnabled: this.lootPreviewEnabled,
            selectedCompendiums: this.selectedCompendiums,
            selectedFolders: this.selectedFolders,
            selectedTables: this.selectedTables
        });
    
      } catch (err) {

        console.error('Random Loot Generator: Failed to load settings', err);

        ui.notifications?.error('Random Loot Generator failed to load saved settings. Check console.');

      }}

    async generateLootForTokens(tokens) {
        console.log("generateLootForTokens called with tokens:", tokens);
        if (!tokens.length) {
            ui.notifications.warn(game.i18n.localize("RLG.Notification.NoTokensSelected"));
            return;
        }
        let lootAssignments = {};
        for (let token of tokens) {
            let creatureType = token.actor?.system?.details?.type?.value || "humanoid";
            let loot = await this.getRandomLoot(creatureType, token);
            lootAssignments[token.id] = loot;
        }
        if (this.lootPreviewEnabled) {
            console.log("Showing loot preview...");
            this.showLootPreview(lootAssignments, tokens);
        } else {
            console.log("Applying loot directly...");
            this.applyLoot(lootAssignments);
        }
    }

    async getRandomLoot(creatureType = "humanoid", token) {
        let creatureLootSettings = game.settings.get(this.moduleName, "creatureTypeLoot") || {};
        let typeSettings = creatureLootSettings[creatureType] || {};

        // Check for token-specific settings
        let lootSettings = {};
        const customLootEnabled = await token.actor.getFlag(this.moduleName, "customLootEnabled") || false;
        if (customLootEnabled) {
            lootSettings = (await token.actor.getFlag(this.moduleName, "lootSettings")) || {};
            console.log(`Using custom loot settings for ${token.name}:`, lootSettings);
        } else {
            lootSettings = typeSettings;
            console.log(`Using creature type settings for ${creatureType}:`, lootSettings);
        }

        let hasTypeSettings = customLootEnabled ? (
            (Array.isArray(lootSettings.compendiums) && lootSettings.compendiums.length > 0) ||
            (Array.isArray(lootSettings.folders) && lootSettings.folders.length > 0) ||
            (Array.isArray(lootSettings.tables) && lootSettings.tables.length > 0)
        ) : (
            (Array.isArray(typeSettings.compendiums) && typeSettings.compendiums.length > 0) ||
            (Array.isArray(typeSettings.folders) && typeSettings.folders.length > 0) ||
            (Array.isArray(typeSettings.tables) && typeSettings.tables.length > 0)
        );

        let selectedCompendiums = hasTypeSettings
            ? (Array.isArray(lootSettings.compendiums) ? lootSettings.compendiums : [])
            : (this.selectedCompendiums.length > 0 ? this.selectedCompendiums : game.settings.get(this.moduleName, "selectedCompendiums").split(",").map(comp => comp.trim()).filter(comp => comp && game.packs.get(comp)));
        let selectedFolders = hasTypeSettings
            ? (Array.isArray(lootSettings.folders) ? lootSettings.folders : [])
            : (this.selectedFolders.length > 0 ? this.selectedFolders : game.settings.get(this.moduleName, "selectedFolders") || []);
        let selectedTables = hasTypeSettings
            ? (Array.isArray(lootSettings.tables) ? lootSettings.tables : [])
            : (this.selectedTables.length > 0 ? this.selectedTables : game.settings.get(this.moduleName, "lootTables") || []);

// --- RLG prefilter: skip empty sources quickly ---
const compPacks = (selectedCompendiums ?? []).map(k => game.packs.get(k)).filter(p => p && p.metadata.type === "Item");
const folderObjs = (selectedFolders ?? []).map(id => game.folders.get(id)).filter(Boolean);
const tableObjs = (selectedTables ?? []).map(id => game.tables.get(id)).filter(Boolean);

        const compPacksWithCount = [];
for (const p of compPacks) {
  const n = await rlgCountPackItems(p);
  rlgDebug("Pack count", p.collection ?? p.key ?? p.metadata?.id ?? "(unknown)", n);
  if (n > 0) compPacksWithCount.push(p);
}
        const foldersWithCount = [];
        for (const f of folderObjs) { const n = rlgCountFolderItems(f.id); rlgDebug("Folder count", f.name, n); if (n>0) foldersWithCount.push(f); }
        const tablesWithCount = [];
        for (const t of tableObjs) { const n = rlgCountResolvableTableRows(t); rlgDebug("Table resolvable rows", t.name, n); if (n>0) tablesWithCount.push(t); }

let noItemSources = false;

if (compPacksWithCount.length === 0 && foldersWithCount.length === 0 && tablesWithCount.length === 0) {
  console.warn(game.i18n?.localize?.("RLG.Notification.NoValidItemsFromTables")
    ?? "RLG: No valid items generated from selected sources; they might be empty or broken.");
  rlgDebug("All selected sources appear empty/broken. Skipping item generation, but will still handle currency.");
  noItemSources = true;
}


        // Replace original arrays with filtered objects (downstream code may read by ids/keys; keep both handy)
        selectedCompendiums = compPacksWithCount.map(p => p.collection ?? p.key ?? p.metadata?.id).filter(Boolean);
        selectedFolders = foldersWithCount.map(f => f.id);
        selectedTables = tablesWithCount.map(t => t.id);
        // --- End prefilter ---

        let quantityFormula = lootSettings.quantityFormula || game.settings.get(this.moduleName, "randomQuantityFormula") || "1d4";
        let currencyChance = lootSettings.currencyChance !== null && lootSettings.currencyChance !== undefined && lootSettings.currencyChance !== "" ? lootSettings.currencyChance : game.settings.get(this.moduleName, "defaultCurrencyChance") || 75;
        let itemChance = lootSettings.itemChance !== null && lootSettings.itemChance !== undefined && lootSettings.itemChance !== "" ? lootSettings.itemChance : 100;

        console.log(`Fetching loot for ${creatureType}. Custom enabled: ${customLootEnabled}. Using compendiums:`, selectedCompendiums, "Folders:", selectedFolders, "Tables:", selectedTables, "Quantity Formula:", quantityFormula, "Item Chance:", itemChance, "Currency Chance:", currencyChance);

if (!selectedCompendiums.length && !selectedFolders.length && !selectedTables.length) {
  ui.notifications.warn(game.i18n.format("RLG.Notification.NoSourcesSelected", {
    name: customLootEnabled ? token.name : creatureType
  }));
  noItemSources = true; // do not return — we still want to roll currency
}


        let maxRarity = lootSettings.maxRarity || game.settings.get(this.moduleName, "maxRarity") || "Legendary";
        let rarityLevels = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"];
        let allowedRarities = rarityLevels.slice(0, rarityLevels.indexOf(maxRarity) + 1);
        console.log("Allowed rarities:", allowedRarities);
        // --- Equal-priority source helpers ---
async function pickFromFolder(folderId) {
  const folder = game.folders.get(folderId);
  if (!folder) return null;

  const items = [];
  const walk = (f) => {
    for (const d of (f.contents ?? [])) {
      if (d?.documentName === "Item" || d?.constructor?.documentName === "Item") items.push(d);
    }
    for (const sf of (f.children ?? [])) walk(sf);
  };
  walk(folder);

  if (!items.length) return null;

  // Prefer rarity-matching items; fall back to any item
  const strict = items.filter(i => rarityAllowed(i.system?.rarity));
  const pool = strict.length ? strict : items;

  const pick = pool[Math.floor(Math.random() * pool.length)];
  const itemData = pick.toObject();
  itemData._id = pick.id;
  itemData.pack = pick.pack || "";
  return itemData;
}

async function pickFromCompendium(packKey) {
  const pack = game.packs.get(packKey);
  if (!pack || pack.metadata?.type !== "Item") return null;

  if (!pack.index.size) await pack.getIndex();
  const docs = await pack.getDocuments();
  if (!docs?.length) return null;

  const strict = docs.filter(i => rarityAllowed(i.system?.rarity));
  const pool = strict.length ? strict : docs;

  const pick = pool[Math.floor(Math.random() * pool.length)];
  const itemData = pick.toObject();
  itemData._id = pick.id;
  itemData.pack = pack.collection;
  return itemData;
}

async function pickFromTable(tableId) {
  const table = game.tables.get(tableId);
  if (!table) return null;

  const rollResult = await table.roll();
  const res = rollResult.results?.[0];
  if (!res) return null;

  if (res.type === 'document' || res.type === 1) {
    const id = res.documentId || res.resultId;
    const collection = res.documentCollection || res.collection;

    let item = null;
    if (collection === "Item") {
      // World item id
      item = game.items.get(id) || await game.packs.get("dnd5e.items")?.getDocument(id);
    } else if (collection) {
      item = await game.packs.get(collection)?.getDocument(id);
    }

    if (!item) return null;

    // (Optional) enforce rarity, otherwise just accept the roll
    // if (!rarityAllowed(item.system?.rarity)) return null;

    const itemData = item.toObject();
    itemData._id = item.id;
    itemData.pack = item.pack || collection || "";
    return itemData;
  }

  if (res.type === 0) {
    // Text result – synthesize a simple item
    return {
      name: res.text,
      type: "item",
      img: res.img || "icons/svg/mystery-man.svg",
      system: { rarity: "Common" }
    };
  }

  return null;
}
// --- end helpers ---


// --- Equal-priority item generation (packs + folders + tables) ---
let allItems = [];   // kept for compatibility w/ any downstream logs (unused here)
let lootItems = [];

// Helpers
const normalizeRarity = (r) => {
  // treat undefined, null, and empty-string as "Common"
  if (r === undefined || r === null) return "Common";
  const s = String(r).trim().toLowerCase().replace(/[-_]/g, " ");
  if (!s) return "Common";                   // <-- this is the key line
  if (s === "veryrare" || s === "very rare") return "Very Rare";
  return s.replace(/\b\w/g, c => c.toUpperCase());
};

const rarityAllowed = (r) => {
  const norm = normalizeRarity(r);
  return allowedRarities.includes(norm);
};

// Fisher–Yates shuffle
const fisherYates = (arr) => {
  const a = Array.isArray(arr) ? arr.slice() : [];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};


// Source objects from current selections (already filtered earlier, but rebuild objects just in case)
const packSources   = (selectedCompendiums ?? []).map(k => game.packs.get(k)).filter(p => p && p.metadata?.type === "Item");
const folderSources = (selectedFolders ?? []).map(id => game.folders.get(id)).filter(Boolean);
const tableSources  = (selectedTables ?? []).map(id => game.tables.get(id)).filter(Boolean);

// Single mixed pool with kind tags
const allSources = [
  ...packSources.map(pack => ({ kind: "pack",   pack })),
  ...folderSources.map(folder => ({ kind: "folder", folder })),
  ...tableSources.map(table => ({ kind: "table", table }))
];

let itemRoll = Math.random() * 100;
if (itemRoll <= itemChance) {
  // --- roll quantity once (applies to all sources uniformly) ---
  let quantity = 1;
  if (/^\d+$/.test(quantityFormula)) {
    quantity = parseInt(quantityFormula);
    console.log(`Using static quantity: ${quantity}`);
  } else {
    try {
      console.log(`🎲 Rolling dice with formula: "${quantityFormula}"`);
      const roll = await new Roll(quantityFormula).evaluate();
      console.log(`🎲 Dice roll result: ${roll.result}`);
      quantity = roll.total;
      if (quantity <= 0) {
        console.warn(`⚠️ Rolled a non-positive quantity (${quantity}), defaulting to 1.`);
        quantity = 1;
      }
    } catch (error) {
      console.error(`❌ ERROR: Invalid dice formula "${quantityFormula}". Defaulting to 1 item.`);
      ui.notifications.error(game.i18n.format("RLG.Notification.InvalidQuantity", { formula: quantityFormula }));
      quantity = 1;
    }
  }
  console.log(`✅ Final item quantity (equal-priority sources): ${quantity}`);

  // Small per-run caches
  const packIndexCache = new Map();   // pack.collection -> Array<{_id, ...}>
  const folderItemsCache = new Map(); // folder.id -> Array<Item>

  // Source-specific getters (return plain item data or null)
  const PACK_ATTEMPTS = 5;
  const FOLDER_ATTEMPTS = 5;
  const TABLE_REROLL_MAX = 5;

  async function getItemFromPack(pack) {
    try {
      // get or build index array
      if (!packIndexCache.has(pack.collection)) {
        await pack.getIndex(); // ensure indexed
        // convert Collection to Array once
        packIndexCache.set(pack.collection, Array.from(pack.index));
      }
      const idx = packIndexCache.get(pack.collection);
      if (!idx?.length) return null;

      for (let i = 0; i < PACK_ATTEMPTS; i++) {
        const entry = idx[Math.floor(Math.random() * idx.length)];
        if (!entry?._id) continue;
        const doc = await pack.getDocument(entry._id);
        if (!doc) continue;
        const rar = normalizeRarity(doc.system?.rarity);
        if (!rarityAllowed(rar)) continue;

        const data = doc.toObject();
        data._id = doc.id;
        data.pack = pack.collection;
        return data;
      }
      return null;
    } catch (e) {
      rlgDebug("Pack pick failed", pack?.collection, e);
      return null;
    }
  }

  function collectFolderItems(folder) {
    if (folderItemsCache.has(folder.id)) return folderItemsCache.get(folder.id);
    const out = [];
    const walk = (f) => {
      for (const d of (f.contents ?? [])) {
        if (d?.documentName === "Item" || d?.constructor?.documentName === "Item") out.push(d);
      }
      for (const sf of (f.children ?? [])) walk(sf);
    };
    walk(folder);
    folderItemsCache.set(folder.id, out);
    return out;
  }

  async function getItemFromFolder(folder) {
    try {
      const items = collectFolderItems(folder).filter(i => rarityAllowed(i.system?.rarity));
      if (!items.length) return null;
      // Try a few different ones in case some are unresolved/invalid
      for (let i = 0; i < Math.min(FOLDER_ATTEMPTS, items.length); i++) {
        const doc = items[Math.floor(Math.random() * items.length)];
        if (!doc) continue;
        const data = doc.toObject();
        data._id = doc.id;
        data.pack = ""; // world item
        return data;
      }
      return null;
    } catch (e) {
      rlgDebug("Folder pick failed", folder?.name, e);
      return null;
    }
  }

  async function getItemFromTable(table) {
    try {
      for (let i = 0; i < TABLE_REROLL_MAX; i++) {
        const rollResult = await table.roll();
        const results = rollResult?.results ?? [];
        for (const result of results) {
          // Only accept resolvable document results
          const id = result.documentId ?? result.resultId;
          const collection = result.documentCollection ?? result.collection;

          let doc = null;
          if (!id) continue;

          if (collection === "Item") {
            // World item
            doc = game.items.get(id) ?? null;
          } else if (collection && typeof collection === "string") {
            doc = await game.packs.get(collection)?.getDocument(id);
          }

          if (!doc) continue;
          const rar = normalizeRarity(doc.system?.rarity);
          if (!rarityAllowed(rar)) continue;

          const data = doc.toObject();
          data._id = doc.id;
          data.pack = doc.pack || collection || "";
          return data;
        }
        // if we got here, that roll didn't yield a usable item; try another reroll
      }
      return null;
    } catch (e) {
      rlgDebug("Table pick failed", table?.name, e);
      return null;
    }
  }

  // If no sources at all, skip items (currency still handled after)
  if (!allSources.length) {
    rlgDebug("No item sources available after filtering; skipping item generation for this token.");
  } else {
    // Per-slot selection: randomize source order and try each until we get one
    for (let i = 0; i < quantity; i++) {
      const shuffled = fisherYates(allSources.slice());
      let picked = null;

      for (const src of shuffled) {
        if (src.kind === "pack")   { picked = await getItemFromPack(src.pack); }
        else if (src.kind === "folder") { picked = await getItemFromFolder(src.folder); }
        else if (src.kind === "table")  { picked = await getItemFromTable(src.table); }
        if (picked) break; // got one for this slot
      }

      if (picked) {
        lootItems.push(picked);
        console.log(`🎁 Item ${i + 1}: ${picked.name} (Rarity: ${normalizeRarity(picked.system?.rarity)}, ID: ${picked._id}, Pack: ${picked.pack})`);
      } else {
        rlgDebug(`All sources failed to produce an item for slot ${i + 1}; continuing.`);
      }
    }
  }
} else {
  console.log(`No items generated for ${customLootEnabled ? token.name : creatureType} (roll ${itemRoll.toFixed(1)} vs ${itemChance}%).`);
}
// --- End equal-priority item generation ---


        let currency = { cp: 0, sp: 0, gp: 0, pp: 0 };
        let useCRBasedCurrency = game.settings.get(this.moduleName, "useCRBasedCurrency");
        if (useCRBasedCurrency && token?.actor?.system?.details?.cr !== undefined) {
            let cr = token.actor.system.details.cr;
            console.log(`Generating CR-based currency for CR ${cr} with ${currencyChance}% chance`);
            let currencyRoll = Math.random() * 100;
            if (currencyRoll <= currencyChance) {
                let generated = false;
                const skipChance = 0.2;
                if (cr <= 1) {
                    if (Math.random() > skipChance) { currency.cp = (await new Roll("3d6").evaluate()).total; generated = true; }
                    if (Math.random() > skipChance) { currency.sp = (await new Roll("1d4").evaluate()).total; generated = true; }
                } else if (cr <= 4) {
                    if (Math.random() > skipChance) { currency.cp = (await new Roll("5d6").evaluate()).total; generated = true; }
                    if (Math.random() > skipChance) { currency.sp = (await new Roll("2d6").evaluate()).total; generated = true; }
                    if (Math.random() > skipChance) { currency.gp = (await new Roll("1d4").evaluate()).total; generated = true; }
                } else if (cr <= 8) {
                    if (Math.random() > skipChance) { currency.sp = (await new Roll("1d6 * 5").evaluate()).total; generated = true; }
                    if (Math.random() > skipChance) { currency.gp = (await new Roll("1d6 * 5").evaluate()).total; generated = true; }
                    if (Math.random() > skipChance) { currency.pp = (await new Roll("1d4").evaluate()).total; generated = true; }
                } else if (cr <= 12) {
                    if (Math.random() > skipChance) { currency.gp = (await new Roll("1d6 * 10").evaluate()).total; generated = true; }
                    if (Math.random() > skipChance) { currency.pp = (await new Roll("1d6 * 2").evaluate()).total; generated = true; }
                } else if (cr <= 16) {
                    if (Math.random() > skipChance) { currency.gp = (await new Roll("1d6 * 30").evaluate()).total; generated = true; }
                    if (Math.random() > skipChance) { currency.pp = (await new Roll("1d6 * 5").evaluate()).total; generated = true; }
                } else {
                    if (Math.random() > skipChance) { currency.gp = (await new Roll("2d6 * 50").evaluate()).total; generated = true; }
                    if (Math.random() > skipChance) { currency.pp = (await new Roll("1d6 * 10").evaluate()).total; generated = true; }
                }
                if (!generated) {
                    console.log("All currency types skipped, forcing minimal generation");
                    if (cr <= 1) currency.cp = (await new Roll("1d4").evaluate()).total;
                    else if (cr <= 4) currency.sp = (await new Roll("1d6").evaluate()).total;
                    else if (cr <= 8) currency.gp = (await new Roll("1d6").evaluate()).total;
                    else currency.gp = (await new Roll("1d6 * 5").evaluate()).total;
                }
                console.log(`Generated CR-based currency for CR ${cr}:`, currency);
            } else {
                console.log(`No currency generated for ${customLootEnabled ? token.name : creatureType} (roll ${currencyRoll.toFixed(1)} vs ${currencyChance}%)`);
            }
        } else {
            let currencyFormula = game.settings.get(this.moduleName, "currencyFormula") || "1d10";
            console.log(`Generating fixed-formula currency with "${currencyFormula}" and ${currencyChance}% chance`);
            let currencyRoll = Math.random() * 100;
            if (currencyRoll <= currencyChance) {
                try {
                    let cpRoll = await new Roll(currencyFormula).evaluate();
                    let spRoll = await new Roll(currencyFormula).evaluate();
                    let gpRoll = await new Roll(currencyFormula).evaluate();
                    let ppRoll = await new Roll("1d4").evaluate();
                    const skipChance = 0.2;
                    let generated = false;
                    if (Math.random() > skipChance) { currency.cp = cpRoll.total * 10; generated = true; }
                    if (Math.random() > skipChance) { currency.sp = spRoll.total * 5; generated = true; }
                    if (Math.random() > skipChance) { currency.gp = gpRoll.total; generated = true; }
                    if (Math.random() > skipChance) { currency.pp = Math.floor(ppRoll.total / 2); generated = true; }
                    if (!generated) {
                        console.log("All currency types skipped, forcing minimal generation");
                        currency.gp = (await new Roll("1d4").evaluate()).total;
                    }
                    console.log(`Generated currency:`, currency);
                } catch (error) {
                    console.error(`❌ ERROR: Invalid currency formula "${currencyFormula}". Defaulting to 0.`);
                    ui.notifications.error(game.i18n.format("RLG.Notification.InvalidCurrencyFormula", { formula: currencyFormula }));
                }
            } else {
                console.log(`No currency generated for ${customLootEnabled ? token.name : creatureType} (roll ${currencyRoll.toFixed(1)} vs ${currencyChance}%)`);
            }
        }

        console.log(`✅ Final loot: ${lootItems.length} items (${lootItems.map(i => i.system?.rarity || "Common").join(", ")}), Currency: ${Object.entries(currency).filter(([_, v]) => v > 0).map(([k, v]) => `${v} ${k.toUpperCase()}`).join(", ") || "None"}`);

        const itemCount = lootItems.length;
const raritySummary = itemCount > 0
  ? `(${lootItems.map(i => normalizeRarity(i.system?.rarity)).join(", ")})`
  : "";
        const currencySummary = Object.entries(currency)
            .filter(([_, v]) => v > 0)
            .map(([k, v]) => `${v} ${k.toUpperCase()}`)
            .join(", ") || "None";
        console.log(`Loot Summary for ${customLootEnabled ? token.name : creatureType}: ${itemCount} item${itemCount === 1 ? "" : "s"} ${raritySummary}, ${currencySummary}`);

        return { items: lootItems, currency };
    }

    applyLoot(lootAssignments) {
        for (let [tokenId, loot] of Object.entries(lootAssignments)) {
            let token = canvas.tokens.get(tokenId);
            if (token?.actor) {
                console.log(`Applying loot to ${token.name}:`, loot);
                if (loot.items.length) {
                    token.actor.createEmbeddedDocuments("Item", loot.items)
                        .then(() => console.log(`✅ Successfully added items to ${token.name}`))
                        .catch(err => console.error(`❌ Error adding items:`, err));
                }
                if (Object.values(loot.currency).some(val => val > 0)) {
                    let currentCurrency = token.actor.system.currency || { cp: 0, sp: 0, gp: 0, pp: 0 };
                    let updatedCurrency = {
                        cp: currentCurrency.cp + (loot.currency.cp || 0),
                        sp: currentCurrency.sp + (loot.currency.sp || 0),
                        gp: currentCurrency.gp + (loot.currency.gp || 0),
                        pp: currentCurrency.pp + (loot.currency.pp || 0)
                    };
                    token.actor.update({ "system.currency": updatedCurrency })
                        .then(() => console.log(`✅ Successfully added currency to ${token.name}`))
                        .catch(err => console.error(`❌ Error adding currency:`, err));
                }
            }
        }
        ui.notifications.info(game.i18n.localize("RLG.Notification.LootApplied"));
    }

    showLootPreview(lootAssignments, tokens) {
        let content = `
            <style>
                .loot-item { display: flex; align-items: center; gap: 10px; }
                .loot-img { width: 30px; height: 30px; border-radius: 5px; }
                .loot-item.common { color:rgb(117, 113, 113); }
                .loot-item.uncommon { color:rgb(3, 182, 3); }
                .loot-item.rare { color: #0000ff; }
                .loot-item.very-rare { color: #ff00ff; }
                .loot-item.legendary { color:rgb(226, 157, 9); }
                .item-link { cursor: pointer; text-decoration: underline; }
                .item-link:hover { opacity: 0.8; }
            </style>`;
        tokens.forEach(token => {
            let loot = lootAssignments[token.id];
            let itemList = loot.items
                .map((item, index) => {
                    const rarity = (item.system?.rarity || "Common").toLowerCase().replace("very rare", "very-rare");
                    const itemId = item._id || `temp-${index}`;
                    const pack = item.pack || "";
                    return `<div class="loot-item ${rarity}">
                        <img src="${item.img}" class="loot-img">
                        <a class="item-link" data-item-id="${itemId}" data-pack="${pack}">${item.name}</a>
                    </div>`;
                })
                .join("");
            let currencyList = Object.entries(loot.currency)
                .filter(([_, val]) => val > 0)
                .map(([type, val]) => `${val} ${type.toUpperCase()}`)
                .join(", ");
            let currencyText = currencyList ? `Currency: ${currencyList}` : "Currency: None";
            content += `<strong>${token.name}:</strong><br>${itemList}<br>${currencyText}<br><br>`;
        });
        const dialog = new Dialog({
            title: game.i18n.localize("RLG.LootPreview.Title"),
            content: content,
            buttons: {
                reroll: { label: game.i18n.localize("RLG.LootPreview.Reroll"), callback: () => this.generateLootForTokens(tokens) },
                apply: { label: game.i18n.localize("RLG.LootPreview.Apply"), callback: () => this.applyLoot(lootAssignments) }
            },
            render: (html) => {
                const $html = $(html);
                $html.find(".item-link").on("click", (event) => {
                    const $link = $(event.currentTarget);
                    const itemId = $link.data("item-id");
                    const pack = $link.data("pack");
                    console.log(`Clicked item: ID=${itemId}, Pack=${pack}`);
                    this.openItemSheet(itemId, pack);
                });
            }
        });
        dialog.render(true);
    }

    openItemSheet(itemId, pack = "") {
        console.log(`Opening item sheet: ID=${itemId}, Pack=${pack}`);
        if (pack) {
            game.packs.get(pack)?.getDocument(itemId).then(item => {
                if (item) {
                    console.log(`Found compendium item: ${item.name}`);
                    item.sheet.render(true);
                } else {
                    console.warn(`Item ${itemId} not found in pack ${pack}`);
                }
            });
        } else {
            const item = game.items.get(itemId);
            if (item) {
                console.log(`Found world item: ${item.name}`);
                item.sheet.render(true);
            } else {
                console.warn(`Item ${itemId} not found in world items`);
            }
        }
    }

async showCompendiumSelection() {
  const packs = game.packs.contents.filter(p => p.metadata.type === "Item");
  const folders = game.folders.filter(f => f.type === "Item" && f.contents.length > 0);
  const tables = game.tables.contents;
  let content = `<div style="max-height: 400px; overflow-y: auto;">`;
  content += `<h3>${game.i18n.localize("RLG.CompendiumSelection.Compendiums")}</h3>`;
  if (packs.length === 0) content += `<p>${game.i18n.localize("RLG.CompendiumSelection.NoCompendiums")}</p>`;
  else {
    const compendiumHtml = await Promise.all(packs.map(async pack => {
      const count = await rlgCountPackItems(pack);
      const checked = count > 0 && this.selectedCompendiums.includes(pack.collection) ? "checked" : "";
      const disabled = count === 0 ? "disabled" : "";
      const title = count === 0 ? `title="${game.i18n.localize("RLG.NoItemsFound")}"` : "";
      return `<label style="display: inline-flex; align-items: center; gap: 6px;" ${title}>
        <input type="checkbox" name="compendium" value="${pack.collection}" ${checked} ${disabled} style="margin: 0; cursor: ${count === 0 ? 'not-allowed' : 'default'};" ${title}>
        <span style="vertical-align: middle;">${pack.metadata.label} (${count})</span>
      </label><br>`;
    }));
    content += compendiumHtml.join("");
  }
  content += `<h3>${game.i18n.localize("RLG.CompendiumSelection.Folders")}</h3>`;
  if (folders.length === 0) content += `<p>${game.i18n.localize("RLG.CompendiumSelection.NoFolders")}</p>`;
  content += folders.map(folder => {
    const count = rlgCountFolderItems(folder.id);
    const checked = count > 0 && this.selectedFolders.includes(folder.id) ? "checked" : "";
    const disabled = count === 0 ? "disabled" : "";
    const title = count === 0 ? `title="${game.i18n.localize("RLG.NoItemsFound")}"` : "";
    return `<label style="display: inline-flex; align-items: center; gap: 6px;" ${title}>
      <input type="checkbox" name="folder" value="${folder.id}" ${checked} ${disabled} style="margin: 0; cursor: ${count === 0 ? 'not-allowed' : 'default'};" ${title}>
      <span style="vertical-align: middle;">${folder.name} (${count})</span>
    </label><br>`;
  }).join("");
  content += `<h3>${game.i18n.localize("RLG.CompendiumSelection.RollTables")}</h3>`;
  if (tables.length === 0) content += `<p>${game.i18n.localize("RLG.CompendiumSelection.NoTables")}</p>`;
  content += tables.map(table => {
    const count = rlgCountResolvableTableRows(table);
    const checked = count > 0 && this.selectedTables.includes(table.id) ? "checked" : "";
    const disabled = count === 0 ? "disabled" : "";
    const title = count === 0 ? `title="${game.i18n.localize("RLG.NoItemsFound")}"` : "";
    return `<label style="display: inline-flex; align-items: center; gap: 6px;" ${title}>
      <input type="checkbox" name="table" value="${table.id}" ${checked} ${disabled} style="margin: 0; cursor: ${count === 0 ? 'not-allowed' : 'default'};" ${title}>
      <span style="vertical-align: middle;">${table.name} (${count})</span>
    </label><br>`;
  }).join("");
  content += `</div>`;
  new Dialog({
    title: game.i18n.localize("RLG.ManageLootSources.Title"),
    content,
    buttons: {
      save: {
        icon: '<i class="fas fa-save"></i>',
        label: game.i18n.localize("RLG.ManageLootSources.Save"),
        callback: (html) => {
          const $html = $(html);
          this.selectedCompendiums = $html.find("input[name='compendium']:checked").map((_, el) => el.value).get();
          this.selectedFolders = $html.find("input[name='folder']:checked").map((_, el) => el.value).get();
          this.selectedTables = $html.find("input[name='table']:checked").map((_, el) => el.value).get();
          game.settings.set(this.moduleName, "selectedCompendiums", this.selectedCompendiums.join(","));
          game.settings.set(this.moduleName, "selectedFolders", this.selectedFolders);
          game.settings.set(this.moduleName, "lootTables", this.selectedTables);
          console.log("Default loot sources updated:", { compendiums: this.selectedCompendiums, folders: this.selectedFolders, tables: this.selectedTables });
        }
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: game.i18n.localize("RLG.ManageLootSources.Cancel")
      }
    },
    render: (html) => {
      const $html = $(html);
      $html.find('input:disabled').each((i, input) => {
        const $input = $(input);
        $input.attr('title', game.i18n.localize("RLG.NoItemsFound"));
        $input.css({ cursor: 'not-allowed' });
        const $label = $input.closest('label');
        $label.attr('title', game.i18n.localize("RLG.NoItemsFound"));
        $label.addClass('rlg-source--disabled');
        rlgDebug(`Post-render - Input title: ${$input.attr('title')}, Input cursor: ${$input.css('cursor')}, Label title: ${$label.attr('title')}`);
      });
    }
  }).render(true);
}
}

class CreatureTypeLootForm extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 700,
            height: "auto",
            resizable: true,
            classes: ["creature-type-loot-window"],
            title: game.i18n.localize("RLG.CreatureTypeLoot.Title"),
            template: "modules/random-loot-generator/creatureTypeLoot.html"
        });
    }

    async getData() {
        let settings = foundry.utils.duplicate(game.settings.get("random-loot-generator", "creatureTypeLoot") || {});
        let globalMaxRarity = game.settings.get("random-loot-generator", "maxRarity") || "Legendary";
        let globalCurrencyChance = game.settings.get("random-loot-generator", "defaultCurrencyChance") || 75;
        let globalItemChance = 100;
        let globalQuantityFormula = game.settings.get("random-loot-generator", "randomQuantityFormula") || "1d4";
        let creatureTypes = [
            { key: "aberration", label: "Aberration" },
            { key: "beast", label: "Beast" },
            { key: "celestial", label: "Celestial" },
            { key: "construct", label: "Construct" },
            { key: "dragon", label: "Dragon" },
            { key: "elemental", label: "Elemental" },
            { key: "fey", label: "Fey" },
            { key: "fiend", label: "Fiend" },
            { key: "giant", label: "Giant" },
            { key: "humanoid", label: "Humanoid" },
            { key: "monstrosity", label: "Monstrosity" },
            { key: "ooze", label: "Ooze" },
            { key: "plant", label: "Plant" },
            { key: "undead", label: "Undead" }
        ];

        for (let type of creatureTypes) {
            let typeSettings = settings[type.key] || {
                compendiums: [],
                folders: [],
                tables: [],
                quantityFormula: "",
                maxRarity: "",
                currencyChance: null,
                itemChance: null
            };

            let selectedCompendiums = Array.isArray(typeSettings.compendiums)
                ? typeSettings.compendiums.filter(id => game.packs.get(id))
                : [];
            let selectedFolders = Array.isArray(typeSettings.folders)
                ? typeSettings.folders.filter(id => game.folders.get(id))
                : [];
            let selectedTables = Array.isArray(typeSettings.tables)
                ? typeSettings.tables.filter(id => game.tables.get(id))
                : [];

            let quantityFormula = typeSettings.quantityFormula || "";
            let maxRarity = typeSettings.maxRarity || "";
            let currencyChance = typeSettings.currencyChance !== null ? typeSettings.currencyChance : "";
            let itemChance = typeSettings.itemChance !== null ? typeSettings.itemChance : "";

            let totalSources = selectedCompendiums.length + selectedFolders.length + selectedTables.length;
            type.selectedLabel = totalSources > 0 ? `Custom [${totalSources}]` : game.i18n.localize("RLG.CompendiumSelection.DefaultLabel");
            type.quantityFormula = quantityFormula;
            type.maxRarity = maxRarity;
            type.currencyChance = currencyChance;
            type.itemChance = itemChance;
            type.totalSources = totalSources;

            settings[type.key] = {
                compendiums: selectedCompendiums,
                folders: selectedFolders,
                tables: selectedTables,
                quantityFormula,
                maxRarity,
                currencyChance,
                itemChance
            };
        }

        await game.settings.set("random-loot-generator", "creatureTypeLoot", settings);
        console.log("Rendering creature types:", creatureTypes);
        return { creatureTypes, globalMaxRarity, globalCurrencyChance, globalItemChance, globalQuantityFormula };
    }

    activateListeners(html) {
        super.activateListeners(html);
        const $html = $(html);

        const focusNextField = (currentInput) => {
            const inputs = Array.from($html.find("input, select, button"));
            const currentIndex = inputs.indexOf(currentInput[0]);
            const nextIndex = (currentIndex + 1) % inputs.length;
            if (inputs[nextIndex]) inputs[nextIndex].focus();
        };

        const debouncedRender = foundry.utils.debounce(() => {
            const activeElement = document.activeElement;
            const inputs = Array.from($html.find("input, select, button"));
            const activeIndex = inputs.indexOf(activeElement);
            this.render();
            requestAnimationFrame(() => {
                const newInputs = this.element.find("input, select, button");
                if (activeIndex >= 0 && newInputs[activeIndex]) newInputs[activeIndex].focus();
            });
        }, 100);

        $html.find(".quantity-input").on("change keydown", async (event) => {
            const creatureType = event.currentTarget.dataset.creatureType;
            const newFormula = event.currentTarget.value.trim();
            const $currentInput = $(event.currentTarget);

            if (event.type === "keydown" && event.key === "Tab") {
                event.preventDefault();
                focusNextField($currentInput);
                return;
            }

            if (event.type === "keydown" && event.key === "Enter") {
                event.preventDefault();
            } else if (event.type !== "change") {
                return;
            }

            const quantityRegex = /^(\d+d\d+([+-]\d+)?|\d+)$/;
            if (newFormula && !quantityRegex.test(newFormula)) {
                ui.notifications.warn(game.i18n.format("RLG.Notification.InvalidQuantity", { formula: newFormula }));
                return;
            }

            let settings = foundry.utils.duplicate(game.settings.get("random-loot-generator", "creatureTypeLoot") || {});
            settings[creatureType] = settings[creatureType] || {
                compendiums: [],
                folders: [],
                tables: [],
                quantityFormula: "",
                maxRarity: "",
                currencyChance: null,
                itemChance: null
            };
            settings[creatureType].quantityFormula = newFormula;
            await game.settings.set("random-loot-generator", "creatureTypeLoot", settings);
            console.log(`Updated ${creatureType} quantityFormula to: ${newFormula}`);
            debouncedRender();
        });

        $html.find(".item-chance-input").on("change keydown", async (event) => {
            const creatureType = event.currentTarget.dataset.creatureType;
            const newChance = event.currentTarget.value.trim() === "" || parseInt(event.currentTarget.value) === 0 ? null : parseInt(event.currentTarget.value);
            const $currentInput = $(event.currentTarget);

            if (event.type === "keydown" && event.key === "Tab") {
                event.preventDefault();
                focusNextField($currentInput);
                return;
            }

            if (event.type === "keydown" && event.key === "Enter") {
                event.preventDefault();
            } else if (event.type !== "change") {
                return;
            }

            let settings = foundry.utils.duplicate(game.settings.get("random-loot-generator", "creatureTypeLoot") || {});
            settings[creatureType] = settings[creatureType] || {
                compendiums: [],
                folders: [],
                tables: [],
                quantityFormula: "",
                maxRarity: "",
                currencyChance: null,
                itemChance: null
            };
            settings[creatureType].itemChance = newChance;
            await game.settings.set("random-loot-generator", "creatureTypeLoot", settings);
            console.log(`Updated ${creatureType} itemChance to: ${newChance === null ? "[Global]" : newChance + "%"}`);
            debouncedRender();
        });

        $html.find(".currency-chance-input").on("change keydown", async (event) => {
            const creatureType = event.currentTarget.dataset.creatureType;
            const newChance = event.currentTarget.value.trim() === "" || parseInt(event.currentTarget.value) === 0 ? null : parseInt(event.currentTarget.value);
            const $currentInput = $(event.currentTarget);

            if (event.type === "keydown" && event.key === "Tab") {
                event.preventDefault();
                focusNextField($currentInput);
                return;
            }

            if (event.type === "keydown" && event.key === "Enter") {
                event.preventDefault();
            } else if (event.type !== "change") {
                return;
            }

            let settings = foundry.utils.duplicate(game.settings.get("random-loot-generator", "creatureTypeLoot") || {});
            settings[creatureType] = settings[creatureType] || {
                compendiums: [],
                folders: [],
                tables: [],
                quantityFormula: "",
                maxRarity: "",
                currencyChance: null,
                itemChance: null
            };
            settings[creatureType].currencyChance = newChance;
            await game.settings.set("random-loot-generator", "creatureTypeLoot", settings);
            console.log(`Updated ${creatureType} currencyChance to: ${newChance === null ? "[Global]" : newChance + "%"}`);
            debouncedRender();
        });

        $html.find(".rarity-select").on("change keydown", async (event) => {
            const creatureType = event.currentTarget.dataset.creatureType;
            const newRarity = event.currentTarget.value;
            const $currentInput = $(event.currentTarget);

            if (event.type === "keydown" && event.key === "Tab") {
                event.preventDefault();
                focusNextField($currentInput);
                return;
            }

            if (event.type === "keydown" && event.key === "Enter") {
                event.preventDefault();
            } else if (event.type !== "change") {
                return;
            }

            let settings = foundry.utils.duplicate(game.settings.get("random-loot-generator", "creatureTypeLoot") || {});
            settings[creatureType] = settings[creatureType] || {
                compendiums: [],
                folders: [],
                tables: [],
                quantityFormula: "",
                maxRarity: "",
                currencyChance: null,
                itemChance: null
            };
            settings[creatureType].maxRarity = newRarity;
            await game.settings.set("random-loot-generator", "creatureTypeLoot", settings);
            console.log(`Updated ${creatureType} maxRarity to: ${newRarity || "[Global]"}`);
            debouncedRender();
        });

$html.find(".compendium-select-btn").click(async (event) => {
  const button = $(event.currentTarget);
  const creatureType = button.data("creature-type");
  if (!creatureType) {
    console.error("No creature type specified for compendium selection button.");
    ui.notifications.error(game.i18n.localize("RLG.Notification.NoCreatureType"));
    return;
  }
  let creatureTypeLoot = game.settings.get("random-loot-generator", "creatureTypeLoot") || {};
  let typeSettings = creatureTypeLoot[creatureType] || {
    compendiums: [],
    folders: [],
    tables: [],
    quantityFormula: "",
    maxRarity: "",
    currencyChance: null,
    itemChance: null
  };
  let selectedCompendiums = Array.isArray(typeSettings.compendiums) ? typeSettings.compendiums : [];
  let selectedFolders = Array.isArray(typeSettings.folders) ? typeSettings.folders : [];
  let selectedTables = Array.isArray(typeSettings.tables) ? typeSettings.tables : [];
  const packs = game.packs.contents.filter(p => p.metadata.type === "Item");
  const folders = game.folders.filter(f => f.type === "Item" && f.contents.length > 0);
  const tables = game.tables.contents;
  let content = `<div style="max-height: 400px; overflow-y: auto;">`;
  content += `<h3>${game.i18n.localize("RLG.CompendiumSelection.Compendiums")}</h3>`;
  if (packs.length === 0) content += `<p>${game.i18n.localize("RLG.CompendiumSelection.NoCompendiums")}</p>`;
  else {
    const compendiumHtml = await Promise.all(packs.map(async pack => {
      const count = await rlgCountPackItems(pack);
      const checked = count > 0 && selectedCompendiums.includes(pack.collection) ? "checked" : "";
      const disabled = count === 0 ? "disabled" : "";
      const title = count === 0 ? `title="${game.i18n.localize("RLG.NoItemsFound")}"` : "";
      return `<label style="display: inline-flex; align-items: center; gap: 6px;" ${title}>
        <input type="checkbox" name="compendium" value="${pack.collection}" ${checked} ${disabled} style="margin: 0;">
        <span style="vertical-align: middle;">${pack.metadata.label} (${count})</span>
      </label><br>`;
    }));
    content += compendiumHtml.join("");
  }
  content += `<h3>${game.i18n.localize("RLG.CompendiumSelection.Folders")}</h3>`;
  if (folders.length === 0) content += `<p>${game.i18n.localize("RLG.CompendiumSelection.NoFolders")}</p>`;
  content += folders.map(folder => {
    const count = rlgCountFolderItems(folder.id);
    const checked = count > 0 && selectedFolders.includes(folder.id) ? "checked" : "";
    const disabled = count === 0 ? "disabled" : "";
    const title = count === 0 ? `title="${game.i18n.localize("RLG.NoItemsFound")}"` : "";
    return `<label style="display: inline-flex; align-items: center; gap: 6px;" ${title}>
      <input type="checkbox" name="folder" value="${folder.id}" ${checked} ${disabled} style="margin: 0;">
      <span style="vertical-align: middle;">${folder.name} (${count})</span>
    </label><br>`;
  }).join("");
  content += `<h3>${game.i18n.localize("RLG.CompendiumSelection.RollTables")}</h3>`;
  if (tables.length === 0) content += `<p>${game.i18n.localize("RLG.CompendiumSelection.NoTables")}</p>`;
  content += tables.map(table => {
    const count = rlgCountResolvableTableRows(table);
    const checked = count > 0 && selectedTables.includes(table.id) ? "checked" : "";
    const disabled = count === 0 ? "disabled" : "";
    const title = count === 0 ? `title="${game.i18n.localize("RLG.NoItemsFound")}"` : "";
    return `<label style="display: inline-flex; align-items: center; gap: 6px;" ${title}>
      <input type="checkbox" name="table" value="${table.id}" ${checked} ${disabled} style="margin: 0;">
      <span style="vertical-align: middle;">${table.name} (${count})</span>
    </label><br>`;
  }).join("");
  content += `</div>`;
  new Dialog({
    title: game.i18n.format("RLG.CompendiumSelection.TitleFor", { creatureType }),
    content,
    buttons: {
      save: {
        icon: '<i class="fas fa-save"></i>',
        label: game.i18n.localize("RLG.ManageLootSources.Save"),
        callback: async (dialogHtml) => {
          const selectedComps = dialogHtml.find("input[name='compendium']:checked").map((_, el) => el.value).get();
          const selectedFolds = dialogHtml.find("input[name='folder']:checked").map((_, el) => el.value).get();
          const selectedTabs = dialogHtml.find("input[name='table']:checked").map((_, el) => el.value).get();
          if (!selectedComps.length && !selectedFolds.length && !selectedTabs.length) {
            ui.notifications.warn(game.i18n.localize("RLG.Notification.SelectAtLeastOneSource"));
            return;
          }
          let settings = foundry.utils.duplicate(game.settings.get("random-loot-generator", "creatureTypeLoot") || {});
          settings[creatureType] = {
            compendiums: selectedComps,
            folders: selectedFolds,
            tables: selectedTabs,
            quantityFormula: typeSettings.quantityFormula || "",
            maxRarity: typeSettings.maxRarity || "",
            currencyChance: typeSettings.currencyChance ?? null,
            itemChance: typeSettings.itemChance ?? null
          };
          await game.settings.set("random-loot-generator", "creatureTypeLoot", settings);
          console.log(`Updated ${creatureType} sources:`, settings[creatureType]);
          this.render();
        }
      },
      cancel: {
        icon: '<i class="fas fa-ban"></i>',
        label: game.i18n.localize("RLG.ManageLootSources.Cancel"),
        callback: () => console.log(`Cancelled source selection for ${creatureType}`)
      }
    },
    default: "save"
  }).render(true);
});

        $html.find(".reset-defaults").click(async () => {
            new Dialog({
                title: game.i18n.localize("RLG.ResetConfirm.Title"),
                content: `<p>${game.i18n.localize("RLG.Notification.ResetConfirm")}</p>`,
                buttons: {
                    cancel: {
                        label: game.i18n.localize("RLG.ManageLootSources.Cancel"),
                        icon: '<i class="fas fa-ban"></i>',
                        callback: () => console.log("Reset canceled")
                    },
                    reset: {
                        label: game.i18n.localize("RLG.ResetConfirm.Reset"),
                        icon: '<i class="fas fa-repeat"></i>',
                        callback: async () => {
                            await game.settings.set("random-loot-generator", "creatureTypeLoot", {});
                            ui.notifications.info(game.i18n.localize("RLG.Notification.ResetSuccess"));
                            this.render();
                        }
                    }
                },
                default: "cancel"
            }).render(true);
        });

        $html.find(".export-sources").click(this.exportSources.bind(this));
        $html.find(".import-sources").click(this.importSources.bind(this));
    }

    exportSources() {
        const settings = {
            selectedCompendiums: game.settings.get("random-loot-generator", "selectedCompendiums"),
            selectedFolders: game.settings.get("random-loot-generator", "selectedFolders"),
            lootTables: game.settings.get("random-loot-generator", "lootTables"),
            creatureTypeLoot: game.settings.get("random-loot-generator", "creatureTypeLoot")
        };
        const json = JSON.stringify(settings, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "random-loot-generator-sources.json";
        a.click();
        URL.revokeObjectURL(url);
    }

    importSources() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = async (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const settings = JSON.parse(e.target.result);
                        await game.settings.set("random-loot-generator", "selectedCompendiums", settings.selectedCompendiums || "");
                        await game.settings.set("random-loot-generator", "selectedFolders", settings.selectedFolders || []);
                        await game.settings.set("random-loot-generator", "lootTables", settings.lootTables || []);
                        await game.settings.set("random-loot-generator", "creatureTypeLoot", settings.creatureTypeLoot || {});
                        game.lootGenerator.selectedCompendiums = settings.selectedCompendiums ? settings.selectedCompendiums.split(",").map(comp => comp.trim()).filter(comp => comp) : [];
                        game.lootGenerator.selectedFolders = settings.selectedFolders || [];
                        game.lootGenerator.selectedTables = settings.lootTables || [];
                        ui.notifications.info(game.i18n.localize("RLG.Notification.SourcesImported"));
                        this.render();
                    } catch (error) {
                        ui.notifications.error(game.i18n.localize("RLG.Notification.ImportFailed"));
                        console.error("Import error:", error);
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }
}

class TokenLootSettingsForm extends FormApplication {
    constructor(actor, creatureType) {
        super();
        this.actor = actor;
        this.creatureType = creatureType;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 600,
            height: "auto",
            resizable: true,
            classes: ["token-loot-settings-window"],
            title: game.i18n.localize("RLG.TokenLootSettings.Title"),
            template: "modules/random-loot-generator/tokenLootSettings.html"
        });
    }

    async getData() {
        const lootSettings = (await this.actor.getFlag("random-loot-generator", "lootSettings")) || {};
        const creatureLootSettings = game.settings.get("random-loot-generator", "creatureTypeLoot") || {};
        const typeSettings = creatureLootSettings[this.creatureType] || {};

        return {
            compendiums: lootSettings.compendiums || typeSettings.compendiums || [],
            folders: lootSettings.folders || typeSettings.folders || [],
            tables: lootSettings.tables || typeSettings.tables || [],
            quantityFormula: lootSettings.quantityFormula || typeSettings.quantityFormula || "",
            maxRarity: lootSettings.maxRarity || typeSettings.maxRarity || "",
            itemChance: lootSettings.itemChance !== null && lootSettings.itemChance !== undefined ? lootSettings.itemChance : typeSettings.itemChance !== null ? typeSettings.itemChance : "",
            currencyChance: lootSettings.currencyChance !== null && lootSettings.currencyChance !== undefined ? lootSettings.currencyChance : typeSettings.currencyChance !== null ? typeSettings.currencyChance : "",
            globalQuantityFormula: game.settings.get("random-loot-generator", "randomQuantityFormula") || "1d4",
            globalMaxRarity: game.settings.get("random-loot-generator", "maxRarity") || "Legendary",
            globalItemChance: 100,
            globalCurrencyChance: game.settings.get("random-loot-generator", "defaultCurrencyChance") || 75,
            totalSources: (lootSettings.compendiums?.length || 0) + (lootSettings.folders?.length || 0) + (lootSettings.tables?.length || 0)
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        const $html = $(html);

        const focusNextField = (currentInput) => {
            const inputs = Array.from($html.find("input, select, button"));
            const currentIndex = inputs.indexOf(currentInput[0]);
            const nextIndex = (currentIndex + 1) % inputs.length;
            if (inputs[nextIndex]) inputs[nextIndex].focus();
        };

        $html.find(".quantity-input").on("change keydown", async (event) => {
            const newFormula = event.currentTarget.value.trim();
            const $currentInput = $(event.currentTarget);

            if (event.type === "keydown" && event.key === "Tab") {
                event.preventDefault();
                focusNextField($currentInput);
                return;
            }

            if (event.type === "keydown" && event.key === "Enter") {
                event.preventDefault();
            } else if (event.type !== "change") {
                return;
            }

            const quantityRegex = /^(\d+d\d+([+-]\d+)?|\d+)$/;
            if (newFormula && !quantityRegex.test(newFormula)) {
                ui.notifications.warn(game.i18n.format("RLG.Notification.InvalidQuantity", { formula: newFormula }));
                return;
            }

            let settings = (await this.actor.getFlag("random-loot-generator", "lootSettings")) || {};
            settings.quantityFormula = newFormula;
            await this.actor.setFlag("random-loot-generator", "lootSettings", settings);
            await this.actor.setFlag("random-loot-generator", "customLootEnabled", true);
            console.log(`Updated token quantityFormula to: ${newFormula}`);
            this.render();
        });

        $html.find(".item-chance-input").on("change keydown", async (event) => {
            const newChance = event.currentTarget.value.trim() === "" || parseInt(event.currentTarget.value) === 0 ? null : parseInt(event.currentTarget.value);
            const $currentInput = $(event.currentTarget);

            if (event.type === "keydown" && event.key === "Tab") {
                event.preventDefault();
                focusNextField($currentInput);
                return;
            }

            if (event.type === "keydown" && event.key === "Enter") {
                event.preventDefault();
            } else if (event.type !== "change") {
                return;
            }

            let settings = (await this.actor.getFlag("random-loot-generator", "lootSettings")) || {};
            settings.itemChance = newChance;
            await this.actor.setFlag("random-loot-generator", "lootSettings", settings);
            await this.actor.setFlag("random-loot-generator", "customLootEnabled", true);
            console.log(`Updated token itemChance to: ${newChance === null ? "[Global]" : newChance + "%"}`);
            this.render();
        });

        $html.find(".currency-chance-input").on("change keydown", async (event) => {
            const newChance = event.currentTarget.value.trim() === "" || parseInt(event.currentTarget.value) === 0 ? null : parseInt(event.currentTarget.value);
            const $currentInput = $(event.currentTarget);

            if (event.type === "keydown" && event.key === "Tab") {
                event.preventDefault();
                focusNextField($currentInput);
                return;
            }

            if (event.type === "keydown" && event.key === "Enter") {
                event.preventDefault();
            } else if (event.type !== "change") {
                return;
            }

            let settings = (await this.actor.getFlag("random-loot-generator", "lootSettings")) || {};
            settings.currencyChance = newChance;
            await this.actor.setFlag("random-loot-generator", "lootSettings", settings);
            await this.actor.setFlag("random-loot-generator", "customLootEnabled", true);
            console.log(`Updated token currencyChance to: ${newChance === null ? "[Global]" : newChance + "%"}`);
            this.render();
        });

        $html.find(".rarity-select").on("change keydown", async (event) => {
            const newRarity = event.currentTarget.value;
            const $currentInput = $(event.currentTarget);

            if (event.type === "keydown" && event.key === "Tab") {
                event.preventDefault();
                focusNextField($currentInput);
                return;
            }

            if (event.type === "keydown" && event.key === "Enter") {
                event.preventDefault();
            } else if (event.type !== "change") {
                return;
            }

            let settings = (await this.actor.getFlag("random-loot-generator", "lootSettings")) || {};
            settings.maxRarity = newRarity;
            await this.actor.setFlag("random-loot-generator", "lootSettings", settings);
            await this.actor.setFlag("random-loot-generator", "customLootEnabled", true);
            console.log(`Updated token maxRarity to: ${newRarity || "[Global]"}`);
            this.render();
        });

$html.find(".compendium-select-btn").click(async (event) => {
  const button = $(event.currentTarget);
  let settings = (await this.actor.getFlag("random-loot-generator", "lootSettings")) || {};
  let selectedCompendiums = settings.compendiums || [];
  let selectedFolders = settings.folders || [];
  let selectedTables = settings.tables || [];
  const packs = game.packs.contents.filter(p => p.metadata.type === "Item");
  const folders = game.folders.filter(f => f.type === "Item" && f.contents.length > 0);
  const tables = game.tables.contents;
  let content = `<div style="max-height: 400px; overflow-y: auto;">`;
  content += `<h3>${game.i18n.localize("RLG.CompendiumSelection.Compendiums")}</h3>`;
  if (packs.length === 0) content += `<p>${game.i18n.localize("RLG.CompendiumSelection.NoCompendiums")}</p>`;
  else {
    const compendiumHtml = await Promise.all(packs.map(async pack => {
      const count = await rlgCountPackItems(pack);
      const checked = count > 0 && selectedCompendiums.includes(pack.collection) ? "checked" : "";
      const disabled = count === 0 ? "disabled" : "";
      const title = count === 0 ? `title="${game.i18n.localize("RLG.NoItemsFound")}"` : "";
      return `<label style="display: inline-flex; align-items: center; gap: 6px;" ${title}>
        <input type="checkbox" name="compendium" value="${pack.collection}" ${checked} ${disabled} style="margin: 0;">
        <span style="vertical-align: middle;">${pack.metadata.label} (${count})</span>
      </label><br>`;
    }));
    content += compendiumHtml.join("");
  }
  content += `<h3>${game.i18n.localize("RLG.CompendiumSelection.Folders")}</h3>`;
  if (folders.length === 0) content += `<p>${game.i18n.localize("RLG.CompendiumSelection.NoFolders")}</p>`;
  content += folders.map(folder => {
    const count = rlgCountFolderItems(folder.id);
    const checked = count > 0 && selectedFolders.includes(folder.id) ? "checked" : "";
    const disabled = count === 0 ? "disabled" : "";
    const title = count === 0 ? `title="${game.i18n.localize("RLG.NoItemsFound")}"` : "";
    return `<label style="display: inline-flex; align-items: center; gap: 6px;" ${title}>
      <input type="checkbox" name="folder" value="${folder.id}" ${checked} ${disabled} style="margin: 0;">
      <span style="vertical-align: middle;">${folder.name} (${count})</span>
    </label><br>`;
  }).join("");
  content += `<h3>${game.i18n.localize("RLG.CompendiumSelection.RollTables")}</h3>`;
  if (tables.length === 0) content += `<p>${game.i18n.localize("RLG.CompendiumSelection.NoTables")}</p>`;
  content += tables.map(table => {
    const count = rlgCountResolvableTableRows(table);
    const checked = count > 0 && selectedTables.includes(table.id) ? "checked" : "";
    const disabled = count === 0 ? "disabled" : "";
    const title = count === 0 ? `title="${game.i18n.localize("RLG.NoItemsFound")}"` : "";
    return `<label style="display: inline-flex; align-items: center; gap: 6px;" ${title}>
      <input type="checkbox" name="table" value="${table.id}" ${checked} ${disabled} style="margin: 0;">
      <span style="vertical-align: middle;">${table.name} (${count})</span>
    </label><br>`;
  }).join("");
  content += `</div>`;
  new Dialog({
    title: game.i18n.format("RLG.TokenLootSettings.TitleFor", { name: this.actor.name }),
    content,
    buttons: {
      save: {
        icon: '<i class="fas fa-save"></i>',
        label: game.i18n.localize("RLG.ManageLootSources.Save"),
        callback: async (dialogHtml) => {
          const selectedComps = dialogHtml.find("input[name='compendium']:checked").map((_, el) => el.value).get();
          const selectedFolds = dialogHtml.find("input[name='folder']:checked").map((_, el) => el.value).get();
          const selectedTabs = dialogHtml.find("input[name='table']:checked").map((_, el) => el.value).get();
          if (!selectedComps.length && !selectedFolds.length && !selectedTabs.length) {
            ui.notifications.warn(game.i18n.localize("RLG.Notification.SelectAtLeastOneSource"));
            return;
          }
          settings.compendiums = selectedComps;
          settings.folders = selectedFolds;
          settings.tables = selectedTabs;
          await this.actor.setFlag("random-loot-generator", "lootSettings", settings);
          await this.actor.setFlag("random-loot-generator", "customLootEnabled", true);
          console.log(`Updated token loot sources for ${this.actor.name}:`, settings);
          this.render();
        }
      },
      cancel: {
        icon: '<i class="fas fa-ban"></i>',
        label: game.i18n.localize("RLG.ManageLootSources.Cancel"),
        callback: () => console.log(`Cancelled source selection for ${this.actor.name}`)
      }
    },
    default: "save"
  }).render(true);
});
    }
}

class RarityPercentagesForm extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 400,
            height: "auto",
            resizable: true,
            classes: ["rarity-percentages-window"],
            title: game.i18n.localize("RLG.RarityPercentages.Title"),
            template: "modules/random-loot-generator/rarityPercentages.html"
        });
    }

    getData() {
        let percentages = game.settings.get("random-loot-generator", "rarityPercentages") || {
            "Common": 50,
            "Uncommon": 30,
            "Rare": 15,
            "Very Rare": 4,
            "Legendary": 1
        };
        return { percentages };
    }

    activateListeners(html) {
        super.activateListeners(html);
        const $html = $(html);
        $html.find(".save-percentages").off("click").on("click", this._onSave.bind(this));
        $html.find(".restore-defaults").off("click").on("click", this._onRestoreDefaults.bind(this));
    }

    async _onSave(event) {
        event.preventDefault();
        const formData = new FormData(this.element.find("form")[0]);
        let percentages = {};
        for (let [key, value] of formData.entries()) {
            percentages[key] = parseInt(value) || 0;
        }
        await game.settings.set("random-loot-generator", "rarityPercentages", percentages);
        ui.notifications.info(game.i18n.localize("RLG.RarityPercentages.Saved"));
        this.close();
    }

    async _onRestoreDefaults(event) {
        event.preventDefault();
        const defaultPercentages = {
            "Common": 50,
            "Uncommon": 30,
            "Rare": 15,
            "Very Rare": 4,
            "Legendary": 1
        };
        await game.settings.set("random-loot-generator", "rarityPercentages", defaultPercentages);
        ui.notifications.info(game.i18n.localize("RLG.RarityPercentages.Restored"));
        this.render();
    }

    async _updateObject(event, formData) {
        // Handled by _onSave
    }
}

Hooks.on("getSceneControlButtons", (controls) => {
  console.log("🎯 Hook triggered: getSceneControlButtons");

  // 🛡️ Ensure token controls exist
  const tokenControls = controls["tokens"];
  if (!tokenControls) {
    console.warn("⚠️ Token controls not found");
    return;
  }

  // 🧪 Add the "generate-loot" tool
  tokenControls.tools["generate-loot"] = {
    name: "generate-loot",
    title: "Generate Random Loot",
    icon: "fas fa-coins",
    visible: game.user.isGM,
    button: true,
    onClick: () => {
      console.log("🪙 Coin button clicked!");

      const selected = canvas.tokens.controlled;
      console.log("🎯 Selected tokens:", selected);

      if (!selected.length) {
        ui.notifications.warn("No tokens selected.");
        return;
      }

      if (!game.lootGenerator) {
        console.warn("❌ game.lootGenerator is undefined.");
        return;
      }

      game.lootGenerator.generateLootForTokens(selected);
    }
  };
});





Hooks.once("init", () => {
    console.log("🔄 Random Loot Generator: INIT HOOK STARTED!");

    game.settings.register("random-loot-generator", "enableLootPreview", {
        name: game.i18n.localize("RLG.EnableLootPreview.Name"),
        hint: game.i18n.localize("RLG.EnableLootPreview.Hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        onChange: value => {
            if (game.lootGenerator) {
                game.lootGenerator.lootPreviewEnabled = value;
                console.log(`Loot Preview setting updated: ${value}`);
            }
        }
    });

    game.settings.register("random-loot-generator", "enableAutoLoot", {
        name: game.i18n.localize("RLG.EnableAutoLoot.Name"),
        hint: game.i18n.localize("RLG.EnableAutoLoot.Hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: value => console.log(`Auto-Loot setting updated: ${value}`)
    });

    game.settings.register("random-loot-generator", "randomQuantityFormula", {
        name: game.i18n.localize("RLG.RandomQuantityFormula.Name"),
        hint: game.i18n.localize("RLG.RandomQuantityFormula.Hint"),
        scope: "world",
        config: true,
        type: String,
        default: "1d4",
        onChange: value => console.log(`Random Quantity Formula updated: ${value}`)
    });
    game.settings.register("random-loot-generator", "debugLogging", {
        name: game.i18n.localize("RLG.DebugLogging.Name"),
        hint: game.i18n.localize("RLG.DebugLogging.Hint"),
        scope: "client",
        config: true,
        type: Boolean,
        default: false
    });


    game.settings.register("random-loot-generator", "maxRarity", {
        name: game.i18n.localize("RLG.MaxRarity.Name"),
        hint: game.i18n.localize("RLG.MaxRarity.Hint"),
        scope: "world",
        config: true,
        type: String,
        choices: {
            "Common": game.i18n.localize("RLG.MaxRarity.Common"),
            "Uncommon": game.i18n.localize("RLG.MaxRarity.Uncommon"),
            "Rare": game.i18n.localize("RLG.MaxRarity.Rare"),
            "Very Rare": game.i18n.localize("RLG.MaxRarity.VeryRare"),
            "Legendary": game.i18n.localize("RLG.MaxRarity.Legendary")
        },
        default: "Legendary",
        onChange: value => console.log(`Max Rarity setting updated: ${value}`)
    });

    game.settings.register("random-loot-generator", "selectedCompendiums", {
        name: game.i18n.localize("RLG.SelectedCompendiums.Name"),
        hint: game.i18n.localize("RLG.SelectedCompendiums.Hint"),
        scope: "world",
        config: true,
        type: String,
        default: "dnd5e.tradegoods",
        onChange: value => {
            if (game.lootGenerator && game.packs) {
                game.lootGenerator.selectedCompendiums = typeof value === "string" ? value.split(",").map(comp => comp.trim()).filter(comp => comp && game.packs.get(comp)) : ["dnd5e.tradegoods"];
                console.log(`Compendium selection updated: ${game.lootGenerator.selectedCompendiums}`);
            }
        }
    });

    game.settings.register("random-loot-generator", "useCRBasedCurrency", {
        name: game.i18n.localize("RLG.UseCRBasedCurrency.Name"),
        hint: game.i18n.localize("RLG.UseCRBasedCurrency.Hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: value => console.log(`CR-Based Currency setting updated: ${value}`)
    });

    game.settings.register("random-loot-generator", "defaultCurrencyChance", {
        name: game.i18n.localize("RLG.DefaultCurrencyChance.Name"),
        hint: game.i18n.localize("RLG.DefaultCurrencyChance.Hint"),
        scope: "world",
        config: true,
        type: Number,
        range: { min: 0, max: 100, step: 1 },
        default: 75,
        onChange: value => console.log(`Default Currency Chance updated: ${value}%`)
    });

    game.settings.register("random-loot-generator", "currencyFormula", {
        name: game.i18n.localize("RLG.CurrencyFormula.Name"),
        hint: game.i18n.localize("RLG.CurrencyFormula.Hint"),
        scope: "world",
        config: true,
        type: String,
        default: "1d10",
        onChange: value => console.log(`Currency Formula updated: ${value}`)
    });

    game.settings.register("random-loot-generator", "selectedFolders", {
        name: game.i18n.localize("RLG.SelectedFolders.Name"),
        hint: game.i18n.localize("RLG.SelectedFolders.Hint"),
        scope: "world",
        config: false,
        type: Array,
        default: []
    });

    game.settings.register("random-loot-generator", "creatureTypeLoot", {
        name: game.i18n.localize("RLG.CreatureTypeLoot.Name"),
        hint: game.i18n.localize("RLG.CreatureTypeLoot.Hint"),
        scope: "world",
        config: false,
        type: Object,
        default: {}
    });

    game.settings.registerMenu("random-loot-generator", "creatureTypeLootMenu", {
        name: game.i18n.localize("RLG.CreatureTypeLootMenu.Name"),
        label: game.i18n.localize("RLG.CreatureTypeLootMenu.Label"),
        hint: game.i18n.localize("RLG.CreatureTypeLootMenu.Hint"),
        icon: "fas fa-dragon",
        type: CreatureTypeLootForm,
        restricted: true
    });

    game.settings.register("random-loot-generator", "rarityPercentages", {
        name: game.i18n.localize("RLG.RarityPercentages.Name"),
        hint: game.i18n.localize("RLG.RarityPercentages.Hint"),
        scope: "world",
        config: false,
        type: Object,
        default: {
            "Common": 50,
            "Uncommon": 30,
            "Rare": 15,
            "Very Rare": 4,
            "Legendary": 1
        }
    });

    game.settings.registerMenu("random-loot-generator", "rarityPercentagesMenu", {
        name: game.i18n.localize("RLG.RarityPercentagesMenu.Name"),
        label: game.i18n.localize("RLG.RarityPercentagesMenu.Label"),
        hint: game.i18n.localize("RLG.RarityPercentagesMenu.Hint"),
        icon: "fas fa-percentage",
        type: RarityPercentagesForm,
        restricted: true
    });

    game.settings.register("random-loot-generator", "lootTables", {
        name: game.i18n.localize("RLG.LootTables.Name"),
        hint: game.i18n.localize("RLG.LootTables.Hint"),
        scope: "world",
        config: false,
        type: Array,
        default: []
    });

    game.lootGenerator = new LootGenerator();
    Hooks.once("ready", () => {
        game.lootGenerator.loadSettings();
        console.log("Loot Generator initialized successfully!", game.lootGenerator);
    });

    console.log("✅ INIT HOOK COMPLETED!");
});

Hooks.on("renderSettingsConfig", (app, html, data) => {
    if (!game.user.isGM) return;

    const separators = [
        { before: "random-loot-generator.enableLootPreview", title: game.i18n.localize("RLG.Settings.GeneralOptions") },
        { before: "random-loot-generator.randomQuantityFormula", title: game.i18n.localize("RLG.Settings.DefaultLootSettings") },
        { before: "random-loot-generator.useCRBasedCurrency", title: game.i18n.localize("RLG.Settings.CurrencySettings") }
    ];

    separators.forEach(sep => {
        const setting = $(html).find(`[name="${sep.before}"]`).closest(".form-group");
        if (setting.length) {
            setting.before(`<h2 style="border-bottom: 1px solid #999; margin: 10px 0; padding-bottom: 5px;">${sep.title}</h2>`);
        }
    });

    let settingElement = $(html).find(`[name="random-loot-generator.selectedCompendiums"]`).parent();
    settingElement.find("input").remove();
    let button = $(`<button type="button" style="padding: 8px 12px; font-size: 14px; line-height: 1.5; height: auto; display: inline-block; vertical-align: middle; white-space: nowrap; border: 1px solid #999; border-radius: 2px; cursor: pointer;"><i class="fas fa-book"></i> ${game.i18n.localize("RLG.ManageLootSources.Title")}</button>`);
    button.on("click", () => {
  const lg = game?.lootGenerator;
  if (!lg || typeof lg.showCompendiumSelection !== "function") {
    console.warn("[RLG] Missing showCompendiumSelection handler; loot generator not initialized or world state is corrupted. Try reloading the world, enabling the module, or checking init errors.");
    return;
  }
  lg.showCompendiumSelection();
});
    settingElement.append(button);

    const crBasedCheckbox = $(html).find(`[name="random-loot-generator.useCRBasedCurrency"]`);
    const currencyFormulaInput = $(html).find(`[name="random-loot-generator.currencyFormula"]`);

    const toggleCurrencyFormula = () => {
        const isCRBased = crBasedCheckbox.prop("checked");
        currencyFormulaInput.prop("disabled", isCRBased);
        currencyFormulaInput.css("opacity", isCRBased ? "0.5" : "1");
    };

    toggleCurrencyFormula();
    crBasedCheckbox.on("change", toggleCurrencyFormula);
});

Hooks.on("createToken", async (tokenDoc) => {
    if (!game.settings.get("random-loot-generator", "enableAutoLoot")) return;
    if (!tokenDoc.actor || tokenDoc.actor.type !== "npc") return;
    console.log(`Auto-Loot triggered for ${tokenDoc.name}`);
    if (game?.lootGenerator?.generateLootForTokens) {
        await game.lootGenerator.generateLootForTokens([tokenDoc.object]);
    } else {
        console.warn("[RLG] Auto-Loot: lootGenerator missing or not ready; skipping generateLootForTokens.");
    }
});

Hooks.on("renderTokenConfig", (app, html, data) => {
    const $html = $(html);
    if (!game.user.isGM) return;

    const actor = app.document?.actor;
    if (!actor) {
        console.warn("No actor found for TokenConfig—skipping custom loot section.");
        return;
    }

    const customLootEnabled = actor.getFlag("random-loot-generator", "customLootEnabled") ?? false;
    console.log(`🔧 TokenConfig render for ${actor.name}: customLootEnabled = ${customLootEnabled}`);

    if ($html.find('[data-random-loot-generator]').length > 0) {
        console.log("🔁 Loot section already present in this render, skipping reinjection.");
        return;
    }

    const lootSection = $(`
        <fieldset data-random-loot-generator style="margin: 10px 0; padding: 10px; border: 1px solid #999; border-radius: 5px; position: relative; z-index: 1;">
            <legend>${game.i18n.localize("RLG.TokenConfig.Legend")}</legend>
            <div class="form-group">
                <label>${game.i18n.localize("RLG.TokenConfig.EnableCustomLoot")}</label>
                <input type="checkbox" name="flags.random-loot-generator.customLootEnabled" ${customLootEnabled ? "checked" : ""}>
                <button type="button" class="configure-loot" style="margin-left: 10px; padding: 4px 8px; border: 1px solid #999; border-radius: 5px; background-color: #333; color: white; opacity: ${customLootEnabled ? "1" : "0.5"}; cursor: ${customLootEnabled ? "pointer" : "not-allowed"};" ${customLootEnabled ? "" : "disabled"}>${game.i18n.localize("RLG.TokenConfig.ConfigureLoot")}</button>
            </div>
        </fieldset>
    `);

    const resourcesTab = $html.find('.tab[data-tab="resources"]');
    if (resourcesTab.length) {
        resourcesTab.append(lootSection);
        console.log("✅ Custom loot section appended to resources tab.");
    } else {
        const fallback = $html.find('.sheet-body') || $html.find('.form-content');
        if (fallback.length) {
            fallback.append(lootSection);
            console.log("⚠️ Appended custom loot section to fallback area.");
        } else {
            console.warn("❌ No suitable place found to inject loot section.");
        }
    }

    const toggleButton = () => {
        const isChecked = lootSection.find("input[name='flags.random-loot-generator.customLootEnabled']").prop("checked");
        lootSection.find(".configure-loot").prop("disabled", !isChecked).css({
            "cursor": isChecked ? "pointer" : "not-allowed",
            "opacity": isChecked ? "1" : "0.5"
        });
    };

    $html.off("change", "input[name='flags.random-loot-generator.customLootEnabled']").on("change", "input[name='flags.random-loot-generator.customLootEnabled']", async (event) => {
        const isChecked = $(event.currentTarget).prop("checked");
        await actor.setFlag("random-loot-generator", "customLootEnabled", isChecked);
        console.log(`🟨 Checkbox updated for ${actor.name}: customLootEnabled = ${isChecked}`);
        toggleButton();
    });

    $html.off("click", ".configure-loot").on("click", ".configure-loot", async () => {
        if (!lootSection.find(".configure-loot").prop("disabled")) {
            const creatureType = actor.system?.details?.type?.value || "humanoid";
            const form = new TokenLootSettingsForm(actor, creatureType);
            form.render(true);
            form._onClose = async function () {
                const isCustomEnabled = await actor.getFlag("random-loot-generator", "customLootEnabled") || false;
                lootSection.find("input[name='flags.random-loot-generator.customLootEnabled']").prop("checked", isCustomEnabled);
                toggleButton();
                console.log(`✅ TokenLootSettingsForm closed for ${actor.name}: customLootEnabled = ${isCustomEnabled}`);
                await FormApplication.prototype._onClose.call(this);
            };
        }
    });
});

Hooks.on('renderDialog', async (app, html, data) => {
  if (!game.user.isGM) return;
  const title = app.title;
  const expectedTitles = [
    game.i18n.localize("RLG.ManageLootSources.Title"),
    game.i18n.format("RLG.CompendiumSelection.TitleFor", { creatureType: /.*/ }),
    game.i18n.format("RLG.TokenLootSettings.TitleFor", { name: /.*/ })
  ];
  const isTargetDialog = expectedTitles.some(expected => 
    typeof expected === 'string' ? title === expected : title.match(expected)
  );
  if (isTargetDialog) {
    rlgDebug(`Decorating dialog: ${title}`);
    rlgDebug(`Dialog HTML (first 200 chars): ${html[0].outerHTML.substring(0, 200)}...`);
    await rlgDecorateSourceDialog(app, html);
    const disabledLabels = html.find('label.rlg-source--disabled');
    rlgDebug(`Found ${disabledLabels.length} disabled labels in ${title}`);
  } else {
    rlgDebug(`Skipping dialog: ${title} (not a target dialog)`);
  }
});