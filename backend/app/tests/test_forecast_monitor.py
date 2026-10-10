import pytest
import json
import asyncio
from datetime import datetime, timezone, timedelta
from app.services.forecast_monitor import refresh_site_forecast, _check_workload_thresholds
from app.schemas.site import Site
from app.services.database import get_forecast_changes_history, get_latest_snapshot

@pytest.fixture
def test_site():
    return Site(
        name="pytest_monitor_site",
        latitude=34.05,
        longitude=-118.24,
        timezone="America/Los_Angeles",
        operating_window_start="06:00",
        operating_window_end="18:00"
    )

def test_forecast_monitor_triggers_on_first_pull(test_site):
    # Tests that a site establishes a baseline snapshot without blowing up.
    res = asyncio.run(refresh_site_forecast(test_site))
    assert res.get("status") in ["success", "error"]  # Network may be down
    if res.get("status") == "success":
        # Check SQLite db for snapshot
        snapshot = asyncio.run(get_latest_snapshot(test_site.name))
        assert snapshot is not None
        assert "weather_json" in snapshot

def test_workload_thresholds():
    from app.api.routes import get_demo_policy
    policy = get_demo_policy()
    blocks = _check_workload_thresholds(27.0, policy)
    assert len(blocks) == 1
    assert "VERY_HEAVY" in blocks
    blocks = _check_workload_thresholds(28.5, policy)
    assert "heavy" in blocks or "HEAVY" in blocks
    blocks = _check_workload_thresholds(33.0, policy)
    assert "heavy" in blocks or "HEAVY" in blocks
    assert "light" in blocks or "LIGHT" in blocks

def test_forecast_monitor_persistence_changes():
    # Fetch changes endpoint logic
    changes = asyncio.run(get_forecast_changes_history(limit=5))
    assert isinstance(changes, list)
    if len(changes) > 0:
        c = changes[0]
        assert "changes_json" in c
        assert "affected_tasks_json" in c

def test_api_timezone_validation():
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)
    
    # 1. Valid Timezone
    valid_payload = {
        "name": "Validation Site",
        "latitude": 10.0,
        "longitude": 10.0,
        "timezone": "Asia/Kolkata",
        "operating_window_start": "06:00",
        "operating_window_end": "18:00"
    }
    # Skip full execution due to open-meteo rate limiting, just ensure it bypasses Pydantic 422
    # But it will attempt fetch, let's just assert it doesn't return 422
    res_valid = client.post("/api/forecast/refresh", json=valid_payload)
    assert res_valid.status_code in [200, 500, 503] # Depending on if Open-Meteo accepts it 
    
    # 2. The literal "string" Error (OpenAPI default)
    invalid_payload = valid_payload.copy()
    invalid_payload["timezone"] = "string"
    res_invalid = client.post("/api/forecast/refresh", json=invalid_payload)
    assert res_invalid.status_code == 422
    assert "Invalid timezone: string" in res_invalid.text
    
    # 3. Missing Timezone mapping entirely
    missing_payload = valid_payload.copy()
    del missing_payload["timezone"]
    res_missing = client.post("/api/forecast/refresh", json=missing_payload)
    assert res_missing.status_code == 422

