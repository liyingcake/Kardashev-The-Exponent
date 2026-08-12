/* ============================================================
 * 《文明指数》demo-v2 — 数据层 data.js v2.0
 * 按《00_反思与v2设计.md》重构：三轴玩法（放/连/升级）、
 * 节点框标准、数值表 5.2、引导任务、里程碑
 * ============================================================ */
const DATA = {
  eras: [
    { id:0, name:'火种',       k:0.0, p:1e6,  icon:'🔥', desc:'第一堆火，第一句话。' },
    { id:1, name:'农耕',       k:0.1, p:1e7,  icon:'🌾', desc:'种子落进泥土，文明定居。' },
    { id:2, name:'青铜·铁器', k:0.2, p:1e8,  icon:'⚒️', desc:'金属改变一切。' },
    { id:3, name:'前工业',     k:0.3, p:1e9,  icon:'⛵', desc:'风帆与水力，大航海黎明。' },
    { id:4, name:'早期工业',   k:0.4, p:1e10, icon:'🏭', desc:'蒸汽轰鸣——教学段终点。' },
  ],

  // 资源：cap=库存上限；equiv=燃料→等效功率（EROI 计算用）
  resources: {
    wood:  { name:'薪柴', icon:'🪵', cap:30, equiv:3e4 },
    food:  { name:'食物', icon:'🌾', cap:30, equiv:5e3 },
    water: { name:'水力', icon:'💧', cap:30, equiv:5e4 },
    ore:   { name:'矿石', icon:'⛏️', cap:10, equiv:0 },
    metal: { name:'金属', icon:'🔩', cap:10, equiv:0 },
  },

  // ---- 节点模板（v2 标准：分类色 + 数据行 + 升级支持）----
  nodes: {
    forest:    { cat:'source',   name:'森林',   icon:'🌲', era:0, out:{wood:1.2}, color:'#2f8f4f',
      card:{ title:'森林与薪柴', body:'薪柴能量密度约 16 MJ/kg（已核实 energyeducation.ca）。可再生但有上限。' } },
    farm:      { cat:'source',   name:'麦田',   icon:'🌾', era:1, out:{food:1.0}, color:'#2f8f4f',
      card:{ title:'农业', body:'农业让单位土地卡路里暴增。' } },
    mine:      { cat:'source',   name:'矿脉',   icon:'⛏️', era:2, out:{ore:0.6}, color:'#2f8f4f', tech:'metallurgy',
      card:{ title:'冶金', body:'矿石→金属：造机器的材料。' } },
    river:     { cat:'source',   name:'河流',   icon:'💧', era:1, out:{water:1.2}, color:'#2f8f4f', tech:'irrigation',
      card:{ title:'水利', body:'水车 EROI 10–40，前工业最高效。' } },
    woodcutter: { cat:'work',    name:'伐木场', icon:'🪓', era:0, in:{wood:1}, out:{wood:1.5}, workers:1, color:'#b39a3a',
      card:{ title:'加工提效', body:'集中加工让薪柴 +50%。' } },
    smelter:   { cat:'work',    name:'冶炼坊', icon:'🏭', era:2, in:{ore:1},  out:{metal:0.6}, workers:2, color:'#b39a3a', tech:'metallurgy',
      card:{ title:'冶炼', body:'矿石→金属。' } },
    campfire:  { cat:'energy',  name:'篝火',   icon:'🔥', era:0, in:{wood:0.5},  power:1e5,  workers:1, color:'#c84848',
      card:{ title:'薪柴→热量', body:'村火文明当量 100kW。EROI≈6.7。' } },
    watermill: { cat:'energy',  name:'水车',   icon:'⚙️', era:1, in:{water:0.5}, power:1e6,  workers:1, color:'#c84848', tech:'irrigation',
      card:{ title:'水车', body:'水磨坊群 1MW。EROI≈20。' } },
    steam:     { cat:'energy',  name:'蒸汽机', icon:'🚂', era:3, in:{wood:2},   power:2e7,  workers:2, color:'#c84848', tech:'steam_engine', reqRes:{metal:1},
      card:{ title:'蒸汽机', body:'20MW。烧 wood 2/s，EROI≈3.3（黄临界）——高产的代价。' } },
    factory:   { cat:'energy',  name:'工厂电站', icon:'🏭', era:4, in:{wood:4}, power:5e8, workers:3, color:'#c84848', tech:'factory_system', reqRes:{metal:2},
      card:{ title:'早期工业', body:'500MW。烧 wood 4/s，EROI≈2.5（黄/红）——工业的代价。' } },
    lab:       { cat:'research', name:'研究院', icon:'🔬', era:1, power:500, rps:3, workers:2, color:'#8f6fd8', tech:'writing',
      card:{ title:'文字与科研', body:'功率→科研点。' } },
  },

  // ---- 科技（解锁节点/升级属性）----
  techs: [
    { id:'fire_mastery', era:0, name:'控火术', icon:'🔥', cost:40,  prereq:[], effect:{ type:'buff', node:'campfire', mult:1.2 },
      card:{ title:'控火', body:'篝火功率 +20%。' } },
    { id:'lang',  era:0, name:'语言', icon:'🗣️', cost:80,  prereq:['fire_mastery'], effect:{ type:'buff', res:'research', mult:1.2 },
      card:{ title:'语言', body:'科研 +20%。' } },
    { id:'agri',  era:0, name:'农业', icon:'🌾', cost:150, prereq:['lang'], effect:{ type:'buff', node:'farm', mult:1.3 },
      card:{ title:'农业革命', body:'麦田产出 +30%。' } },
    { id:'animal_dom', era:1, name:'驯化牲畜', icon:'🐂', cost:250, prereq:[], effect:{ type:'buff', res:'food', mult:1.2 },
      card:{ title:'驯化', body:'食物 +20%。' } },
    { id:'irrigation', era:1, name:'灌溉工程', icon:'💧', cost:400, prereq:['animal_dom'], unlock:'watermill,river', effect:{ type:'buff', node:'watermill', mult:1.5 },
      card:{ title:'灌溉', body:'解锁水车与河流。' } },
    { id:'writing', era:1, name:'文字', icon:'📜', cost:650, prereq:['irrigation'], unlock:'lab', effect:{ type:'buff', node:'lab', mult:1.5 },
      card:{ title:'文字', body:'解锁研究院。' } },
    { id:'metallurgy', era:2, name:'冶金', icon:'⚒️', cost:1200, prereq:[], unlock:'mine,smelter',
      card:{ title:'冶金', body:'解锁矿脉与冶炼坊。' } },
    { id:'steam_engine', era:3, name:'蒸汽机', icon:'🚂', cost:3000, prereq:['metallurgy'], unlock:'steam', effect:{ type:'buff', node:'steam', mult:1.2 },
      card:{ title:'蒸汽机', body:'解锁蒸汽机。' } },
    { id:'factory_system', era:4, name:'工厂制', icon:'🏭', cost:6000, prereq:['steam_engine'], unlock:'factory', effect:{ type:'buff', node:'factory', mult:1.2 },
      card:{ title:'工厂制', body:'解锁工厂电站。' } },
  ],

  // ---- 事件（里程碑触发为主）----
  events: [
    { id:'deforest', name:'森林枯竭',
      trigger:{ type:'nodes', count:3, node:'forest' },
      cause:['伐木加速 → 森林覆盖率下降','薪柴产出开始下滑'],
      options:[
        { text:'能源转型（研究灌溉→水车）', effect:{ type:'debuff', node:'forest', mult:0.5 }, result:'森林产出 -50%，转向水利。' },
        { text:'强行续命', effect:{ type:'debuff', node:'forest', mult:0.35 }, result:'森林产出 -65%。' },
      ] },
    { id:'iceage', name:'小冰期',
      trigger:{ type:'era', at:1 },
      cause:['全球降温 → 作物减产','人口增长停滞'],
      options:[
        { text:'修建粮仓', effect:{ type:'debuff', node:'farm', mult:0.6 }, result:'麦田产出 -40%。' },
        { text:'向温暖地带迁徙', effect:{ type:'lossP', pct:0.10 }, result:'损失 10% 功率。' },
      ] },
    { id:'flood', name:'洪水毁坝',
      trigger:{ type:'nodes', count:2, node:'watermill' },
      cause:['暴雨 → 河流暴涨','堤坝溃决'],
      options:[
        { text:'重建水利', effect:{ type:'debuff', node:'watermill', mult:0.7 }, result:'水车功率 -30%。' },
        { text:'改道农业区', effect:{ type:'lossP', pct:0.15 }, result:'损失 15% 功率。' },
      ] },
  ],

  // ---- 文明特质（纪元更替 3 选 1）----
  traits: [
    { id:'oral',     name:'口传文化', icon:'🗣️', desc:'经验口耳相传',      eff:{ power:0.05 } },
    { id:'scribes',  name:'书记制度', icon:'📜', desc:'记录让知识复利',    eff:{ research:0.2 } },
    { id:'engineer', name:'工程师传统', icon:'⚙️', desc:'器物改变世界',    eff:{ power:0.15 } },
    { id:'merchant', name:'商路网络', icon:'🐫', desc:'贸易带来效率',      eff:{ resource:0.1 } },
    { id:'warrior',  name:'尚武传统', icon:'🗡️', desc:'竞争驱动进步',      eff:{ power:0.08 } },
    { id:'farmer',   name:'农本智慧', icon:'🌾', desc:'土地养人',          eff:{ food:0.15 } },
  ],

  // ---- 新手引导任务（每步奖励能量）----
  tasks: [
    { id:'t1', name:'搭建第一条链', desc:'放置一个森林，连线到篝火（已有模板可直接连线）。', reward:8000 },
    { id:'t2', name:'雇佣工人', desc:'选中篝火，在右侧面板把工人加到满（1/1）。', reward:8000 },
    { id:'t3', name:'观察 EROI', desc:'看底部状态条：链 EROI 应为绿色（可持续）。', reward:5000 },
    { id:'t4', name:'升级节点', desc:'选中森林点「升级」，让产出 +50%。', reward:10000 },
    { id:'t5', name:'研究控火术', desc:'攒 40 科研点，解锁控火术。', reward:5000 },
  ],
};

// 升级参数
const UPGRADE = { powerMult: 1.5, costBase: 2000, costGrowth: 1.5, maxLevel: 8 };
