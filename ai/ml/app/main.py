"""ML anomaly-detection service for build-and-deploy.

Consumes the app's runtime telemetry (rps, error_rate, latency, mem, cpu) and
flags anomalous states with an IsolationForest. Exposes Prometheus metrics so
the ML service is itself observable — MLOps end to end.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from prometheus_client import Counter, Gauge, generate_latest, CONTENT_TYPE_LATEST

from .model import AnomalyModel
from .schemas import PredictResponse, Sample, TrainRequest, TrainResponse

model = AnomalyModel()

PREDICTIONS = Counter("ml_predictions_total", "Total predictions served")
ANOMALIES = Counter("ml_anomalies_total", "Predictions flagged as anomalies", ["severity"])
LAST_SCORE = Gauge("ml_last_anomaly_score", "Most recent anomaly score")
MODEL_SAMPLES = Gauge("ml_model_training_samples", "Samples the current model was trained on")


@asynccontextmanager
async def lifespan(_: FastAPI):
    model.load_or_bootstrap()
    MODEL_SAMPLES.set(model.n_samples)
    yield


app = FastAPI(title="devops-app ML service", version=os.getenv("APP_VERSION", "0.1.0"), lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    return {"status": "ready" if model.clf is not None else "not ready", "model": model.source}


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/model/info")
def model_info():
    return model.info()


@app.post("/predict", response_model=PredictResponse)
def predict(sample: Sample):
    result = model.predict(sample.model_dump())
    PREDICTIONS.inc()
    LAST_SCORE.set(result["score"])
    if result["anomaly"]:
        ANOMALIES.labels(severity=result["severity"]).inc()
    return PredictResponse(features=sample, **result)


@app.post("/train", response_model=TrainResponse)
def train(req: TrainRequest):
    model.train([s.model_dump() for s in req.samples], contamination=req.contamination)
    MODEL_SAMPLES.set(model.n_samples)
    return TrainResponse(
        trained=True, n_samples=model.n_samples, source=model.source, trained_at=model.trained_at
    )
