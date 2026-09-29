# ML anomaly-detection service

FastAPI + scikit-learn `IsolationForest` that flags anomalous runtime states of
the main app from its live telemetry.

**Features** (fixed order): `rps, error_rate, latency_ms, mem_mb, cpu`
The Node API proxies `/api/ml/*` → this service, and the dashboard shows an
**AI Health** panel driven by `/predict`.

## Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | liveness |
| GET | `/ready` | readiness (model loaded) |
| GET | `/metrics` | Prometheus (`ml_predictions_total`, `ml_anomalies_total`, …) |
| GET | `/model/info` | model source, sample count, threshold |
| POST | `/predict` | score one sample → `{anomaly, score, severity}` |
| POST | `/train` | fit on real samples `{samples:[...]}` |

On first start it fits a **synthetic healthy baseline** so `/predict` works
immediately; `POST /train` replaces it with a model fit on real collected data.

## Run locally
```bash
cd services/ml
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
pytest -q
```

## Docker
```bash
docker build -t devops-ml:local services/ml
docker run -p 8000:8000 devops-ml:local
```
