from fastapi.testclient import TestClient
from app.main import app
from app.schemas.task import TaskInput
from app.schemas.site import Site
from app.schemas.weather import WeatherDataPoint
from app.schemas.plan import PlanResult, OutcomeEnum, Provenance
from datetime import datetime, timedelta, timezone
import pytest

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_root():
    response = client.get("/")
    assert response.status_code == 200

def test_docs():
    response = client.get("/docs")
    assert response.status_code == 200

def test_valid_task():
    task_data = {
        "name": "Digging trench",
        "site": "Site Alpha",
        "earliest_start": datetime.now(timezone.utc).isoformat(),
        "planned_start": datetime.now(timezone.utc).isoformat(),
        "duration": 60,
        "deadline": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
        "workload": "heavy",
        "urgency": "normal",
        "can_reschedule": True,
        "can_split": False
    }
    task = TaskInput(**task_data)
    assert task.duration == 60
    assert task.workload == "heavy"

def test_invalid_task_duration():
    task_data = {
        "name": "Quick check",
        "site": "Site Alpha",
        "earliest_start": datetime.now(timezone.utc).isoformat(),
        "planned_start": datetime.now(timezone.utc).isoformat(),
        "duration": 10, # Invalid, < 15
        "deadline": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
        "workload": "light",
        "urgency": "low",
        "can_reschedule": True,
        "can_split": False
    }
    with pytest.raises(ValueError, match="Duration must be between 15 and 720 minutes"):
        TaskInput(**task_data)

def test_invalid_site_coordinates():
    site_data = {
        "name": "Invalid Site",
        "latitude": 100.0, # Invalid > 90
        "longitude": 0.0,
        "timezone": "UTC",
        "operating_window_start": "06:00",
        "operating_window_end": "18:00"
    }
    with pytest.raises(ValueError, match="Latitude must be between -90 and 90"):
        Site(**site_data)

def test_missing_weather_metrics_are_none():
    dp = WeatherDataPoint(timestamp=datetime.now(timezone.utc))
    assert dp.apparent_temperature is None
    assert dp.air_temperature is None
    assert dp.relative_humidity is None
    assert dp.wind_speed is None
    assert dp.solar_radiation is None

def test_plan_result_escalate_cannot_have_proposed_plan():
    prov = Provenance(
        data_source="mock",
        data_kind="demo",
        fetch_timestamp=datetime.now(timezone.utc),
        timezone="UTC",
        policy_metadata={}
    )
    
    with pytest.raises(ValueError, match="proposed_plan must be null when outcome is ESCALATE"):
        PlanResult(
            outcome=OutcomeEnum.ESCALATE,
            explanation="Unsafe conditions",
            original_assessment="Over limit",
            proposed_plan={"start_time": datetime.now(timezone.utc), "end_time": datetime.now(timezone.utc), "adjustments": []},
            provenance=prov
        )

def test_plan_result_insufficient_data_cannot_have_proposed_plan():
    prov = Provenance(
        data_source="mock",
        data_kind="demo",
        fetch_timestamp=datetime.now(timezone.utc),
        timezone="UTC",
        policy_metadata={}
    )
    
    with pytest.raises(ValueError, match="proposed_plan must be null when outcome is INSUFFICIENT_DATA"):
        PlanResult(
            outcome=OutcomeEnum.INSUFFICIENT_DATA,
            explanation="Missing data",
            original_assessment="Unknown condition",
            proposed_plan={"start_time": datetime.now(timezone.utc), "end_time": datetime.now(timezone.utc), "adjustments": []},
            provenance=prov
        )
