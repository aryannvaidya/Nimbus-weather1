import firebaseConfig from '../../firebase-applet-config.json';
import { Settings, Location, WeatherData } from '../types';
import { getWeatherInfo } from './weatherService';
import { getCachedWeatherData, getCityKey } from '../lib/storage';

declare global {
  interface Window {
    OneSignalDeferred?: any[];
    OneSignal?: any;
  }
}

// ============================================================================
// STEP 1 — ONESIGNAL INIT
// ============================================================================
const ONESIGNAL_APP_ID = "d78d4db3-2898-4f81-8bba-c8b5b719ee1b";

window.OneSignalDeferred = window.OneSignalDeferred || [];

window.OneSignalDeferred.push(async (OneSignal: any) => {
  await OneSignal.init({
    appId: ONESIGNAL_APP_ID,
    notifyButton: { enable: false },
    allowLocalhostAsSecureOrigin: true,
  });

  console.log("OneSignal initialized");

  // Store subscription state
  const isSubscribed = await OneSignal.User.PushSubscription.optedIn;
  console.log("Push subscribed:", isSubscribed);

  // Sync tags with saved settings on initialization
  try {
    OneSignal.User.addTag("morning_summary", NotifSettings.morningEnabled ? "true" : "false");
    OneSignal.User.addTag("night_summary", NotifSettings.nightEnabled ? "true" : "false");
  } catch (e) {
    console.warn("Could not set initial status tags:", e);
  }
});

// Helper safe storage getters/setters
const safeGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
};

const safeSet = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {}
};

// ============================================================================
// STEP 2 — NOTIFICATION SETTINGS STATE
// ============================================================================
export const NotifSettings = {
  get enabled() { return safeGet("notif_enabled") === "true"; },
  get morningEnabled() { return safeGet("notif_morning") === "true"; },
  get nightEnabled() { return safeGet("notif_night") === "true"; },
  get rainEnabled() { return safeGet("notif_rain") === "true"; },
  get snowEnabled() { return safeGet("notif_snow") === "true"; },
  get stormEnabled() { return safeGet("notif_storm") === "true"; },
  get severeEnabled() { return safeGet("notif_severe") === "true"; },

  set enabled(val: boolean) { safeSet("notif_enabled", val.toString()); },
  set morningEnabled(val: boolean) { safeSet("notif_morning", val.toString()); },
  set nightEnabled(val: boolean) { safeSet("notif_night", val.toString()); },
  set rainEnabled(val: boolean) { safeSet("notif_rain", val.toString()); },
  set snowEnabled(val: boolean) { safeSet("notif_snow", val.toString()); },
  set stormEnabled(val: boolean) { safeSet("notif_storm", val.toString()); },
  set severeEnabled(val: boolean) { safeSet("notif_severe", val.toString()); },

  save(key: string, value: boolean) {
    safeSet(`notif_${key}`, value.toString());
    // Also mirrors directly on setting properties
    if (key === 'enabled') this.enabled = value;
    else if (key === 'morning') this.morningEnabled = value;
    else if (key === 'night') this.nightEnabled = value;
    else if (key === 'rain') this.rainEnabled = value;
    else if (key === 'snow') this.snowEnabled = value;
    else if (key === 'storm') this.stormEnabled = value;
    else if (key === 'severe') this.severeEnabled = value;
  }
};

// Apply saved states to toggles on settings open
export const applyNotifToggleStates = () => {
  const toggles = {
    "toggle-push":    NotifSettings.enabled,
    "toggle-morning": NotifSettings.morningEnabled,
    "toggle-night":   NotifSettings.nightEnabled,
    "toggle-rain":    NotifSettings.rainEnabled,
    "toggle-snow":    NotifSettings.snowEnabled,
    "toggle-storm":   NotifSettings.stormEnabled,
    "toggle-severe":  NotifSettings.severeEnabled,
  };

  Object.entries(toggles).forEach(([id, state]) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) {
      el.checked = state;
      el.closest("[class*='toggle']")?.classList.toggle("active", state);
    }
  });
};

// ============================================================================
// STEP 3 - WIRE TOGGLES CALLS FROM REACT
// ============================================================================
export const wirePushToggle = async (enabled: boolean, showToast?: (msg: string) => void) => {
  NotifSettings.save("enabled", enabled);

  const OneSignalDeferred = window.OneSignalDeferred || [];
  OneSignalDeferred.push(async (OneSignal: any) => {
    try {
      if (enabled) {
        if (OneSignal.User?.PushSubscription?.optIn) {
          await OneSignal.User.PushSubscription.optIn();
        } else if (OneSignal.registerForPushNotifications) {
          await OneSignal.registerForPushNotifications();
        }
      } else {
        if (OneSignal.User?.PushSubscription?.optOut) {
          await OneSignal.User.PushSubscription.optOut();
        }
      }
    } catch (err) {
      console.warn("OneSignal optIn/optOut failed:", err);
    }
  });
};

export const wireMorningToggle = async (enabled: boolean, showToast?: (msg: string) => void) => {
  NotifSettings.save("morning", enabled);

  const OneSignalDeferred = window.OneSignalDeferred || [];
  OneSignalDeferred.push(async (OneSignal: any) => {
    try {
      OneSignal.User.addTag("morning_summary", enabled ? "true" : "false");
    } catch (e) {
      console.warn("Failed to set morning tag:", e);
    }
  });

  if (enabled) {
    // Send test notification immediately matches spec
    scheduleMorningSummary();
  }
};

export const wireNightToggle = async (enabled: boolean, showToast?: (msg: string) => void) => {
  NotifSettings.save("night", enabled);

  const OneSignalDeferred = window.OneSignalDeferred || [];
  OneSignalDeferred.push(async (OneSignal: any) => {
    try {
      OneSignal.User.addTag("night_summary", enabled ? "true" : "false");
    } catch (e) {
      console.warn("Failed to set night tag:", e);
    }
  });

  if (enabled) {
    scheduleNightSummary();
  }
};

export const wireThresholdToggle = (type: 'rain' | 'snow' | 'storm' | 'severe', enabled: boolean, showToast?: (msg: string) => void) => {
  NotifSettings.save(type, enabled);
};

// ============================================================================
// STEP 4 — SEND NOTIFICATIONS
// ============================================================================
export const sendNotification = (title: string, body: string) => {
  if (!NotifSettings.enabled) return;

  const OneSignalDeferred = window.OneSignalDeferred || [];
  OneSignalDeferred.push(async (OneSignal: any) => {
    try {
      const isSubscribed = await OneSignal.User.PushSubscription.optedIn;

      // Graceful local SW fallback check for offline visual representation
      const reg = await navigator.serviceWorker?.ready.catch(() => null);

      if (reg) {
        reg.showNotification(title, {
          body,
          icon: "/icon-192.png",
          badge: "/icon-96.png",
          vibrate: [100, 50, 100],
          tag: "nimbus-weather",
          renotify: true,
        });
      }

      console.log("Notification sent:", title, body);
    } catch (err) {
      console.warn("Failed to dispatch push notification:", err);
    }
  });
};

// Helper emoji picker for specified text summaries
export function getWeatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code === 1 || code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code >= 45 && code <= 48) return "🌫️";
  if (code >= 51 && code <= 57) return "🌧️";
  if (code >= 61 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "❄️";
  if (code >= 80 && code <= 82) return "🌧️";
  if (code >= 85 && code <= 86) return "🌨️";
  if (code >= 95 && code <= 99) return "⛈️";
  return "☀️";
}

// ============================================================================
// STEP 5 — MORNING SUMMARY
// ============================================================================
export const buildMorningText = (weatherData: any, cityName: string) => {
  const temp = Math.round(weatherData.current?.temperature ?? 0);
  const feelsLike = Math.round(weatherData.current?.apparentTemperature ?? 0);
  const code = weatherData.current?.weatherCode ?? 0;
  const isDay = weatherData.current?.isDay ?? true;
  
  const icon = getWeatherEmoji(code);
  const condition = getWeatherInfo(code, isDay).label.toLowerCase();

  const title = `${temp}° now`;
  const body = `in ${cityName}\nfeels ${feelsLike}°\n${icon} ${condition} today`;

  return { title, body };
};

export const scheduleMorningSummary = () => {
  if (!NotifSettings.morningEnabled) return;

  const now = new Date();
  const morning = new Date();
  morning.setHours(7, 30, 0, 0);

  // If past 7:30 AM — schedule for tomorrow
  if (now.getTime() > morning.getTime()) {
    morning.setDate(morning.getDate() + 1);
  }

  const delay = morning.getTime() - now.getTime();
  console.log("Morning summary in:", Math.round(delay / 60000), "minutes");

  setTimeout(async () => {
    try {
      const raw = localStorage.getItem('app_locations');
      if (raw) {
        const locations = JSON.parse(raw);
        if (locations && locations.length > 0) {
          const city = locations[0];
          const cached = getCachedWeatherData(getCityKey(city));
          if (cached && cached.data) {
            const { title, body } = buildMorningText(cached.data, city.name);
            sendNotification(title, body);
          }
        }
      }
    } catch (e) {
      console.warn("Failed sending automated morning summary:", e);
    }

    // Schedule next day
    scheduleMorningSummary();
  }, delay);
};

// ============================================================================
// STEP 6 — NIGHT SUMMARY
// ============================================================================
export const buildNightText = (weatherData: any, cityName: string) => {
  const tomorrowHigh = Math.round(weatherData.daily?.temperatureMax?.[1] ?? weatherData.current?.temperature ?? 0);
  const code = weatherData.daily?.weatherCode?.[1] ?? weatherData.current?.weatherCode ?? 0;
  
  const icon = getWeatherEmoji(code);
  const condition = getWeatherInfo(code, false).label.toLowerCase();
  const feelsLike = Math.round(weatherData.current?.apparentTemperature ?? 0);

  const title = `${tomorrowHigh}° high tomorrow`;
  const body = `in ${cityName}\nfeels ${feelsLike}°\n${icon} ${condition} overnight`;

  return { title, body };
};

export const scheduleNightSummary = () => {
  if (!NotifSettings.nightEnabled) return;

  const now = new Date();
  const night = new Date();
  night.setHours(21, 0, 0, 0);

  if (now.getTime() > night.getTime()) {
    night.setDate(night.getDate() + 1);
  }

  const delay = night.getTime() - now.getTime();
  console.log("Night summary in:", Math.round(delay / 60000), "minutes");

  setTimeout(async () => {
    try {
      const raw = localStorage.getItem('app_locations');
      if (raw) {
        const locations = JSON.parse(raw);
        if (locations && locations.length > 0) {
          const city = locations[0];
          const cached = getCachedWeatherData(getCityKey(city));
          if (cached && cached.data) {
            const { title, body } = buildNightText(cached.data, city.name);
            sendNotification(title, body);
          }
        }
      }
    } catch (e) {
      console.warn("Failed sending automated night summary:", e);
    }

    // Schedule next night
    scheduleNightSummary();
  }, delay);
};

// ============================================================================
// STEP 7 — THRESHOLD ALERTS
// ============================================================================
export const getFirstRainHour = (weatherData: any): number => {
  const hourly = weatherData.hourly?.precipitationProbability || [];
  const rainHour = hourly.findIndex(
    (p: number) => p >= 70
  );
  return rainHour > 0 ? rainHour : 2;
};

export const checkWeatherAlerts = (weatherData: any, cityName: string) => {
  if (!NotifSettings.enabled) return;

  const precipArray = weatherData.hourly?.precipitationProbability || [];
  const precip = precipArray.length > 0 ? Math.max(...precipArray.slice(0, 12)) : (weatherData.current?.precipitation > 0 ? 80 : 0);

  const code = weatherData.current?.weatherCode ?? 0;
  const condition = getWeatherInfo(code).label.toLowerCase();

  // Rain alert — over 70% probability
  if (NotifSettings.rainEnabled && precip >= 70) {
    const hours = getFirstRainHour(weatherData);
    sendNotification(
      `🌧 rain coming`,
      `in ${cityName}\n${precip}% chance\nnext ${hours} hrs`
    );
  }

  // Snow alert
  if (NotifSettings.snowEnabled && (
    (code >= 71 && code <= 77) ||
    (code >= 85 && code <= 86)
  )) {
    sendNotification(
      `❄️ snow in ${cityName}`,
      `${condition}\nbundle up`
    );
  }

  // Thunderstorm alert
  if (NotifSettings.stormEnabled && (
    code === 95 || code === 96 || code === 99
  )) {
    sendNotification(
      `⛈ storm alert`,
      `in ${cityName}\nthunderstorm likely\nstay indoors`
    );
  }

  // Severe weather alert
  if (NotifSettings.severeEnabled && (
    code >= 95 && precip >= 80
  )) {
    sendNotification(
      `⚠ severe weather`,
      `in ${cityName}\n${condition}\ntake precautions`
    );
  }
};

// ============================================================================
// COMPATIBILITY MODULE WRAPPERS
// ============================================================================
export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }
  try {
    if (window.self !== window.top) {
      return false;
    }
  } catch (e) {
    return false;
  }
  return true;
}

export function getOneSignal(): any {
  return window.OneSignal || null;
}

export async function initializeOneSignal(onSubscriptionChange?: (playerId: string | null) => void): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const OneSignalDeferred = window.OneSignalDeferred || [];
      OneSignalDeferred.push(async (OneSignal: any) => {
        let playerId = null;
        if (OneSignal.User?.PushSubscription?.id) {
          playerId = OneSignal.User.PushSubscription.id;
        }
        if (onSubscriptionChange) {
          onSubscriptionChange(playerId);
        }
        resolve(playerId);
      });
    } catch (e) {
      console.warn("Failed retrieving playerId asynchronously:", e);
      resolve(null);
    }
  });
}

export async function requestNotificationPermission(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const OneSignalDeferred = window.OneSignalDeferred || [];
      OneSignalDeferred.push(async (OneSignal: any) => {
        try {
          if (OneSignal.Notifications?.requestPermission) {
            await OneSignal.Notifications.requestPermission();
          } else if (OneSignal.showNativePrompt) {
            await OneSignal.showNativePrompt();
          }
          let playerId = OneSignal.User?.PushSubscription?.id || null;
          resolve(playerId);
        } catch (err) {
          resolve(null);
        }
      });
    } catch (e) {
      resolve(null);
    }
  });
}

export async function syncUserSettingsToFirebase(
  playerId: string,
  settings: Settings,
  location: Location | null
): Promise<boolean> {
  const projectId = firebaseConfig.projectId;
  const apiKey = firebaseConfig.apiKey;
  const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const fields = [
    'playerId',
    'timezone',
    'rainThreshold',
    'snowThreshold',
    'alertRainEnabled',
    'alertSnowEnabled',
    'alertThunderstormEnabled',
    'alertSevereEnabled',
    'alertMorningSummaryEnabled',
    'alertNightSummaryEnabled',
    'latitude',
    'longitude',
    'cityName',
    'countryCode'
  ];

  const updateMaskQuery = fields.map(f => `updateMask.fieldPaths=${f}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${playerId}?${updateMaskQuery}&key=${apiKey}`;

  const body = {
    fields: {
      playerId: { stringValue: playerId },
      timezone: { stringValue: timezone },
      rainThreshold: { integerValue: String(settings.rainThreshold) },
      snowThreshold: { integerValue: String(settings.snowThreshold) },
      alertRainEnabled: { booleanValue: settings.alertRain },
      alertSnowEnabled: { booleanValue: settings.alertDaily },
      alertThunderstormEnabled: { booleanValue: settings.stormThreshold },
      alertSevereEnabled: { booleanValue: settings.alertSevere },
      alertMorningSummaryEnabled: { booleanValue: settings.alertMorningSummary },
      alertNightSummaryEnabled: { booleanValue: settings.alertNightSummary },
      latitude: { doubleValue: location ? location.latitude : 0 },
      longitude: { doubleValue: location ? location.longitude : 0 },
      cityName: { stringValue: location ? location.name : 'Unknown' },
      countryCode: { stringValue: location ? (location.country || '') : '' }
    }
  };

  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      return false;
    }
    return true;
  } catch (error) {
    return false;
  }
}

export async function fetchUserSettingsFromFirebase(
  playerId: string
): Promise<Partial<Settings> | null> {
  const projectId = firebaseConfig.projectId;
  const apiKey = firebaseConfig.apiKey;
  const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${playerId}?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.fields) return null;

    const f = data.fields;
    
    const getBool = (field: any) => field?.booleanValue ?? null;
    const getInt = (field: any) => field?.integerValue ? parseInt(field.integerValue, 10) : null;

    const fetchedSettings: Partial<Settings> = {};

    if (getBool(f.alertRainEnabled) !== null) fetchedSettings.alertRain = getBool(f.alertRainEnabled);
    if (getBool(f.alertSnowEnabled) !== null) fetchedSettings.alertDaily = getBool(f.alertSnowEnabled);
    if (getBool(f.alertThunderstormEnabled) !== null) fetchedSettings.stormThreshold = getBool(f.alertThunderstormEnabled);
    if (getBool(f.alertSevereEnabled) !== null) fetchedSettings.alertSevere = getBool(f.alertSevereEnabled);
    if (getBool(f.alertMorningSummaryEnabled) !== null) fetchedSettings.alertMorningSummary = getBool(f.alertMorningSummaryEnabled);
    if (getBool(f.alertNightSummaryEnabled) !== null) fetchedSettings.alertNightSummary = getBool(f.alertNightSummaryEnabled);
    if (getInt(f.rainThreshold) !== null) fetchedSettings.rainThreshold = getInt(f.rainThreshold);
    if (getInt(f.snowThreshold) !== null) fetchedSettings.snowThreshold = getInt(f.snowThreshold);

    return fetchedSettings;
  } catch (error) {
    return null;
  }
}
