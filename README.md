# random-loot-generator
Generate random loot for your NPCs manually or automatically.

![Screenshot 2025-03-11 at 10 01 31 AM](https://github.com/user-attachments/assets/af793a95-dcdc-4eb1-97b9-7f7d8f311692)

![Latest Release](https://img.shields.io/github/v/release/mfozz/random-loot-generator)
![Foundry Version](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/mfozz/random-loot-generator/main/module.json)
![Downloads](https://img.shields.io/github/downloads/mfozz/random-loot-generator/total)


Manual Download:
-----------
https://github.com/mfozz/random-loot-generator/releases/latest/download/module.json


Random Loot Generator  
=======

**Why do I need this module?**  
-----------
Are your players a bunch of loot goblins who salivate over all the random junk you throw at them? Want to add more junk to NPC tokens with very little effort? Then, this is the module for you.  

This module adds loot to NPC tokens without replacing their existing items, speeding up loot generation. The module can pull from compendiums, folders, and roll tables—world items or compendium-direct—and lets you tweak quantities, rarities, and currency through global settings or creature-specific overrides.   

**What's the best way to use this module?**  
-----------
The way you use this module depends on your DM style:   
- Loot Miser: Set just a few sources (maybe just one) and set the currency chance low. You'll get a bit of extra junk…I mean loot.  
- Lazy DM: Click some stuff randomly and don't worry too much about it. All the items and coins are just extra, so you're probably not breaking anything. Maybe.  
- Control Freak: Create a bunch of custom curated folders, roll tables, and compendiums by CR, creature type, genre, environment, and astrological sign. You do you; get funky.  
- Monty Python: Turn everything up to 11 and add every source that shows up in the list.





![Screenshot 2025-03-11 at 10 02 11 AM](https://github.com/user-attachments/assets/88513125-a7ad-4780-a36b-c156417b8bdd)



**Feature List**  
-----------
- **Adds Loot:** Generate new loot for tokens while keeping their current items.  
- **Loot Generation Button:** Click the coin control in the Actor controls to manually generate loot for a selected token.  
- **Loot on Drop (optional):** Drop a token on the canvas to automatically generate loot.  
- **Preview Loot Drops (optional):** Enable the loot preview to view the loot drop The window shows the items, their rarities, and a link that opens the item sheet (in case you don't know what the item does). You also have an option to re-roll the drop as many times as you like.  
- **Source Options:** Use compendiums, world folders, and roll tables in any combination.  
- **Quantity Settings:** Define item counts globally (e.g., "1d4+3").  
- **Global Rarity Settings:** Set the global rarity to match your campaign's magic level or your group's current level.   
- **Global Currency Controls:** Add coins by CR or fixed formulas, with an adjustable percent chance for currency.  
- **Creature Type Overrides:** Customize sources, quantities, and chances for each creature type individually.  
- **Export/Import:** Save and load source settings (defaults + overrides) as JSON files.  


**Additional Development Notes (FAQ)**
-----------

This module seems to duplicate what other modules do. Was that on purpose?
- Yes and no. Pocket Change has mostly been abandoned, so I added a similar feature to this module. Any other similarities with other modules are purely a strange coincidence.

Why is the loot generation slow?
- Pulling from compendiums or large folders can take a few moments because of all the dice rolls in the background. For example, Items (SRD) has over 800 items that the module has to check before generating the loot. Consider using smaller folders or downloaded folders if the selected sources are too slow. 

Where are the currency formulas?
- The CR currency roles are baked into the code. I tweaked the rolls to be a bit lower to account for the extra chance of loot. It's pretty easy to add more coins if you think that a drop wasn't rich enough, but it's harder to remove extra coins. 

I'm not getting any results from my roll table?
- Verify that your roll table has items.

Are there any module conflicts?
- This module doesn't rely on any other modules, so there shouldn't be many conflicts. The loot generation happens either when you drag the token to the canvas or when you manually generate the loot. Modules that modify tokens when you drag them to the canvas might cause issues.

Can I use a macro to trigger the loot generation?
- Yes, use the following macro:
- game.lootGenerator.generateLootForTokens(canvas.tokens.controlled);

Can this module add loot to player tokens/actors?
- Yes, but why are you that nice? Let them work for it. Kidding aside, it does, but you probably wouldn't be able to set custom treasure settings, just the default ones. 



