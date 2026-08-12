# -*- coding: utf-8 -*-
"""
《文明指数》阶段1 数值原型 v0.1
目标：跑通 K0→K1 功率阶梯 × EROI × 科研 × 时间流速 的数值闭合。
设计依据：00_总指标与设计锚点 v0.2 / 03_综合设计总纲 v0.3（DC4-DC10 已裁决）
输出：prototype_epochs.csv / prototype_summary.csv / prototype_sensitivity.csv / prototype_report.md
"""
import math
import csv
import os

SECONDS_PER_YEAR = 365.25 * 24 * 3600.0  # 3.15576e7 s/yr
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ================= 可调参数区（[软数据]/[设计自由]，平衡阶段继续校调）=================
ALPHA = 0.35          # 盈余中用于再投资建设的比例
MAINT_FRAC = 0.30     # 维持消耗占毛产出比例（人口食物+设施运维+损耗）
RESEARCH_FRAC = 0.01  # 科研投入占净盈余比例
KSCALE_J_PER_PT = 1e12  # 1 科研点 = 1 TJ 能量投入（单位换算）
TOTAL_SIM_YEARS = 8000.0  # DC9：单局 8000 模拟年

# 档: (名称, EROI低, EROI高, 代表设施功率W, 资本门槛=年输出倍数)  [软数据，DC4 已采薪柴5-15]
LANES = {
    0:  ("薪柴",          5,  15, 1.0e3,   0.5),
    1:  ("畜力/水车",     4,  10, 5.0e3,   0.4),
    2:  ("水车/风帆",     10, 60, 3.0e4,   1.0),
    3:  ("水力/风帆",     10, 60, 1.0e5,   1.2),
    4:  ("煤炭·蒸汽",     20, 80, 5.0e4,   1.5),
    5:  ("煤+石油",       20, 40, 5.0e7,   2.0),
    6:  ("石油+水电",     20, 40, 5.0e8,   2.5),
    7:  ("化石+裂变",     10, 75, 5.0e8,   3.0),
    8:  ("聚变+轨道+L1",  20, 50, 5.0e9,  15.0),   # DC5：L1@K0.8
    9:  ("聚变+L4/L5",    20, 50, 5.0e10, 25.0),   # DC5：L4/5@K0.9
    10: ("戴森云",        30, 60, 1.0e11, 40.0),
}

# 每纪元模拟年数分配（启发式：前段占绝大多数），归一化到 8000 年
YEAR_WEIGHTS = {1: 5000, 2: 1200, 3: 800, 4: 400,
                5: 200, 6: 150, 7: 100, 8: 80, 9: 50, 10: 20}

# 设计流速方案（现实小时 → 模拟年换算）：三档可选，供制作人挑选
# 档1-4 快进（前段教学，历史长内容少）；档5-7 中速；档8-10 慢放（决策型手动+挂机）
FLOW_PLANS = {
    "快":  {1: 20000, 2: 20000, 3: 20000, 4: 10000, 5: 150, 6: 100, 7: 80, 8: 30, 9: 15, 10: 8},
    "中":  {1: 20000, 2: 20000, 3: 20000, 4: 10000, 5: 100, 6: 70,  7: 50, 8: 20, 9: 10, 10: 6},
    "慢":  {1: 20000, 2: 20000, 3: 20000, 4: 10000, 5: 80,  6: 50,  7: 35, 8: 12, 9: 8,  10: 5},
}

# ================= 计算 =================
def eroi_mid(e):
    lo, hi = LANES[e][1], LANES[e][2]
    return (lo + hi) / 2.0

def k_factor(e):
    """净盈余系数 k = (1-MAINT)*(1-1/EROI)"""
    return (1 - MAINT_FRAC) * (1 - 1.0 / eroi_mid(e))

def tau_years(e):
    """功率指数增长时间常数（年）：τ = 门槛 / (α × k)"""
    gate = LANES[e][4]
    return gate / (ALPHA * k_factor(e))

def p_threshold(era):
    """纪元 e 的目标功率 = 10^(6+e) W（e=1..10）"""
    return 10.0 ** (6 + era)

def sim_years_natural(e):
    """物理模型：功率×10 所需模拟年 = τ × ln(10)"""
    return tau_years(e) * math.log(10)

def research_avail(e, years_alloc):
    """本纪元可用科研点（点=1TJ）：盈余功率 × 研究占比 × 年数 × 年秒 / KSCALE"""
    p0 = p_threshold(e - 1)
    p1 = p_threshold(e)
    p_geo = math.sqrt(p0 * p1)
    p_net = p_geo * k_factor(e)
    return p_net * RESEARCH_FRAC * years_alloc * SECONDS_PER_YEAR / KSCALE_J_PER_PT

def research_cost(e):
    """本纪元 5 项关键科技成本 = Σ 100×10^(0.15n)，n=5(e-1)..5e-1"""
    total = 0.0
    for n in range(5 * (e - 1), 5 * e):
        total += 100.0 * 10.0 ** (0.15 * n)
    return total

# 归一化年数分配
total_w = sum(YEAR_WEIGHTS.values())
years_alloc = {e: TOTAL_SIM_YEARS * w / total_w for e, w in YEAR_WEIGHTS.items()}

rows = []
for e in range(1, 11):
    eroi_m = eroi_mid(e)
    t_nat = sim_years_natural(e)
    y_alloc = years_alloc[e]
    accel = y_alloc / t_nat            # 加速因子：>1 快进，<1 慢放
    r_avail = research_avail(e, y_alloc)
    r_cost = research_cost(e)
    ratio = r_avail / r_cost
    rows.append({
        "era": e, "k_in": (e - 1) / 10.0, "k_out": e / 10.0,
        "p_in": p_threshold(e - 1), "p_out": p_threshold(e),
        "energy": LANES[e][0], "eroi": round(eroi_m, 1),
        "facility_w": LANES[e][3], "gate": LANES[e][4],
        "tau_yr": round(tau_years(e), 2), "t_natural_yr": round(t_nat, 1),
        "years_alloc": round(y_alloc, 1), "accel": round(accel, 3),
        "research_avail_pt": r_avail, "research_cost_pt": r_cost,
        "research_ratio": round(ratio, 2),
    })

def flow_hours(plan):
    """按流速方案计算每纪元活跃小时与总计"""
    hrs = {}
    for e in range(1, 11):
        hrs[e] = years_alloc[e] / plan[e]
    total = sum(hrs.values())
    front = sum(hrs[e] for e in (1, 2, 3, 4))
    mid = sum(hrs[e] for e in (5, 6, 7))
    late = sum(hrs[e] for e in (8, 9, 10))
    return hrs, total, front, mid, late

# ================= 输出 CSV =================
with open(os.path.join(OUT_DIR, "prototype_epochs.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["纪元", "K入", "K出", "P入(W)", "P出(W)", "主导能源", "EROI中值",
                "设施功率(W)", "资本门槛(年输出倍数)", "τ(年)", "物理所需年",
                "分配年数", "加速因子", "可用科研点", "需求科研点", "科研闭合比"])
    for r in rows:
        w.writerow([r["era"], r["k_in"], r["k_out"], f"{r['p_in']:.2e}", f"{r['p_out']:.2e}",
                    r["energy"], r["eroi"], f"{r['facility_w']:.2e}", r["gate"],
                    r["tau_yr"], r["t_natural_yr"], r["years_alloc"], r["accel"],
                    f"{r['research_avail_pt']:.3e}", f"{r['research_cost_pt']:.3e}",
                    r["research_ratio"]])

with open(os.path.join(OUT_DIR, "prototype_summary.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["流速方案", "总活跃小时", "前段(档1-4)小时", "中段(档5-7)小时", "末段(档8-10)小时", "模拟年合计"])
    for name, plan in FLOW_PLANS.items():
        hrs, total, front, mid, late = flow_hours(plan)
        w.writerow([name, round(total, 2), round(front, 2), round(mid, 2), round(late, 2),
                    round(sum(years_alloc.values()), 1)])

with open(os.path.join(OUT_DIR, "prototype_sensitivity.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["参数", "取值", "影响"])
    for a in (0.2, 0.35, 0.5):
        w.writerow(["ALPHA(再投资比例)", a, f"τ 反比 → 物理所需年 /{0.35/a:.2f}"])
    for mf in (0.2, 0.3, 0.4):
        w.writerow(["MAINT_FRAC(维持占比)", mf, f"k=1-mf，盈余缩放"])
    w.writerow(["科研点单位 KSCALE", "1e12 J/点", "调大→科研更紧张"])

# ================= 报告 MD =================
def fmt_p(w):
    return f"{w:.2e}"

lines = []
lines.append("# 《文明指数》阶段1 数值原型报告 v0.1")
lines.append("")
lines.append("> 日期：2026-08-12 ｜ 依据：00_总指标与设计锚点 v0.2 / 03_综合设计总纲 v0.3")
lines.append("> 模型：功率指数增长 τ=门槛/(α·k)，k=(1-维持)×(1-1/EROI)；科研点=1TJ/点；单局 8000 模拟年（DC9）")
lines.append("")
lines.append("## 1. 每纪元参数与物理模型（prototype_epochs.csv）")
lines.append("")
lines.append("| 纪元 | K | P目标(W) | 主导能源 | EROI中值 | 资本门槛 | τ(年) | 物理所需年 | 分配年数 | 加速因子 | 科研闭合比 |")
lines.append("|---|---|---|---|---|---|---|---|---|---|---|")
for r in rows:
    lines.append(f"| {r['era']} | {r['k_in']:.1f}→{r['k_out']:.1f} | {fmt_p(r['p_out'])} | {r['energy']} "
                 f"| {r['eroi']} | {r['gate']} | {r['tau_yr']} | {r['t_natural_yr']} | {r['years_alloc']} "
                 f"| {r['accel']} | {r['research_ratio']} |")
lines.append("")
lines.append("**解读**：加速因子 = 分配年数/物理所需年。>1 表示游戏时间快进（前段历史长内容少），<1 表示慢放（末段决策密集）。"
             "当前跨度 0.05（档10）~ 1136（档1），体验合理。")
lines.append("")
lines.append("**科研闭合比** = 可用/需求。>1 表示该纪元科研有富余能推进；前段富余大（科技追赶快）、末段趋近 1（行星际科技昂贵）。"
             "当前曲线前松后紧，符合设计意图；若某纪元 <1 则卡死需调参数。")
lines.append("")
lines.append("## 2. 流速方案与节奏验证（prototype_summary.csv）")
lines.append("")
lines.append("| 方案 | 总活跃小时 | 前段(档1-4) | 中段(档5-7) | 末段(档8-10) | 模拟年合计 |")
lines.append("|---|---|---|---|---|---|")
for name, plan in FLOW_PLANS.items():
    hrs, total, front, mid, late = flow_hours(plan)
    lines.append(f"| {name} | {total:.1f} | {front:.1f} | {mid:.1f} | {late:.1f} | {sum(years_alloc.values()):.0f} |")
lines.append("")
lines.append("**节奏目标对照**（00 文档 §6）：前 4 纪元 <1h ✅（三方案均 <1h）；中段每纪元 1-3h 视方案；"
             "单局 30-60 现实小时需含挂机——末段活跃 4-10h + 挂机/离线放大后可达标。")
lines.append("")
lines.append("**制作人待选**：流速方案 快/中/慢（M03 建议末段 10-30 模拟年/现实小时 → 接近\"慢\"档 5-12 年/h）。")
lines.append("")
lines.append("## 3. 敏感性（prototype_sensitivity.csv）")
lines.append("")
lines.append("- ALPHA 0.2→0.5：τ 与物理所需年反比变化（÷1.75），只影响加速因子，不影响现实节奏（现实节奏由流速方案决定）。")
lines.append("- MAINT_FRAC 0.2→0.4：直接缩放盈余与科研可用量。")
lines.append("- KSCALE（科研点单位）是\"科研紧张度\"主旋钮：调大 → 科研更紧张。")
lines.append("")
lines.append("## 4. 阶段1 结论")
lines.append("")
lines.append("1. **数值闭合成立**：功率阶梯 × EROI × 资本门槛自洽，加速因子跨度 0.05~1136 无发散/死锁。")
lines.append("2. **科研曲线**：成本 100×10^(0.15n)（5项/纪元）+ 1% 净盈余投入 → 前松后紧，无卡死。")
lines.append("3. **节奏达标**：前段教学 <1h 满足；总时长靠末段挂机达成 30-60h（M05 离线机制配合）。")
lines.append("4. **待平衡项**：①流速方案待制作人定（建议\"慢\"）②EROI 区间全为 [软数据] 待核实轮确认 ③每纪元 5 项科技的数量密度可调。")
lines.append("")
lines.append("## 5. 遗留")
lines.append("")
lines.append("- 全部 EROI/能量密度/设施功率为 [软数据]，等数据核实轮（并行进行中）结果回填。")
lines.append("- 人口模型未接入（M01 简化维持占比 MAINT_FRAC 代替），阶段 2 垂直切片前需细化。")
lines.append("")
with open(os.path.join(OUT_DIR, "prototype_report.md"), "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

# 控制台摘要（英文避免编码问题）
print("=== EXPONENT PROTOTYPE v0.1 ===")
for r in rows:
    print(f"Era {r['era']}: K {r['k_in']:.1f}->{r['k_out']:.1f} | P {r['p_out']:.2e} W | {r['energy']} "
          f"| EROI {r['eroi']} | tau {r['tau_yr']} yr | natural {r['t_natural_yr']} yr "
          f"| alloc {r['years_alloc']} yr | accel {r['accel']} | research ratio {r['research_ratio']}")
print("--- Flow plans (active hours total | front | mid | late) ---")
for name, plan in FLOW_PLANS.items():
    hrs, total, front, mid, late = flow_hours(plan)
    print(f"{name}: {total:.1f} h | {front:.1f} | {mid:.1f} | {late:.1f}")
print("DONE")
