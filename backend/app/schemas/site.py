from pydantic import BaseModel, Field, field_validator
import zoneinfo

class Site(BaseModel):
    name: str = Field(..., description="Name of the site")
    latitude: float = Field(..., description="Latitude coordinate")
    longitude: float = Field(..., description="Longitude coordinate")
    timezone: str = Field(..., description="Timezone name, e.g., 'Asia/Kolkata'", json_schema_extra={"examples": ["Asia/Kolkata"]})
    operating_window_start: str = Field(..., description="Start of operating window, e.g., '06:00'")
    operating_window_end: str = Field(..., description="End of operating window, e.g., '18:00'")

    @field_validator('latitude')
    def validate_latitude(cls, v):
        if not -90 <= v <= 90:
            raise ValueError("Latitude must be between -90 and 90")
        return v
        
    @field_validator('longitude')
    def validate_longitude(cls, v):
        if not -180 <= v <= 180:
            raise ValueError("Longitude must be between -180 and 180")
        return v
        
    @field_validator('timezone')
    @classmethod
    def validate_timezone(cls, v):
        try:
            zoneinfo.ZoneInfo(v)
        except Exception:
            raise ValueError(f"Invalid timezone: {v}")
        return v

