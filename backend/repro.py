import asyncio
from datetime import datetime, timezone, timedelta
import zoneinfo

from app.schemas.task import TaskInput
from app.schemas.site import Site
from app.schemas.policy import SafetyPolicy
from app.schemas.weather import WeatherData, WeatherDataPoint
from app.services.planning_service import evaluate_plan

def main():
    test_now = datetime(2026, 10, 9, 16, 58, 0, tzinfo=timezone.utc)
    # This is 22:28 IST

    site = Site(
        name="Alpha", latitude=23.02, longitude=72.57,
        timezone="Asia/Kolkata", operating_window_start="06:00", operating_window_end="18:00"
    )

    t_earliest = test_now
    t_planned = test_now + timedelta(hours=2) # 00:28 IST
    t_deadline = test_now + timedelta(hours=12) # 10:28 IST

    task = TaskInput(
        name="Repro Task",
        site="Alpha",
        earliest_start=t_earliest.isoformat(),
        planned_start=t_planned.isoformat(),
        duration=60,
        deadline=t_deadline.isoformat(),
        workload="light", # 32.0 limit
        urgency="normal",
        can_reschedule=True,
        can_split=False
    )

    policy = SafetyPolicy(
        policy_name="Demo", version="1",
        light_workload_limit=32.0,
        moderate_workload_limit=30.0,
        heavy_workload_limit=28.0
    )

    from app.schemas.plan import Provenance, PolicyMetadata
    prov = Provenance(
        data_source="Test",
        data_kind="test",
        fetch_timestamp=test_now.isoformat(),
        timezone="Asia/Kolkata",
        policy_metadata=PolicyMetadata(policy="Test Policy")
    )

    points = []
    # Generate points from 22:00 IST to next day 12:00 IST
    c_time = datetime(2026, 10, 9, 22, 0, tzinfo=zoneinfo.ZoneInfo("Asia/Kolkata"))
    end_time = datetime(2026, 10, 10, 12, 0, tzinfo=zoneinfo.ZoneInfo("Asia/Kolkata"))
    while c_time <= end_time:
        points.append(WeatherDataPoint(timestamp=c_time, apparent_temperature=20.0)) # SAFE!
        c_time += timedelta(hours=1)

    weather = WeatherData(points=points)

    res = evaluate_plan(task, site, weather, policy, prov)
    print("OUTCOME:", res.outcome)
    print("EXPLANATION:", res.explanation)
    for r in res.rejected_candidate_explanations:
        print(" -", r)

if __name__ == "__main__":
    main()
