import React, { useState, useEffect, useRef } from 'react';
import { formatTemp } from './lib/units';
import { Location, WeatherData, WeatherState, Settings } from './types';
import { fetchWeather, fetchWeatherBulk, getMoonPhaseInfo, getCurrentHourIndex, reverseGeocode, getCurrentWeatherState, getAQIDataWithFallback, getDataAgeHours, getAQIFromCacheOrLive } from './services/weatherService';
import { getCachedWeatherData, saveWeatherData, STORAGE_KEYS, getCityKey, CACHE_EXPIRY } from './lib/storage';
import { initGestures } from './lib/gestures';
import WeatherSkeleton from './components/WeatherSkeleton';
import SearchBar from './components/SearchBar';
import WeatherHero from './components/WeatherHero';
import { HourlyForecast, DailyForecast } from './components/Forecasts';
import WeatherDetails from './components/WeatherDetails';
import SunPath from './components/SunPath';
import { Icons } from './components/WeatherIcons';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'motion/react';
import { cn } from './lib/utils';
import SettingsScreen from './components/SettingsScreen';
import CityManager from './components/CityManager';
import WeatherRadarMap from './components/WeatherRadarMap';
import AlertsDisplay from './components/AlertsDisplay';
import { Haptic } from './lib/haptics';
import { format } from 'date-fns';
import { 
  NotifSettings, 
  scheduleMorningSummary, 
  scheduleNightSummary, 
  checkWeatherAlerts, 
  applyNotifToggleStates 
} from './services/oneSignalService';

const DEFAULT_LOCATION: Location | null = null;

const INITIAL_SETTINGS: Settings = {
  unitTemp: 'C',
  unitWind: 'km/h',
  unitPressure: 'mmHg',
  unitVisibility: 'km',
  unitPrecipitation: 'mm',
  iconStyle: 'coloured',
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
  alertRealtime: false,
  timeFormat: '12h',
  pushEnabled: false,
  alertMorningSummary: false,
  alertNightSummary: false,
  enabledTiles: {
    aqi: true,
    uv: true,
    humidity: true,
    visibility: true,
    precipitation: true,
    wind: true
  }
};

const LocationState = {
  hasLocation:     false,
  isLoading:       false,
  lat:             null as number | null,
  lon:             null as number | null,
  cityName:        null as string | null,
  lastUpdated:     null as number | null,
  permissionState: null as string | null, // "granted"|"denied"|"prompt"

  save() {
    localStorage.setItem("location_state", JSON.stringify({
      hasLocation: this.hasLocation,
      lat:         this.lat,
      lon:         this.lon,
      cityName:    this.cityName,
      lastUpdated: this.lastUpdated,
    }));
  },

  load() {
    const saved = localStorage.getItem("location_state");
    if (!saved) return false;
    try {
      const s = JSON.parse(saved);
      this.hasLocation = s.hasLocation;
      this.lat         = s.lat;
      this.lon         = s.lon;
      this.cityName    = s.cityName;
      this.lastUpdated = s.lastUpdated;
      return this.hasLocation;
    } catch { return false; }
  },

  clear() {
    this.hasLocation = false;
    this.lat         = null;
    this.lon         = null;
    this.cityName    = null;
    this.lastUpdated = null;
    localStorage.removeItem("location_state");
  }
};

// Background AQI refresh tracking variables
let aqiRefreshInterval: any = null;
const lastAQIFetch: Record<string, number> = {};

// Fast switching & tap helpers
const pauseAnimationsOnCard = (cardEl: HTMLElement) => {
  cardEl.querySelectorAll(
    "[class*='animate'], " +
    "[class*='particle'], " +
    "[class*='atmosphere'], " +
    "[class*='weather-fx']"
  ).forEach(el => {
    (el as HTMLElement).style.animationPlayState = "paused";
    (el as HTMLElement).style.willChange = "auto";
  });
};

const resumeAnimationsOnCard = (cardEl: HTMLElement) => {
  cardEl.querySelectorAll(
    "[class*='animate'], " +
    "[class*='particle'], " +
    "[class*='atmosphere'], " +
    "[class*='weather-fx']"
  ).forEach(el => {
    (el as HTMLElement).style.animationPlayState = "running";
    (el as HTMLElement).style.willChange = "transform, opacity";
  });
};

// Single source of truth for animation state
let animationsEnabled = false;

const killAnimations = () => {
  animationsEnabled = false;
  if (typeof window !== 'undefined') {
    document.documentElement.style.setProperty("--animation-state", "paused");
    document.body.setAttribute("data-animations", "off");
    document.body.classList.add("no-animations");
    document.querySelectorAll(".city-card, .atmosphere").forEach(card => {
      pauseAnimationsOnCard(card as HTMLElement);
    });
  }
};

const enableAnimations = () => {
  animationsEnabled = true;
  if (typeof window !== 'undefined') {
    document.documentElement.style.setProperty("--animation-state", "running");
    document.body.setAttribute("data-animations", "on");
    document.body.classList.remove("no-animations");
    document.querySelectorAll(
      "[class*='animate'], " +
      "[class*='particle'], " +
      "[class*='atmosphere']"
    ).forEach(el => {
      (el as HTMLElement).style.animationPlayState = "running";
    });
    // Resume only active card after render
    const activeCard = document.querySelector("#swipe-layer") as HTMLElement;
    if (activeCard) {
      resumeAnimationsOnCard(activeCard);
    }
    const atmosphere = document.querySelector(".atmosphere") as HTMLElement;
    if (atmosphere) {
      resumeAnimationsOnCard(atmosphere);
    }
  }
};

const disableAllAnimations = killAnimations;
const enableAllAnimations = enableAnimations;

// Step 4: Throttled rAF loop for lightweight animation coordination
if (typeof window !== 'undefined') {
  let lastFrame = 0;
  const FPS_LIMIT = 30;
  const FRAME_MIN_TIME = 1000 / FPS_LIMIT;

  const updateParticles = () => {
    // Coordinate/sync particles at 30fps
  };

  const updateWeatherFX = () => {
    // Coordinate/sync weatherFX at 30fps
  };

  const animationLoop = (timestamp: number) => {
    if (timestamp - lastFrame < FRAME_MIN_TIME) {
      requestAnimationFrame(animationLoop);
      return;
    }
    lastFrame = timestamp;

    updateParticles();
    updateWeatherFX();

    requestAnimationFrame(animationLoop);
  };

  requestAnimationFrame(animationLoop);
}

// Step 6: Power savings / reduced motion animation check
if (typeof window !== 'undefined') {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const checkBattery = async () => {
    const nav = navigator as any;
    if (!nav.getBattery) return false;
    try {
      const battery = await nav.getBattery();
      return battery.level < 0.2; // below 20%
    } catch {
      return false;
    }
  };

  const shouldReduceAnimations = async () => {
    const lowBattery = await checkBattery();
    return prefersReducedMotion || lowBattery;
  };

  shouldReduceAnimations().then(reduce => {
    if (reduce) {
      document.body.classList.add("reduced-animations");
    }
  });
}

const showCitySkeleton = () => {
  if (typeof window !== 'undefined') {
    const skeleton = document.getElementById("city-skeleton");
    if (skeleton) {
      skeleton.style.display = "flex";
      skeleton.style.opacity = "1";
    }
  }
};

const hideCitySkeleton = () => {
  if (typeof window !== 'undefined') {
    const skeleton = document.getElementById("city-skeleton");
    if (!skeleton) return;
    skeleton.style.opacity = "0";
    setTimeout(() => {
      const currentSkeleton = document.getElementById("city-skeleton");
      if (currentSkeleton) {
        currentSkeleton.style.display = "none";
      }
    }, 200);
  }
};

const addInstantTap = (selector: string, handler: (e: any) => void, hapticEnabled = true) => {
  if (typeof window === 'undefined') return;
  const elements = document.querySelectorAll(selector);
  elements.forEach(el => {
    let tapped = false;

    el.addEventListener("touchstart", (e) => {
      tapped = true;
      handler(e);
      Haptic.light(hapticEnabled);
    }, { passive: true });

    // Fallback for non-touch
    el.addEventListener("click", (e) => {
      if (!tapped) handler(e);
      tapped = false;
    });
  });
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
        // Migration: Ensure theme is black
        parsed.theme = 'black';
        if (!parsed.unitPrecipitation) parsed.unitPrecipitation = 'mm';
        if (parsed.iconStyle === '3d') parsed.iconStyle = 'outline';
        if (!parsed.enabledTiles) {
          parsed.enabledTiles = {
            aqi: true,
            uv: true,
            humidity: true,
            visibility: true,
            precipitation: true,
            wind: true
          };
        }
        cachedSettings = parsed;
      }
      
      const l = localStorage.getItem('app_locations');
      if (l) cachedLocations = JSON.parse(l);
      
      const idx = localStorage.getItem('app_active_index');
      if (idx) cachedIndex = parseInt(idx);
    } catch (e) {
      console.warn('Failed to parse cached weather data', e);
    }
    
    // Load state from LocationState cache
    const hasSaved = LocationState.load();
    let currentLoc: Location | null = null;
    if (hasSaved && LocationState.lat !== null && LocationState.lon !== null && LocationState.cityName && LocationState.cityName !== "Current Location") {
      currentLoc = {
        id: 0,
        name: LocationState.cityName,
        latitude: LocationState.lat,
        longitude: LocationState.lon,
        country: "Nearby",
        timezone: "auto",
        isCurrentLocation: true,
        isGeolocated: true,
        icon: "📍"
      };
    }

    let initialLocations: Location[] = (cachedLocations || []).filter((loc: Location) => !loc.isCurrentLocation);
    if (currentLoc) {
      initialLocations.unshift(currentLoc);
    }

    // Do not add any default city - let the user decide.

    const initialIndex = cachedIndex !== null ? Math.max(0, Math.min(cachedIndex, initialLocations.length - 1)) : 0;
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
      loading: initialLocations.length > 0 && !initialWeatherData[initialIndex],
      error: null,
      showSettings: false,
      settings: cachedSettings || INITIAL_SETTINGS
    };
  });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const refreshAQIForIndex = async (index: number) => {
    const locations = stateRef.current.locations;
    const city = locations[index];
    if (!city) return;

    const cityKey = getCityKey(city);

    // Prioritize rendering cached AQI data immediately if available
    const cachedAqi = getAQIFromCacheOrLive(cityKey);
    if (cachedAqi) {
      console.log(`Pristine cache hit for AQI in ${city.name} — rendering immediately`);
      setState(prev => {
        if (prev.locations.length <= index || prev.locations[index]?.name !== city.name) {
          return prev;
        }
        const currentWeatherData = prev.weatherData[index];
        if (!currentWeatherData) {
          return prev;
        }
        // Save rendering frames if they are identical
        if (currentWeatherData.airQuality?.usAqi === cachedAqi.usAqi) {
          return prev;
        }
        return {
          ...prev,
          weatherData: {
            ...prev.weatherData,
            [index]: {
              ...currentWeatherData,
              airQuality: cachedAqi
            }
          }
        };
      });
    }

    console.log("Fetching AQI for:", city.name);

    try {
      const parsedAQI = await getAQIDataWithFallback(city.latitude, city.longitude, city.name, city.country);
      if (!parsedAQI) {
        console.warn("AQI fetch returned null for:", city.name);
        return;
      }

      const ageHours = getDataAgeHours(parsedAQI.lastUpdated);
      console.log(`AQI age for ${city.name}:`, ageHours.toFixed(1), "hours");

      // Update timestamp
      lastAQIFetch[cityKey] = Date.now();

      // Update React State
      setState(prev => {
        if (prev.locations.length <= index || prev.locations[index]?.name !== city.name) {
          return prev;
        }
        const currentWeatherData = prev.weatherData[index];
        if (!currentWeatherData) {
          return prev;
        }
        const updatedWeatherData = {
          ...currentWeatherData,
          airQuality: parsedAQI,
        };
        // Persist the updated AQI data in localStorage cache
        try {
          saveWeatherData(cityKey, updatedWeatherData);
        } catch (e) {
          console.warn("Failed to persist updated AQI in localStorage", e);
        }
        return {
          ...prev,
          weatherData: {
            ...prev.weatherData,
            [index]: updatedWeatherData
          }
        };
      });

      console.log("AQI refreshed:", {
        city: city.name,
        aqi: parsedAQI.usAqi,
        updated: parsedAQI.lastUpdated
      });
    } catch (err) {
      console.warn("Independent AQI background refresh failed:", err);
    }
  };

  // Start independent AQI background refresh system on load (every 30 minutes)
  useEffect(() => {
    const startAQIRefresh = () => {
      if (aqiRefreshInterval) {
        clearInterval(aqiRefreshInterval);
      }

      aqiRefreshInterval = setInterval(async () => {
        console.log("AQI background refresh firing...");
        const activeIdx = stateRef.current.activeLocationIndex;
        await refreshAQIForIndex(activeIdx);
      }, 30 * 60 * 1000);

      console.log("AQI background refresh started — every 30 min");
    };

    const stopAQIRefresh = () => {
      if (aqiRefreshInterval) {
        clearInterval(aqiRefreshInterval);
        aqiRefreshInterval = null;
        console.log("AQI background refresh stopped");
      }
    };

    startAQIRefresh();

    const onVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        const locations = stateRef.current.locations;
        const activeIndex = stateRef.current.activeLocationIndex;
        const city = locations[activeIndex];
        if (!city) return;

        const cityKey = getCityKey(city);
        const lastFetch = lastAQIFetch[cityKey] || 0;
        const age = Date.now() - lastFetch;

        if (age > 30 * 60 * 1000) {
          console.log("AQI stale on return — refreshing");
          await refreshAQIForIndex(activeIndex);
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopAQIRefresh();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // ALSO REFRESH AQI ON CITY SWITCH (if older than 30 min OR never fetched)
  useEffect(() => {
    const index = state.activeLocationIndex;
    const city = state.locations[index];
    if (!city) return;

    const cityKey = getCityKey(city);
    
    if (!lastAQIFetch[cityKey]) {
      const activeWeather = state.weatherData[index];
      if (activeWeather?.fetchedAt) {
        const age = Date.now() - activeWeather.fetchedAt;
        if (age < 30 * 60 * 1000) {
          lastAQIFetch[cityKey] = activeWeather.fetchedAt;
        }
      }
    }

    const lastFetch = lastAQIFetch[cityKey] || 0;
    const age = Date.now() - lastFetch;

    if (age > 30 * 60 * 1000 || !lastAQIFetch[cityKey]) {
      console.log(`AQI stale or missing for switched city: ${city.name} — fetching now`);
      refreshAQIForIndex(index);
    }
  }, [state.activeLocationIndex, state.locations, state.weatherData]);

  // Silent background weather update on city change if cache is older than 10 mins
  useEffect(() => {
    const index = state.activeLocationIndex;
    const city = state.locations[index];
    if (!city) return;

    const runSilentWeatherActiveSync = async () => {
      const cityKey = getCityKey(city);
      const cached = getCachedWeatherData(cityKey);
      
      let isStale = true;
      if (cached) {
        const cacheAge = Date.now() - cached.ts;
        isStale = cacheAge > 10 * 60 * 1000;
      }

      if (isStale && navigator.onLine) {
        console.log(`Silent background weather sync triggered for active city: ${city.name}`);
        try {
          const data = await fetchWeather(city.latitude, city.longitude, city.timezone, city.name, city.country);
          saveWeatherData(cityKey, data);
          setState(prev => {
            if (prev.activeLocationIndex === index && prev.locations[index]?.name === city.name) {
              return {
                ...prev,
                weatherData: { ...prev.weatherData, [index]: data }
              };
            }
            return prev;
          });
        } catch (e) {
          console.warn(`Active city silent sync failed for ${city.name}:`, e);
        }
      }
    };

    runSilentWeatherActiveSync();
  }, [state.activeLocationIndex]);

  // Step 5: Switch-to-city pausing handler to ensure no CPU waste and silky-smooth transitions
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Pause all cards & atmosphere immediately when transitioning index changes
    document.querySelectorAll(".city-card, .atmosphere").forEach(card => {
      pauseAnimationsOnCard(card as HTMLElement);
    });

    // Resume animations on ONLY the active elements after DOM updates are processed
    const frameId = requestAnimationFrame(() => {
      const activeCard = document.querySelector("#swipe-layer") as HTMLElement;
      if (activeCard) {
        resumeAnimationsOnCard(activeCard);
      }
      const atmosphere = document.querySelector(".atmosphere") as HTMLElement;
      if (atmosphere) {
        resumeAnimationsOnCard(atmosphere);
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [state.activeLocationIndex]);

  const showRefreshSpinner = () => {
    const el = document.getElementById("refresh-indicator");
    if (el) el.style.display = "block";
  };

  const hideRefreshSpinner = () => {
    const el = document.getElementById("refresh-indicator");
    if (el) el.style.display = "none";
  };

  const showLocationLoading = () => {
    const el = document.getElementById("location-loading-card");
    if (el) el.style.display = "block";
  };

  const hideLocationLoading = () => {
    const el = document.getElementById("location-loading-card");
    if (el) el.style.display = "none";
  };

  const refreshWeather = async () => {
    showRefreshSpinner();
    try {
      const locations = stateRef.current.locations;
      await loadWeatherBatch(locations);
      localStorage.setItem("last_refresh", Date.now().toString());
    } catch (e) {
      console.warn("Auto refresh failed:", e);
    } finally {
      hideRefreshSpinner();
    }
  };

  const locationRefreshIntervalRef = useRef<any>(null);

  const showLocationIndicator = (stateStr: "getting" | "updated") => {
    if (stateStr === "getting") {
      showLocationLoading();
    }
  };

  const hideLocationIndicator = () => {
    hideLocationLoading();
  };

  const showMinimalIndicator = (text: string) => {
    const bar = document.getElementById("location-status-bar");
    const spinner = document.getElementById("location-status-spinner");
    const label = document.getElementById("location-status-text");

    if (!bar || !label) return;

    label.textContent = text;

    if (text === "GETTING LOCATION") {
      if (spinner) spinner.style.display = "block";
      label.style.color = "#94a3b8";
      bar.style.background = "#1e293b";
    } else if (text === "LOCATION UPDATED") {
      if (spinner) spinner.style.display = "none";
      label.style.color = "#4ade80";
      bar.style.background = "#14532d40";
    }

    bar.style.height = "28px";
    const overlay = document.getElementById("ui-overlay");
    if (overlay) overlay.style.paddingTop = "36px";
  };

  const hideMinimalIndicator = () => {
    const bar = document.getElementById("location-status-bar");
    if (bar) bar.style.height = "0";
    const overlay = document.getElementById("ui-overlay");
    if (overlay) overlay.style.paddingTop = "";
  };

  const showPermissionDeniedNotice = () => {
    // No-op: Removed floating toast from the main screen as requested
    // Instead, this sits elegantly below the search bar when geolocation access is disabled.
  };

  const checkLocationPermission = async () => {
    try {
      if (navigator.permissions) {
        const result = await navigator.permissions.query({ name: "geolocation" as PermissionName });
        LocationState.permissionState = result.state;

        // Watch for permission changes
        result.onchange = () => {
          LocationState.permissionState = result.state;
          handlePermissionChange(result.state);
        };

        return result.state; // "granted"|"denied"|"prompt"
      }
    } catch (e) {
      console.warn("Permissions API unavailable");
    }

    // Fallback — assume prompt if API not available
    return "prompt";
  };

  const handlePermissionChange = (stateStr: string) => {
    if (stateStr === "denied") {
      // Permission revoked — stop everything
      stopLocationRefresh();
      removeCurrentLocationPage();
      showPermissionDeniedNotice();
    } else if (stateStr === "granted") {
      // Permission granted — start fetching
      startLocationSystem();
    }
  };

  const hasLocationChanged = (newLat: number, newLon: number) => {
    if (LocationState.lat === null || LocationState.lon === null) 
      return true;

    // Calculate distance (roughly ~1km threshold)
    const dx = newLat - LocationState.lat;
    const dy = newLon - LocationState.lon;
    const dist = Math.sqrt(dx * dx + dy * dy);

    return dist > 0.01; // ~1km
  };

  const addCurrentLocationPage = async (cityName: string, lat: number, lon: number) => {
    const newLocation: Location = {
      id: 0,
      name: cityName,
      latitude: lat,
      longitude: lon,
      timezone: "auto",
      country: "Nearby",
      isCurrentLocation: true,
      isGeolocated: true,
      icon: "📍"
    };

    setState(prev => {
      const filtered = prev.locations.filter(loc => !loc.isCurrentLocation);
      const newLocations = [newLocation, ...filtered];
      return {
        ...prev,
        locations: newLocations,
        activeLocationIndex: 0,
        loading: true
      };
    });

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const data = await fetchWeather(lat, lon, timezone, cityName, "Nearby");
      saveWeatherData(getCityKey(newLocation), data);
      setState(prev => {
        const newWeatherData = { ...prev.weatherData };
        // Shift existing weather data maps to right by 1
        const keys = Object.keys(newWeatherData).map(Number).sort((a,b) => b - a);
        keys.forEach(k => {
          newWeatherData[k+1] = newWeatherData[k];
        });
        newWeatherData[0] = data;

        return {
          ...prev,
          weatherData: newWeatherData,
          loading: false,
          error: null
        };
      });
    } catch (err) {
      console.warn("fetchWeather failed when adding current location page:", err);
      setState(prev => ({ ...prev, loading: false }));
    }

    hideLocationIndicator();
    console.log("Current location page added:", cityName);
  };

  const addCurrentLocationPageFromCache = () => {
    if (!LocationState.hasLocation || LocationState.lat === null || LocationState.lon === null) return;
    const cachedLoc: Location = {
      id: 0,
      name: LocationState.cityName || "Current Location",
      latitude: LocationState.lat,
      longitude: LocationState.lon,
      timezone: "auto",
      country: "Nearby",
      isCurrentLocation: true,
      isGeolocated: true,
      icon: "📍"
    };

    setState(prev => {
      const filtered = prev.locations.filter(loc => !loc.isCurrentLocation);
      const newLocations = [cachedLoc, ...filtered];
      return {
        ...prev,
        locations: newLocations
      };
    });
  };

  const replaceCurrentLocationPage = async (cityName: string, lat: number, lon: number) => {
    const updatedLocation: Location = {
      id: 0,
      name: cityName,
      latitude: lat,
      longitude: lon,
      timezone: "auto",
      country: "Nearby",
      isCurrentLocation: true,
      isGeolocated: true,
      icon: "📍"
    };

    setState(prev => {
      const newLocs = [...prev.locations];
      if (newLocs[0]?.isCurrentLocation) {
        newLocs[0] = updatedLocation;
      } else {
        newLocs.unshift(updatedLocation);
      }
      return {
        ...prev,
        locations: newLocs
      };
    });

    if (stateRef.current.activeLocationIndex === 0) {
      try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const data = await fetchWeather(lat, lon, timezone, cityName, "Nearby");
        saveWeatherData(getCityKey(updatedLocation), data);
        setState(prev => ({
          ...prev,
          weatherData: { ...prev.weatherData, [0]: data }
        }));
      } catch (err) {
        console.warn("fetchWeather failed when replacing current location page:", err);
      }
    }
    console.log("Current location replaced:", cityName);
  };

  const removeCurrentLocationPage = () => {
    if (stateRef.current.locations.length > 0 && stateRef.current.locations[0].isCurrentLocation) {
      setState(prev => {
        const newLocations = prev.locations.filter(loc => !loc.isCurrentLocation);
        
        // Do not add any default city - let the user decide.

        const newIndex = Math.max(0, prev.activeLocationIndex - 1);
        
        // Clean and shift weather data map
        const newWeatherData: Record<number, WeatherData> = {};
        newLocations.forEach((_, i) => {
          if (prev.weatherData[i + 1]) {
            newWeatherData[i] = prev.weatherData[i + 1];
          }
        });

        return {
          ...prev,
          locations: newLocations,
          activeLocationIndex: newIndex,
          weatherData: newWeatherData
        };
      });

      LocationState.clear();
      console.log("Current location page removed");
    }
  };

  const fetchCurrentLocation = async (isBackground = false) => {
    // STEP 1 — Check support
    if (!navigator.geolocation) {
      console.warn("Geolocation not supported by device");
      return null;
    }

    // STEP 2 — Show loading indicator
    if (!isBackground) {
      showLocationIndicator("getting");
    } else {
      showMinimalIndicator("GETTING LOCATION");
    }

    LocationState.isLoading = true;

    // STEP 3 — Get coordinates
    return new Promise<{ lat: number; lon: number; cityName: string } | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;

          // Check if location actually changed
          const moved = hasLocationChanged(latitude, longitude);

          // STEP 4 — Reverse geocode to city name
          const resolved = await reverseGeocode(latitude, longitude);
          
          if (resolved && resolved.name && resolved.name !== "Current Location") {
            const cityName = resolved.name;

            if (!moved && LocationState.hasLocation && LocationState.cityName === cityName) {
              // Same location — quiet update
              hideLocationIndicator();
              hideMinimalIndicator();
              LocationState.isLoading = false;
              resolve(null);
              return;
            }

            // STEP 5 — Update state
            const wasFirstTime = !LocationState.hasLocation;
            LocationState.hasLocation = true;
            LocationState.lat         = latitude;
            LocationState.lon         = longitude;
            LocationState.cityName    = cityName;
            LocationState.lastUpdated = Date.now();
            LocationState.save();
            LocationState.isLoading   = false;

            // STEP 6 — Update UI
            if (wasFirstTime) {
              await addCurrentLocationPage(cityName, latitude, longitude);
            } else {
              await replaceCurrentLocationPage(cityName, latitude, longitude);
              showMinimalIndicator("LOCATION UPDATED");
              setTimeout(hideMinimalIndicator, 2500);
            }

            resolve({ 
              lat: latitude, 
              lon: longitude, 
              cityName 
            });
          } else {
            // Unsuccessful city detection! The page won't be visible.
            console.warn("Could not detect nearest city name for coordinates:", latitude, longitude);
            LocationState.isLoading = false;
            hideLocationIndicator();
            hideMinimalIndicator();
            
            // Remove previous current location page if it was there
            removeCurrentLocationPage();
            
            resolve(null);
          }
        },
        (err) => {
          LocationState.isLoading = false;
          hideLocationIndicator();
          hideMinimalIndicator();

          if (err.code === 1) {
            // Permission denied by user
            stopLocationRefresh();
            removeCurrentLocationPage();
            showPermissionDeniedNotice();
          } else {
            console.warn("Location error:", err.message);
          }
          resolve(null);
        },
        {
          enableHighAccuracy: false,
          timeout: 8000,
          maximumAge: 300000
        }
      );
    });
  };

  const startLocationRefresh = () => {
    // Clear any existing interval
    stopLocationRefresh();

    // Refresh every 10 minutes
    locationRefreshIntervalRef.current = setInterval(async () => {
      if (LocationState.hasLocation) {
        console.log("Background location refresh...");
        await fetchCurrentLocation(true);
      }
    }, 10 * 60 * 1000);

    console.log("Location refresh started");
  };

  const stopLocationRefresh = () => {
    if (locationRefreshIntervalRef.current) {
      clearInterval(locationRefreshIntervalRef.current);
      locationRefreshIntervalRef.current = null;
      console.log("Location refresh stopped");
    }
  };

  const startLocationSystem = async () => {
    // Restore previous location from cache
    const hasSaved = LocationState.load();

    if (hasSaved && LocationState.cityName && LocationState.cityName !== "Current Location") {
      // Show saved location page instantly since we successfully geocoded it before
      addCurrentLocationPageFromCache();

      // Then silently check for location change
      setTimeout(async () => {
        await fetchCurrentLocation(true);
      }, 2000);

      // Start 10 min refresh
      startLocationRefresh();

    } else {
      // By default, turn it on! Request the location on startup.
      await fetchCurrentLocation(false);
      if (LocationState.hasLocation) {
        startLocationRefresh();
      }
    }
  };

  useEffect(() => {
    startLocationSystem();

    return () => {
      stopLocationRefresh();
    };
  }, []);

  useEffect(() => {
    const initialRefresh = async () => {
      const locations = stateRef.current.locations;
      const initialIndex = stateRef.current.activeLocationIndex;
      const activeHasCache = !!stateRef.current.weatherData[initialIndex];

      if (activeHasCache) {
        // Cached data is available! Refresh in the background
        setIsRefreshing(true);
        if (locations.length > 0) {
          try {
            await loadWeatherBatch(locations, 0, true);
          } catch (e) {
            console.warn("Initial active weather refresh failed:", e);
          }
        }
        setIsRefreshing(false);
      } else {
        // No cache available! Show blocking skeleton
        setState(prev => ({ ...prev, loading: true }));
        showCitySkeleton();
        if (locations.length > 0) {
          try {
            await loadWeatherBatch(locations, 0, true);
          } catch (e) {
            console.warn("Initial active weather refresh failed:", e);
          }
        }
        setState(prev => ({ ...prev, loading: false }));
        hideCitySkeleton();
      }
    };

    initialRefresh();

    // 2. Continuous background refresh every 5 minutes
    const intervalId = setInterval(async () => {
      if (!navigator.onLine) return;
      console.log("Background weather refresh firing...");
      const locations = stateRef.current.locations;
      if (locations.length > 0) {
        try {
          // Silent background refresh (no loader since forceRefresh is false)
          await loadWeatherBatch(locations, 0, false);
        } catch (e) {
          console.warn("Background weather refresh failed:", e);
        }
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (LocationState.hasLocation) {
          const age = Date.now() - (LocationState.lastUpdated || 0);
          // If older than 5 minutes — check location
          if (age > 5 * 60 * 1000) {
            fetchCurrentLocation(true);
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
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
  const [isSwiping, setIsSwiping] = useState(false);
  const [isSwipeCommitted, setIsSwipeCommitted] = useState(false);
  const [locationPermissionError, setLocationPermissionError] = useState<boolean>(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showCityManager, setShowCityManager] = useState(false);
  const [showRadarMap, setShowRadarMap] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  
  const mainRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);

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

    // STEP 1 — Kill animations immediately
    disableAllAnimations();

    const cityKey = getCityKey(location);
    const cacheResult = getCachedWeatherData(cityKey);

    if (cacheResult && !forceRefresh) {
      const { data: cachedData, ts } = cacheResult;
      
      // Update state with cached data instantly.
      setState(prev => ({
        ...prev,
        weatherData: { ...prev.weatherData, [index]: cachedData },
        loading: false,
        error: null
      }));

      // Hide skeleton and restore animations instantly
      hideCitySkeleton();
      enableAllAnimations();

      // Fetch fresh silently in the background if the cache is older than 10 minutes
      const cacheAge = Date.now() - ts;
      const isStale = cacheAge > 10 * 60 * 1000;
      
      if (!navigator.onLine || !isStale) return;
    } else if (!cacheResult) {
      // No cache — show skeleton instantly
      showCitySkeleton();
      setState(prev => ({ ...prev, loading: true }));
    }

    try {
      const data = await fetchWeather(location.latitude, location.longitude, location.timezone, location.name, location.country);
      saveWeatherData(cityKey, data);
      
      // Check weather alerts with OneSignal on every refresh/fetch
      checkWeatherAlerts(data, location.name);
      
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

      // Render fresh data, hide skeleton, and enable animations smoothly
      hideCitySkeleton();
      enableAllAnimations();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`Weather fetch failed for ${location?.name || 'Unknown'}:`, errorMsg);
      
      let message = 'Weather service unavailable';
      if (err instanceof Error) {
        message = err.message;
        if (message.toLowerCase().includes('failed to fetch') || message.toLowerCase().includes('fetch')) {
          message = 'Could not connect to the weather server. You might be offline, using an ad-blocker, or the service is temporarily restricted in your region.';
        }
        if (message === 'Script error.') {
          message = 'A connection error occurred. Please check your internet and try again.';
        }
      }

      // If we already have cache but fetch failed (likely offline/timeout), keep the cache
      if (state.weatherData[index] || cacheResult) {
        setState(prev => ({ ...prev, loading: false }));
        hideCitySkeleton();
        enableAllAnimations();
        return;
      }

      setState(prev => ({
        ...prev,
        loading: false,
        error: prev.activeLocationIndex === index ? message : prev.error,
      }));

      hideCitySkeleton();
      enableAllAnimations();
    }
  };

  const isNightHour = (now: number | Date, sunriseISO?: string, sunsetISO?: string): boolean => {
    if (!sunriseISO || !sunsetISO) {
      const hr = new Date(now).getHours();
      return hr < 6 || hr >= 19;
    }
    try {
      const nowTime = new Date(now).getTime();
      const riseTime = new Date(sunriseISO).getTime();
      const setTime = new Date(sunsetISO).getTime();
      return nowTime < riseTime || nowTime > setTime;
    } catch {
      const hr = new Date(now).getHours();
      return hr < 6 || hr >= 19;
    }
  };

  const applyWeatherGradient = (weatherCode: number, isNight: boolean) => {
    console.log("Weather gradient applied for:", weatherCode, "isNight:", isNight);
  };

  const restartWeatherAnimations = (weatherCode: number, isNight: boolean) => {
    // Find all weather effect elements
    const effects = document.querySelectorAll(
      "[class*='rain'], [class*='snow'], " +
      "[class*='cloud'], [class*='lightning'], " +
      "[class*='particle'], [class*='atmosphere'], " +
      "[class*='weather-fx'], [class*='fog']"
    );

    effects.forEach(el => {
      // Reset animation by removing and re-adding
      (el as HTMLElement).style.animationPlayState = "paused";
      void (el as HTMLElement).offsetWidth; // force reflow
      (el as HTMLElement).style.animationPlayState = "running";
      (el as HTMLElement).style.willChange = "transform, opacity";
    });

    console.log("Weather animations restarted for:");
  };

  const silentRefreshCity = async (city: Location, index: number) => {
    if (!navigator.onLine) return;
    try {
      const fresh = await fetchWeather(city.latitude, city.longitude, city.timezone, city.name, city.country);
      const cityKey = getCityKey(city);
      saveWeatherData(cityKey, fresh);
      setState(prev => {
        if (prev.activeLocationIndex === index && prev.locations[index]?.name === city.name) {
          return {
            ...prev,
            weatherData: { ...prev.weatherData, [index]: fresh }
          };
        }
        return prev;
      });
    } catch (e) {
      console.warn("Silent refresh failed:", e);
    }
  };

  const switchToCity = async (newIndex: number) => {
    if (newIndex === state.activeLocationIndex) return;

    // Direct performance gain: pause heavy animations during visual transition slide
    killAnimations();

    const city = state.locations[newIndex];
    if (!city) return;

    // Load Cache
    const cityKey = getCityKey(city);
    const cached = getCachedWeatherData(cityKey);

    if (cached?.data) {
      // Sync React state directly and instantly - No manual DOM hacks or timers!
      setState(prev => ({
        ...prev,
        activeLocationIndex: newIndex,
        weatherData: { ...prev.weatherData, [newIndex]: cached.data },
        loading: false,
        error: null
      }));

      // Apply weather gradient smoothly based on Cache data
      const isNight = isNightHour(
        Date.now(),
        cached.data.daily?.sunrise?.[0],
        cached.data.daily?.sunset?.[0]
      );
      applyWeatherGradient(
        cached.data.current?.weatherCode || 0,
        isNight
      );
    } else {
      // No cache - show modern skeletons
      setState(prev => ({
        ...prev,
        activeLocationIndex: newIndex,
        loading: true
      }));

      try {
        const fresh = await fetchWeather(city.latitude, city.longitude, city.timezone, city.name, city.country);
        saveWeatherData(cityKey, fresh);

        setState(prev => ({
          ...prev,
          weatherData: { ...prev.weatherData, [newIndex]: fresh },
          loading: false,
          error: null
        }));

        const isNight = isNightHour(
          Date.now(),
          fresh.daily?.sunrise?.[0],
          fresh.daily?.sunset?.[0]
        );
        applyWeatherGradient(
          fresh.current?.weatherCode || 0,
          isNight
        );
      } catch (err) {
        console.warn("switchToCity fetch failed:", err);
        setState(prev => ({
          ...prev,
          loading: false,
          error: "Failed to load weather data"
        }));
      }
    }

    // ── BACKGROUND UPDATES ──────
    // Keep AQI loading asynchronous so visual transitions stay extremely responsive
    setTimeout(() => {
      refreshAQIForIndex(newIndex);
    }, 120);

    // Run silent refresh in background if cache is old (>10 mins)
    const cacheAge = cached?.ts 
      ? Date.now() - cached.ts 
      : Infinity;

    if (cacheAge > 10 * 60 * 1000) {
      setTimeout(() => {
        silentRefreshCity(city, newIndex).catch(err => {
          console.warn("silentRefreshCity failed:", err);
        });
      }, 500);
    }
  };

  const addLocation = (location: Location) => {
    // 1. Check if location already exists upfront to avoid async state issues
    const existsIndex = state.locations.findIndex(l => {
      const sameCoords = Math.abs(l.latitude - location.latitude) < 0.01 && 
                         Math.abs(l.longitude - location.longitude) < 0.01;
      const sameId = l.id !== 0 && l.id === location.id;
      const sameName = l.name.toLowerCase() === location.name.toLowerCase() && 
                       l.country === location.country &&
                       l.admin1 === location.admin1;
      
      return sameCoords || sameId || sameName;
    });

    if (existsIndex !== -1) {
      setState(prev => {
        const newWeatherData = { ...prev.weatherData };
        if (!newWeatherData[existsIndex]) {
          const cached = getCachedWeatherData(getCityKey(prev.locations[existsIndex]));
          if (cached) {
            newWeatherData[existsIndex] = cached.data;
          }
        }
        return {
          ...prev,
          activeLocationIndex: existsIndex,
          weatherData: newWeatherData,
          showSettings: false
        };
      });
      return;
    }

    // 2. Prepare new list and index
    const newIndex = state.locations.length;
    const newLocations = [...state.locations, location];

    // 3. Update state with immediate loading for the new index
    setState(prev => {
      const newWeatherData = { ...prev.weatherData };
      const cached = getCachedWeatherData(getCityKey(location));
      if (cached) {
        newWeatherData[newIndex] = cached.data;
      }
      return {
        ...prev,
        locations: newLocations,
        activeLocationIndex: newIndex,
        weatherData: newWeatherData,
        loading: !cached,
        error: null
      };
    });

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

  const loadWeatherBatch = async (locations: Location[], startIndex = 0, forceRefresh = false) => {
    if (locations.length === 0) return;

    // Load from cache first for immediate display unless forcing fresh refresh (Offline Support)
    if (!forceRefresh || !navigator.onLine) {
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
          // Check weather alerts with OneSignal on every refresh/fetch
          checkWeatherAlerts(data as WeatherData, locations[idx].name);
        });

        return {
          ...prev,
          weatherData: newWeatherData,
          loading: false,
          error: null
        };
      });
    } catch (err) {
      console.warn('Bulk weather load failed, falling back to staggered:', err);
      // If we are online but bulk fails, try staggered
      if (navigator.onLine) {
        try {
          for (let i = 0; i < locations.length; i++) {
            await loadWeather(locations[i], startIndex + i);
            // Slight delay to avoid rate limiting
            if (i < locations.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 800));
            }
          }
        } catch (staggerErr) {
          console.error('All fetch attempts failed:', staggerErr);
          setState(prev => ({
            ...prev,
            loading: false,
            error: "Unable to refresh weather data. Please check your connection or try again later."
          }));
        }
      } else {
        setState(prev => ({ ...prev, loading: false }));
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
    
    // Get the current hour index for the location
    const hourIndex = getCurrentHourIndex(w.timezone || 'UTC', w.hourly.time);
    
    console.log("Current hour index:", hourIndex);
    console.log("Current precip %:", w.hourly.precipitationProbability[hourIndex]);
    console.log("Timezone:", w.timezone);

    // 1. Rain Alerts (Checks if rain is forecast in next 12 hours matching user's custom rainThreshold)
    let hasRainForecast = false;
    let maxRainProb = 0;
    const isRainCode = (code: number) => (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
    
    for (let i = hourIndex; i < Math.min(hourIndex + 12, w.hourly.time.length); i++) {
      const code = w.hourly.weatherCode?.[i] || w.hourly.weathercode?.[i] || 0;
      const prob = w.hourly.precipitationProbability?.[i] || 0;
      if (prob >= s.rainThreshold) {
        if (isRainCode(code) || code === 0 || !w.hourly.weatherCode) {
          hasRainForecast = true;
          if (prob > maxRainProb) {
            maxRainProb = prob;
          }
        }
      }
    }
    
    if (!hasRainForecast && s.alertRain) {
      for (let i = hourIndex; i < Math.min(hourIndex + 12, w.hourly.time.length); i++) {
        const prob = w.hourly.precipitationProbability?.[i] || 0;
        const temp = w.hourly.temperature?.[i] || w.hourly.temperature_2m?.[i] || 15;
        if (prob >= s.rainThreshold && temp > 2) {
          hasRainForecast = true;
          if (prob > maxRainProb) {
            maxRainProb = prob;
          }
        }
      }
    }

    if (s.alertRain && hasRainForecast && maxRainProb >= s.rainThreshold) {
      alerts.push({
        id: 'rain-alert',
        type: 'rain',
        title: '🌧️ Rain Expected',
        message: `${maxRainProb}% chance of rain in the forecast.`
      });
    }

    // 2. Snow Alerts (Checks if snow is forecast in next 12 hours matching user's custom snowThreshold)
    let hasSnowForecast = false;
    let maxSnowProb = 0;
    const isSnowCode = (code: number) => [71, 73, 75, 77, 85, 86].includes(code);
    
    for (let i = hourIndex; i < Math.min(hourIndex + 12, w.hourly.time.length); i++) {
      const code = w.hourly.weatherCode?.[i] || w.hourly.weathercode?.[i] || 0;
      const snowfall = w.hourly.snowfall?.[i] || 0;
      const prob = w.hourly.precipitationProbability?.[i] || 0;
      
      if (isSnowCode(code) || snowfall > 0) {
        if (prob >= s.snowThreshold) {
          hasSnowForecast = true;
          if (prob > maxSnowProb) {
            maxSnowProb = prob;
          }
        }
      }
    }
    
    if (!hasSnowForecast && s.alertDaily) {
      for (let i = hourIndex; i < Math.min(hourIndex + 12, w.hourly.time.length); i++) {
        const prob = w.hourly.precipitationProbability?.[i] || 0;
        const temp = w.hourly.temperature?.[i] || w.hourly.temperature_2m?.[i] || 0;
        if (prob >= s.snowThreshold && temp <= 2 && prob > 0) {
          hasSnowForecast = true;
          if (prob > maxSnowProb) {
            maxSnowProb = prob;
          }
        }
      }
    }

    if (s.alertDaily && hasSnowForecast && maxSnowProb >= s.snowThreshold) {
      alerts.push({
        id: 'snow-alert',
        type: 'snow',
        title: '❄️ Snowfall Warning',
        message: `${maxSnowProb}% chance of snow in the forecast.`
      });
    }

    // 3. Thunderstorm check (Checks if thunderstorm is active or forecast in next 12 hours)
    let hasStormForecast = [95, 96, 99].includes(w.current.weatherCode);
    let stormCode = w.current.weatherCode;
    
    if (!hasStormForecast) {
      for (let i = hourIndex; i < Math.min(hourIndex + 12, w.hourly.time.length); i++) {
        const code = w.hourly.weatherCode?.[i] || w.hourly.weathercode?.[i] || 0;
        if ([95, 96, 99].includes(code)) {
          hasStormForecast = true;
          stormCode = code;
          break;
        }
      }
    }

    if (s.stormThreshold && hasStormForecast) {
      const isSevere = stormCode === 99 || w.current.windSpeed > 15;
      if (isSevere) {
        alerts.push({
          id: 'severe-storm-alert',
          type: 'severe_storm',
          title: '⛈️ Severe Thunderstorm',
          message: 'Intense thunderstorm with potential for heavy precip or damaging winds.'
        });
      } else {
        alerts.push({
          id: 'storm-alert',
          type: 'storm',
          title: '🌩️ Thunderstorm Warning',
          message: 'A thunderstorm is expected or active in your area.'
        });
      }
    }

    // 4. Severe weather (Checks for heavy storms/hail, wind, or extreme temperatures in next 12 hours)
    let hasSevereForecast = [82, 86].includes(w.current.weatherCode) || w.current.windSpeed > 20 || w.current.temperature > 40 || w.current.temperature < -15;
    
    if (!hasSevereForecast) {
      for (let i = hourIndex; i < Math.min(hourIndex + 12, w.hourly.time.length); i++) {
        const code = w.hourly.weatherCode?.[i] || w.hourly.weathercode?.[i] || 0;
        const temp = w.hourly.temperature?.[i] || w.hourly.temperature_2m?.[i] || 0;
        if ([82, 86].includes(code) || temp > 40 || temp < -15) {
          hasSevereForecast = true;
          break;
        }
      }
    }

    if (s.alertSevere && hasSevereForecast) {
      alerts.push({
        id: 'severe-alert',
        type: 'severe',
        title: '⚠️ Severe Weather Warning',
        message: 'Extreme precipitation or temperatures detected.'
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

  const [showExitToast, setShowExitToast] = useState(false);
  
  // Back button handling logic
  const panelStackRef = useRef<(() => void)[]>([]);
  const panelNamesRef = useRef<string[]>([]);

  useEffect(() => {
    // 1. Initialize on app start: Push an initial state so the first back press doesn't immediately exit
    if (window.history.state?.panel !== 'home') {
      window.history.pushState({ panel: "home" }, "");
    }

    // Initialize notification states and startup alert schedulers
    applyNotifToggleStates();
    if (NotifSettings.morningEnabled) {
      scheduleMorningSummary();
    }
    if (NotifSettings.nightEnabled) {
      scheduleNightSummary();
    }

    let backPressCount = 0;
    let toastTimer: any = null;

    // 2. Global popstate listener to handle back button
    const handlePopState = (e: PopStateEvent) => {
      const targetPanel = e.state?.panel || 'home';
      const currentPanel = panelNamesRef.current[panelNamesRef.current.length - 1] || 'home';

      // If already matching, don't double pop
      if (currentPanel === targetPanel) {
        return;
      }

      // If the target panel is not in our track stack and is not 'home',
      // it means this history point was already closed programmatically in the UI.
      // So we should ignore this popstate event to avoid double-dismissing or closing incorrect panels.
      if (panelNamesRef.current.indexOf(targetPanel) === -1 && targetPanel !== 'home') {
        return;
      }

      if (panelNamesRef.current.length > 0) {
        backPressCount = 0;
        setShowExitToast(false);

        // Keep popping until we match the target state or are empty
        while (panelNamesRef.current.length > 0) {
          const topName = panelNamesRef.current[panelNamesRef.current.length - 1];
          if (topName === targetPanel) {
            break;
          }

          panelNamesRef.current.pop();
          const closePanel = panelStackRef.current.pop();
          if (closePanel) {
            closePanel();
          }

          if (targetPanel === 'home' && panelNamesRef.current.length === 0) {
            break;
          }
        }
      } else {
        // Handle exit confirmation on home screen
        backPressCount++;
        
        if (backPressCount === 1) {
          setShowExitToast(true);
          window.history.pushState({ panel: "home" }, ""); // re-push so we get another popstate
          
          if (toastTimer) clearTimeout(toastTimer);
          toastTimer = setTimeout(() => { 
            backPressCount = 0; 
            setShowExitToast(false);
          }, 2000);
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (toastTimer) clearTimeout(toastTimer);
    };
  }, []);

  const pushPanel = (closeFn: () => void, name: string) => {
    window.history.pushState({ panel: name }, "");
    panelStackRef.current.push(closeFn);
    panelNamesRef.current.push(name);
  };

  const handleBack = () => {
    if (panelStackRef.current.length > 0) {
      panelNamesRef.current.pop();
      const closePanel = panelStackRef.current.pop();
      if (closePanel) {
        closePanel();
      }
      try {
        window.history.back();
      } catch (e) {
        console.warn("history.back failed:", e);
      }
    } else {
      try {
        window.history.back();
      } catch (e) {
        console.warn("history.back failed:", e);
      }
    }
  };

  const toggleSettings = () => {
    if (!state.showSettings) {
      requestAnimationFrame(() => {
        Haptic.medium(state.settings.hapticEnabled);
        setState(prev => ({ ...prev, showSettings: true }));
        pushPanel(() => setState(prev => ({ ...prev, showSettings: false })), 'settings');
      });
    } else {
      handleBack();
    }
  };

  const openSearch = () => {
    Haptic.medium(state.settings.hapticEnabled);
    setShowSearch(true);
    pushPanel(() => setShowSearch(false), 'search');
  };

  // Manual refresh logic
  const handleRefresh = async () => {
    if (isRefreshing || state.locations.length === 0) return;
    setIsRefreshing(true);
    Haptic.medium(state.settings.hapticEnabled);
    
    try {
      await refreshWeather();
      Haptic.success(state.settings.hapticEnabled);
    } catch (e) {
      console.warn("Manual refresh failed:", e);
      Haptic.warning(state.settings.hapticEnabled);
    } finally {
      setTimeout(() => setIsRefreshing(false), 800);
    }
  };

  const handleSwipe = (direction: 'left' | 'right') => {
    Haptic.light(state.settings.hapticEnabled);
    setSlideDirection(direction);
    
    const isLeft = direction === 'left';
    let nextIndex;
    if (isLeft) {
      nextIndex = (state.activeLocationIndex + 1) % state.locations.length;
    } else {
      nextIndex = (state.activeLocationIndex - 1 + state.locations.length) % state.locations.length;
    }

    switchToCity(nextIndex);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  useEffect(() => {
    const cleanup = initGestures();

    const onSwipeLeft = () => {
      if (state.showSettings || showSearch || showCityManager || showRadarMap || state.locations.length <= 1) {
        setIsSwiping(false);
        setIsSwipeCommitted(false);
        return;
      }
      setIsSwipeCommitted(true);
      handleSwipe('left');
    };

    const onSwipeRight = () => {
      if (state.showSettings || showSearch || showCityManager || showRadarMap || state.locations.length <= 1) {
        setIsSwiping(false);
        setIsSwipeCommitted(false);
        return;
      }
      setIsSwipeCommitted(true);
      handleSwipe('right');
    };

    const onSwipeStart = () => {
      if (state.showSettings || showSearch || showCityManager || showRadarMap || state.locations.length <= 1) return;
      setIsSwiping(true);
      setIsSwipeCommitted(false);

      // PART 1D — Silent background prefetch of adjacent cities
      const activeIdx = state.activeLocationIndex;
      const len = state.locations.length;
      const nextIdx = (activeIdx + 1) % len;
      const prevIdx = (activeIdx - 1 + len) % len;

      const nextCity = state.locations[nextIdx];
      const prevCity = state.locations[prevIdx];

      // Instant pre-hydrate adjacent cities from cache into state
      setState(prev => {
        const newWeatherData = { ...prev.weatherData };
        let updated = false;

        [nextIdx, prevIdx].forEach(idx => {
          if (!newWeatherData[idx]) {
            const loc = prev.locations[idx];
            if (loc) {
              const cached = getCachedWeatherData(getCityKey(loc));
              if (cached) {
                newWeatherData[idx] = cached.data;
                updated = true;
              }
            }
          }
        });

        if (updated) {
          return { ...prev, weatherData: newWeatherData };
        }
        return prev;
      });

      if (nextCity) {
        const cached = getCachedWeatherData(getCityKey(nextCity));
        const cacheAge = cached ? Date.now() - cached.ts : Infinity;
        if (!cached || cacheAge > 10 * 60 * 1000) {
          loadWeather(nextCity, nextIdx);
        }
      }
      if (prevCity) {
        const cached = getCachedWeatherData(getCityKey(prevCity));
        const cacheAge = cached ? Date.now() - cached.ts : Infinity;
        if (!cached || cacheAge > 10 * 60 * 1000) {
          loadWeather(prevCity, prevIdx);
        }
      }
    };

    const onSwipeCancel = () => {
      setIsSwiping(false);
      setIsSwipeCommitted(false);
    };

    const onScrollStart = () => {
      // If a scroll starts, ensure we aren't stuck in a swipe state
      setIsSwiping(false);
      setIsSwipeCommitted(false);
    };

    const onPullRefresh = () => {
      handleRefresh();
    };

    window.addEventListener('swipe-left', onSwipeLeft);
    window.addEventListener('swipe-right', onSwipeRight);
    window.addEventListener('swipe-start', onSwipeStart);
    window.addEventListener('swipe-cancel', onSwipeCancel);
    window.addEventListener('pull-refresh', onPullRefresh);
    window.addEventListener('scroll', onScrollStart, { passive: true });

    return () => {
      cleanup();
      window.removeEventListener('swipe-left', onSwipeLeft);
      window.removeEventListener('swipe-right', onSwipeRight);
      window.removeEventListener('swipe-start', onSwipeStart);
      window.removeEventListener('swipe-cancel', onSwipeCancel);
      window.removeEventListener('pull-refresh', onPullRefresh);
      window.removeEventListener('scroll', onScrollStart);
    };
  }, [state.locations.length, state.activeLocationIndex]);

  const weatherContent = React.useMemo(() => {
    if (!activeWeather || !activeLocation) return null;
    
    // Dynamic offsets for slide animation
    const xOffset = slideDirection === 'left' ? 80 : -80;

    return (
      <motion.div
        id="swipe-layer"
        key={`${activeLocation.id}-${activeLocation.name}`}
        initial={{ opacity: 0, x: slideDirection ? xOffset : 0 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: slideDirection ? -xOffset : 0 }}
        onAnimationComplete={() => {
          setIsSwiping(false);
          setIsSwipeCommitted(false);
          enableAnimations();
        }}
        transition={{ 
          type: "spring",
          damping: 26,
          stiffness: 170,
          mass: 0.6
        }}
        className="city-card flex flex-col gap-4 gpu weather-content"
      >
        <div id="city-content" className="city-content flex flex-col gap-4">
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

          <div className="h-24" />
        </div>
      </motion.div>
    );
  }, [activeWeather, activeLocation, state.settings, isRefreshing, slideDirection]);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // If user is scrolling the hourly forecast horizontally, keep header visible
      const isHourlyActive = (window as any).isScrollingHourly || (window as any).isInteractingWithHourly;
      if (isHourlyActive) {
        setHeaderVisible(true);
        lastScrollY.current = currentScrollY;
        return;
      }
      
      // Show ONLY at the very top as requested
      if (currentScrollY < 10) {
        setHeaderVisible(true);
      } 
      // Hide once vertical scroll is significant (increased threshold to 150px to reduce sensitivity)
      else if (currentScrollY > 150) {
        setHeaderVisible(false);
      }
      
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Ensure header visible on mount
    setHeaderVisible(true);
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div 
      className="min-h-screen bg-black text-app-text font-sans selection:bg-app-text/20 transition-colors duration-500 relative"
    >
      <div id="ui-overlay" className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] z-[100] pointer-events-none pt-[env(safe-area-inset-top)]">
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>
        
        <div id="location-status-bar" style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 0,
          overflow: "hidden",
          background: "#1e293b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          zIndex: 9999,
          transition: "height 0.3s ease",
          fontSize: "11px",
          letterSpacing: "1.5px",
          fontWeight: 600,
          textTransform: "uppercase"
        }}>
          <div id="location-status-spinner" style={{
            width: "12px",
            height: "12px",
            border: "1.5px solid #ffffff30",
            borderTop: "1.5px solid #6366f1",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            display: "none"
          }}></div>
          <span id="location-status-text" style={{ color: "#94a3b8" }}></span>
        </div>

        {state.locations.length > 0 && (
          <motion.div 
            className="w-full h-32 relative"
            initial={false}
            animate={{
              y: (headerVisible && !isSwiping) ? 0 : -120,
              opacity: (headerVisible && !isSwiping) ? 1 : 0,
              pointerEvents: (headerVisible && !isSwiping) ? 'auto' : 'none' as any,
            }}
            transition={{ 
              duration: 0.12, 
              ease: [0.25, 0.46, 0.45, 0.94],
              opacity: { duration: (isSwiping || isSwipeCommitted) ? 0 : 0.12 } // Instant hide during swipe
            }}
          >
            <motion.div className="absolute left-6 top-8 pointer-events-auto">
              <motion.button 
                id="radar-map-btn"
                onClick={() => {
                  Haptic.medium(state.settings.hapticEnabled);
                  setShowRadarMap(true);
                  pushPanel(() => setShowRadarMap(false), 'radarmap');
                }}
                className="w-12 h-12 bg-white/10 border border-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-app-text shadow-xl active:scale-95 transition-all"
                initial={false}
                animate={{
                  opacity: state.showSettings || showCityManager || showRadarMap || isSwiping || isSwipeCommitted ? 0 : 1,
                  pointerEvents: state.showSettings || showCityManager || showRadarMap || isSwiping || isSwipeCommitted ? 'none' : 'auto',
                  scale: state.showSettings || showCityManager || showRadarMap ? 0.8 : 1,
                }}
                transition={{ 
                  duration: (isSwiping || isSwipeCommitted) ? 0 : 0.12 
                }}
              >
                <Icons.Map className="w-5 h-5 text-app-text-dim hover:text-app-text transition-colors" />
              </motion.button>
            </motion.div>

            {/* Settings Button - Top Right */}
            <motion.div className="absolute right-6 top-8 pointer-events-auto">
              <motion.button 
                id="settings-btn"
                onClick={toggleSettings}
                className={`group active:scale-95 transition-all flex items-center justify-center ${
                  state.showSettings ? 'h-12 px-1' : 'w-12 h-12'
                }`}
                animate={{
                  opacity: state.showSettings || showCityManager || showRadarMap || isSwiping || isSwipeCommitted ? 0 : 1,
                  pointerEvents: state.showSettings || showCityManager || showRadarMap || isSwiping || isSwipeCommitted ? 'none' : 'auto',
                  scale: state.showSettings || showCityManager || showRadarMap ? 0.8 : 1,
                }}
                transition={{ duration: (isSwiping || isSwipeCommitted) ? 0 : 0.12 }}
              >
                <AnimatePresence mode="wait">
                  {state.showSettings ? (
                    <motion.div
                      key="back"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="flex items-center text-app-text gap-1 pr-1"
                    >
                      <Icons.ChevronLeft className="w-6 h-6" strokeWidth={2.5} />
                      <span className="font-bold text-[14px]">BACK</span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="settings"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="w-12 h-12 bg-white/10 border border-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-app-text-dim group-hover:text-app-text transition-colors shadow-xl"
                    >
                      <Icons.Settings2 className="w-5 h-5" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            </motion.div>



            {/* City Name & Pagination - Center */}
            <div className="absolute top-8 flex flex-col items-center pointer-events-none mt-2" style={{ left: '50%', transform: 'translateX(-50%)' }}>
              {state.locations.length > 0 && (
                <motion.div 
                  key="city-header-persistent"
                  initial={{ opacity: 0 }}
                  animate={{ 
                    opacity: state.showSettings || showCityManager || showRadarMap || isSwiping || isSwipeCommitted ? 0 : 1,
                  }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col items-center justify-center"
                >
                  <div className="flex items-center justify-center relative pointer-events-auto select-none gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span id="city-name" className="text-[17px] font-semibold text-white/95">{activeLocation?.name || 'Loading...'}</span>
                      {activeLocation?.isCurrentLocation && <span id="location-pin-icon" className="text-[14px]">📍</span>}
                    </div>
                    <div className="absolute left-full ml-1.5 flex items-center justify-center">
                      <button 
                        onClick={() => {
                          Haptic.medium(state.settings.hapticEnabled);
                          setShowCityManager(true);
                          pushPanel(() => setShowCityManager(false), 'citymanager');
                        }}
                        className="text-white/60 hover:text-white active:scale-90 transition-all duration-150 cursor-pointer focus:outline-none flex items-center justify-center p-1"
                        title="Edit Cities"
                      >
                        <Icons.Pencil className="w-3.5 h-3.5" strokeWidth={2.2} />
                      </button>
                    </div>
                  </div>
                    
                    {isOffline && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-1 px-2.5 py-0.5 rounded-full mt-1 bg-white/10 border border-white/20 backdrop-blur-md"
                      >
                        <Icons.CloudOff className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
                        <span className="text-[9px] font-bold text-white uppercase tracking-widest">OFFLINE</span>
                      </motion.div>
                    )}

                    {isRefreshing && !isOffline && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-1 px-2.5 py-0.5 rounded-full mt-1 bg-white/10 border border-white/20 backdrop-blur-md"
                      >
                        <Icons.RotateCcw className="w-2.5 h-2.5 text-white animate-spin" strokeWidth={2.5} />
                        <span className="text-[9px] font-bold text-white uppercase tracking-widest">Refreshing...</span>
                      </motion.div>
                    )}

                    <div id="city-dots" className="flex gap-1.5 mt-1.5">
                      {state.locations.map((_, i) => (
                        <button 
                          key={i} 
                          onClick={() => {
                            if (state.activeLocationIndex !== i) {
                              Haptic.light(state.settings.hapticEnabled);
                              switchToCity(i);
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
                )}
            </div>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {state.showSettings && (
          <SettingsScreen 
            settings={state.settings} 
            onUpdate={updateSettings} 
            onClose={toggleSettings} 
            activeWeather={activeWeather}
            activeLocation={activeLocation}
            panelStackRef={panelStackRef}
            handleBack={handleBack}
            pushPanel={pushPanel}
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
              panelStackRef={panelStackRef}
              onSelect={(index) => {
                Haptic.light(state.settings.hapticEnabled);
                switchToCity(index);
                handleBack();
              }}
              onAdd={() => {
                Haptic.medium(state.settings.hapticEnabled);
                // First close city manager
                handleBack();
                // Then open search (with a small delay for animation)
                setTimeout(() => {
                  setShowSearch(true);
                  pushPanel(() => setShowSearch(false), 'search');
                }, 300);
              }}
              onRemove={removeLocation}
              onReorder={reorderLocations}
              onClose={() => {
                handleBack();
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
                disableAllAnimations();
                addLocation(loc);
                handleBack();
              }} 
              onClose={() => {
                handleBack();
              }}
            />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRadarMap && (
          <WeatherRadarMap 
            activeLocation={activeLocation!}
            hapticEnabled={state.settings.hapticEnabled}
            onClose={() => {
              handleBack();
            }}
          />
        )}
      </AnimatePresence>

      <main 
        className="max-w-[390px] mx-auto px-6 pt-[calc(env(safe-area-inset-top)+112px)] pb-32 min-h-screen relative touch-pan-y bottom-content"
      >
        {/* City Switching Skeleton overlay */}
        <div id="city-skeleton" style={{
          display: 'none',
          position: 'absolute',
          inset: 0,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          pointerEvents: 'none',
          zIndex: 10,
          transition: 'opacity 0.2s ease',
        }}>
          {/* Icon placeholder */}
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.05)',
            animation: 'shimmer 1.2s infinite',
          }} />

          {/* Temp placeholder */}
          <div style={{
            width: '120px',
            height: '60px',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.05)',
            animation: 'shimmer 1.2s infinite 0.1s',
          }} />

          {/* Label placeholder */}
          <div style={{
            width: '140px',
            height: '20px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.05)',
            animation: 'shimmer 1.2s infinite 0.2s',
          }} />
        </div>

        <div id="location-loading-card" style={{
          display: 'none',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          zIndex: 500,
        }} className="select-none pointer-events-none">
          {/* Pulsing location pin */}
          <div style={{
            fontSize: '48px',
            animation: 'locationPulse 1.2s ease-in-out infinite',
            display: 'block',
            marginBottom: '16px',
          }} className="select-none">📍</div>

          {/* Circular spinner */}
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(255, 255, 255, 0.15)',
            borderTop: '3px solid #6366f1',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px',
          }}></div>

          <div style={{
            fontSize: '15px',
            color: '#94a3b8',
            fontWeight: 500,
            letterSpacing: '0.3px',
          }}>Adding current location...</div>
        </div>

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
          {state.loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <WeatherSkeleton />
            </motion.div>
          ) : state.locations.length === 0 ? (
            <motion.div
              key="empty-state"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center justify-between min-h-[calc(100vh-220px)] py-12 px-2 relative"
            >
              <div className="flex flex-col items-center mt-8 z-10 w-full">
                <h1 className="text-[34px] font-bold tracking-tight text-white text-center leading-tight max-w-[325px]">
                  Welcome to Nimbus Black
                </h1>
                <p className="text-white/45 text-[17px] text-center mt-3 max-w-[280px] leading-snug font-normal">
                  Allow location access to see your local forecast
                </p>
              </div>

              {/* Ambient background blob on left */}
              <div className="absolute -left-16 top-[37%] w-56 h-56 rounded-full bg-amber-500/[0.04] blur-[80px] pointer-events-none select-none" />

              {/* Large snowflake skeleton graphic at bottom right */}
              <div className="absolute -bottom-16 -right-16 text-white/[0.02] rotate-[24deg] select-none pointer-events-none">
                <Icons.Snowflake className="w-[280px] h-[280px] stroke-[0.4]" />
              </div>

              <div className="w-full flex flex-col items-center mt-16 max-w-[340px] z-10 px-4">
                <motion.button
                  id="permission-allow"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    Haptic.medium(state.settings.hapticEnabled);
                    fetchCurrentLocation(false);
                  }}
                  className="w-full py-4 px-6 bg-[#a5cbfb] text-[#09101d] rounded-full text-[17px] font-semibold transition-transform duration-200 active:scale-97 hover:bg-[#b5d6ff]"
                >
                  Enable Location
                </motion.button>

                <motion.button
                  id="add-city-btn"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    Haptic.light(state.settings.hapticEnabled);
                    openSearch();
                  }}
                  className="w-full py-4 px-6 bg-transparent border border-white/10 text-white rounded-full text-[17px] font-semibold transition-all duration-200 hover:bg-white/5 active:scale-97 mt-3"
                >
                  Search for a City
                </motion.button>
              </div>
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
                      openSearch();
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

      <AnimatePresence>
        {showExitToast && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 bg-app-text text-app-bg rounded-2xl text-[13px] font-bold shadow-2xl pointer-events-none"
          >
            Press back again to exit
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
