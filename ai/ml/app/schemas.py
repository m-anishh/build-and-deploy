"""Pydantic request/response models for the ML anomaly service."""
from pydantic import BaseModel, Field


class Sample(BaseModel):
    """One observation of the app's runtime state (from live telemetry)."""
    rps: float = Field(0, description="requests per second")
    error_rate: float = Field(0, description="errors / total, 0..1")
    latency_ms: float = Field(0, description="avg response time in ms")
    mem_mb: float = Field(0, description="resident memory in MB")
    cpu: float = Field(0, description="cpu seconds (or utilization proxy)")


class TrainRequest(BaseModel):
    samples: list[Sample] = Field(..., min_length=5, description="training observations")
    contamination: float | None = Field(None, description="expected anomaly fraction, else auto")


class TrainResponse(BaseModel):
    trained: bool
    n_samples: int
    source: str
    trained_at: str


class PredictResponse(BaseModel):
    anomaly: bool
    score: float
    threshold: float
    severity: str
    features: Sample
    model_source: str
