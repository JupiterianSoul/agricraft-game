/* main.js – AgriCraft : logique complète */

window.Game = window.Game || {};

(function(Game){
  'use strict';

  /* 1. CONFIG & CONSTANTES */
  Game.Config = {
    version: '1.0.0',
    tickRate: 1000 / 30,
    autosaveInterval: 60000,
    offlineMaxDelta: 1000*60*60*24,
    debugMode: false,
    muted: false,
    i18n: { lang: 'fr', dict: {} },
    device: {}
  };

  /* 2. DONNÉES STATIQUES */
  Game.Data = {
    crops: {
      wheat:    { name:'Blé',          growTime:60000, yield:5,  price:10, seasons:['printemps','été'] },
      corn:     { name:'Maïs',         growTime:90000, yield:8,  price:15, seasons:['été'] },
      tomato:   { name:'Tomate',       growTime:75000, yield:6,  price:12, seasons:['été','automne'] },
      potato:   { name:'Pomme de terre',growTime:80000,yield:7,  price:11, seasons:['printemps','automne'] }
      // … ajouter autres cultures
    },
    quests: [
      { id:'q1', title:'Plante ton 1er blé',      desc:'Clique sur une parcelle pour planter du blé',          criteria: s=>s.plantedCount>=1,    reward:{money:50} },
      { id:'q2', title:'Récolte ton 1er blé',     desc:'Clique sur une parcelle mûre pour récolter',            criteria: s=>s.harvestCount>=1,    reward:{money:75} },
      { id:'q3', title:'Atteins 100¢ gagnés',     desc:'Accumule 100¢ en vendant tes récoltes',                 criteria: s=>s.totalMoney>=100,    reward:{money:150} }
      // … autres quêtes
    ],
    achievements: [
      { id:'a1', name:'Récolte novice', criteria:s=>s.harvestCount>=1,   secret:false },
      { id:'a2', name:'Grand cultivateur',criteria:s=>s.harvestCount>=50,  secret:false }
      // … autres succès
    ],
    techTree: [
      { id:'t1', name:'Irrigation', deps:[], cost:100, effect:g=>g.waterRate*=0.8 },
      { id:'t2', name:'Fertilisant', deps:['t1'], cost:200, effect:g=>g.yieldMul*=1.1 }
      // … autres nœuds
    ]
  };

  /* 3. UTILITAIRES */
  Game.Util = {
    _seed:1,
    seedRandom(s){ this._seed = s>>>0; },
    random(){ this._seed = (this._seed*1664525+1013904223)>>>0; return this._seed/0x100000000; },
    now(){ return Date.now(); },
    clamp(v,a,b){ return v<a?a:v>b?b:v; }
  };

  /* 4. BUS D’ÉVÉNEMENTS */
  Game.EventBus = {
    _l:{},
    on(evt,fn){ (this._l[evt]||(this._l[evt]=[])).push(fn); },
    emit(evt,data){ (this._l[evt]||[]).forEach(fn=>fn(data)); }
  };

  /* 5. SAUVEGARDE */
  Game.Save = (function(){
    const slot='auto';
    function save(){ localStorage.setItem(slot, JSON.stringify({t:Game.Util.now(),state:Game.State.get()})); }
    function load(){ const txt=localStorage.getItem(slot); return txt?JSON.parse(txt):null; }
    setInterval(save, Game.Config.autosaveInterval);
    return { save, load };
  })();

  /* 6. ÉTAT GLOBAL */
  Game.State = (function(){
    let state = {
      resources:{money:0},
      inventory:{},
      plots:[],
      plantedCount:0,
      harvestCount:0,
      totalMoney:0,
      quests:{}, achievements:{}, tech:[]
    };
    return {
      get(){ return state; },
      set(s){ state=s; Game.EventBus.emit('state.update',s); }
    };
  })();

  /* 7. INPUT */
  Game.Input = (function(){
    function init(){
      Game.Config.device.isTouch = 'ontouchstart' in window;
      Game.Config.device.isDesktop = !Game.Config.device.isTouch;
    }
    return { init };
  })();

  /* 8. GRILLE & CULTURES */
  Game.Plots = (function(){
    const cols=8, rows=5;
    let gridEl, state;

    function init(){
      gridEl = document.getElementById('plot-grid');
      state = Game.State.get();
      state.plots = [];
      for(let y=0;y<rows;y++){
        const row=[];
        for(let x=0;x<cols;x++){
          row.push({ status:'empty', plantedAt:0, crop:null });
        }
        state.plots.push(row);
      }
      renderAll();
      bind();
    }

    function renderAll(){
      gridEl.innerHTML='';
      state.plots.forEach((row,y)=>{
        row.forEach((cell,x)=>{
          const div=document.createElement('div');
          div.className='plot '+cell.status;
          div.dataset.x=x; div.dataset.y=y;
          gridEl.appendChild(div);
        });
      });
    }

    function bind(){
      gridEl.addEventListener('click',e=>{
        if(!e.target.classList.contains('plot'))return;
        const x=+e.target.dataset.x, y=+e.target.dataset.y, cell=state.plots[y][x];
        if(cell.status==='empty')      plant(x,y,'wheat');
        else if(cell.status==='mature')harvest(x,y);
      });
      Game.EventBus.on('tick',updateGrowth);
    }

    function plant(x,y,id){
      const cell=state.plots[y][x], def=Game.Data.crops[id];
      cell.status='planted'; cell.crop=def; cell.plantedAt=Game.Util.now();
      state.plantedCount++;
      renderCell(x,y);
    }

    function updateGrowth(){
      const now=Game.Util.now();
      state.plots.forEach((row,y)=>{
        row.forEach((cell,x)=>{
          if(cell.status==='planted' && now-cell.plantedAt>=cell.crop.growTime){
            cell.status='mature'; renderCell(x,y);
          }
        });
      });
    }

    function harvest(x,y){
      const cell=state.plots[y][x];
      const amount = cell.crop.yield;
      const money = cell.crop.price * amount;
      state.resources.money += money;
      state.totalMoney += money;
      state.harvestCount++;
      state.inventory[cell.crop.name] = (state.inventory[cell.crop.name]||0) + amount;
      cell.status='empty'; cell.crop=null; cell.plantedAt=0;
      renderCell(x,y);
      Game.EventBus.emit('harvest', { money, amount, crop: cell.crop });
    }

    function renderCell(x,y){
      const idx = y*cols + x;
      const el = gridEl.children[idx];
      el.className = 'plot ' + state.plots[y][x].status;
    }

    return { init };
  })();

  /* 9. UI : ressources, inventaire, semences, quêtes, success, tech */
  Game.UI = (function(){
    function init(){
      Game.EventBus.on('state.update', render);
      Game.EventBus.on('harvest', ()=>{ Game.UI.toast('Récolte réussie !'); });
      render();
    }

    function render(){
      const s = Game.State.get();
      // ressources
      document.getElementById('resources-panel').textContent = `Argent : ${s.resources.money}¢`;
      // inventaire
      const inv = document.getElementById('inventory-list');
      inv.innerHTML = '';
      Object.entries(s.inventory).forEach(([crop,qty])=>{
        const li=document.createElement('li');
        li.textContent=`${crop} : ${qty}`;
        inv.appendChild(li);
      });
      // semences
      const seeds=document.getElementById('seed-list');
      seeds.innerHTML='';
      Object.entries(Game.Data.crops).forEach(([id,cd])=>{
        const li=document.createElement('li');
        const btn=document.createElement('button');
        btn.textContent=cd.name;
        btn.onclick=()=>Game.Plots.plantMode(id);
        li.appendChild(btn);
        seeds.appendChild(li);
      });
      // quêtes
      const qp=document.getElementById('quests-panel');
      qp.innerHTML='<h3>Quêtes</h3>';
      Game.Data.quests.forEach(q=>{
        if(!s.quests[q.id]){
          const done=q.criteria(s);
          if(done) completeQuest(q);
          else {
            const div=document.createElement('div');
            div.textContent=q.title;
            qp.appendChild(div);
          }
        }
      });
      // succès
      Game.Data.achievements.forEach(a=>{
        if(!s.achievements[a.id] && a.criteria(s)){
          s.achievements[a.id]=true;
          Game.UI.toast(`Succès ! ${a.name}`);
        }
      });
      // tech-tree
      const tt=document.getElementById('tech-list');
      tt.innerHTML='';
      Game.Data.techTree.forEach(t=>{
        const li=document.createElement('li');
        const btn=document.createElement('button');
        btn.textContent = `${t.name} (${t.cost}¢)`;
        btn.disabled = s.tech.includes(t.id) || !t.deps.every(d=>s.tech.includes(d)) || s.resources.money < t.cost;
        btn.onclick = ()=>{
          s.resources.money -= t.cost;
          s.tech.push(t.id);
          t.effect(Game.Config);
          Game.EventBus.emit('state.update');
        };
        li.appendChild(btn);
        tt.appendChild(li);
      });
    }

    function completeQuest(q){
      const s=Game.State.get();
      s.quests[q.id]=true;
      s.resources.money += q.reward.money;
      Game.UI.toast(`Quête accomplie : ${q.title}`);
      Game.EventBus.emit('state.update');
    }

    function toast(msg){
      const c=document.getElementById('toast-container');
      const t=document.createElement('div');
      t.className='toast'; t.textContent=msg;
      c.appendChild(t);
      setTimeout(()=>c.removeChild(t),3000);
    }

    return { init, toast };
  })();

  /* 10. MÉTÉO */
  Game.Weather = (function(){
    const types=['pluie','ensoleillé','canicule','gel'];
    let idx=0;
    function init(){
      setInterval(()=>{
        idx = (idx+1)%types.length;
        document.getElementById('weather-display').textContent = `Météo : ${types[idx]}`;
      }, 20000);
    }
    return { init };
  })();

  /* 11. AUDIO */
  Game.Audio = (function(){
    let ac, gain;
    function init(){
      ac = new (window.AudioContext||window.webkitAudioContext)();
      gain = ac.createGain(); gain.connect(ac.destination);
    }
    function beep(freq=440,dur=0.1){
      if(Game.Config.muted) return;
      const o=ac.createOscillator();
      o.frequency.value=freq; o.connect(gain);
      o.start(); o.stop(ac.currentTime+dur);
    }
    return { init, beep };
  })();

  /* 12. HORLOGE & BOUCLE */
  Game.Time = (function(){
    let last=0, acc=0;
    function frame(now){
      if(!last) last=now;
      const dt = now-last; last=now; acc+=dt;
      while(acc >= Game.Config.tickRate){
        Game.EventBus.emit('tick', Game.Config.tickRate);
        acc -= Game.Config.tickRate;
      }
      // horloge
      const d=new Date(); 
      document.getElementById('clock-display').textContent =
        d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
      requestAnimationFrame(frame);
    }
    function start(){
      requestAnimationFrame(frame);
    }
    return { start };
  })();

  /* 13. INIT & DÉMARRAGE */
  function init(){
    Game.Util.seedRandom(Game.Util.now());
    Game.Input.init();
    Game.Audio.init();
    Game.Plots.init();
    Game.UI.init();
    Game.Weather.init();

    // restore offline
    const save = Game.Save.load();
    if(save){
      const delta = Math.min(Game.Util.now()-save.t, Game.Config.offlineMaxDelta);
      const steps = Math.floor(delta/Game.Config.tickRate);
      for(let i=0;i<steps;i++) Game.EventBus.emit('tick', Game.Config.tickRate);
      Game.State.set(save.state);
    }

    Game.Time.start();
  }

  window.addEventListener('DOMContentLoaded', init);

})(window.Game);
