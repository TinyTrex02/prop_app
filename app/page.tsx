"use client";

import { useMemo, useState } from "react";

type Config = {
  propSize: number;
  evalTargetPct: number;
  evalMaxLossPct: number;
  evalDailyLossPct: number;
  evalFee: number;
  evalTradesMax: number;
  evalRiskPct: number;
  evalWinRate: number;
  evalRR: number;
  evalTradeCost: number;
  fundedTargetPct: number;
  fundedMaxLossPct: number;
  fundedDailyLossPct: number;
  fundedTradesMax: number;
  fundedRiskPct: number;
  fundedWinRate: number;
  fundedRR: number;
  fundedTradeCost: number;
  profitSplitPct: number;
  payoutFee: number;
  payoutDelayTrades: number;
  evalHedgeRatio: number;
  fundedHedgeRatio: number;
  hedgeCostPerTrade: number;
  hedgeFixedCost: number;
  simulations: number;
  seed: number;
  maxHedgeRatio: number;
  gridSteps: number;
  objective: "expected" | "maximin" | "riskAdjusted" | "positive";
};

type Outcome = {
  terminal: "evaluation_failed" | "funded_failed" | "funded_paid";
  propPnl: number;
  hedgePnl: number;
  fees: number;
  net: number;
  trades: number;
};

const defaults: Config = {
  propSize: 5000,
  evalTargetPct: 10,
  evalMaxLossPct: 6,
  evalDailyLossPct: 0,
  evalFee: 40,
  evalTradesMax: 100,
  evalRiskPct: 1,
  evalWinRate: 50,
  evalRR: 1,
  evalTradeCost: 0,
  fundedTargetPct: 6,
  fundedMaxLossPct: 6,
  fundedDailyLossPct: 0,
  fundedTradesMax: 100,
  fundedRiskPct: 1,
  fundedWinRate: 50,
  fundedRR: 1,
  fundedTradeCost: 0,
  profitSplitPct: 80,
  payoutFee: 0,
  payoutDelayTrades: 0,
  evalHedgeRatio: 0.12,
  fundedHedgeRatio: 0.4,
  hedgeCostPerTrade: 0,
  hedgeFixedCost: 0,
  simulations: 12000,
  seed: 42,
  maxHedgeRatio: 2,
  gridSteps: 21,
  objective: "riskAdjusted"
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function simulatePhase(
  cfg: Config,
  rng: () => number,
  phase: "eval" | "funded",
  hedgeRatio: number
) {
  const isEval = phase === "eval";
  const target = cfg.propSize * (isEval ? cfg.evalTargetPct : cfg.fundedTargetPct) / 100;
  const maxLoss = cfg.propSize * (isEval ? cfg.evalMaxLossPct : cfg.fundedMaxLossPct) / 100;
  const dailyLossPct = isEval ? cfg.evalDailyLossPct : cfg.fundedDailyLossPct;
  const dailyLoss = dailyLossPct > 0 ? cfg.propSize * dailyLossPct / 100 : Infinity;
  const risk = cfg.propSize * (isEval ? cfg.evalRiskPct : cfg.fundedRiskPct) / 100;
  const winRate = (isEval ? cfg.evalWinRate : cfg.fundedWinRate) / 100;
  const rr = isEval ? cfg.evalRR : cfg.fundedRR;
  const tradeCost = isEval ? cfg.evalTradeCost : cfg.fundedTradeCost;
  const maxTrades = isEval ? cfg.evalTradesMax : cfg.fundedTradesMax;

  let propPnl = 0;
  let hedgePnl = 0;
  let dayPnl = 0;
  let trades = 0;
  let dayTrades = 0;

  while (trades < maxTrades && propPnl < target && propPnl > -maxLoss) {
    if (dayTrades >= 5) {
      dayPnl = 0;
      dayTrades = 0;
    }
    const gross = rng() < winRate ? risk * rr : -risk;
    const netTrade = gross - tradeCost;
    propPnl += netTrade;
    hedgePnl -= netTrade * hedgeRatio;
    dayPnl += netTrade;
    trades += 1;
    dayTrades += 1;
    if (dailyLoss !== Infinity && dayPnl <= -dailyLoss) break;
  }

  const success = propPnl >= target;
  const failed = propPnl <= -maxLoss || (dailyLoss !== Infinity && dayPnl <= -dailyLoss) || (!success && trades >= maxTrades);
  return { success, failed: !success, propPnl, hedgePnl, trades };
}

function runSimulations(cfg: Config, evalRatio: number, fundedRatio: number): Outcome[] {
  const rng = makeRng(cfg.seed);
  const results: Outcome[] = [];
  for (let i = 0; i < cfg.simulations; i++) {
    const ev = simulatePhase(cfg, rng, "eval", evalRatio);
    const evalHedgeCost = cfg.hedgeFixedCost + ev.trades * cfg.hedgeCostPerTrade;
    if (!ev.success) {
      results.push({
        terminal: "evaluation_failed",
        propPnl: ev.propPnl,
        hedgePnl: ev.hedgePnl,
        fees: cfg.evalFee + evalHedgeCost,
        net: ev.hedgePnl - cfg.evalFee - evalHedgeCost,
        trades: ev.trades
      });
      continue;
    }

    const funded = simulatePhase(cfg, rng, "funded", fundedRatio);
    const fundedHedgeCost = cfg.hedgeFixedCost + funded.trades * cfg.hedgeCostPerTrade;
    const paid = funded.success;
    const payout = paid ? Math.max(0, funded.propPnl) * cfg.profitSplitPct / 100 - cfg.payoutFee : 0;
    const hedge = ev.hedgePnl + funded.hedgePnl;
    const fees = cfg.evalFee + evalHedgeCost + fundedHedgeCost + (paid ? cfg.payoutFee : 0);
    results.push({
      terminal: paid ? "funded_paid" : "funded_failed",
      propPnl: ev.propPnl + funded.propPnl,
      hedgePnl: hedge,
      fees,
      net: payout + hedge - cfg.evalFee - evalHedgeCost - fundedHedgeCost - (paid ? cfg.payoutFee : 0),
      trades: ev.trades + funded.trades
    });
  }
  return results;
}

function stats(outcomes: Outcome[]) {
  const sorted = outcomes.map(o => o.net).sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);
  const variance = sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, sorted.length);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
  const count = (t: Outcome["terminal"]) => outcomes.filter(o => o.terminal === t).length / Math.max(1, outcomes.length);
  return {
    mean, sd: Math.sqrt(variance), median: pct(.5), p5: pct(.05), p95: pct(.95),
    evalFail: count("evaluation_failed"), fundedFail: count("funded_failed"), payout: count("funded_paid"),
    worst: sorted[0] ?? 0, best: sorted[sorted.length - 1] ?? 0
  };
}

function score(s: ReturnType<typeof stats>, objective: Config["objective"]) {
  if (objective === "expected") return s.mean;
  if (objective === "maximin") return s.p5;
  if (objective === "positive") return s.mean * (s.mean > 0 ? 1 : 0) + (s.p5 > 0 ? 0.001 : 0);
  return s.mean - 0.75 * s.sd;
}

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function Field({ label, value, onChange, step = 1, min = 0, max = 100, suffix = "", help }: {
  label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; suffix?: string; help?: string;
}) {
  return <label className="field">
    <span>{label}</span>
    <div className="inputWrap"><input type="number" value={value} min={min} max={max} step={step}
      onChange={e => onChange(Number(e.target.value))} /><small>{suffix}</small></div>
    {help && <em>{help}</em>}
  </label>;
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return <section className="panel"><div className="sectionHead"><h2>{title}</h2>{note && <p>{note}</p>}</div><div className="fields">{children}</div></section>;
}

export default function Home() {
  const [cfg, setCfg] = useState<Config>(defaults);
  const [optimized, setOptimized] = useState<{ eval: number; funded: number; result: ReturnType<typeof stats>; score: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = (key: keyof Config, value: number | string) => {
    setCfg(prev => ({ ...prev, [key]: value } as Config));
    setOptimized(null);
  };

  const outcomes = useMemo(() => runSimulations(cfg, cfg.evalHedgeRatio, cfg.fundedHedgeRatio), [cfg]);
  const summary = useMemo(() => stats(outcomes), [outcomes]);
  const evalCounts = useMemo(() => ({
    failed: outcomes.filter(o => o.terminal === "evaluation_failed").length,
    fundedFailed: outcomes.filter(o => o.terminal === "funded_failed").length,
    paid: outcomes.filter(o => o.terminal === "funded_paid").length
  }), [outcomes]);

  function optimize() {
    setBusy(true);
    window.setTimeout(() => {
      let best: { eval: number; funded: number; result: ReturnType<typeof stats>; score: number } | null = null;
      const steps = Math.max(3, Math.min(21, Math.floor(cfg.gridSteps)));
      const searchCfg = { ...cfg, simulations: Math.min(cfg.simulations, 2000) };
      const max = Math.max(0, cfg.maxHedgeRatio);
      for (let i = 0; i < steps; i++) {
        const h1 = max * i / (steps - 1);
        for (let j = 0; j < steps; j++) {
          const h2 = max * j / (steps - 1);
          const s = stats(runSimulations(searchCfg, h1, h2));
          const value = score(s, cfg.objective);
          if (!best || value > best.score) best = { eval: h1, funded: h2, result: s, score: value };
        }
      }
      setOptimized(best);
      if (best) setCfg(prev => ({ ...prev, evalHedgeRatio: best!.eval, fundedHedgeRatio: best!.funded }));
      setBusy(false);
    }, 20);
  }

  const propLoss = cfg.propSize * cfg.evalMaxLossPct / 100;
  const propTarget = cfg.propSize * cfg.evalTargetPct / 100;

  return <main className="shell">
    <header className="topbar">
      <div><div className="eyebrow">RISK & PAYOFF LAB</div><h1>Prop Hedge Optimizer</h1>
        <p className="sub">Model the evaluation, hedge the exposure, and optimise the payoff.</p></div>
      <div className="liveTag"><i /> LOCAL SIMULATION</div>
    </header>

    <div className="intro">
      <div><b>How to use it</b><p>Enter the prop firm's rules and your trading assumptions. Set hedge ratios manually or run the optimiser to search for the best combination under your selected objective.</p></div>
      <div className="introStat"><span>Evaluation target</span><strong>{money(propTarget)}</strong><small>+{cfg.evalTargetPct}% of account size</small></div>
      <div className="introStat"><span>Evaluation loss limit</span><strong>{money(propLoss)}</strong><small>−{cfg.evalMaxLossPct}% of account size</small></div>
    </div>

    <div className="layout">
      <div className="controls">
        <Section title="01 / Prop-firm account" note="Core account size, challenge rules and evaluation fee.">
          <Field label="Account size" value={cfg.propSize} onChange={v=>update("propSize",v)} step={100} suffix="USD" />
          <Field label="Evaluation profit target" value={cfg.evalTargetPct} onChange={v=>update("evalTargetPct",v)} step={0.5} suffix="%" />
          <Field label="Maximum total drawdown" value={cfg.evalMaxLossPct} onChange={v=>update("evalMaxLossPct",v)} step={0.5} suffix="%" />
          <Field label="Daily loss limit" value={cfg.evalDailyLossPct} onChange={v=>update("evalDailyLossPct",v)} step={0.5} suffix="% (0 = off)" />
          <Field label="Challenge fee" value={cfg.evalFee} onChange={v=>update("evalFee",v)} step={1} suffix="USD" />
          <Field label="Maximum evaluation trades" value={cfg.evalTradesMax} onChange={v=>update("evalTradesMax",v)} step={1} suffix="trades" />
        </Section>

        <Section title="02 / Evaluation trading model" note="A simplified trade-by-trade model. Risk is fixed as a percentage of initial account size.">
          <Field label="Risk per trade" value={cfg.evalRiskPct} onChange={v=>update("evalRiskPct",v)} step={0.1} suffix="%" />
          <Field label="Win rate" value={cfg.evalWinRate} onChange={v=>update("evalWinRate",v)} step={1} suffix="%" />
          <Field label="Reward / risk ratio" value={cfg.evalRR} onChange={v=>update("evalRR",v)} step={0.1} suffix="R" />
          <Field label="Trading cost per trade" value={cfg.evalTradeCost} onChange={v=>update("evalTradeCost",v)} step={0.1} suffix="USD" />
        </Section>

        <Section title="03 / Funded-account rules" note="The funded phase starts after passing the evaluation.">
          <Field label="Funded profit / payout threshold" value={cfg.fundedTargetPct} onChange={v=>update("fundedTargetPct",v)} step={0.5} suffix="%" />
          <Field label="Funded maximum drawdown" value={cfg.fundedMaxLossPct} onChange={v=>update("fundedMaxLossPct",v)} step={0.5} suffix="%" />
          <Field label="Funded daily loss limit" value={cfg.fundedDailyLossPct} onChange={v=>update("fundedDailyLossPct",v)} step={0.5} suffix="% (0 = off)" />
          <Field label="Maximum funded trades" value={cfg.fundedTradesMax} onChange={v=>update("fundedTradesMax",v)} step={1} suffix="trades" />
          <Field label="Profit split" value={cfg.profitSplitPct} onChange={v=>update("profitSplitPct",v)} step={1} suffix="%" />
          <Field label="Payout / withdrawal fee" value={cfg.payoutFee} onChange={v=>update("payoutFee",v)} step={1} suffix="USD" />
        </Section>

        <Section title="04 / Funded trading model" note="You can use different trading assumptions once funded.">
          <Field label="Risk per trade" value={cfg.fundedRiskPct} onChange={v=>update("fundedRiskPct",v)} step={0.1} suffix="%" />
          <Field label="Win rate" value={cfg.fundedWinRate} onChange={v=>update("fundedWinRate",v)} step={1} suffix="%" />
          <Field label="Reward / risk ratio" value={cfg.fundedRR} onChange={v=>update("fundedRR",v)} step={0.1} suffix="R" />
          <Field label="Trading cost per trade" value={cfg.fundedTradeCost} onChange={v=>update("fundedTradeCost",v)} step={0.1} suffix="USD" />
        </Section>

        <Section title="05 / Personal hedge account" note="Hedge ratio = personal-account P&L in the opposite direction per $1 of prop-account trading P&L. 1.0 means a 1:1 dollar hedge.">
          <Field label="Evaluation hedge ratio" value={cfg.evalHedgeRatio} onChange={v=>update("evalHedgeRatio",v)} step={0.01} min={0} max={20} suffix="×" />
          <Field label="Funded hedge ratio" value={cfg.fundedHedgeRatio} onChange={v=>update("fundedHedgeRatio",v)} step={0.01} min={0} max={20} suffix="×" />
          <Field label="Hedge cost per trade" value={cfg.hedgeCostPerTrade} onChange={v=>update("hedgeCostPerTrade",v)} step={0.01} suffix="USD" />
          <Field label="Fixed hedge cost per phase" value={cfg.hedgeFixedCost} onChange={v=>update("hedgeFixedCost",v)} step={0.5} suffix="USD" />
        </Section>

        <section className="panel">
          <button className="advancedToggle" onClick={()=>setShowAdvanced(v=>!v)}>{showAdvanced ? "− Hide" : "+ Show"} simulation & optimiser settings</button>
          {showAdvanced && <div className="fields advancedFields">
            <Field label="Monte Carlo simulations" value={cfg.simulations} onChange={v=>update("simulations",clamp(v,100,50000))} step={1000} min={100} max={50000} />
            <Field label="Random seed" value={cfg.seed} onChange={v=>update("seed",v)} step={1} />
            <Field label="Maximum hedge ratio to search" value={cfg.maxHedgeRatio} onChange={v=>update("maxHedgeRatio",v)} step={0.1} suffix="×" />
            <Field label="Grid points per phase" value={cfg.gridSteps} onChange={v=>update("gridSteps",clamp(v,3,41))} step={2} min={3} max={41} />
            <label className="field"><span>Optimisation objective</span><select value={cfg.objective} onChange={e=>update("objective",e.target.value)}><option value="riskAdjusted">Risk-adjusted return (mean − 0.75 × SD)</option><option value="expected">Highest expected net P&L</option><option value="maximin">Best 5th-percentile outcome</option><option value="positive">Prefer positive expected outcome</option></select></label>
          </div>}
        </section>
      </div>

      <aside className="results">
        <section className="resultPanel mainResult">
          <div className="resultTop"><div><div className="eyebrow">CURRENT HEDGE SETTINGS</div><h2>Simulated outcome</h2></div><span className="pill">LIVE UPDATE</span></div>
          <div className="bigMetric"><span>Expected net cash P&amp;L</span><strong className={summary.mean >= 0 ? "positive" : "negative"}>{money(summary.mean)}</strong><small>Across {cfg.simulations.toLocaleString()} simulated evaluation journeys</small></div>
          <div className="metricGrid">
            <div><span>Median outcome</span><b>{money(summary.median)}</b></div>
            <div><span>5th percentile</span><b className={summary.p5 >= 0 ? "positive" : "negative"}>{money(summary.p5)}</b></div>
            <div><span>95th percentile</span><b>{money(summary.p95)}</b></div>
            <div><span>Worst simulated</span><b className="negative">{money(summary.worst)}</b></div>
          </div>
          <div className="divider" />
          <h3>Journey outcomes</h3>
          <div className="probRow"><span>Evaluation fails</span><b>{(summary.evalFail*100).toFixed(1)}%</b><div className="bar"><i style={{width:`${summary.evalFail*100}%`}} /></div></div>
          <div className="probRow"><span>Passes, funded account fails</span><b>{(summary.fundedFail*100).toFixed(1)}%</b><div className="bar"><i style={{width:`${summary.fundedFail*100}%`}} /></div></div>
          <div className="probRow"><span>Funded account reaches payout</span><b>{(summary.payout*100).toFixed(1)}%</b><div className="bar"><i style={{width:`${summary.payout*100}%`}} /></div></div>
          <div className="splitMetrics"><div><span>Evaluation hedge</span><b>{cfg.evalHedgeRatio.toFixed(2)}×</b></div><div><span>Funded hedge</span><b>{cfg.fundedHedgeRatio.toFixed(2)}×</b></div><div><span>Outcome volatility</span><b>{money(summary.sd)}</b></div></div>
        </section>

        <section className="resultPanel optimizer">
          <div className="eyebrow">OPTIMISATION ENGINE</div><h2>Find your hedge ratios</h2>
          <p>Searches a grid of evaluation and funded hedge ratios using the same simulated trade paths and scores each combination against your selected objective.</p>
          <button className="primary" onClick={optimize} disabled={busy}>{busy ? "Optimising…" : "Optimise hedge ratios →"}</button>
          {optimized && <div className="optResult">
            <div className="optLabel">BEST FOUND</div>
            <div className="optNumbers"><div><span>Evaluation</span><b>{optimized.eval.toFixed(2)}×</b></div><div><span>Funded</span><b>{optimized.funded.toFixed(2)}×</b></div></div>
            <p>Objective score: {money(optimized.score)} · Expected net: {money(optimized.result.mean)} · 5th percentile: {money(optimized.result.p5)}</p>
            <button className="secondary" onClick={()=>setOptimized(null)}>Dismiss result</button>
          </div>}
        </section>

        <section className="resultPanel">
          <div className="eyebrow">PAYOFF MECHANICS</div><h2>How the model calculates P&amp;L</h2>
          <div className="formula"><span>Personal hedge P&amp;L</span><code>− prop trade P&amp;L × hedge ratio</code></div>
          <div className="formula"><span>Evaluation failure</span><code>Hedge P&amp;L − challenge fee − hedge costs</code></div>
          <div className="formula"><span>Funded payout</span><code>Eligible prop profit × profit split − payout fee</code></div>
          <div className="formula"><span>Final personal cash P&amp;L</span><code>Payout + hedge P&amp;L − all fees and costs</code></div>
          <p className="finePrint">The prop account balance is not treated as withdrawable personal cash. Only the modeled profit-split payout is counted as income.</p>
        </section>

        <section className="resultPanel">
          <div className="eyebrow">MODEL TRANSPARENCY</div><h2>Assumptions &amp; limitations</h2>
          <ul className="notes">
            <li>Each trade is an independent win or loss with fixed risk and reward/risk ratio.</li>
            <li>Risk per trade is calculated from initial account size, not compounded equity.</li>
            <li>Five trades are grouped into a simulated day for daily-loss checks. This is a simplifying assumption, not a calendar model.</li>
            <li>The funded phase starts only after evaluation passes. This version models one evaluation attempt and one funded phase.</li>
            <li>Hedge P&amp;L is assumed to track prop trade P&amp;L linearly and inversely. Real instruments can diverge because of basis, execution, funding, margin, slippage and market hours.</li>
            <li>It does not model trailing drawdown, consistency rules, minimum trading days, news restrictions, payout caps, scaling plans or prohibited cross-account hedging.</li>
          </ul>
        </section>
      </aside>
    </div>
    <footer><span>PROP HEDGE OPTIMIZER</span><span>Educational modelling tool · Not financial advice</span></footer>
  </main>;
}
