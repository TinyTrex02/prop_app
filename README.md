# Prop Hedge Optimizer

A browser-only Next.js app for modelling a prop-firm evaluation, personal-account hedge, and funded payout path. Designed for deployment to Vercel.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. Import the repository in Vercel.
3. Keep the framework preset as Next.js.
4. Deploy. No environment variables or database are required.

## What it currently models

- Evaluation and funded account size/rules.
- Profit targets, max drawdown and optional daily loss limits.
- Separate evaluation/funded win rates, risk per trade, reward-to-risk and trading costs.
- Challenge fee, profit split and payout fee.
- Separate personal-account hedge ratios for evaluation and funded phases.
- Hedge transaction costs.
- Monte Carlo trade-path simulation.
- Grid-search optimisation against expected P&L, a risk-adjusted score, or the 5th-percentile outcome.

## Model definition

The hedge ratio is a linear dollar-P&L multiplier. For each trade:

`personal hedge P&L = - prop trade P&L * hedge ratio`

A ratio of 1.0 is a 1:1 inverse dollar-P&L hedge. This is deliberately different from the earlier fixed-terminal-payoff toy example where hedge P&L was assumed to be a fixed amount at each boundary.

## Important limitations before publishing

This is a prototype model, not a representation of any particular prop firm's contract. It currently assumes:
- independent binary win/loss trades with fixed reward/risk;
- fixed risk based on initial account size (no compounding);
- a simplified five-trades-per-day grouping for daily-loss checks;
- one evaluation attempt followed by one funded phase;
- a linear, perfectly matched inverse hedge;
- no trailing drawdown, minimum days, consistency rules, payout caps, instrument basis, slippage, funding, margin/liquidation or execution timing mismatch.

Before using it to make real decisions, add the exact provider rules and validate the simulation against hand-calculated test cases. Also verify whether the prop firm permits the proposed hedging arrangement across separate accounts. Some firms prohibit cross-account hedging or strategies designed to exploit evaluation rules.

## Suggested next upgrades

1. Add selectable drawdown type: static, balance-based trailing, or equity-based trailing.
2. Add variable daily trade counts and daily resets by timezone.
3. Add retries and challenge reset fees.
4. Add payout caps, minimum trading days, consistency rules, first-payout waiting period and scaling.
5. Add non-binary trade distributions, streaks, regime-dependent win rates and correlated market paths.
6. Add hedge instrument leverage, margin, spread, commissions, funding, slippage and imperfect correlation.
7. Add downloadable CSV results and charts for distributions / hedge-ratio surfaces.
