import pytest
import asyncio
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
from datetime import datetime, timezone, timedelta

from app.main import app
from app.schemas.weather import WeatherData, WeatherDataPoint
from app.schemas.plan import PlanResult

client = TestClient(app)

def _build_payload():
    now = datetime(2025, 1, 1, 0, 0, tzinfo=timezone.utc)
    return {
        "task": {
            "name": "Integration Task",
            "site": "Alpha",
            "earliest_start": (now + timedelta(hours=6)).isoformat(),
            "planned_start": (now + timedelta(hours=8)).isoformat(),
            "duration": 60,
            "deadline": (now + timedelta(hours=18)).isoformat(),
            "workload": "heavy",
            "urgency": "normal",
            "can_reschedule": True,
            "can_split": False
        },
        "site": {
            "name": "Site Alpha",
            "latitude": 10.0,
            "longitude": 20.0,
            "timezone": "UTC",
            "operating_window_start": "06:00",
            "operating_window_end": "18:00"
        }
    }

@patch('app.api.routes.save_evaluation', new_callable=AsyncMock)
@patch('app.api.routes.fetch_weather', new_callable=AsyncMock)
def test_evaluate_endpoint_normal_saves_history(mock_fetch, mock_save):
    payload = _build_payload()
    
    mock_weather = WeatherData(points=[
        WeatherDataPoint(
            timestamp=datetime.fromisoformat(payload["task"]["planned_start"]),
            apparent_temperature=20.0
        )
    ])
    mock_fetch.return_value = mock_weather
    
    response = client.post("/api/plans/evaluate", json=payload)
    assert response.status_code == 200
    
    # Wait for the background task to be scheduled and executed
    # Note: Starlette TestClient runs background tasks immediately in older versions, 
    # but asyncio.create_task in endpoint might need a small event loop tick if not awaited.
    # We can just verify if the mock was called. In standard fastapi test client, 
    # asyncio.create_task might execute immediately or right after response.
    # Let's do a strict check.
    
    assert mock_save.called, "Normal requests must save history."
    args, kwargs = mock_save.call_args
    assert not args[0].simulate

@patch('app.api.routes.save_evaluation', new_callable=AsyncMock)
@patch('app.api.routes.fetch_weather', new_callable=AsyncMock)
def test_evaluate_endpoint_simulate_skips_history(mock_fetch, mock_save):
    payload = _build_payload()
    payload["simulate"] = True
    
    mock_weather = WeatherData(points=[
        WeatherDataPoint(
            timestamp=datetime.fromisoformat(payload["task"]["planned_start"]),
            apparent_temperature=20.0
        )
    ])
    mock_fetch.return_value = mock_weather
    
    response = client.post("/api/plans/evaluate", json=payload)
    assert response.status_code == 200
    
    assert not mock_save.called, "Simulated requests must NEVER save history."

@patch('app.api.routes.fetch_weather', new_callable=AsyncMock)
def test_evaluate_endpoint_simulate_scenario_differences(mock_fetch):
    # Test that different simulated workloads yield different outcomes on the same weather
    base = _build_payload()
    base["simulate"] = True
    
    moderate_payload = _build_payload()
    moderate_payload["simulate"] = True
    moderate_payload["task"]["workload"] = "moderate"
    
    mock_weather = WeatherData(points=[
        WeatherDataPoint(
            timestamp=datetime.fromisoformat(base["task"]["planned_start"]),
            apparent_temperature=29.0 # Heavy limit is 28, Moderate limit is 30
        )
    ])
    mock_fetch.return_value = mock_weather
    
    response_heavy = client.post("/api/plans/evaluate", json=base)
    response_mod = client.post("/api/plans/evaluate", json=moderate_payload)
    
    assert response_heavy.status_code == 200
    assert response_mod.status_code == 200
    
    heavy_data = response_heavy.json()
    mod_data = response_mod.json()
    
    assert heavy_data["outcome"] != "PROCEED", "Heavy workload should fail at 29C."
    assert mod_data["outcome"] == "PROCEED", "Moderate workload should pass at 29C."
