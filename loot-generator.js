class LootGenerator {
    constructor() {
        this.moduleName = "random-loot-generator";
        this.lootPreviewEnabled = false;
        this.selectedCompendiums = [];
        this.selectedFolders = [];
        this.selectedTables = []; // Add this
        this.generateLootForTokens = this.generateLootForTokens.bind(this);
        this.applyLoot = this.applyLoot.bind(this);
        this.loadSettings(); // Call here to sync defaults
    }

    loadSettings() {
        console.log("Loading settings...");
        this.lootPreviewEnabled = game.settings.get(this.moduleName, "enableLootPreview");
        let rawCompendiums = game.settings.get(this.moduleName, "selectedCompendiums") || "dnd5e.tradegoods"; // Default here
        let loadedFolders = game.settings.get(this.moduleName, "selectedFolders");
        let loadedTables = game.settings.get(this.moduleName, "lootTables") || []; // Add tables
        console.log("Raw settings - Compendiums:", rawCompendiums, "Folders:", loadedFolders, "Tables:", loadedTables);
        this.selectedCompendiums = (typeof rawCompendiums === "string" && rawCompendiums) 
            ? rawCompendiums.split(",").map(comp => comp.trim()).filter(comp => comp && game.packs.has(comp)) 
            : ["dnd5e.tradegoods"]; // Fallback if empty
        this.selectedFolders = Array.isArray(loadedFolders) && loadedFolders.length > 0 
            ? loadedFolders.filter(id => game.folders.has(id)) 
            : [];
        this.selectedTables = Array.isArray(loadedTables) && loadedTables.length > 0 
            ? loadedTables.filter(id => game.tables.has(id)) 
            : [];
        console.log("Processed selectedCompendiums:", this.selectedCompendiums);
        console.log("Processed selectedFolders:", this.selectedFolders);
        console.log("Processed selectedTables:", this.selectedTables);
        console.log("Settings loaded:", {
            lootPreviewEnabled: this.lootPreviewEnabled,
            selectedCompendiums: this.selectedCompendiums,
            selectedFolders: this.selectedFolders,
            selectedTables: this.selectedTables
        });
    }



    async generateLootForTokens(tokens) {
        console.log("generateLootForTokens called with tokens:", tokens);
        if (!tokens.length) {
            ui.notifications.warn("No tokens selected.");
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
    
        let hasTypeSettings = (Array.isArray(typeSettings.compendiums) && typeSettings.compendiums.length > 0) || 
                             (Array.isArray(typeSettings.folders) && typeSettings.folders.length > 0) || 
                             (Array.isArray(typeSettings.tables) && typeSettings.tables.length > 0);
    
        let selectedCompendiums = hasTypeSettings 
            ? (Array.isArray(typeSettings.compendiums) ? typeSettings.compendiums : []) 
            : (this.selectedCompendiums.length > 0 ? this.selectedCompendiums : game.settings.get(this.moduleName, "selectedCompendiums").split(",").map(comp => comp.trim()).filter(comp => comp && game.packs.has(comp)));
        let selectedFolders = hasTypeSettings 
            ? (Array.isArray(typeSettings.folders) ? typeSettings.folders : []) 
            : (this.selectedFolders.length > 0 ? this.selectedFolders : game.settings.get(this.moduleName, "selectedFolders") || []);
        let selectedTables = hasTypeSettings 
            ? (Array.isArray(typeSettings.tables) ? typeSettings.tables : []) 
            : (this.selectedTables.length > 0 ? this.selectedTables : game.settings.get(this.moduleName, "lootTables") || []);
        let quantityFormula = typeSettings.quantityFormula || game.settings.get(this.moduleName, "randomQuantityFormula") || "1d4";
        let currencyChance = typeSettings.currencyChance !== null && typeSettings.currencyChance !== undefined && typeSettings.currencyChance !== "" ? typeSettings.currencyChance : game.settings.get(this.moduleName, "defaultCurrencyChance") || 75;
        let itemChance = typeSettings.itemChance !== null && typeSettings.itemChance !== undefined && typeSettings.itemChance !== "" ? typeSettings.itemChance : 100;
    
        console.log(`Fetching loot for ${creatureType}. Has type settings: ${hasTypeSettings}. Using compendiums:`, selectedCompendiums, "Folders:", selectedFolders, "Tables:", selectedTables, "Quantity Formula:", quantityFormula, "Item Chance:", itemChance, "Currency Chance:", currencyChance);
    
        if (!selectedCompendiums.length && !selectedFolders.length && !selectedTables.length) {
            ui.notifications.warn(`No compendiums, folders, or tables selected for ${creatureType} or defaults.`);
            return { items: [], currency: {} };
        }
    
        let maxRarity = typeSettings.maxRarity || game.settings.get(this.moduleName, "maxRarity") || "Legendary";
        let rarityLevels = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"];
        let allowedRarities = rarityLevels.slice(0, rarityLevels.indexOf(maxRarity) + 1);
        console.log("Allowed rarities:", allowedRarities);
    
        let allItems = [];
        let lootItems = [];
    
        let itemRoll = Math.random() * 100;
        if (itemRoll <= itemChance) {
            if (selectedTables.length) {
                let quantity = 1;
                if (/^\d+$/.test(quantityFormula)) {
                    quantity = parseInt(quantityFormula);
                    console.log(`Using static quantity: ${quantity}`);
                } else {
                    try {
                        console.log(`🎲 Rolling dice with formula: "${quantityFormula}"`);
                        let roll = await new Roll(quantityFormula).evaluate();
                        console.log(`🎲 Dice roll result: ${roll.result}`);
                        quantity = roll.total;
                        if (quantity <= 0) {
                            console.warn(`⚠️ Rolled a non-positive quantity (${quantity}), defaulting to 1.`);
                            quantity = 1;
                        }
                    } catch (error) {
                        console.error(`❌ ERROR: Invalid dice formula "${quantityFormula}". Defaulting to 1 item.`);
                        ui.notifications.error(`Invalid dice formula: "${quantityFormula}". Using default (1).`);
                        quantity = 1;
                    }
                }
                console.log(`✅ Final item quantity for tables: ${quantity}`);
    
                for (let i = 0; i < quantity; i++) {
                    const tableId = selectedTables[Math.floor(Math.random() * selectedTables.length)];
                    const table = game.tables.get(tableId);
                    if (table) {
                        console.log(`Rolling on table: ${table.name}`);
                        const rollResult = await table.roll();
                        const results = rollResult.results;
                        console.log("Table roll results:", results.map(r => ({ type: r.type, collection: r.collection, resultId: r.resultId, documentId: r.documentId, text: r.text, documentCollection: r.documentCollection })));
                        for (let result of results) {
                            if (result.type === 'document' || result.type === 1) {
                                const id = result.documentId || result.resultId;
                                const collection = result.documentCollection || result.collection;
                                console.log(`Processing document result - ID: ${id}, Collection: ${collection}`);
                                let item = await game.items.get(id);
                                if (!item && collection === "Item") {
                                    const compendiumKey = "dnd5e.items";
                                    const compendium = game.packs.get(compendiumKey);
                                    if (compendium) {
                                        console.log(`Looking up item in compendium: ${compendiumKey}`);
                                        item = await compendium.getDocument(id);
                                    }
                                } else if (!item && collection) {
                                    item = await game.packs.get(collection)?.getDocument(id);
                                }
                                if (item) {
                                    console.log(`Rolled item from table: ${item.name}`);
                                    let itemData = item.toObject();
                                    itemData._id = item.id;
                                    itemData.pack = item.pack || "";
                                    lootItems.push(itemData);
                                } else {
                                    console.warn(`Item not found for result:`, result);
                                }
                            } else if (result.type === 'pack' || result.type === 2) {
                                const id = result.documentId || result.resultId;
                                const collection = result.documentCollection || result.collection;
                                console.log(`Processing pack result - ID: ${id}, Collection: ${collection}`);
                                const item = collection ? await game.packs.get(collection)?.getDocument(id) : null;
                                if (item) {
                                    console.log(`Rolled item from table: ${item.name}`);
                                    let itemData = item.toObject();
                                    itemData._id = item.id;
                                    itemData.pack = collection || "";
                                    lootItems.push(itemData);
                                } else {
                                    console.warn(`Item not found for pack result:`, result);
                                }
                            } else if (result.type === 0) {
                                console.log(`Text result from table: ${result.text}`);
                                lootItems.push({
                                    name: result.text,
                                    type: "item",
                                    img: "icons/svg/mystery-man.svg",
                                    system: { rarity: "Common" }
                                });
                            } else {
                                console.log(`Unhandled result type:`, result);
                            }
                        }
                    } else {
                        console.warn(`Table ${tableId} not found.`);
                    }
                }
            } else {
                if (selectedCompendiums.length) {
                    for (let compendiumName of selectedCompendiums) {
                        console.log(`Attempting to load compendium: ${compendiumName}`);
                        let pack = game.packs.get(compendiumName);
                        if (pack) {
                            if (!pack.index.size) {
                                console.log(`🔄 Indexing compendium: ${compendiumName}`);
                                await pack.getIndex();
                            }
                            let items = await pack.getDocuments();
                            if (items && items.length) {
                                console.log(`✅ Loaded ${items.length} items from compendium "${compendiumName}":`, items.map(i => ({ name: i.name, rarity: i.system?.rarity })));
                                allItems.push(...items);
                            } else {
                                console.warn(`❌ No items found in compendium "${compendiumName}".`);
                            }
                        } else {
                            console.error(`❌ ERROR: Compendium "${compendiumName}" not found in game.packs.`);
                        }
                    }
                }
    
                if (selectedFolders.length) {
                    let folderItems = game.items.filter(item => item.folder && selectedFolders.includes(item.folder.id));
                    console.log(`✅ Loaded ${folderItems.length} items from selected folders "${selectedFolders}":`, folderItems.map(i => ({ name: i.name, rarity: i.system?.rarity })));
                    if (folderItems.length === 0) {
                        console.log("Folder contents check:", game.folders.filter(f => selectedFolders.includes(f.id)).map(f => ({ name: f.name, contents: f.contents.map(i => i.name) })));
                    }
                    allItems.push(...folderItems);
                }
    
                if (!allItems.length) {
                    ui.notifications.warn(`No valid items found in compendiums or folders for ${creatureType}.`);
                } else {
                    let filteredItems = allItems.filter(item => {
                        let rarity = item.system?.rarity || "Common";
                        rarity = rarity.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/rare/gi, "Rare");
                        const matches = allowedRarities.includes(rarity);
                        if (!matches) console.log(`Item ${item.name} filtered out: ${rarity} not in ${allowedRarities}`);
                        return matches;
                    });
                    console.log("Filtered items:", filteredItems.map(i => ({ name: i.name, rarity: i.system?.rarity })));
                    if (!filteredItems.length) {
                        ui.notifications.warn(`No items of allowed rarities found for ${creatureType}.`);
                    } else {
                        let quantity = 1;
                        if (/^\d+$/.test(quantityFormula)) {
                            quantity = parseInt(quantityFormula);
                            console.log(`Using static quantity: ${quantity}`);
                        } else {
                            try {
                                console.log(`🎲 Rolling dice with formula: "${quantityFormula}"`);
                                let roll = await new Roll(quantityFormula).evaluate();
                                console.log(`🎲 Dice roll result: ${roll.result}`);
                                quantity = roll.total;
                                if (quantity <= 0) {
                                    console.warn(`⚠️ Rolled a non-positive quantity (${quantity}), defaulting to 1.`);
                                    quantity = 1;
                                }
                            } catch (error) {
                                console.error(`❌ ERROR: Invalid dice formula "${quantityFormula}". Defaulting to 1 item.`);
                                ui.notifications.error(`Invalid dice formula: "${quantityFormula}". Using default (1).`);
                                quantity = 1;
                            }
                        }
                        console.log(`✅ Final item quantity after adjustments: ${quantity}`);
    
                        let rarityPercentages = game.settings.get(this.moduleName, "rarityPercentages") || {
                            "Common": 50, "Uncommon": 30, "Rare": 15, "Very Rare": 4, "Legendary": 1
                        };
                        let availableRarities = [...new Set(filteredItems.map(item => {
                            let rarity = item.system?.rarity || "Common";
                            return rarity.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/rare/gi, "Rare");
                        }))];
                        let adjustedPercentages = {};
                        let totalAvailableWeight = 0;
                        for (let rarity of allowedRarities) {
                            if (availableRarities.includes(rarity)) {
                                adjustedPercentages[rarity] = rarityPercentages[rarity] || 0;
                                totalAvailableWeight += adjustedPercentages[rarity];
                            }
                        }
                        console.log("Adjusted percentages:", adjustedPercentages, "Total weight:", totalAvailableWeight);
    
                        if (totalAvailableWeight === 0) {
                            ui.notifications.warn(`No rarity percentages set for available items in ${creatureType}.`);
                        } else {
                            for (let i = 0; i < quantity; i++) {
                                let roll = Math.random() * totalAvailableWeight;
                                let cumulative = 0;
                                let selectedRarity = Object.keys(adjustedPercentages)[0];
                                for (let [rarity, weight] of Object.entries(adjustedPercentages)) {
                                    cumulative += weight;
                                    if (roll <= cumulative) {
                                        selectedRarity = rarity;
                                        break;
                                    }
                                }
                                let rarityItems = filteredItems.filter(item => {
                                    let itemRarity = item.system?.rarity || "Common";
                                    itemRarity = itemRarity.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/rare/gi, "Rare");
                                    return itemRarity === selectedRarity;
                                });
                                if (rarityItems.length) {
                                    let randomItem = rarityItems[Math.floor(Math.random() * rarityItems.length)];
                                    let itemData = randomItem.toObject();
                                    itemData._id = randomItem.id;
                                    itemData.pack = randomItem.pack || "";
                                    lootItems.push(itemData);
                                    console.log(`🎁 Item ${i + 1}: ${randomItem.name} (Rarity: ${selectedRarity}, ID: ${itemData._id}, Pack: ${itemData.pack})`);
                                }
                            }
                        }
                    }
                }
            }
        } else {
            console.log(`No items generated for ${creatureType} (roll ${itemRoll.toFixed(1)} vs ${itemChance}%)`);
        }
    
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
                console.log(`No currency generated for ${creatureType} (roll ${currencyRoll.toFixed(1)} vs ${currencyChance}%)`);
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
                    ui.notifications.error(`Invalid currency formula: "${currencyFormula}". No currency generated.`);
                }
            } else {
                console.log(`No currency generated for ${creatureType} (roll ${currencyRoll.toFixed(1)} vs ${currencyChance}%)`);
            }
        }
    
        console.log(`✅ Final loot: ${lootItems.length} items (${lootItems.map(i => i.system?.rarity || "Common").join(", ")}), Currency: ${Object.entries(currency).filter(([_, v]) => v > 0).map(([k, v]) => `${v} ${k.toUpperCase()}`).join(", ") || "None"}`);
        
        const itemCount = lootItems.length;
        const raritySummary = itemCount > 0 ? `(${lootItems.map(i => i.system?.rarity || "Common").join(", ")})` : "";
        const currencySummary = Object.entries(currency)
            .filter(([_, v]) => v > 0)
            .map(([k, v]) => `${v} ${k.toUpperCase()}`)
            .join(", ") || "None";
        console.log(`Loot Summary for ${creatureType}: ${itemCount} item${itemCount === 1 ? "" : "s"} ${raritySummary}, ${currencySummary}`);
    
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
        ui.notifications.info("Loot applied to selected NPCs.");
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
                title: "Loot Preview",
                content: content,
                buttons: {
                    reroll: { label: "Re-Roll", callback: () => this.generateLootForTokens(tokens) },
                    apply: { label: "Apply Loot", callback: () => this.applyLoot(lootAssignments) }
                },
                render: (html) => {
                    html.find(".item-link").on("click", (event) => {
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
    

    
        openItemSheet(itemId, pack = "") {
            console.log(`Opening item sheet: ID=${itemId}, Pack=${pack}`); // Debug: called?
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
    


        

        
        showCompendiumSelection() {
            const packs = game.packs.contents.filter(p => p.metadata.type === "Item");
            const folders = game.folders.filter(f => f.type === "Item" && f.contents.length > 0);
            const tables = game.tables.contents;
        
            let content = `<div style="max-height: 400px; overflow-y: auto;">`;
            content += `<h3>Compendiums</h3>`;
            content += packs.map(pack => {
                let checked = this.selectedCompendiums.includes(pack.collection) ? "checked" : "";
                return `<label style="display: inline-flex; align-items: center; gap: 6px;"><input type="checkbox" name="compendium" value="${pack.collection}" ${checked}> ${pack.metadata.label}</label><br>`;
            }).join("");
            content += `<h3>Folders</h3>`;
            content += folders.map(folder => {
                let checked = this.selectedFolders.includes(folder.id) ? "checked" : "";
                return `<label style="display: inline-flex; align-items: center; gap: 6px;"><input type="checkbox" name="folder" value="${folder.id}" ${checked}> ${folder.name}</label><br>`;
            }).join("");
            content += `<h3>Roll Tables</h3>`;
            content += tables.map(table => {
                let checked = this.selectedTables.includes(table.id) ? "checked" : "";
                return `<label style="display: inline-flex; align-items: center; gap: 6px;"><input type="checkbox" name="table" value="${table.id}" ${checked}> ${table.name}</label><br>`;
            }).join("");
            content += `</div>`;
        
            new Dialog({
                title: "Manage Loot Sources",
                content: content,
                buttons: {
                    save: {
                        icon: '<i class="fas fa-save"></i>',
                        label: "Save",
                        callback: (html) => {
                            this.selectedCompendiums = html.find("input[name='compendium']:checked").map((_, el) => el.value).get();
                            this.selectedFolders = html.find("input[name='folder']:checked").map((_, el) => el.value).get();
                            this.selectedTables = html.find("input[name='table']:checked").map((_, el) => el.value).get();
                            game.settings.set(this.moduleName, "selectedCompendiums", this.selectedCompendiums.join(","));
                            game.settings.set(this.moduleName, "selectedFolders", this.selectedFolders);
                            game.settings.set(this.moduleName, "lootTables", this.selectedTables);
                            console.log("Default loot sources updated:", { compendiums: this.selectedCompendiums, folders: this.selectedFolders, tables: this.selectedTables });
                        }
                    },
                    cancel: { 
                        icon: '<i class="fas fa-times"></i>',
                        label: "Cancel" }
                }
            }).render(true);
        }

        }



        Hooks.once("init", () => {
            console.log("🔄 Random Loot Generator: INIT HOOK STARTED!");
        
            game.settings.register("random-loot-generator", "enableLootPreview", {
                name: "Enable Loot Preview",
                hint: "If enabled, a preview window appears with options that let you accept or reroll the items.",
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
                name: "Enable Auto-Loot on Token Drop",
                hint: "If enabled, random loot will automatically be assigned to NPC tokens when they are dragged onto the canvas.",
                scope: "world",
                config: true,
                type: Boolean,
                default: false,
                onChange: value => console.log(`Auto-Loot setting updated: ${value}`)
            });
        
            game.settings.register("random-loot-generator", "randomQuantityFormula", {
                name: "Random Item Quantity",
                hint: "Enter a dice formula (such as 1d4 or 1d3+12) or a static number (e.g., 5) to determine the default number of items generated.",
                scope: "world",
                config: true,
                type: String,
                default: "1d4",
                onChange: value => console.log(`Random Quantity Formula updated: ${value}`)
            });
        
            game.settings.register("random-loot-generator", "maxRarity", {
                name: "Maximum Loot Rarity",
                hint: "Choose the default maximum level of rarity that you want to generate. Choose a lower rarity for lower CR games and low-magic worlds.",
                scope: "world",
                config: true,
                type: String,
                choices: { "Common": "Common", "Uncommon": "Uncommon", "Rare": "Rare", "Very Rare": "Very Rare", "Legendary": "Legendary" },
                default: "Legendary",
                onChange: value => console.log(`Max Rarity setting updated: ${value}`)
            });
        
            game.settings.register("random-loot-generator", "selectedCompendiums", {
                name: "Select Loot Sources",
                hint: "Choose which default sources to pull loot from (compendiums, folders, or roll tables).",
                scope: "world",
                config: true,
                type: String,
                default: "dnd5e.tradegoods", // Set default here
                onChange: value => {
                    if (game.lootGenerator && game.packs) {
                        game.lootGenerator.selectedCompendiums = typeof value === "string" ? value.split(",").map(comp => comp.trim()).filter(comp => comp && game.packs.has(comp)) : ["dnd5e.tradegoods"];
                        console.log(`Compendium selection updated: ${game.lootGenerator.selectedCompendiums}`);
                    }
                }
            });
        
            game.settings.register("random-loot-generator", "useCRBasedCurrency", {
                name: "Use CR-Based Currency",
                hint: "Scale the currency by creature Challenge Rating (CR) instead of using a fixed formula.",
                scope: "world",
                config: true,
                type: Boolean,
                default: false,
                onChange: value => console.log(`CR-Based Currency setting updated: ${value}`)
            });
        
            game.settings.register("random-loot-generator", "defaultCurrencyChance", {
                name: "Default Currency Chance",
                hint: "Set the global percentage chance for creatures to carry currency (0-100%), overridden by creature type settings.",
                scope: "world",
                config: true,
                type: Number,
                range: { min: 0, max: 100, step: 1 },
                default: 75,
                onChange: value => console.log(`Default Currency Chance updated: ${value}%`)
            });
        
            game.settings.register("random-loot-generator", "currencyFormula", {
                name: "Currency Formula",
                hint: "Set a custom dice formula for generating currency (e.g., '1d10' for gold base amount). This feature is off if you use the CR-based currency option.",
                scope: "world",
                config: true,
                type: String,
                default: "1d10",
                onChange: value => console.log(`Currency Formula updated: ${value}`)
            });
        
            game.settings.register("random-loot-generator", "selectedFolders", {
                name: "Default Loot Folders",
                hint: "Choose world folders to pull items from.",
                scope: "world",
                config: false,
                type: Array,
                default: []
            });
        
            game.settings.register("random-loot-generator", "creatureTypeLoot", {
                name: "Creature Type Loot",
                hint: "Assign specific loot compendiums and folders to different creature types.",
                scope: "world",
                config: false,
                type: Object,
                default: {}
            });
        
            game.settings.registerMenu("random-loot-generator", "creatureTypeLootMenu", {
                name: "Manage Creature Type Loot",
                label: "Configure",
                hint: "Override the default settings by selecting different compendiums and folders for different creature types.",
                icon: "fas fa-dragon",
                type: CreatureTypeLootForm,
                restricted: true
            });
        
            game.settings.register("random-loot-generator", "rarityPercentages", {
                name: "Rarity Percentages",
                hint: "Percentage distribution for item rarities.",
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
                name: "Manage Rarity Percentages",
                label: "Edit Percentages",
                hint: "Adjust the percentage chance for each rarity level.",
                icon: "fas fa-percentage",
                type: RarityPercentagesForm,
                restricted: true
            });
        
            game.settings.register("random-loot-generator", "lootTables", {
                name: "Loot Tables",
                hint: "Selected RollTables for creature type loot overrides.",
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
        { before: "random-loot-generator.enableLootPreview", title: "General Options" },
        { before: "random-loot-generator.randomQuantityFormula", title: "Default Loot Settings" },
        { before: "random-loot-generator.useCRBasedCurrency", title: "Currency Settings" }
    ];

    separators.forEach(sep => {
        const setting = html.find(`[name="${sep.before}"]`).closest(".form-group");
        if (setting.length) {
            setting.before(`<h2 style="border-bottom: 1px solid #999; margin: 10px 0; padding-bottom: 5px;">${sep.title}</h2>`);
        }
    });

    // Compendium button
    let settingElement = html.find(`[name="random-loot-generator.selectedCompendiums"]`).parent();
    settingElement.find("input").remove();
    let button = $(`<button type="button" style="padding: 8px 12px; font-size: 14px; line-height: 1.5; height: auto; display: inline-block; vertical-align: middle; white-space: nowrap; border: 1px solid #999; border-radius: 2px; cursor: pointer;"><i class="fas fa-book"></i> Manage Loot Sources</button>`);    button.on("click", () => game.lootGenerator.showCompendiumSelection());
    settingElement.append(button);

    // Disable/enable Currency Formula based on Use CR-Based Currency
    const crBasedCheckbox = html.find(`[name="random-loot-generator.useCRBasedCurrency"]`);
    const currencyFormulaInput = html.find(`[name="random-loot-generator.currencyFormula"]`);

    const toggleCurrencyFormula = () => {
        const isCRBased = crBasedCheckbox.prop("checked");
        currencyFormulaInput.prop("disabled", isCRBased);
        if (isCRBased) {
            currencyFormulaInput.css("opacity", "0.5"); // Dim when disabled
        } else {
            currencyFormulaInput.css("opacity", "1"); // Full opacity when enabled
        }
    };

    // Initial state
    toggleCurrencyFormula();

    // Update on change
    crBasedCheckbox.on("change", toggleCurrencyFormula);
});



Hooks.on("getSceneControlButtons", (controls) => {
    let tokenControls = controls.find(control => control.name === "token");
    if (tokenControls) {
        tokenControls.tools.push({
            name: "generate-loot",
            title: "Generate Random Loot",
            icon: "fas fa-coins",
            visible: game.user.isGM,
            onClick: () => {
                if (canvas.tokens.controlled.length === 0) {
                    ui.notifications.warn("No tokens selected.");
                } else {
                    game.lootGenerator.generateLootForTokens(canvas.tokens.controlled);
                }
            },
            button: true
        });
    }
});

Hooks.on("createToken", async (tokenDoc) => {
    if (!game.settings.get("random-loot-generator", "enableAutoLoot")) return;
    if (!tokenDoc.actor || tokenDoc.actor.type !== "npc") return;
    console.log(`Auto-Loot triggered for ${tokenDoc.name}`);
    await game.lootGenerator.generateLootForTokens([tokenDoc.object]);
});




class CreatureTypeLootForm extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 700,
            height: "auto",
            resizable: true,
            classes: ["creature-type-loot-window"],
            title: "Manage Creature Type Loot",
            template: "modules/random-loot-generator/creatureTypeLoot.html"
        });
    }

    async getData() {
        let settings = game.settings.get("random-loot-generator", "creatureTypeLoot") || {};
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
            let typeSettings = settings[type.key] || { compendiums: [], folders: [], tables: [], quantityFormula: "", maxRarity: "", currencyChance: null, itemChance: null };
            let selectedCompendiums = Array.isArray(typeSettings.compendiums) ? typeSettings.compendiums.filter(id => game.packs.has(id)) : [];
            let selectedFolders = Array.isArray(typeSettings.folders) ? typeSettings.folders.filter(id => game.folders.has(id)) : [];
            let selectedTables = Array.isArray(typeSettings.tables) ? typeSettings.tables.filter(id => game.tables.has(id)) : [];
            let quantityFormula = typeSettings.quantityFormula || "";
            let maxRarity = typeSettings.maxRarity || "";
            let currencyChance = typeSettings.currencyChance !== null ? typeSettings.currencyChance : "";
            let itemChance = typeSettings.itemChance !== null ? typeSettings.itemChance : "";
            let totalSources = selectedCompendiums.length + selectedFolders.length + selectedTables.length;
            type.selectedLabel = totalSources > 0 ? `Custom [${totalSources}]` : "[Default Compendium]";
            type.quantityFormula = quantityFormula;
            type.maxRarity = maxRarity;
            type.currencyChance = currencyChance;
            type.itemChance = itemChance;
            type.totalSources = totalSources;
            settings[type.key] = { compendiums: selectedCompendiums, folders: selectedFolders, tables: selectedTables, quantityFormula, maxRarity, currencyChance, itemChance };
        }
        await game.settings.set("random-loot-generator", "creatureTypeLoot", settings);
        console.log("Rendering creature types:", creatureTypes);
        return { creatureTypes, globalMaxRarity, globalCurrencyChance, globalItemChance, globalQuantityFormula };
    }

    activateListeners(html) {
        super.activateListeners(html);

        const focusNextField = (currentInput) => {
            const inputs = Array.from(html.find("input, select, button"));
            const currentIndex = inputs.indexOf(currentInput[0]);
            const nextIndex = (currentIndex + 1) % inputs.length;
            if (inputs[nextIndex]) inputs[nextIndex].focus();
        };

        const debouncedRender = foundry.utils.debounce(() => {
            const activeElement = document.activeElement;
            const inputs = Array.from(html.find("input, select, button"));
            const activeIndex = inputs.indexOf(activeElement);
            this.render();
            requestAnimationFrame(() => {
                const newInputs = this.element.find("input, select, button");
                if (activeIndex >= 0 && newInputs[activeIndex]) newInputs[activeIndex].focus();
            });
        }, 100);

        html.find(".quantity-input").on("change keydown", async (event) => {
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
                ui.notifications.warn(`Invalid quantity: "${newFormula}". Use a dice formula (e.g., "1d4", "2d6+1") or a static number (e.g., "5").`);
                return;
            }

            let settings = foundry.utils.duplicate(game.settings.get("random-loot-generator", "creatureTypeLoot"));
            settings[creatureType] = settings[creatureType] || { compendiums: [], folders: [], tables: [], quantityFormula: "", maxRarity: "", currencyChance: null, itemChance: null };
            settings[creatureType].quantityFormula = newFormula;
            await game.settings.set("random-loot-generator", "creatureTypeLoot", settings);
            console.log(`Updated ${creatureType} quantityFormula to: ${newFormula}`);
            debouncedRender();
        });

        html.find(".item-chance-input").on("change keydown", async (event) => {
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

            let settings = foundry.utils.duplicate(game.settings.get("random-loot-generator", "creatureTypeLoot"));
            settings[creatureType] = settings[creatureType] || { compendiums: [], folders: [], tables: [], quantityFormula: "", maxRarity: "", currencyChance: null, itemChance: null };
            settings[creatureType].itemChance = newChance;
            await game.settings.set("random-loot-generator", "creatureTypeLoot", settings);
            console.log(`Updated ${creatureType} itemChance to: ${newChance === null ? "[Global]" : newChance + "%"}`);
            debouncedRender();
        });

        html.find(".currency-chance-input").on("change keydown", async (event) => {
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

            let settings = foundry.utils.duplicate(game.settings.get("random-loot-generator", "creatureTypeLoot"));
            settings[creatureType] = settings[creatureType] || { compendiums: [], folders: [], tables: [], quantityFormula: "", maxRarity: "", currencyChance: null, itemChance: null };
            settings[creatureType].currencyChance = newChance;
            await game.settings.set("random-loot-generator", "creatureTypeLoot", settings);
            console.log(`Updated ${creatureType} currencyChance to: ${newChance === null ? "[Global]" : newChance + "%"}`);
            debouncedRender();
        });

        html.find(".rarity-select").on("change keydown", async (event) => {
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

            let settings = foundry.utils.duplicate(game.settings.get("random-loot-generator", "creatureTypeLoot"));
            settings[creatureType] = settings[creatureType] || { compendiums: [], folders: [], tables: [], quantityFormula: "", maxRarity: "", currencyChance: null, itemChance: null };
            settings[creatureType].maxRarity = newRarity;
            await game.settings.set("random-loot-generator", "creatureTypeLoot", settings);
            console.log(`Updated ${creatureType} maxRarity to: ${newRarity || "[Global]"}`);
            debouncedRender();
        });

        html.find(".compendium-select-btn").click(async (event) => {
            const button = $(event.currentTarget);
            const creatureType = button.data("creature-type");
            let typeSettings = game.settings.get("random-loot-generator", "creatureTypeLoot")[creatureType] || { compendiums: [], folders: [], tables: [] };
            let selectedCompendiums = typeSettings.compendiums || [];
            let selectedFolders = typeSettings.folders || [];
            let selectedTables = typeSettings.tables || [];

            const packs = game.packs.contents.filter(p => p.metadata.type === "Item");
            const folders = game.folders.filter(f => f.type === "Item" && f.contents.length > 0);
            const tables = game.tables.contents;

            let content = `<div style="max-height: 400px; overflow-y: auto;">`;
            content += `<h3>Compendiums</h3>`;
            content += packs.map(pack => {
                let checked = selectedCompendiums.includes(pack.collection) ? "checked" : "";
                return `<label style="display: inline-flex; align-items: center; gap: 6px;"><input type="checkbox" name="compendium" value="${pack.collection}" ${checked} style="margin: 0;"> <span style="vertical-align: middle;">${pack.metadata.label}</span></label><br>`;
            }).join("");
            content += `<h3>Folders</h3>`;
            content += folders.map(folder => {
                let checked = selectedFolders.includes(folder.id) ? "checked" : "";
                return `<label style="display: inline-flex; align-items: center; gap: 6px;"><input type="checkbox" name="folder" value="${folder.id}" ${checked} style="margin: 0;"> <span style="vertical-align: middle;">${folder.name}</span></label><br>`;
            }).join("");
            content += `<h3>Roll Tables</h3>`;
            content += tables.map(table => {
                let checked = selectedTables.includes(table.id) ? "checked" : "";
                return `<label style="display: inline-flex; align-items: center; gap: 6px;"><input type="checkbox" name="table" value="${table.id}" ${checked} style="margin: 0;"> <span style="vertical-align: middle;">${table.name}</span></label><br>`;
            }).join("");
            content += `</div>`;

            const dialogResult = await new Promise(resolve => {
                new Dialog({
                    title: `Select Sources for ${creatureType}`,
                    content: content,
                    buttons: {
                        save: {
                            icon: '<i class="fas fa-times"></i>',
                            label: "Save",
                            callback: (html) => {
                                const selectedComps = html.find("input[name='compendium']:checked").map((_, el) => el.value).get();
                                const selectedFolds = html.find("input[name='folder']:checked").map((_, el) => el.value).get();
                                const selectedTabs = html.find("input[name='table']:checked").map((_, el) => el.value).get();
                                resolve({ compendiums: selectedComps, folders: selectedFolds, tables: selectedTabs });
                            }
                        },
                        cancel: { 
                            icon: '<i class="fas fa-ban"></i>',
                            label: "Cancel", 
                            callback: () => resolve(null) 
                        }
                    },
                    default: "save",
                    close: () => resolve(null)
                }).render(true);
            });

            if (dialogResult !== null) {
                let settings = foundry.utils.duplicate(game.settings.get("random-loot-generator", "creatureTypeLoot"));
                settings[creatureType] = {
                    compendiums: dialogResult.compendiums,
                    folders: dialogResult.folders,
                    tables: dialogResult.tables,
                    quantityFormula: settings[creatureType]?.quantityFormula || "",
                    maxRarity: settings[creatureType]?.maxRarity || "",
                    currencyChance: settings[creatureType]?.currencyChance ?? null,
                    itemChance: settings[creatureType]?.itemChance ?? null
                };
                await game.settings.set("random-loot-generator", "creatureTypeLoot", settings);
                console.log(`Updated ${creatureType} sources:`, settings[creatureType]);
                this.render();
            }
        });

        html.find(".reset-defaults").click(async () => {
            new Dialog({
                title: "Confirm Reset",
                content: "<p>Be sure to export your settings before resetting.</p>",
                buttons: {
                    cancel: {
                        label: "Cancel",
                        icon: '<i class="fas fa-ban"></i>',
                        callback: () => console.log("Reset canceled")
                    },
                    reset: {
                        label: "Reset",
                        icon: '<i class="fas fa-repeat"></i>',
                        callback: async () => {
                            await game.settings.set("random-loot-generator", "creatureTypeLoot", {});
                            ui.notifications.info("All creature type overrides reset to defaults!");
                            this.render();
                        }
                    }
                },
                default: "cancel"
            }).render(true);
        });

        html.find(".export-sources").click(this.exportSources.bind(this));
        html.find(".import-sources").click(this.importSources.bind(this));
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
                        ui.notifications.info("Loot sources imported successfully!");
                        this.render();
                    } catch (error) {
                        ui.notifications.error("Failed to import loot sources: Invalid JSON file.");
                        console.error("Import error:", error);
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }
}

class RarityPercentagesForm extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 400,
            height: "auto",
            resizable: true,
            classes: ["rarity-percentages-window"],
            title: "Manage Rarity Percentages",
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
        html.find(".save-percentages").click(this._onSave.bind(this));
        html.find(".restore-defaults").click(this._onRestoreDefaults.bind(this));
    }

    async _onSave(event) {
        event.preventDefault();
        const formData = new FormData(this.element.find("form")[0]);
        let percentages = {};
        for (let [key, value] of formData.entries()) {
            percentages[key] = parseInt(value) || 0;
        }
        await game.settings.set("random-loot-generator", "rarityPercentages", percentages);
        ui.notifications.info("Rarity percentages saved!");
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
        ui.notifications.info("Rarity percentages restored to defaults!");
        this.render();
    }

    async _updateObject(event, formData) {
        // Handled by _onSave, no additional logic needed here
    }
}