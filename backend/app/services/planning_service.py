from datetime import datetime, timedelta, time
import zoneinfo
from typing import List, Optional

from app.schemas.task import TaskInput
from app.schemas.weather import WeatherData, WeatherDataPoint
from app.schemas.site import Site
from app.schemas.policy import SafetyPolicy
from app.schemas.plan import PlanResult, OutcomeEnum, Provenance, ProposedPlan

from app.services.safety_rules import is_metric_missing, evaluate_hour
from app.services.explain import format_rejection

def _intersects(p: WeatherDataPoint, start_time: datetime, end_time: datetime) -> bool:
    # Assuming weather points represent 1 hour durations
    p_end = p.timestamp + timedelta(hours=1)
    return max(start_time, p.timestamp) < min(end_time, p_end)

def _get_intersecting_points(weather: WeatherData, start_time: datetime, end_time: datetime) -> List[WeatherDataPoint]:
    return [p for p in weather.points if _intersects(p, start_time, end_time)]

def _is_within_operating_window(site: Site, start_time: datetime, end_time: datetime) -> bool:
    try:
        zone = zoneinfo.ZoneInfo(site.timezone)
        w_start = datetime.strptime(site.operating_window_start, "%H:%M").time()
        w_end = datetime.strptime(site.operating_window_end, "%H:%M").time()
    except Exception:
        return False
        
    local_start = start_time.astimezone(zone)
    local_end = end_time.astimezone(zone)
    
    if start_time > end_time:
        return False

    if w_start == w_end:
        return True
        
    duration = end_time - start_time
    
    if w_start < w_end:
        window_sec = (datetime.combine(local_start.date(), w_end) - 
                      datetime.combine(local_start.date(), w_start)).total_seconds()
                      
        if duration.total_seconds() > window_sec:
            return False
            
        w_open = datetime.combine(local_start.date(), w_start, tzinfo=zone)
        w_close = datetime.combine(local_start.date(), w_end, tzinfo=zone)
        
        return w_open <= local_start and local_end <= w_close
    else:
        window_sec = (datetime.combine(local_start.date(), w_end) + timedelta(days=1) - 
                      datetime.combine(local_start.date(), w_start)).total_seconds()
                      
        if duration.total_seconds() > window_sec:
            return False
            
        if local_start.time() >= w_start:
            w_open = datetime.combine(local_start.date(), w_start, tzinfo=zone)
            w_close = datetime.combine(local_start.date() + timedelta(days=1), w_end, tzinfo=zone)
        else:
            w_open = datetime.combine(local_start.date() - timedelta(days=1), w_start, tzinfo=zone)
            w_close = datetime.combine(local_start.date(), w_end, tzinfo=zone)
            
        return w_open <= local_start and local_end <= w_close

def evaluate_plan(task: TaskInput, site: Site, weather: WeatherData, policy: SafetyPolicy, provenance: Provenance) -> PlanResult:
    duration_delta = timedelta(minutes=task.duration)
    
    orig_start = task.planned_start
    orig_end = orig_start + duration_delta
    
    orig_points = _get_intersecting_points(weather, orig_start, orig_end)
    orig_missing = False
    orig_violations = []
    
    if orig_end > task.deadline:
        orig_violations.append(f"Original plan finishes past deadline ({orig_end} > {task.deadline})")
        
    if not _is_within_operating_window(site, orig_start, orig_end):
        orig_violations.append(f"Original plan falls outside operating window ({site.operating_window_start}-{site.operating_window_end} {site.timezone})")
        
    for p in orig_points:
        if is_metric_missing(p, policy):
            orig_missing = True
            break
        is_safe, reason = evaluate_hour(p, policy, task.workload)
        if not is_safe:
            orig_violations.append(reason)
            
    if not orig_missing and len(orig_points) == 0:
        orig_missing = True 

    if not orig_missing and len(orig_violations) == 0:
        return PlanResult(
            outcome=OutcomeEnum.PROCEED,
            explanation="Original plan is perfectly safe and requires no adjustments.",
            original_assessment="Safe",
            proposed_plan=None,
            provenance=provenance
        )
        
    original_assessment_text = "Missing weather data for original window." if orig_missing else "; ".join(orig_violations)
    
    if not task.can_reschedule:
        if orig_missing:
            return PlanResult(
                outcome=OutcomeEnum.INSUFFICIENT_DATA,
                explanation="Original plan missing data and task cannot be rescheduled.",
                original_assessment=original_assessment_text,
                provenance=provenance
            )
        else:
            return PlanResult(
                outcome=OutcomeEnum.ESCALATE,
                explanation="Original plan unsafe and task cannot be rescheduled.",
                original_assessment=original_assessment_text,
                requires_human_review=True,
                provenance=provenance
            )

    rejected_reasons = []
    best_candidate_start = None

    evaluated_any_weather = False
    all_missing_data = True

    candidate_starts = []
    
    # Grid align earliest_start upwards to nearest 15-minute boundary
    minute = task.earliest_start.minute
    discard = timedelta(minutes=minute % 15, seconds=task.earliest_start.second, microseconds=task.earliest_start.microsecond)
    
    if discard.total_seconds() > 0:
        base = task.earliest_start - discard + timedelta(minutes=15)
    else:
        base = task.earliest_start
        
    if task.earliest_start <= task.deadline - duration_delta:
        candidate_starts.append(task.earliest_start)
        
    curr = base
    while curr <= task.deadline - duration_delta:
        candidate_starts.append(curr)
        curr += timedelta(minutes=15)

    # Deterministic Tie-breaking:
    # 1. Distance absolute value
    # 2. Earlier candidate wins ties natively because of chronological generation and stability, 
    # but explicitly adding `c` as secondary sort guarantees strict deterministic fallbacks.
    candidate_starts.sort(key=lambda c: (abs((c - task.planned_start).total_seconds()), c))

    for c_start in candidate_starts:
        c_end = c_start + duration_delta
        
        if c_end > task.deadline:
            local_c = c_start.astimezone(zoneinfo.ZoneInfo(site.timezone)).isoformat()
            rejected_reasons.append(f"Window starting {local_c} rejected: Finishes past deadline.")
            continue
            
        if not _is_within_operating_window(site, c_start, c_end):
            local_c = c_start.astimezone(zoneinfo.ZoneInfo(site.timezone)).isoformat()
            rejected_reasons.append(f"Window starting {local_c} rejected: Falls outside site operating window.")
            continue

        c_violations = []
        c_missing = False
        evaluated_any_weather = True
        
        curr_test = c_start
        while curr_test < c_end:
            sub_end = min(curr_test + timedelta(hours=1), c_end)
            sub_pts = _get_intersecting_points(weather, curr_test, sub_end)
            
            if not sub_pts:
                c_missing = True
                break
                
            sub_pts.sort(key=lambda x: x.timestamp)
            covered_test = curr_test
            for p in sub_pts:
                p_end = p.timestamp + timedelta(hours=1)
                if p.timestamp > covered_test:
                    break
                covered_test = max(covered_test, p_end)
                
            if covered_test < sub_end:
                c_missing = True
                break
                
            for p in sub_pts:
                if is_metric_missing(p, policy):
                    c_missing = True
                    break
                
                safe, reason = evaluate_hour(p, policy, task.workload)
                if not safe:
                    c_violations.append(reason)
            
            if c_missing:
                break
            curr_test = sub_end

        if not c_missing:
            all_missing_data = False

        local_c = c_start.astimezone(zoneinfo.ZoneInfo(site.timezone)).isoformat()

        if c_missing:
            rejected_reasons.append(f"Window starting {local_c} rejected: Missing required weather metric.")
            continue
            
        if len(c_violations) == 0:
            best_candidate_start = c_start
            break
        else:
            rejected_reasons.append(f"Window starting {local_c} rejected: {c_violations[0]}")
            
    if evaluated_any_weather and all_missing_data:
        return PlanResult(
            outcome=OutcomeEnum.INSUFFICIENT_DATA,
            explanation="Insufficient metric data to find any safe scheduling window.",
            original_assessment=original_assessment_text,
            rejected_candidate_explanations=rejected_reasons,
            provenance=provenance
        )
        
    if best_candidate_start is not None:
        proposed_end = best_candidate_start + duration_delta
        return PlanResult(
            outcome=OutcomeEnum.RESCHEDULE,
            explanation=f"Original plan unfeasible. Safe alternative found at {best_candidate_start.isoformat()}.",
            original_assessment=original_assessment_text,
            proposed_plan=ProposedPlan(start_time=best_candidate_start, end_time=proposed_end, adjustments=["Time shifted for safety"]),
            rejected_candidate_explanations=rejected_reasons,
            provenance=provenance
        )
        
    if orig_missing:
        return PlanResult(
            outcome=OutcomeEnum.INSUFFICIENT_DATA,
            explanation="Insufficient metric data to find any safe scheduling window.",
            original_assessment=original_assessment_text,
            rejected_candidate_explanations=rejected_reasons,
            provenance=provenance
        )
        
    return PlanResult(
        outcome=OutcomeEnum.ESCALATE,
        explanation="No feasible windows found before deadline under current policy.",
        original_assessment=original_assessment_text,
        rejected_candidate_explanations=rejected_reasons,
        requires_human_review=True,
        provenance=provenance
    )
