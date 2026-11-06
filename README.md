# FraudPulse · AI fraud detection

[![CI](https://github.com/NimrahImran/fraudlens/actions/workflows/ci.yml/badge.svg)](https://github.com/NimrahImran/fraudlens/actions/workflows/ci.yml)
[![Live demo](https://img.shields.io/badge/live%20demo-online-7fe0bf)](https://fraudpulse-ai.vercel.app)
[![License: MIT](https://img.shields.io/badge/license-MIT-a4e3cf)](LICENSE)

**Catching every fraud on the pulse.** FraudPulse checks every card payment the moment it
happens, decides in under a millisecond, and explains why.

**Live:** https://fraudpulse-ai.vercel.app · **API docs:** https://fraudpulse-ai.vercel.app/api/docs

![FraudPulse](public/og-image.jpg)

Built by **Nimra Imran**, AI Engineer.

---

## The website

A cinematic, five-scene 3D experience (Three.js particles on a dark mint glow):

1. **Hero:** a glowing particle credit card with a live heartbeat line
2. **Problem:** the card dissolves into dust and becomes a beam of payments, with fraud pooling at the base
3. **Scanner:** pick a payment and scan it; the real model returns a risk score, a decision and its reasons
4. **Results:** money saved, fraud caught and false alarms on unseen data, plus a panel for data scientists (ROC, PR curve, confusion matrix, feature importance, model card)
5. **Contact and About**

## Model results (80,000 unseen test payments)

| Metric | Value |
|---|---|
| ROC-AUC | **0.98** |
| PR-AUC (average precision) | **0.83** (random baseline 0.004) |
| Fraud caught (recall) | **83%** |
| Precision | **60%** |
| Honest payments wrongly flagged | **1 in 450** |
| Net money saved on the test set | **$262,061** |
| Typical rule set ("amount > $1,000 OR foreign country") | 46% recall, 2,024 false alarms |

**Imbalance:** fraud is 0.4% of payments, so accuracy is meaningless. FraudPulse keeps
calibrated probabilities and tunes the decision threshold on validation data to maximise net
money saved ($15 per false alarm, $25 chargeback fee per missed fraud).

**Data:** public fraud datasets hide their columns behind PCA, which makes an explainable demo
impossible. `ml/data.py` generates 400,000 realistic payments with readable features and five
fraud patterns. The model is a demo trained on synthetic data and should be retrained on real
data before production use.

**Serving:** the trained LightGBM trees are exported to JSON and evaluated by a small
pure-Python engine (`api/engine.py`), verified identical to LightGBM, so the API fits in a
Vercel function. One prediction takes about 0.1 ms.

## API

| Method | Path | |
|---|---|---|
| POST | `/api/predict` | Score one payment, with reasons |
| POST | `/api/predict/batch` | Score up to 5,000 payments |
| GET | `/api/feed` | Synthetic scored stream |
| GET | `/api/model` | Metrics, curves, threshold table |
| GET | `/api/health` | Status |

```bash
curl -X POST https://fraudpulse-ai.vercel.app/api/predict \
  -H "Content-Type: application/json" \
  -d '{"amount":1840,"customer_avg_amount":62,"hour":3,"merchant_category":"electronics",
       "channel":"online","distance_km":12,"new_device":true,"txn_count_24h":4,
       "account_age_days":900,"failed_attempts_1h":3}'
```

## Project structure

```
api/        FastAPI app (Vercel function): routes, tree engine, reasons, demo stream
ml/         data generator and training script
src/        frontend (Vite, Three.js, GSAP, Lenis)
public/     static assets
tests/      API and engine tests
```

## Run locally

```bash
pip install -r requirements-dev.txt
uvicorn api.index:app --reload --port 8000   # backend

npm install
npm run dev                                   # frontend, proxies /api to :8000
```

Retrain: `python ml/train.py` · Tests: `pytest`

---

© Nimra Imran · FraudPulse
