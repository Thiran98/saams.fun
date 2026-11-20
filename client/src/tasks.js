// What each place in the village does when you use it.
// PROTOTYPE ONLY: in Phase 3 the game server decides all of this, because the browser cannot be trusted
// with money, goods or kills. Here everything stays on your own computer so the map can be tested.

VM.state = {
  inv: Object.assign({ money: VM.START_MONEY }, Object.fromEntries(Object.keys(VM.ITEMS).map((k) => [k, 0]))),
  home: {},              // goods kept safely in your house (item -> count)
  store: 0,              // paddy in the village storage house (a shared village goal)
  food: VM.FOOD_START,   // your food bar (0-100)
};

VM.give = function (item, n) {
  VM.state.inv[item] = Math.max(0, (VM.state.inv[item] || 0) + n);
  VM.ui.inventory();
};

// Eat the most filling food in your basket.
VM.eat = function () {
  const foods = Object.entries(VM.ITEMS).filter(([k, it]) => it.food > 0 && VM.state.inv[k] > 0).sort((a, b) => b[1].food - a[1].food);
  if (!foods.length) {
    // starving: you will eat anything raw (but not firewood). It fills only 10% of your stomach.
    const raw = VM.state.food <= 0 ? ['paddy', 'water'].find((k) => VM.state.inv[k] > 0) : null;
    if (raw) {
      VM.give(raw, -1);
      VM.state.food = Math.min(100, VM.state.food + 10);
      VM.ui.food(VM.state.food);
      return { ok: true, key: raw, message: raw === 'paddy' ? 'You were so hungry you chewed raw paddy. It fills you only a little (+10%).' : 'You drank water to fill your empty stomach (+10%).' };
    }
    return { ok: false, message: VM.state.food <= 0 ? 'You have nothing to eat, not even raw paddy! Find food fast.' : 'You have nothing to eat. Cook rice and curry, or pick a coconut.' };
  }
  const [key, item] = foods[0];
  VM.give(key, -1);
  VM.state.food = Math.min(100, VM.state.food + item.food);
  VM.ui.food(VM.state.food);
  return { ok: true, key, message: 'You ate ' + item.label.toLowerCase() + '.' };
};

// Wealth = money + the value of all goods (in the basket and at home). The goal is to become rich.
VM.wealth = function (money, ...stores) {
  let total = money;
  for (const s of stores) for (const [k, n] of Object.entries(s)) if (VM.ITEMS[k]) total += n * VM.ITEMS[k].price;
  return total;
};

// Trading between villagers. A villager pays more for goods they do not have.
VM.trade = {
  buyPrice: (owner, item) => Math.round(VM.ITEMS[item].price * 1.1),                                         // you pay them
  sellPrice: (owner, item) => Math.round(VM.ITEMS[item].price * ((owner.inv[item] || 0) > 0 ? 0.8 : 1.25)),   // they pay you
  buy(owner, item) {
    const p = this.buyPrice(owner, item);
    if (!(owner.inv[item] > 0)) return owner.name + ' has no more ' + VM.ITEMS[item].label.toLowerCase() + '.';
    if (VM.state.inv.money < p) return 'You do not have enough money.';
    owner.inv[item]--; owner.money += p;
    VM.give('money', -p); VM.give(item, 1);
    return null;
  },
  sell(owner, item) {
    const p = this.sellPrice(owner, item);
    if (!(VM.state.inv[item] > 0)) return 'You have none left.';
    if (owner.money < p) return owner.name + ' does not have enough money.';
    owner.inv[item] = (owner.inv[item] || 0) + 1; owner.money -= p;
    VM.give(item, -1); VM.give('money', p);
    return null;
  },
};

// Online, thieves get nothing from honest work: they can only pretend (they look busy, so nobody suspects them).
VM.HONEST_WORK = ['well', 'cowshed', 'coop', 'palm', 'tree', 'tree2', 'jungletree', 'workshop', 'granary', 'cookhut', 'garden', 'paddy', 'fish'];
VM.pretendMessage = (spot) => 'You pretended to ' + ((spot.label || spot.task.label).split(' (')[0].toLowerCase()) +
  '. Thieves get nothing from honest work: kill and steal at night.';

// A place a thief spoiled last night (the server says which): closed for today
VM.spoiled = (place) => {
  const st = VM.net.room && VM.net.room.state;
  return !!(st && st.spoiled && st.spoiled.split(',').includes(place));
};

// Each task: label (shown to the player), seconds (time to stand still; 0 = instant),
// cooldown (seconds before this place can be used again), check (returns a reason if it cannot be used now),
// done (gives the reward and returns a short message).
VM.TASKS = {
  well: { label: 'Draw water', seconds: 2, check: () => (VM.spoiled('well') ? 'Someone threw mud in the well. No water today!' : null), done: () => { VM.give('water', 1); return 'You filled a pot with water.'; } },

  cowshed: { label: 'Milk a cow', seconds: 3, cooldown: 20, done: () => { VM.give('milk', 1); return 'Fresh milk in your bucket.'; } },

  coop: { label: 'Collect eggs', seconds: 2, cooldown: 25, done: () => { VM.give('eggs', 2); return 'You found 2 eggs.'; } },

  palm: { label: 'Pick a coconut', seconds: 2.5, cooldown: 40, done: () => { VM.give('coconut', 1); return 'You picked a coconut.'; } },

  tree: { label: 'Gather firewood', seconds: 2.5, cooldown: 30, done: () => { VM.give('wood', 1); return 'You gathered firewood.'; } },
  tree2: { same: 'tree' },
  jungletree: { same: 'tree' },

  // The only shop. It always buys, but pays a low price: villagers pay more.
  kade: {
    label: 'Sell everything to the Kade (low price)',
    seconds: 0,
    check: () => (VM.net && VM.net.online ? 'The Kade is closed: there is no money in the village. Swap goods with other villagers (walk up to someone, press E).'
      : Object.keys(VM.ITEMS).some((k) => k !== 'meal' && VM.state.inv[k] > 0) ? null : 'You have nothing to sell yet.'),
    done: () => {
      let earned = 0, count = 0;
      for (const [k, item] of Object.entries(VM.ITEMS)) {
        const n = VM.state.inv[k];
        if (k !== 'meal' && n > 0) { earned += n * Math.round(item.price * VM.KADE_RATE); count += n; VM.state.inv[k] = 0; } // keep meals to eat
      }
      VM.give('money', earned);
      return `The Kade paid Rs ${earned} for ${count} item${count === 1 ? '' : 's'}. Villagers often pay more.`;
    },
  },

  trade: { label: 'Trade', seconds: 0, done: (scene, spot) => { scene.openTrade(spot.owner); return null; } },

  granary: {
    label: 'Store paddy for the village',
    seconds: 1,
    check: () => (VM.state.inv.paddy > 0 ? null : 'Harvest some paddy first.'),
    done: () => {
      const n = VM.state.inv.paddy;
      VM.state.store += n; VM.give('paddy', -n);
      return VM.state.store >= VM.STORE_GOAL ? 'The village store is full. Well done!' : `Stored ${n} paddy for the village.`;
    },
  },

  cookhut: {
    label: 'Cook (rice and curry, or plain rice)',
    seconds: 4,
    check: () => {
      if (VM.spoiled('cookhut')) return 'Someone put out the cooking fire last night. No cooking today!';
      const need = [['paddy', 'paddy'], ['wood', 'firewood'], ['water', 'water']].filter(([k]) => VM.state.inv[k] < 1).map(([, n]) => n);
      return need.length ? 'To cook rice you need: ' + need.join(', ') + ' (add vegetables for rice and curry).' : null;
    },
    done: () => {
      ['paddy', 'wood', 'water'].forEach((k) => VM.give(k, -1));
      if (VM.state.inv.veg > 0) { VM.give('veg', -1); VM.give('meal', 1); return 'Rice and curry is ready! Press F to eat.'; }
      VM.give('rice', 1);
      return 'Plain rice is ready. It fills you only a little: fish, meat or vegetables are better.';
    },
  },

  workshop: { label: 'Repair tools', seconds: 3, done: () => {
    if (VM.net && VM.net.online) { VM.give('wood', 1); return 'You repaired tools and got firewood in return.'; } // no money online
    VM.give('money', 20); return 'You earned Rs 20.';
  } },

  stupa: {
    label: 'Ring the temple bell',
    seconds: 0,
    cooldown: 8,
    done: (scene) => { scene.cameras.main.shake(250, 0.003); return 'Dong! Later, the bell will call a village meeting.'; },
  },

  bigtree: { label: 'Call a village meeting', seconds: 0, done: () => 'Meetings and voting come in Phase 3.' },

  // Your own house: keep goods safe at home (thieves will try to steal from baskets at night)
  home: {
    label: 'Keep your goods at home',
    seconds: 1.5,
    check: () => (Object.keys(VM.ITEMS).some((k) => k !== 'meal' && VM.state.inv[k] > 0) ? null : 'Nothing to keep in your basket.'),
    done: () => {
      let n = 0;
      for (const k of Object.keys(VM.ITEMS)) {
        if (k !== 'meal' && VM.state.inv[k] > 0) { n += VM.state.inv[k]; VM.state.home[k] = (VM.state.home[k] || 0) + VM.state.inv[k]; VM.state.inv[k] = 0; }
      }
      VM.ui.inventory();
      return `You put ${n} goods in your house.`;
    },
  },

  // Your own house at dusk or night: go to bed and sleep safely until morning
  sleep: { label: 'Go to bed (sleep until morning)', seconds: 1, done: (scene) => scene.sleep() },

  // Stealing from someone else's house at night. Original thieves stay hidden (Phase 3),
  // but an ordinary villager who steals has their name shown to everyone.
  steal: {
    label: 'Steal goods',
    seconds: 2.5,
    check: (spot) => {
      const st = spot.owner.remote && VM.net.room && VM.net.room.state.players.get(spot.owner.id);
      if (st && st.hive) { VM.state.food = Math.max(0, VM.state.food - VM.BEE_STING_FOOD); VM.ui.food(VM.state.food); VM.sound.play('sting'); return '🐝 Bees guard ' + spot.owner.name + "'s house! They stung you."; }
      return spot.owner.remote || Object.values(spot.owner.inv).some((n) => n > 0) ? null : `${spot.owner.name}'s house has nothing to steal.`;
    },
    done: (scene, spot) => {
      const o = spot.owner, taken = [];
      if (o.remote) { // online: the server decides (thieves: money for the purse; a villager is named)
        VM.net.send('steal', { kind: 'house', target: o.id });
        if (scene.isOriginalThief()) return null;
        VM.give('coconut', 1);
        scene.exposeStealer(scene.player, o);
        return `You stole a coconut from ${o.name}. You are not a thief, so everyone now sees your name!`;
      }
      for (let i = 0; i < 2; i++) {
        const have = Object.keys(o.inv).filter((k) => o.inv[k] > 0);
        if (!have.length) break;
        const k = have[Math.floor(Math.random() * have.length)];
        o.inv[k]--; VM.give(k, 1); taken.push(VM.ITEMS[k].label.toLowerCase());
      }
      if (scene.online) VM.net.send('stole'); // the server names ordinary villagers for everyone
      if (scene.isOriginalThief()) return `You stole ${taken.join(' and ')} from ${o.name}. Nobody saw you.`;
      scene.exposeStealer(scene.player, o);
      return `You stole ${taken.join(' and ')} from ${o.name}. You are not a thief, so everyone now sees your name!`;
    },
  },

  // Stealing someone's cow or chicken at night for meat (same rule: an ordinary villager is named)
  stealAnimal: {
    label: 'Steal an animal',
    seconds: 3,
    done: (scene, spot) => {
      const meat = spot.animal.texture.key === 'cow' ? 3 : 1;
      VM.give('meat', meat);
      scene.removeAnimal(spot.animal);
      if (scene.online) VM.net.send('steal', { kind: 'animal' });
      if (scene.isOriginalThief()) return `You stole ${spot.owner.name}'s ${spot.animal.texture.key} and got ${meat} meat. Nobody saw you.`;
      scene.exposeStealer(scene.player, spot.owner);
      return `You stole ${spot.owner.name}'s ${spot.animal.texture.key} and got ${meat} meat. Everyone now sees your name!`;
    },
  },

  // Someone else's house
  house: { label: 'House', seconds: 0, done: (scene, spot) => `This is ${spot.owner.name}'s house.` },

  // Vegetable gardens: free in your own garden; in someone else's garden you pay the owner
  garden: {
    label: 'Pick vegetables',
    seconds: 2.5,
    cooldown: 45,
    check: (spot) => (spot.owner && !spot.owner.isPlayer && VM.state.inv.money < VM.GARDEN_PRICE ? `Picking from ${spot.owner.name}'s land costs Rs ${VM.GARDEN_PRICE}. Buy your own land (Rs ${VM.LAND_PRICE}) and pick for free!` : null),
    done: (scene, spot) => {
      VM.give('veg', 1);
      if (spot.owner && !spot.owner.isPlayer) {
        VM.give('money', -VM.GARDEN_PRICE);
        if (!(VM.net && VM.net.online)) spot.owner.money += VM.GARDEN_PRICE;
        return `You paid Rs ${VM.GARDEN_PRICE} to pick from ${spot.owner.name}'s land. Your own land picks for free!`;
      }
      return spot.owner ? 'You picked vegetables from your garden.' : 'You picked vegetables.';
    },
  },

  hunt: { label: 'Hunt in the jungle (wild meat)', seconds: 4, cooldown: 25, done: (scene) => {
    const bees = scene && scene.startBees && !scene.isNight && !scene.bees && Math.random() < VM.BEE_CHANCE;
    const caught = Math.random() < 0.45;
    if (caught) VM.give('meat', 1);
    if (bees) { scene.startBees(); return (caught ? 'You caught 1 meat, but ' : 'Oh no! ') + 'you hit a bees\' nest! 🐝 Run to any house in the village and hide!'; }
    return caught ? 'You caught a wild jungle fowl: 1 meat!' : 'The animal got away. Try again later.';
  } },

  paddy: { label: 'Harvest paddy', seconds: 3, done: () => { VM.give('paddy', 1); return 'You harvested paddy.'; } },

  boat: { label: 'Get in the boat', seconds: 0, done: (scene, spot) => scene.boardBoat(spot.boat) },

  fish: {
    label: 'Fish from the boat',
    seconds: 4,
    done: () => {
      if (Math.random() < 0.75) { VM.give('fish', 1); return 'You caught a fish!'; }
      return 'The fish got away.';
    },
  },

  // People on foot cannot move an elephant: only the tractor can chase it back to the jungle.
  elephant: { label: 'Too big to chase on foot: get the tractor', seconds: 0, done: () => 'Only the tractor can chase an elephant. It is parked in the village square.' },

  tractor: { label: 'Drive the tractor', seconds: 0, done: (scene) => scene.driveTractor() },
  tractorOut: { label: 'Get out of the tractor', seconds: 0, done: (scene) => scene.leaveTractor() },
};

// Find a task by its name, following "same as" links.
VM.task = function (name) {
  const t = VM.TASKS[name];
  return t && t.same ? VM.TASKS[t.same] : t;
};
