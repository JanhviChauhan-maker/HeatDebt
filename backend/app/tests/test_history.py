import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_history_schema_and_pagination():
    response = client.get("/history?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert "limit" in data
    assert data["limit"] == 5
    assert "records" in data
    assert isinstance(data["records"], list)

    records = data["records"]
    if len(records) > 0:
        first = records[0]
        assert "id" in first
        assert "timestamp" in first
        assert "task_name" in first
        assert "outcome" in first
        # Verify workload was added to the sqlite store structurally
        assert "workload" in first

def test_history_simulate_isolation_is_enforced():
    # Submit one real request to ensure it populates
    payload = {
        "task": {
            "name": "Integration Test Task",
            "site": "Test Site",
            "earliest_start": "2026-10-10T06:00:00Z",
            "planned_start": "2026-10-10T08:00:00Z",
            "duration": 60,
            "deadline": "2026-10-10T18:00:00Z",
            "workload": "heavy",
            "urgency": "normal",
            "can_reschedule": True,
            "can_split": False
        },
        "site": {
            "name": "Integration Test Site",
            "latitude": 34.05,
            "longitude": -118.24,
            "timezone": "America/Los_Angeles",
            "operating_window_start": "06:00",
            "operating_window_end": "18:00"
        },
        "simulate": False
    }
    
    # We won't assert the evaluate outcome because it depends on open-meteo, but we can verify the history endpoint.
    res_eval = client.post("/api/plans/evaluate", json=payload)
    assert res_eval.status_code == 200
    
    res_hist = client.get("/history?limit=100")
    assert res_hist.status_code == 200
    
    # Simulating a payload should not add new items
    payload_sim = payload.copy()
    payload_sim["simulate"] = True
    payload_sim["task"]["name"] = "Simulated Ghost Task"
    
    client.post("/api/plans/evaluate", json=payload_sim)
    
    res_hist_after = client.get("/history?limit=100")
    records_after = res_hist_after.json().get("records", [])
    
    for r in records_after:
        assert r["task_name"] != "Simulated Ghost Task", "Simulated task leaked into database history!"
