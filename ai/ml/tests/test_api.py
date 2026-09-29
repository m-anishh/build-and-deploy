from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

NORMAL = {"rps": 5, "error_rate": 0.01, "latency_ms": 20, "mem_mb": 80, "cpu": 1.0}
EXTREME = {"rps": 900, "error_rate": 0.9, "latency_ms": 5000, "mem_mb": 4000, "cpu": 90}


def test_health():
    assert client.get("/health").status_code == 200


def test_ready_and_metrics():
    with TestClient(app) as c:  # triggers lifespan (bootstrap)
        assert c.get("/ready").json()["status"] == "ready"
        assert "ml_predictions_total" in c.get("/metrics").text


def test_predict_normal_vs_extreme():
    with TestClient(app) as c:
        normal = c.post("/predict", json=NORMAL).json()
        extreme = c.post("/predict", json=EXTREME).json()
        assert extreme["score"] < normal["score"]      # extreme is more anomalous
        assert extreme["anomaly"] is True


def test_train_custom():
    with TestClient(app) as c:
        samples = [NORMAL for _ in range(20)]
        r = c.post("/train", json={"samples": samples}).json()
        assert r["trained"] is True
        assert r["n_samples"] == 20
        assert r["source"] == "trained"
