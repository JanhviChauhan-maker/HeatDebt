import asyncio
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.schemas.task import TaskInput
from app.schemas.site import Site
from app.schemas.plan import PlanResult, OutcomeEnum, Provenance
from app.schemas.weather import WeatherData
from app.schemas.policy import SafetyPolicy

from app.services import weather_service, safety_rules, planning_service
from app.services.database import save_evaluation, get_evaluations_history, get_forecast_changes_history
from app.services.weather_service import fetch_weather, WeatherUnavailableException
from app.services.planning_service import evaluate_plan
from app.services.forecast_monitor import refresh_site_forecast

router = APIRouter()

class EvaluateRequest(BaseModel):
    task: TaskInput
    site: Site
    simulate: bool = False

def get_demo_policy() -> SafetyPolicy:
    return SafetyPolicy(
        name="Demo Heat Policy",
        version="v1.0",
        screening_metric="Apparent Temperature",
        workload_specific_thresholds={
            "light": 32.0,
            "moderate": 30.0,
            "heavy": 28.0,
            "very_heavy": 26.0
        },
        source="Demonstration Defaults",
        is_demo_placeholder=True
    )

@router.get("/api/health")
def health_check():
    return {"status": "ok"}

@router.get("/api/weather")
async def get_weather(lat: float, lon: float, tz: str, start_date: str, end_date: str):
    return await fetch_weather(lat, lon, tz, start_date, end_date)

@router.post("/api/plans/evaluate", response_model=PlanResult)
async def evaluate_plan_endpoint(request: EvaluateRequest):
    site = request.site
    task = request.task
    
    start_date_str = task.earliest_start.strftime("%Y-%m-%d")
    end_date_str = task.deadline.strftime("%Y-%m-%d")
    
    policy = get_demo_policy()
    
    try:
        weather_data = await fetch_weather(
            lat=site.latitude,
            lon=site.longitude,
            tz=site.timezone,
            start_date=start_date_str,
            end_date=end_date_str
        )
    except WeatherUnavailableException:
        prov = Provenance(
            data_source="Open-Meteo",
            data_kind="forecast",
            fetch_timestamp=datetime.now(timezone.utc),
            timezone=site.timezone,
            policy_metadata={"policy": policy.name}
        )
        return PlanResult(
            outcome=OutcomeEnum.INSUFFICIENT_DATA,
            explanation="Live weather could not be retrieved. Evaluation impossible.",
            original_assessment="Missing live weather data.",
            rejected_candidate_explanations=[],
            provenance=prov
        )
        
    prov = Provenance(
        data_source="Open-Meteo",
        data_kind="forecast",
        fetch_timestamp=datetime.now(timezone.utc),
        timezone=site.timezone,
        policy_metadata={"policy": policy.name}
    )

    result = evaluate_plan(task, site, weather_data, policy, prov)
    
    if not request.simulate:
        # Offload persistence safely outside the request loop
        asyncio.create_task(save_evaluation(request, result))
    
    return result

@router.get("/history")
async def get_history(limit: int = 50):
    records = await get_evaluations_history(limit)
    return {"limit": limit, "records": records}

@router.post("/api/forecast/refresh")
async def refresh_forecast(site: Site):
    return await refresh_site_forecast(site)

@router.get("/api/forecast/changes")
async def get_forecast_changes(limit: int = 50):
    records = await get_forecast_changes_history(limit)
    return {"limit": limit, "records": records}
