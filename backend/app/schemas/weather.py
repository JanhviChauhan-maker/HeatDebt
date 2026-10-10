from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class WeatherDataPoint(BaseModel):
    timestamp: datetime
    apparent_temperature: Optional[float] = Field(None, description="Apparent temperature in Celsius")
    air_temperature: Optional[float] = Field(None, description="Air temperature in Celsius")
    relative_humidity: Optional[float] = Field(None, description="Relative humidity percentage")
    wind_speed: Optional[float] = Field(None, description="Wind speed in m/s")
    solar_radiation: Optional[float] = Field(None, description="Solar radiation in W/m²")

class WeatherData(BaseModel):
    points: list[WeatherDataPoint]
