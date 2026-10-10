from pydantic import BaseModel, Field, model_validator
from enum import Enum
from typing import Optional, List, Dict, Any
from datetime import datetime

class OutcomeEnum(str, Enum):
    RESCHEDULE = "RESCHEDULE"
    PROCEED = "PROCEED"
    ADAPT_PLAN = "ADAPT_PLAN"
    ESCALATE = "ESCALATE"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"

class Provenance(BaseModel):
    data_source: str
    data_kind: str = Field(..., description="'forecast' or 'demo'")
    fetch_timestamp: datetime
    timezone: str
    policy_metadata: Dict[str, Any]
    
    @model_validator(mode='after')
    def validate_data_kind(self):
        if self.data_kind not in ['forecast', 'demo']:
            raise ValueError("data_kind must be 'forecast' or 'demo'")
        return self

class ProposedPlan(BaseModel):
    start_time: datetime
    end_time: datetime
    adjustments: List[str]

class PlanResult(BaseModel):
    outcome: OutcomeEnum
    explanation: str
    original_assessment: str
    proposed_plan: Optional[ProposedPlan] = None
    rejected_candidate_explanations: List[str] = Field(default_factory=list)
    missing_information: List[str] = Field(default_factory=list)
    recommended_controls: List[str] = Field(default_factory=list)
    requires_human_review: bool = False
    provenance: Provenance

    @model_validator(mode='after')
    def validate_proposed_plan_for_outcomes(self):
        if self.outcome in [OutcomeEnum.ESCALATE, OutcomeEnum.INSUFFICIENT_DATA]:
            if self.proposed_plan is not None:
                raise ValueError(f"proposed_plan must be null when outcome is {self.outcome.value}")
        return self
