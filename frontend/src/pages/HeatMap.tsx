import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import { useStore } from '../context/OperationalContext';

import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({
    iconUrl, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function LocationUpdater({ location }: { location: [number, number] }) {
    const map = useMap();
    useEffect(() => {
        map.setView(location, 11, { animate: true });
    }, [location, map]);
    return null;
}

export default function HeatMapPage() {
    const { activeSite, setActiveSite } = useStore();
    const position: [number, number] = [activeSite.latitude, activeSite.longitude];

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const [forecastData, setForecastData] = useState<any[]>([]);
    const [loadingForecast, setLoadingForecast] = useState(false);

    // Controls
    const [selectedHour, setSelectedHour] = useState(0);
    const [workload, setWorkload] = useState<'light' | 'moderate' | 'heavy'>('moderate');
    const [showOverlay, setShowOverlay] = useState(true);

    const thresholds = { light: 32, moderate: 30, heavy: 28 };

    // Geocoding Search
    const handleSearch = async () => {
        if (!searchQuery) return;
        setIsSearching(true);
        try {
            const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchQuery)}&count=5`);
            const data = await res.json();
            setSearchResults(data.results || []);
        } catch (e) {
            console.error("Geocoding failed", e);
        } finally {
            setIsSearching(false);
        }
    };

    const selectLocation = (res: any) => {
        setActiveSite({
            ...activeSite,
            name: `${res.name}, ${res.country}`,
            latitude: res.latitude,
            longitude: res.longitude,
            timezone: res.timezone || 'UTC'
        });
        setSearchResults([]);
        setSearchQuery('');
    };

    // Fetch live weather from our backend
    useEffect(() => {
        async function fetchForecast() {
            setLoadingForecast(true);
            try {
                const now = new Date();
                const start = now.toISOString().slice(0, 10);
                const end = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

                const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
                const url = new URL(`${baseUrl}/api/weather`);
                url.searchParams.append('lat', activeSite.latitude.toString());
                url.searchParams.append('lon', activeSite.longitude.toString());
                url.searchParams.append('tz', activeSite.timezone);
                url.searchParams.append('start_date', start);
                url.searchParams.append('end_date', end);

                const resWea = await fetch(url.toString());
                if (resWea.ok) {
                    const wjson = await resWea.json();
                    setForecastData(wjson.points || []);
                } else {
                    setForecastData([]);
                }
            } catch (err) {
                console.error("Forecast Map Error", err);
                setForecastData([]);
            } finally {
                setLoadingForecast(false);
            }
        }
        fetchForecast();
        setSelectedHour(0);
    }, [activeSite]);

    // Active Data Point
    const activePoint = forecastData[selectedHour] || null;
    const threshold = thresholds[workload];

    // Risk Classification
    const getRiskColor = (apparent: number) => {
        if (apparent >= threshold + 5) return '#dc2626'; // High/Extreme
        if (apparent >= threshold) return '#f97316'; // Elevated (reschedule)
        return '#22c55e'; // Lower Risk
    };

    const riskColor = activePoint && activePoint.apparent_temperature !== null
        ? getRiskColor(activePoint.apparent_temperature)
        : '#475569';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', position: 'relative' }}>

            {/* Header Settings */}
            <div className="glass-panel" style={{ padding: '15px 24px', display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '300px' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Location Search (Open-Meteo Geocoding)</label>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                        <input
                            type="text"
                            placeholder="Search city..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            style={{ flex: 1 }}
                        />
                        <button className="btn" onClick={handleSearch} disabled={isSearching}>Search</button>
                    </div>
                    {searchResults.length > 0 && (
                        <div style={{ background: 'var(--bg-dark)', border: '1px solid var(--panel-border)', marginTop: '5px', borderRadius: '4px', position: 'absolute', zIndex: 1000, width: '300px' }}>
                            {searchResults.map((r, i) => (
                                <div key={i} style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }} onClick={() => selectLocation(r)}>
                                    {r.name}, {r.admin1 || ''} {r.country}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Workload Threshold</label>
                    <select value={workload} onChange={(e: any) => setWorkload(e.target.value)} style={{ display: 'block', marginTop: '5px' }}>
                        <option value="light">Light Work ({thresholds.light}°C limit)</option>
                        <option value="moderate">Moderate Work ({thresholds.moderate}°C limit)</option>
                        <option value="heavy">Heavy Work ({thresholds.heavy}°C limit)</option>
                    </select>
                </div>

                <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Risk Halo Overlay</label>
                    <div style={{ marginTop: '5px' }}>
                        <button className="btn" onClick={() => setShowOverlay(!showOverlay)} style={{ background: showOverlay ? 'var(--heat-green)' : 'var(--bg-dark)' }}>
                            {showOverlay ? 'Overlay ON' : 'Overlay OFF'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Map Container */}
            <div className="glass-panel" style={{ flex: 1, padding: 0, overflow: 'hidden', minHeight: '500px', display: 'flex', position: 'relative' }}>
                <MapContainer center={position} zoom={11} style={{ height: '100%', width: '100%', background: 'var(--bg-navy)' }}>
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        className="map-tiles-dark"
                    />

                    <LocationUpdater location={position} />

                    <Marker position={position}>
                        <Popup>
                            <strong>{activeSite.name}</strong><br />
                            Coordinates: {activeSite.latitude.toFixed(4)}, {activeSite.longitude.toFixed(4)}
                        </Popup>
                    </Marker>

                    {showOverlay && activePoint && activePoint.apparent_temperature !== null && (
                        <Circle
                            center={position}
                            radius={8000} // 8km visual halo representing point-forecast coverage 
                            pathOptions={{ fillColor: riskColor, color: riskColor, weight: 2, fillOpacity: 0.3 }}
                        />
                    )}
                </MapContainer>

                {/* Floating Site Info Panel */}
                <div style={{
                    position: 'absolute', top: '20px', right: '20px', zIndex: 1000,
                    background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(10px)',
                    border: `1px solid ${riskColor}`, borderRadius: '8px', padding: '15px',
                    width: '320px', color: 'var(--text-main)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                }}>
                    <h3 style={{ margin: '0 0 10px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '5px' }}>Node: {activeSite.name}</h3>

                    {loadingForecast ? (
                        <div style={{ color: 'var(--text-muted)' }}>Intercepting Realpoint Telemetry...</div>
                    ) : forecastData.length === 0 ? (
                        <div style={{ color: 'var(--heat-red)' }}>ERROR: No Forecast Data</div>
                    ) : !activePoint || activePoint.apparent_temperature === null ? (
                        <div style={{ color: 'var(--heat-orange)' }}>MISSING: Gap in API Grid</div>
                    ) : (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Local Time</span>
                                <strong>{new Date(activePoint.timestamp).toLocaleString('en-US', { timeZone: activeSite.timezone, hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Apparent Risk</span>
                                <strong style={{ color: riskColor, fontSize: '1.2rem' }}>{activePoint.apparent_temperature.toFixed(1)} °C</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Limit Exceedance</span>
                                <strong style={{ color: activePoint.apparent_temperature >= threshold ? 'var(--heat-red)' : 'var(--heat-green)' }}>
                                    {activePoint.apparent_temperature >= threshold ? `+${(activePoint.apparent_temperature - threshold).toFixed(1)}°C` : 'SAFE'}
                                </strong>
                            </div>
                        </div>
                    )}

                    {forecastData.length > 0 && (
                        <div style={{ marginTop: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                <span>+0hr</span>
                                <span>Forecast Slider</span>
                                <span>+24hr</span>
                            </div>
                            <input
                                type="range"
                                min={0}
                                max={forecastData.length - 1}
                                value={selectedHour}
                                onChange={e => setSelectedHour(parseInt(e.target.value))}
                                style={{ width: '100%', marginTop: '5px', accentColor: riskColor }}
                            />
                        </div>
                    )}
                </div>

                <style>{`
                    .map-tiles-dark {
                        filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3) brightness(0.7);
                    }
                `}</style>
            </div>

            {/* Legend Footer */}
            <div style={{ display: 'flex', gap: '20px', padding: '10px', background: 'var(--bg-panel)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#22c55e', opacity: 0.5 }}></div>
                    <span style={{ fontSize: '0.85rem' }}>Lower Risk (Under {threshold}°C)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#f97316', opacity: 0.5 }}></div>
                    <span style={{ fontSize: '0.85rem' }}>Elevated Risk (Near {threshold}°C)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#dc2626', opacity: 0.5 }}></div>
                    <span style={{ fontSize: '0.85rem' }}>High Risk (+5°C over limit)</span>
                </div>
            </div>

        </div>
    );
}
