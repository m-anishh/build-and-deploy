#!/usr/bin/env python3
"""Simple load generator / smoke test for the devops-app REST API.

Stdlib only (no pip install needed). Exercises the full task lifecycle and
generates traffic so the Prometheus/Grafana dashboards have something to show.

Usage:
    python3 scripts/loadtest.py --url http://localhost:3000 --requests 200 --concurrency 10
    python3 scripts/loadtest.py --smoke        # one pass through every endpoint
"""
import argparse
import json
import random
import statistics
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

STATUSES = ["pending", "in_progress", "done"]


def call(method, url, body=None, timeout=10):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = resp.read()
            return resp.status, payload, time.perf_counter() - start
    except urllib.error.HTTPError as e:
        return e.code, e.read(), time.perf_counter() - start


def task_cycle(base):
    """Create -> get -> update -> list -> delete. Returns list of latencies."""
    latencies = []
    status, body, dt = call(
        "POST", f"{base}/api/tasks",
        {"title": f"task-{random.randint(1, 1_000_000)}", "status": random.choice(STATUSES)},
    )
    latencies.append(dt)
    if status != 201:
        return latencies, status
    task_id = json.loads(body)["id"]

    for method, url, payload in [
        ("GET", f"{base}/api/tasks/{task_id}", None),
        ("PUT", f"{base}/api/tasks/{task_id}", {"status": "done"}),
        ("GET", f"{base}/api/tasks", None),
        ("DELETE", f"{base}/api/tasks/{task_id}", None),
    ]:
        _, _, dt = call(method, url, payload)
        latencies.append(dt)
    return latencies, status


def smoke(base):
    print(f"Smoke test against {base}")
    checks = [
        ("GET", "/health", None, 200),
        ("GET", "/ready", None, 200),
        ("GET", "/metrics", None, 200),
        ("GET", "/api/hello?name=Smoke", None, 200),
    ]
    ok = True
    for method, path, body, expected in checks:
        status, _, dt = call(method, base + path, body)
        mark = "OK " if status == expected else "FAIL"
        if status != expected:
            ok = False
        print(f"  [{mark}] {method} {path} -> {status} ({dt*1000:.0f} ms)")

    status, _, _ = call("POST", f"{base}/api/tasks", {"title": "smoke"})
    print(f"  [{'OK ' if status in (201, 503) else 'FAIL'}] POST /api/tasks -> {status}"
          f"{'  (503 = DB not configured, expected without a DB)' if status == 503 else ''}")
    return ok


def main():
    ap = argparse.ArgumentParser(description="Load generator / smoke test for devops-app")
    ap.add_argument("--url", default="http://localhost:3000", help="Base URL")
    ap.add_argument("--requests", type=int, default=100, help="Number of task cycles")
    ap.add_argument("--concurrency", type=int, default=10, help="Concurrent workers")
    ap.add_argument("--smoke", action="store_true", help="Run a single smoke pass and exit")
    args = ap.parse_args()

    base = args.url.rstrip("/")

    if args.smoke:
        sys.exit(0 if smoke(base) else 1)

    print(f"Load test: {args.requests} cycles, concurrency={args.concurrency}, target={base}")
    all_latencies = []
    errors = 0
    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = [pool.submit(task_cycle, base) for _ in range(args.requests)]
        for fut in as_completed(futures):
            latencies, status = fut.result()
            all_latencies.extend(latencies)
            if status not in (200, 201):
                errors += 1
    elapsed = time.perf_counter() - start

    flat = [l * 1000 for l in all_latencies]  # ms
    flat.sort()
    p95 = flat[int(len(flat) * 0.95)] if flat else 0
    print("\nResults")
    print(f"  cycles:        {args.requests} ({errors} with errors)")
    print(f"  requests:      {len(flat)}")
    print(f"  elapsed:       {elapsed:.2f}s  ({len(flat)/elapsed:.1f} req/s)")
    if flat:
        print(f"  latency avg:   {statistics.mean(flat):.1f} ms")
        print(f"  latency p95:   {p95:.1f} ms")
        print(f"  latency max:   {flat[-1]:.1f} ms")


if __name__ == "__main__":
    main()
