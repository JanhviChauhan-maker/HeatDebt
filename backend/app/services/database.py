import sqlite3
import asyncio
import json
import os
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "heatdebt.db")

def init_db():
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS evaluations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    site_name TEXT NOT NULL,
                    latitude REAL NOT NULL,
                    longitude REAL NOT NULL,
                    timezone TEXT NOT NULL,
                    task_name TEXT NOT NULL,
                    duration INTEGER NOT NULL,
                    outcome TEXT NOT NULL,
                    proposed_start TEXT,
                    proposed_end TEXT,
                    explanations TEXT NOT NULL,
                    weather_summary TEXT NOT NULL,
                    provenance TEXT NOT NULL,
                    workload TEXT,
                    original_task_json TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS forecast_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    site_name TEXT NOT NULL,
                    latitude REAL NOT NULL,
                    longitude REAL NOT NULL,
                    timezone TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    weather_json TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS forecast_changes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    site_name TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    changes_json TEXT NOT NULL,
                    affected_tasks_json TEXT NOT NULL
                )
            """)
            conn.commit()
    except Exception as e:
        print(f"Failed to initialize database: {e}")

# Run natively on module import
init_db()

def _insert_evaluation(task_req, result):
    try:
        now = datetime.now(timezone.utc).isoformat()
        
        # Flatten reasons
        reasons = []
        if result.explanation: reasons.append(result.explanation)
        reasons.extend(result.rejected_candidate_explanations)
        
        prop_start = result.proposed_plan.start_time.isoformat() if result.proposed_plan else None
        prop_end = result.proposed_plan.end_time.isoformat() if result.proposed_plan else None
        
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("""
                INSERT INTO evaluations (
                    timestamp, site_name, latitude, longitude, timezone,
                    task_name, duration, workload, outcome, proposed_start, proposed_end,
                    explanations, weather_summary, provenance, original_task_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                now,
                task_req.site.name,
                task_req.site.latitude,
                task_req.site.longitude,
                task_req.site.timezone,
                task_req.task.name,
                task_req.task.duration,
                task_req.task.workload,
                result.outcome.value,
                prop_start,
                prop_end,
                json.dumps(reasons),
                "Recorded via Async thread",
                result.provenance.model_dump_json(),
                task_req.task.model_dump_json()
            ))
            conn.commit()
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Persistence Exception Trapped: {e}")

async def save_evaluation(task_req, result):
    """Offload blocking SQLite commit into isolated Thread allowing FAST FastAPI return constraints to thrive."""
    await asyncio.to_thread(_insert_evaluation, task_req, result)

def _fetch_history(limit: int):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                "SELECT * FROM evaluations ORDER BY timestamp DESC LIMIT ?", 
                (limit,)
            )
            rows = cursor.fetchall()
            return [dict(r) for r in rows]
    except Exception as e:
        print(f"Read Exception Trapped: {e}")
        return []

async def get_evaluations_history(limit: int = 50):
    return await asyncio.to_thread(_fetch_history, limit)

# --- Forecast Snapshot Database Operations ---
def _insert_forecast_snapshot(site_name: str, latitude: float, longitude: float, tz_str: str, provider: str, weather_json: str):
    try:
        now = datetime.now(timezone.utc).isoformat()
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("""
                INSERT INTO forecast_snapshots (
                    site_name, latitude, longitude, timezone, timestamp, provider, weather_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (site_name, latitude, longitude, tz_str, now, provider, weather_json))
            conn.commit()
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Snapshot Persistence Exception Trapped: {e}")

async def save_forecast_snapshot(site_name: str, latitude: float, longitude: float, tz: str, provider: str, weather_json: str):
    await asyncio.to_thread(_insert_forecast_snapshot, site_name, latitude, longitude, tz, provider, weather_json)

def _get_latest_snapshot(site_name: str):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                "SELECT * FROM forecast_snapshots WHERE site_name = ? ORDER BY timestamp DESC LIMIT 1",
                (site_name,)
            )
            row = cursor.fetchone()
            return dict(row) if row else None
    except Exception as e:
        print(f"Snapshot Read Exception: {e}")
        return None

async def get_latest_snapshot(site_name: str):
    return await asyncio.to_thread(_get_latest_snapshot, site_name)

def _insert_forecast_change(site_name: str, changes_json: str, affected_tasks_json: str):
    try:
        now = datetime.now(timezone.utc).isoformat()
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("""
                INSERT INTO forecast_changes (
                    site_name, timestamp, changes_json, affected_tasks_json
                ) VALUES (?, ?, ?, ?)
            """, (site_name, now, changes_json, affected_tasks_json))
            # retention boundary bounding to 200 records to prevent ballooning.
            conn.execute("DELETE FROM forecast_changes WHERE id NOT IN (SELECT id FROM forecast_changes ORDER BY id DESC LIMIT 200)")
            conn.commit()
    except Exception as e:
        print(f"Forecast Change Persistence Trapped: {e}")

async def save_forecast_change(site_name: str, changes_json: str, affected_tasks_json: str):
    await asyncio.to_thread(_insert_forecast_change, site_name, changes_json, affected_tasks_json)

def _get_forecast_changes(limit: int):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT * FROM forecast_changes ORDER BY timestamp DESC LIMIT ?", (limit,))
            rows = cursor.fetchall()
            return [dict(r) for r in rows]
    except Exception:
        return []

async def get_forecast_changes_history(limit: int = 50):
    return await asyncio.to_thread(_get_forecast_changes, limit)
