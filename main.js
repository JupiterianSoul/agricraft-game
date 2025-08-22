/* main.js - Core game logic, modules et gestion globale */

window.Game = window.Game || {};

(function(Game){
  'use strict';

  /**
   * Configurations générales et constantes
   */
  Game.Config = {
    version: '1.0.0',
    tickRate: 1000 / 30,            // 30 ticks/sec
    autosaveInterval: 60000,        // autosave toutes les 60s
    offlineMaxDelta: 1000 * 60 * 60 * 24, // max 24h de progression hors-ligne
    debugMode: false,               // mode debug (assertions, cheats)
    muted: false,                   // audio muet
    seed: null,                     // seed PRNG
    i18n: { lang: 'fr', dict: {} }, // langue et dictionnaire
    device: { isTouch: false, isDesktop: false }
  };

  /**
   * Données statiques : cultures, upgrades, arbre tech, quêtes, succès
   */
  Game.Data = {
    crops: {
      wheat:   { name:'Blé',          growTime:60000, yield:5,  water:1, pest:1, seasons:['printemps','été'] },
      corn:    { name:'Maïs',         growTime:90000, yield:8,  water:2, pest:2, seasons:['été'] },
      tomato:  { name:'Tomate',       growTime:75000, yield:6,  water:2, pest:1, seasons:['été','automne'] },
      potato:  { name:'Pomme de terre',growTime:80000,yield:7,  water:1, pest:2, seasons:['printemps','automne'] },
      carrot:  { name:'Carotte',      growTime:70000, yield:5,  water:1, pest:1, seasons:['printemps','été'] },
      soybean: { name:'Soja',         growTime:85000, yield:9,  water:3, pest:3, seasons:['été'] },
      strawberry:{name:'Fraise',      growTime:65000, yield:4,  water:2, pest:2, seasons:['printemps'] },
      grape:   { name:'Raisin',       growTime:100000,yield:10, water:2, pest:3, seasons:['été','automne'] }
    },
    upgrades: [
      { id:'irrigation',      name:'Irrigation',          cost:100, effect:{waterRate:0.8} },
      { id:'fertilizer',      name:'Fertilisation',       cost:200, effect:{yieldMul:1.1} },
      { id:'silo',            name:'Silo de stockage',    cost:300, effect:{storage:500} },
      { id:'greenhouse',      name:'Serre',               cost:500, effect:{seasonExtend:1} },
      { id:'marketstall',     name:'Étal de marché',      cost:150, effect:{priceMul:1.1} },
      { id:'drone',           name:'Drone agricole',      cost:800, effect:{harvestAuto:true} },
      { id:'autoPlanter',     name:'Planteur auto.',      cost:600, effect:{plantAuto:true} },
      { id:'autoHarvester',   name:'Récolte auto.',       cost:700, effect:{harvestAuto:true} },
      { id:'compost',         name:'Composteur',          cost:250, effect:{soilFert:1.2} },
      { id:'tools',           name:'Outils améliorés',    cost:120, effect:{speedMul:1.1} },
      { id:'storagePlus',     name:'Extension stockage',  cost:350, effect:{storage:300} },
      { id:'dynPricing',      name:'Prix dynamiques',     cost:400, effect:{priceVol:0.2} },
      { id:'irrigNet',        name:'Réseau d’irrigation', cost:1000, effect:{waterRate:0.6} },
      { id:'advSeeds',        name:'Semences avancées',   cost:900, effect:{yieldMul:1.2} },
      { id:'researchLab',     name:'Laboratoire',         cost:1200, effect:{researchSpeed:0.8} }
    ],
    techTree: [
      { id:'t1', name:'Spectre d’irrigation', deps:[], cost:50 },
      { id:'t2', name:'Fertilisation',       deps:['t1'], cost:100 },
      { id:'t3', name:'Serres',              deps:['t2'], cost:150 },
      { id:'t4', name:'Compostage',          deps:['t2'], cost:120 },
      { id:'t5', name:'Automatisation',      deps:['t3','t4'], cost:300 },
      { id:'t6', name:'Stockage avancé',     deps:['t3'], cost:200 },
      { id:'t7', name:'Marché dynamique',    deps:['t6'], cost:180 },
      { id:'t8', name:'Semences géné.',      deps:['t4'], cost:250 },
      { id:'t9', name:'Drones',              deps:['t5'], cost:400 },
      { id:'t10',name:'Météo prog.',         deps:['t1'], cost:80 },
      { id:'t11',name:'Lutte antiparasite',  deps:['t10'],cost:220 },
      { id:'t12',name:'Centre recherche',    deps:['t8','t11'], cost:500 }
    ],
    quests: [
      { id:'q1', title:'Planter votre 1ère graine', desc:'Choisir et planter un semis', reward:{money:50} },
      { id:'q2', title:'Récolter un plant',      desc:'Récolter votre 1ère culture', reward:{money:75} },
      { id:'q3', title:'Vendre votre récolte',   desc:'Vendre au marché un lot',    reward:{money:100} },
      { id:'q4', title:'Acheter un upgrade',      desc:'Acquérir votre 1ère amélioration', reward:{money:150} },
      { id:'q5', title:'Irrigation auto',         desc:'Installer un système d’irrigation automatisée', reward:{money:200} },
      { id:'q6', title:'Recherche initiale',      desc:'Débloquer un nœud tech',     reward:{money:250} },
      { id:'q7', title:'Serre construite',        desc:'Construire une serre',       reward:{money:300} },
      { id:'q8', title:'100 unités récoltées',    desc:'Atteindre 100 rendements',   reward:{money:350} },
      { id:'q9', title:'Quête accomplie',         desc:'Terminer 5 quêtes',          reward:{money:400} },
      { id:'q10',title:'Milestone',               desc:'Gagner 1000 pièces',         reward:{money:500} }
    ],
    achievements: [
      { id:'a1', name:'Récolte novice',    criteria:{harvestCount:1},    secret:false },
      { id:'a2', name:'Marchand',          criteria:{sellMoney:500},     secret:false },
      { id:'a3', name:'Horticulture',      criteria:{plantAll: true},    secret:true },
      { id:'a4', name:'Automate',          criteria:{upgrades:['automation']}, secret:false },
      { id:'a5', name:'Scientifique',      criteria:{techCount:5},        secret:false },
      { id:'a6', name:'Céréalier',         criteria:{harvestCount:100},  secret:false },
      { id:'a7', name:'Riche',             criteria:{sellMoney:10000},   secret:false },
      { id:'a8', name:'Collectionneur',     criteria:{upgradeCount:10},   secret:false },
      { id:'a9', name:'Forestier',         criteria:{prestige:1},        secret:true },
      { id:'a10',name:'Maître',            criteria:{techCount:12},      secret:false },
      { id:'a11',name:'Éleveur',           criteria:{cropVariety:8},     secret:false },
      { id:'a12',name:'Marché en fête',    criteria:{festivalCount:3},   secret:true },
      { id:'a13',name:'Ferme légendaire',  criteria:{prestige:5},        secret:true },
      { id:'a14',name:'Explorateur météo', criteria:{weatherEvents:10},  secret:false },
      { id:'a15',name:'Champion',          criteria:{questCount:10},     secret:false }
    ]
  };

  /**
   * Utilitaires : PRNG, clamp, etc.
   */
  Game.Util = {
    _seed: 1,
    seedRandom(seed){
      this._seed = seed >>> 0;
    },
    random(){
      this._seed = (this._seed * 1664525 + 1013904223) >>> 0;
      return this._seed / 0x100000000;
    },
    clamp(v,min,max){ return v < min?min:(v>max?max:v); },
    now(){ return Date.now(); }
  };

  /**
   * Bus d'événements interne
   */
  Game.EventBus = {
    _listeners:{},
    on(evt,fn){
      (this._listeners[evt]||(this._listeners[evt]=[])).push(fn);
    },
    off(evt,fn){
      if(!this._listeners[evt])return;
      this._listeners[evt]=this._listeners[evt].filter(f=>f!==fn);
    },
    emit(evt,data){
      (this._listeners[evt]||[]).slice().forEach(fn=>{
        try{ fn(data); }catch(e){ if(Game.Config.debugMode) console.error(e); }
      });
    }
  };

  /**
   * Gestion du temps & boucles
   */
  Game.Time = (function(){
    let last=Game.Util.now(), acc=0;
    function frame(now){
      let dt = now - last;
      last = now;
      acc += dt;
      while(acc >= Game.Config.tickRate){
        Game.EventBus.emit('tick', Game.Config.tickRate);
        acc -= Game.Config.tickRate;
      }
      Game.Render.render();
      requestAnimationFrame(frame);
    }
    return {
      start(){
        last = Game.Util.now(); acc=0;
        requestAnimationFrame(frame);
      },
      applyOffline(){
        try{
          let save = Game.Save.loadSlot('auto');
          let delta = Math.min(Game.Util.now()-save.timestamp, Game.Config.offlineMaxDelta);
          let steps = Math.floor(delta/Game.Config.tickRate);
          for(let i=0;i<steps;i++) Game.EventBus.emit('tick', Game.Config.tickRate);
        }catch(e){}
      }
    };
  })();

  /**
   * Sauvegarde / chargement compressé
   */
  Game.Save = (function(){
    const slots=['auto','manual1','manual2'];
    function compress(o){ return JSON.stringify(o); }
    function decompress(s){ return JSON.parse(s); }
    function saveSlot(slot){
      if(!slots.includes(slot)) throw 'Slot invalide';
      let data={ timestamp:Game.Util.now(), state:Game.State.get() };
      localStorage.setItem('slot_'+slot, compress(data));
    }
    function loadSlot(slot){
      if(!slots.includes(slot)) throw 'Slot invalide';
      let txt=localStorage.getItem('slot_'+slot);
      if(!txt) throw 'Vide';
      return decompress(txt);
    }
    setInterval(()=>{ try{ saveSlot('auto'); }catch(e){} }, Game.Config.autosaveInterval);
    return { saveSlot, loadSlot };
  })();

  /**
   * État global du jeu
   */
  Game.State = (function(){
    let state={
      plots:[], resources:{money:0}, inventory:{}, upgrades:[], tech:[], quests:{}, achievements:{}
    };
    return {
      get(){ return state; },
      set(s){ state=s; Game.EventBus.emit('state.update', state); }
    };
  })();

  /**
   * Météo simple + festivals
   */
  Game.Weather = (function(){
    let types=['pluie','ensoleillé','canicule','gel'];
    function update(){ /* changer météo sur base aléatoire */ }
    Game.EventBus.on('tick', dt=>{ /* cycle météo toutes X ticks */ });
    return { current:types[0] };
  })();

  /**
   * Input : souris/tactile/clavier unifiés
   */
  Game.Input = (function(){
    function init(){
      let c = document.getElementById('game-container');
      Game.Config.device.isTouch = 'ontouchstart' in window;
      Game.Config.device.isDesktop = !Game.Config.device.isTouch;
      c.addEventListener('pointerdown',e=>Game.EventBus.emit('input.down',e));
      c.addEventListener('pointerup',e=>Game.EventBus.emit('input.up',e));
      window.addEventListener('keydown',e=>Game.EventBus.emit('input.key',e));
    }
    return { init };
  })();

  /**
   * UI : HUD, panneaux, modales, tooltips
   */
  Game.UI = (function(){
    function init(){
      renderResources(); bind();
    }
    function bind(){
      Game.EventBus.on('state.update', renderResources);
    }
    function renderResources(){
      let res = Game.State.get().resources;
      document.getElementById('resources-panel').textContent = `Argent: ${res.money}¢`;
    }
    return { init };
  })();

  /**
   * Rendu Canvas des parcelles et plantes
   */
  Game.Render = (function(){
    let ctx, canvas;
    function init(){
      let container = document.getElementById('game-container');
      canvas = document.createElement('canvas');
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      container.appendChild(canvas);
      ctx = canvas.getContext('2d');
    }
    function render(){
      if(!ctx) return;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      // dessiner grille, plots, plantes selon Game.State
    }
    return { init, render };
  })();

  /**
   * Audio WebAudio simple
   */
  Game.Audio = (function(){
    let ac, gain;
    function init(){
      ac = new (window.AudioContext||window.webkitAudioContext)();
      gain = ac.createGain(); gain.connect(ac.destination);
    }
    function beep(freq,dur){
      if(Game.Config.muted) return;
      let o = ac.createOscillator();
      o.frequency.value = freq; o.connect(gain);
      o.start(); o.stop(ac.currentTime+dur);
    }
    return { init, beep };
  })();

  /**
   * Debug : assertions & cheats
   */
  Game.Debug = (function(){
    function assert(cond,msg){
      if(Game.Config.debugMode && !cond) throw new Error(msg);
    }
    function enable(){ Game.Config.debugMode = true; }
    return { assert, enable };
  })();

  /**
   * Initialisation et démarrage
   */
  function init(){
    Game.Config.seed = Game.Util.now() % 0x100000000;
    Game.Util.seedRandom(Game.Config.seed);
    Game.Input.init();
    Game.UI.init();
    Game.Render.init();
    Game.Audio.init();
    try{ let save = Game.Save.loadSlot('auto'); Game.State.set(save.state); }catch(e){}
    Game.Time.applyOffline();
    Game.Time.start();
  }

  window.addEventListener('DOMContentLoaded', init);

})(window.Game);
