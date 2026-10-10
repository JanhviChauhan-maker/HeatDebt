import { createContext, useContext, useState } from 'react';

export interface SiteContextData {
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
}

export interface StoreContextType {
    activeSite: SiteContextData;
    setActiveSite: (site: SiteContextData) => void;
    alerts: any[];
    addAlert: (alert: any) => void;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export function StoreProvider({ children }: { children: React.ReactNode }) {
    const [activeSite, setActiveSite] = useState<SiteContextData>({
        name: "Alpha Sector", latitude: 23.02, longitude: 72.57, timezone: "Asia/Kolkata"
    });
    const [alerts, setAlerts] = useState<any[]>([]);

    const addAlert = (alert: any) => {
        setAlerts(prev => [alert, ...prev]);
    };

    return (
        <StoreContext.Provider value={{
            activeSite, setActiveSite,
            alerts, addAlert
        }}>
            {children}
        </StoreContext.Provider>
    );
}

export function useStore() {
    const ctx = useContext(StoreContext);
    if (!ctx) throw new Error("useStore must be used inside StoreProvider");
    return ctx;
}
