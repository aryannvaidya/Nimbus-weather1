import { Location, WeatherData } from '../types';

// --- Safe Fetch Mechanism with Timeout & Retry ---

export const fetchWithTimeout = async (url: string, options: any = {}, timeout = 25000, retries = 3): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { 
      ...options, 
      signal: controller.signal,
      cache: 'no-cache'
    });
    clearTimeout(id);

    if (response.status === 429 && retries > 0) {
      const waitTime = 4000 + Math.random() * 3000;
      await new Promise(r => setTimeout(r, waitTime));
      return fetchWithTimeout(url, options, timeout, retries - 1);
    }

    if (!response.ok && retries > 0 && response.status >= 500) {
      await new Promise(r => setTimeout(r, 3000));
      return fetchWithTimeout(url, options, timeout, retries - 1);
    }

    return response;
  } catch (e) {
    clearTimeout(id);
    if (e instanceof Error && e.name === 'AbortError') {
      if (retries > 0) return fetchWithTimeout(url, options, timeout, retries - 1);
      throw new Error(`The connection to ${new URL(url).hostname} timed out.`);
    }
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 2000));
      return fetchWithTimeout(url, options, timeout, retries - 1);
    }
    throw e;
  }
};

const safeFetch = async (url: string) => {
  if (typeof window !== "undefined") {
    let proxyUrl = "";
    if (url.startsWith("https://api.open-meteo.com")) {
      proxyUrl = url.replace("https://api.open-meteo.com", "/api/weather-proxy");
    } else if (url.startsWith("https://geocoding-api.open-meteo.com")) {
      proxyUrl = url.replace("https://geocoding-api.open-meteo.com", "/api/geocoding-proxy");
    } else if (url.startsWith("https://air-quality-api.open-meteo.com")) {
      proxyUrl = url.replace("https://air-quality-api.open-meteo.com", "/api/air-quality-proxy");
    }

    if (proxyUrl) {
      try {
        console.log(`[Proxy] Fetching via server: ${proxyUrl}`);
        const response = await fetchWithTimeout(proxyUrl, {}, 8000, 1);
        if (response.ok) {
          const data = await response.json();
          if (data && !data.error) {
            return data;
          }
        }
        console.warn(`[Proxy] Status ${response.status} or error in body. Falling back to direct URL.`);
      } catch (err) {
        console.warn(`[Proxy] Fetch failed for ${proxyUrl}. Falling back to direct URL.`, err);
      }
    }
  }

  // Fallback to direct client-side fetch (or default if server proxy is disabled/unresponsive)
  try {
    console.log(`[Direct] Fetching: ${url}`);
    const response = await fetchWithTimeout(url, {}, 12000, 2);
    if (!response.ok) {
      console.warn(`[Direct] Failed with status ${response.status} for ${url}`);
      return null;
    }
    return await response.json();
  } catch (err) {
    console.error("[Direct] Failed completely for", url, err);
    return null;
  }
};

export function parseTimeToAbsoluteDate(timeStr: string, timeZone: string): Date {
  if (!timeStr) return new Date();
  
  if (timeStr.includes('Z') || /[-+]\d{2}(:?\d{2})?$/.test(timeStr)) {
    return new Date(timeStr);
  }
  
  const match = timeStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    return new Date(timeStr);
  }
  
  const trgYear = parseInt(match[1]);
  const trgMonth = parseInt(match[2]);
  const trgDay = parseInt(match[3]);
  const trgHour = parseInt(match[4]);
  const trgMin = parseInt(match[5]);
  const trgSec = match[6] ? parseInt(match[6]) : 0;
  
  let guessMs = Date.UTC(trgYear, trgMonth - 1, trgDay, trgHour, trgMin, trgSec);
  
  try {
    const resolvedTZ = timeZone === 'auto' ? undefined : timeZone;
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: resolvedTZ,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23'
    });
    
    for (let i = 0; i < 3; i++) {
      const formattedParts = formatter.formatToParts(new Date(guessMs));
      const getVal = (type: string) => {
        const p = formattedParts.find(item => item.type === type);
        return p ? p.value : '0';
      };
      
      const convYear = parseInt(getVal('year'));
      const convMonth = parseInt(getVal('month'));
      const convDay = parseInt(getVal('day'));
      const convHour = parseInt(getVal('hour'));
      const convMin = parseInt(getVal('minute'));
      const convSec = parseInt(getVal('second'));
      
      const convMs = Date.UTC(convYear, convMonth - 1, convDay, convHour, convMin, convSec);
      const diffMs = convMs - Date.UTC(trgYear, trgMonth - 1, trgDay, trgHour, trgMin, trgSec);
      
      if (diffMs === 0) break;
      guessMs -= diffMs;
    }
    
    return new Date(guessMs);
  } catch (err) {
    console.warn("parseTimeToAbsoluteDate failed with timezone", timeZone, err);
    return new Date(guessMs);
  }
}

export const getCurrentHourIndex = (timezone: string, hourlyTimes?: string[]) => {
  try {
    if (!hourlyTimes || hourlyTimes.length === 0) {
      return new Date().getHours();
    }
    
    const nowMs = Date.now();
    let closestIndex = 0;
    let minDiff = Infinity;
    
    for (let i = 0; i < hourlyTimes.length; i++) {
      const hourlyDate = parseTimeToAbsoluteDate(hourlyTimes[i], timezone);
      const diff = Math.abs(hourlyDate.getTime() - nowMs);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    
    return closestIndex;
  } catch {
    return new Date().getHours();
  }
};

// --- STEP 2 — SINGLE OPEN-METEO FETCH FUNCTION ---

export const fetchAllWeatherData = async (lat: number, lon: number): Promise<any> => {
  const url = 
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}` +
    `&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,` +
    `apparent_temperature,weather_code,` +
    `wind_speed_10m,wind_direction_10m,` +
    `surface_pressure,precipitation,visibility` +
    `&hourly=temperature_2m,weather_code,` +
    `precipitation_probability,precipitation,` +
    `wind_speed_10m,visibility,uv_index,` +
    `relative_humidity_2m` +
    `&daily=weather_code,temperature_2m_max,` +
    `temperature_2m_min,sunrise,sunset,` +
    `precipitation_probability_max,` +
    `wind_speed_10m_max,uv_index_max,` +
    `precipitation_sum` +
    `&timezone=auto` +
    `&wind_speed_unit=ms` +
    `&forecast_days=8`;

  const res = await safeFetch(url);

  if (!res) {
    console.error("Open-Meteo fetch failed");
    return null;
  }

  console.log("Open-Meteo response:", {
    current: res.current,
    hourly_length: res.hourly?.time?.length,
    daily_length: res.daily?.time?.length,
    timezone: res.timezone
  });

  return res;
};

// --- STEP 3 — CURRENT WEATHER PARSER ---

export const parseCurrentWeather = (res: any): any => {
  if (!res?.current) {
    console.error("No current data in response");
    return null;
  }

  const c = res.current;
  const h = res.hourly;
  
  const timezone = res.timezone || 'UTC';
  const idx = getCurrentHourIndex(timezone, h?.time);

  const precipProb = h?.precipitation_probability?.[idx] ?? 0;
  const visibility = c.visibility !== undefined 
    ? (c.visibility / 1000).toFixed(1)
    : (h?.visibility?.[idx] !== undefined ? (h.visibility[idx] / 1000).toFixed(1) : "10.0");
  const uvIndex = h?.uv_index?.[idx] ?? 0;

  const data = {
    temp:        Math.round(c.temperature_2m),
    feelsLike:   Math.round(c.apparent_temperature),
    humidity:    c.relative_humidity_2m,
    weatherCode: c.weather_code,
    windSpeed:   Math.round(c.wind_speed_10m),
    windDir:     c.wind_direction_10m,
    precipProb:  precipProb,
    visibility:  visibility,
    uvIndex:     uvIndex,
    pressure:    Math.round(c.surface_pressure),
    timezone:    res.timezone,
  };

  console.log("Parsed current:", data);
  return data;
};

// --- STEP 4 — HOURLY FORECAST PARSER ---

export const parseHourlyForecast = (res: any): any[] => {
  if (!res?.hourly?.time) {
    console.error("No hourly data in response");
    return [];
  }

  const h = res.hourly;
  const timezone = res.timezone;
  let safeTZ = timezone;
  if (!safeTZ || safeTZ === 'auto') {
    safeTZ = 'UTC';
  } else {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: safeTZ });
    } catch {
      safeTZ = 'UTC';
    }
  }

  // Find current hour index
  let now: Date;
  try {
    now = new Date(
      new Date().toLocaleString("en-US", 
        { timeZone: safeTZ })
    );
  } catch {
    now = new Date();
  }
  const currentHour = now.getHours();

  // Find matching index in time array
  let startIndex = 0;
  for (let i = 0; i < h.time.length; i++) {
    const t = new Date(h.time[i]);
    let localT: Date;
    try {
      localT = new Date(
        t.toLocaleString("en-US", 
          { timeZone: safeTZ })
      );
    } catch {
      localT = t;
    }
    if (localT.getHours() >= currentHour) {
      startIndex = i;
      break;
    }
  }

  console.log("Hourly start index:", startIndex);
  console.log("Hourly temp at start:", 
    h.temperature_2m[startIndex]);

  // Build 24 hours from current hour
  const hours = [];
  for (let i = startIndex; 
       i < startIndex + 24 && i < h.time.length; 
       i++) {

    const time = new Date(h.time[i]);
    let localTime: Date;
    try {
      localTime = new Date(
        time.toLocaleString("en-US", 
          { timeZone: safeTZ })
      );
    } catch {
      localTime = time;
    }
    const hour   = localTime.getHours();
    const hour12 = hour % 12 || 12;
    const isAM   = hour < 12;
    const idx    = i - startIndex;
    const label  = idx === 0 
      ? "Now" 
      : `${hour12} ${isAM ? "AM" : "PM"}`;

    const temp   = h.temperature_2m[i];
    const precip = h.precipitation_probability[i] ?? 0;
    const code   = h.weather_code[i];
    const isNight = hour < 6 || hour >= 20;

    // Validate
    if (temp === undefined || temp === null) {
      console.error(`Hour ${i} temp missing`);
    }

    hours.push({
      label,
      temp:   Math.round(temp ?? 0),
      precip: Math.round(precip),
      code,
      isNight,
      icon:   getHourlyIcon(precip, isNight),
    });
  }

  console.log("Parsed hourly sample:", 
    hours.slice(0, 3));
  return hours;
};

// --- STEP 5 — DAILY FORECAST PARSER ---

export const parseDailyForecast = (res: any): any[] => {
  if (!res?.daily?.time) {
    console.error("No daily data in response");
    return [];
  }

  const d = res.daily;

  const days = d.time.map((dateStr: string, i: number) => {
    const date    = new Date(dateStr + "T12:00:00");
    const dayName = i === 0 ? "Today" : 
      date.toLocaleDateString("en-US", 
        { weekday: "short" });

    const high   = d.temperature_2m_max[i];
    const low    = d.temperature_2m_min[i];
    const code   = d.weather_code[i];
    const precip = d.precipitation_probability_max[i] ?? 0;
    const uv     = d.uv_index_max[i] ?? 0;

    if (high === undefined || low === undefined) {
      console.error(`Day ${i} temp missing`);
    }

    return {
      day:    dayName,
      high:   Math.round(high ?? 0),
      low:    Math.round(low ?? 0),
      code,
      precip: Math.round(precip),
      uv:     Math.round(uv),
      icon:   mapWMOIcon(code, false),
    };
  });

  console.log("Parsed daily sample:", 
    days.slice(0, 3));
  return days;
};

// --- STEP 6 — SUNRISE SUNSET PARSER ---

export const parseSunriseSunset = (res: any, timezone: string): any => {
  if (!res?.daily?.sunrise) {
    console.error("No sunrise data");
    return null;
  }

  // Open-Meteo returns ISO strings
  // e.g. "2024-05-17T05:56"
  const sunriseISO = res.daily.sunrise[0];
  const sunsetISO  = res.daily.sunset[0];

  const sunrise = new Date(sunriseISO);
  const sunset  = new Date(sunsetISO);

  let validatedTimezone = timezone;
  if (!validatedTimezone || validatedTimezone === 'auto') {
    validatedTimezone = 'UTC';
  } else {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: validatedTimezone });
    } catch (e) {
      validatedTimezone = 'UTC';
    }
  }

  const fmt = (d: Date) => {
    try {
      return d.toLocaleTimeString("en-IN", {
        timeZone: validatedTimezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });
    } catch (err) {
      return d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });
    }
  };

  return {
    sunriseISO,
    sunsetISO,
    sunriseLabel: fmt(sunrise),
    sunsetLabel:  fmt(sunset),
  };
};

// --- STEP 7 — WMO CODE MAPPER ---

export const mapWMOIcon = (code: number, isNight: boolean): string => {
  if (code === 0) 
    return isNight ? "🌙" : "☀️";
  if (code === 1) 
    return isNight ? "🌙" : "🌤️";
  if (code === 2) 
    return isNight ? "☁️" : "⛅";
  if (code === 3)  return "☁️";
  if (code <= 48)  return "🌫️";
  if (code <= 57)  return "🌦️";
  if (code <= 67)  return "🌧️";
  if (code <= 77)  return "❄️";
  if (code <= 82)  return "🌦️";
  if (code <= 86)  return "🌨️";
  if (code === 95) return "⛈️";
  if (code >= 96)  return "🌩️";
  return "🌡️";
};

export const mapWMOLabel = (code: number): string => {
  if (code === 0)  return "Clear Sky";
  if (code === 1)  return "Mainly Clear";
  if (code === 2)  return "Partly Cloudy";
  if (code === 3)  return "Overcast";
  if (code <= 48)  return "Foggy";
  if (code <= 57)  return "Drizzle";
  if (code <= 67)  return "Rain";
  if (code <= 77)  return "Snow";
  if (code <= 82)  return "Rain Showers";
  if (code <= 86)  return "Snow Showers";
  if (code === 95) return "Thunderstorm";
  if (code >= 96)  return "Severe Storm";
  return "Unknown";
};

// --- MAIN FETCH AND LOAD MAPPING ---

export async function fetchWeatherBulk(locations: Location[]): Promise<Record<number, WeatherData>> {
  const results: Record<number, WeatherData> = {};
  await Promise.all(locations.map(async (loc, index) => {
    try {
      results[index] = await fetchWeather(loc.latitude, loc.longitude, loc.timezone, loc.name, loc.country);
    } catch (e) {
      console.error(`Bulk fetch failed for ${loc.name}:`, e);
    }
  }));
  return results;
}

/**
 * Retrieve cached AQI data for a given city from localStorage.
 * If the data is present and valid, returns it immediately, allowing
 * instant visual population prior to finishing any asynchronous fetch requests.
 */
export function getAQIFromCacheOrLive(cityKey: string): any {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return null;
  }
  try {
    const cacheRaw = localStorage.getItem('app_weather_cache');
    if (cacheRaw) {
      const cache = JSON.parse(cacheRaw);
      const cached = cache[cityKey];
      if (cached?.data?.airQuality) {
        const aq = cached.data.airQuality;
        // Check if there is valid AQI data, avoiding default 15 placeholder
        if (aq && typeof aq.usAqi === 'number' && aq.usAqi !== 15) {
          return aq;
        }
        // If it was exactly 15, only return if it has actual PM2.5 details or is marked fully available
        if (aq && aq.usAqi === 15 && (aq.pm2_5 !== undefined || !aq.isUnavailable)) {
          return aq;
        }
      }
    }
  } catch (e) {
    console.warn("Error reading AQI from localStorage cache:", e);
  }
  return null;
}

export async function fetchWeather(lat: number, lon: number, timezone: string, cityName?: string, countryCode?: string): Promise<WeatherData> {
  const res = await fetchAllWeatherData(lat, lon);
  if (!res) {
    throw new Error("Failed to fetch weather data from Open-Meteo");
  }

  const currentParsed = parseCurrentWeather(res);
  const sunParsed = parseSunriseSunset(res, res.timezone || timezone || 'UTC');

  // Attempt to recover previously cached Air Quality Data for this city if the current fetch holds or fails
  const cityKey = `${cityName || 'unknown'}_${lat.toFixed(2)}_${lon.toFixed(2)}`
    .replace(/\s+/g, "_")
    .toLowerCase();
  const cachedAqi = getAQIFromCacheOrLive(cityKey);

  const aqiData = await getAQIDataWithFallback(lat, lon, cityName || "Unknown", countryCode).catch(() => null);

  const resolvedTimezone = res.timezone || timezone || 'UTC';

  const weatherData: WeatherData = {
    current: {
      time: res.current?.time || new Date().toISOString(),
      temperature: currentParsed?.temp ?? 0,
      relativeHumidity: currentParsed?.humidity ?? 0,
      weatherCode: currentParsed?.weatherCode ?? 0,
      summaryCode: res.daily?.weather_code?.[0] ?? currentParsed?.weatherCode ?? 0,
      windSpeed: currentParsed?.windSpeed ?? 0,
      windDirection: currentParsed?.windDir ?? 0,
      apparentTemperature: currentParsed?.feelsLike ?? 0,
      isDay: res.current?.is_day !== undefined ? (res.current?.is_day === 1) : (() => {
        if (sunParsed?.sunriseISO && sunParsed?.sunsetISO) {
          const nowMs = Date.now();
          const sunriseMs = new Date(sunParsed.sunriseISO).getTime();
          const sunsetMs = new Date(sunParsed.sunsetISO).getTime();
          return nowMs >= sunriseMs && nowMs < sunsetMs;
        }
        return true;
      })(),
      visibility: Number(currentParsed?.visibility ?? 10) * 1000, 
      surfacePressure: currentParsed?.pressure ?? 1013,
      precipitation: res.current?.precipitation ?? 0,
      uvIndex: currentParsed?.uvIndex ?? 0,
    },
    hourly: {
      time: res.hourly?.time || [],
      temperature: res.hourly?.temperature_2m || [],
      temperature_2m: res.hourly?.temperature_2m || [],
      weatherCode: res.hourly?.weather_code || [],
      weathercode: res.hourly?.weather_code || [],
      precipitationProbability: res.hourly?.precipitation_probability || [],
      windDirection: res.hourly?.wind_direction_10m || [],
      windSpeed: res.hourly?.wind_speed_10m || [],
      precipitation: res.hourly?.precipitation || [],
      uvIndex: res.hourly?.uv_index || [],
    },
    daily: {
      time: res.daily?.time || [],
      weatherCode: res.daily?.weather_code || [],
      temperatureMax: res.daily?.temperature_2m_max || [],
      temperatureMin: res.daily?.temperature_2m_min || [],
      sunrise: res.daily?.sunrise || [],
      sunset: res.daily?.sunset || [],
      moonrise: res.daily?.moonrise || res.daily?.time?.map(() => "") || [],
      moonset: res.daily?.moonset || res.daily?.time?.map(() => "") || [],
      uvIndex: res.daily?.uv_index_max || [],
      moonPhase: res.daily?.time ? res.daily.time.map((_: any, idx: number) => {
        return Number((0.15 + (idx * 0.03)) % 1);
      }) : [],
      precipitationSum: res.daily?.precipitation_sum || [],
    },
    airQuality: {
      usAqi: aqiData?.usAqi ?? (cachedAqi?.usAqi ?? 0),
      description: aqiData?.description ?? (cachedAqi?.description ?? "Retrieving..."),
      color: aqiData?.color ?? (cachedAqi?.color ?? "#94a3b8"),
      recommendation: aqiData?.recommendation ?? (cachedAqi?.recommendation ?? "Reading station..."),
      standard: aqiData?.standard ?? (cachedAqi?.standard ?? 'US'),
      standardLabel: aqiData?.standardLabel ?? (cachedAqi?.standardLabel ?? "AQI · US Standard"),
      pm2_5: aqiData?.pm2_5 ?? cachedAqi?.pm2_5,
      pm10: aqiData?.pm10 ?? cachedAqi?.pm10,
      co: aqiData?.co ?? cachedAqi?.co,
      no2: aqiData?.no2 ?? cachedAqi?.no2,
      o3: aqiData?.o3 ?? cachedAqi?.o3,
      so2: aqiData?.so2 ?? cachedAqi?.so2,
      lastUpdated: aqiData?.lastUpdated ?? (cachedAqi?.lastUpdated ?? new Date().toISOString()),
      freshnessLabel: aqiData?.freshnessLabel ?? (cachedAqi?.freshnessLabel ?? "Live"),
      isUnavailable: aqiData ? aqiData.isUnavailable : (cachedAqi ? cachedAqi.isUnavailable : true),
      isStale: aqiData ? aqiData.isStale : (cachedAqi ? cachedAqi.isStale : false),
      historicalAqi: aqiData?.historicalAqi ?? cachedAqi?.historicalAqi,
    },
    fetchedAt: Date.now(),
    timezone: resolvedTimezone,
  };

  return weatherData;
}

// --- Geocoding (Direct Free APIs without Keys) ---

export async function searchLocations(query: string): Promise<Location[]> {
  if (query.length < 2) return [];
  try {
    console.log('[RateLimiter] Running Open-Meteo Geocoding');
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10`;
    const data = await safeFetch(url);
    if (!data) return [];
    const results = data.results || [];
    return results.map((item: any, idx: number) => ({
      id: item.id || (Date.now() + idx),
      name: item.name,
      latitude: item.latitude,
      longitude: item.longitude,
      country: item.country,
      admin1: item.admin1,
      admin2: item.admin2,
      timezone: item.timezone || 'auto',
    }));
  } catch (err) {
    console.warn('Location search failed:', err);
    return [];
  }
}

export async function reverseGeocode(lat: number, lon: number): Promise<Partial<Location> | null> {
  try {
    console.log('[RateLimiter] Running Nominatim Reverse Geocoding');
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`;
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'NimbusWeatherApp/1.0'
      }
    }, 5000, 0);
    if (response.ok) {
      const item = await response.json();
      const addr = item.address || {};
      const name = addr.city || addr.town || addr.village || addr.suburb || addr.municipality || addr.county;
      if (name) {
        return {
          name,
          country: addr.country || "",
          admin1: addr.state || ""
        };
      }
    }
  } catch (err) {
    console.warn('Nominatim reverse geocode failed:', err);
  }

  // Backup: BigDataCloud Reverse Geocode Client API (free, fast, keyless)
  try {
    console.log('[BackupGeocoding] Running BigDataCloud Reverse Geocoding');
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
    const response = await fetchWithTimeout(url, {}, 5000, 0);
    if (response.ok) {
      const item = await response.json();
      const name = item.city || item.locality || item.principalSubdivision;
      if (name) {
        return {
          name,
          country: item.countryName || "",
          admin1: item.principalSubdivision || ""
        };
      }
    }
  } catch (err) {
    console.warn('BigDataCloud reverse geocode failed:', err);
  }

  return null;
}

// --- Air Quality API ---

export const getAQIStandard = (cityName: string, countryCode: string): 'IN' | 'US' => {
  const indianCities = [
    "delhi", "mumbai", "bangalore", "chennai",
    "kolkata", "hyderabad", "pune", "ahmedabad",
    "jaipur", "lucknow", "kanpur", "nagpur",
    "godda", "jharkhand", "ranchi", "patna"
  ];

  const name = cityName.toLowerCase();
  const isIndian = indianCities.some(c => 
    name.includes(c)
  ) || countryCode === "IN";

  return isIndian ? "IN" : "US";
};

export const getAQICategory = (aqi: number, standard = "US") => {
  if (standard === "IN") {
    if (aqi <= 50)  return { label:"Good",        color:"#00b050", recommendation: "Ideal for outdoor activities." };
    if (aqi <= 100) return { label:"Satisfactory", color:"#92d050", recommendation: "Acceptable air quality for general public." };
    if (aqi <= 200) return { label:"Moderate",     color:"#ffff00", recommendation: "May cause breathing discomfort to people with sensitive lungs." };
    if (aqi <= 300) return { label:"Poor",         color:"#ff7e00", recommendation: "May cause breathing discomfort on prolonged exposure." };
    if (aqi <= 400) return { label:"Very Poor",    color:"#ff0000", recommendation: "May cause respiratory illness on prolonged exposure." };
    return              { label:"Severe",          color:"#7e0023", recommendation: "May cause respiratory effects even on healthy people." };
  } else {
    if (aqi <= 50)  return { label:"Good",                      color:"#00e400", recommendation: "Ideal for outdoor activities." };
    if (aqi <= 100) return { label:"Moderate",                  color:"#ffff00", recommendation: "Acceptable quality; sensitive groups should limit exertion." };
    if (aqi <= 150) return { label:"Unhealthy for Sensitive",   color:"#ff7e00", recommendation: "Sensitive groups should reduce prolonged outdoor activity." };
    if (aqi <= 200) return { label:"Unhealthy",                 color:"#ff0000", recommendation: "Everyone should reduce prolonged outdoor exertion." };
    if (aqi <= 300) return { label:"Very Unhealthy",            color:"#8f3f97", recommendation: "Avoid outdoor activity. Keep windows closed." };
    return              { label:"Hazardous",                    color:"#7e0023", recommendation: "Stay indoors. Health emergency conditions." };
  }
};

export function calcIndianSubIndexPM25(val: number): number {
  if (val <= 0) return 0;
  if (val <= 30) return Math.round(((50 - 0) / (30 - 0)) * (val - 0) + 0);
  if (val <= 60) return Math.round(((100 - 51) / (60 - 31)) * (val - 31) + 51);
  if (val <= 90) return Math.round(((200 - 101) / (90 - 61)) * (val - 61) + 101);
  if (val <= 120) return Math.round(((300 - 201) / (120 - 91)) * (val - 91) + 201);
  if (val <= 250) return Math.round(((400 - 301) / (250 - 121)) * (val - 121) + 301);
  if (val <= 380) return Math.round(((500 - 401) / (380 - 251)) * (val - 251) + 401);
  return 500;
}

export function calcIndianSubIndexPM10(val: number): number {
  if (val <= 0) return 0;
  if (val <= 50) return Math.round(((50 - 0) / (50 - 0)) * (val - 0) + 0);
  if (val <= 100) return Math.round(((100 - 51) / (100 - 51)) * (val - 51) + 51);
  if (val <= 250) return Math.round(((200 - 101) / (250 - 101)) * (val - 101) + 101);
  if (val <= 350) return Math.round(((300 - 201) / (350 - 251)) * (val - 251) + 201);
  if (val <= 430) return Math.round(((400 - 301) / (430 - 351)) * (val - 351) + 301);
  if (val <= 510) return Math.round(((500 - 401) / (510 - 431)) * (val - 431) + 401);
  return 500;
}

export function calculateIndianAQI(pm25: number | undefined, pm10: number | undefined): number {
  const pm25Val = pm25 !== undefined && pm25 !== null ? pm25 : 0;
  const pm10Val = pm10 !== undefined && pm10 !== null ? pm10 : 0;
  
  if (pm25Val <= 0 && pm10Val <= 0) return 0;
  const pm25SubIndex = pm25Val > 0 ? calcIndianSubIndexPM25(pm25Val) : 0;
  const pm10SubIndex = pm10Val > 0 ? calcIndianSubIndexPM10(pm10Val) : 0;
  const rawAqi = Math.max(pm25SubIndex, pm10SubIndex);
  return Math.min(rawAqi, 500);
}

export const getDataAgeHours = (timeString: string | undefined): number => {
  if (!timeString) return 999;
  try {
    const cleanTime = timeString.includes(' ') && !timeString.includes('T') ? timeString.replace(' ', 'T') : timeString;
    const updated = new Date(cleanTime);
    return (Date.now() - updated.getTime()) / (1000 * 60 * 60);
  } catch { return 999; }
};

export const fetchAQI = async (cityName: string, lat: number, lon: number): Promise<any> => {
  const token = import.meta.env.VITE_WAQI_TOKEN || "demo";
  const results: { data: any; age: number }[] = [];

  // Try 1 — City name slug
  const slug = cityName.toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  const r1 = await safeFetch(
    `https://api.waqi.info/feed/${slug}/?token=${token}`
  );
  if (r1?.status === "ok" && r1.data?.aqi > 0) {
    results.push({
      data: r1.data,
      age: getDataAgeHours(r1.data.time?.s || r1.data.time?.iso)
    });
  }

  // Try 2 — Geo coordinates
  const r2 = await safeFetch(
    `https://api.waqi.info/feed/geo:${lat};${lon}/?token=${token}`
  );
  if (r2?.status === "ok" && r2.data?.aqi > 0) {
    results.push({
      data: r2.data,
      age: getDataAgeHours(r2.data.time?.s || r2.data.time?.iso)
    });
  }

  // Try 3 — Search by keyword
  const r3 = await safeFetch(
    `https://api.waqi.info/search/?token=${token}&keyword=${encodeURIComponent(cityName)}`
  );
  if (r3?.status === "ok" && r3.data?.length > 0) {
    const top3 = r3.data.slice(0, 3);
    for (const station of top3) {
      if (station.uid) {
        const r = await safeFetch(
          `https://api.waqi.info/feed/@${station.uid}/?token=${token}`
        );
        if (r?.status === "ok" && r.data?.aqi > 0) {
          results.push({
            data: r.data,
            age: getDataAgeHours(r.data.time?.s || r.data.time?.iso)
          });
        }
      }
    }
  }

  if (results.length === 0) {
    console.warn("No AQI data found for:", cityName);
    return null;
  }

  // Pick the FRESHEST result
  results.sort((a, b) => a.age - b.age);
  const freshest = results[0];

  console.log(`AQI for ${cityName}:`, {
    aqi:      freshest.data.aqi,
    station:  freshest.data.city?.name,
    ageHours: freshest.age.toFixed(1),
    updatedAt: freshest.data.time?.s
  });

  return freshest.data;
};

export async function mapWAQIResultToAirQuality(waqiData: any, cityName: string, countryCode?: string) {
  if (!waqiData) return null;
  const aqiVal = waqiData.aqi;
  const iaqi = waqiData.iaqi || {};
  const pm2_5 = iaqi.pm25?.v;
  const pm10 = iaqi.pm10?.v;
  const no2 = iaqi.no2?.v;
  const so2 = iaqi.so2?.v;
  const o3 = iaqi.o3?.v;
  const co = iaqi.co?.v;

  const standard = getAQIStandard(cityName || '', countryCode || '');
  let finalAqi = aqiVal;
  
  if (standard === "IN" && (pm2_5 !== undefined || pm10 !== undefined)) {
    finalAqi = calculateIndianAQI(pm2_5, pm10);
  }

  const category = getAQICategory(finalAqi, standard);
  const updatedTime = waqiData.time?.iso || waqiData.time?.s || new Date().toISOString();
  const ageHrs = getDataAgeHours(waqiData.time?.s || waqiData.time?.iso);

  return {
    usAqi: finalAqi,
    description: category.label,
    color: category.color,
    recommendation: category.recommendation,
    standard,
    standardLabel: standard === "IN" ? "AQI · India (NAQI)" : "AQI · WAQI Standard",
    pm2_5,
    pm10,
    no2,
    so2,
    o3,
    co,
    lastUpdated: updatedTime,
    freshnessLabel: ageHrs > 6 ? `Stale (${Math.round(ageHrs)}h ago)` : "Live",
    isUnavailable: false,
    isStale: ageHrs > 6,
    historicalAqi: undefined as { time: string; aqi: number }[] | undefined,
  };
}

export async function getAQIDataWithFallback(lat: number, lon: number, cityName: string, countryCode?: string) {
  const token = import.meta.env.VITE_WAQI_TOKEN || "demo";
  const isDemo = token === "demo" || !import.meta.env.VITE_WAQI_TOKEN;
  
  if (!isDemo) {
    try {
      const waqiRaw = await fetchAQI(cityName, lat, lon);
      if (waqiRaw) {
        const parsed = await mapWAQIResultToAirQuality(waqiRaw, cityName, countryCode);
        if (parsed) {
          // Merge with OpenMeteo to fill in any missing or empty pollutant fields
          const openMeteoRaw = await fetchOpenMeteoAQI(lat, lon, cityName, countryCode);
          if (openMeteoRaw) {
            parsed.pm2_5 = parsed.pm2_5 !== undefined && parsed.pm2_5 !== null ? parsed.pm2_5 : openMeteoRaw.pm2_5;
            parsed.pm10 = parsed.pm10 !== undefined && parsed.pm10 !== null ? parsed.pm10 : openMeteoRaw.pm10;
            parsed.co = parsed.co !== undefined && parsed.co !== null ? parsed.co : openMeteoRaw.co;
            parsed.no2 = parsed.no2 !== undefined && parsed.no2 !== null ? parsed.no2 : openMeteoRaw.no2;
            parsed.o3 = parsed.o3 !== undefined && parsed.o3 !== null ? parsed.o3 : openMeteoRaw.o3;
            parsed.so2 = parsed.so2 !== undefined && parsed.so2 !== null ? parsed.so2 : openMeteoRaw.so2;
            parsed.historicalAqi = openMeteoRaw?.historicalAqi;
          }
          return parsed;
        }
      }
    } catch (err) {
      console.warn(`WAQI fetch failed for ${cityName}, falling back:`, err);
    }
  }
  
  console.log(`Using OpenMeteo AQI for ${cityName}`);
  const openMeteoRaw = await fetchOpenMeteoAQI(lat, lon, cityName, countryCode);
  if (openMeteoRaw) {
    return {
      usAqi: openMeteoRaw.aqi,
      description: openMeteoRaw.categoryLabel,
      color: openMeteoRaw.categoryColor,
      recommendation: openMeteoRaw.categoryRecommendation,
      standard: openMeteoRaw.standard,
      standardLabel: openMeteoRaw.standardLabel,
      pm2_5: openMeteoRaw.pm2_5,
      pm10: openMeteoRaw.pm10,
      co: openMeteoRaw.co,
      no2: openMeteoRaw.no2,
      o3: openMeteoRaw.o3,
      so2: openMeteoRaw.so2,
      lastUpdated: openMeteoRaw.time,
      freshnessLabel: openMeteoRaw.freshnessLabel,
      isUnavailable: openMeteoRaw.isUnavailable,
      isStale: openMeteoRaw.isStale,
      historicalAqi: openMeteoRaw.historicalAqi,
    };
  }
  return null;
}

export async function fetchOpenMeteoAQI(lat: number, lon: number, cityName?: string, countryCode?: string) {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,sulphur_dioxide,us_aqi` +
      `&hourly=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,sulphur_dioxide,us_aqi` +
      `&timezone=auto`;
      
    const res = await safeFetch(url);
    if (!res) {
      return null;
    }

    const current = res.current || {};
    const hourly = res.hourly || {};
    const timezone = res.timezone || 'UTC';

    // Locate the current hour index from the hourly array for scanning fallbacks
    const nowMs = Date.now();
    let currentIdx = -1;
    if (hourly.time && hourly.time.length > 0) {
      let minDiff = Infinity;
      for (let i = 0; i < hourly.time.length; i++) {
        const hTime = parseTimeToAbsoluteDate(hourly.time[i], timezone);
        const diff = Math.abs(hTime.getTime() - nowMs);
        if (diff < minDiff) {
          minDiff = diff;
          currentIdx = i;
        }
      }
    }

    // Helper: returns current value, else scans backward up to 6 hours in hourly array
    const getValWithFallback = (currentVal: any, hourlyKey: string): number | null => {
      if (currentVal !== undefined && currentVal !== null) {
        return currentVal;
      }
      if (currentIdx !== -1 && hourly[hourlyKey]) {
        for (let offset = 0; offset <= 6; offset++) {
          const checkIdx = currentIdx - offset;
          if (checkIdx >= 0 && checkIdx < hourly[hourlyKey].length) {
            const val = hourly[hourlyKey][checkIdx];
            if (val !== undefined && val !== null) {
              return val;
            }
          }
        }
      }
      return null;
    };

    const pm2_5 = getValWithFallback(current.pm2_5, 'pm2_5');
    const pm10 = getValWithFallback(current.pm10, 'pm10');
    const co = getValWithFallback(current.carbon_monoxide, 'carbon_monoxide');
    const no2 = getValWithFallback(current.nitrogen_dioxide, 'nitrogen_dioxide');
    const o3 = getValWithFallback(current.ozone, 'ozone');
    const so2 = getValWithFallback(current.sulphur_dioxide, 'sulphur_dioxide');
    const usAqiFromApi = getValWithFallback(current.us_aqi, 'us_aqi');

    const standard = getAQIStandard(cityName || '', countryCode || '');
    
    // Calibrate Open-Meteo raw atmospheric concentrations for Indian cities (global model heavily over-forecasts soil/desert dust levels compared to ground-level monitors)
    let pm2_5Calibrated = pm2_5;
    let pm10Calibrated = pm10;
    if (standard === "IN") {
      if (typeof pm2_5 === 'number' && pm2_5 !== null) pm2_5Calibrated = pm2_5 * 0.55;
      if (typeof pm10 === 'number' && pm10 !== null) pm10Calibrated = pm10 * 0.25;
    }

    let finalAqi = 0;

    if (standard === "IN") {
      finalAqi = calculateIndianAQI(pm2_5Calibrated ?? undefined, pm10Calibrated ?? undefined);
    } else {
      finalAqi = typeof usAqiFromApi === 'number' ? usAqiFromApi : 0;
    }

    const category = getAQICategory(finalAqi, standard);

    const historicalAqi: { time: string; aqi: number }[] = [];
    if (hourly.time && hourly.time.length > 0) {
      const refIdx = currentIdx !== -1 ? currentIdx : hourly.time.length - 1;
      let startIdx = refIdx - 23;
      let endIdx = refIdx;
      if (startIdx < 0) {
        startIdx = 0;
        endIdx = Math.min(23, hourly.time.length - 1);
      }

      for (let i = startIdx; i <= endIdx; i++) {
        const hTime = hourly.time[i];
        const hPm2_5 = hourly.pm2_5 ? hourly.pm2_5[i] : null;
        const hPm10 = hourly.pm10 ? hourly.pm10[i] : null;
        const hUsAqi = hourly.us_aqi ? hourly.us_aqi[i] : null;

        let hAqiVal = 0;
        if (standard === "IN") {
          const calPm2_5 = typeof hPm2_5 === 'number' && hPm2_5 !== null ? hPm2_5 * 0.55 : undefined;
          const calPm10 = typeof hPm10 === 'number' && hPm10 !== null ? hPm10 * 0.25 : undefined;
          hAqiVal = calculateIndianAQI(calPm2_5, calPm10);
        } else {
          hAqiVal = typeof hUsAqi === 'number' ? hUsAqi : 0;
        }

        historicalAqi.push({
          time: hTime,
          aqi: hAqiVal,
        });
      }
    }

    return {
      aqi: finalAqi,
      categoryLabel: category.label,
      categoryColor: category.color,
      categoryRecommendation: category.recommendation,
      standard,
      standardLabel: standard === "IN" ? "AQI · India (NAQI)" : "AQI · US Standard",
      time: current.time 
        ? parseTimeToAbsoluteDate(current.time, timezone).toISOString()
        : new Date().toISOString(),
      freshnessLabel: "Live",
      isStale: false,
      isUnavailable: false,
      pm10: pm10Calibrated,
      pm2_5: pm2_5Calibrated,
      co,
      no2,
      o3,
      so2,
      historicalAqi,
    };
  } catch (err) {
    console.warn('Open-Meteo AQI fetch failed:', err);
    return null;
  }
}

// --- Component Helper Engines ---

export function getWeatherInfo(code: number, isDay: boolean = true) {
  const mappings: Record<number, { label: string; icon: string }> = {
    0: { label: "Clear sky", icon: isDay ? "Sun" : "Moon" },
    1: { label: "Mainly clear", icon: isDay ? "CloudSun" : "CloudMoon" },
    2: { label: "Partly cloudy", icon: isDay ? "CloudSun" : "CloudMoon" },
    3: { label: "Overcast", icon: "Cloud" },
    45: { label: "Fog", icon: "CloudFog" },
    48: { label: "Depositing rime fog", icon: "CloudFog" },
    51: { label: "Drizzle (Light)", icon: "CloudDrizzle" },
    53: { label: "Drizzle (Moderate)", icon: "CloudDrizzle" },
    55: { label: "Drizzle (Dense)", icon: "CloudDrizzle" },
    56: { label: "Freezing Drizzle (Light)", icon: "CloudDrizzle" },
    57: { label: "Freezing Drizzle (Dense)", icon: "CloudDrizzle" },
    61: { label: "Rain (Slight)", icon: "CloudRain" },
    63: { label: "Rain (Moderate)", icon: "CloudRain" },
    65: { label: "Rain (Heavy)", icon: "CloudRainWind" },
    66: { label: "Freezing Rain (Light)", icon: "CloudRain" },
    67: { label: "Freezing Rain (Heavy)", icon: "CloudRainWind" },
    71: { label: "Snow fall (Slight)", icon: "CloudSnow" },
    73: { label: "Snow fall (Moderate)", icon: "CloudSnow" },
    75: { label: "Snow fall (Heavy)", icon: "Snowflake" },
    77: { label: "Snow grains", icon: "CloudSnow" },
    80: { label: "Rain showers (Slight)", icon: "CloudRain" },
    81: { label: "Rain showers (Moderate)", icon: "CloudRain" },
    82: { label: "Rain showers (Violent)", icon: "CloudRainWind" },
    85: { label: "Snow showers (Slight)", icon: "CloudSnow" },
    86: { label: "Snow showers (Heavy)", icon: "Snowflake" },
    95: { label: "Thunderstorm (Slight)", icon: "CloudLightning" },
    96: { label: "Thunderstorm (Moderate)", icon: "CloudLightning" },
    99: { label: "Thunderstorm (Heavy with hail)", icon: "Zap" },
  };

  if (mappings[code] !== undefined) {
    return mappings[code];
  }

  if (code >= 96) return { label: 'Thunderstorm (Heavy with hail)', icon: 'Zap' };
  if (code === 95) return { label: 'Thunderstorm', icon: 'CloudLightning' };
  if (code >= 85) return { label: 'Snow Showers', icon: 'CloudSnow' };
  if (code >= 80) return { label: 'Rain Showers', icon: 'CloudRainWind' };
  if (code >= 71) return { label: 'Snow', icon: 'Snowflake' };
  if (code >= 61) return { label: 'Rain', icon: 'CloudRain' };
  if (code >= 51) return { label: 'Drizzle', icon: 'CloudDrizzle' };
  if (code >= 45) return { label: 'Foggy', icon: 'CloudFog' };
  if (code === 3) return { label: 'Overcast', icon: 'Cloud' };
  if (code === 2) return { label: 'Partly Cloudy', icon: isDay ? 'CloudSun' : 'CloudMoon' };
  if (code === 1) return { label: 'Mainly Clear', icon: isDay ? 'Sun' : 'Moon' };
  if (code === 0) return { label: 'Clear Sky', icon: isDay ? 'Sun' : 'Moon' };

  return { label: 'Unknown', icon: 'Cloud' };
}

export function getLocalHourStartDates(timezone: string, count: number = 48): Date[] {
  try {
    const dates: Date[] = [];
    const now = new Date();
    
    const resolvedTZ = timezone === 'auto' ? undefined : timezone;
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: resolvedTZ,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      hourCycle: 'h23'
    });
    
    const parts = formatter.formatToParts(now);
    const getVal = (type: string) => {
      const p = parts.find(item => item.type === type);
      return p ? p.value : '0';
    };
    
    const year = parseInt(getVal('year'));
    const month = parseInt(getVal('month'));
    const day = parseInt(getVal('day'));
    const hour = parseInt(getVal('hour'));
    
    for (let i = 0; i < count; i++) {
      const tempLocal = new Date(Date.UTC(year, month - 1, day, hour + i, 0, 0));
      const targetYear = tempLocal.getUTCFullYear();
      const targetMonth = tempLocal.getUTCMonth() + 1;
      const targetDay = tempLocal.getUTCDate();
      const targetHour = tempLocal.getUTCHours();
      
      const absoluteDate = parseTimeToAbsoluteDate(
        `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}T${String(targetHour).padStart(2, '0')}:00:00`,
        timezone
      );
      dates.push(absoluteDate);
    }
    return dates;
  } catch (err) {
    console.warn("getLocalHourStartDates failed, falling back to local system hours", err);
    const dates: Date[] = [];
    const now = new Date();
    now.setMinutes(0, 0, 0);
    for (let i = 0; i < count; i++) {
      dates.push(new Date(now.getTime() + i * 3600 * 1000));
    }
    return dates;
  }
}

export function getClosestHourlyValue<T>(targetDate: Date, apiHourlyTimes: string[], apiValues: T[], timezone: string, fallback: T): T {
  if (!apiHourlyTimes || apiHourlyTimes.length === 0 || !apiValues || apiValues.length === 0) {
    return fallback;
  }
  
  let closestVal = apiValues[0];
  let minDiff = Infinity;
  for (let i = 0; i < apiHourlyTimes.length; i++) {
    const apiDate = parseTimeToAbsoluteDate(apiHourlyTimes[i], timezone);
    const diff = Math.abs(apiDate.getTime() - targetDate.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      closestVal = apiValues[i];
    }
  }
  return closestVal !== undefined ? closestVal : fallback;
}

export const getMoonPhaseInfo = (_phase?: number) => {
  const date = new Date();
  const knownNewMoon = new Date("2000-01-06");
  const lunarCycle = 29.53058867;
  const phase = (((date.getTime() - knownNewMoon.getTime()) / (1000 * 60 * 60 * 24)) / lunarCycle % 1 + 1) % 1;
  const illumination = Math.round((1 - Math.cos(2 * Math.PI * phase)) / 2 * 100);
  let label, icon: 'Moon' | 'MoonStar', emoji;
  if (phase < 0.03 || phase >= 0.97) { label = "New Moon"; emoji = "🌑"; icon = 'Moon'; }
  else if (phase < 0.22) { label = "Waxing Crescent"; emoji = "🌒"; icon = 'Moon'; }
  else if (phase < 0.28) { label = "First Quarter"; emoji = "🌓"; icon = 'Moon'; }
  else if (phase < 0.47) { label = "Waxing Gibbous"; emoji = "🌔"; icon = 'MoonStar'; }
  else if (phase < 0.53) { label = "Full Moon"; emoji = "🌕"; icon = 'MoonStar'; }
  else if (phase < 0.72) { label = "Waning Gibbous"; emoji = "🌖"; icon = 'MoonStar'; }
  else if (phase < 0.78) { label = "Last Quarter"; emoji = "🌗"; icon = 'Moon'; }
  else { label = "Waning Crescent"; emoji = "🌘"; icon = 'Moon'; }
  return { label, illumination, icon, emoji, phase };
};

export const getHourlyIcon = (precipProb: number, isNight: boolean) => {
  if (precipProb >= 70) return { label: 'Heavy Storm', icon: 'CloudLightning' };
  if (precipProb >= 50) return { label: 'Rain', icon: 'CloudRain' };
  if (precipProb >= 30) return { label: 'Light Rain', icon: 'CloudDrizzle' };
  if (precipProb >= 15) return { 
    label: 'Partly Cloudy', 
    icon: isNight ? 'Cloud' : 'CloudSun' 
  };
  return { 
    label: isNight ? 'Clear' : 'Clear Sky', 
    icon: isNight ? 'Moon' : 'Sun' 
  };
};

export const shouldShowPrecip = (precipProb: number) => {
  return precipProb >= 20;
};

export function getLocalDateString(date: Date, timeZone: string): string {
  try {
    const resolvedTZ = timeZone === 'auto' ? undefined : timeZone;
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: resolvedTZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const getVal = (type: string) => {
      const p = parts.find(item => item.type === type);
      return p ? p.value : '';
    };
    const yr = getVal('year');
    const mo = getVal('month');
    const dy = getVal('day');
    if (!yr || !mo || !dy) {
      throw new Error("Missing date parts");
    }
    return `${yr}-${mo}-${dy}`;
  } catch {
    return date.toISOString().split('T')[0];
  }
}

export function getCurrentWeatherState(weather: WeatherData) {
  if (!weather) {
    return {
      weatherCode: 0,
      isDay: true,
      label: 'Clear Sky',
      icon: 'Sun'
    };
  }

  const times = weather.hourly?.time || [];
  if (times.length === 0) {
    const isDayVal = weather.current?.isDay ?? true;
    const code = weather.current?.weatherCode ?? 0;
    const info = getWeatherInfo(code, isDayVal);
    return {
      weatherCode: code,
      isDay: isDayVal,
      label: info.label,
      icon: info.icon
    };
  }

  const nowIndex = getCurrentHourIndex(weather.timezone, times);
  const nowTimeStr = times[nowIndex];
  const itemTime = parseTimeToAbsoluteDate(nowTimeStr, weather.timezone);
  
  const localDateStr = getLocalDateString(itemTime, weather.timezone);
  const dayIdx = weather.daily?.time?.indexOf(localDateStr) ?? -1;
  let isDay = true;
  
  if (dayIdx !== -1) {
    const sunriseStr = weather.daily.sunrise?.[dayIdx];
    const sunsetStr = weather.daily.sunset?.[dayIdx];
    
    if (sunriseStr && sunsetStr) {
      const sunrise = parseTimeToAbsoluteDate(sunriseStr, weather.timezone);
      const sunset = parseTimeToAbsoluteDate(sunsetStr, weather.timezone);
      isDay = itemTime >= sunrise && itemTime < sunset;
    }
  } else {
    isDay = weather.current?.isDay ?? true;
  }

  const wcodes = weather.hourly.weathercode || weather.hourly.weatherCode || [];
  const code = wcodes[nowIndex] ?? weather.current?.weatherCode ?? 0;
  
  const info = getWeatherInfo(code, isDay);
  return {
    weatherCode: code,
    isDay,
    label: info.label,
    icon: info.icon
  };
}
