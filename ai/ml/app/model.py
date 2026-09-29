"""IsolationForest anomaly detector with persistence + synthetic bootstrap.

Feature order is fixed: [rps, error_rate, latency_ms, mem_mb, cpu].
The model is standard-scaled then fed to an IsolationForest. Until real data is
trained in, a synthetic "normal" baseline lets /predict work immediately.
"""
from __future__ import annotations

import os
import threading
from datetime import datetime, timezone

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

FEATURES = ["rps", "error_rate", "latency_ms", "mem_mb", "cpu"]
MODEL_PATH = os.getenv("MODEL_PATH", "/app/models/model.joblib")


def to_vector(sample: dict) -> list[float]:
    return [float(sample.get(f, 0) or 0) for f in FEATURES]


class AnomalyModel:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.scaler: StandardScaler | None = None
        self.clf: IsolationForest | None = None
        self.threshold: float = 0.0
        self.source: str = "none"
        self.trained_at: str = ""
        self.n_samples: int = 0

    # -- lifecycle -----------------------------------------------------------
    def load_or_bootstrap(self) -> None:
        if os.path.exists(MODEL_PATH):
            try:
                self._restore(joblib.load(MODEL_PATH))
                return
            except Exception:
                pass
        self.bootstrap()

    def bootstrap(self, n: int = 500) -> None:
        """Fit on a synthetic healthy baseline so predictions work day one."""
        rng = np.random.default_rng(42)
        X = np.column_stack([
            np.abs(rng.normal(5, 2, n)),        # rps
            np.abs(rng.normal(0.01, 0.01, n)),  # error_rate
            np.abs(rng.normal(20, 6, n)),       # latency_ms
            np.abs(rng.normal(80, 12, n)),      # mem_mb
            np.abs(rng.normal(1.0, 0.4, n)),    # cpu
        ])
        self._fit(X, contamination=0.02, source="bootstrap")

    def train(self, samples: list[dict], contamination: float | None = None) -> None:
        X = np.array([to_vector(s) for s in samples], dtype=float)
        self._fit(X, contamination=contamination or "auto", source="trained")

    # -- core ----------------------------------------------------------------
    def _fit(self, X: np.ndarray, contamination, source: str) -> None:
        scaler = StandardScaler().fit(X)
        Xs = scaler.transform(X)
        clf = IsolationForest(
            n_estimators=200, contamination=contamination, random_state=42
        ).fit(Xs)
        scores = clf.decision_function(Xs)
        with self._lock:
            self.scaler, self.clf = scaler, clf
            # threshold: 2nd percentile of training scores (below = anomaly)
            self.threshold = float(np.percentile(scores, 2))
            self.source = source
            self.n_samples = int(X.shape[0])
            self.trained_at = datetime.now(timezone.utc).isoformat()
        self._persist()

    def predict(self, sample: dict) -> dict:
        if self.clf is None or self.scaler is None:
            self.bootstrap()
        x = np.array([to_vector(sample)], dtype=float)
        xs = self.scaler.transform(x)
        score = float(self.clf.decision_function(xs)[0])
        is_anom = bool(self.clf.predict(xs)[0] == -1)
        # severity by distance below threshold
        if not is_anom:
            severity = "normal"
        elif score < self.threshold - 0.15:
            severity = "critical"
        else:
            severity = "warning"
        return {
            "anomaly": is_anom,
            "score": round(score, 4),
            "threshold": round(self.threshold, 4),
            "severity": severity,
            "model_source": self.source,
        }

    # -- persistence ---------------------------------------------------------
    def _persist(self) -> None:
        try:
            os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
            joblib.dump(self._state(), MODEL_PATH)
        except Exception:
            pass  # non-fatal (read-only fs, etc.)

    def _state(self) -> dict:
        return {
            "scaler": self.scaler, "clf": self.clf, "threshold": self.threshold,
            "source": self.source, "trained_at": self.trained_at, "n_samples": self.n_samples,
        }

    def _restore(self, st: dict) -> None:
        self.scaler = st["scaler"]; self.clf = st["clf"]; self.threshold = st["threshold"]
        self.source = st.get("source", "trained"); self.trained_at = st.get("trained_at", "")
        self.n_samples = st.get("n_samples", 0)

    def info(self) -> dict:
        return {
            "source": self.source, "trained_at": self.trained_at,
            "n_samples": self.n_samples, "threshold": round(self.threshold, 4),
            "features": FEATURES, "ready": self.clf is not None,
        }
