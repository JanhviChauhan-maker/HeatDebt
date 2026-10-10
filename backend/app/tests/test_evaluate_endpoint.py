import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
from datetime import datetime, timezone, timedelta

from app.main import app
from app.schemas.weather import WeatherData, WeatherDataPoint
from app.services.weather_service import WeatherUnavailableException

client = TestClient(app)

def _build_payload(deadline_offset=18):
    now = datetime(2025, 1, 1, 0, 0, tzinfo=timezone.utc)
    return {
        "task": {
            "name": "Integration Task",
            "site": "Alpha",
            "earliest_start": (now + timedelta(hours=6)).isoformat(),
            "planned_start": (now + timedelta(hours=8)).isoformat(),
            "duration": 60,
            "deadline": (now + timedelta(hours=deadline_offset)).isoformat(),
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

def test_evaluate_endpoint_success_proceed():
    payload = _build_payload()
    
    mock_weather = WeatherData(points=[
        WeatherDataPoint(
            timestamp=datetime.fromisoformat(payload["task"]["planned_start"]),
            apparent_temperature=20.0 # Cool and safe (limit is 28)
        )
    ])
    
    with patch('app.api.routes.fetch_weather', new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = mock_weather
        
        response = client.post("/api/plans/evaluate", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["outcome"] == "PROCEED"
        assert data["proposed_plan"] is None

def test_evaluate_endpoint_reschedule():
    payload = _build_payload()
    
    mock_weather = WeatherData(points=[
        WeatherDataPoint(
            # Unsafe at 8am
            timestamp=datetime.fromisoformat(payload["task"]["planned_start"]),
            apparent_temperature=35.0 
        ),
        WeatherDataPoint(
            # Safe at 10am
            timestamp=datetime.fromisoformat(payload["task"]["planned_start"]) + timedelta(hours=2),
            apparent_temperature=20.0 
        )
    ])
    
    with patch('app.api.routes.fetch_weather', new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = mock_weather
        response = client.post("/api/plans/evaluate", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["outcome"] == "RESCHEDULE"

def test_evaluate_endpoint_weather_unavailable():
    payload = _build_payload()
    
    with patch('app.api.routes.fetch_weather', new_callable=AsyncMock) as mock_fetch:
        mock_fetch.side_effect = WeatherUnavailableException("Mocked network error")
        
        response = client.post("/api/plans/evaluate", json=payload)
        
        # Graceful handling returning INSUFFICIENT_DATA
        assert response.status_code == 200
        data = response.json()
        assert data["outcome"] == "INSUFFICIENT_DATA"
        assert "Live weather could not be retrieved" in data["explanation"]
        assert data["proposed_plan"] is None

def test_evaluate_endpoint_missed_deadline():
    # Deadline is tight, at 9am
    payload = _build_payload(deadline_offset=9)
    
    mock_weather = WeatherData(points=[
        WeatherDataPoint(
            # Unsafe at 8am
            timestamp=datetime.fromisoformat(payload["task"]["planned_start"]),
            apparent_temperature=35.0 
        ),
        WeatherDataPoint(
            # Safe at 10am but past deadline!
            timestamp=datetime.fromisoformat(payload["task"]["planned_start"]) + timedelta(hours=2),
            apparent_temperature=20.0 
        )
    ])
    with patch('app.api.routes.fetch_weather', new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = mock_weather
        response = client.post("/api/plans/evaluate", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["outcome"] == "ESCALATE"
        assert data["proposed_plan"] is None
        
def test_evaluate_endpoint_missing_metrics():
    payload = _build_payload()
    
    mock_weather = WeatherData(points=[
        WeatherDataPoint(
            timestamp=datetime.fromisoformat(payload["task"]["planned_start"]),
            apparent_temperature=None # Missing required screening metric
        )
    ])
    
    with patch('app.api.routes.fetch_weather', new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = mock_weather
        
        response = client.post("/api/plans/evaluate", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["outcome"] == "INSUFFICIENT_DATA"
        assert data["proposed_plan"] is None

def test_evaluate_endpoint_invalid_coordinates():
    # Scenario D Part 1: Schema validation blocks physically impossible ranges
    payload = _build_payload()
    payload["site"]["latitude"] = 999.0
    
    response = client.post("/api/plans/evaluate", json=payload)
    assert response.status_code == 422
