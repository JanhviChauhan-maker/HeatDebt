from datetime import datetime, timedelta, timezone
import pytest

from app.schemas.task import TaskInput
from app.schemas.site import Site
from app.schemas.weather import WeatherData, WeatherDataPoint
from app.schemas.policy import SafetyPolicy
from app.schemas.plan import OutcomeEnum, Provenance

from app.services.planning_service import evaluate_plan

@pytest.fixture
def test_now():
    return datetime(2024, 6, 1, 0, 0, tzinfo=timezone.utc)

@pytest.fixture
def base_site():
    return Site(
        name="Alpha", latitude=10.0, longitude=20.0, timezone="UTC",
        operating_window_start="06:00", operating_window_end="18:00"
    )

@pytest.fixture
def base_policy():
    return SafetyPolicy(
        name="Demo Heat Policy", version="v1", screening_metric="Apparent Temperature",
        workload_specific_thresholds={"heavy": 31.0, "moderate": 33.0},
        source="Demo", is_demo_placeholder=True
    )

@pytest.fixture
def base_provenance():
    from app.schemas.plan import Provenance
    return Provenance(
        data_source="Test",
        data_kind="demo",
        fetch_timestamp=datetime.now(timezone.utc).isoformat(),
        timezone="UTC",
        policy_metadata={"policy": "Test Policy"}
    )

def _build_task(earliest_start, planned_start, duration, deadline, urgency="normal"):
    return TaskInput(
        name="Test", site="Alpha", earliest_start=earliest_start,
        planned_start=planned_start, duration=duration, deadline=deadline,
        workload="heavy", urgency=urgency, can_reschedule=True, can_split=False
    )

def test_urgent_afternoon(test_now, base_site, base_policy, base_provenance):
    # Hot afternoon (not safe), cool morning (safe, alternative)
    weather = WeatherData(points=[
        WeatherDataPoint(timestamp=test_now + timedelta(hours=8), apparent_temperature=25.0), # 8am safe
        WeatherDataPoint(timestamp=test_now + timedelta(hours=14), apparent_temperature=35.0) # 2pm unsafe
    ])
    
    task = _build_task(
        earliest_start=test_now + timedelta(hours=6),
        planned_start=test_now + timedelta(hours=14), # 2pm planned
        duration=60,
        deadline=test_now + timedelta(hours=18),
        urgency="critical"  # Urgency does not change environmental safety
    )
    
    result = evaluate_plan(task, base_site, weather, base_policy, base_provenance)
    
    assert result.outcome == OutcomeEnum.RESCHEDULE
    assert result.proposed_plan is not None
    assert result.proposed_plan.start_time == test_now + timedelta(hours=8)
    assert "Exceeds heavy limit of 31.0" in result.original_assessment

def test_cool_morning(test_now, base_site, base_policy, base_provenance):
    # Planned in morning, safe
    weather = WeatherData(points=[
        WeatherDataPoint(timestamp=test_now + timedelta(hours=8), apparent_temperature=25.0), 
    ])
    task = _build_task(
        earliest_start=test_now + timedelta(hours=6),
        planned_start=test_now + timedelta(hours=8), # 8am planned
        duration=60,
        deadline=test_now + timedelta(hours=18)
    )
    
    result = evaluate_plan(task, base_site, weather, base_policy, base_provenance)
    
    assert result.outcome == OutcomeEnum.PROCEED
    assert result.original_assessment == "Safe"
    assert result.proposed_plan is None

def test_extreme(test_now, base_site, base_policy, base_provenance):
    # All windows are hot
    weather = WeatherData(points=[
        WeatherDataPoint(timestamp=test_now + timedelta(hours=8), apparent_temperature=35.0), 
        WeatherDataPoint(timestamp=test_now + timedelta(hours=14), apparent_temperature=37.0)
    ])
    task = _build_task(
        earliest_start=test_now + timedelta(hours=6),
        planned_start=test_now + timedelta(hours=8),
        duration=60,
        deadline=test_now + timedelta(hours=18)
    )
    
    result = evaluate_plan(task, base_site, weather, base_policy, base_provenance)
    
    assert result.outcome == OutcomeEnum.ESCALATE
    assert result.proposed_plan is None
    assert result.requires_human_review is True

def test_missing_metric(test_now, base_site, base_policy, base_provenance):
    # Metrics missing for required screening metric
    weather = WeatherData(points=[
        WeatherDataPoint(timestamp=test_now + timedelta(hours=8), apparent_temperature=None) 
    ])
    task = _build_task(
        earliest_start=test_now + timedelta(hours=6),
        planned_start=test_now + timedelta(hours=8),
        duration=60,
        deadline=test_now + timedelta(hours=18)
    )
    result = evaluate_plan(task, base_site, weather, base_policy, base_provenance)
    
    assert result.outcome == OutcomeEnum.INSUFFICIENT_DATA
    assert result.proposed_plan is None
    
def test_missed_deadline(test_now, base_site, base_policy, base_provenance):
    # Afternoon is safe, but past deadline
    weather = WeatherData(points=[
        WeatherDataPoint(timestamp=test_now + timedelta(hours=8), apparent_temperature=35.0), # unsafe morning
        WeatherDataPoint(timestamp=test_now + timedelta(hours=14), apparent_temperature=25.0)  # safe afternoon
    ])
    task = _build_task(
        earliest_start=test_now + timedelta(hours=6),
        planned_start=test_now + timedelta(hours=8),
        duration=60,
        deadline=test_now + timedelta(hours=12) # Deadline is noon!
    )
    result = evaluate_plan(task, base_site, weather, base_policy, base_provenance)
    
    # Can't schedule at 14:00 because deadline is 12:00. No schedule found -> ESCALATE
    assert result.outcome == OutcomeEnum.ESCALATE
    assert result.proposed_plan is None
    assert result.outcome == OutcomeEnum.ESCALATE
    assert result.proposed_plan is None
    assert len(result.rejected_candidate_explanations) > 0

def test_invariance_environmental_classification_urgency_and_deadline(test_now, base_site, base_policy, base_provenance):
    # Probing what happens if we pump urgency. The engine should STILL reject if the conditions are extreme
    weather = WeatherData(points=[
        WeatherDataPoint(timestamp=test_now + timedelta(hours=8), apparent_temperature=40.0) 
    ])
    # Case 1: Normal
    task1 = _build_task(test_now, test_now + timedelta(hours=8), 60, test_now + timedelta(hours=18), "normal")
    
    # Case 2: Critical with immediate deadline
    task2 = _build_task(test_now, test_now + timedelta(hours=8), 60, test_now + timedelta(hours=10), "critical")
    
    r1 = evaluate_plan(task1, base_site, weather, base_policy, base_provenance)
    r2 = evaluate_plan(task2, base_site, weather, base_policy, base_provenance)
    
    assert r1.outcome == OutcomeEnum.ESCALATE
    assert r2.outcome == OutcomeEnum.ESCALATE
    assert r1.original_assessment == r2.original_assessment # Assessment should not differ due to urgency

def test_outside_operating_window(test_now, base_site, base_policy, base_provenance):
    # Operating window is 06:00 to 18:00 UTC.
    # Plan is perfectly safe temperature-wise, but at night (20:00 UTC)
    weather = WeatherData(points=[
        WeatherDataPoint(timestamp=test_now + timedelta(hours=20), apparent_temperature=20.0), 
    ])
    task = _build_task(
        earliest_start=test_now + timedelta(hours=6),
        planned_start=test_now + timedelta(hours=20), # 8pm planned
        duration=60,
        deadline=test_now + timedelta(hours=24)
    )
def test_24_hour_window(test_now, base_site, base_policy, base_provenance):
    # Operating window 00:00 to 00:00 natively approves all times.
    base_site.operating_window_start = "00:00"
    base_site.operating_window_end = "00:00"
    
    weather = WeatherData(points=[
        WeatherDataPoint(timestamp=test_now + timedelta(hours=20), apparent_temperature=20.0), 
    ])
    task = _build_task(
        earliest_start=test_now + timedelta(hours=6),
        planned_start=test_now + timedelta(hours=20), # 8pm planned
        duration=60,
        deadline=test_now + timedelta(hours=24)
    )
    result = evaluate_plan(task, base_site, weather, base_policy, base_provenance)
    
    assert result.outcome == OutcomeEnum.PROCEED
    
def test_overnight_operating_window_approval(test_now, base_site, base_policy, base_provenance):
    # Facility runs 22:00 to 04:00.
    base_site.operating_window_start = "22:00"
    base_site.operating_window_end = "04:00"
    
    weather = WeatherData(points=[
        WeatherDataPoint(timestamp=test_now + timedelta(hours=23), apparent_temperature=20.0), # 23:00 UTC
    ])
    task = _build_task(
        earliest_start=test_now + timedelta(hours=6),
        planned_start=test_now + timedelta(hours=23), # 23:00 planned
        duration=120, # Ends at 01:00 NEXT day.
        deadline=test_now + timedelta(hours=48)
    )
    
    result = evaluate_plan(task, base_site, weather, base_policy, base_provenance)
    # Since 23:00 to 01:00 is within 22:00 to 04:00, it should PROCEED.
    assert result.outcome == OutcomeEnum.PROCEED
    
def test_overnight_operating_window_rejection_day(test_now, base_site, base_policy, base_provenance):
    # Facility runs 22:00 to 04:00. Task tries 14:00 (broad daylight).
    base_site.operating_window_start = "22:00"
    base_site.operating_window_end = "04:00"
    
    weather = WeatherData(points=[
        WeatherDataPoint(timestamp=test_now + timedelta(hours=14), apparent_temperature=20.0),
        WeatherDataPoint(timestamp=test_now + timedelta(hours=22), apparent_temperature=40.0),
        WeatherDataPoint(timestamp=test_now + timedelta(hours=23), apparent_temperature=40.0),
        WeatherDataPoint(timestamp=test_now + timedelta(hours=24), apparent_temperature=40.0),
    ])
    task = _build_task(test_now, test_now + timedelta(hours=14), 60, test_now + timedelta(hours=24))
    result = evaluate_plan(task, base_site, weather, base_policy, base_provenance)
    
    assert result.outcome == OutcomeEnum.ESCALATE
    assert "Original plan falls outside operating window" in result.original_assessment

def test_reschedule_valid_within_bounds(test_now, base_site, base_policy, base_provenance):
    # Facility runs 06:00 to 18:00
    base_site.operating_window_start = "06:00"
    base_site.operating_window_end = "18:00"
    
    # Task originally planned for 12:00 (too hot)
    task = _build_task(test_now + timedelta(hours=10), test_now + timedelta(hours=12), 120, test_now + timedelta(hours=18))
    task.workload = "heavy"
    task.can_reschedule = True
    
    # Weather is unsafe at 12:00, but safe at 14:00 and 15:00
    weather = WeatherData(points=[
        WeatherDataPoint(timestamp=test_now + timedelta(hours=12), apparent_temperature=35.0),
        WeatherDataPoint(timestamp=test_now + timedelta(hours=13), apparent_temperature=35.0),
        WeatherDataPoint(timestamp=test_now + timedelta(hours=14), apparent_temperature=20.0),
        WeatherDataPoint(timestamp=test_now + timedelta(hours=15), apparent_temperature=20.0),
        WeatherDataPoint(timestamp=test_now + timedelta(hours=16), apparent_temperature=20.0),
        WeatherDataPoint(timestamp=test_now + timedelta(hours=17), apparent_temperature=20.0),
    ])
    
    result = evaluate_plan(task, base_site, weather, base_policy, base_provenance)
    
    assert result.outcome == OutcomeEnum.RESCHEDULE
    assert result.proposed_plan is not None
    assert result.proposed_plan.start_time == test_now + timedelta(hours=14)
    assert result.proposed_plan.end_time == test_now + timedelta(hours=16)
