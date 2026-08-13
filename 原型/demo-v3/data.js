/* ============================================================
 * 《文明指数》demo-v3 — 数据层 data.js
 * 上帝视角·宏观引导：国策/权重/战略目标/裁决 + 文明自动体
 * 关键修正（见 00_探索日志.md）：
 *   - EROI 直接标定（不再用 fuel equiv 反推，修复 v2 恒绿 bug）
 *   - 资源砍到 wood/water 两燃料 + 人口流（农场直接养人）
 *   - 劳动力抽象：能源/科研节点满编才工作，源/农场免工
 * ============================================================ */
const DATA = {
  eras: [
    { id:0, name:'火种',     k:0.0, p:1e6,  icon:'🔥', desc:'第一堆火，第一句话。' },
    { id:1, name:'农耕',     k:0.1, p:1e7,  icon:'🌾', desc:'种子落进泥土，文明定居。' },
    { id:2, name:'青铜·铁器', k:0.2, p:1e8, icon:'⚒️', desc:'金属改变一切。' },
    { id:3, name:'前工业',   k:0.3, p:1e9,  icon:'⛵', desc:'风帆与水力，大航海黎明。' },
    { id:4, name:'早期工业', k:0.4, p:1e10, icon:'🏭', desc:'蒸汽轰鸣——教学段终点。' },
  ],

  // 资源库存：仅两燃料（food 不是库存，是人口流，见 farm 节点）
  resources: {
    wood:  { name:'薪柴', icon:'🪵', cap:60 },
    water: { name:'水力', icon:'💧', cap:60 },
  },

  // ---- 节点模板 ----
  // cat: source=资源源(免工) / farm=农业(免工,养人) / energy=能源(需工) / research=科研(需工)
  // eroi: 能源节点直接标定（功率加权调和平均用于链 EROI）
  // region: 需探索发现该区域才解锁（缺省=开局可用）
  nodes: {
    forest:  { cat:'source', name:'森林', icon:'🌲', era:0, out:{wood:1.2}, cost:300, color:'#2f8f4f',
      card:{ title:'森林与薪柴', body:'薪柴能量密度约 16 MJ/kg（已核实）。可再生但有上限。' } },
    river:   { cat:'source', name:'河流', icon:'💧', era:0, out:{water:1.2}, cost:300, color:'#2f8f4f',
      card:{ title:'水利', body:'水车 EROI 10–40，前工业最高效。' } },
    farm:    { cat:'farm', name:'麦田', icon:'🌾', era:0, food:4.0, cost:400, region:'plains', color:'#2f8f4f',
      card:{ title:'农业', body:'麦田养人→人口→劳动力。每块麦田供养约 1000 人。' } },
    oldforest:{ cat:'source', name:'古林', icon:'🌳', era:0, out:{wood:2.0}, cost:450, region:'oldforest', color:'#2f8f4f',
      card:{ title:'原始森林', body:'更丰饶的薪炭来源。' } },
    greatriver:{ cat:'source', name:'大江', icon:'🌊', era:0, out:{water:2.0}, cost:450, region:'greatriver', color:'#2f8f4f',
      card:{ title:'大江', body:'更丰沛的水力。' } },

    campfire: { cat:'energy', name:'篝火', icon:'🔥', era:0, in:{wood:0.5}, power:1e5, workers:1, eroi:6.7, cost:500, color:'#c84848',
      card:{ title:'薪柴→热量', body:'村火文明当量 100kW。EROI≈6.7（绿）。' } },
    watermill:{ cat:'energy', name:'水车', icon:'⚙️', era:1, in:{water:0.5}, power:1e6, workers:1, eroi:20, cost:800, tech:'irrigation', color:'#c84848',
      card:{ title:'水车', body:'水磨坊群 1MW。EROI≈20（绿）。' } },
    steam:    { cat:'energy', name:'蒸汽机', icon:'🚂', era:3, in:{wood:2}, power:2e7, workers:2, eroi:3.3, cost:2500, tech:'steam_engine', color:'#c84848',
      card:{ title:'蒸汽机', body:'20MW。EROI≈3.3（黄临界）——高产的代价。' } },
    factory:  { cat:'energy', name:'工厂电站', icon:'🏭', era:4, in:{wood:4}, power:5e8, workers:3, eroi:2.5, cost:8000, tech:'factory_system', color:'#c84848',
      card:{ title:'早期工业', body:'500MW。EROI≈2.5（黄/红）——工业的代价。' } },

    lab:      { cat:'research', name:'研究院', icon:'🔬', era:1, power:500, rps:3, workers:2, cost:600, tech:'writing', color:'#8f6fd8',
      card:{ title:'文字与科研', body:'消耗功率产出科研点。' } },
  },

  // ---- 科技（自动体自动研发，玩家只需调「科研」权重）----
  techs: [
    { id:'fire_mastery', era:0, name:'控火术', icon:'🔥', cost:40, prereq:[], effect:{ type:'buff', node:'campfire', mult:1.2 },
      card:{ title:'控火', body:'篝火功率 +20%。' } },
    { id:'lang', era:0, name:'语言', icon:'🗣️', cost:80, prereq:['fire_mastery'], effect:{ type:'buff', res:'research', mult:1.2 },
      card:{ title:'语言', body:'科研 +20%。' } },
    { id:'agri', era:0, name:'农业', icon:'🌾', cost:150, prereq:['lang'], effect:{ type:'buff', node:'farm', mult:1.3 },
      card:{ title:'农业革命', body:'麦田产粮 +30%。' } },
    { id:'irrigation', era:1, name:'灌溉工程', icon:'💧', cost:400, prereq:['agri'], unlock:'watermill', effect:{ type:'buff', node:'watermill', mult:1.5 },
      card:{ title:'灌溉', body:'解锁水车。' } },
    { id:'writing', era:1, name:'文字', icon:'📜', cost:650, prereq:['lang'], unlock:'lab', effect:{ type:'buff', node:'lab', mult:1.5 },
      card:{ title:'文字', body:'解锁研究院。' } },
    { id:'steam_engine', era:3, name:'蒸汽机', icon:'🚂', cost:3000, prereq:['irrigation'], unlock:'steam', effect:{ type:'buff', node:'steam', mult:1.2 },
      card:{ title:'蒸汽机', body:'解锁蒸汽机。' } },
    { id:'factory_system', era:4, name:'工厂制', icon:'🏭', cost:6000, prereq:['steam_engine'], unlock:'factory', effect:{ type:'buff', node:'factory', mult:1.2 },
      card:{ title:'工厂制', body:'解锁工厂电站。' } },
  ],

  // ---- 国策（装人格，最多 2 条）----
  creeds: [
    { id:'agrarian',  name:'重农', icon:'🌾', desc:'麦田产粮 +50%', eff:{ farm:0.5 }, bias:'farm' },
    { id:'industrial', name:'尚工', icon:'🏭', desc:'能源功率 +20%', eff:{ power:0.2 }, bias:'energy' },
    { id:'scientific', name:'崇尚科学', icon:'🔬', desc:'科研 +30%', eff:{ research:0.3 }, bias:'research' },
    { id:'expansion', name:'扩张', icon:'🧭', desc:'探索 +50%', eff:{ explore:0.5 }, bias:'explore' },
    { id:'conserv', name:'守成', icon:'🏛️', desc:'文化 +50%、危机减轻', eff:{ culture:0.5 }, bias:'culture' },
    { id:'militant', name:'尚武', icon:'🛡️', desc:'国防 +50%、危机减损', eff:{ defense:0.5 }, bias:'defense' },
  ],

  // ---- 六支柱权重（文明血脉，玩家高频调）----
  pillars: [
    { id:'explore',  name:'探索', icon:'🧭', desc:'清迷雾、发现新区域新资源' },
    { id:'research', name:'科研', icon:'🔬', desc:'加速科技研发' },
    { id:'agri',     name:'农业', icon:'🌾', desc:'建麦田→养人→劳动力' },
    { id:'industry', name:'工业', icon:'🏭', desc:'建能源→提升功率' },
    { id:'culture',  name:'文化', icon:'🏛️', desc:'累积文明印记→永久加成' },
    { id:'defense',  name:'国防', icon:'🛡️', desc:'累积国防→减轻危机' },
  ],

  // ---- 世界区域（探索解锁新节点/资源加成）----
  regions: [
    { id:'plains',    name:'北方平原', icon:'🌾', x:220, y:120, r:70, cost:800,  unlock:'farm',      bonus:{ food:0.2 }, desc:'肥沃平原——解锁麦田，全境产粮 +20%。' },
    { id:'oldforest', name:'南方古林', icon:'🌳', x:120, y:300, r:70, cost:1200, unlock:'oldforest',  bonus:{ wood:0.4 }, desc:'原始密林——解锁古林，全境薪柴 +40%。' },
    { id:'greatriver',name:'东方大江', icon:'🌊', x:320, y:300, r:70, cost:1200, unlock:'greatriver', bonus:{ water:0.4 }, desc:'奔涌大江——解锁大江，全境水力 +40%。' },
  ],

  // ---- 文明特质（纪元更替 3 选 1）----
  traits: [
    { id:'oral',     name:'口传文化', icon:'🗣️', desc:'经验口耳相传', eff:{ power:0.05 } },
    { id:'scribes',  name:'书记制度', icon:'📜', desc:'记录让知识复利', eff:{ research:0.2 } },
    { id:'engineer', name:'工程师传统', icon:'⚙️', desc:'器物改变世界', eff:{ power:0.15 } },
    { id:'merchant', name:'商路网络', icon:'🐫', desc:'贸易带来效率', eff:{ resource:0.1 } },
    { id:'warrior',  name:'尚武传统', icon:'🗡️', desc:'竞争驱动进步', eff:{ power:0.08 } },
    { id:'farmer',   name:'农本智慧', icon:'🌾', desc:'土地养人', eff:{ food:0.15 } },
  ],

  // ---- 危机（裁决型，有限干预）----
  crises: [
    { id:'deforest', name:'森林枯竭', icon:'🌲',
      trigger:{ forestMin:3, starveSeconds:8 },
      cause:['伐木速度超过森林再生','薪柴产出开始下滑'],
      options:[
        { text:'转型水利（引导水车）', effect:{ type:'invest', unlock:'irrigation' }, result:'优先研发灌溉，转用可再生水力。' },
        { text:'强行续命（透支森林）', effect:{ type:'debuff', node:'forest', mult:0.6 }, result:'薪柴 +50%（短期），但森林永久 -40%。' },
        { text:'造林休养（投资未来）', effect:{ type:'boost', wood:1.5 }, result:'薪柴产出 +50%，但需消耗能量。' },
      ] },
  ],
};

// 节点升级参数（深度轴：自动体养大节点，而非堆第十个）
const UPGRADE = { powerMult: 1.5, costFactor: 1.8, maxLevel: 5 };
