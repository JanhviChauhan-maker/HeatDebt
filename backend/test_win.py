import zoneinfo
from datetime import datetime, timezone, timedelta
from app.schemas.site import Site

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

def main():
    site = Site(
        name="Alpha", latitude=23.02, longitude=72.57,
        timezone="Asia/Kolkata", operating_window_start="06:00", operating_window_end="18:00"
    )

    t_start = datetime.fromisoformat("2026-10-10T00:58:00+00:00") # 06:28 IST
    t_end = t_start + timedelta(minutes=120) # to 08:28 IST
    
    print(f"C1 (Inside Window Check): {t_start.astimezone(zoneinfo.ZoneInfo('Asia/Kolkata'))} to {t_end.astimezone(zoneinfo.ZoneInfo('Asia/Kolkata'))}")
    res = _is_within_operating_window(site, t_start, t_end)
    print("C1 RESULT:", res)

    t_start = datetime.fromisoformat("2026-10-10T02:58:00+00:00") # 08:28 IST
    t_end = t_start + timedelta(minutes=120) # to 10:28 IST
    print(f"C2 (Inside Window Check): {t_start.astimezone(zoneinfo.ZoneInfo('Asia/Kolkata'))} to {t_end.astimezone(zoneinfo.ZoneInfo('Asia/Kolkata'))}")
    res = _is_within_operating_window(site, t_start, t_end)
    print("C2 RESULT:", res)

main()
