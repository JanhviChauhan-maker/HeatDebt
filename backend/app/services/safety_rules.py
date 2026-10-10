from app.schemas.weather import WeatherDataPoint
from app.schemas.policy import SafetyPolicy

def is_metric_missing(point: WeatherDataPoint, policy: SafetyPolicy) -> bool:
    metric_map = {
        "Apparent Temperature": point.apparent_temperature,
        "Air Temperature": point.air_temperature,
        "Relative Humidity": point.relative_humidity,
        "Wind Speed": point.wind_speed,
        "Solar Radiation": point.solar_radiation
    }
    val = metric_map.get(policy.screening_metric)
    return val is None

def evaluate_hour(point: WeatherDataPoint, policy: SafetyPolicy, workload: str) -> tuple[bool, str]:
    metric_map = {
        "Apparent Temperature": point.apparent_temperature,
        "Air Temperature": point.air_temperature,
        "Relative Humidity": point.relative_humidity,
        "Wind Speed": point.wind_speed,
        "Solar Radiation": point.solar_radiation
    }
    metric_val = metric_map.get(policy.screening_metric)
    
    threshold = policy.workload_specific_thresholds.get(workload)
    if threshold is None:
        return False, f"No threshold defined for workload: {workload}"
        
    if metric_val > threshold:
        return False, f"Exceeds {workload} limit of {threshold} with {policy.screening_metric}={metric_val}"
        
    return True, "Safe conditions"
