from datetime import datetime, timezone, timedelta
import asyncio
from app.schemas.task import TaskInput
from app.schemas.site import Site
from app.schemas.policy import SafetyPolicy
from app.services.planning_service import evaluate_plan
from app.api.routes import get_demo_policy
from app.schemas.plan import Provenance, OutcomeEnum
from app.services.weather_service import fetch_weather

async def run_test():
    site = Site(
        name="Alpha Sector",
        latitude=23.02,
        longitude=72.57,
        timezone="Asia/Kolkata",
        operating_window_start="06:00",
        operating_window_end="18:00"
    )

    t0 = datetime.now()
    earliest_start = datetime(2026, 10, 10, 0, 0, 0, tzinfo=timezone.utc)
    deadline = earliest_start + timedelta(hours=48)
    
    # We want to test different planned_starts that are UNSAFE. 
    # For instance, outside operating hours (e.g. 02:00 in India time)
    # India time is UTC + 5:30. 02:00 IST is 10/09 20:30 UTC
    
    ps1 = datetime(2026, 10, 10, 20, 30, 0, tzinfo=timezone.utc) # Night
    ps2 = datetime(2026, 10, 11, 20, 30, 0, tzinfo=timezone.utc) # Different Night 
    
    weather_data = await fetch_weather(site.latitude, site.longitude, site.timezone, "2026-10-10", "2026-10-12")
    
    policy = get_demo_policy()
    
    for i, ps in enumerate([ps1, ps2]):
        task = TaskInput(
            name="Test Task",
            site="Alpha Sector",
            earliest_start=earliest_start,
            planned_start=ps,
            duration=120,
            deadline=deadline,
            workload="moderate",
            urgency="normal",
            can_reschedule=True,
            can_split=False
        )
        
        prov = Provenance(
            data_source="Test", data_kind="forecast", fetch_timestamp=t0, timezone=site.timezone, policy_metadata={}
        )
        
        result = evaluate_plan(task, site, weather_data, policy, prov)
        print(f"\n--- test_case_{i+1} ---")
        print(f"Requested planned_start: {task.planned_start.isoformat()}")
        print(f"Resulting proposal: {result.proposed_plan.start_time.isoformat() if result.proposed_plan else None}")
        
        # Manually find all feasible for this timeframe
        duration_delta = timedelta(minutes=task.duration)
        feasible = []
        curr = earliest_start
        from app.services.planning_service import _is_within_operating_window, _get_intersecting_points, is_metric_missing, evaluate_hour
        import zoneinfo
        while curr <= deadline - duration_delta:
            c_end = curr + duration_delta
            if _is_within_operating_window(site, curr, c_end):
                c_test = curr
                c_missing = False
                c_safe = True
                while c_test < c_end:
                    sub_end = min(c_test + timedelta(hours=1), c_end)
                    sub_pts = _get_intersecting_points(weather_data, c_test, sub_end)
                    if not sub_pts:
                        c_missing = True; break
                    for p in sub_pts:
                        if is_metric_missing(p, policy): c_missing = True; break
                        safe, _ = evaluate_hour(p, policy, task.workload)
                        if not safe: c_safe = False; break
                    if c_missing or not c_safe: break
                    c_test = sub_end
                if c_safe and not c_missing:
                    feasible.append(curr.isoformat())
            curr += timedelta(minutes=15)
        print(f"Total feasible windows found: {len(feasible)}")
        print(f"Sample of feasible windows: {feasible[:5]} ...")


if __name__ == "__main__":
    asyncio.run(run_test())
