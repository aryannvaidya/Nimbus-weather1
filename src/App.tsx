import React, { useState, useEffect, useRef } from 'react';
import { formatTemp } from './lib/units';
import { Location, WeatherData, WeatherState, Settings } from './types';
import { fetchWeather, fetchWeatherBulk } from './services/weatherService';
import { getCachedWeatherData, saveWeatherData, STORAGE_KEYS, getCityKey } from './lib/storage';
import { initGestures } from './lib/gestures';
import WeatherSkeleton from './components/WeatherSkeleton';
import AtmosphereFX from './components/AtmosphereFX';
import SearchBar from './components/SearchBar';
import WeatherHero from './components/WeatherHero';
import { HourlyForecast, DailyForecast } from './components/Forecasts';
import WeatherDetails from './components/WeatherDetails';
import SunPath from './components/SunPath';
import { Icons } from './components/WeatherIcons';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring, useScroll, useMotionValueEvent } from 'motion/react';
import { cn } from './lib/utils';
import SettingsScreen from './components/SettingsScreen';
import CityManager from './components/CityManager';
import AlertsDisplay from './components/AlertsDisplay';
import { Haptic } from './lib/haptics';
import { format } from 'date-fns';
import WidgetView from './components/WidgetView';

const DEFAULT_LOCATION: Location = {
  id: 2643743,
  name: "London",
  latitude: 51.50853,
  longitude: -0.12574,
  country: "United Kingdom",
  timezone: "Europe/London"
};

const INITIAL_SETTINGS: Settings = {
  unitTemp: 'C',
  unitWind: 'km/h',
  unitPressure: 'mmHg',
  unitVisibility: 'km',
  unitPrecipitation: 'mm',
  iconStyle: 'outline',
  theme: 'black',
  hapticEnabled: true,
  notificationTime: '08:00',
  rainThreshold: 30,
  snowThreshold: 30,
  stormThreshold: true,
  alertRain: false,
  alertSevere: true,
  alertTrip: true,
  alertDaily: true,
  alertRealtime: false
};

export default function App() {
  const [state, setState] = useState<WeatherState>(() => {
    let cachedSettings = null;
    let cachedLocations = null;
    let cachedIndex = null;
    
    try {
      const s = localStorage.getItem('app_settings');
      if (s) {
        const parsed = JSON.parse(s);
        // Migration: Ensure theme exists
        if (!parsed.theme) parsed.theme = 'black';
        if (!parsed.unitPrecipitation) parsed.unitPrecipitation = 'mm';
        if (parsed.iconStyle === '3d') parsed.iconStyle = 'outline';
        cachedSettings = parsed;
      }
      
      const l = localStorage.getItem('app_locations');
      if (l) cachedLocations = JSON.parse(l);
      
      const idx = localStorage.getItem('app_active_index');
      if (idx) cachedIndex = parseInt(idx);
    } catch (e) {
      console.warn('Failed to parse cached weather data', e);
    }
    
    const initialLocations: Location[] = cachedLocations || [];
    const initialIndex = cachedIndex || 0;
    const initialWeatherData: Record<number, WeatherData> = {};
    
    // Attempt absolute zero-lag hydration of weather data from cache
    if (initialLocations.length > 0) {
      try {
        initialLocations.forEach((loc, idx) => {
          const cached = getCachedWeatherData(getCityKey(loc));
          if (cached && cached.data) {
            initialWeatherData[idx] = cached.data;
          }
        });
      } catch (e) {
        console.warn('Failed to hydrate weather data from cache', e);
      }
    }

    return {
      locations: initialLocations,
      activeLocationIndex: initialIndex,
      weatherData: initialWeatherData,
      loading: initialLocations.length > 0 && initialWeatherData[initialIndex] ? false : true,
      error: null,
      showSettings: false,
      settings: cachedSettings || INITIAL_SETTINGS
    };
  });

  // Consolidated startup logic: Hydrate and background refresh
  useEffect(() => {
    const isMounted = { current: true };
    const startup = async () => {
      const hasLocations = state.locations.length > 0;
      const isFirstCurrent = hasLocations && state.locations[0].name === "Current Location";

      if (!hasLocations || isFirstCurrent) {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              if (!isMounted.current) return;
              let timezone = 'UTC';
              try {
                timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
              } catch (e) {
                console.warn('Failed to detect timezone, falling back to UTC', e);
              }

              const myLocation: Location = {
                id: 0,
                name: "Current Location",
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                country: "Nearby",
                timezone
              };

              if (!hasLocations) {
                addLocation(myLocation);
              } else {
                // Update existing "Current Location"
                setState(prev => {
                  const newLocs = [...prev.locations];
                  newLocs[0] = myLocation;
                  return { 
                    ...prev, 
                    locations: newLocs,
                    loading: true // Show loading while fetching fresh data for new coordinates
                  };
                });
                
                // Fetch fresh weather for the new coordinates
                try {
                  const data = await fetchWeather(myLocation.latitude, myLocation.longitude, myLocation.timezone);
                  if (!isMounted.current) return;
                  saveWeatherData(getCityKey(myLocation), data);
                  setState(prev => ({
                    ...prev,
                    weatherData: { ...prev.weatherData, [0]: data },
                    loading: false
                  }));
                } catch (err) {
                  if (isMounted.current) {
                    console.warn("Failed to fetch weather for updated current location:", err);
                    setState(prev => ({ ...prev, loading: false }));
                  }
                }

                // Also trigger batch load for rest if needed
                if (state.locations.length > 1) {
                   loadWeatherBatch(state.locations.slice(1), 1);
                }
              }
            },
            (err) => {
              if (isMounted.current) {
                console.warn("Geolocation failed or denied:", err.message);
                if (!hasLocations) {
                  addLocation(DEFAULT_LOCATION);
                } else {
                  loadWeatherBatch(state.locations);
                }
              }
            },
            { timeout: 10000, enableHighAccuracy: true }
          );
        } else {
          if (!hasLocations) {
            addLocation(DEFAULT_LOCATION);
          } else {
            loadWeatherBatch(state.locations);
          }
        }
      } else {
        // Just standard load
        setTimeout(() => {
          if (isMounted.current) loadWeatherBatch(state.locations);
        }, 800);
      }
    };

    startup();
    return () => { isMounted.current = false; };
  }, []);

  const [dismissedAlerts, setDismissedAlerts] = useState<Record<string, number>>(() => {
    try {
      const d = localStorage.getItem('app_dismissed_alerts');
      return d ? JSON.parse(d) : {};
    } catch { return {}; }
  });

  useEffect(() => {
    localStorage.setItem('app_dismissed_alerts', JSON.stringify(dismissedAlerts));
  }, [dismissedAlerts]);

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showCityManager, setShowCityManager] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  
  const { scrollY } = useScroll();
  
  useMotionValueEvent(scrollY, "change", (latest) => {
    const next = latest < 40;
    if (headerVisible !== next) {
      setHeaderVisible(next);
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.settings.theme);
  }, [state.settings.theme]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      // Trigger refresh for all locations when back online using staggered approach
      loadWeatherBatch(state.locations);
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [state.locations]);

  const loadWeather = async (location: Location, index: number, forceRefresh = false) => {
    if (!location) return;

    // 1. Try Cache First for Speed
    const cacheResult = getCachedWeatherData(getCityKey(location));
    if (cacheResult && !forceRefresh) {
      const { data: cachedData } = cacheResult;
      setState(prev => ({
        ...prev,
        weatherData: { ...prev.weatherData, [index]: cachedData },
        loading: false,
        error: null
      }));
      // If we are online and cache is reasonably fresh, we can skip immediate background refresh
      const isStale = Date.now() - (cachedData.fetchedAt || 0) > 30 * 60 * 1000;
      if (!navigator.onLine || !isStale) return;
    }

    try {
      const data = await fetchWeather(location.latitude, location.longitude, location.timezone);
      saveWeatherData(getCityKey(location), data);
      
      setState(prev => {
        if (prev.locations.length <= index || prev.locations[index]?.name !== location.name) {
          return prev;
        }
        return {
          ...prev,
          weatherData: { ...prev.weatherData, [index]: data },
          loading: false,
          error: null,
        };
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`Weather fetch failed for ${location?.name || 'Unknown'}:`, errorMsg);
      
      let message = 'Weather service unavailable';
      if (err instanceof Error) {
        message = err.message;
        // Intercept generic "Failed to fetch" which is often a CORS or network block issue
        if (message.toLowerCase().includes('failed to fetch') || message.toLowerCase().includes('fetch')) {
           message = 'Could not connect to the weather server. You might be offline, using an ad-blocker, or the service is temporarily restricted in your region.';
        }
        if (message === 'Script error.') {
          message = 'A connection error occurred. Please check your internet and try again.';
        }
      }

      // If we already have cache but fetch failed (likely offline/timeout), keep the cache
      if (state.weatherData[index]) {
        setState(prev => ({ ...prev, loading: false }));
        return;
      }

      setState(prev => ({
        ...prev,
        loading: false,
        error: prev.activeLocationIndex === index ? message : prev.error,
      }));
    }
  };

  const addLocation = (location: Location) => {
    // 1. Check if location already exists upfront to avoid async state issues
    const existsIndex = state.locations.findIndex(l => 
      (l.latitude === location.latitude && l.longitude === location.longitude) || 
      (l.id !== 0 && l.id === location.id)
    );

    if (existsIndex !== -1) {
      setState(prev => ({ 
        ...prev, 
        activeLocationIndex: existsIndex, 
        showSettings: false 
      }));
      return;
    }

    // 2. Prepare new list and index
    const newIndex = state.locations.length;
    const newLocations = [...state.locations, location];

    // 3. Update state with immediate loading for the new index
    setState(prev => ({
      ...prev,
      locations: newLocations,
      activeLocationIndex: newIndex,
      loading: true,
      error: null
    }));

    // 4. Trigger weather fetch for the new city
    loadWeather(location, newIndex);
  };

  const removeLocation = (index: number) => {
    setState(prev => {
      const newLocations = prev.locations.filter((_, i) => i !== index);
      const newIndex = Math.max(0, Math.min(newLocations.length - 1, prev.activeLocationIndex));
      
      // Clean up weather data map
      const newWeatherData: Record<number, WeatherData> = {};
      newLocations.forEach((_, i) => {
        const oldIndex = i < index ? i : i + 1;
        if (prev.weatherData[oldIndex]) {
          newWeatherData[i] = prev.weatherData[oldIndex];
        }
      });

      return {
        ...prev,
        locations: newLocations,
        activeLocationIndex: newIndex,
        weatherData: newWeatherData
      };
    });
  };

  const reorderLocations = (newLocations: Location[]) => {
    setState(prev => {
      // Rebuild weather data map based on new order
      const newWeatherData: Record<number, WeatherData> = {};
      newLocations.forEach((loc, i) => {
        const oldIndex = prev.locations.findIndex(l => l.name === loc.name && l.latitude === loc.latitude);
        if (oldIndex !== -1 && prev.weatherData[oldIndex]) {
          newWeatherData[i] = prev.weatherData[oldIndex];
        }
      });

      return {
        ...prev,
        locations: newLocations,
        weatherData: newWeatherData
      };
    });
  };

  const loadWeatherBatch = async (locations: Location[], startIndex = 0) => {
    if (locations.length === 0) return;

    // Load from cache first for immediate display (Persistent Offline Mode)
    const initialCachedData: Record<number, WeatherData> = {};
    locations.forEach((loc, idx) => {
      const cached = getCachedWeatherData(getCityKey(loc));
      if (cached) initialCachedData[startIndex + idx] = cached.data;
    });

    if (Object.keys(initialCachedData).length > 0) {
      setState(prev => ({
        ...prev,
        weatherData: { ...prev.weatherData, ...initialCachedData },
        loading: false
      }));
    }

    if (!navigator.onLine) return;

    // Use bulk fetch for significantly improved performance
    try {
      const bulkData = await fetchWeatherBulk(locations);
      
      setState(prev => {
        const newWeatherData = { ...prev.weatherData };
        Object.entries(bulkData).forEach(([index, data]) => {
          const idx = parseInt(index);
          const absoluteIdx = startIndex + idx;
          newWeatherData[absoluteIdx] = data as WeatherData;
          // Save to persistent cache
          saveWeatherData(getCityKey(locations[idx]), data as WeatherData);
        });

        return {
          ...prev,
          weatherData: newWeatherData,
          loading: false,
          error: null
        };
      });
    } catch (err) {
      console.warn('Bulk weather load failed, falling back to cache/staggered:', err);
      // If we are online but bulk fails, try staggered
      if (navigator.onLine) {
        for (let i = 0; i < locations.length; i++) {
          await loadWeather(locations[i], startIndex + i);
          if (i < locations.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
    }
  };

  useEffect(() => {
    localStorage.setItem('app_settings', JSON.stringify(state.settings));
    localStorage.setItem('app_locations', JSON.stringify(state.locations));
    localStorage.setItem('app_active_index', state.activeLocationIndex.toString());
  }, [state.settings, state.locations, state.activeLocationIndex]);

  const activeWeather = state.weatherData[state.activeLocationIndex];
  const activeLocation = state.locations[state.activeLocationIndex];

  // Push Notification Helper
  const sendNotification = async (title: string, body: string, icon: string = '/favicon.ico') => {
    if (!state.settings.hapticEnabled) return; // Respect global haptic/alert setting
    Haptic.warning(state.settings.hapticEnabled);

    if (!("Notification" in window)) return;

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      // Use ServiceWorker if available (required on Vercel/HTTPS)
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready.catch(() => null);
        if (reg) {
          reg.showNotification(title, { body, icon });
          return;
        }
      }

      // Fallback for local/AI Studio preview only
      new Notification(title, { body, icon });
    } catch (e) {
      console.warn("Notification failed:", e);
    }
  };

  useEffect(() => {
    if (!activeWeather || !activeWeather.hourly || !activeWeather.current) return;
    const w = activeWeather;
    const s = state.settings;
    const alerts: any[] = [];

    // 1. Rain Alerts
    const rainProb = w.hourly.precipitationProbability[0];
    if (s.alertRain && rainProb >= s.rainThreshold) {
      alerts.push({
        id: 'rain-alert',
        type: 'rain',
        title: 'Rain Expected',
        message: `There is a ${rainProb}% chance of rain in the next hour.`
      });
    }

    // 2. Snow Alerts
    const snowAmount = w.hourly.snowfall?.[0] || 0;
    if (s.alertDaily && snowAmount > 0) { // Using daily alert toggle for snow too
       alerts.push({
        id: 'snow-alert',
        type: 'storm',
        title: 'Snowfall Warning',
        message: 'Snow is currently predicted in your area.'
      });
    }

    // 3. Thunderstorm check
    if (s.stormThreshold && [95, 96, 99].includes(w.current.weatherCode)) {
      alerts.push({
        id: 'storm-alert',
        type: 'storm',
        title: 'Thunderstorm Warning',
        message: 'A thunderstorm is currently being observed in your area.'
      });
    }

    // 4. Severe weather (Using weather codes for heavy storms/hail)
    if (s.alertSevere && [82, 86, 99].includes(w.current.weatherCode)) {
      alerts.push({
        id: 'severe-alert',
        type: 'severe',
        title: 'Severe Weather Warning',
        message: 'Extreme precipitation or conditions detected.'
      });
    }

    // 5. AQI Alert
    if (w.airQuality && w.airQuality.usAqi > 100) {
      alerts.push({
        id: 'aqi-alert',
        type: 'severe',
        title: 'Air Quality Warning',
        message: `Air quality is ${w.airQuality.description} (${w.airQuality.usAqi}).`
      });
    }

    const now = Date.now();
    const active = alerts.filter(alert => {
      const dismissedAt = dismissedAlerts[alert.id];
      if (!dismissedAt) return true;
      const hoursSinceDismissal = (now - dismissedAt) / (1000 * 60 * 60);
      return hoursSinceDismissal > 24;
    });

    // Trigger push notifications for NEW alerts
    active.forEach(alert => {
      if (!activeAlerts.some(a => a.id === alert.id)) {
        sendNotification(alert.title, alert.message);
      }
    });

    setActiveAlerts(active);
  }, [activeWeather, state.settings, dismissedAlerts]);

  // Daily Summary (Time-based)
  useEffect(() => {
    const checkNotification = () => {
      if (!activeWeather || !activeWeather.daily || !activeWeather.daily.temperatureMax || !state.settings.alertDaily) return;
      const now = Date.now();
      const timeStr = format(now, 'HH:mm');
      if (timeStr === state.settings.notificationTime) {
        const summary = `Today: ${formatTemp(activeWeather.daily.temperatureMax[0], state.settings.unitTemp)}°${state.settings.unitTemp}, ${activeWeather.airQuality?.description} Air.`;
        sendNotification("Nimbus Weather", summary);
      }
    };

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    const interval = setInterval(checkNotification, 60000); 
    return () => clearInterval(interval);
  }, [activeWeather, state.settings.notificationTime, state.settings.alertDaily, state.settings.unitTemp]);

  const updateSettings = (settings: Settings) => {
    setState(prev => ({ ...prev, settings }));
  };

  const toggleSettings = () => {
    requestAnimationFrame(() => {
      Haptic.medium(state.settings.hapticEnabled);
      setState(prev => ({ ...prev, showSettings: !prev.showSettings }));
    });
  };

  // Manual refresh logic
  const handleRefresh = async () => {
    if (isRefreshing || state.locations.length === 0) return;
    setIsRefreshing(true);
    Haptic.medium(state.settings.hapticEnabled);
    
    try {
      await loadWeatherBatch(state.locations);
      Haptic.success(state.settings.hapticEnabled);
    } catch (e) {
      Haptic.warning(state.settings.hapticEnabled);
    } finally {
      setTimeout(() => setIsRefreshing(false), 800);
    }
  };

  const handleSwipe = (direction: 'left' | 'right') => {
    Haptic.light(state.settings.hapticEnabled);
    setSlideDirection(direction);
    
    setState(prev => {
      const isLeft = direction === 'left';
      let nextIndex;
      if (isLeft) {
        nextIndex = (prev.activeLocationIndex + 1) % prev.locations.length;
      } else {
        nextIndex = (prev.activeLocationIndex - 1 + prev.locations.length) % prev.locations.length;
      }
      return { ...prev, activeLocationIndex: nextIndex };
    });
    
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  useEffect(() => {
    const cleanup = initGestures();

    const onSwipeLeft = () => {
      if (state.showSettings || showSearch || showCityManager) return;
      handleSwipe('left');
    };

    const onSwipeRight = () => {
      if (state.showSettings || showSearch || showCityManager) return;
      handleSwipe('right');
    };

    const onPullRefresh = () => {
      handleRefresh();
    };

    window.addEventListener('swipe-left', onSwipeLeft);
    window.addEventListener('swipe-right', onSwipeRight);
    window.addEventListener('pull-refresh', onPullRefresh);

    return () => {
      cleanup();
      window.removeEventListener('swipe-left', onSwipeLeft);
      window.removeEventListener('swipe-right', onSwipeRight);
      window.removeEventListener('pull-refresh', onPullRefresh);
    };
  }, [state.locations.length, state.activeLocationIndex]);

  const weatherContent = React.useMemo(() => {
    if (!activeWeather || !activeLocation) return null;
    
    // Dynamic offsets for slide animation
    const xOffset = slideDirection === 'left' ? 80 : -80;

    return (
      <motion.div
        key={`${activeLocation.id}-${activeLocation.name}`}
        initial={{ opacity: 0, x: slideDirection ? xOffset : 0 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -xOffset }}
        transition={{ 
          type: "spring",
          damping: 30,
          stiffness: 400,
          mass: 0.5
        }}
        className="flex flex-col gap-4 gpu"
      >
        <WeatherHero 
          weather={activeWeather} 
          location={activeLocation} 
          settings={state.settings} 
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />
        <HourlyForecast 
          weather={activeWeather} 
          settings={state.settings} 
        />
        <DailyForecast 
          weather={activeWeather} 
          settings={state.settings} 
        />
        <WeatherDetails 
          weather={activeWeather} 
          settings={state.settings} 
        />
        <SunPath 
          weather={activeWeather}
          settings={state.settings}
        />

        <div className="flex flex-col items-center gap-6 text-center mt-16 mb-24 opacity-30 select-none">
          <div className="h-[1px] w-12 bg-app-text/10" />
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-center gap-2">
              <div className="p-1 rounded-md bg-app-text/5 border border-app-border/50">
                <Icons.ShieldCheck className="w-3 h-3" />
              </div>
              <p className="text-[10px] text-app-text font-black uppercase tracking-[0.25em]">
                Verified Source
              </p>
            </div>
            <p className="text-[9px] text-app-text-dim font-medium tracking-widest leading-relaxed">
              Hyper-local payload delivered by Open-Meteo<br/>
              Network Node: {activeLocation?.timezone || 'Universal'}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }, [activeWeather, activeLocation, state.settings, isRefreshing]);

  return (
    <div className="min-h-screen bg-app-bg text-app-text font-sans selection:bg-app-text/20 transition-colors duration-500">
      <AtmosphereFX 
        weatherCode={activeWeather?.current.weatherCode ?? 0}
        isDay={activeWeather?.current.isDay ?? true}
        moonPhase={activeWeather?.daily.moonPhase?.[0] ?? 0}
        locationName={activeLocation?.name ?? ''}
      />

      {/* LAYER 1: UI OVERLAY - Permanently Fixed */}
      <div id="ui-overlay" className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] h-24 pointer-events-none">
        <motion.div 
          className="w-full h-full relative"
          initial={false}
          animate={{
            y: headerVisible ? 0 : -100,
            opacity: headerVisible ? 1 : 0,
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 40, mass: 1 }}
        >
          {/* Add City Button - Top Left */}
          <div className="absolute left-6 top-8 pointer-events-auto">
            <motion.button 
              id="add-city-btn"
              onClick={() => {
                Haptic.light(state.settings.hapticEnabled);
                setShowCityManager(true);
              }}
              className="w-11 h-11 bg-white/10 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-app-text active:scale-95 transition-all shadow-lg"
              initial={false}
              animate={{
                opacity: state.showSettings || showCityManager ? 0 : 1,
                pointerEvents: state.showSettings || showCityManager ? 'none' : 'auto',
                scale: state.showSettings || showCityManager ? 0.8 : 1,
              }}
            >
              <Icons.LayoutGrid className="w-5 h-5 text-app-text" strokeWidth={1.5} />
            </motion.button>
          </div>

          {/* Settings Button - Top Right */}
          <div className="absolute right-6 top-8 pointer-events-auto">
            <motion.button 
              id="settings-btn"
              onClick={toggleSettings}
              className="group active:scale-95 transition-all w-11 h-11 flex items-center justify-center min-w-[44px]"
            >
              <AnimatePresence mode="wait">
                {state.showSettings ? (
                  <motion.div
                    key="back"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex items-center text-app-text pr-2"
                  >
                    <Icons.ChevronLeft className="w-5 h-5 mr-0.5" strokeWidth={2.5} />
                    <span className="text-[16px] font-medium text-app-text">Back</span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="w-11 h-11 bg-white/10 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-app-text group-hover:text-app-text transition-colors shadow-lg"
                  >
                    <Icons.Settings2 className="w-5 h-5" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          </div>

          {/* City Name & Pagination - Center */}
          <div id="city-dots" className="absolute left-1/2 -translate-x-1/2 top-9 flex flex-col items-center pointer-events-none">
            <AnimatePresence mode="wait">
              <motion.div 
                key={activeLocation?.id || activeLocation?.name || 'loading'}
                initial={{ opacity: 0, y: -10 }}
                animate={{ 
                  opacity: state.showSettings || showCityManager ? 0 : 1,
                  y: 0 
                }}
                exit={{ opacity: 0, y: 10 }}
                className="flex flex-col items-center"
              >
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[17px] font-semibold text-app-text leading-tight">{activeLocation?.name || 'Loading...'}</span>
                  
                  {isOffline && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full"
                    >
                      <Icons.CloudOff className="w-2.5 h-2.5 text-amber-500" />
                      <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Offline</span>
                    </motion.div>
                  )}
                </div>

                <div className="flex gap-1.5 mt-2">
                  {state.locations.map((_, i) => (
                    <button 
                      key={i} 
                      onClick={() => {
                        if (state.activeLocationIndex !== i) {
                          Haptic.light(state.settings.hapticEnabled);
                          setState(prev => ({ ...prev, activeLocationIndex: i }));
                        }
                      }}
                      className={cn(
                        "w-1.5 h-1.5 rounded-full transition-all duration-300 pointer-events-auto",
                        state.activeLocationIndex === i 
                          ? "bg-white w-5 shadow-[0_0_8px_rgba(255,255,255,0.3)]" 
                          : "bg-white/40 hover:bg-white/60"
                      )} 
                    />
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {state.showSettings && (
          <SettingsScreen 
            settings={state.settings} 
            onUpdate={updateSettings} 
            onClose={toggleSettings} 
            activeWeather={activeWeather}
            activeLocation={activeLocation}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCityManager && (
          <CityManager 
            locations={state.locations}
            activeLocationIndex={state.activeLocationIndex}
            weatherData={state.weatherData}
            hapticEnabled={state.settings.hapticEnabled}
            onSelect={(index) => {
              Haptic.light(state.settings.hapticEnabled);
              setState(prev => ({ ...prev, activeLocationIndex: index }));
              setShowCityManager(false);
            }}
            onAdd={() => {
              Haptic.medium(state.settings.hapticEnabled);
              setShowSearch(true);
              setShowCityManager(false);
            }}
            onRemove={removeLocation}
            onReorder={reorderLocations}
            onClose={() => {
              Haptic.light(state.settings.hapticEnabled);
              setShowCityManager(false);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSearch && (
          <SearchBar 
            hapticEnabled={state.settings.hapticEnabled}
            onSelect={(loc) => {
              Haptic.success(state.settings.hapticEnabled);
              addLocation(loc);
              setShowSearch(false);
            }} 
            onClose={() => {
              Haptic.light(state.settings.hapticEnabled);
              setShowSearch(false);
            }}
          />
        )}
      </AnimatePresence>

      <main 
        id="swipe-layer"
        className="max-w-[390px] mx-auto px-6 pt-24 pb-32 min-h-screen relative touch-pan-y gpu will-change-transform"
      >
        {/* Pull to refresh logic handled by gestures.ts */}
        
        {activeWeather && (
          <AlertsDisplay 
            alerts={activeAlerts} 
            onDismiss={(id) => {
              Haptic.light(state.settings.hapticEnabled);
              setDismissedAlerts(prev => ({ ...prev, [id]: Date.now() }));
              setActiveAlerts(prev => prev.filter(a => a.id !== id));
            }} 
          />
        )}

        <AnimatePresence mode="wait">
          {state.loading && !activeWeather ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <WeatherSkeleton />
            </motion.div>
          ) : state.error && !activeWeather ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-40 gap-8 text-center px-6"
            >
              <div className="p-8 bg-app-text/5 rounded-full relative">
                <Icons.ShieldAlert className="w-16 h-16 text-app-text-dim/40" strokeWidth={1} />
                <div className="absolute inset-0 bg-red-500/5 blur-3xl rounded-full" />
              </div>
              <div className="flex flex-col gap-4 max-w-xs mx-auto">
                <h2 className="text-xl font-bold tracking-tight">Something went wrong</h2>
                <div className="flex flex-col gap-2">
                  <p className="text-app-text-dim text-sm font-medium leading-relaxed">
                    {state.error.includes('offline') 
                      ? "It looks like you're offline or the connection is too slow. Please check your network and try again."
                      : state.error}
                  </p>
                  {state.error.includes('ad-blocker') && (
                    <div className="flex flex-col gap-2 mt-2">
                       <p className="text-blue-400 text-[11px] font-bold tracking-wider uppercase bg-blue-500/10 py-2 px-3 rounded-xl">
                          Tip: Try disabling ad-blockers for this domain
                       </p>
                       <p className="text-app-text-dim text-[10px] italic">
                          Regional firewall or VPN settings may also block weather delivery.
                       </p>
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => {
                    Haptic.light(state.settings.hapticEnabled);
                    setState(prev => ({ ...prev, error: null, loading: true }));
                    if (activeLocation) {
                      loadWeather(activeLocation, state.activeLocationIndex, true);
                    } else {
                      addLocation(DEFAULT_LOCATION);
                    }
                  }}
                  className={cn(
                    "mt-4 py-4 px-8 bg-app-text text-app-bg rounded-2xl text-sm font-black tracking-widest uppercase shadow-xl",
                    "transition-all active:scale-95"
                  )}
                >
                  Reconnect
                </button>
              </div>
            </motion.div>
          ) : activeWeather ? (
            weatherContent
          ) : (
            <motion.div
              key="nodata"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-40 gap-4 text-center px-6"
            >
              <Icons.CloudOff className="w-16 h-16 text-app-text-dim/20" />
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-bold tracking-tight text-app-text">No Data Available</h2>
                <p className="text-app-text-dim text-sm max-w-[240px]">
                   We couldn't retrieve weather for this location. Tap below to try again.
                </p>
              </div>
              <button 
                onClick={() => {
                  Haptic.light(state.settings.hapticEnabled);
                  if (activeLocation) loadWeather(activeLocation, state.activeLocationIndex, true);
                } }
                className="mt-4 py-3 px-8 bg-app-text/10 hover:bg-app-text/15 text-app-text rounded-2xl text-xs font-black tracking-widest uppercase transition-all"
              >
                Retry
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
