
// === RLG Debug + Source Count Helpers ===
const RLG_DEBUG = () => {
  try { return game.settings.get("random-loot-generator", "debugLogging"); } catch (e) { return false; }
};
const rlgDebug = (...args) => { if (RLG_DEBUG()) console.debug("[RLG]", ...args); };
const RLG_CURRENCY_TYPES = ["cp", "sp", "ep", "gp", "pp"];
const RLG_DEFAULT_CURRENCY_TYPES = RLG_CURRENCY_TYPES.join(",");

const _rlgCountCache = { packs: new Map(), folders: new Map(), tables: new Map() };

function rlgGetEnabledCurrencyTypes(moduleName = "random-loot-generator") {
  let setting;
  try {
    setting = game.settings.get(moduleName, "enabledCurrencyTypes");
  } catch (e) {
    setting = RLG_DEFAULT_CURRENCY_TYPES;
  }

  const rawTypes = Array.isArray(setting)
    ? setting
    : String(setting ?? RLG_DEFAULT_CURRENCY_TYPES).split(",");

  return rawTypes
    .map(type => String(type).trim().toLowerCase())
    .filter((type, index, types) => RLG_CURRENCY_TYPES.includes(type) && types.indexOf(type) === index);
}

function rlgEmptyCurrency() {
  return RLG_CURRENCY_TYPES.reduce((currency, type) => {
    currency[type] = 0;
    return currency;
  }, {});
}

async function rlgMaybeRollCurrency(currency, enabledCurrencyTypes, type, formula, multiplier = 1, skipChance = 0.2) {
  if (!enabledCurrencyTypes.includes(type)) return false;
  if (Math.random() <= skipChance) return false;

  const roll = await new Roll(formula).evaluate();
  currency[type] = Math.floor(roll.total * multiplier);
  return currency[type] > 0;
}

async function rlgForceMinimumCurrency(currency, enabledCurrencyTypes, preferredTypes) {
  const type = preferredTypes.find(type => enabledCurrencyTypes.includes(type));
  if (!type) return false;

  const formulas = {
    cp: "1d4",
    sp: "1d6",
    ep: "1d4",
    gp: "1d6",
    pp: "1d2"
  };

  currency[type] = (await new Roll(formulas[type]).evaluate()).total;
  return true;
}

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
    const resolvable = results.filter(r => {
      if (rlgIsTextTableResult(r)) return !!rlgTableResultLabel(r);
      return rlgIsDocumentTableResult(r) && rlgTableResultLooksLikeItem(r);
    }).length;

    _rlgCountCache.tables.set(table.id, resolvable);
    rlgDebug(`Counted table rows for ${table.name}: resolvable=${resolvable}`);
    return resolvable;
  } catch (e) {
    rlgDebug("Table count failed", table?.id, e);
    return 0;
  }
}

function rlgIsDocumentTableResult(result) {
  const type = result?.type;
  const documentType = globalThis.CONST?.TABLE_RESULT_TYPES?.DOCUMENT;
  return type === "document" || type === documentType || type === 1;
}

function rlgIsTextTableResult(result) {
  const type = result?.type;
  const textType = globalThis.CONST?.TABLE_RESULT_TYPES?.TEXT;
  return type === "text" || type === textType || type === 0;
}

function rlgPackFromUuid(uuid) {
  if (typeof uuid !== "string" || !uuid.startsWith("Compendium.")) return "";
  const parts = uuid.split(".");
  return parts.length >= 3 ? `${parts[1]}.${parts[2]}` : "";
}

function rlgTableResultDocumentUuid(result) {
  const directUuid = result?.documentUuid || result?._source?.documentUuid;
  if (typeof directUuid === "string" && directUuid) return directUuid;

  const legacyUuid = result?._source?.uuid || result?.uuid;
  if (typeof legacyUuid === "string" && (legacyUuid.startsWith("Item.") || legacyUuid.includes(".Item."))) return legacyUuid;

  const collection = result?._source?.documentCollection;
  const documentId = result?._source?.documentId;
  if (typeof collection !== "string" || typeof documentId !== "string" || !collection || !documentId) return "";
  if (collection === "Item" || collection === "items") return `Item.${documentId}`;
  if (collection.startsWith("Compendium.")) return `${collection}.Item.${documentId}`;
  if (collection.includes(".")) return `Compendium.${collection}.Item.${documentId}`;
  return "";
}

function rlgTableResultLooksLikeItem(result) {
  const uuid = rlgTableResultDocumentUuid(result);
  return typeof uuid === "string" && (uuid.startsWith("Item.") || uuid.includes(".Item."));
}

function rlgTableResultLabel(result) {
  return result?.name || result?.description || result?._source?.name || result?._source?.description || result?._source?.text;
}

async function rlgDocumentFromTableResult(result) {
  if (!rlgIsDocumentTableResult(result) || !rlgTableResultLooksLikeItem(result)) return null;
  const uuid = rlgTableResultDocumentUuid(result);
  try {
    const doc = await fromUuid(uuid);
    if (doc?.documentName !== "Item" && doc?.constructor?.documentName !== "Item") {
      rlgDebug("Ignoring non-Item table result", uuid, doc?.documentName || doc?.constructor?.documentName || doc?.type);
      return null;
    }
    return doc;
  } catch (e) {
    rlgDebug("Failed to resolve table result UUID", uuid, e);
    return null;
  }
}

function rlgSyntheticItemFromTableResult(result) {
  const name = rlgTableResultLabel(result);
  if (!name) return null;
  return {
    name,
    type: "loot",
    img: result.img || "icons/svg/mystery-man.svg",
    system: { rarity: "Common" }
  };
}

function rlgPrepareItemData(item) {
  const data = item?.toObject ? item.toObject() : item;
  if (!data || data.type === "document") return null;
  if (item?.documentName && item.documentName !== "Item") return null;
  if (item?.constructor?.documentName && item.constructor.documentName !== "Item") return null;
  if (data._id === undefined && item?.id) data._id = item.id;
  return data;
}




async function rlgDecorateSourceDialog(app, html) {
  rlgInsertStylesOnce(app);
  const element = rlgAsElement(html);
  if (!element) return;
  _rlgCountCache.packs.clear();
  _rlgCountCache.folders.clear();
  _rlgCountCache.tables.clear();
  rlgDebug("Cleared count cache for dialog render");

  // Wait longer for DOM to stabilize
  await new Promise(resolve => setTimeout(resolve, 300));

  const labels = Array.from(element.querySelectorAll('label')).filter(label =>
    label.querySelector('input[name="compendium"], input[name="folder"], input[name="table"]')
  );

  if (!labels.length) {
    rlgDebug("No matching labels found in dialog", app.title);
    return;
  }

for (const label of labels) {
  const input = label.querySelector('input');
  const span = label.querySelector('span');
  if (!span) {
    rlgDebug("No span found in label", label.innerHTML);
    continue;
  }
  const type = input.name;
  const value = input.value;
  let count = 0;

  // Hoist for catch safety
  const currentText = span.textContent.trim();

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
      span.textContent = `${currentText} (${count})`;
    }

    if (count === 0) {
      label.classList.add('rlg-source--disabled');
      input.disabled = true;
      input.checked = false;
      label.title = game.i18n.localize("RLG.NoItemsFound");
      input.title = game.i18n.localize("RLG.NoItemsFound");
      input.style.cursor = 'not-allowed';
      rlgDebug(`Applied rlg-source--disabled, unchecked, title, and cursor for ${type} source: ${value}`);
    } else {
      label.classList.remove('rlg-source--disabled');
      input.disabled = false;
      label.removeAttribute('title');
      input.removeAttribute('title');
      input.style.cursor = '';
    }

    rlgDebug(`Decorated ${type} source: ${value} with count ${count}`);
  } catch (e) {
    rlgDebug(`Failed to decorate ${type} source: ${value}`, e);

    // Keep the "(N)" if already present; otherwise show (0)
    span.textContent = /\(\d+\)$/.test(currentText) ? currentText : `${currentText} (0)`;

    label.classList.add('rlg-source--disabled');
    input.disabled = true;
    input.checked = false;
    label.title = game.i18n.localize("RLG.NoItemsFound");
    input.title = game.i18n.localize("RLG.NoItemsFound");
    input.style.cursor = 'not-allowed';
    rlgDebug(`Applied rlg-source--disabled, unchecked, title, and cursor for ${type} source: ${value} (error case)`);
    rlgDebug(`Label title: ${label.title}, Input disabled: ${input.disabled}, Input cursor: ${input.style.cursor}, Input title: ${input.title}`);
  }
}


  // Re-apply attributes after a second delay to counter post-rendering changes
  setTimeout(() => {
    labels.forEach(label => {
      const input = label.querySelector('input');
      const type = input.name;
      const value = input.value;
      const count = type === 'compendium' ? _rlgCountCache.packs.get(value) || 0 :
                    type === 'folder' ? _rlgCountCache.folders.get(value) || 0 :
                    type === 'table' ? _rlgCountCache.tables.get(value) || 0 : 0;
      if (count === 0) {
        label.classList.add('rlg-source--disabled');
        input.disabled = true;
        input.checked = false;
        label.title = game.i18n.localize("RLG.NoItemsFound");
        input.title = game.i18n.localize("RLG.NoItemsFound");
        input.style.cursor = 'not-allowed';
        rlgDebug(`Re-applied attributes for ${type} source: ${value} after delay`);
        rlgDebug(`Re-applied - Label title: ${label.title}, Input disabled: ${input.disabled}, Input cursor: ${input.style.cursor}, Input title: ${input.title}`);
      }
    });
  }, 500);
}





// === RLG Debug + Source Count Helpers ===
function rlgInsertStylesOnce(app) {
  const styleId = `rlg-styles-${app.id || 'global'}`;
  const element = rlgAsElement(app.element);
  if (element?.querySelector(`#${styleId}`) || document.querySelector(`#${styleId}`)) return;
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
  const dialogContent = element?.querySelector('.dialog-content, .window-content') || element || document.head;
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

const RLG_MODULE_ID = "random-loot-generator";
const RLG_API = foundry.applications.api;
const RLG_DialogV2 = RLG_API.DialogV2;

function rlgLocalize(key) {
  return game.i18n.localize(key);
}

function rlgFormat(key, data) {
  return game.i18n.format(key, data);
}

function rlgAsElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function rlgRenderApplication(app) {
  if (!app?.render) return;
  return app instanceof RLG_API.ApplicationV2 ? app.render({ force: true }) : app.render(true);
}

function rlgNormalizeCompendiumSetting(value) {
  if (Array.isArray(value)) return value.filter(id => id && game.packs.get(id));
  if (typeof value === "string") {
    return value.split(",").map(id => id.trim()).filter(id => id && game.packs.get(id));
  }
  return [];
}

function rlgDefaultLootSettings() {
  return {
    compendiums: [],
    folders: [],
    tables: [],
    quantityFormula: "",
    maxRarity: "",
    currencyChance: null,
    itemChance: null
  };
}

function rlgNormalizeLootSettings(settings = {}) {
  return {
    ...rlgDefaultLootSettings(),
    ...settings,
    compendiums: Array.isArray(settings.compendiums) ? settings.compendiums.filter(id => game.packs.get(id)) : [],
    folders: Array.isArray(settings.folders) ? settings.folders.filter(id => game.folders.get(id)) : [],
    tables: Array.isArray(settings.tables) ? settings.tables.filter(id => game.tables.get(id)) : [],
    currencyChance: settings.currencyChance ?? null,
    itemChance: settings.itemChance ?? null
  };
}

function rlgDocumentFlagEnabled(document, key) {
  return document?.getFlag?.(RLG_MODULE_ID, key) || false;
}

function rlgDocumentFlagSettings(document, key) {
  return document?.getFlag?.(RLG_MODULE_ID, key);
}

function rlgDocumentHasFlag(document, key) {
  return Object.prototype.hasOwnProperty.call(document?.flags?.[RLG_MODULE_ID] || {}, key);
}

function rlgFlagValue(source, key) {
  return source?.flags?.[RLG_MODULE_ID]?.[key];
}

function rlgHasFlagValue(source, key) {
  return Object.prototype.hasOwnProperty.call(source?.flags?.[RLG_MODULE_ID] || {}, key);
}

function rlgTokenOverrideEnabled(token) {
  if (rlgDocumentHasFlag(token?.document, "tokenLootEnabled")) return rlgDocumentFlagEnabled(token.document, "tokenLootEnabled");
  return rlgDocumentFlagEnabled(token?.actor, "customLootEnabled");
}

function rlgTokenOverrideSettings(token) {
  if (rlgDocumentHasFlag(token?.document, "tokenLootSettings")) return rlgDocumentFlagSettings(token.document, "tokenLootSettings");
  return rlgDocumentFlagSettings(token?.actor, "lootSettings");
}

function rlgPrototypeLootEnabled(actor) {
  return rlgFlagValue(actor?.prototypeToken, "defaultLootEnabled") || false;
}

function rlgPrototypeLootSettings(actor) {
  return rlgFlagValue(actor?.prototypeToken, "defaultLootSettings") || {};
}

function rlgResolveLootOverride(token) {
  const tokenEnabled = rlgTokenOverrideEnabled(token);
  if (tokenEnabled) {
    return {
      source: "token",
      enabled: true,
      settings: rlgNormalizeLootSettings(rlgTokenOverrideSettings(token))
    };
  }

  const actor = token?.actor;
  if (rlgHasFlagValue(token?.document, "defaultLootEnabled") && rlgFlagValue(token.document, "defaultLootEnabled")) {
    return {
      source: "prototype",
      enabled: true,
      settings: rlgNormalizeLootSettings(rlgFlagValue(token.document, "defaultLootSettings") || {})
    };
  }

  if (rlgPrototypeLootEnabled(actor)) {
    return {
      source: "prototype",
      enabled: true,
      settings: rlgNormalizeLootSettings(rlgPrototypeLootSettings(actor))
    };
  }

  return {
    source: "creatureType",
    enabled: false,
    settings: rlgDefaultLootSettings()
  };
}

function rlgSelectedSourcesFromForm(form) {
  const formData = new FormData(form);
  return {
    compendiums: formData.getAll("compendium").filter(Boolean),
    folders: formData.getAll("folder").filter(Boolean),
    tables: formData.getAll("table").filter(Boolean)
  };
}

async function rlgBuildSourceSelectionContent({ selectedCompendiums = [], selectedFolders = [], selectedTables = [] } = {}) {
  const packs = game.packs.contents.filter(p => p.metadata.type === "Item");
  const folders = game.folders.filter(f => f.type === "Item" && f.contents.length > 0);
  const tables = game.tables.contents;
  let content = `<div class="rlg-source-dialog" style="max-height: 400px; overflow-y: auto;">`;

  content += `<h3>${rlgLocalize("RLG.CompendiumSelection.Compendiums")}</h3>`;
  if (packs.length === 0) content += `<p>${rlgLocalize("RLG.CompendiumSelection.NoCompendiums")}</p>`;
  else {
    const compendiumHtml = await Promise.all(packs.map(async pack => {
      const count = await rlgCountPackItems(pack);
      const checked = count > 0 && selectedCompendiums.includes(pack.collection) ? "checked" : "";
      const disabled = count === 0 ? "disabled" : "";
      const title = count === 0 ? `title="${rlgLocalize("RLG.NoItemsFound")}"` : "";
      return `<label style="display: inline-flex; align-items: center; gap: 6px;" ${title}>
        <input type="checkbox" name="compendium" value="${pack.collection}" ${checked} ${disabled} style="margin: 0; cursor: ${count === 0 ? 'not-allowed' : 'default'};" ${title}>
        <span style="vertical-align: middle;">${pack.metadata.label} (${count})</span>
      </label><br>`;
    }));
    content += compendiumHtml.join("");
  }

  content += `<h3>${rlgLocalize("RLG.CompendiumSelection.Folders")}</h3>`;
  if (folders.length === 0) content += `<p>${rlgLocalize("RLG.CompendiumSelection.NoFolders")}</p>`;
  content += folders.map(folder => {
    const count = rlgCountFolderItems(folder.id);
    const checked = count > 0 && selectedFolders.includes(folder.id) ? "checked" : "";
    const disabled = count === 0 ? "disabled" : "";
    const title = count === 0 ? `title="${rlgLocalize("RLG.NoItemsFound")}"` : "";
    return `<label style="display: inline-flex; align-items: center; gap: 6px;" ${title}>
      <input type="checkbox" name="folder" value="${folder.id}" ${checked} ${disabled} style="margin: 0; cursor: ${count === 0 ? 'not-allowed' : 'default'};" ${title}>
      <span style="vertical-align: middle;">${folder.name} (${count})</span>
    </label><br>`;
  }).join("");

  content += `<h3>${rlgLocalize("RLG.CompendiumSelection.RollTables")}</h3>`;
  if (tables.length === 0) content += `<p>${rlgLocalize("RLG.CompendiumSelection.NoTables")}</p>`;
  content += tables.map(table => {
    const count = rlgCountResolvableTableRows(table);
    const checked = count > 0 && selectedTables.includes(table.id) ? "checked" : "";
    const disabled = count === 0 ? "disabled" : "";
    const title = count === 0 ? `title="${rlgLocalize("RLG.NoItemsFound")}"` : "";
    return `<label style="display: inline-flex; align-items: center; gap: 6px;" ${title}>
      <input type="checkbox" name="table" value="${table.id}" ${checked} ${disabled} style="margin: 0; cursor: ${count === 0 ? 'not-allowed' : 'default'};" ${title}>
      <span style="vertical-align: middle;">${table.name} (${count})</span>
    </label><br>`;
  }).join("");

  content += `</div>`;
  return content;
}

async function rlgOpenSourceSelectionDialog({ title, selectedCompendiums, selectedFolders, selectedTables, requireSelection = true, onSave }) {
  const content = await rlgBuildSourceSelectionContent({ selectedCompendiums, selectedFolders, selectedTables });
  new RLG_DialogV2({
    window: { title },
    content,
    buttons: [{
      action: "save",
      icon: "fa-solid fa-save",
      label: rlgLocalize("RLG.ManageLootSources.Save"),
      default: true,
      callback: async (event, button) => {
        const selected = rlgSelectedSourcesFromForm(button.form);
        if (requireSelection && !selected.compendiums.length && !selected.folders.length && !selected.tables.length) {
          ui.notifications.warn(rlgLocalize("RLG.Notification.SelectAtLeastOneSource"));
          return false;
        }
        await onSave(selected);
      }
    }, {
      action: "cancel",
      icon: "fa-solid fa-xmark",
      label: rlgLocalize("RLG.ManageLootSources.Cancel")
    }]
  }).render({ force: true });
}

class RLGApplicationV2 extends RLG_API.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: [],
    window: { frame: true, positioned: true, minimizable: true, resizable: true },
    position: { height: "auto" }
  };

  static template = "";

  async _renderHTML(context, options) {
    const html = await foundry.applications.handlebars.renderTemplate(this.constructor.template, context);
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content;
  }

  _replaceHTML(result, content, options) {
    content.replaceChildren(result);
  }
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
      if (!game.user.isGM) return; // Defensive: only GM executes loot generation  
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

        // Check for token-specific or prototype-token default settings.
        const override = rlgResolveLootOverride(token);
        let lootSettings = override.enabled ? override.settings : typeSettings;
        const customLootEnabled = override.enabled;
        console.log(`Using ${override.source} loot settings for ${token.name || creatureType}:`, lootSettings);

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
            : (this.selectedCompendiums.length > 0 ? this.selectedCompendiums : rlgNormalizeCompendiumSetting(game.settings.get(this.moduleName, "selectedCompendiums")));
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

        const itemTuning = rlgResolveItemTuning({ creatureType, token, typeSettings, lootSettings, customLootEnabled });
        let quantityFormula = itemTuning.quantityFormula || "1d4";
        let currencyChance = rlgResolveCurrencyChance(typeSettings, lootSettings, customLootEnabled);
        let itemChance = itemTuning.itemChance;

        console.log(`Fetching loot for ${creatureType}. Custom enabled: ${customLootEnabled}. Using compendiums:`, selectedCompendiums, "Folders:", selectedFolders, "Tables:", selectedTables, "Quantity Formula:", quantityFormula, "Item Chance:", itemChance, "Currency Chance:", currencyChance);

if (!selectedCompendiums.length && !selectedFolders.length && !selectedTables.length) {
  ui.notifications.warn(game.i18n.format("RLG.Notification.NoSourcesSelected", {
    name: customLootEnabled ? token.name : creatureType
  }));
  noItemSources = true; // do not return — we still want to roll currency
}


        let maxRarity = itemTuning.maxRarity || "Legendary";
        let rarityLevels = RLG_RARITY_LEVELS;
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

  if (rlgIsDocumentTableResult(res)) {
    const item = await rlgDocumentFromTableResult(res);

    if (!item) return null;



    const itemData = rlgPrepareItemData(item);
    if (!itemData) return null;
    itemData.pack = item.pack || rlgPackFromUuid(rlgTableResultDocumentUuid(res)) || "";
    return itemData;
  }

  if (rlgIsTextTableResult(res)) {
    // Text result – synthesize a simple item
    return rlgSyntheticItemFromTableResult(res);
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
    const rollResult = await table.roll();
    const results = rollResult?.results ?? [];

    for (const result of results) {
      if (rlgIsTextTableResult(result)) return rlgSyntheticItemFromTableResult(result);

      const doc = await rlgDocumentFromTableResult(result);
      if (!doc) continue;

      const rar = normalizeRarity(doc.system?.rarity);
      if (!rarityAllowed(rar)) continue;

      const data = rlgPrepareItemData(doc);
      if (!data) continue;
      data.pack = doc.pack || rlgPackFromUuid(rlgTableResultDocumentUuid(result)) || "";
      return data;
    }

    // Single roll produced no item -> respect the table’s odds
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
  if (src.kind === "pack")        { picked = await getItemFromPack(src.pack); }
  else if (src.kind === "folder") { picked = await getItemFromFolder(src.folder); }
  else if (src.kind === "table")  { picked = await getItemFromTable(src.table); }

  if (picked) break;

  // NEW: if a table yielded nothing, honor that and stop for this slot
  if (!picked && src.kind === "table") break;
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


        let currency = rlgEmptyCurrency();
        const enabledCurrencyTypes = rlgGetEnabledCurrencyTypes(this.moduleName);
        let useCRBasedCurrency = game.settings.get(this.moduleName, "useCRBasedCurrency");
        if (useCRBasedCurrency && token?.actor?.system?.details?.cr !== undefined) {
            let cr = token.actor.system.details.cr;
            console.log(`Generating CR-based currency for CR ${cr} with ${currencyChance}% chance. Enabled coin types: ${enabledCurrencyTypes.join(", ") || "none"}`);
            let currencyRoll = Math.random() * 100;
            if (currencyRoll <= currencyChance && enabledCurrencyTypes.length) {
                let generated = false;
                const skipChance = 0.2;
                if (cr <= 1) {
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "cp", "3d6", 1, skipChance) || generated;
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "sp", "1d4", 1, skipChance) || generated;
                } else if (cr <= 4) {
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "cp", "5d6", 1, skipChance) || generated;
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "sp", "2d6", 1, skipChance) || generated;
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "ep", "1d4", 1, skipChance) || generated;
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "gp", "1d4", 1, skipChance) || generated;
                } else if (cr <= 8) {
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "sp", "1d6 * 5", 1, skipChance) || generated;
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "ep", "1d6 * 3", 1, skipChance) || generated;
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "gp", "1d6 * 5", 1, skipChance) || generated;
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "pp", "1d4", 1, skipChance) || generated;
                } else if (cr <= 12) {
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "ep", "1d6 * 5", 1, skipChance) || generated;
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "gp", "1d6 * 10", 1, skipChance) || generated;
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "pp", "1d6 * 2", 1, skipChance) || generated;
                } else if (cr <= 16) {
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "gp", "1d6 * 30", 1, skipChance) || generated;
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "pp", "1d6 * 5", 1, skipChance) || generated;
                } else {
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "gp", "2d6 * 50", 1, skipChance) || generated;
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "pp", "1d6 * 10", 1, skipChance) || generated;
                }
                if (!generated) {
                    console.log("All currency types skipped, forcing minimal generation");
                    if (cr <= 1) await rlgForceMinimumCurrency(currency, enabledCurrencyTypes, ["cp", "sp", "ep", "gp", "pp"]);
                    else if (cr <= 4) await rlgForceMinimumCurrency(currency, enabledCurrencyTypes, ["sp", "ep", "gp", "cp", "pp"]);
                    else if (cr <= 8) await rlgForceMinimumCurrency(currency, enabledCurrencyTypes, ["gp", "ep", "sp", "pp", "cp"]);
                    else await rlgForceMinimumCurrency(currency, enabledCurrencyTypes, ["gp", "pp", "ep", "sp", "cp"]);
                }
                console.log(`Generated CR-based currency for CR ${cr}:`, currency);
            } else if (!enabledCurrencyTypes.length) {
                console.log("No currency generated because all coin types are disabled.");
            } else {
                console.log(`No currency generated for ${customLootEnabled ? token.name : creatureType} (roll ${currencyRoll.toFixed(1)} vs ${currencyChance}%)`);
            }
        } else {
            let currencyFormula = game.settings.get(this.moduleName, "currencyFormula") || "1d10";
            console.log(`Generating fixed-formula currency with "${currencyFormula}" and ${currencyChance}% chance. Enabled coin types: ${enabledCurrencyTypes.join(", ") || "none"}`);
            let currencyRoll = Math.random() * 100;
            if (currencyRoll <= currencyChance && enabledCurrencyTypes.length) {
                try {
                    const skipChance = 0.2;
                    let generated = false;
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "cp", currencyFormula, 10, skipChance) || generated;
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "sp", currencyFormula, 5, skipChance) || generated;
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "ep", currencyFormula, 2, skipChance) || generated;
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "gp", currencyFormula, 1, skipChance) || generated;
                    generated = await rlgMaybeRollCurrency(currency, enabledCurrencyTypes, "pp", "1d4", 0.5, skipChance) || generated;
                    if (!generated) {
                        console.log("All currency types skipped, forcing minimal generation");
                        await rlgForceMinimumCurrency(currency, enabledCurrencyTypes, ["gp", "ep", "sp", "cp", "pp"]);
                    }
                    console.log(`Generated currency:`, currency);
                } catch (error) {
                    console.error(`❌ ERROR: Invalid currency formula "${currencyFormula}". Defaulting to 0.`);
                    ui.notifications.error(game.i18n.format("RLG.Notification.InvalidCurrencyFormula", { formula: currencyFormula }));
                }
            } else if (!enabledCurrencyTypes.length) {
                console.log("No currency generated because all coin types are disabled.");
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
                    const items = loot.items.map(item => rlgPrepareItemData(item)).filter(Boolean);
                    const dropped = loot.items.length - items.length;
                    if (dropped > 0) console.warn(`Random Loot Generator skipped ${dropped} invalid non-Item loot result(s) for ${token.name}.`);
                    if (items.length) {
                        token.actor.createEmbeddedDocuments("Item", items)
                            .then(() => console.log(`✅ Successfully added items to ${token.name}`))
                            .catch(err => console.error(`❌ Error adding items:`, err));
                    }
                }
                if (Object.values(loot.currency).some(val => val > 0)) {
                    let currentCurrency = token.actor.system.currency || rlgEmptyCurrency();
                    let updatedCurrency = {
                        cp: (currentCurrency.cp || 0) + (loot.currency.cp || 0),
                        sp: (currentCurrency.sp || 0) + (loot.currency.sp || 0),
                        ep: (currentCurrency.ep || 0) + (loot.currency.ep || 0),
                        gp: (currentCurrency.gp || 0) + (loot.currency.gp || 0),
                        pp: (currentCurrency.pp || 0) + (loot.currency.pp || 0)
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
      if (!game.user.isGM) return; // Never show loot preview to players  
      let content = `
            <style>
                .rlg-loot-preview .loot-item { display: flex; align-items: center; gap: 10px; min-height: 30px; }
                .rlg-loot-preview .loot-img {
                    width: 30px !important;
                    height: 30px !important;
                    max-width: 30px !important;
                    max-height: 30px !important;
                    object-fit: cover;
                    flex: 0 0 30px;
                    border-radius: 5px;
                }
                .rlg-loot-preview .loot-item.common { color:rgb(117, 113, 113); }
                .rlg-loot-preview .loot-item.uncommon { color:rgb(3, 182, 3); }
                .rlg-loot-preview .loot-item.rare { color: #0000ff; }
                .rlg-loot-preview .loot-item.very-rare { color: #ff00ff; }
                .rlg-loot-preview .loot-item.legendary { color:rgb(226, 157, 9); }
                .rlg-loot-preview .item-link { cursor: pointer; text-decoration: underline; }
                .rlg-loot-preview .item-link:hover { opacity: 0.8; }
            </style>
            <div class="rlg-loot-preview">`;
        tokens.forEach(token => {
            let loot = lootAssignments[token.id];
            let itemList = loot.items
                .map((item, index) => {
                    const rarity = (item.system?.rarity || "Common").toLowerCase().replace("very rare", "very-rare");
                    const itemId = item._id || `temp-${index}`;
                    const pack = item.pack || "";
                    return `<div class="loot-item ${rarity}">
                        <img src="${item.img}" class="loot-img" width="30" height="30" style="width: 30px; height: 30px; max-width: 30px; max-height: 30px; object-fit: cover; flex: 0 0 30px; border-radius: 5px;">
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
        content += `</div>`;
        const dialog = new RLG_DialogV2({
            window: { title: game.i18n.localize("RLG.LootPreview.Title") },
            content,
            buttons: [{
                action: "reroll",
                label: game.i18n.localize("RLG.LootPreview.Reroll"),
                callback: () => this.generateLootForTokens(tokens)
            }, {
                action: "apply",
                label: game.i18n.localize("RLG.LootPreview.Apply"),
                default: true,
                callback: () => this.applyLoot(lootAssignments)
            }]
        });
        dialog.addEventListener("render", () => {
            dialog.element.querySelectorAll(".item-link").forEach(link => {
                link.addEventListener("click", event => {
                    const itemId = event.currentTarget.dataset.itemId;
                    const pack = event.currentTarget.dataset.pack;
                    console.log(`Clicked item: ID=${itemId}, Pack=${pack}`);
                    this.openItemSheet(itemId, pack);
                });
            });
        });
        dialog.render({ force: true });
    }

    openItemSheet(itemId, pack = "") {
        console.log(`Opening item sheet: ID=${itemId}, Pack=${pack}`);
        if (pack) {
            game.packs.get(pack)?.getDocument(itemId).then(item => {
                if (item) {
                    console.log(`Found compendium item: ${item.name}`);
                    rlgRenderApplication(item.sheet);
                } else {
                    console.warn(`Item ${itemId} not found in pack ${pack}`);
                }
            });
        } else {
            const item = game.items.get(itemId);
            if (item) {
                console.log(`Found world item: ${item.name}`);
                rlgRenderApplication(item.sheet);
            } else {
                console.warn(`Item ${itemId} not found in world items`);
            }
        }
    }

async showCompendiumSelection() {
  await rlgOpenSourceSelectionDialog({
    title: game.i18n.localize("RLG.ManageLootSources.Title"),
    selectedCompendiums: this.selectedCompendiums,
    selectedFolders: this.selectedFolders,
    selectedTables: this.selectedTables,
    requireSelection: false,
    onSave: async selected => {
      this.selectedCompendiums = selected.compendiums;
      this.selectedFolders = selected.folders;
      this.selectedTables = selected.tables;
      await game.settings.set(this.moduleName, "selectedCompendiums", this.selectedCompendiums.join(","));
      await game.settings.set(this.moduleName, "selectedFolders", this.selectedFolders);
      await game.settings.set(this.moduleName, "lootTables", this.selectedTables);
      console.log("Default loot sources updated:", { compendiums: this.selectedCompendiums, folders: this.selectedFolders, tables: this.selectedTables });
    }
  });
}
}

const RLG_CREATURE_TYPES = [
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

const RLG_DEFAULT_RARITY_PERCENTAGES = {
  "Common": 50,
  "Uncommon": 30,
  "Rare": 15,
  "Very Rare": 4,
  "Legendary": 1
};

const RLG_RARITY_LEVELS = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"];

const RLG_DEFAULT_CR_BANDS = [
  { id: "0-4", label: "CR 0-4", min: 0, max: 4, maxRarity: "Common" },
  { id: "5-10", label: "CR 5-10", min: 5, max: 10, maxRarity: "Uncommon" },
  { id: "11-16", label: "CR 11-16", min: 11, max: 16, maxRarity: "Rare" },
  { id: "17-plus", label: "CR 17+", min: 17, max: null, maxRarity: "Legendary" }
];

function rlgDefaultCrBandSettings(band) {
  return {
    id: band.id,
    label: band.label,
    min: band.min,
    max: band.max,
    quantityFormula: "",
    itemChance: null,
    maxRarity: band.maxRarity || ""
  };
}

function rlgEmptyCrBandOverride(band) {
  return {
    id: band.id,
    label: band.label,
    min: band.min,
    max: band.max,
    quantityFormula: "",
    itemChance: null,
    maxRarity: ""
  };
}

function rlgDefaultCrLootSettings() {
  return {
    fallback: {
      quantityFormula: "",
      itemChance: 100
    },
    bands: Object.fromEntries(RLG_DEFAULT_CR_BANDS.map(band => [band.id, rlgDefaultCrBandSettings(band)])),
    creatureTypes: {}
  };
}

function rlgNormalizeItemChance(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function rlgNormalizeCrBandSettings(band, value = {}, { defaults = true } = {}) {
  const base = defaults ? rlgDefaultCrBandSettings(band) : rlgEmptyCrBandOverride(band);
  return {
    ...base,
    ...value,
    id: band.id,
    label: band.label,
    min: band.min,
    max: band.max,
    quantityFormula: typeof value.quantityFormula === "string" ? value.quantityFormula.trim() : base.quantityFormula,
    itemChance: rlgNormalizeItemChance(value.itemChance),
    maxRarity: RLG_RARITY_LEVELS.includes(value.maxRarity) ? value.maxRarity : base.maxRarity
  };
}

function rlgNormalizeCrLootSettings(settings = {}) {
  const defaults = rlgDefaultCrLootSettings();
  const normalized = {
    fallback: {
      ...defaults.fallback,
      ...(settings.fallback || {}),
      quantityFormula: typeof settings.fallback?.quantityFormula === "string" ? settings.fallback.quantityFormula.trim() : defaults.fallback.quantityFormula,
      itemChance: rlgNormalizeItemChance(settings.fallback?.itemChance) ?? defaults.fallback.itemChance
    },
    bands: {},
    creatureTypes: {}
  };

  for (const band of RLG_DEFAULT_CR_BANDS) {
    normalized.bands[band.id] = rlgNormalizeCrBandSettings(band, settings.bands?.[band.id], { defaults: true });
  }

  for (const type of RLG_CREATURE_TYPES) {
    const raw = settings.creatureTypes?.[type.key] || {};
    normalized.creatureTypes[type.key] = { bands: {} };
    for (const band of RLG_DEFAULT_CR_BANDS) {
      normalized.creatureTypes[type.key].bands[band.id] = rlgNormalizeCrBandSettings(band, raw.bands?.[band.id], { defaults: false });
    }
  }

  return normalized;
}

function rlgParseChallengeRating(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.includes("/")) {
    const [num, den] = text.split("/").map(part => Number(part.trim()));
    return Number.isFinite(num) && Number.isFinite(den) && den !== 0 ? num / den : null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function rlgFindCrBand(cr) {
  if (!Number.isFinite(cr)) return null;
  return RLG_DEFAULT_CR_BANDS.find(band => cr >= band.min && (band.max === null || cr <= band.max)) || null;
}

function rlgHasTuningValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function rlgSettingPercent(value, fallback) {
  if (!rlgHasTuningValue(value)) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback;
}

function rlgResolveCurrencyChance(typeSettings = {}, lootSettings = {}, customLootEnabled = false) {
  let chance = rlgSettingPercent(game.settings.get(RLG_MODULE_ID, "defaultCurrencyChance"), 75);
  chance = rlgSettingPercent(typeSettings.currencyChance, chance);
  if (customLootEnabled) chance = rlgSettingPercent(lootSettings.currencyChance, chance);
  return chance;
}

function rlgCrBandHasOverride(settings = {}) {
  return rlgHasTuningValue(settings.quantityFormula)
    || rlgHasTuningValue(settings.itemChance)
    || rlgHasTuningValue(settings.maxRarity);
}

function rlgApplyItemTuning(target, source = {}) {
  if (rlgHasTuningValue(source.quantityFormula)) target.quantityFormula = source.quantityFormula;
  if (rlgHasTuningValue(source.itemChance)) target.itemChance = source.itemChance;
  if (rlgHasTuningValue(source.maxRarity)) target.maxRarity = source.maxRarity;
  return target;
}

function rlgResolveItemTuning({ creatureType, token, typeSettings = {}, lootSettings = {}, customLootEnabled = false }) {
  const crSettings = rlgNormalizeCrLootSettings(game.settings.get(RLG_MODULE_ID, "crLootSettings") || {});
  const fallback = crSettings.fallback || {};
  const tuning = {
    quantityFormula: fallback.quantityFormula || game.settings.get(RLG_MODULE_ID, "randomQuantityFormula") || "1d4",
    itemChance: rlgHasTuningValue(fallback.itemChance) ? fallback.itemChance : 100,
    maxRarity: game.settings.get(RLG_MODULE_ID, "maxRarity") || "Legendary"
  };

  rlgApplyItemTuning(tuning, typeSettings);

  const crScalingEnabled = game.settings.get(RLG_MODULE_ID, "enableCRBasedItems");
  const cr = rlgParseChallengeRating(token?.actor?.system?.details?.cr);
  const band = rlgFindCrBand(cr);
  const creatureCrSettings = crSettings.creatureTypes?.[creatureType];
  if (crScalingEnabled && band) {
    rlgApplyItemTuning(tuning, crSettings.bands?.[band.id]);
    rlgApplyItemTuning(tuning, creatureCrSettings?.bands?.[band.id]);
    rlgDebug("Applied CR item scaling", { creatureType, cr, band: band.id, tuning });
  }

  if (customLootEnabled) rlgApplyItemTuning(tuning, lootSettings);
  return tuning;
}

const RLG_EXPORTABLE_SETTINGS = [
  "enableLootPreview",
  "enableAutoLoot",
  "randomQuantityFormula",
  "debugLogging",
  "maxRarity",
  "selectedCompendiums",
  "selectedFolders",
  "lootTables",
  "creatureTypeLoot",
  "rarityPercentages",
  "enableCRBasedItems",
  "crLootSettings",
  "useCRBasedCurrency",
  "defaultCurrencyChance",
  "currencyFormula",
  "enabledCurrencyTypes"
];

function rlgExportAllSettings() {
  const settings = {};
  for (const key of RLG_EXPORTABLE_SETTINGS) {
    try {
      settings[key] = game.settings.get(RLG_MODULE_ID, key);
    } catch (e) {
      rlgDebug("Skipping setting export", key, e);
    }
  }

  const json = JSON.stringify({
    module: RLG_MODULE_ID,
    version: game.modules.get(RLG_MODULE_ID)?.version || "",
    exportedAt: new Date().toISOString(),
    settings
  }, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "random-loot-generator-settings.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function rlgImportAllSettingsFromFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const settings = payload.settings || payload;
    if (!settings || typeof settings !== "object") throw new Error("Invalid settings payload");

    for (const key of RLG_EXPORTABLE_SETTINGS) {
      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        await game.settings.set(RLG_MODULE_ID, key, settings[key]);
      }
    }

    if (game.lootGenerator) {
      game.lootGenerator.lootPreviewEnabled = game.settings.get(RLG_MODULE_ID, "enableLootPreview");
      game.lootGenerator.selectedCompendiums = rlgNormalizeCompendiumSetting(game.settings.get(RLG_MODULE_ID, "selectedCompendiums"));
      game.lootGenerator.selectedFolders = game.settings.get(RLG_MODULE_ID, "selectedFolders") || [];
      game.lootGenerator.selectedTables = game.settings.get(RLG_MODULE_ID, "lootTables") || [];
    }

    ui.notifications.info(rlgLocalize("RLG.Notification.SettingsImported"));
  } catch (error) {
    ui.notifications.error(rlgLocalize("RLG.Notification.SettingsImportFailed"));
    console.error("Random Loot Generator settings import failed:", error);
  }
}

class CrItemScalingForm extends RLGApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "rlg-cr-item-scaling",
    classes: ["cr-item-scaling-window"],
    window: { frame: true, positioned: true, minimizable: true, resizable: true },
    position: { width: 820, height: "auto" }
  };

  static template = "modules/random-loot-generator/crItemScaling.html";

  constructor(options = {}) {
    super(foundry.utils.mergeObject({
      window: { title: rlgLocalize("RLG.CRItemScaling.Title") }
    }, options, { inplace: false }));
    this.expandedCreatures = new Set();
  }

  async _prepareContext(options) {
    const settings = rlgNormalizeCrLootSettings(game.settings.get(RLG_MODULE_ID, "crLootSettings") || {});
    const fallback = {
      ...settings.fallback,
      quantityFormula: settings.fallback.quantityFormula || game.settings.get(RLG_MODULE_ID, "randomQuantityFormula") || "1d4",
      maxRarity: game.settings.get(RLG_MODULE_ID, "maxRarity") || "Legendary"
    };

    return {
      enabled: game.settings.get(RLG_MODULE_ID, "enableCRBasedItems"),
      fallback,
      rarityLevels: RLG_RARITY_LEVELS,
      bands: RLG_DEFAULT_CR_BANDS.map(band => settings.bands[band.id]),
      creatureTypes: RLG_CREATURE_TYPES.map(type => ({
        ...type,
        hasOverrides: Object.values(settings.creatureTypes[type.key]?.bands || {}).some(rlgCrBandHasOverride),
        expanded: this.expandedCreatures.has(type.key) || Object.values(settings.creatureTypes[type.key]?.bands || {}).some(rlgCrBandHasOverride),
        bands: RLG_DEFAULT_CR_BANDS.map(band => settings.creatureTypes[type.key]?.bands?.[band.id] || rlgEmptyCrBandOverride(band))
      }))
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const form = this.element.querySelector("form");
    form?.addEventListener("submit", event => event.preventDefault());
    form?.addEventListener("change", event => this._onAutoSave(event));
    this.element.querySelectorAll(".creature-cr-toggle").forEach(button => {
      button.addEventListener("click", event => this._toggleCreatureSection(event.currentTarget.closest(".creature-cr-block")));
    });
    this.element.querySelector(".export-cr-settings")?.addEventListener("click", event => this._exportCrSettings(event));
    this.element.querySelector(".import-cr-settings")?.addEventListener("click", event => this._importCrSettings(event));
    this.element.querySelector(".restore-defaults")?.addEventListener("click", event => this._onRestoreDefaults(event));
  }

  _toggleCreatureSection(block) {
    if (!block) return;
    const creature = block.dataset.creature;
    block.classList.toggle("collapsed");
    const expanded = !block.classList.contains("collapsed");
    if (expanded) this.expandedCreatures.add(creature);
    else this.expandedCreatures.delete(creature);
    const button = block.querySelector(".creature-cr-toggle");
    const icon = button?.querySelector("i");
    button?.setAttribute("aria-expanded", expanded ? "true" : "false");
    icon?.classList.toggle("fa-chevron-down", expanded);
    icon?.classList.toggle("fa-chevron-right", !expanded);
  }

  _readBand(form, selector) {
    return {
      quantityFormula: form.querySelector(`${selector}[data-field="quantityFormula"]`)?.value?.trim() || "",
      itemChance: rlgNormalizeItemChance(form.querySelector(`${selector}[data-field="itemChance"]`)?.value),
      maxRarity: form.querySelector(`${selector}[data-field="maxRarity"]`)?.value || ""
    };
  }

  _validateQuantity(formula) {
    const quantityRegex = /^(\d+d\d+([+-]\d+)?|\d+)$/;
    return !formula || quantityRegex.test(formula);
  }

  async _saveForm(form, { notify = false } = {}) {
    const fallbackQuantity = form.querySelector('[name="fallback.quantityFormula"]')?.value?.trim() || "1d4";
    if (!this._validateQuantity(fallbackQuantity)) {
      ui.notifications.warn(rlgFormat("RLG.Notification.InvalidQuantity", { formula: fallbackQuantity }));
      return false;
    }

    const settings = rlgDefaultCrLootSettings();
    settings.fallback = {
      quantityFormula: fallbackQuantity,
      itemChance: rlgNormalizeItemChance(form.querySelector('[name="fallback.itemChance"]')?.value) ?? 100
    };

    for (const band of RLG_DEFAULT_CR_BANDS) {
      const bandSettings = this._readBand(form, `[data-scope="global"][data-band="${band.id}"]`);
      if (!this._validateQuantity(bandSettings.quantityFormula)) {
        ui.notifications.warn(rlgFormat("RLG.Notification.InvalidQuantity", { formula: bandSettings.quantityFormula }));
        return false;
      }
      settings.bands[band.id] = rlgNormalizeCrBandSettings(band, bandSettings, { defaults: true });
    }

    for (const type of RLG_CREATURE_TYPES) {
      const bands = {};
      for (const band of RLG_DEFAULT_CR_BANDS) {
        const bandSettings = this._readBand(form, `[data-scope="creature"][data-creature="${type.key}"][data-band="${band.id}"]`);
        if (!this._validateQuantity(bandSettings.quantityFormula)) {
          ui.notifications.warn(rlgFormat("RLG.Notification.InvalidQuantity", { formula: bandSettings.quantityFormula }));
          return false;
        }
        bands[band.id] = rlgNormalizeCrBandSettings(band, bandSettings, { defaults: false });
      }
      settings.creatureTypes[type.key] = { bands };
    }

    await game.settings.set(RLG_MODULE_ID, "enableCRBasedItems", form.querySelector('[name="enabled"]')?.checked || false);
    await game.settings.set(RLG_MODULE_ID, "randomQuantityFormula", settings.fallback.quantityFormula);
    await game.settings.set(RLG_MODULE_ID, "maxRarity", form.querySelector('[name="fallback.maxRarity"]')?.value || "Legendary");
    await game.settings.set(RLG_MODULE_ID, "crLootSettings", settings);
    if (notify) ui.notifications.info(rlgLocalize("RLG.CRItemScaling.Saved"));
    return true;
  }

  async _onAutoSave(event) {
    const form = event.currentTarget;
    const saved = await this._saveForm(form);
    if (saved && event.target?.dataset?.scope === "creature") this._updateCreatureOverrideIndicator(event.target.dataset.creature);
    if (saved && event.target?.name === "enabled") this._updateEnabledStatus(event.target.checked);
    if (saved) rlgDebug("CR item scaling auto-saved");
  }

  _updateCreatureOverrideIndicator(creature) {
    if (!creature) return;
    const block = this.element.querySelector(`.creature-cr-block[data-creature="${creature}"]`);
    const label = block?.querySelector(".creature-cr-label");
    if (!block || !label) return;
    const hasOverrides = Array.from(block.querySelectorAll("[data-scope='creature']"))
      .some(input => rlgHasTuningValue(input.value));
    label.classList.toggle("custom", hasOverrides);
  }

  _updateEnabledStatus(enabled) {
    const status = this.element.querySelector(".cr-scaling-status");
    if (!status) return;
    status.classList.toggle("enabled", enabled);
    status.classList.toggle("disabled", !enabled);
    status.textContent = enabled
      ? "CR-Based Item Scaling is enabled. CR bands can override quantity, item chance, and max rarity."
      : "CR-Based Item Scaling is disabled. Saved CR band settings will not affect loot until enabled.";
  }

  _exportCrSettings(event) {
    event.preventDefault();
    const payload = {
      module: RLG_MODULE_ID,
      type: "cr-item-scaling",
      version: game.modules.get(RLG_MODULE_ID)?.version || "",
      exportedAt: new Date().toISOString(),
      enableCRBasedItems: game.settings.get(RLG_MODULE_ID, "enableCRBasedItems"),
      randomQuantityFormula: game.settings.get(RLG_MODULE_ID, "randomQuantityFormula"),
      maxRarity: game.settings.get(RLG_MODULE_ID, "maxRarity"),
      crLootSettings: game.settings.get(RLG_MODULE_ID, "crLootSettings")
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "random-loot-generator-cr-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  _importCrSettings(event) {
    event.preventDefault();
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async changeEvent => {
      const file = changeEvent.currentTarget.files?.[0];
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        const crLootSettings = payload.crLootSettings || payload.settings?.crLootSettings;
        if (!crLootSettings || typeof crLootSettings !== "object") throw new Error("Missing crLootSettings");
        await game.settings.set(RLG_MODULE_ID, "enableCRBasedItems", payload.enableCRBasedItems ?? payload.settings?.enableCRBasedItems ?? false);
        if (payload.randomQuantityFormula || payload.settings?.randomQuantityFormula) {
          await game.settings.set(RLG_MODULE_ID, "randomQuantityFormula", payload.randomQuantityFormula || payload.settings.randomQuantityFormula);
        }
        if (payload.maxRarity || payload.settings?.maxRarity) {
          await game.settings.set(RLG_MODULE_ID, "maxRarity", payload.maxRarity || payload.settings.maxRarity);
        }
        await game.settings.set(RLG_MODULE_ID, "crLootSettings", rlgNormalizeCrLootSettings(crLootSettings));
        ui.notifications.info(rlgLocalize("RLG.CRItemScaling.Imported"));
        this.render({ force: true });
      } catch (error) {
        ui.notifications.error(rlgLocalize("RLG.CRItemScaling.ImportFailed"));
        console.error("CR item scaling import failed:", error);
      }
    });
    input.click();
  }

  async _onRestoreDefaults(event) {
    event.preventDefault();
    const confirmed = await RLG_DialogV2.confirm({
      window: { title: rlgLocalize("RLG.CRItemScaling.RestoreConfirm.Title") },
      content: `<p>${rlgLocalize("RLG.CRItemScaling.RestoreConfirm.Content")}</p>`,
      yes: { label: rlgLocalize("RLG.CRItemScaling.RestoreConfirm.Restore"), icon: "fa-solid fa-repeat" },
      no: { label: rlgLocalize("RLG.ManageLootSources.Cancel"), icon: "fa-solid fa-ban" },
      rejectClose: false
    });
    if (!confirmed) return;
    await game.settings.set(RLG_MODULE_ID, "enableCRBasedItems", false);
    await game.settings.set(RLG_MODULE_ID, "randomQuantityFormula", "1d4");
    await game.settings.set(RLG_MODULE_ID, "crLootSettings", rlgDefaultCrLootSettings());
    ui.notifications.info(rlgLocalize("RLG.CRItemScaling.Restored"));
    this.render({ force: true });
  }
}

class CreatureTypeLootForm extends RLGApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "rlg-creature-type-loot",
    classes: ["creature-type-loot-window"],
    window: { frame: true, positioned: true, minimizable: true, resizable: true },
    position: { width: 700, height: "auto" }
  };

  static template = "modules/random-loot-generator/creatureTypeLoot.html";

  constructor(options = {}) {
    super(foundry.utils.mergeObject({
      window: { title: rlgLocalize("RLG.CreatureTypeLoot.Title") }
    }, options, { inplace: false }));
  }

  async _prepareContext(options) {
    const settings = foundry.utils.duplicate(game.settings.get(RLG_MODULE_ID, "creatureTypeLoot") || {});
    const creatureTypes = RLG_CREATURE_TYPES.map(type => {
      const typeSettings = rlgNormalizeLootSettings(settings[type.key]);
      const totalSources = typeSettings.compendiums.length + typeSettings.folders.length + typeSettings.tables.length;
      return {
        ...type,
        selectedLabel: totalSources > 0 ? `Custom [${totalSources}]` : rlgLocalize("RLG.CompendiumSelection.DefaultLabel"),
        quantityFormula: typeSettings.quantityFormula || "",
        maxRarity: typeSettings.maxRarity || "",
        currencyChance: typeSettings.currencyChance !== null ? typeSettings.currencyChance : "",
        itemChance: typeSettings.itemChance !== null ? typeSettings.itemChance : "",
        totalSources
      };
    });

    console.log("Rendering creature types:", creatureTypes);
    return {
      creatureTypes,
      globalMaxRarity: game.settings.get(RLG_MODULE_ID, "maxRarity") || "Legendary",
      globalCurrencyChance: game.settings.get(RLG_MODULE_ID, "defaultCurrencyChance") || 75,
      globalItemChance: 100,
      globalQuantityFormula: game.settings.get(RLG_MODULE_ID, "randomQuantityFormula") || "1d4"
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const html = this.element;
    const focusNextField = currentInput => {
      const inputs = Array.from(html.querySelectorAll("input, select, button"));
      const currentIndex = inputs.indexOf(currentInput);
      const nextIndex = (currentIndex + 1) % inputs.length;
      inputs[nextIndex]?.focus();
    };
    const debouncedRender = foundry.utils.debounce(() => this.render({ force: true }), 100);
    const onFieldKeydown = event => {
      if (event.key === "Tab") {
        event.preventDefault();
        focusNextField(event.currentTarget);
      } else if (event.key === "Enter") {
        event.preventDefault();
      }
    };

    html.querySelectorAll(".quantity-input").forEach(input => {
      input.addEventListener("keydown", onFieldKeydown);
      input.addEventListener("change", async event => {
        const creatureType = event.currentTarget.dataset.creatureType;
        const newFormula = event.currentTarget.value.trim();
        const quantityRegex = /^(\d+d\d+([+-]\d+)?|\d+)$/;
        if (newFormula && !quantityRegex.test(newFormula)) {
          ui.notifications.warn(rlgFormat("RLG.Notification.InvalidQuantity", { formula: newFormula }));
          return;
        }
        await this._updateCreatureSetting(creatureType, { quantityFormula: newFormula });
        console.log(`Updated ${creatureType} quantityFormula to: ${newFormula}`);
        debouncedRender();
      });
    });

    html.querySelectorAll(".item-chance-input").forEach(input => {
      input.addEventListener("keydown", onFieldKeydown);
      input.addEventListener("change", async event => {
        const creatureType = event.currentTarget.dataset.creatureType;
        const value = event.currentTarget.value.trim();
        const itemChance = value === "" || parseInt(value) === 0 ? null : parseInt(value);
        await this._updateCreatureSetting(creatureType, { itemChance });
        console.log(`Updated ${creatureType} itemChance to: ${itemChance === null ? "[Global]" : itemChance + "%"}`);
        debouncedRender();
      });
    });

	    html.querySelectorAll(".currency-chance-input").forEach(input => {
	      input.addEventListener("keydown", onFieldKeydown);
	      input.addEventListener("change", async event => {
	        const creatureType = event.currentTarget.dataset.creatureType;
	        const value = event.currentTarget.value.trim();
	        const currencyChance = value === "" ? null : parseInt(value);
	        await this._updateCreatureSetting(creatureType, { currencyChance });
	        console.log(`Updated ${creatureType} currencyChance to: ${currencyChance === null ? "[Global]" : currencyChance + "%"}`);
	        debouncedRender();
      });
    });

    html.querySelectorAll(".rarity-select").forEach(select => {
      select.addEventListener("keydown", onFieldKeydown);
      select.addEventListener("change", async event => {
        const creatureType = event.currentTarget.dataset.creatureType;
        const maxRarity = event.currentTarget.value;
        await this._updateCreatureSetting(creatureType, { maxRarity });
        console.log(`Updated ${creatureType} maxRarity to: ${maxRarity || "[Global]"}`);
        debouncedRender();
      });
    });

    html.querySelectorAll(".compendium-select-btn").forEach(button => {
      button.addEventListener("click", event => this._openCreatureSourceDialog(event.currentTarget.dataset.creatureType));
    });
    html.querySelector(".reset-defaults")?.addEventListener("click", () => this._resetDefaults());
    html.querySelector(".export-sources")?.addEventListener("click", () => this.exportSources());
    html.querySelector(".import-sources")?.addEventListener("click", () => this.importSources());
  }

  async _updateCreatureSetting(creatureType, update) {
    const settings = foundry.utils.duplicate(game.settings.get(RLG_MODULE_ID, "creatureTypeLoot") || {});
    settings[creatureType] = { ...rlgDefaultLootSettings(), ...(settings[creatureType] || {}), ...update };
    await game.settings.set(RLG_MODULE_ID, "creatureTypeLoot", settings);
  }

  async _openCreatureSourceDialog(creatureType) {
    if (!creatureType) {
      console.error("No creature type specified for compendium selection button.");
      ui.notifications.error(rlgLocalize("RLG.Notification.NoCreatureType"));
      return;
    }
    const creatureTypeLoot = game.settings.get(RLG_MODULE_ID, "creatureTypeLoot") || {};
    const typeSettings = rlgNormalizeLootSettings(creatureTypeLoot[creatureType]);
	    await rlgOpenSourceSelectionDialog({
	      title: rlgFormat("RLG.CompendiumSelection.TitleFor", { creatureType }),
	      selectedCompendiums: typeSettings.compendiums,
	      selectedFolders: typeSettings.folders,
	      selectedTables: typeSettings.tables,
	      requireSelection: false,
	      onSave: async selected => {
        const settings = foundry.utils.duplicate(game.settings.get(RLG_MODULE_ID, "creatureTypeLoot") || {});
        settings[creatureType] = {
          ...rlgDefaultLootSettings(),
          ...typeSettings,
          compendiums: selected.compendiums,
          folders: selected.folders,
          tables: selected.tables
        };
        await game.settings.set(RLG_MODULE_ID, "creatureTypeLoot", settings);
        console.log(`Updated ${creatureType} sources:`, settings[creatureType]);
        this.render({ force: true });
      }
    });
  }

  async _resetDefaults() {
    const confirmed = await RLG_DialogV2.confirm({
      window: { title: rlgLocalize("RLG.ResetConfirm.Title") },
      content: `<p>${rlgLocalize("RLG.Notification.ResetConfirm")}</p>`,
      yes: { label: rlgLocalize("RLG.ResetConfirm.Reset"), icon: "fa-solid fa-repeat" },
      no: { label: rlgLocalize("RLG.ManageLootSources.Cancel"), icon: "fa-solid fa-ban" },
      rejectClose: false
    });
    if (!confirmed) {
      console.log("Reset canceled");
      return;
    }
    await game.settings.set(RLG_MODULE_ID, "creatureTypeLoot", {});
    ui.notifications.info(rlgLocalize("RLG.Notification.ResetSuccess"));
    this.render({ force: true });
  }

  exportSources() {
	    const settings = {
	      selectedCompendiums: game.settings.get(RLG_MODULE_ID, "selectedCompendiums"),
	      selectedFolders: game.settings.get(RLG_MODULE_ID, "selectedFolders"),
	      lootTables: game.settings.get(RLG_MODULE_ID, "lootTables"),
	      creatureTypeLoot: game.settings.get(RLG_MODULE_ID, "creatureTypeLoot"),
	      enableCRBasedItems: game.settings.get(RLG_MODULE_ID, "enableCRBasedItems"),
	      crLootSettings: game.settings.get(RLG_MODULE_ID, "crLootSettings")
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
    input.onchange = async event => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async e => {
        try {
          const settings = JSON.parse(e.target.result);
          await game.settings.set(RLG_MODULE_ID, "selectedCompendiums", settings.selectedCompendiums || "");
	          await game.settings.set(RLG_MODULE_ID, "selectedFolders", settings.selectedFolders || []);
	          await game.settings.set(RLG_MODULE_ID, "lootTables", settings.lootTables || []);
	          await game.settings.set(RLG_MODULE_ID, "creatureTypeLoot", settings.creatureTypeLoot || {});
	          await game.settings.set(RLG_MODULE_ID, "enableCRBasedItems", settings.enableCRBasedItems || false);
	          await game.settings.set(RLG_MODULE_ID, "crLootSettings", settings.crLootSettings || rlgDefaultCrLootSettings());
	          game.lootGenerator.selectedCompendiums = rlgNormalizeCompendiumSetting(settings.selectedCompendiums);
          game.lootGenerator.selectedFolders = settings.selectedFolders || [];
          game.lootGenerator.selectedTables = settings.lootTables || [];
          ui.notifications.info(rlgLocalize("RLG.Notification.SourcesImported"));
          this.render({ force: true });
        } catch (error) {
          ui.notifications.error(rlgLocalize("RLG.Notification.ImportFailed"));
          console.error("Import error:", error);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }
}

class TokenLootSettingsForm extends RLGApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "rlg-token-loot-settings",
    classes: ["token-loot-settings-window"],
    window: { frame: true, positioned: true, minimizable: true, resizable: true },
    position: { width: 600, height: "auto" }
  };

  static template = "modules/random-loot-generator/tokenLootSettings.html";

  constructor(actor, creatureType, options = {}) {
    super(foundry.utils.mergeObject({
      id: `rlg-token-loot-settings-${actor?.id || foundry.utils.randomID()}`,
      window: { title: options.title || rlgLocalize("RLG.TokenLootSettings.Title") }
    }, options, { inplace: false }));
    this.actor = actor;
    this.creatureType = creatureType;
    this.mode = options.mode || "token";
    this.tokenDocument = options.tokenDocument || null;
  }

  async _getStoredSettings() {
    if (this.mode === "prototype") return rlgPrototypeLootSettings(this.actor);
    if (this.tokenDocument) {
      return rlgDocumentHasFlag(this.tokenDocument, "tokenLootSettings")
        ? rlgDocumentFlagSettings(this.tokenDocument, "tokenLootSettings")
        : rlgDocumentFlagSettings(this.actor, "lootSettings");
    }
    return rlgDocumentFlagSettings(this.actor, "lootSettings");
  }

  async _setStoredSettings(settings) {
    if (this.mode === "prototype") {
      await this.actor.update({
        [`prototypeToken.flags.${RLG_MODULE_ID}.defaultLootSettings`]: settings,
        [`prototypeToken.flags.${RLG_MODULE_ID}.defaultLootEnabled`]: true
      });
      return;
    }

    if (this.tokenDocument) {
      await this.tokenDocument.setFlag(RLG_MODULE_ID, "tokenLootSettings", settings);
      await this.tokenDocument.setFlag(RLG_MODULE_ID, "tokenLootEnabled", true);
      return;
    }

    await this.actor.setFlag(RLG_MODULE_ID, "lootSettings", settings);
    await this.actor.setFlag(RLG_MODULE_ID, "customLootEnabled", true);
  }

  async _prepareContext(options) {
    const lootSettings = rlgNormalizeLootSettings((await this._getStoredSettings()) || {});
    const creatureLootSettings = game.settings.get(RLG_MODULE_ID, "creatureTypeLoot") || {};
    const typeSettings = rlgNormalizeLootSettings(creatureLootSettings[this.creatureType]);

    return {
      compendiums: lootSettings.compendiums.length ? lootSettings.compendiums : typeSettings.compendiums,
      folders: lootSettings.folders.length ? lootSettings.folders : typeSettings.folders,
      tables: lootSettings.tables.length ? lootSettings.tables : typeSettings.tables,
      quantityFormula: lootSettings.quantityFormula || typeSettings.quantityFormula || "",
      maxRarity: lootSettings.maxRarity || typeSettings.maxRarity || "",
      itemChance: lootSettings.itemChance !== null ? lootSettings.itemChance : typeSettings.itemChance !== null ? typeSettings.itemChance : "",
      currencyChance: lootSettings.currencyChance !== null ? lootSettings.currencyChance : typeSettings.currencyChance !== null ? typeSettings.currencyChance : "",
      globalQuantityFormula: game.settings.get(RLG_MODULE_ID, "randomQuantityFormula") || "1d4",
      globalMaxRarity: game.settings.get(RLG_MODULE_ID, "maxRarity") || "Legendary",
      globalItemChance: 100,
      globalCurrencyChance: game.settings.get(RLG_MODULE_ID, "defaultCurrencyChance") || 75,
      totalSources: lootSettings.compendiums.length + lootSettings.folders.length + lootSettings.tables.length
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const html = this.element;
    const focusNextField = currentInput => {
      const inputs = Array.from(html.querySelectorAll("input, select, button"));
      const currentIndex = inputs.indexOf(currentInput);
      const nextIndex = (currentIndex + 1) % inputs.length;
      inputs[nextIndex]?.focus();
    };
    const onFieldKeydown = event => {
      if (event.key === "Tab") {
        event.preventDefault();
        focusNextField(event.currentTarget);
      } else if (event.key === "Enter") {
        event.preventDefault();
      }
    };

    html.querySelector(".quantity-input")?.addEventListener("keydown", onFieldKeydown);
    html.querySelector(".quantity-input")?.addEventListener("change", async event => {
      const quantityFormula = event.currentTarget.value.trim();
      const quantityRegex = /^(\d+d\d+([+-]\d+)?|\d+)$/;
      if (quantityFormula && !quantityRegex.test(quantityFormula)) {
        ui.notifications.warn(rlgFormat("RLG.Notification.InvalidQuantity", { formula: quantityFormula }));
        return;
      }
      await this._updateTokenSetting({ quantityFormula });
      console.log(`Updated token quantityFormula to: ${quantityFormula}`);
      this.render({ force: true });
    });

    html.querySelector(".item-chance-input")?.addEventListener("keydown", onFieldKeydown);
    html.querySelector(".item-chance-input")?.addEventListener("change", async event => {
      const value = event.currentTarget.value.trim();
      const itemChance = value === "" || parseInt(value) === 0 ? null : parseInt(value);
      await this._updateTokenSetting({ itemChance });
      console.log(`Updated token itemChance to: ${itemChance === null ? "[Global]" : itemChance + "%"}`);
      this.render({ force: true });
    });

    html.querySelector(".currency-chance-input")?.addEventListener("keydown", onFieldKeydown);
    html.querySelector(".currency-chance-input")?.addEventListener("change", async event => {
      const value = event.currentTarget.value.trim();
      const currencyChance = value === "" ? null : parseInt(value);
      await this._updateTokenSetting({ currencyChance });
      console.log(`Updated token currencyChance to: ${currencyChance === null ? "[Global]" : currencyChance + "%"}`);
      this.render({ force: true });
    });

    html.querySelector(".rarity-select")?.addEventListener("keydown", onFieldKeydown);
    html.querySelector(".rarity-select")?.addEventListener("change", async event => {
      const maxRarity = event.currentTarget.value;
      await this._updateTokenSetting({ maxRarity });
      console.log(`Updated token maxRarity to: ${maxRarity || "[Global]"}`);
      this.render({ force: true });
    });

    html.querySelector(".compendium-select-btn")?.addEventListener("click", () => this._openTokenSourceDialog());
  }

  async _updateTokenSetting(update) {
    const settings = { ...rlgDefaultLootSettings(), ...((await this._getStoredSettings()) || {}), ...update };
    await this._setStoredSettings(settings);
  }

  async _openTokenSourceDialog() {
    const settings = rlgNormalizeLootSettings((await this._getStoredSettings()) || {});
    await rlgOpenSourceSelectionDialog({
      title: rlgFormat("RLG.TokenLootSettings.TitleFor", { name: this.actor.name }),
      selectedCompendiums: settings.compendiums,
      selectedFolders: settings.folders,
      selectedTables: settings.tables,
      onSave: async selected => {
        const updated = {
          ...rlgDefaultLootSettings(),
          ...settings,
          compendiums: selected.compendiums,
          folders: selected.folders,
          tables: selected.tables
        };
        await this._setStoredSettings(updated);
        console.log(`Updated token loot sources for ${this.actor.name}:`, updated);
        this.render({ force: true });
      }
    });
  }
}

class RarityPercentagesForm extends RLGApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "rlg-rarity-percentages",
    classes: ["rarity-percentages-window"],
    window: { frame: true, positioned: true, minimizable: true, resizable: true },
    position: { width: 400, height: "auto" }
  };

  static template = "modules/random-loot-generator/rarityPercentages.html";

  constructor(options = {}) {
    super(foundry.utils.mergeObject({
      window: { title: rlgLocalize("RLG.RarityPercentages.Title") }
    }, options, { inplace: false }));
  }

  async _prepareContext(options) {
    return {
      percentages: game.settings.get(RLG_MODULE_ID, "rarityPercentages") || RLG_DEFAULT_RARITY_PERCENTAGES
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector(".save-percentages")?.addEventListener("click", event => this._onSave(event));
    this.element.querySelector(".restore-defaults")?.addEventListener("click", event => this._onRestoreDefaults(event));
  }

  async _onSave(event) {
    event.preventDefault();
    const form = this.element.querySelector("form");
    const formData = new FormData(form);
    const percentages = {};
    for (const [key, value] of formData.entries()) {
      percentages[key] = parseInt(value) || 0;
    }
    await game.settings.set(RLG_MODULE_ID, "rarityPercentages", percentages);
    ui.notifications.info(rlgLocalize("RLG.RarityPercentages.Saved"));
    this.close();
  }

  async _onRestoreDefaults(event) {
    event.preventDefault();
    await game.settings.set(RLG_MODULE_ID, "rarityPercentages", RLG_DEFAULT_RARITY_PERCENTAGES);
    ui.notifications.info(rlgLocalize("RLG.RarityPercentages.Restored"));
    this.render({ force: true });
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
    order: Object.keys(tokenControls.tools).length,
    visible: game.user.isGM,
    button: true,
    onChange: () => {
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
        config: false,
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
        config: false,
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
                game.lootGenerator.selectedCompendiums = rlgNormalizeCompendiumSetting(value);
                console.log(`Compendium selection updated: ${game.lootGenerator.selectedCompendiums}`);
            }
	        }
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

    game.settings.register("random-loot-generator", "enableCRBasedItems", {
        name: game.i18n.localize("RLG.EnableCRBasedItems.Name"),
        hint: game.i18n.localize("RLG.EnableCRBasedItems.Hint"),
        scope: "world",
        config: false,
        type: Boolean,
        default: false
    });

    game.settings.register("random-loot-generator", "crLootSettings", {
        name: game.i18n.localize("RLG.CRItemScaling.Name"),
        hint: game.i18n.localize("RLG.CRItemScaling.Hint"),
        scope: "world",
        config: false,
        type: Object,
        default: rlgDefaultCrLootSettings()
    });

    game.settings.registerMenu("random-loot-generator", "crLootSettingsMenu", {
        name: game.i18n.localize("RLG.CRItemScaling.Name"),
        label: game.i18n.localize("RLG.CRItemScaling.Label"),
        hint: game.i18n.localize("RLG.CRItemScaling.Hint"),
        icon: "fas fa-layer-group",
        type: CrItemScalingForm,
        restricted: true
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

    game.settings.register("random-loot-generator", "enabledCurrencyTypes", {
        name: game.i18n.localize("RLG.EnabledCurrencyTypes.Name"),
        hint: game.i18n.localize("RLG.EnabledCurrencyTypes.Hint"),
        scope: "world",
        config: true,
        type: String,
        default: RLG_DEFAULT_CURRENCY_TYPES,
        onChange: value => console.log(`Enabled Currency Types updated: ${rlgGetEnabledCurrencyTypes().join(", ") || "none"} (${value})`)
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
    const element = rlgAsElement(html);
    if (!element) return;
    if (!game.user.isGM) return;

    const separators = [
        { before: "random-loot-generator.enableLootPreview", title: game.i18n.localize("RLG.Settings.GeneralOptions") },
        { before: "random-loot-generator.selectedCompendiums", title: game.i18n.localize("RLG.Settings.DefaultLootSettings") },
        { before: "random-loot-generator.useCRBasedCurrency", title: game.i18n.localize("RLG.Settings.CurrencySettings") }
    ];

	    separators.forEach(sep => {
	        const setting = element.querySelector(`[name="${sep.before}"]`)?.closest(".form-group");
	        if (setting && setting.previousElementSibling?.dataset?.rlgSeparator !== sep.before) {
	            setting.insertAdjacentHTML("beforebegin", `<h2 data-rlg-separator="${sep.before}" style="border-bottom: 1px solid #999; margin: 10px 0; padding-bottom: 5px;">${sep.title}</h2>`);
	        }
	    });

    const moveDefaultLootMenus = () => {
        const findSettingsRow = (...labels) => Array.from(element.querySelectorAll(".form-group"))
            .find(row => labels.some(label => label && row.textContent?.includes(label)));
        const findMenuRow = (key, ...labels) => {
            const keySelector = [
                `[name="random-loot-generator.${key}"]`,
                `[data-key="random-loot-generator.${key}"]`,
                `[data-setting-id="random-loot-generator.${key}"]`,
                `[data-setting-key="random-loot-generator.${key}"]`
            ].join(",");
            return element.querySelector(keySelector)?.closest(".form-group") || findSettingsRow(...labels);
        };
        const currencySeparator = element.querySelector(`[data-rlg-separator="random-loot-generator.useCRBasedCurrency"]`);
        if (!currencySeparator) return;
        const sourceRow = element.querySelector(`[name="random-loot-generator.selectedCompendiums"]`)?.closest(".form-group");
        const creatureTypeRow = findMenuRow("creatureTypeLootMenu", game.i18n.localize("RLG.CreatureTypeLootMenu.Name"));
        const rarityRow = findMenuRow("rarityPercentagesMenu", game.i18n.localize("RLG.RarityPercentagesMenu.Name"));
        const crScalingRow = findMenuRow("crLootSettingsMenu", game.i18n.localize("RLG.CRItemScaling.Name"), game.i18n.localize("RLG.CRItemScaling.Hint"));
        if (sourceRow && creatureTypeRow) sourceRow.after(creatureTypeRow);
        [crScalingRow, rarityRow].filter(Boolean).forEach(row => currencySeparator.before(row));
    };
    moveDefaultLootMenus();
    setTimeout(moveDefaultLootMenus, 0);

    const insertAllSettingsTools = () => {
        if (element.querySelector(".rlg-all-settings-tools")) return;
        const firstSection = element.querySelector(`[data-rlg-separator="random-loot-generator.enableLootPreview"]`);
        const firstModuleRow = element.querySelector(`[name="random-loot-generator.enableLootPreview"]`)?.closest(".form-group");
        const anchor = firstSection || firstModuleRow;
        if (!anchor) return;

        const row = document.createElement("div");
        row.className = "form-group rlg-all-settings-tools";
        row.innerHTML = `
            <label>${game.i18n.localize("RLG.Settings.ImportExport.Name")}</label>
            <div class="form-fields">
                <button type="button" class="rlg-export-all-settings" style="padding: 4px 8px; border: 1px solid #999; border-radius: 5px; cursor: pointer;">
                    <i class="fas fa-download"></i> ${game.i18n.localize("RLG.Settings.ImportExport.Export")}
                </button>
                <button type="button" class="rlg-import-all-settings" style="padding: 4px 8px; border: 1px solid #999; border-radius: 5px; cursor: pointer;">
                    <i class="fas fa-upload"></i> ${game.i18n.localize("RLG.Settings.ImportExport.Import")}
                </button>
            </div>
        `;
        anchor.before(row);
        row.querySelector(".rlg-export-all-settings")?.addEventListener("click", rlgExportAllSettings);
        row.querySelector(".rlg-import-all-settings")?.addEventListener("click", () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json,application/json";
            input.addEventListener("change", event => rlgImportAllSettingsFromFile(event.currentTarget.files?.[0]));
            input.click();
        });
    };
    insertAllSettingsTools();
    setTimeout(insertAllSettingsTools, 0);

	    const compendiumInput = element.querySelector(`[name="random-loot-generator.selectedCompendiums"]`);
    const settingElement = compendiumInput?.parentElement;
    if (settingElement && !settingElement.querySelector(".rlg-manage-sources")) {
        compendiumInput?.remove();
        const button = document.createElement("button");
        button.type = "button";
        button.className = "rlg-manage-sources";
        button.style.cssText = "padding: 8px 12px; font-size: 14px; line-height: 1.5; height: auto; display: inline-block; vertical-align: middle; white-space: nowrap; border: 1px solid #999; border-radius: 2px; cursor: pointer;";
        button.innerHTML = `<i class="fas fa-book"></i> ${game.i18n.localize("RLG.ManageLootSources.Title")}`;
        button.addEventListener("click", () => {
            const lg = game?.lootGenerator;
            if (!lg || typeof lg.showCompendiumSelection !== "function") {
                console.warn("[RLG] Missing showCompendiumSelection handler; loot generator not initialized or world state is corrupted. Try reloading the world, enabling the module, or checking init errors.");
                return;
            }
            lg.showCompendiumSelection();
        });
        settingElement.append(button);
    }

    const currencyTypesInput = element.querySelector(`[name="random-loot-generator.enabledCurrencyTypes"]`);
    const currencyTypesElement = currencyTypesInput?.parentElement;
    if (currencyTypesInput && currencyTypesElement && !currencyTypesElement.querySelector(".rlg-currency-types")) {
        const enabledTypes = rlgGetEnabledCurrencyTypes();
        const hiddenInput = currencyTypesInput;
        hiddenInput.type = "hidden";

        const wrapper = document.createElement("div");
        wrapper.className = "rlg-currency-types";
        wrapper.style.cssText = "display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; margin-top: 4px;";

        RLG_CURRENCY_TYPES.forEach(type => {
            const label = document.createElement("label");
            label.style.cssText = "display: inline-flex; align-items: center; gap: 4px; margin: 0;";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = type;
            checkbox.checked = enabledTypes.includes(type);

            const text = document.createElement("span");
            text.textContent = type.toUpperCase();

            label.append(checkbox, text);
            wrapper.append(label);
        });

        const syncHiddenInput = () => {
            hiddenInput.value = Array.from(wrapper.querySelectorAll("input[type='checkbox']:checked"))
                .map(checkbox => checkbox.value)
                .join(",");
        };

        wrapper.addEventListener("change", syncHiddenInput);
        syncHiddenInput();
        currencyTypesElement.append(wrapper);
    }

    const crBasedCheckbox = element.querySelector(`[name="random-loot-generator.useCRBasedCurrency"]`);
    const currencyFormulaInput = element.querySelector(`[name="random-loot-generator.currencyFormula"]`);
    if (!crBasedCheckbox || !currencyFormulaInput) return;

    const toggleCurrencyFormula = () => {
        const isCRBased = crBasedCheckbox.checked;
        currencyFormulaInput.disabled = isCRBased;
        currencyFormulaInput.style.opacity = isCRBased ? "0.5" : "1";
    };

    toggleCurrencyFormula();
    crBasedCheckbox.addEventListener("change", toggleCurrencyFormula);
});

Hooks.on("createToken", async (tokenDoc) => {
  if (!game.user.isGM) return; // Only the GM should auto-loot on creation  
  if (!game.settings.get("random-loot-generator", "enableAutoLoot")) return;
    if (!tokenDoc.actor || tokenDoc.actor.type !== "npc") return;
    console.log(`Auto-Loot triggered for ${tokenDoc.name}`);
    if (game?.lootGenerator?.generateLootForTokens) {
        await game.lootGenerator.generateLootForTokens([tokenDoc.object]);
    } else {
        console.warn("[RLG] Auto-Loot: lootGenerator missing or not ready; skipping generateLootForTokens.");
    }
});

function rlgInjectLootConfigSection({ app, html, mode }) {
  const element = rlgAsElement(html);
  if (!element || !game.user.isGM) return;
  if (element.querySelector('[data-random-loot-generator]')) return;

  const isPrototype = mode === "prototype";
  const actor = isPrototype ? (app.document?.parent || app.actor || app.object?.parent) : app.document?.actor;
  const tokenDocument = isPrototype ? null : app.document;
  if (!actor) {
    console.warn("No actor found for RLG token configuration section.");
    return;
  }

  const enabled = isPrototype ? rlgPrototypeLootEnabled(actor) : rlgTokenOverrideEnabled({ document: tokenDocument, actor });
  const checkboxName = isPrototype
    ? `prototypeToken.flags.${RLG_MODULE_ID}.defaultLootEnabled`
    : `flags.${RLG_MODULE_ID}.tokenLootEnabled`;
  const label = isPrototype ? rlgLocalize("RLG.TokenConfig.EnableDefaultLoot") : rlgLocalize("RLG.TokenConfig.EnableTokenLoot");
  const title = isPrototype ? rlgLocalize("RLG.PrototypeLootSettings.Title") : rlgLocalize("RLG.TokenLootSettings.Title");

  const template = document.createElement("template");
  template.innerHTML = `
    <fieldset data-random-loot-generator style="margin: 10px 0; padding: 10px; border: 1px solid #999; border-radius: 5px; position: relative; z-index: 1;">
      <legend>${rlgLocalize("RLG.TokenConfig.Legend")}</legend>
      <div class="form-group">
        <label>${label}</label>
        <input type="checkbox" name="${checkboxName}" ${enabled ? "checked" : ""}>
        <button type="button" class="configure-loot" style="margin-left: 10px; padding: 4px 8px; border: 1px solid #999; border-radius: 5px; background-color: #333; color: white; opacity: ${enabled ? "1" : "0.5"}; cursor: ${enabled ? "pointer" : "not-allowed"};" ${enabled ? "" : "disabled"}>${rlgLocalize("RLG.TokenConfig.ConfigureLoot")}</button>
      </div>
    </fieldset>
  `.trim();
  const lootSection = template.content.firstElementChild;

  const resourcesTab = element.querySelector('.tab[data-tab="resources"]');
  const target = resourcesTab || element.querySelector('.sheet-body') || element.querySelector('.form-content');
  if (!target) {
    console.warn("No suitable place found to inject RLG loot section.");
    return;
  }
  target.append(lootSection);

  const checkbox = lootSection.querySelector(`input[name="${checkboxName}"]`);
  const button = lootSection.querySelector(".configure-loot");
  const toggleButton = () => {
    const isChecked = checkbox.checked;
    button.disabled = !isChecked;
    button.style.cursor = isChecked ? "pointer" : "not-allowed";
    button.style.opacity = isChecked ? "1" : "0.5";
  };

  checkbox.addEventListener("change", async event => {
    const isChecked = event.currentTarget.checked;
    if (isPrototype) {
      await actor.update({ [`prototypeToken.flags.${RLG_MODULE_ID}.defaultLootEnabled`]: isChecked });
    } else {
      await tokenDocument.setFlag(RLG_MODULE_ID, "tokenLootEnabled", isChecked);
    }
    toggleButton();
  });

  button.addEventListener("click", async () => {
    if (button.disabled) return;
    const creatureType = actor.system?.details?.type?.value || "humanoid";
    const form = new TokenLootSettingsForm(actor, creatureType, {
      mode: isPrototype ? "prototype" : "token",
      tokenDocument,
      title
    });
    form.addEventListener("close", async () => {
      checkbox.checked = isPrototype ? rlgPrototypeLootEnabled(actor) : rlgTokenOverrideEnabled({ document: tokenDocument, actor });
      toggleButton();
    });
    form.render({ force: true });
  });
}

Hooks.on("renderTokenConfig", (app, html, data) => {
  rlgInjectLootConfigSection({ app, html, mode: "token" });
});

Hooks.on("renderPrototypeTokenConfig", (app, html, data) => {
  rlgInjectLootConfigSection({ app, html, mode: "prototype" });
});

Hooks.on('renderDialogV2', async (app, html, data) => {
  if (!game.user.isGM) return;
  const element = rlgAsElement(html);
  if (!element?.querySelector(".rlg-source-dialog")) return;
  const title = app.title;
  if (title) {
    rlgDebug(`Decorating dialog: ${title}`);
    rlgDebug(`Dialog HTML (first 200 chars): ${element.outerHTML.substring(0, 200)}...`);
    await rlgDecorateSourceDialog(app, element);
    const disabledLabels = element.querySelectorAll('label.rlg-source--disabled');
    rlgDebug(`Found ${disabledLabels.length} disabled labels in ${title}`);
  } else {
    rlgDebug(`Skipping dialog: ${title} (not a target dialog)`);
  }
});
