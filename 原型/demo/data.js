/* ============================================================
 * 《文明指数》节点-lite MVP — 数据层 data.js v2
 * 玩法：节点图供需网络（方案 B 节点式）
 * 节点类型：source 资源源 / work 加工 / energy 能源转换 /
 *           research 科研 / 连线=供需关系（未连线的节点不工作）
 * 数值为 MVP 草案 [软数据]（来自聪明的大赢鲸的思考与认知）
 * ============================================================ */
const DATA = {
  eras: [
    { id:0, name:'火种',       k:0.0, p:1e6,  icon:'🔥', desc:'第一堆火，第一句话。部落围火而坐。' },
    { id:1, name:'农耕',       k:0.1, p:1e7,  icon:'🌾', desc:'种子落进泥土，文明第一次定居。' },
    { id:2, name:'青铜·铁器', k:0.2, p:1e8,  icon:'⚒️', desc:'金属改变一切：武器、农具、道路。' },
    { id:3, name:'前工业',     k:0.3, p:1e9,  icon:'⛵', desc:'风帆与水力，大航海的黎明。' },
    { id:4, name:'早期工业',   k:0.4, p:1e10, icon:'🏭', desc:'蒸汽的轰鸣——教学段终点。' },
  ],

  // 资源：全局库存 + 单位折算（供 EROI 仪表盘）
  resources: {
    wood:  { name:'薪柴',  icon:'🪵', cap:20, equiv:1 },   // 1 单位 ≈ 1kW·s
    food:  { name:'食物',  icon:'🌾', cap:20, equiv:0.5 },
    ore:   { name:'矿石',  icon:'⛏️', cap:20, equiv:0 },
    metal: { name:'金属',  icon:'🔩', cap:10, equiv:0 },
    water: { name:'水力',  icon:'💧', cap:20, equiv:1 },
  },

  // 节点类型定义
  nodes: {
    forest:    { cat:'source',   name:'森林',   icon:'🌲', era:0, out:{wood:0.6},   workers:0, color:'#2f8f4f',
      card:{ title:'森林与薪柴', body:'薪柴能量密度约 16 MJ/kg（已核实 energyeducation.ca）。森林可再生但有再生上限——这是资源危机的种子。' } },
    farm:      { cat:'source',   name:'麦田',   icon:'🌾', era:0, out:{food:0.6},   workers:0, color:'#b39a3a',
      card:{ title:'农业', body:'农业让单位土地卡路里暴增，支撑人口密度跃升——文明功率自此指数增长。' } },
    mine:      { cat:'source',   name:'矿脉',   icon:'⛏️', era:2, out:{ore:0.4},    workers:0, color:'#8a8a8a', tech:'metallurgy',
      card:{ title:'冶金', body:'青铜与铁——金属工具的能量回报远高于石器（已核实能量密度见 M01）。' } },
    river:     { cat:'source',   name:'河流',   icon:'💧', era:1, out:{water:0.6},  workers:0, color:'#3f8fcf',
      card:{ title:'水利', body:'水车 EROI 约 10–40，是前工业时代最高效能源之一（软数据）。' } },
    woodcutter: { cat:'work',    name:'伐木场', icon:'🪓', era:0, in:{wood:1}, out:{wood:1.2},  workers:1, color:'#7a5a2a',
      card:{ title:'加工提效', body:'伐木场集中加工，让薪柴产出 +20%（EROI 优化是文明的第一门功课）。' } },
    smelter:   { cat:'work',    name:'冶炼坊', icon:'🏭', era:2, in:{ore:1},  out:{metal:0.5}, workers:2, color:'#8a4a2a', tech:'metallurgy',
      card:{ title:'冶炼', body:'矿石 → 金属：把不可燃的矿物变成可以造机器的材料。' } },
    campfire:  { cat:'energy',  name:'篝火',   icon:'🔥', era:0, in:{wood:0.5}, power:1e5,  workers:1, color:'#e8823a',
      card:{ title:'薪柴→热量', body:'村落火用能 ≈100kW 文明当量（1 节点=一村火堆总和）。烧 wood 0.5/s。EROI 约 5–15（DC4 裁决）。' } },
    watermill: { cat:'energy',  name:'水车',   icon:'⚙️', era:1, in:{water:0.5}, power:1e6,  workers:1, color:'#3f9fd8', tech:'irrigation',
      card:{ title:'水车', body:'水磨坊群 ≈1MW 文明当量。烧水力 0.5/s。前工业时代最高效能源，EROI 10–40。' } },
    steam:     { cat:'energy',  name:'蒸汽机', icon:'🚂', era:3, in:{wood:4}, power:2e7, workers:2, color:'#c84848', tech:'steam_engine', reqRes:{metal:1},
      card:{ title:'蒸汽机', body:'蒸汽机群 ≈20MW 文明当量。烧 wood 4/s，需要 1 金属建造。热机效率受卡诺循环限制。' } },
    factory:   { cat:'energy',  name:'工厂电站', icon:'🏭', era:4, in:{wood:6}, power:5e8, workers:3, color:'#ff8a5d', tech:'factory_system', reqRes:{metal:2},
      card:{ title:'早期工业', body:'工厂电站 ≈500MW 文明当量，烧 wood 6/s，需要 2 金属。蒸汽+工厂=工业文明，冲向 K 0.4。' } },
    lab:       { cat:'research', name:'研究院', icon:'🔬', era:1, power:500, rps:2, workers:2, color:'#8f6fd8', tech:'writing',
      card:{ title:'文字与科研', body:'研究院把功率转为科研点（2/s）。文字让知识跨代累积——科技会忘，文明长进。' } },
  },

  // 科技树（解锁节点类型 / 升级属性）
  techs: [
    { id:'fire_mastery', era:0, name:'控火术', icon:'🔥', cost:40,  prereq:[], effect:{ type:'buff', node:'campfire', mult:1.2 },
      card:{ title:'控火', body:'人类最早的能量技术。篝火功率 +20%。' } },
    { id:'lang',  era:0, name:'语言', icon:'🗣️', cost:80,  prereq:['fire_mastery'], effect:{ type:'buff', res:'research', mult:1.2 },
      card:{ title:'语言', body:'知识传递是复利引擎。科研 +20%。' } },
    { id:'agri',  era:0, name:'农业', icon:'🌾', cost:150, prereq:['lang'], effect:{ type:'buff', node:'farm', mult:1.3 },
      card:{ title:'农业革命', body:'麦田产出 +30%。' } },
    { id:'animal_dom', era:1, name:'驯化牲畜', icon:'🐂', cost:250, prereq:[], effect:{ type:'buff', res:'food', mult:1.2 },
      card:{ title:'驯化', body:'食物 +20%（人口增长）。' } },
    { id:'irrigation', era:1, name:'灌溉工程', icon:'💧', cost:400, prereq:['animal_dom'], unlock:'watermill', effect:{ type:'buff', node:'watermill', mult:1.5 },
      card:{ title:'灌溉', body:'解锁水车节点；水车功率 +50%。' } },
    { id:'writing', era:1, name:'文字', icon:'📜', cost:650, prereq:['irrigation'], unlock:'lab', effect:{ type:'buff', node:'lab', mult:1.5 },
      card:{ title:'文字', body:'解锁研究院节点；研究院产出 +50%。' } },
    { id:'metallurgy', era:2, name:'冶金', icon:'⚒️', cost:1200, prereq:[], unlock:'mine,smelter', effect:{ type:'buff', node:'steam', mult:1.0 },
      card:{ title:'冶金', body:'解锁矿脉与冶炼坊节点。' } },
    { id:'steam_engine', era:3, name:'蒸汽机', icon:'🚂', cost:3000, prereq:['metallurgy'], unlock:'steam', effect:{ type:'buff', node:'steam', mult:1.2 },
      card:{ title:'蒸汽机', body:'解锁蒸汽机节点；蒸汽机功率 +20%。' } },
    { id:'factory_system', era:4, name:'工厂制', icon:'🏭', cost:6000, prereq:['steam_engine'], unlock:'factory', effect:{ type:'buff', node:'factory', mult:1.2 },
      card:{ title:'工厂制', body:'解锁工厂电站节点；工厂功率 +20%。教学段终点。' } },
  ],

  // 事件：作用于节点类型（B 方案：事件=对节点的打击）
  events: [
    { id:'deforest', eraMin:0, name:'森林枯竭',
      cause:['伐木加速 → 森林覆盖率下降','薪柴产出开始下滑','能源危机逼近'],
      options:[
        { text:'能源转型（解锁水车/水利）', effect:{ type:'debuff', node:'forest', mult:0.5 }, result:'森林产出 -50%，转向水利。' },
        { text:'强行续命（加大伐木）', effect:{ type:'debuff', node:'forest', mult:0.35 }, result:'森林更稀，产出 -65%。' },
      ] },
    { id:'iceage', eraMin:1, name:'小冰期',
      cause:['全球降温 → 作物减产','人口增长停滞','社会动荡风险'],
      options:[
        { text:'修建粮仓', effect:{ type:'debuff', node:'farm', mult:0.6 }, result:'麦田产出 -40%，撑过严冬。' },
        { text:'向温暖地带迁徙', effect:{ type:'lossP', pct:0.10 }, result:'损失 10% 功率，人口延续。' },
      ] },
    { id:'flood', eraMin:2, name:'洪水毁坝',
      cause:['暴雨 → 河流暴涨','堤坝溃决','水车群损毁'],
      options:[
        { text:'重建水利', effect:{ type:'debuff', node:'watermill', mult:0.7 }, result:'水车功率 -30%。' },
        { text:'改道农业区', effect:{ type:'lossP', pct:0.15 }, result:'损失 15% 功率，工业被迫加速。' },
      ] },
  ],

  // 文明特质（纪元更替 3 选 1，永久）
  traits: [
    { id:'oral',     name:'口传文化', icon:'🗣️', desc:'经验口耳相传',        eff:{ power:0.05 } },
    { id:'scribes',  name:'书记制度', icon:'📜', desc:'记录让知识复利',      eff:{ research:0.2 } },
    { id:'engineer', name:'工程师传统', icon:'⚙️', desc:'器物改变世界',      eff:{ power:0.15 } },
    { id:'merchant', name:'商路网络', icon:'🐫', desc:'贸易带来效率',        eff:{ resource:0.1 } },
    { id:'warrior',  name:'尚武传统', icon:'🗡️', desc:'竞争驱动进步',        eff:{ power:0.08 } },
    { id:'farmer',   name:'农本智慧', icon:'🌾', desc:'土地养人',            eff:{ food:0.15 } },
  ],
};

// 节点连线兼容（MVP 简化：任意 out 节点 → 任意 in 节点均可连，但必须成对激活）
// 燃料等效功率（EROI 仪表盘近似用；科学精确口径见科学卡）
const EQUIV = { wood:1e4, food:5e3, water:1e4, ore:0, metal:0 };
