from typing import List

def format_rejection(start_time: str, reason: str) -> str:
    return f"Window starting {start_time} rejected: {reason}"

def format_missing_data(metric: str) -> str:
    return f"Required metric '{metric}' is missing or unavailable."
