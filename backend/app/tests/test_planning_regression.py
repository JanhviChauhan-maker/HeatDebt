import pytest
from datetime import datetime, timezone, timedelta
import zoneinfo

from app.schemas.task import TaskInput
from app.schemas.site import Site
from app.schemas.weather import WeatherData, WeatherDataPoint
from app.schemas.policy import SafetyPolicy
from app.schemas.plan import OutcomeEnum
from app.services.planning_service import evaluate_plan

from app.schemas.plan import Provenance
def get_mock_provenance():
    return Provenance(
        data_source="Test",
        data_kind="demo",
        fetch_timestamp=datetime(2026, 10, 9, 0, 0, tzinfo=timezone.utc).isoformat(),
        timezone="Asia/Kolkata",
        policy_metadata={"policy": "Regression Policy"}
    )

def test_15_minute_candidate_granularity_resolves_escalation():
    """
    Test that an earliest_start falling off-hour (e.g. xx:58) doesn't skip
    the safe operating window because candidates now iterate by 15-minutes natively.
    """
    # Issue A: 16:58 UTC = 22:28 IST
    t_earliest = datetime(2026, 10, 9, 16, 58, 0, tzinfo=timezone.utc) 
    t_planned = t_earliest + timedelta(hours=2)
    # Give a wide 24 hour deadline to ensure candidates process
    t_deadline = t_earliest + timedelta(hours=24) 

    task = TaskInput(
        name="Granularity Test",
        site="Alpha",
        earliest_start=t_earliest.isoformat(),
        planned_start=t_planned.isoformat(),
        duration=120, # 2 hours
        deadline=t_deadline.isoformat(),
        workload="moderate",
        urgency="normal",
        can_reschedule=True,
        can_split=False
    )

    site = Site(
        name="Alpha", latitude=23.02, longitude=72.57,
        timezone="Asia/Kolkata", operating_window_start="06:00", operating_window_end="18:00"
    )

    policy = SafetyPolicy(
        name="Demo", version="1",
        screening_metric="Apparent Temperature",
        workload_specific_thresholds={"light": 32.0, "moderate": 30.0, "heavy": 28.0},
        source="Test",
        is_demo_placeholder=True
    )

    prov = get_mock_provenance()

    points = []
    # Mock Weather perfectly safe (25C) all through Oct 10 
    c_time = datetime(2026, 10, 9, 22, 0, tzinfo=zoneinfo.ZoneInfo("Asia/Kolkata"))
    end_time = datetime(2026, 10, 10, 23, 0, tzinfo=zoneinfo.ZoneInfo("Asia/Kolkata"))
    while c_time <= end_time:
        points.append(WeatherDataPoint(timestamp=c_time, apparent_temperature=25.0))
        c_time += timedelta(hours=1)

    weather = WeatherData(points=points)

    # In 1 hour grid, candidate generated at 06:28 IST ends at 08:28 IST. If weather was HOT at 08:00, it would fail.
    # To truly prove 15-minute granularity works, let's make 08:00 IST UNSAFE!
    # A candidate at 06:00 IST finishes at 08:00 IST (avoids the hot weather).
    for p in weather.points:
        if p.timestamp.hour >= 8 and p.timestamp.hour <= 18:
            p.apparent_temperature = 40.0 # Unsafe for moderate (30.0 limit)

    # Evaluate! 06:00 to 08:00 should be the ONLY safe 2-hour window!
    res = evaluate_plan(task, site, weather, policy, prov)
    
    assert res.outcome == OutcomeEnum.RESCHEDULE, f"Should find 06:00 window, but got: {res.outcome}. Rejections: {res.rejected_candidate_explanations}"
    assert res.proposed_plan is not None
    # Verify the proposed plan exactly starts at 06:00 IST (00:30 UTC)
    propsed_start = res.proposed_plan.start_time
    assert propsed_start == datetime(2026, 10, 10, 0, 30, tzinfo=timezone.utc), f"Expected 00:30 UTC, got {propsed_start}"
