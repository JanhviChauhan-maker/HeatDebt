import httpx
from datetime import datetime, timedelta, timezone
import zoneinfo
from typing import Optional

from app.schemas.weather import WeatherData, WeatherDataPoint

class WeatherUnavailableException(Exception):
    pass

WEATHER_CACHE = {}
CACHE_TTL = timedelta(minutes=10)

async def fetch_weather(lat: float, lon: float, tz: str, start_date: str, end_date: str) -> WeatherData:
    cache_key = (lat, lon, tz, start_date, end_date)
    now = datetime.now(timezone.utc)
    
    if cache_key in WEATHER_CACHE:
        expire_time, cached_data = WEATHER_CACHE[cache_key]
        if now < expire_time:
            return cached_data
            
    try:
        zone = zoneinfo.ZoneInfo(tz)
    except Exception:
        raise ValueError(f"Invalid timezone: {tz}")

    params = {
        "latitude": lat,
        "longitude": lon,
        "timezone": tz,
        "start_date": start_date,
        "end_date": end_date,
        "hourly": "apparent_temperature,temperature_2m,relative_humidity_2m,wind_speed_10m,shortwave_radiation",
    }
    
    url = "https://api.open-meteo.com/v1/forecast"
    
    try:
        # 1 retry max (so 2 total tries)
        client = httpx.AsyncClient(timeout=5.0)
        response = None
        for attempt in range(2):
            try:
                response = await client.get(url, params=params)
                response.raise_for_status()
                break
            except httpx.RequestError:
                if attempt == 1:
                    raise WeatherUnavailableException("Network error while connecting to Open-Meteo.")
            except httpx.HTTPStatusError as e:
                if attempt == 1:
                    raise WeatherUnavailableException(f"Open-Meteo returned error status: {e.response.status_code}")
        
        if not response:
            raise WeatherUnavailableException("Failed to fetch weather data.")
            
        data = response.json()
        hourly = data.get("hourly", {})
        if not hourly:
            raise WeatherUnavailableException("Invalid JSON shape: missing 'hourly' data.")
            
        times = hourly.get("time", [])
        app_temps = hourly.get("apparent_temperature", [])
        air_temps = hourly.get("temperature_2m", [])
        rh = hourly.get("relative_humidity_2m", [])
        wind = hourly.get("wind_speed_10m", [])
        solar = hourly.get("shortwave_radiation", [])
        
        points = []
        for i, t_str in enumerate(times):
            dt_naive = datetime.fromisoformat(t_str)
            dt_aware = dt_naive.replace(tzinfo=zone)
            
            def safe_get(lst, idx):
                if idx < len(lst):
                    val = lst[idx]
                    return float(val) if val is not None else None
                return None
                
            points.append(
                WeatherDataPoint(
                    timestamp=dt_aware,
                    apparent_temperature=safe_get(app_temps, i),
                    air_temperature=safe_get(air_temps, i),
                    relative_humidity=safe_get(rh, i),
                    wind_speed=safe_get(wind, i),
                    solar_radiation=safe_get(solar, i)
                )
            )
            
        weather_data = WeatherData(points=points)
        
        WEATHER_CACHE[cache_key] = (now + CACHE_TTL, weather_data)
        return weather_data

    except Exception as e:
        if isinstance(e, WeatherUnavailableException) or isinstance(e, ValueError):
            raise
        raise WeatherUnavailableException(f"Unexpected error: str({e})")
