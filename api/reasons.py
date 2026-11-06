"""Turn raw feature contributions into plain-language reasons."""
from __future__ import annotations

CATEGORY_LABEL = {
    "grocery": "Grocery store", "fuel": "Fuel station", "restaurants": "Restaurant",
    "fashion": "Fashion store", "electronics": "Electronics store", "travel": "Travel booking",
    "online_services": "Online service", "jewelry": "Jewellery store",
    "gaming_crypto": "Gaming / crypto site",
}
CHANNEL_LABEL = {
    "chip_in_store": "Chip card in store", "contactless": "Contactless tap",
    "online": "Online (card not present)", "atm": "ATM withdrawal",
}
ICONS = {
    "amount": "cash", "amount_to_avg_ratio": "trending-up", "hour": "moon",
    "merchant_category": "building-store", "channel": "world-www",
    "distance_from_home_km": "map-pin", "country_mismatch": "flag",
    "new_device": "device-mobile", "txn_count_24h": "repeat",
    "account_age_days": "user", "failed_attempts_1h": "lock-x",
}


def _money(v: float) -> str:
    return f"${v:,.0f}" if v >= 10 else f"${v:,.2f}"


def _hour(h: int) -> str:
    h = int(h)
    return f"{(h % 12) or 12} {'AM' if h < 12 else 'PM'}"


def describe(feature: str, v, raises: bool, ctx: dict) -> tuple[str, str]:
    """Return (title, plain explanation) for one feature."""
    if feature == "amount":
        return (f"{_money(v)} payment",
                "A large amount for this kind of purchase." if raises
                else "The amount is normal for this kind of purchase.")
    if feature == "amount_to_avg_ratio":
        x = f"{v:.1f}×" if v < 10 else f"{v:.0f}×"
        return (f"{x} the usual spend",
                f"This customer normally spends about {_money(ctx['customer_avg_amount'])}." if raises
                else "Close to what this customer usually spends.")
    if feature == "hour":
        night = int(v) < 6
        return (f"At {_hour(v)}",
                "Late-night payments are a common fraud window." if (raises and night)
                else "Payments at this hour are less typical for genuine buyers." if raises
                else "A normal time of day for shopping.")
    if feature == "merchant_category":
        name = CATEGORY_LABEL.get(ctx["merchant_category"], "Merchant")
        return (name,
                "Fraudsters prefer goods that are easy to resell or cash out." if raises
                else "Low-risk type of merchant.")
    if feature == "channel":
        name = CHANNEL_LABEL.get(ctx["channel"], "Channel")
        return (name,
                "This payment method is easier to abuse with stolen card details." if raises
                else "A payment method that is harder to fake.")
    if feature == "distance_from_home_km":
        return (f"{v:,.0f} km from home",
                "Far away from where this card is normally used." if raises
                else "Close to where this card is normally used.")
    if feature == "country_mismatch":
        return (("Different country" if v else "Home country"),
                "The card is being used outside its home country." if (raises and v)
                else "Card used in its home country." if not v
                else "Foreign use, but in a pattern that looks genuine.")
    if feature == "new_device":
        return (("New device" if v else "Known device"),
                "First time this account is used from this phone or computer." if v
                else "The customer has used this device before.")
    if feature == "txn_count_24h":
        return (f"{int(v)} payments in 24h",
                "Rapid repeated payments, a sign of a bot testing stolen cards." if raises
                else "Normal number of payments today.")
    if feature == "account_age_days":
        d = int(v)
        age = f"{d} days" if d < 365 else f"{d // 365} year{'s' if d >= 730 else ''}"
        return (f"Account age {age}",
                "Brand-new accounts are often opened just to commit fraud." if raises
                else "A long-standing, trusted account.")
    if feature == "failed_attempts_1h":
        n = int(v)
        return ((f"{n} failed attempts" if n else "No failed attempts"),
                "Wrong PIN or CVV entered just before, as if someone is guessing." if n
                else "No wrong PIN or CVV attempts before this payment.")
    return feature, ""


def build_reasons(features: list[str], values: list[float], contrib: list[float],
                  ctx: dict, top_up: int = 4, top_down: int = 2) -> list[dict]:
    items = sorted(zip(features, values, contrib), key=lambda t: -abs(t[2]))
    ups = [t for t in items if t[2] > 0.05][:top_up]
    downs = [t for t in items if t[2] < -0.05][:top_down]
    total = sum(abs(c) for c in contrib) or 1.0
    out = []
    for f, v, c in ups + downs:
        title, detail = describe(f, v, c > 0, ctx)
        out.append(dict(feature=f, title=title, detail=detail, icon=ICONS.get(f, "point"),
                        direction="raises" if c > 0 else "lowers",
                        impact=round(c, 4), share=round(abs(c) / total, 4)))
    return out
