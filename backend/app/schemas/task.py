from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional

class TaskInput(BaseModel):
    name: str = Field(..., description="Name of the task")
    site: str = Field(..., description="Site identifier")
    earliest_start: datetime = Field(..., description="Earliest allowed start time")
    planned_start: datetime = Field(..., description="Originally planned start time")
    duration: int = Field(..., description="Duration in minutes (15 to 720)")
    deadline: datetime = Field(..., description="Absolute deadline for the task")
    workload: str = Field(..., description="Workload category (e.g., 'light', 'moderate', 'heavy')")
    urgency: str = Field(..., description="Urgency level (e.g., 'normal', 'critical')")
    can_reschedule: bool = Field(..., description="Whether the task can be rescheduled")
    can_split: bool = Field(..., description="Whether the task can be split into parts")
    shade_availability: bool = Field(False, description="Is shade available?")
    cooling_availability: bool = Field(False, description="Is cooling available?")
    acclimatisation_status: Optional[str] = Field(None, description="Acclimatisation status")
    planned_recovery_minutes_per_hour: Optional[int] = Field(None, description="Planned recovery minutes per hour")

    @field_validator('duration')
    def validate_duration(cls, v):
        if not 15 <= v <= 720:
            raise ValueError("Duration must be between 15 and 720 minutes")
        return v
        
    @field_validator('workload')
    def validate_workload(cls, v):
        valid_workloads = ['light', 'moderate', 'heavy', 'very_heavy']
        if v.lower() not in valid_workloads:
            raise ValueError(f"Workload must be one of {valid_workloads}")
        return v.lower()
        
    @field_validator('urgency')
    def validate_urgency(cls, v):
        valid_urgencies = ['low', 'normal', 'high', 'critical']
        if v.lower() not in valid_urgencies:
            raise ValueError(f"Urgency must be one of {valid_urgencies}")
        return v.lower()
