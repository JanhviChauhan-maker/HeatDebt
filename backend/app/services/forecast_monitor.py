import json
from datetime import datetime, timezone
import zoneinfo
from typing import Dict, Any, List

from app.schemas.site import Site
from app.schemas.task import TaskInput
from app.schemas.weather import WeatherData, WeatherDataPoint
from app.services.weather_service import fetch_weather, WeatherUnavailableException
from app.services.database import get_latest_snapshot, save_forecast_snapshot, save_forecast_change, get_evaluations_history
from app.services.planning_service import evaluate_plan
from app.schemas.plan import Provenance

TOLERANCE_C = 0.5

def _group_by_hour(weather_json: str) -> Dict[str, dict]:
    if not weather_json:
        return {}
    try:
        data = json.loads(weather_json)
        points = data.get("points", [])
        return {p["timestamp"]: p for p in points if p.get("timestamp")}
    except Exception:
        return {}

def _check_workload_thresholds(apparent_temp: float, policy) -> List[str]:
    # Hardcoded workloads from demo policy bounds for quick contextual alerts
    alerts = []
    if policy.workload_specific_thresholds:
        for w, v in policy.workload_specific_thresholds.items():
            if apparent_temp >= v:
                alerts.append(w.upper())
    return alerts

async def refresh_site_forecast(site: Site) -> Dict[str, Any]:
    # 1. Fetch live weather
    start_date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    end_date_str = (datetime.now(timezone.utc)).strftime("%Y-%m-%d")
    
    try:
        current_weather = await fetch_weather(
            lat=site.latitude,
            lon=site.longitude,
            tz=site.timezone,
            start_date=start_date_str,
            end_date=end_date_str
        )
        current_weather_json = current_weather.model_dump_json()
    except WeatherUnavailableException:
        # If open-meteo fails, we abort the change monitor, yielding an error status to the frontend
        return {"status": "error", "message": "Weather telemetry endpoint unreachable."}

    # 2. Get previous snapshot
    prev_snapshot = await get_latest_snapshot(site.name)
    changes = []
    
    from app.api.routes import get_demo_policy
    policy = get_demo_policy()

    if prev_snapshot and prev_snapshot.get("weather_json"):
        prev_points = _group_by_hour(prev_snapshot["weather_json"])
        curr_points = {p.timestamp.isoformat(): p for p in current_weather.points}
        
        # Compare overlapping times
        for t_iso, curr_p in curr_points.items():
            if t_iso in prev_points:
                prev_p = prev_points[t_iso]
                
                prev_val = prev_p.get("apparent_temperature")
                curr_val = curr_p.apparent_temperature
                
                if curr_val is None and prev_val is not None:
                    changes.append({
                        "type": "MISSING_DATA",
                        "timestamp": t_iso,
                        "description": "Forecast metric unexpectedly went blind for this hour.",
                        "prev": prev_val,
                        "curr": curr_val
                    })
                elif curr_val is not None and prev_val is not None:
                    diff = curr_val - prev_val
                    
                    if abs(diff) > TOLERANCE_C:
                        # Check threshold crosses
                        prev_blocked = _check_workload_thresholds(prev_val, policy)
                        curr_blocked = _check_workload_thresholds(curr_val, policy)
                        
                        new_blocks = [b for b in curr_blocked if b not in prev_blocked]
                        cleared_blocks = [b for b in prev_blocked if b not in curr_blocked]
                        
                        severity = "INCREASED_RISK" if diff > 0 else "REDUCED_RISK"
                        
                        desc = f"Heat load shifted from {prev_val:.1f}C to {curr_val:.1f}C."
                        if new_blocks:
                            desc += f" Now exceeding {', '.join(new_blocks)} thresholds."
                            severity = "NEW_POLICY_VIOLATION"
                        elif cleared_blocks:
                            desc += f" Successfully cleared {', '.join(cleared_blocks)} thresholds."
                            
                        changes.append({
                            "type": severity,
                            "timestamp": t_iso,
                            "description": desc,
                            "prev": prev_val,
                            "curr": curr_val
                        })

    # 3. Deduplicate / Prune Changes to meaningful ones
    # (Done inherently by bounds/tolerance checks)

    # 4. Save latest snapshot if differing
    # We always save it to roll forward the window
    await save_forecast_snapshot(site.name, site.latitude, site.longitude, site.timezone, "Open-Meteo", current_weather_json)
    
    # 5. Re-evaluate Tasks Non-Destructively
    affected_tasks = []
    if changes or not prev_snapshot:
        history = await get_evaluations_history(200)
        
        # Find tasks originally scoped to the future
        for rec in history:
            if rec.get("site_name") == site.name and rec.get("original_task_json"):
                try:
                    task_data = json.loads(rec["original_task_json"])
                    task_input = TaskInput(**task_data)
                    
                    if task_input.planned_start > datetime.now(timezone.utc):
                        # Task is strictly in the future, eligible for re-evaluation
                        prov = Provenance(
                            data_source="Forecaster",
                            data_kind="forecast",
                            fetch_timestamp=datetime.now(timezone.utc),
                            timezone=site.timezone,
                            policy_metadata={"policy": policy.name}
                        )
                        
                        # evaluate_plan operates purely deterministically in memory, it doesn't mutate db
                        plan_result = evaluate_plan(task_input, site, current_weather, policy, prov)
                        
                        previous_outcome = rec.get("outcome")
                        if plan_result.outcome.value != previous_outcome:
                            affected_tasks.append({
                                "task_name": task_input.name,
                                "workload": task_input.workload,
                                "previous_outcome": previous_outcome,
                                "new_outcome": plan_result.outcome.value,
                                "new_explanation": plan_result.explanation
                            })
                except Exception as e:
                    print(f"Failed parsing historic task {rec.get('id')}: {e}")

    # 6. Push Changes feed to DB (Only if there are variations)
    if changes or affected_tasks:
        await save_forecast_change(site.name, json.dumps(changes), json.dumps(affected_tasks))
        
    return {
        "status": "success",
        "changes_detected": len(changes),
        "affected_count": len(affected_tasks),
        "changes": changes,
        "affected_tasks": affected_tasks
    }
