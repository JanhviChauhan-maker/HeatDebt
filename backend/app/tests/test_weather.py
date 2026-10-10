import pytest
import asyncio
from unittest.mock import patch, AsyncMock
from httpx import RequestError, HTTPStatusError, Request, Response
from datetime import datetime, timezone, timedelta

from app.services.weather_service import fetch_weather, WeatherUnavailableException, WEATHER_CACHE
from app.schemas.weather import WeatherData

# Clear cache before each test
@pytest.fixture(autouse=True)
def clear_cache():
    WEATHER_CACHE.clear()

def run_async(coro):
    return asyncio.run(coro)

def test_successful_weather_fetch():
    mock_json = {
        "hourly": {
            "time": ["2024-06-01T08:00"],
            "apparent_temperature": [30.5],
            "temperature_2m": [28.0],
            "relative_humidity_2m": [65],
            "wind_speed_10m": [15.0],
            "shortwave_radiation": [800]
        }
    }
    
    with patch('httpx.AsyncClient.get', new_callable=AsyncMock) as mock_get:
        mock_get.return_value = Response(200, json=mock_json, request=Request('GET', ''))
        
        # ACT
        result = run_async(fetch_weather(52.52, 13.41, "UTC", "2024-06-01", "2024-06-01"))
        
        # ASSERT
        assert isinstance(result, WeatherData)
        assert len(result.points) == 1
        assert result.points[0].apparent_temperature == 30.5
        assert result.points[0].wind_speed == 15.0
        assert len(WEATHER_CACHE) == 1

def test_missing_metrics_mapped_to_none():
    mock_json = {
        "hourly": {
            "time": ["2024-06-01T08:00"],
            "apparent_temperature": [None], # Missing!
            "temperature_2m": [28.0],
            "relative_humidity_2m": [65],
            "wind_speed_10m": [None],
            "shortwave_radiation": [800]
        }
    }
    
    with patch('httpx.AsyncClient.get', new_callable=AsyncMock) as mock_get:
        mock_get.return_value = Response(200, json=mock_json, request=Request('GET', ''))
        
        result = run_async(fetch_weather(52.52, 13.41, "UTC", "2024-06-01", "2024-06-01"))
        assert result.points[0].apparent_temperature is None
        assert result.points[0].wind_speed is None

def test_network_failure_surfaces_as_503_custom_exception():
    with patch('httpx.AsyncClient.get', new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = RequestError("Network timeout", request=Request('GET', ''))
        
        with pytest.raises(WeatherUnavailableException) as exc_info:
            run_async(fetch_weather(52.52, 13.41, "UTC", "2024-06-01", "2024-06-01"))
            
        assert "Network error" in str(exc_info.value)
        assert mock_get.call_count == 2 # 1 initial + 1 retry

def test_cache_hit_prevents_duplicate_calls():
    mock_json = {
        "hourly": {
            "time": ["2024-06-01T08:00"],
            "apparent_temperature": [30.5],
            "temperature_2m": [28.0],
            "relative_humidity_2m": [65],
            "wind_speed_10m": [15.0],
            "shortwave_radiation": [800]
        }
    }
    with patch('httpx.AsyncClient.get', new_callable=AsyncMock) as mock_get:
        mock_get.return_value = Response(200, json=mock_json, request=Request('GET', ''))
        
        # First call hits API
        r1 = run_async(fetch_weather(10.0, 20.0, "UTC", "2024-06-01", "2024-06-01"))
        assert mock_get.call_count == 1
        
        # Second call hits cache
        r2 = run_async(fetch_weather(10.0, 20.0, "UTC", "2024-06-01", "2024-06-01"))
        assert mock_get.call_count == 1
        assert r1.points[0].apparent_temperature == r2.points[0].apparent_temperature
        
def test_invalid_json_shape_exception():
    mock_json = {"invalid": "shape"}
    with patch('httpx.AsyncClient.get', new_callable=AsyncMock) as mock_get:
        mock_get.return_value = Response(200, json=mock_json, request=Request('GET', ''))
        
        with pytest.raises(WeatherUnavailableException):
            run_async(fetch_weather(10.0, 20.0, "UTC", "2024-06-01", "2024-06-01"))

def test_regression_valid_timezone_asia_kolkata_parses():
    # Proves the Windows environment successfully resolves the IANA tz database key "Asia/Kolkata"
    # and prevents 500 zoneinfo crashes.
    import zoneinfo
    out = zoneinfo.ZoneInfo("Asia/Kolkata")
    assert out is not None

