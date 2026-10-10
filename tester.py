import urllib.request
import urllib.error
import json
from datetime import datetime, timedelta

def get_dates():
    tomorrow = datetime.now() + timedelta(days=1)
    tomorrow = tomorrow.replace(hour=0, minute=0, second=0, microsecond=0)
    
    tMorning = tomorrow + timedelta(hours=8)
    tMidday = tomorrow + timedelta(hours=14)
    tNight = tomorrow + timedelta(hours=23)
    
    return tMorning, tMidday, tNight

tMorning, tMidday, tNight = get_dates()

scenarios = [
    ("Scenario A Safe Morning (PROCEED)", {
        "task": {
            "name": "Safe Morning", "site": "Alpha",
            "earliest_start": (tMorning - timedelta(hours=2)).isoformat() + "Z",
            "planned_start": tMorning.isoformat() + "Z",
            "duration": 60,
            "deadline": (tMorning + timedelta(hours=10)).isoformat() + "Z",
            "workload": "light", "urgency": "normal", "can_reschedule": True, "can_split": False
        },
        "site": { "name": "Alpha", "latitude": 23.02, "longitude": 72.57, "timezone": "Asia/Kolkata", "operating_window_start": "06:00", "operating_window_end": "18:00" }
    }),
    ("Scenario B Unsafe Midday (RESCHEDULE)", {
        "task": {
            "name": "Hot Afternoon", "site": "Alpha",
            "earliest_start": tMorning.isoformat() + "Z",
            "planned_start": tMidday.isoformat() + "Z",
            "duration": 60,
            "deadline": (tMidday + timedelta(hours=12)).isoformat() + "Z",
            "workload": "heavy", "urgency": "normal", "can_reschedule": True, "can_split": False
        },
        "site": { "name": "Alpha", "latitude": 23.02, "longitude": 72.57, "timezone": "Asia/Kolkata", "operating_window_start": "06:00", "operating_window_end": "18:00" }
    }),
    ("Scenario C Impossible Deadline (ESCALATE)", {
        "task": {
            "name": "Tight Deadline Hot", "site": "Alpha",
            "earliest_start": (tMidday - timedelta(hours=1)).isoformat() + "Z",
            "planned_start": tMidday.isoformat() + "Z",
            "duration": 60,
            "deadline": (tMidday + timedelta(hours=1)).isoformat() + "Z",
            "workload": "heavy", "urgency": "critical", "can_reschedule": True, "can_split": False
        },
        "site": { "name": "Alpha", "latitude": 23.02, "longitude": 72.57, "timezone": "Asia/Kolkata", "operating_window_start": "06:00", "operating_window_end": "18:00" }
    }),
    ("Scenario D Missing Data (INSUFFICIENT_DATA)", {
        "task": {
            "name": "Invalid coords", "site": "Alpha",
            "earliest_start": tMorning.isoformat() + "Z",
            "planned_start": tMorning.isoformat() + "Z",
            "duration": 60,
            "deadline": tMidday.isoformat() + "Z",
            "workload": "light", "urgency": "normal", "can_reschedule": True, "can_split": False
        },
        "site": { "name": "Alpha", "latitude": 999.0, "longitude": 999.0, "timezone": "Asia/Kolkata", "operating_window_start": "06:00", "operating_window_end": "18:00" }
    }),
    ("Scenario E Overnight bounds", {
        "task": {
            "name": "Night Shift", "site": "Alpha",
            "earliest_start": (tNight - timedelta(hours=1)).isoformat() + "Z",
            "planned_start": tNight.isoformat() + "Z",
            "duration": 60,
            "deadline": (tNight + timedelta(hours=10)).isoformat() + "Z",
            "workload": "heavy", "urgency": "normal", "can_reschedule": True, "can_split": False
        },
        "site": { "name": "Alpha", "latitude": 23.02, "longitude": 72.57, "timezone": "Asia/Kolkata", "operating_window_start": "22:00", "operating_window_end": "04:00" }
    })
]

for name, payload in scenarios:
    print(f"\\n--- RUNNING: {name} ---")
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request("http://127.0.0.1:8000/api/plans/evaluate", data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            print(f"OUTCOME: {res_data.get('outcome')}")
            print(f"RESPONSE:\\n{json.dumps(res_data, indent=2)}")
    except urllib.error.HTTPError as e:
        print(f"HTTP ERROR: {e.code}")
    except Exception as e:
        print(f"FAILED: {e}")
