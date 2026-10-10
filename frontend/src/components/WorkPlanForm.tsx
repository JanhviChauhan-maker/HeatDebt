import { useState, useEffect } from 'react';

export interface WorkPlanSubmitData {
    task: {
        name: string;
        site: string;
        earliest_start: string;
        planned_start: string;
        duration: number;
        deadline: string;
        workload: string;
        urgency: string;
        can_reschedule: boolean;
        can_split: boolean;
    };
    site: {
        name: string;
        latitude: number;
        longitude: number;
        timezone: string;
        operating_window_start: string;
        operating_window_end: string;
    };
}

interface Props {
    onSubmit: (data: WorkPlanSubmitData) => void;
    isLoading: boolean;
}

export function WorkPlanForm({ onSubmit, isLoading }: Props) {
    // ISO Strings usually need local format for datetime-local
    const getLocalDatetime = (addHours: number = 0) => {
        const d = new Date();
        d.setHours(d.getHours() + addHours);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0, 16);
    };

    const [taskName, setTaskName] = useState('Pipeline Excavation');
    const [siteName, setSiteName] = useState('Alpha Sector');
    const [lat, setLat] = useState(23.02);
    const [lon, setLon] = useState(72.57);
    const [tz, setTz] = useState('Asia/Kolkata');

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);

    // Provide a debounce for querying the Open-Meteo geocoding API safely
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            setIsSearching(true);
            setSearchError('');

            try {
                const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchQuery)}&count=5&format=json`);
                if (!response.ok) throw new Error('API Rate Limit or Failure');
                const data = await response.json();

                if (data.results && data.results.length > 0) {
                    setSearchResults(data.results);
                    setShowDropdown(true);
                } else {
                    setSearchResults([]);
                    setSearchError('No locations found');
                    setShowDropdown(true);
                }
            } catch (err: any) {
                setSearchError(err.message || 'Geocoding failed');
                setSearchResults([]);
                setShowDropdown(true);
            } finally {
                setIsSearching(false);
            }
        }, 600); // 600ms Debounce explicitly protecting the Free API limits

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    const handleSelectLocation = (loc: any) => {
        setSiteName(loc.name);
        setLat(loc.latitude);
        setLon(loc.longitude);
        if (loc.timezone) {
            setTz(loc.timezone);
        }
        setSearchQuery('');
        setShowDropdown(false);
    };

    const [earliestStart, setEarliestStart] = useState(getLocalDatetime(0));
    const [plannedStart, setPlannedStart] = useState(getLocalDatetime(2));
    const [deadline, setDeadline] = useState(getLocalDatetime(24));

    const [duration, setDuration] = useState(120);
    const [workload, setWorkload] = useState('moderate');
    const [urgency, setUrgency] = useState('normal');
    const [canReschedule, setCanReschedule] = useState(true);

    const [opStart, setOpStart] = useState('06:00');
    const [opEnd, setOpEnd] = useState('18:00');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({
            task: {
                name: taskName,
                site: siteName,
                earliest_start: new Date(earliestStart).toISOString(),
                planned_start: new Date(plannedStart).toISOString(),
                duration: Number(duration),
                deadline: new Date(deadline).toISOString(),
                workload,
                urgency,
                can_reschedule: canReschedule,
                can_split: false
            },
            site: {
                name: siteName,
                latitude: Number(lat),
                longitude: Number(lon),
                timezone: tz,
                operating_window_start: opStart,
                operating_window_end: opEnd
            }
        });
    };

    return (
        <form className="glass-panel" onSubmit={handleSubmit}>
            <h3 style={{ marginBottom: '20px', color: 'var(--accent-color)' }}>Configure Operations Plan</h3>

            <div className="form-grid">
                <div className="form-group" style={{ position: 'relative' }}>
                    <label>Search Location (Open-Meteo)</label>
                    <input
                        className="input-field"
                        placeholder="e.g. Ahmedabad, Paris, Tokyo"
                        value={searchQuery}
                        onChange={e => {
                            setSearchQuery(e.target.value);
                            setShowDropdown(true);
                        }}
                    />
                    {isSearching && <div style={{ position: 'absolute', right: '10px', top: '35px', color: 'var(--accent-color)' }}>...</div>}

                    {showDropdown && (searchResults.length > 0 || searchError) && (
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0,
                            backgroundColor: 'rgba(20, 25, 35, 0.95)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px', padding: '5px', zIndex: 10, marginTop: '2px', backdropFilter: 'blur(10px)'
                        }}>
                            {searchError ? (
                                <div style={{ padding: '8px', color: 'var(--error-color)', fontSize: '0.85rem' }}>{searchError}</div>
                            ) : (
                                searchResults.map((loc, i) => (
                                    <div
                                        key={i}
                                        onClick={() => handleSelectLocation(loc)}
                                        style={{ padding: '8px', cursor: 'pointer', borderBottom: i < searchResults.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', fontSize: '0.85rem' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <strong>{loc.name}</strong>
                                        {loc.admin1 && <span>, {loc.admin1}</span>}
                                        {loc.country && <span style={{ color: 'var(--text-muted)' }}> ({loc.country})</span>}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
                <div className="form-group">
                    <label>Task Name</label>
                    <input className="input-field" value={taskName} onChange={e => setTaskName(e.target.value)} required />
                </div>
            </div>

            <div className="form-grid">
                <div className="form-group">
                    <label>Site Identity</label>
                    <input className="input-field" value={siteName} onChange={e => setSiteName(e.target.value)} required />
                </div>
            </div>

            <div className="form-grid">
                <div className="form-group">
                    <label>Latitude</label>
                    <input type="number" step="any" className="input-field" value={lat} onChange={e => setLat(Number(e.target.value))} required />
                </div>
                <div className="form-group">
                    <label>Longitude</label>
                    <input type="number" step="any" className="input-field" value={lon} onChange={e => setLon(Number(e.target.value))} required />
                </div>
            </div>

            <div className="form-grid">
                <div className="form-group">
                    <label>Timezone (IANA)</label>
                    <input className="input-field" value={tz} onChange={e => setTz(e.target.value)} required />
                </div>
                <div className="form-group">
                    <label>Workload Profile</label>
                    <select className="input-field" value={workload} onChange={e => setWorkload(e.target.value)}>
                        <option value="light">Light (Max 32°C Apparent Temp)</option>
                        <option value="moderate">Moderate (Max 30°C Apparent Temp)</option>
                        <option value="heavy">Heavy (Max 28°C Apparent Temp)</option>
                    </select>
                </div>
            </div>

            <div className="form-grid">
                <div className="form-group">
                    <label>Earliest Bound</label>
                    <input type="datetime-local" className="input-field" value={earliestStart} onChange={e => setEarliestStart(e.target.value)} required />
                </div>
                <div className="form-group">
                    <label>Planned Target</label>
                    <input type="datetime-local" className="input-field" value={plannedStart} onChange={e => setPlannedStart(e.target.value)} required />
                </div>
            </div>

            <div className="form-grid">
                <div className="form-group">
                    <label>Deadline (Hard Cutoff)</label>
                    <input type="datetime-local" className="input-field" value={deadline} onChange={e => setDeadline(e.target.value)} required />
                </div>
                <div className="form-group">
                    <label>Task Urgency</label>
                    <select className="input-field" value={urgency} onChange={e => setUrgency(e.target.value)}>
                        <option value="normal">Normal</option>
                        <option value="urgent">Urgent</option>
                        <option value="critical">Critical</option>
                    </select>
                </div>
            </div>

            <div className="form-grid">
                <div className="form-group">
                    <label>Duration (Minutes)</label>
                    <input type="number" className="input-field" value={duration} onChange={e => setDuration(Number(e.target.value))} required min={1} />
                </div>
            </div>

            <div className="form-grid">
                <div className="form-group">
                    <label>Operating Hours Start</label>
                    <input type="time" className="input-field" value={opStart} onChange={e => setOpStart(e.target.value)} required />
                </div>
                <div className="form-group">
                    <label>Operating Hours End</label>
                    <input type="time" className="input-field" value={opEnd} onChange={e => setOpEnd(e.target.value)} required />
                </div>
            </div>

            <div className="form-group" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input type="checkbox" checked={canReschedule} onChange={e => setCanReschedule(e.target.checked)} />
                <span style={{ fontSize: '0.85rem' }}>Allow Engine to Reschedule if conditions are unsafe</span>
            </div>

            <button type="submit" className="btn-primary" disabled={isLoading}>
                {isLoading ? 'Evaluating Limits...' : 'Execute Plan Verification'}
            </button>
        </form>
    );
}
