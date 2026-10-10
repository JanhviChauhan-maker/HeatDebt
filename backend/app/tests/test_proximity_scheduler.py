import pytest
from datetime import datetime, timezone, timedelta
import zoneinfo

from app.schemas.task import TaskInput
from app.schemas.site import Site
from app.schemas.weather import WeatherData, WeatherDataPoint
from app.schemas.policy import SafetyPolicy
from app.schemas.plan import PlanResult, OutcomeEnum, Provenance

from app.services.planning_service import evaluate_plan

def create_mock_weather(start: datetime, end: datetime, tz: str) -> WeatherData:
    zone = zoneinfo.ZoneInfo(tz)
    points = []
    curr = start
    while curr < end:
        # Create a simple safe weather profile: 
        # Coolest around 04:00-08:00 (22 C), warms to 32 C at 14:00, cools to 26 C at 20:00
        hour = curr.astimezone(zone).hour
        if 4 <= hour <= 8: apparent = 23.0
        elif 9 <= hour <= 12: apparent = 28.0
        elif 13 <= hour <= 16: apparent = 35.0  # UNSAFE for moderate workload (>30.0)
        elif 17 <= hour <= 19: apparent = 29.0
        else: apparent = 24.0

        p = WeatherDataPoint(
            timestamp=curr,
            temperature=20.0,
            humidity=50.0,
            apparent_temperature=apparent,
            wind_speed=10.0,
            cloud_cover=0.0
        )
        points.append(p)
        curr += timedelta(hours=1)
    
    return WeatherData(
        latitude=0.0,
        longitude=0.0,
        timezone=tz,
        elevation=0.0,
        fetch_timestamp=datetime.now(timezone.utc),
        points=points
    )

@pytest.fixture
def base_site():
    return Site(
        name="Test Proximity Site",
        latitude=0.0,
        longitude=0.0,
        timezone="Asia/Kolkata",
        operating_window_start="06:00",
        operating_window_end="22:00"
    )

@pytest.fixture
def policy():
    return SafetyPolicy(
        name="Test Policy",
        version="v1",
        screening_metric="Apparent Temperature",
        workload_specific_thresholds={"moderate": 30.0},
        source="Test",
        is_demo_placeholder=True
    )

@pytest.fixture
def provenance():
    return Provenance(
        data_source="mock",
        data_kind="forecast",
        fetch_timestamp=datetime.now(timezone.utc),
        timezone="Asia/Kolkata",
        policy_metadata={}
    )

def test_safe_original_schedule_returns_proceed(base_site, policy, provenance):
    earliest = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    # 02:30 UTC is 08:00 IST (Safe morning)
    planned = datetime(2026, 1, 1, 2, 30, 0, tzinfo=timezone.utc)
    deadline = earliest + timedelta(hours=24)
    
    weather = create_mock_weather(earliest, deadline, base_site.timezone)
    
    task = TaskInput(
        name="T1", site=base_site.name, workload="moderate", urgency="normal", duration=120,
        earliest_start=earliest, planned_start=planned, deadline=deadline,
        can_reschedule=True, can_split=False
    )
    
    res = evaluate_plan(task, base_site, weather, policy, provenance)
    assert res.outcome == OutcomeEnum.PROCEED
    assert res.proposed_plan is None

def test_unsafe_afternoon_picks_closest_feasible_not_0600(base_site, policy, provenance):
    earliest = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    # 08:30 UTC is 14:00 IST (UNSAFE, apparent=35)
    planned = datetime(2026, 1, 1, 8, 30, 0, tzinfo=timezone.utc)
    deadline = earliest + timedelta(hours=24)
    
    weather = create_mock_weather(earliest, deadline, base_site.timezone)
    
    task = TaskInput(
        name="T2", site=base_site.name, workload="moderate", urgency="normal", duration=120,
        earliest_start=earliest, planned_start=planned, deadline=deadline,
        can_reschedule=True, can_split=False
    )
    
    res = evaluate_plan(task, base_site, weather, policy, provenance)
    assert res.outcome == OutcomeEnum.RESCHEDULE
    assert res.proposed_plan.start_time == datetime(2026, 1, 1, 6, 0, 0, tzinfo=timezone.utc)

def test_tiebreaking_distance_picks_earliest(base_site, policy, provenance):
    earliest = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    
    def symmetric_weather(start: datetime, end: datetime, tz: str) -> WeatherData:
        points = []
        curr = start
        while curr < end:
            hour = curr.astimezone(zoneinfo.ZoneInfo(tz)).hour
            app = 25.0 if hour in (10, 11, 14, 15) else 35.0
            points.append(WeatherDataPoint(timestamp=curr, temperature=20.0, humidity=50.0, apparent_temperature=app, wind_speed=10, cloud_cover=0))
            curr += timedelta(hours=1)
        return WeatherData(latitude=0, longitude=0, timezone=tz, elevation=0, fetch_timestamp=datetime.now(timezone.utc), points=points)

    deadline = earliest + timedelta(hours=24)
    planned = datetime(2026, 1, 1, 6, 30, 0, tzinfo=timezone.utc) 
    weather = symmetric_weather(earliest, deadline, base_site.timezone)
    
    task = TaskInput(
        name="T_Tie", site=base_site.name, workload="moderate", urgency="normal", duration=120,
        earliest_start=earliest, planned_start=planned, deadline=deadline,
        can_reschedule=True, can_split=False
    )
    
    res = evaluate_plan(task, base_site, weather, policy, provenance)
    assert res.outcome == OutcomeEnum.RESCHEDULE
    assert res.proposed_plan.start_time == datetime(2026, 1, 1, 5, 0, 0, tzinfo=timezone.utc)

def test_missing_weather_remains_insufficient_data(base_site, policy, provenance):
    earliest = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    planned = datetime(2026, 1, 1, 2, 30, 0, tzinfo=timezone.utc)
    deadline = earliest + timedelta(hours=24)
    
    # Missing all points
    weather = WeatherData(latitude=0, longitude=0, timezone="Asia/Kolkata", elevation=0, fetch_timestamp=datetime.now(timezone.utc), points=[])
    
    task = TaskInput(
        name="T_Miss", site=base_site.name, workload="moderate", urgency="normal", duration=120,
        earliest_start=earliest, planned_start=planned, deadline=deadline,
        can_reschedule=True, can_split=False
    )
    
    res = evaluate_plan(task, base_site, weather, policy, provenance)
    assert res.outcome == OutcomeEnum.INSUFFICIENT_DATA

def test_no_feasible_candidate_returns_escalate(base_site, policy, provenance):
    earliest = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    planned = datetime(2026, 1, 1, 2, 30, 0, tzinfo=timezone.utc)
    deadline = earliest + timedelta(hours=24)
    
    def hot_weather(start: datetime, end: datetime, tz: str) -> WeatherData:
        points = []
        curr = start
        while curr < end:
            points.append(WeatherDataPoint(timestamp=curr, temperature=35.0, humidity=50.0, apparent_temperature=40.0, wind_speed=10, cloud_cover=0))
            curr += timedelta(hours=1)
        return WeatherData(latitude=0, longitude=0, timezone=tz, elevation=0, fetch_timestamp=datetime.now(timezone.utc), points=points)
        
    weather = hot_weather(earliest, deadline, base_site.timezone)
    
    task = TaskInput(
        name="T_Escalate", site=base_site.name, workload="moderate", urgency="normal", duration=120,
        earliest_start=earliest, planned_start=planned, deadline=deadline,
        can_reschedule=True, can_split=False
    )
    
    res = evaluate_plan(task, base_site, weather, policy, provenance)
    assert res.outcome == OutcomeEnum.ESCALATE
    assert "No feasible windows found before deadline" in res.explanation
