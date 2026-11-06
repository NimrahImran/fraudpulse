"""Synthetic live transaction stream for the demo feed (pure Python)."""
from __future__ import annotations

import random

MERCHANTS = {
    "grocery": ["FreshMart", "GreenBasket", "DailyNeeds"],
    "fuel": ["PetroLine", "FuelUp", "RoadStar"],
    "restaurants": ["Spice Route", "Cafe Lumen", "Urban Grill"],
    "fashion": ["Threadline", "Mira Boutique", "Northwear"],
    "electronics": ["VoltHub", "PixelPoint", "Circuit City"],
    "travel": ["SkyFare", "StayNest", "TripLane"],
    "online_services": ["StreamBox", "CloudKit", "AppVault"],
    "jewelry": ["Golden Arc", "Lumière Gems", "Karat & Co"],
    "gaming_crypto": ["CoinDock", "PlayForge", "TokenBay"],
}
CITIES = ["Karachi", "Lahore", "Dubai", "London", "New York", "Toronto", "Riyadh",
          "Istanbul", "Singapore", "Berlin", "Lagos", "Manila"]
CATS = list(MERCHANTS)
CAT_W = [26, 12, 17, 10, 6, 4, 17, 2, 6]


def _legit(r: random.Random) -> dict:
    avg = round(r.lognormvariate(4.0, .6), 2)
    cat = r.choices(CATS, CAT_W)[0]
    channel = "online" if cat in ("online_services", "gaming_crypto") else r.choices(
        ["chip_in_store", "contactless", "online", "atm"], [42, 40, 10, 8])[0]
    ratio = r.lognormvariate(0, .5) * (r.uniform(1.5, 4) if cat in ("electronics", "travel", "jewelry") else 1)
    return dict(amount=round(max(.5, avg * ratio), 2), customer_avg_amount=avg,
                hour=min(23, max(6, int(r.gauss(14, 3.5)))), merchant_category=cat,
                channel=channel, distance_km=round(r.expovariate(1 / 6), 1),
                country_mismatch=False, new_device=r.random() < .03,
                txn_count_24h=r.randint(1, 5), account_age_days=r.randint(90, 3800),
                failed_attempts_1h=0)


def _fraud(r: random.Random) -> dict:
    t = _legit(r)
    kind = r.choice(["cloning", "takeover", "bot", "bust_out"])
    if kind == "cloning":
        t.update(channel=r.choice(["chip_in_store", "atm"]), distance_km=round(r.uniform(300, 8000)),
                 country_mismatch=True, amount=round(t["customer_avg_amount"] * r.uniform(5, 15), 2),
                 merchant_category=r.choice(["electronics", "jewelry"]), hour=r.randint(0, 5))
    elif kind == "takeover":
        t.update(channel="online", new_device=True, failed_attempts_1h=r.randint(1, 5),
                 amount=round(t["customer_avg_amount"] * r.uniform(6, 25), 2),
                 merchant_category=r.choice(["electronics", "gaming_crypto", "travel"]), hour=r.randint(0, 4))
    elif kind == "bot":
        t.update(channel="online", amount=round(r.uniform(.5, 5), 2), txn_count_24h=r.randint(20, 60),
                 merchant_category=r.choice(["online_services", "gaming_crypto"]),
                 failed_attempts_1h=r.randint(2, 8))
    else:
        t.update(account_age_days=r.randint(2, 20), amount=round(r.uniform(900, 4000), 2),
                 merchant_category=r.choice(["electronics", "jewelry"]), txn_count_24h=r.randint(4, 12))
    return t


def stream(n: int, fraud_share: float = .12, seed: int | None = None) -> list[dict]:
    """fraud_share is boosted (real life is ~0.4%) so the demo feed stays interesting."""
    r = random.Random(seed)
    out = []
    for _ in range(n):
        t = _fraud(r) if r.random() < fraud_share else _legit(r)
        t["merchant"] = r.choice(MERCHANTS[t["merchant_category"]])
        t["city"] = r.choice(CITIES[:2]) if not t["country_mismatch"] else r.choice(CITIES[2:])
        t["card_last4"] = f"{r.randint(0, 9999):04d}"
        out.append(t)
    return out
