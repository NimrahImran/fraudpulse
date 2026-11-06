"""Synthetic card-transaction generator for FraudLens.

Public fraud datasets (e.g. the Kaggle ULB set) hide every column behind PCA
(V1..V28), which makes a live demo impossible to explain to a business user.
This generator produces human-readable features with realistic behaviour:
heavy class imbalance (~0.4% fraud), several distinct fraud patterns, and
"stealth" frauds that look almost normal so the problem stays hard.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

CATEGORIES = [
    "grocery", "fuel", "restaurants", "fashion", "electronics",
    "travel", "online_services", "jewelry", "gaming_crypto",
]
CHANNELS = ["chip_in_store", "contactless", "online", "atm"]

FEATURES = [
    "amount", "hour", "merchant_category", "channel", "distance_from_home_km",
    "country_mismatch", "new_device", "txn_count_24h", "amount_to_avg_ratio",
    "account_age_days", "failed_attempts_1h",
]

LEGIT_CAT_P = np.array([.26, .12, .17, .10, .06, .04, .17, .02, .06])
FRAUD_PATTERNS = {
    # name: share of frauds
    "card_cloning": .22,
    "account_takeover": .26,
    "card_testing_bot": .18,
    "new_account_bust_out": .14,
    "stealth": .20,
}


def _legit(n: int, rng: np.random.Generator) -> pd.DataFrame:
    avg = rng.lognormal(np.log(55), .7, n)
    cat = rng.choice(len(CATEGORIES), n, p=LEGIT_CAT_P)
    online_like = np.isin(cat, [6, 8])
    channel = np.where(
        online_like, 2,
        rng.choice(4, n, p=[.42, .40, .10, .08]),
    )
    ratio = rng.lognormal(0, .55, n)
    ratio = np.where(np.isin(cat, [4, 5, 7]), ratio * rng.uniform(1.5, 5, n), ratio)
    hour = np.clip(np.round(rng.normal(14.5, 4.2, n)), 0, 23)
    late = rng.random(n) < .05
    hour = np.where(late, rng.integers(0, 6, n), hour)
    travelling = rng.random(n) < .03
    dist = np.where(travelling, rng.uniform(200, 6000, n), rng.exponential(7, n))
    mismatch = (travelling & (rng.random(n) < .55)) | (rng.random(n) < .004)
    return pd.DataFrame({
        "customer_avg": avg,
        "amount": avg * ratio,
        "hour": hour,
        "merchant_category": cat,
        "channel": channel,
        "distance_from_home_km": dist,
        "country_mismatch": mismatch.astype(int),
        "new_device": (rng.random(n) < np.where(channel == 2, .07, .01)).astype(int),
        "txn_count_24h": rng.poisson(2.6, n) + 1,
        "account_age_days": np.where(rng.random(n) < .06, rng.integers(1, 60, n), rng.integers(60, 4000, n)),
        "failed_attempts_1h": np.where(rng.random(n) < .03, rng.integers(1, 3, n), 0),
        "pattern": "legit",
    })


def _fraud(n: int, rng: np.random.Generator) -> pd.DataFrame:
    names = list(FRAUD_PATTERNS)
    pat = rng.choice(names, n, p=list(FRAUD_PATTERNS.values()))
    df = _legit(n, rng)  # start from a normal-looking customer, then distort
    df["pattern"] = pat

    def m(name):
        return (df["pattern"] == name).to_numpy()

    k = m("card_cloning"); c = k.sum()
    df.loc[k, "channel"] = rng.choice([0, 3], c, p=[.55, .45])
    df.loc[k, "distance_from_home_km"] = rng.uniform(80, 9000, c)
    df.loc[k, "country_mismatch"] = (rng.random(c) < .7).astype(int)
    df.loc[k, "amount"] = df.loc[k, "customer_avg"] * rng.uniform(3, 18, c)
    df.loc[k, "merchant_category"] = rng.choice([4, 7, 1, 3], c)
    df.loc[k, "hour"] = rng.choice(np.arange(24), c, p=_night_p(.45))

    k = m("account_takeover"); c = k.sum()
    df.loc[k, "channel"] = 2
    df.loc[k, "new_device"] = (rng.random(c) < .85).astype(int)
    df.loc[k, "failed_attempts_1h"] = rng.integers(0, 6, c)
    df.loc[k, "amount"] = df.loc[k, "customer_avg"] * rng.uniform(4, 30, c)
    df.loc[k, "merchant_category"] = rng.choice([4, 7, 8, 5], c)
    df.loc[k, "hour"] = rng.choice(np.arange(24), c, p=_night_p(.55))
    df.loc[k, "country_mismatch"] = (rng.random(c) < .35).astype(int)

    k = m("card_testing_bot"); c = k.sum()
    df.loc[k, "channel"] = 2
    df.loc[k, "amount"] = rng.uniform(.5, 6, c)
    df.loc[k, "txn_count_24h"] = rng.integers(12, 70, c)
    df.loc[k, "merchant_category"] = rng.choice([6, 8], c)
    df.loc[k, "failed_attempts_1h"] = rng.integers(1, 9, c)
    df.loc[k, "new_device"] = (rng.random(c) < .5).astype(int)

    k = m("new_account_bust_out"); c = k.sum()
    df.loc[k, "account_age_days"] = rng.integers(1, 30, c)
    df.loc[k, "amount"] = rng.uniform(600, 5000, c)
    df.loc[k, "merchant_category"] = rng.choice([4, 7, 5], c)
    df.loc[k, "txn_count_24h"] = rng.integers(3, 15, c)

    k = m("stealth"); c = k.sum()
    df.loc[k, "amount"] = df.loc[k, "customer_avg"] * rng.uniform(1.2, 4, c)
    df.loc[k, "new_device"] = (rng.random(c) < .3).astype(int)
    df.loc[k, "hour"] = rng.choice(np.arange(24), c, p=_night_p(.25))
    return df


def _night_p(night_share: float) -> np.ndarray:
    p = np.full(24, (1 - night_share) / 18)
    p[:6] = night_share / 6
    return p / p.sum()


def generate(n: int = 400_000, fraud_rate: float = .004, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    nf = int(n * fraud_rate)
    legit = _legit(n - nf, rng); legit["is_fraud"] = 0
    fraud = _fraud(nf, rng); fraud["is_fraud"] = 1
    df = pd.concat([legit, fraud], ignore_index=True).sample(frac=1, random_state=seed)
    df["amount"] = df["amount"].clip(.5, 25_000).round(2)
    df["customer_avg"] = df["customer_avg"].round(2)
    df["distance_from_home_km"] = df["distance_from_home_km"].round(1)
    df["amount_to_avg_ratio"] = (df["amount"] / df["customer_avg"]).round(3)
    for col in ["hour", "merchant_category", "channel", "txn_count_24h", "account_age_days", "failed_attempts_1h"]:
        df[col] = df[col].astype(int)
    return df.reset_index(drop=True)


if __name__ == "__main__":
    d = generate()
    print(d.shape, d.is_fraud.mean())
    print(d.groupby("pattern").size())
