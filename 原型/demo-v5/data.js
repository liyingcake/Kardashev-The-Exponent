/* ============================================================
 * 《文明指数》demo-v5 — 数据层 data.js
 * 节点窗口 × 通配符 × 策略权重
 * 抽象资源 = 带标签的流（domain:stage），通配符匹配，
 * 节点 = 可配置窗口（输入/输出通配符 + 策略权重滑块）。
 * ============================================================ */
const DATA = {
  eras: [
    { id:0, name:'火种',     k:0.0, p:1e6,  icon:'🔥', desc:'第一次逆熵：把混沌变成光与热。' },
    { id:1, name:'农耕',     k:0.1, p:1e7,  icon:'🌾', desc:'定居，让逆熵有了规模。' },
    { id:2, name:'青铜·铁器', k:0.2, p:1e8, icon:'⚒️', desc:'加工技艺成熟。' },
    { id:3, name:'前工业',   k:0.3, p:1e9,  icon:'⛵', desc:'水力与风帆。' },
    { id:4, name:'早期工业', k:0.4, p:1e10, icon:'🏭', desc:'规模逆熵的黎明。' },
  ],

  // ---- 标签维度 ----
  domains: ['matter', 'energy', 'info'],
  stages:  ['raw', 'refined', 'useful', 'waste'],

  // 每个流的显示名（domain:stage → 名称+图标+颜色）
  streamNames: {
    'matter:raw':    { name:'物质·原料', icon:'🪨', color:'#8fa2cd' },
    'matter:refined':{ name:'物质·精炼', icon:'🔩', color:'#c6d4f2' },
    'matter:useful': { name:'物质·有用', icon:'🏗️', color:'#e8f0ff' },
    'matter:waste':  { name:'物质·废渣', icon:'🗑️', color:'#6f82ae' },
    'energy:raw':    { name:'能量·原料', icon:'🪵', color:'#d9a05a' },
    'energy:refined':{ name:'能量·精炼', icon:'⚡', color:'#ffd97a' },
    'energy:useful': { name:'能量·有用', icon:'🔆', color:'#ffe9a8' },
    'energy:waste':  { name:'能量·废热', icon:'🌡️', color:'#ff8a5d' },
    'info:raw':      { name:'信息·原料', icon:'📜', color:'#9fb2dd' },
    'info:refined':  { name:'信息·精炼', icon:'📚', color:'#b8c6e8' },
    'info:useful':   { name:'信息·有用', icon:'💡', color:'#53d8ff' },
    'info:waste':    { name:'信息·噪声', icon:'📉', color:'#7184af' },
  },

  // ---- 窗口模板（五类，按逆熵链位置分类）----
  // input/output = 通配符；weights = 策略权重（name/作用域）
  windows: {
    source: { name:'采集窗口', icon:'⛏️', color:'#2f8f4f',
      input: null, output: 'matter:raw', secondOutput: 'energy:raw', outputRatio: 0.7,
      desc:'从环境获取原料，是逆熵链的物质源头。',
      weights: [{ key:'yield', name:'产出速率', min:0, max:100 }],
    },
    process: { name:'加工窗口', icon:'🔥', color:'#c84848',
      input: '*:raw', output: 'energy:useful', waste: 'energy:waste',
      desc:'逆熵转化——能量在此被"利用"，必然产生废热。',
      weights: [
        { key:'efficiency', name:'逆熵效率', min:0, max:100 },
        { key:'throughput', name:'吞吐规模', min:0, max:100 },
      ],
    },
    route: { name:'路由窗口', icon:'🔀', color:'#53d8ff',
      input: '*:*', output: '*:*',
      desc:'分配/运输，带吞吐容量。',
      weights: [{ key:'throughput', name:'吞吐容量', min:0, max:100 }],
    },
    settle: { name:'消费窗口', icon:'🏘️', color:'#8f6fd8',
      input: 'energy:useful', output: 'info:useful',
      desc:'定居点消费有用能量，产出劳动力与科技。',
      weights: [
        { key:'growth', name:'人口增长', min:0, max:100 },
        { key:'research', name:'科研倾向', min:0, max:100 },
      ],
    },
    collect: { name:'收集窗口', icon:'🗃️', color:'#ffd97a',
      input: '*:*', output: null,
      desc:'汇总一切，承载 K 指数与统一乘数。',
      weights: [],
    },
  },

  // ---- 通配符匹配（pattern → 谓词）----
  // 语法：* ｜ domain:* ｜ *:stage ｜ domain:stage

  // ---- 国策（全局倾向，映射为对某类窗口的加成）----
  creeds: [
    { id:'extractor',  name:'开采者', icon:'⛏️', desc:'采集窗口产出 ×1.4',  win:'source',  mult:1.4 },
    { id:'refiner',    name:'精炼者', icon:'🔥', desc:'加工窗口 EROI ×1.2',  win:'process', mult:1.2 },
    { id:'settler',    name:'定居者', icon:'🏘️', desc:'消费窗口产出 ×1.3',  win:'settle',  mult:1.3 },
    { id:'scholar',    name:'求索者', icon:'💡', desc:'科研 ×1.3',          research:1.3 },
  ],

  // ---- 科技（解锁新窗口/升级窗口，技术乘数）----
  techs: [
    { id:'fire',   name:'控火', icon:'🔥', cost:40,  win:'process', mult:1.2, desc:'加工窗口效率 ×1.2' },
    { id:'irrig',  name:'灌溉', icon:'💧', cost:150, win:'source',  mult:1.5, desc:'采集窗口产出 ×1.5' },
    { id:'writing',name:'文字', icon:'📜', cost:300, win:'settle',  mult:1.4, desc:'消费窗口产出 ×1.4' },
    { id:'smith',  name:'冶金', icon:'⚒️', cost:500, win:'process', mult:1.3, desc:'加工窗口效率 ×1.3' },
  ],
};
