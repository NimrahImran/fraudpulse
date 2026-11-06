"""Dependency-free inference engine for the FraudPulse tree ensemble.

LightGBM is a large native library; Vercel's Python functions have a strict
size budget. The trained trees are exported to JSON and walked here in plain
Python, which keeps the serverless bundle tiny and cold starts fast.

Explanations use tree-path attribution (Saabas): every split on the decision
path moves the expected score; that move is credited to the split feature.
For tree ensembles it is a close, fast approximation of SHAP values, and the
contributions always add up exactly to the raw score.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parent / "model"


class FraudModel:
    def __init__(self, model_path: Path = MODEL_DIR / "model.json",
                 metrics_path: Path = MODEL_DIR / "metrics.json"):
        spec = json.loads(Path(model_path).read_text())
        self.features: list[str] = spec["features"]
        self.categories: list[str] = spec["categories"]
        self.channels: list[str] = spec["channels"]
        self.trees: list[list[list[float]]] = spec["trees"]
        self.metrics: dict = json.loads(Path(metrics_path).read_text())
        self.threshold: float = self.metrics["threshold"]
        self.bias = sum(t[0][4] for t in self.trees)

    def raw(self, x: list[float]) -> tuple[float, list[float]]:
        contrib = [0.0] * len(self.features)
        total = 0.0
        for nodes in self.trees:
            i = 0
            node = nodes[0]
            while node[0] != -1:
                f = int(node[0])
                nxt = node[2] if x[f] <= node[1] else node[3]
                child = nodes[nxt]
                contrib[f] += child[4] - node[4]
                i, node = nxt, child
            total += node[4]
        return total, contrib

    def score(self, x: list[float]) -> tuple[float, list[float]]:
        raw, contrib = self.raw(x)
        return 1.0 / (1.0 + math.exp(-raw)), contrib


_model: FraudModel | None = None


def get_model() -> FraudModel:
    global _model
    if _model is None:
        _model = FraudModel()
    return _model
