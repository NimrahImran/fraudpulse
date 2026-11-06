import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api.index import app, risk_score  # noqa: E402

client = TestClient(app)

NORMAL = dict(amount=48, customer_avg_amount=55, hour=13, merchant_category="grocery",
              channel="chip_in_store", distance_km=3, account_age_days=1500)
TAKEOVER = dict(amount=1840, customer_avg_amount=62, hour=3, merchant_category="electronics",
                channel="online", distance_km=12, new_device=True, txn_count_24h=4,
                account_age_days=900, failed_attempts_1h=3)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_normal_purchase_is_approved():
    r = client.post("/api/predict", json=NORMAL).json()
    assert r["decision"] == "approve" and r["risk_score"] < 35


def test_account_takeover_is_blocked_with_reasons():
    r = client.post("/api/predict", json=TAKEOVER).json()
    assert r["decision"] == "block" and r["risk_score"] >= 50
    feats = {x["feature"] for x in r["reasons"] if x["direction"] == "raises"}
    assert {"failed_attempts_1h", "new_device"} & feats


def test_batch():
    r = client.post("/api/predict/batch", json={"transactions": [NORMAL, TAKEOVER]}).json()
    assert r["count"] == 2 and r["blocked"] == 1


@pytest.mark.parametrize("bad", [
    {**NORMAL, "amount": -5}, {**NORMAL, "hour": 24},
    {**NORMAL, "merchant_category": "casino"}, {"amount": 10},
])
def test_validation(bad):
    assert client.post("/api/predict", json=bad).status_code == 422


def test_feed_and_model():
    items = client.get("/api/feed?n=10&seed=3").json()["items"]
    assert len(items) == 10 and all("risk_score" in i for i in items)
    m = client.get("/api/model").json()["metrics"]
    assert m["roc_auc"] > 0.95 and len(m["table"]) == 99


def test_risk_score_centres_on_threshold():
    assert risk_score(0.06, 0.06) == 50
    assert risk_score(0.9, 0.06) > 90 and risk_score(0.0001, 0.06) < 5


def test_engine_matches_lightgbm():
    lgb = pytest.importorskip("lightgbm")
    from api.engine import FraudModel
    from ml.data import FEATURES, generate
    model = FraudModel()
    booster = lgb.Booster(model_file=str(ROOT / "ml" / "lightgbm_model.txt"))
    X = generate(500, seed=11)[FEATURES].to_numpy(float)
    ref = booster.predict(X)
    for row, p in zip(X, ref):
        assert abs(model.score(list(row))[0] - p) < 1e-6
