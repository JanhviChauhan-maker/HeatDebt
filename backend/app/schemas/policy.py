from pydantic import BaseModel, Field
from typing import Dict

class SafetyPolicy(BaseModel):
    name: str = Field(..., description="Name of the policy")
    version: str = Field(..., description="Policy version")
    screening_metric: str = Field(..., description="Metric used for screening (e.g., WBGT, Apparent Temperature)")
    workload_specific_thresholds: Dict[str, float] = Field(..., description="Thresholds for different workloads")
    source: str = Field(..., description="Source of the policy")
    is_demo_placeholder: bool = Field(False, description="Flag indicating if the thresholds are demonstration placeholders")
