# Exponent Prototype v0.1 - ASCII only (PS 5.1 compatible)
$ErrorActionPreference = 'Stop'
$OutDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ---------- Parameters (soft data / design freedom) ----------
$ALPHA = 0.35          # surplus reinvest ratio
$MAINT_FRAC = 0.30     # maintenance fraction of gross output
$RESEARCH_FRAC = 0.01  # research share of net surplus
$KSCALE = 1e12         # Joules per research point (1 TJ)
$SECONDS_PER_YEAR = 365.25 * 24 * 3600.0
$TOTAL_SIM_YEARS = 8000.0   # DC9 ruling

# Lane: era -> (name, EROI_lo, EROI_hi, facility_power_W, capital_gate=years_of_output)
$Lanes = @(
    @('Firewood',       5,  15, 1.0e3,   0.5),
    @('Draft/Water',    4,  10, 5.0e3,   0.4),
    @('Waterwheel',     10, 60, 3.0e4,   1.0),
    @('Hydro/Sail',     10, 60, 1.0e5,   1.2),
    @('Coal/Steam',     20, 80, 5.0e4,   1.5),
    @('Coal+Oil',       20, 40, 5.0e7,   2.0),
    @('Oil+Hydro',      20, 40, 5.0e8,   2.5),
    @('FissionMix',     10, 75, 5.0e8,   3.0),
    @('Fusion+L1',      20, 50, 5.0e9,  15.0),
    @('Fusion+L4/L5',   20, 50, 5.0e10, 25.0),
    @('DysonCloud',     30, 60, 1.0e11, 40.0)
)

# Sim-year allocation weights per era (heuristic), normalized to 8000
$YearWeights = @{1=5000; 2=1200; 3=800; 4=400; 5=200; 6=150; 7=100; 8=80; 9=50; 10=20}

# Flow plans (sim-years per real hour), 3 options
$FlowPlans = @{
    Fast   = @{1=20000; 2=20000; 3=20000; 4=10000; 5=150; 6=100; 7=80; 8=30; 9=15; 10=8}
    Normal = @{1=20000; 2=20000; 3=20000; 4=10000; 5=100; 6=70;  7=50; 8=20; 9=10; 10=6}
    Slow   = @{1=20000; 2=20000; 3=20000; 4=10000; 5=80;  6=50;  7=35; 8=12; 9=8;  10=5}
}

# ---------- Helpers ----------
function Get-EroiMid([int]$e) { ($Lanes[$e][1] + $Lanes[$e][2]) / 2.0 }
function Get-KFactor([int]$e) { (1.0 - $MAINT_FRAC) * (1.0 - 1.0 / (Get-EroiMid $e)) }
function Get-TauYears([int]$e) { $Lanes[$e][4] / ($ALPHA * (Get-KFactor $e)) }
function Get-PTarget([int]$era) { [math]::Pow(10.0, 6.0 + $era) }
function Get-SimYearsNatural([int]$e) { (Get-TauYears $e) * [math]::Log(10.0) }
function Get-ResearchAvail([int]$e, [double]$years) {
    $p0 = Get-PTarget ($e - 1); $p1 = Get-PTarget $e
    $pGeo = [math]::Sqrt($p0 * $p1)
    return $pGeo * (Get-KFactor $e) * $RESEARCH_FRAC * $years * $SECONDS_PER_YEAR / $KSCALE
}
function Get-ResearchCost([int]$e) {
    $total = 0.0
    for ($n = 5 * ($e - 1); $n -lt 5 * $e; $n++) { $total += 100.0 * [math]::Pow(10.0, 0.15 * $n) }
    return $total
}

# ---------- Normalize years ----------
$tw = 0.0
for ($e = 1; $e -le 10; $e++) { $tw += $YearWeights[$e] }
$YearsAlloc = @{}
for ($e = 1; $e -le 10; $e++) { $YearsAlloc[$e] = $TOTAL_SIM_YEARS * $YearWeights[$e] / $tw }

# ---------- Compute eras ----------
$rows = @()
for ($e = 1; $e -le 10; $e++) {
    $eroi = Get-EroiMid $e
    $tNat = Get-SimYearsNatural $e
    $yAlloc = $YearsAlloc[$e]
    $accel = $yAlloc / $tNat
    $rAvail = Get-ResearchAvail $e $yAlloc
    $rCost = Get-ResearchCost $e
    $rows += [pscustomobject]@{
        Era=$e; KIn=(($e-1)/10.0); KOut=($e/10.0)
        PIn=(Get-PTarget ($e-1)); POut=(Get-PTarget $e)
        Energy=$Lanes[$e][0]; Eroi=$eroi; FacW=$Lanes[$e][3]; Gate=$Lanes[$e][4]
        Tau=(Get-TauYears $e); TNatural=$tNat; YAlloc=$yAlloc; Accel=$accel
        RAvail=$rAvail; RCost=$rCost; RRatio=($rAvail/$rCost)
    }
}

# ---------- CSV: epochs ----------
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("era,k_in,k_out,p_in,p_out,energy,eroi,facility_w,gate,tau_yr,t_natural_yr,years_alloc,accel,research_avail_pt,research_cost_pt,research_ratio")
foreach ($r in $rows) {
    [void]$sb.AppendLine(( "{0},{1:F1},{2:F1},{3:E2},{4:E2},{5},{6:F1},{7:E2},{8:F1},{9:F2},{10:F1},{11:F1},{12:F3},{13:E3},{14:E3},{15:F2}" -f `
        $r.Era,$r.KIn,$r.KOut,$r.PIn,$r.POut,$r.Energy,$r.Eroi,$r.FacW,$r.Gate,$r.Tau,$r.TNatural,$r.YAlloc,$r.Accel,$r.RAvail,$r.RCost,$r.RRatio ))
}
[System.IO.File]::WriteAllText((Join-Path $OutDir 'prototype_epochs.csv'), $sb.ToString(), (New-Object System.Text.UTF8Encoding $true))

# ---------- CSV: flow plans ----------
function Get-FlowHours($plan) {
    $total = 0.0; $front = 0.0; $mid = 0.0; $late = 0.0
    for ($e = 1; $e -le 10; $e++) {
        $h = $YearsAlloc[$e] / $plan[$e]
        $total += $h
        if ($e -le 4) { $front += $h } elseif ($e -le 7) { $mid += $h } else { $late += $h }
    }
    return @($total, $front, $mid, $late)
}
$sb2 = New-Object System.Text.StringBuilder
[void]$sb2.AppendLine("plan,total_active_h,front_era1_4_h,mid_era5_7_h,late_era8_10_h,total_sim_years")
foreach ($name in @('Fast','Normal','Slow')) {
    $res = Get-FlowHours $FlowPlans[$name]
    [void]$sb2.AppendLine(( "{0},{1:F2},{2:F2},{3:F2},{4:F2},{5:F0}" -f $name,$res[0],$res[1],$res[2],$res[3],(($YearsAlloc.Values | Measure-Object -Sum).Sum) ))
}
[System.IO.File]::WriteAllText((Join-Path $OutDir 'prototype_summary.csv'), $sb2.ToString(), (New-Object System.Text.UTF8Encoding $true))

# ---------- Sensitivity ----------
$sb3 = New-Object System.Text.StringBuilder
[void]$sb3.AppendLine("param,value,effect")
foreach ($a in @(0.2, 0.35, 0.5)) { [void]$sb3.AppendLine(( "ALPHA,{0:F2},tau_inverse_times_{1:F2}" -f $a, (0.35/$a) )) }
foreach ($mf in @(0.2, 0.3, 0.4)) { [void]$sb3.AppendLine(( "MAINT_FRAC,{0:F1},k_scale_net" -f $mf )) }
[void]$sb3.AppendLine("KSCALE_J_PER_PT,1e12,research_tension_knob")
[System.IO.File]::WriteAllText((Join-Path $OutDir 'prototype_sensitivity.csv'), $sb3.ToString(), (New-Object System.Text.UTF8Encoding $true))

# ---------- Console summary ----------
Write-Output '=== EXPONENT PROTOTYPE v0.1 ==='
foreach ($r in $rows) {
    Write-Output ("Era {0}: K {1:F1}->{2:F1} | P {3:E2} W | {4} | EROI {5:F1} | tau {6:F2} yr | natural {7:F1} yr | alloc {8:F1} yr | accel {9:F3} | res_ratio {10:F2}" -f `
        $r.Era,$r.KIn,$r.KOut,$r.POut,$r.Energy,$r.Eroi,$r.Tau,$r.TNatural,$r.YAlloc,$r.Accel,$r.RRatio)
}
Write-Output '--- Flow plans (total | front | mid | late) active hours ---'
foreach ($name in @('Fast','Normal','Slow')) {
    $res = Get-FlowHours $FlowPlans[$name]
    Write-Output ("{0}: {1:F1} h | {2:F1} | {3:F1} | {4:F1}" -f $name,$res[0],$res[1],$res[2],$res[3])
}
Write-Output 'DONE'
