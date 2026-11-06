# FraudLens · AI fraud detection

**Catching card fraud before it lands, with the reason behind every decision.**

FraudLens is an end-to-end fraud detection product: a LightGBM model trained on heavily
imbalanced card payments, a FastAPI scoring service with explanations, and an immersive
3D web interface (Three.js) that lets anyone scan a transaction, watch a live feed and
see what the model is worth in money.

Built by **Nimra Imran**, AI Engineer.

---

## What's inside

| | |
|---|---|
| **3D interface** | Particle credit card that morphs into a transaction storm, a light beam, a scanner card and a shield as you scroll, on an animated mint-silk background |
| **Card scanner** | Live demo: enter a payment, the real model returns a 0-100 risk score, a block / review / approve decision and its reasons |
| **Explainable AI** | Every prediction comes with plain-language reasons (tree-path attribution) shown as flip cards |
| **Live feed** | A stream of payments scored in real time, with counters for money protected and decision time |
| **Business results** | Money saved, catch rate, false alarms, comparison with bank rules, and a strictness slider |
| **For data scientists** | ROC and precision-recall curves, confusion matrix at any threshold, feature importance, model card |
| **Savings calculator** | A business enters its own volume and fraud rate and sees yearly savings |
| **CSV + PDF** | Upload up to 5,000 payments, download scored results or a PDF report |
| **Analyst review** | Borderline and blocked payments land in a queue to confirm or release |
| **REST API** | `/api/predict`, `/api/predict/batch`, interactive docs at `/api/docs` |

## Model results (80,000 unseen test payments)

| Metric | Value |
|---|---|
| ROC-AUC | **0.98** |
| PR-AUC (average precision) | **0.83** (random baseline 0.004) |
| Fraud caught (recall) at chosen threshold | **83%** |
| Precision at chosen threshold | **60%** |
| Honest payments wrongly flagged | **1 in 450** |
| Net money saved on the test set | **$262,061** |
| Typical rule set ("amount > $1,000 OR foreign country") | 46% recall, 2,024 false alarms |

### How the imbalance is handled
Fraud is 0.4% of payments, so accuracy is meaningless (a model that approves everything is
99.6% accurate). Instead of naive oversampling, FraudLens keeps calibrated probabilities and
tunes the decision threshold on a validation set to **maximise net money saved**, counting
$15 per false alarm and a $25 chargeback fee per missed fraud.

### Data
Public fraud datasets hide their columns behind PCA (V1...V28), which makes a live,
explainable demo impossible. `ml/data.py` generates 400,000 realistic payments with readable
features and five fraud patterns (card cloning, account takeover, card-testing bots,
bust-out accounts, stealth fraud). **The model is a demo trained on synthetic data and should
be retrained on real data before production use.**

### Serving on Vercel
LightGBM is too large for a serverless function, so the trained trees are exported to JSON
and evaluated by a ~60-line pure-Python engine (`api/engine.py`). A test verifies it matches
LightGBM to 1e-7. One prediction takes about 0.1 ms. The same model also runs in the browser
as a fallback ("edge mode") if the API is unreachable.

## Project structure

```
api/            FastAPI app (Vercel serverless function)
  index.py      routes, validation, risk score
  engine.py     dependency-free tree ensemble + explanations
  reasons.py    plain-language reasons
  feed.py       synthetic live stream
  model/        exported model.json + metrics.json
ml/             data generator and training script
src/            frontend (Vite, Three.js, GSAP, Lenis)
  scene.js      silk shader + morphing particles
  ui/           scanner, reasons, feed, results, tools, API docs
public/         static assets (photo, model copy for edge mode)
tests/          API and engine tests
```

## Run locally

```bash
# backend
pip install -r requirements-dev.txt
uvicorn api.index:app --reload --port 8000

# frontend (proxies /api to :8000)
npm install
npm run dev
```

Retrain the model: `python ml/train.py` · Run tests: `pytest`

## Deploy (free)

The repo is ready for Vercel: `vercel.json` builds the frontend with Vite and serves
`api/index.py` as a Python function. Import the GitHub repo in Vercel and deploy, no
settings needed.

## API example

```bash
curl -X POST https://<your-app>.vercel.app/api/predict \
  -H "Content-Type: application/json" \
  -d '{"amount":1840,"customer_avg_amount":62,"hour":3,"merchant_category":"electronics",
       "channel":"online","distance_km":12,"new_device":true,"txn_count_24h":4,
       "account_age_days":900,"failed_attempts_1h":3}'
```

```json
{
  "risk_score": 100,
  "decision": "block",
  "probability": 0.99743,
  "reasons": [
    {"title": "3 failed attempts", "detail": "Wrong PIN or CVV entered just before, as if someone is guessing.", "direction": "raises"},
    {"title": "30× the usual spend", "detail": "This customer normally spends about $62.", "direction": "raises"}
  ]
}
```

---

© Nimra Imran · FraudLens
