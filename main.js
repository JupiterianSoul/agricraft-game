// main.js – AgriCraft : logique complète

window.Game = window.Game || {};

(function(Game){
  'use strict';

  // 1. CONFIGURATION GÉNÉRALE
  Game.Config = {
    version: '1.0.0',
    tickRate: 1000 / 30,               // 30 FPS
    autosaveInterval: 60_000,         // chaque minute
    offlineMaxDelta: 24 * 60 * 60_000, // max 24 h offline
    muted: false
  };

  // 2. DONNÉES STATIQUES
  Game.Data = {
    crops: {
      wheat:  { name: 'Blé',            growTime: 60_000, yield: 5,  price: 10 },
      corn:   { name: 'Maïs',           growTime: 90_000, yield: 8,  price: 15 },
      tomato: { name: 'Tomate',         growTime: 75_000, yield: 6,  price: 12 },
      potato: { name: 'Pomme de terre', growTime: 80_000, yield: 7,  price: 11 }
    },
    quests: [
      { id: 'q1', title: 'Plante ton 1er blé',  criteria: s => s.plantedCount >= 1,    reward: { money: 50 } },
      { id: 'q2', title: 'Récolte ton 1er blé', criteria: s => s.harvestCount >= 1,    reward: { money: 75 } },
      { id: 'q3', title: 'Atteins 100¢',        criteria: s => s.totalMoney   >= 100,  reward: { money: 150 } }
    ],
    achievements: [
      { id: 'a1', name: 'Récolte novice',     criteria: s => s.harvestCount >= 1 },
      { id: 'a2', name: 'Grand cultivateur',  criteria: s => s.harvestCount >= 50 }
    ],
    techTree: [
      { id: 't1', name: 'Irrigation',  deps: [],       cost: 100, effect: g => g.tickRate *= 0.9 },
      { id: 't2', name: 'Fertilisant', deps: ['t1'], cost: 200, effect: g => {} }
    ]
  };

  // 3. UTILITAIRES
  Game.Util = {
    _seed: 1,
    seedRandom(s) { this._seed = s >>> 0; },
    random() {
      this._seed = (this._seed * 1664525 + 1013904223) >>> 0;
      return this._seed / 0x100000000;
    },
    now() { return Date.now(); }
  };

  // 4. BUS D’ÉVÉNEMENTS
  Game.EventBus = {
    _listeners: {},
    on(evt, fn) { (this._listeners[evt] = this._listeners[evt] || []).push(fn); },
    emit(evt, data) { (this._listeners[evt] || []).forEach(fn => fn(data)); }
  };

  // 5. SAUVEGARDE AUTOMATIQUE
  Game.Save = (function(){
    const slot = 'AgriCraftSave';
    function save() {
      localStorage.setItem(slot,
        JSON.stringify({ t: Game.Util.now(), state: Game.State.get() })
      );
    }
    function load() {
      const raw = localStorage.getItem(slot);
      return raw ? JSON.parse(raw) : null;
    }
    setInterval(save, Game.Config.autosaveInterval);
    return { save, load };
  })();

  // 6. ÉTAT GLOBAL DU JEU
  Game.State = (function(){
    let state = {
      resources:    { money: 0 },
      inventory:    {},
      plots:        [],
      plantedCount: 0,
      harvestCount: 0,
      totalMoney:   0,
      quests:       {},
      achievements: {},
      tech:         []
    };
    return {
      get() { return state; },
      set(s) { state = s; Game.EventBus.emit('state.update', state); }
    };
  })();

  // 7. DÉTECTION DU PÉRIPHÉRIQUE
  Game.Input = (function(){
    function init() {
      Game.Config.device = {
        isTouch: 'ontouchstart' in window,
        isDesktop: !('ontouchstart' in window)
      };
    }
    return { init };
  })();

  // 8. MODULE DES PARCELLES
  Game.Plots = (function(){
    const cols = 8, rows = 5;
    let gridEl, state, selectedCrop = 'wheat';

    function init() {
      gridEl = document.getElementById('plot-grid');
      state  = Game.State.get();

      // Initialisation des parcelles vides
      state.plots = [];
      state.plantedCount = 0;
      state.harvestCount = 0;
      state.totalMoney = 0;
      for (let y = 0; y < rows; y++) {
        const row = [];
        for (let x = 0; x < cols; x++) {
          row.push({ status: 'empty', plantedAt: 0, crop: null });
        }
        state.plots.push(row);
      }

      renderAll();
      bindEvents();
    }

    function bindEvents() {
      // Clic sur une parcelle
      gridEl.addEventListener('click', e => {
        if (!e.target.classList.contains('plot')) return;
        const x = +e.target.dataset.x;
        const y = +e.target.dataset.y;
        const cell = state.plots[y][x];
        if (cell.status === 'empty')      plant(x, y, selectedCrop);
        else if (cell.status === 'mature') harvest(x, y);
      });

      // Tick de croissance
      Game.EventBus.on('tick', updateGrowth);
    }

    function setPlantMode(cropId) {
      selectedCrop = cropId;
      Game.UI.toast(`Mode plantation : ${Game.Data.crops[cropId].name}`);
    }

    function plant(x, y, cropId) {
      const cell = state.plots[y][x];
      const def  = Game.Data.crops[cropId];
      cell.status    = 'planted';
      cell.crop      = def;
      cell.plantedAt = Game.Util.now();
      state.plantedCount++;
      renderCell(x, y);
      Game.EventBus.emit('state.update', state);
    }

    function updateGrowth() {
      const now = Game.Util.now();
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const cell = state.plots[y][x];
          if (cell.status === 'planted'
           && now - cell.plantedAt >= cell.crop.growTime) {
            cell.status = 'mature';
            renderCell(x, y);
          }
        }
      }
    }

    function harvest(x, y) {
      const cell = state.plots[y][x];
      const def  = cell.crop;
      const amt  = def.yield;
      const rev  = def.price * amt;

      state.resources.money  += rev;
      state.totalMoney       += rev;
      state.harvestCount++;
      state.inventory[def.name] = (state.inventory[def.name] || 0) + amt;

      cell.status    = 'empty';
      cell.crop      = null;
      cell.plantedAt = 0;
      renderCell(x, y);

      Game.EventBus.emit('harvest', { crop: def.name, amount: amt, revenue: rev });
      Game.EventBus.emit('state.update', state);
    }

    function renderAll() {
      gridEl.innerHTML = '';
      state.plots.forEach((row, y) => {
        row.forEach((cell, x) => {
          const div = document.createElement('div');
          div.className      = 'plot ' + cell.status;
          div.dataset.x      = x;
          div.dataset.y      = y;
          gridEl.appendChild(div);
        });
      });
    }

    function renderCell(x, y) {
      const idx = y * cols + x;
      const el  = gridEl.children[idx];
      el.className = 'plot ' + state.plots[y][x].status;
    }

    return { init, setPlantMode };
  })();

  // 9. INTERFACE UTILISATEUR
  Game.UI = (function(){
    function init() {
      Game.EventBus.on('state.update', render);
      Game.EventBus.on('harvest', e => {
        toast(`Récolté ${e.amount}×${e.crop} (+${e.revenue}¢)`);
      });
      render();
    }

    function render() {
      const s = Game.State.get();

      // Ressources
      document.getElementById('resources-panel').textContent =
        `Argent : ${s.resources.money}¢`;

      // Inventaire
      const inv = document.getElementById('inventory-list');
      inv.innerHTML = '';
      Object.entries(s.inventory).forEach(([crop, qty]) => {
        const li = document.createElement('li');
        li.textContent = `${crop} : ${qty}`;
        inv.appendChild(li);
      });

      // Sélecteur de semences
      const seeds = document.getElementById('seed-list');
      seeds.innerHTML = '';
      Object.entries(Game.Data.crops).forEach(([id, def]) => {
        const li  = document.createElement('li');
        const btn = document.createElement('button');
        btn.textContent = def.name;
        btn.onclick = () => Game.Plots.setPlantMode(id);
        li.appendChild(btn);
        seeds.appendChild(li);
      });

      // Quêtes
      const qp = document.getElementById('quests-panel');
      qp.innerHTML = '<h3>Quêtes</h3>';
      Game.Data.quests.forEach(q => {
        if (!s.quests[q.id]) {
          if (q.criteria(s)) completeQuest(q);
          else {
            const div = document.createElement('div');
            div.textContent = q.title;
            qp.appendChild(div);
          }
        }
      });

      // Succès
      Game.Data.achievements.forEach(a => {
        if (!s.achievements[a.id] && a.criteria(s)) {
          s.achievements[a.id] = true;
          toast(`Succès : ${a.name}`);
        }
      });

      // Arbre de recherche
      const tt = document.getElementById('tech-list');
      tt.innerHTML = '';
      Game.Data.techTree.forEach(t => {
        const li  = document.createElement('li');
        const btn = document.createElement('button');
        btn.textContent = `${t.name} (${t.cost}¢)`;
        btn.disabled =
          s.tech.includes(t.id) ||
          !t.deps.every(d => s.tech.includes(d)) ||
          s.resources.money < t.cost;
        btn.onclick = () => {
          s.resources.money -= t.cost;
          s.tech.push(t.id);
          t.effect(Game.Config);
          Game.EventBus.emit('state.update', s);
        };
        li.appendChild(btn);
        tt.appendChild(li);
      });
    }

    function completeQuest(q) {
      const s = Game.State.get();
      s.quests[q.id] = true;
      s.resources.money += q.reward.money;
      toast(`Quête accomplie : ${q.title}`);
      Game.EventBus.emit('state.update', s);
    }

    function toast(msg) {
      const c = document.getElementById('toast-container');
      const t = document.createElement('div');
      t.className    = 'toast';
      t.textContent  = msg;
      c.appendChild(t);
      setTimeout(() => c.removeChild(t), 3000);
    }

    return { init, toast };
  })();

  // 10. MÉTÉO CYCLIQUE
  Game.Weather = (function(){
    const types = ['ensoleillé', 'pluie', 'canicule', 'gel'];
    let idx = 0;
    function init(){
      setInterval(() => {
        idx = (idx + 1) % types.length;
        document.getElementById('weather-display').textContent =
          `Météo : ${types[idx]}`;
      }, 20_000);
    }
    return { init };
  })();

  // 11. AUDIO
  Game.Audio = (function(){
    let ac, gain;
    function init(){
      ac   = new (window.AudioContext || window.webkitAudioContext)();
      gain = ac.createGain();
      gain.connect(ac.destination);
    }
    function beep(freq = 440, dur = 0.1){
      if (Game.Config.muted) return;
      const osc = ac.createOscillator();
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start();
      osc.stop(ac.currentTime + dur);
    }
    return { init, beep };
  })();

  // 12. BOUCLE DE TEMPS & HORLOGE
  Game.Time = (function(){
    let last = 0, acc = 0;
    function frame(now){
      if (!last) last = now;
      const dt = now - last;
      last   = now;
      acc   += dt;
      while (acc >= Game.Config.tickRate){
        Game.EventBus.emit('tick', Game.Config.tickRate);
        acc -= Game.Config.tickRate;
      }
      // Mise à jour de l'horloge
      const d = new Date();
      document.getElementById('clock-display').textContent =
        d.getHours().toString().padStart(2,'0') + ':' +
        d.getMinutes().toString().padStart(2,'0');
      requestAnimationFrame(frame);
    }
    function start(){
      requestAnimationFrame(frame);
    }
    return { start };
  })();

  // 13. INITIALISATION GLOBALE
  function init(){
    Game.Util.seedRandom(Game.Util.now());
    Game.Input.init();
    Game.Audio.init();
    Game.Plots.init();
    Game.UI.init();
    Game.Weather.init();

    // Restauration offline
    const saved = Game.Save.load();
    if (saved) {
      const delta = Math.min(Game.Util.now() - saved.t, Game.Config.offlineMaxDelta);
      const steps = Math.floor(delta / Game.Config.tickRate);
      for (let i = 0; i < steps; i++){
        Game.EventBus.emit('tick', Game.Config.tickRate);
      }
      Game.State.set(saved.state);
    }

    Game.Time.start();
  }

  window.addEventListener('DOMContentLoaded', init);

})(window.Game);
