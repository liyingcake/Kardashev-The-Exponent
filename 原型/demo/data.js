/* ============================================================
 * 《文明指数》教学段垂直切片 — 数据层 data.js
 * 覆盖：火种→农耕→青铜·铁器→前工业→早期工业（K0.0 → K0.4）
 * 数值基于阶段1原型模型（[软数据] 来自聪明的大赢鲸的思考与认知）
 * ============================================================ */
const DATA = {
  // ---- 纪元（5 档，含教学段终点预览）----
  eras: [
    { id:0, name:'火种',   k:0.0, p:1e6,  icon:'🔥', desc:'第一堆火，第一句话。部落围火而坐。' },
    { id:1, name:'农耕',   k:0.1, p:1e7,  icon:'🌾', desc:'种子落进泥土，文明第一次定居。' },
    { id:2, name:'青铜·铁器', k:0.2, p:1e8, icon:'⚒️', desc:'金属改变一切：武器、农具、道路。' },
    { id:3, name:'前工业', k:0.3, p:1e9,  icon:'⛵', desc:'风帆与水力，大航海的黎明。' },
    { id:4, name:'早期工业', k:0.4, p:1e10, icon:'🏭', desc:'蒸汽的轰鸣——教学段终点。' },
  ],

  // ---- 主导能源体系（切换改变功率增长率 growth）----
  sources: [
    { id:'fire',  name:'薪柴', era:0, growth:0.008, icon:'🔥', unlock:'初始可用',
      desc:'伐木烧火，能量回报率可观但受森林再生上限约束。',
      card:{ title:'薪柴与生物质能', body:'能量密度约 16 MJ/kg（已核实：energyeducation.ca）。EROI 约 5–15（可再生边际口径，DC4 裁决）。薪柴 EROI 不低但**可枯竭**——这是资源危机的种子。' } },
    { id:'animal', name:'畜力', era:1, growth:0.010, icon:'🐂', unlock:'科技「驯化牲畜」',
      desc:'牛马犁田，人力之外的第一块肌肉。',
      card:{ title:'畜力', body:'动物把饲料转化为做功，EROI 约 4–10。与人口争夺粮食——农耕文明第一个"能源-粮食"矛盾。' } },
    { id:'waterwheel', name:'水车', era:1, growth:0.012, icon:'⚙️', unlock:'科技「水利工程」',
      desc:'流动的水第一次成为机器。',
      card:{ title:'水车', body:'水力是前工业时代最强能源之一，水车 EROI 约 10–40，但受河段选址与枯水期限制。' } },
    { id:'sail', name:'风帆·水力', era:2, growth:0.014, icon:'🌬️', unlock:'科技「风帆与水利」',
      desc:'风与水的合流。',
      card:{ title:'风能与水力', body:'风帆把间歇的风变成动力，容量因子约 25–45%；水力（大坝）EROI 可高达 50–300（区间已核实）。' } },
    { id:'hydro', name:'水力·大坝', era:3, growth:0.016, icon:'🌊', unlock:'科技「水利工程II」',
      desc:'蓄水为坝，昼夜不息。',
      card:{ title:'水电', body:'现代水电 EROI 可达 50–300，是极高回报的能源。但大坝选址受限、生态代价大——文明的能量选择永远有代价。' } },
    { id:'steam', name:'煤炭·蒸汽', era:3, growth:0.020, icon:'🚂', unlock:'科技「蒸汽机」',
      desc:'黑金的时代开始了。',
      card:{ title:'煤炭与蒸汽', body:'煤炭能量密度约 24 MJ/kg（已核实）。历史 EROI 20–80、现代 8–30。蒸汽机把热变成功，但废热（卡诺极限）从此成为机械文明的天花板。' } },
  ],

  // ---- 科技树（线性前置，效果叠加 growth）----
  techs: [
    { id:'fire_mastery', era:0, name:'控火术',  cost:40,  prereq:[], growth:0.002,
      card:{ title:'控火', body:'人类最早的能量技术。烹饪让食物能量利用率跃升——K 指数第一次被人类亲手推动。' } },
    { id:'lang',  era:0, name:'语言',  cost:80,  prereq:['fire_mastery'], growth:0.003,
      card:{ title:'语言与知识传递', body:'知识积累是文明进化的复利引擎。没有语言，每一项发现都要重新发明。' } },
    { id:'agri',  era:0, name:'农业',  cost:150, prereq:['lang'], growth:0.005,
      card:{ title:'农业革命', body:'农业让单位土地的卡路里产量暴增，支撑人口密度跃升——文明功率自此开始指数增长。' } },
    { id:'animal_dom', era:1, name:'驯化牲畜', cost:250, prereq:[], unlock:'animal', growth:0.002,
      card:{ title:'驯化', body:'牛马驴骡——人类对动物做功的"外包"。' } },
    { id:'irrigation', era:1, name:'灌溉工程', cost:400, prereq:['animal_dom'], growth:0.004,
      card:{ title:'灌溉', body:'把水引向田地，作物产量倍增——人类最早的水利工程。' } },
    { id:'water_eng', era:1, name:'水利工程', cost:650, prereq:['irrigation'], unlock:'waterwheel', growth:0.003,
      card:{ title:'水车', body:'水轮把流动水能转成机械功，前工业时代的高效能源。' } },
    { id:'writing', era:1, name:'文字', cost:900, prereq:['water_eng'], growth:0.004,
      card:{ title:'文字', body:'文字让知识跨代累积，是"文明特质"（Prestige 系统）的现实原型——科技会忘，文字让文明长进。' } },
    { id:'metallurgy', era:2, name:'冶金', cost:1200, prereq:[], growth:0.006,
      card:{ title:'冶金', body:'青铜与铁——金属工具的能量回报远高于石器，文明进入"金属时代"。' } },
    { id:'sail_craft', era:2, name:'风帆与水利', cost:1800, prereq:['metallurgy'], unlock:'sail', growth:0.005,
      card:{ title:'风帆', body:'把风变成推力，大航海的起点。' } },
    { id:'road', era:2, name:'道路与帝国', cost:2500, prereq:['sail_craft'], growth:0.006,
      card:{ title:'道路', body:'帝国由道路维系——物流效率是文明功率的隐形倍增器。' } },
    { id:'print', era:3, name:'印刷术', cost:3500, prereq:[], growth:0.008,
      card:{ title:'印刷术', body:'古登堡印刷机（约1440）让知识传播成本骤降——科研乘数的历史原型。' } },
    { id:'dam', era:3, name:'水利工程II', cost:5000, prereq:['print'], unlock:'hydro', growth:0.006,
      card:{ title:'大坝', body:'蓄水为坝，昼夜不息——水电 EROI 可达 50–300。' } },
    { id:'steam_engine', era:3, name:'蒸汽机', cost:8000, prereq:['dam'], unlock:'steam', growth:0.008,
      card:{ title:'蒸汽机', body:'瓦特改良蒸汽机（1769）让热能规模化转为机械功。热机效率受卡诺循环限制。' } },
    { id:'factory', era:4, name:'工厂制', cost:12000, prereq:[], growth:0.010,
      card:{ title:'工厂制', body:'教学段终点：蒸汽+工厂=工业文明，K 指数奔向 0.4。' } },
  ],

  // ---- 里程碑设施（花能量扩建，成本=当前功率×秒数，效果即时 +%）----
  buildings: [
    { id:'camp',      era:0, name:'营火扩建', sec:20, pct:0.15, desc:'更多篝火，更多光。' },
    { id:'village',   era:0, name:'村落',     sec:35, pct:0.20, desc:'定居点出现。' },
    { id:'field',     era:1, name:'田亩扩张', sec:25, pct:0.15, desc:'更多土地种粮。' },
    { id:'town',      era:1, name:'城镇',     sec:40, pct:0.20, desc:'人口聚集。' },
    { id:'forge',     era:2, name:'冶炼坊',   sec:30, pct:0.15, desc:'炉火通明。' },
    { id:'port',      era:2, name:'港口',     sec:45, pct:0.20, desc:'货物与风帆。' },
    { id:'mill',      era:3, name:'水磨坊群', sec:35, pct:0.15, desc:'水轮连转。' },
    { id:'workshop',  era:3, name:'工场',     sec:50, pct:0.20, desc:'分工开始。' },
  ],

  // ---- 事件（因果链 + 选项，一次性）----
  events: [
    { id:'deforest', eraMin:0, name:'森林枯竭',
      cause:['伐木加速 → 森林覆盖率持续下降','薪柴产出开始下滑','能源危机逼近'],
      options:[
        { text:'能源转型（推荐：解锁/切换到水车畜力）', effect:{source:'waterwheel'}, result:'文明转向水与畜力，渡过危机。' },
        { text:'加大伐木（短期续命）', effect:{penalty:0.005}, result:'森林更稀，增长率 -0.005，但撑过这一代。' },
      ] },
    { id:'iceage', eraMin:1, name:'小冰期',
      cause:['全球降温 → 作物减产','人口增长停滞','社会动荡风险'],
      options:[
        { text:'修建粮仓（消耗能量储备）', effect:{penalty:0.004}, result:'粮仓救急，增长率小幅回落。' },
        { text:'向温暖地带迁徙', effect:{pct:-0.10}, result:'损失 10% 功率，但人口得以延续。' },
      ] },
    { id:'flood', eraMin:2, name:'洪水毁坝',
      cause:['暴雨 → 河流暴涨','堤坝溃决','水车群损毁'],
      options:[
        { text:'重建水利（消耗能量储备）', effect:{penalty:0.003}, result:'代价沉重，但水利恢复运转。' },
        { text:'改道农业区', effect:{penalty:0.006}, result:'田亩受损，工业转型被迫加速。' },
      ] },
  ],

  // ---- 文明特质（纪元更替时 3 选 1）----
  traits: [
    { id:'oral',      name:'口传文化',   icon:'🗣️', desc:'经验口耳相传',       growth:0.002 },
    { id:'scribes',   name:'书记制度',   icon:'📜', desc:'记录让知识复利',     growth:0.004 },
    { id:'engineer',  name:'工程师传统', icon:'⚙️', desc:'器物改变世界',       growth:0.005 },
    { id:'merchant',  name:'商路网络',   icon:'🐫', desc:'贸易带来效率',       growth:0.003 },
    { id:'warrior',   name:'尚武传统',   icon:'🗡️', desc:'竞争驱动进步',       growth:0.002 },
    { id:'farmer',    name:'农本智慧',   icon:'🌾', desc:'土地养人',           growth:0.003 },
  ],
};
