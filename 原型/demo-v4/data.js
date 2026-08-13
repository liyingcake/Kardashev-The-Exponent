/* ============================================================
 * 《文明指数》demo-v4 — 数据层 data.js
 * 统合乘数 · 能量利用：节点=功能管线（采集→加工→定居→收集），
 * 一个可分解小乘数（整合×规模×技术×国策）衡量文明效率。
 * ============================================================ */
const DATA = {
  eras: [
    { id:0, name:'火种',     k:0.0, p:1e6,  icon:'🔥', desc:'第一堆火，第一顿饭。' },
    { id:1, name:'农耕',     k:0.1, p:1e7,  icon:'🌾', desc:'定居、耕作、熟食。' },
    { id:2, name:'青铜·铁器', k:0.2, p:1e8, icon:'⚒️', desc:'加工技艺成熟。' },
    { id:3, name:'前工业',   k:0.3, p:1e9,  icon:'⛵', desc:'水力与风帆。' },
    { id:4, name:'早期工业', k:0.4, p:1e10, icon:'🏭', desc:'规模经济的黎明。' },
  ],

  // ---- 全局数值锚点（[软数据]，MVP 定标）----
  ENERGY_PER_COOKED: 3.4e5,  // 每单位熟食承载的"有用能量"(J)——K 指数的 P = 定居消费速率 × 此值
  foodPerPop: 0.03,          // 每人口每秒吃掉的熟食
  laborPerPop: 25,           // 每 25 人口出 1 劳动力
  techPerFood: 0.5,          // 每单位熟食消费产出的科研点

  // ---- 商品（加工品与原料）----
  goods: {
    raw_food:    { name:'生食', icon:'🥬', cap:120 },
    wood:        { name:'木柴', icon:'🪵', cap:120 },
    cooked_food: { name:'熟食', icon:'🍲', cap:120 },
  },

  // ---- 节点 = 功能管线 ----
  // cat: gather 采集 / process 加工(能量在此被利用) / settle 定居(消费端) / collect 收集(窗口)
  // 建造 cost 用「熟食」计价 = 盈余投资（维3 运营）
  nodes: {
    forest: { cat:'gather', name:'森林采集', icon:'🌲', out:{ raw_food:2.0, wood:1.0 }, workers:2, cost:15, color:'#2f8f4f',
      card:{ title:'采集 · 第一环', body:'采集生食与木柴。是产业链的物质源头。' } },
    farm:   { cat:'gather', name:'农田', icon:'🌾', out:{ raw_food:3.0 }, workers:1, cost:20, tech:'agri', color:'#2f8f4f',
      card:{ title:'农业', body:'只产生食、不产木柴——需要森林提供燃料，供需要配平。' } },
    hearth: { cat:'process', name:'灶火烹饪', icon:'🔥', in:{ raw_food:2, wood:1 }, out:{ cooked_food:3 }, workers:1, cost:25, eroi:6, color:'#c84848',
      card:{ title:'能量利用', body:'木柴(燃料)+生食(原料)→熟食(加工品)。能量被"利用"而非"烧掉"——EROI≈6。' } },
    // settle / collect 是固定存在（非建造），见 game.js seed
  },

  // ---- 科技（解锁配方/提效，技术乘数因子）----
  techs: [
    { id:'fire', name:'控火术', icon:'🔥', cost:40,  node:'hearth', mult:1.2,
      card:{ title:'控火', body:'灶火产出 ×1.2。' } },
    { id:'agri', name:'农业', icon:'🌾', cost:150, unlock:'farm', node:'farm', mult:1.3,
      card:{ title:'农业', body:'解锁农田；农田产出 ×1.3。' } },
    { id:'cooking', name:'烹饪术', icon:'🍲', cost:300, node:'hearth', mult:1.25,
      card:{ title:'烹饪', body:'灶火产出 ×1.25（配方升级）。' } },
    { id:'irrigation', name:'灌溉', icon:'💧', cost:400, node:'farm', mult:1.5,
      card:{ title:'灌溉', body:'农田产出 ×1.5。' } },
  ],

  // ---- 国策（至多 2 条，乘数里的"国策"因子）----
  creeds: [
    { id:'agrarian',   name:'重农', icon:'🌾', desc:'农田产出 ×1.5', node:'farm', mult:1.5 },
    { id:'industrial', name:'尚工', icon:'🏭', desc:'加工产出 ×1.2', node:'hearth', mult:1.2 },
    { id:'scientific', name:'崇尚科学', icon:'🔬', desc:'科研 ×1.3', research:1.3 },
  ],
};
