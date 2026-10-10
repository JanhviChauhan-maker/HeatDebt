import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { StoreProvider, useStore } from './context/OperationalContext';
import OperationsPlanner from './pages/OperationsPlanner';
import {
  LayoutDashboard, Map as MapIcon, Activity, CalendarClock,
  AlertTriangle, History as HistoryIcon, Settings, Menu, GitCompare
} from 'lucide-react';

import OverviewPage from './pages/Overview';
import HeatMapPage from './pages/HeatMap';
import ExposureTimeline from './pages/ExposureTimeline';
import AnalyticsPage from './pages/Analytics';
import AlertsPage from './pages/Alerts';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/Settings';
import WhatIfPlanner from './pages/WhatIfPlanner';
import ForecastMonitor from './pages/ForecastMonitor';

// Main Sidebar Component
function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { path: '/overview', icon: <LayoutDashboard size={20} />, label: 'Overview' },
    { path: '/map', icon: <MapIcon size={20} />, label: 'Heat Map' },
    { path: '/timeline', icon: <Activity size={20} />, label: 'Exposure Timeline' },
    { path: '/planner', icon: <CalendarClock size={20} />, label: 'Operations Planner' },
    { path: '/what-if', icon: <GitCompare size={20} />, label: 'What-If Planner' },
    { path: '/forecast-changes', icon: <Activity size={20} />, label: 'Change Monitor' },
    { path: '/analytics', icon: <AlertTriangle size={20} />, label: 'Risk Analytics' },
    { path: '/alerts', icon: <AlertTriangle size={20} color="#f97316" />, label: 'Active Alerts' },
    { path: '/history', icon: <HistoryIcon size={20} />, label: 'Evaluation History' },
    { path: '/settings', icon: <Settings size={20} />, label: 'Safety Policies' },
  ];

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
        <div onClick={() => setCollapsed(!collapsed)} style={{ cursor: 'pointer' }}>
          <Menu size={24} color="var(--accent-cyan)" />
        </div>
        {!collapsed && <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)' }}>HeatDebt OS</h2>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: '10px' }}>
        {navItems.map(item => (
          <Link
            key={item.path}
            to={item.path}
            className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
          >
            {item.icon}
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

// Topbar Component
function Topbar() {
  const { activeSite } = useStore();
  return (
    <div className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Active Sector: </span>
          <strong style={{ color: 'var(--accent-cyan)' }}>{activeSite.name}</strong>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Coordinates: </span>
          <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>{activeSite.latitude.toFixed(4)}, {activeSite.longitude.toFixed(4)}</strong>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Timezone: </span>
          <span className="badge cyan">{activeSite.timezone}</span>
        </div>
      </div>
      <div>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Data Link: </span>
        <span style={{ color: 'var(--heat-green)', fontWeight: 'bold', fontSize: '0.85rem' }}>SECURE</span>
      </div>
    </div>
  );
}

function MainApp() {
  return (
    <BrowserRouter>
      <div id="root">
        <Sidebar />
        <div className="workspace">
          <Topbar />
          <div className="page-content">
            <Routes>
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<OverviewPage />} />
              <Route path="/map" element={<HeatMapPage />} />
              <Route path="/timeline" element={<ExposureTimeline />} />
              <Route path="/planner" element={<OperationsPlanner />} />
              <Route path="/what-if" element={<WhatIfPlanner />} />
              <Route path="/forecast-changes" element={<ForecastMonitor />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </div>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <MainApp />
    </StoreProvider>
  );
}
