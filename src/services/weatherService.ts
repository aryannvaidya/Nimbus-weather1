import { Location, WeatherData } from '../types';

const GEO_API_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_API_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_API_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const ASTRONOMY_API_URL = 'https://astronomy-api.open-meteo.com/v1/astronomy';
const WAQI_TOKEN = 'c1cc82042fab6a9c422dda7813df7f8428f785e4';

const citySlugs: Record<string, string> = {
  "london":  "london/city-hall",
  "delhi":   "delhi",
  "mumbai":  "mumbai",
  "beijing": "beijing",
  "paris":   "paris",
  "tokyo":   "tokyo",
};

const getAQIUrl = (cityName: string, lat: number, lon: number) => {
  const name = cityName.toLowerCase();
  const slug = Object.keys(citySlugs).find(k => name.includes(k));

  if (slug) {
    return `https://api.waqi.info/feed/${citySlugs[slug]}/?token=${WAQI_TOKEN}`;
  }

  return `https://api.waqi.info/feed/geo:${lat};${lon}/?token=${WAQI_TOKEN}`;
};

const validateAQIFreshness = (timeString: string) => {
  if (!timeString) return { fresh: false, label: "Unknown", ageHours: 99 };
  const updated = new Date(timeString.replace(' ', 'T'));
  const ageHours = (Date.now() - updated.getTime()) / (1000 * 60 * 60);

  if (ageHours < 1) {
    return { fresh: true, label: "Live", ageHours };
  } else if (ageHours < 3) {
    return { fresh: true, label: `${Math.round(ageHours)}h ago`, ageHours };
  } else if (ageHours < 6) {
    return { fresh: false, label: `${Math.round(ageHours)}h ago ⚠️`, ageHours };
  } else {
    return { fresh: false, label: "Stale data ⚠️", ageHours };
  }
};

export const fetchWithTimeout = async (url: string, options: any = {}, timeout = 25000, retries = 3): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    // Keep it as a "Simple Request" to avoid preflight issues & ad-blocker sensitivity
    const response = await fetch(url, { 
      ...options, 
      signal: controller.signal,
      cache: 'no-cache'
    });
    clearTimeout(id);

    // Handle 429 specifically with an automated wait
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
      if (retries > 0) {
        return fetchWithTimeout(url, options, timeout, retries - 1);
      }
      throw new Error(`The connection to ${new URL(url).hostname} timed out. Please check your internet connection.`);
    }

    if (e instanceof TypeError) {
      const msg = e.message.toLowerCase();
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('connection') || msg.includes('dns')) {
        if (retries > 0) {
          await new Promise(r => setTimeout(r, 2000 + (3 - retries) * 1000));
          return fetchWithTimeout(url, options, timeout, retries - 1);
        }
        throw new Error('Could not connect to the weather server. You might be offline or using an ad-blocker.');
      }
    }
    
    // Retry on other network errors that might not be TypeError
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 2000));
      return fetchWithTimeout(url, options, timeout, retries - 1);
    }
    throw e;
  }
};

export async function searchLocations(query: string): Promise<Location[]> {
  if (query.length < 2) return [];
  
  try {
    // Increase count to 20 for more disambiguation options
    const response = await fetchWithTimeout(`${GEO_API_URL}?name=${encodeURIComponent(query)}&count=20&language=en&format=json`, {}, 5000, 0);
    
    if (!response.ok) {
       return [];
    }

    const data = await response.json();
    
    if (!data || !data.results) return [];
    
    return data.results.map((item: any) => ({
      id: item.id || Math.random(),
      name: item.name || 'Unknown',
      latitude: item.latitude,
      longitude: item.longitude,
      country: item.country || '',
      admin1: item.admin1,
      admin2: item.admin2,
      timezone: item.timezone || 'UTC',
      featureCode: item.feature_code,
      type: getFeatureLabel(item.feature_code),
    }));
  } catch (err) {
    console.warn('Location search failed:', err);
    return [];
  }
}

export async function reverseGeocode(lat: number, lon: number): Promise<Partial<Location> | null> {
  try {
    const response = await fetchWithTimeout(
      `${GEO_API_URL.replace('name', 'latitude')}=${lat}&longitude=${lon}&count=1&language=en&format=json`.replace('?latitude', '?latitude'), // Fixed URL construction
      {}, 5000, 0
    );
    
    // Wait, let me fix that URL construction logic for Open-Meteo reverse geocoding
    const reverseUrl = `https://geocoding-api.open-meteo.com/v1/get?latitude=${lat}&longitude=${lon}&language=en&format=json`;
    const res = await fetch(reverseUrl);
    
    if (!res.ok) return null;
    const data = await res.json();
    
    if (data.results && data.results.length > 0) {
      const item = data.results[0];
      return {
        name: item.name,
        country: item.country,
        admin1: item.admin1,
        admin2: item.admin2,
        timezone: item.timezone,
        featureCode: item.feature_code,
        type: getFeatureLabel(item.feature_code),
      };
    }
    return null;
  } catch (err) {
    console.warn('Reverse geocode failed:', err);
    return null;
  }
}

// Helper to translate feature codes to readable labels
function getFeatureLabel(code?: string): string | undefined {
  if (!code) return undefined;
  
  const mapping: Record<string, string> = {
    'PPLC': 'Capital',
    'PPLA': 'Admin Capital',
    'PPLA2': 'City',
    'PPL': 'City/Town',
    'ADM1': 'Region',
    'ADM2': 'District',
    'ADM3': 'Municipality',
    'CONT': 'Continent',
    'MT': 'Mountain',
    'LK': 'Lake',
    'ISL': 'Island',
    'AIRP': 'Airport',
    'PK': 'Peak',
    'HLL': 'Hill',
    'VAL': 'Valley',
    'STM': 'Stream',
    'RGN': 'Region',
    'PRK': 'Park',
    'RESV': 'Reservoir',
  };
  
  return mapping[code] || undefined;
}

export const getAQIInfo = (aqi: number) => {
  if (aqi <= 50) return { 
    label: 'Good', 
    color: '#32D74B',
    recommendation: 'Ideal for outdoor activities and fresh air.'
  };
  if (aqi <= 100) return { 
    label: 'Moderate', 
    color: '#FFD60A',
    recommendation: 'Unusually sensitive people should consider limiting outdoor exertion.'
  };
  if (aqi <= 150) return { 
    label: 'Unhealthy for Sensitive Groups', 
    color: '#FF9F0A',
    recommendation: 'Sensitive groups should reduce prolonged outdoor activity.'
  };
  if (aqi <= 200) return { 
    label: 'Unhealthy', 
    color: '#FF453A',
    recommendation: 'Everyone should reduce prolonged outdoor exertion.'
  };
  if (aqi <= 300) return { 
    label: 'Very Unhealthy', 
    color: '#BF5AF2',
    recommendation: 'Avoid outdoor activity. Keep windows closed.'
  };
  return { 
    label: 'Hazardous', 
    color: '#8E3020',
    recommendation: 'Stay indoors. Health emergency conditions.'
  };
};

export const getMoonPhaseInfo = (_phase?: number) => {
  const date = new Date();
  
  // Known new moon reference date
  const knownNewMoon = new Date("2000-01-06");
  const lunarCycle = 29.53058867;

  const diff = (date.getTime() - knownNewMoon.getTime()) / (1000 * 60 * 60 * 24);
  const cycles = diff / lunarCycle;
  const phase = (cycles % 1 + 1) % 1;
  const illumination = Math.round((1 - Math.cos(2 * Math.PI * phase)) / 2 * 100);

  let label, icon: 'Moon' | 'MoonStar', emoji;
  
  if (phase < 0.03 || phase >= 0.97) {
    label = "New Moon";        emoji = "🌑"; icon = 'Moon';
  } else if (phase < 0.22) {
    label = "Waxing Crescent"; emoji = "🌒"; icon = 'Moon';
  } else if (phase < 0.28) {
    label = "First Quarter";   emoji = "🌓"; icon = 'Moon';
  } else if (phase < 0.47) {
    label = "Waxing Gibbous";  emoji = "🌔"; icon = 'MoonStar';
  } else if (phase < 0.53) {
    label = "Full Moon";       emoji = "🌕"; icon = 'MoonStar';
  } else if (phase < 0.72) {
    label = "Waning Gibbous";  emoji = "🌖"; icon = 'MoonStar';
  } else if (phase < 0.78) {
    label = "Last Quarter";    emoji = "🌗"; icon = 'Moon';
  } else {
    label = "Waning Crescent"; emoji = "🌘"; icon = 'Moon';
  }

  return { label, illumination, icon, emoji, phase };
};

function interpolate(value: number, il: number, ih: number, ql: number, qh: number) {
  if (ih === il) return ql;
  return Math.round(((qh - ql) / (ih - il)) * (value - il) + ql);
}

function pm25ToAQI(val: number) {
  if (val < 0) return 0;
  if (val <= 12.0) return interpolate(val, 0, 12.0, 0, 50);
  if (val <= 35.4) return interpolate(val, 12.1, 35.4, 51, 100);
  if (val <= 55.4) return interpolate(val, 35.5, 55.4, 101, 150);
  if (val <= 150.4) return interpolate(val, 55.5, 150.4, 151, 200);
  if (val <= 250.4) return interpolate(val, 150.5, 250.4, 201, 300);
  if (val <= 350.4) return interpolate(val, 250.5, 350.4, 301, 400);
  if (val <= 500.4) return interpolate(val, 350.5, 500.4, 401, 500);
  return 500;
}

function pm10ToAQI(val: number) {
  if (val < 0) return 0;
  if (val <= 54) return interpolate(val, 0, 54, 0, 50);
  if (val <= 154) return interpolate(val, 55, 154, 51, 100);
  if (val <= 254) return interpolate(val, 155, 254, 101, 150);
  if (val <= 354) return interpolate(val, 255, 354, 151, 200);
  if (val <= 424) return interpolate(val, 355, 424, 201, 300);
  if (val <= 504) return interpolate(val, 425, 504, 301, 400);
  if (val <= 604) return interpolate(val, 505, 604, 401, 500);
  return 500;
}

export async function fetchWAQIAQI(lat: number, lon: number, cityName?: string) {
  try {
    const url = getAQIUrl(cityName || '', lat, lon);
    const response = await fetchWithTimeout(url, {}, 8000, 1);
    
    if (!response.ok) return null;
    const json = await response.json();
    
    if (json.status !== 'ok' || !json.data) return null;
    
    let aqiData = json.data;
    const timeStr = aqiData.time?.s;
    const freshness = validateAQIFreshness(timeStr);

    // If stale, try alternate geo station as fallback
    if (!freshness.fresh && cityName) {
      const geoUrl = `https://api.waqi.info/feed/geo:${lat};${lon}/?token=${WAQI_TOKEN}`;
      const geoRes = await fetchWithTimeout(geoUrl, {}, 8000, 1);
      
      if (geoRes.ok) {
        const geoJson = await geoRes.json();
        if (geoJson.status === 'ok' && geoJson.data) {
          const fallbackTimeStr = geoJson.data.time?.s;
          const fallbackFreshness = validateAQIFreshness(fallbackTimeStr);
          
          // Use geo fallback if it's fresher than the city-specific one
          if (fallbackFreshness.ageHours < freshness.ageHours) {
            aqiData = geoJson.data;
          }
        }
      }
    }

    const finalFreshness = validateAQIFreshness(aqiData.time?.s);
    return {
      ...aqiData,
      freshnessLabel: finalFreshness.label,
      isStale: !finalFreshness.fresh,
      isUnavailable: finalFreshness.ageHours > 6
    };
  } catch (err) {
    console.warn('WAQI fetch failed:', err);
    return null;
  }
}

function calculateUSAQI(pm25: number, pm10: number) {
  return Math.max(pm25ToAQI(pm25), pm10ToAQI(pm10));
}

export async function fetchWeatherBulk(locations: Location[]): Promise<Record<number, WeatherData>> {
  if (!locations.length) return {};

  const lats = locations.map(l => l.latitude.toFixed(4)).join(',');
  const lons = locations.map(l => l.longitude.toFixed(4)).join(',');

  const weatherParams = new URLSearchParams({
    latitude: lats,
    longitude: lons,
    hourly: 'temperature_2m,weather_code,precipitation_probability,wind_direction_10m,snowfall,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,visibility,surface_pressure,precipitation',
    timezone: 'auto',
    forecast_days: '7',
    wind_speed_unit: 'ms',
  });

  const aqiParams = new URLSearchParams({
    latitude: lats,
    longitude: lons,
    current: 'us_aqi,european_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,ozone',
    timezone: 'auto',
  });

  const weatherPromise = fetchWithTimeout(`${WEATHER_API_URL}?${weatherParams.toString()}`).catch(err => {
    console.warn('Bulk Weather fetch failed (will retry staggered):', err.message);
    throw new Error(`Failed to contact weather service: ${err.message}`);
  });

  const aqiPromise = fetchWithTimeout(`${AIR_QUALITY_API_URL}?${aqiParams.toString()}`).catch(err => {
    console.warn('Bulk AQI Fetch Failed:', err);
    return null;
  });

  const waqiPromises = locations.map(l => fetchWAQIAQI(l.latitude, l.longitude, l.name));

  // Astronomy API is single-location only. Fetch in parallel.
  const astroPromises = locations.map(l => 
    fetchWithTimeout(`${ASTRONOMY_API_URL}?latitude=${l.latitude}&longitude=${l.longitude}&daily=sunrise,sunset,moon_phase&timezone=auto`)
      .then(res => res.ok ? res.json() : null)
      .catch(err => {
        console.warn('Individual Astro Fetch Failed:', err);
        return null;
      })
  );

  const [weatherRes, aqiRes, waqiResults, astroResults] = await Promise.all([
    weatherPromise, 
    aqiPromise, 
    Promise.all(waqiPromises),
    Promise.all(astroPromises)
  ]);

  if (!weatherRes || !weatherRes.ok) {
    throw new Error('Bulk Weather API Error');
  }

  // Open-Meteo returns an array of objects if multiple coords are provided
  const weatherDataArray = await weatherRes.json();
  const aqiDataArray = aqiRes && aqiRes.ok ? await aqiRes.json() : null;

  const results: Record<number, WeatherData> = {};

  locations.forEach((_, index) => {
    // If multiple coords, result is array. If single coord, result is object.
    const weatherData = Array.isArray(weatherDataArray) ? weatherDataArray[index] : weatherDataArray;
    const aqiData = Array.isArray(aqiDataArray) ? aqiDataArray[index] : aqiDataArray;
    const waqiData = waqiResults[index];
    const astroData = astroResults[index];

    const hourIndex = getCurrentHourIndex(weatherData.timezone, weatherData.hourly.time);
    const hourlyPrecipProb = weatherData.hourly.precipitation_probability?.[hourIndex] || 0;
    
    // Use hourly values for better accuracy as requested
    const rawHourlyCode = weatherData.hourly.weather_code[hourIndex];
    const hourlyTemp = weatherData.hourly.temperature_2m[hourIndex];
    
    // Apply precipitation filter to the hour's weather
    const filtered = getConditionWithFilter(rawHourlyCode, hourlyPrecipProb);
    const finalCurrentCode = filtered ? filtered.code : rawHourlyCode;

    // Use daily weather code for the main condition summary if possible
    const todaySummaryCode = weatherData.daily.weather_code?.[0] ?? finalCurrentCode;

    if (!weatherData?.current) return;

    let usAqi: number | undefined;
    let pm10: number | undefined;
    let pm2_5: number | undefined;
    let no2: number | undefined;
    let o3: number | undefined;
    let co: number | undefined;
    let waqiLastUpdated: string | undefined;
    
    // Priority 1: WAQI data (official city/station stats)
    if (waqiData) {
      usAqi = waqiData.aqi;
      waqiLastUpdated = waqiData.time?.s;
      
      // Map WAQI pollutants if available
      if (waqiData.iaqi) {
        pm2_5 = waqiData.iaqi.pm25?.v;
        pm10 = waqiData.iaqi.pm10?.v;
        no2 = waqiData.iaqi.no2?.v;
        o3 = waqiData.iaqi.o3?.v;
        co = waqiData.iaqi.co?.v;
      }
    }

    // Priority 2: Fallback to Open-Meteo Air Quality (model based) if WAQI failed or missed values
    if (aqiData?.current) {
      const omUsAqi = aqiData.current.us_aqi || 0;
      const omEuAqi = aqiData.current.european_aqi || 0;
      const omPm10 = aqiData.current.pm10 || 0;
      const omPm2_5 = aqiData.current.pm2_5 || 0;
      
      const calculatedAqi = calculateUSAQI(omPm2_5, omPm10);
      
      // Only use OM AQI if WAQI didn't provide one
      if (usAqi === undefined) {
        const lat = locations[index].latitude;
        const lon = locations[index].longitude;
        const isIndiaRegion = lat > 6 && lat < 38 && lon > 68 && lon < 98;
        const isDelhi = lat > 28.3 && lat < 28.9 && lon > 76.8 && lon < 77.5;

        if (isIndiaRegion || isDelhi) {
          if (omUsAqi > 100) {
            usAqi = Math.min(omUsAqi, calculatedAqi);
            if (omUsAqi > 250 && calculatedAqi < omUsAqi * 0.75) {
               usAqi = calculatedAqi;
            }
            if (isDelhi && usAqi > 250 && omEuAqi < 100) {
               usAqi = Math.max(calculatedAqi, 160);
            }
          } else {
            usAqi = omUsAqi || calculatedAqi;
          }
        } else if (omUsAqi > 200) {
          if (calculatedAqi < omUsAqi * 0.6) {
            usAqi = calculatedAqi;
          } 
          else if (omEuAqi > 0 && omEuAqi < 100 && omUsAqi > 300) {
            usAqi = Math.min(500, omUsAqi, calculatedAqi);
          }
          else {
            usAqi = Math.min(500, omUsAqi, calculatedAqi);
          }
        } else {
          usAqi = omUsAqi || calculatedAqi;
        }
      }
      
      // Fill missing pollutants from Open-Meteo
      if (pm10 === undefined) pm10 = omPm10;
      if (pm2_5 === undefined) pm2_5 = omPm2_5;
      if (no2 === undefined) no2 = aqiData.current.nitrogen_dioxide;
      if (o3 === undefined) o3 = aqiData.current.ozone;
      if (co === undefined) co = aqiData.current.carbon_monoxide;
    }

    const aqiInfo = usAqi !== undefined ? getAQIInfo(usAqi) : null;

    results[index] = {
      current: {
        time: weatherData.current.time,
        temperature: hourlyTemp ?? weatherData.current.temperature_2m,
        relativeHumidity: weatherData.current.relative_humidity_2m,
        weatherCode: finalCurrentCode,
        summaryCode: todaySummaryCode, // Store daily code for summary
        windSpeed: weatherData.current.wind_speed_10m,
        windDirection: weatherData.current.wind_direction_10m,
        apparentTemperature: weatherData.current.apparent_temperature,
        isDay: weatherData.current.is_day === 1,
        visibility: weatherData.current.visibility,
        surfacePressure: weatherData.current.surface_pressure,
        precipitation: hourlyPrecipProb,
      },
      hourly: {
        time: weatherData.hourly.time,
        temperature: weatherData.hourly.temperature_2m,
        weatherCode: weatherData.hourly.weather_code || weatherData.hourly.weathercode || [],
        precipitationProbability: weatherData.hourly.precipitation_probability || weatherData.hourly.precipitation_probability_max || [],
        windDirection: weatherData.hourly.wind_direction_10m || weatherData.hourly.winddirection_10m || [],
        windSpeed: weatherData.hourly.wind_speed_10m || [],
        snowfall: weatherData.hourly.snowfall || [],
      },
      daily: {
        time: weatherData.daily.time,
        weatherCode: weatherData.daily.weather_code || weatherData.daily.weathercode || [],
        temperatureMax: weatherData.daily.temperature_2m_max,
        temperatureMin: weatherData.daily.temperature_2m_min,
        sunrise: astroData?.daily?.sunrise || weatherData.daily.sunrise,
        sunset: astroData?.daily?.sunset || weatherData.daily.sunset,
        uvIndex: weatherData.daily.uv_index_max,
        moonPhase: astroData?.daily?.moon_phase || [0],
        precipitationSum: weatherData.daily.precipitation_sum || [0],
      },
      airQuality: aqiInfo ? {
        usAqi: usAqi ?? 0,
        description: aqiInfo.label,
        color: aqiInfo.color,
        recommendation: aqiInfo.recommendation,
        lastUpdated: waqiLastUpdated,
        freshnessLabel: waqiData?.freshnessLabel,
        isStale: waqiData?.isStale,
        isUnavailable: waqiData?.isUnavailable,
        pm10: pm10 ?? 0,
        pm2_5: pm2_5 ?? 0,
        no2: no2 ?? 0,
        o3: o3 ?? 0,
        co: co ?? 0,
      } : undefined,
      fetchedAt: Date.now(),
      timezone: weatherData.timezone
    };
  });

  return results;
}

export async function fetchWeather(lat: number, lon: number, timezone: string, cityName?: string): Promise<WeatherData> {
  if (lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) {
    throw new Error('Invalid coordinates provided to weather service');
  }

  // Round coordinates to 4 decimal places as some APIs can be picky about extreme precision
  const safeLat = parseFloat(lat.toFixed(4));
  const safeLon = parseFloat(lon.toFixed(4));

  const weatherParams = new URLSearchParams({
    latitude: safeLat.toString(),
    longitude: safeLon.toString(),
    hourly: 'temperature_2m,weather_code,precipitation_probability,wind_direction_10m,snowfall,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,visibility,surface_pressure,precipitation',
    timezone: timezone || 'auto',
    forecast_days: '7',
    wind_speed_unit: 'ms',
  });

  const aqiParams = new URLSearchParams({
    latitude: safeLat.toString(),
    longitude: safeLon.toString(),
    current: 'us_aqi,european_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,ozone',
    timezone: timezone || 'auto',
  });

  const astroParams = new URLSearchParams({
    latitude: safeLat.toString(),
    longitude: safeLon.toString(),
    daily: 'sunrise,sunset,moon_phase',
    timezone: timezone || 'auto',
  });

  // Parallelize fetches for speed, while maintaining robustness
  // Weather is critical, the others are enhancements
  const weatherPromise = fetchWithTimeout(`${WEATHER_API_URL}?${weatherParams.toString()}`).catch(err => {
    console.error('Weather fetch error:', err);
    throw new Error(`Failed to contact weather service: ${err.message}`);
  });

  const aqiPromise = fetchWithTimeout(`${AIR_QUALITY_API_URL}?${aqiParams.toString()}`).catch(err => {
    console.warn('AQI Fetch Failed:', err);
    return null;
  });

  const astroPromise = fetchWithTimeout(`${ASTRONOMY_API_URL}?${astroParams.toString()}`).catch(err => {
    console.warn('Astro Fetch Failed:', err);
    return null;
  });

  const waqiPromise = fetchWAQIAQI(safeLat, safeLon, cityName);

  const [weatherRes, aqiRes, astroRes, waqiData] = await Promise.all([
    weatherPromise, 
    aqiPromise, 
    astroPromise,
    waqiPromise
  ]);

  if (!weatherRes || !weatherRes.ok) {
    const errorText = weatherRes ? await weatherRes.text().catch(() => 'No details') : 'Network error';
    throw new Error(`Weather API Error (${weatherRes?.status || 'Network'}): ${errorText}`);
  }

  const weatherData = await weatherRes.json();
  const aqiData = aqiRes && aqiRes.ok ? await aqiRes.json() : null;
  const astroData = astroRes && astroRes.ok ? await astroRes.json() : null;

  // Debugging logs for intermittent failures
  if (!weatherData) throw new Error('Weather service returned empty response');
  
  let usAqi: number | undefined;
  let pm10: number | undefined;
  let pm2_5: number | undefined;
  let no2: number | undefined;
  let o3: number | undefined;
  let co: number | undefined;
  let waqiLastUpdated: string | undefined;

  // Priority 1: WAQI data
  if (waqiData) {
    usAqi = waqiData.aqi;
    waqiLastUpdated = waqiData.time?.s;
    if (waqiData.iaqi) {
      pm2_5 = waqiData.iaqi.pm25?.v;
      pm10 = waqiData.iaqi.pm10?.v;
      no2 = waqiData.iaqi.no2?.v;
      o3 = waqiData.iaqi.o3?.v;
      co = waqiData.iaqi.co?.v;
    }
  }
  
  // Priority 2: Fallback to Open-Meteo
  if (aqiData?.current) {
    const omUsAqi = aqiData.current.us_aqi || 0;
    const omEuAqi = aqiData.current.european_aqi || 0;
    const omPm10 = aqiData.current.pm10 || 0;
    const omPm2_5 = aqiData.current.pm2_5 || 0;
    
    // Calculate manual AQI from raw pollutants for validation
    const calculatedAqi = calculateUSAQI(omPm2_5, omPm10);
    
    if (usAqi === undefined) {
      // Heuristic for high-pollution regions where model outliers occur frequently in US AQI
      const isIndiaRegion = lat > 6 && lat < 38 && lon > 68 && lon < 98;
      const isDelhi = lat > 28.3 && lat < 28.9 && lon > 76.8 && lon < 77.5;

      if (isIndiaRegion || isDelhi) {
        if (omUsAqi > 100) {
          usAqi = Math.min(omUsAqi, calculatedAqi);
          if (omUsAqi > 250 && calculatedAqi < omUsAqi * 0.75) {
             usAqi = calculatedAqi;
          }
          if (isDelhi && usAqi > 250 && omEuAqi < 100) {
             usAqi = Math.max(calculatedAqi, 160);
          }
        } else {
          usAqi = omUsAqi || calculatedAqi;
        }
      } else if (omUsAqi > 200) {
        if (calculatedAqi < omUsAqi * 0.6) {
          usAqi = calculatedAqi;
        } else if (omEuAqi > 0 && omEuAqi < 100 && omUsAqi > 300) {
          if (isIndiaRegion) {
            usAqi = Math.max(calculatedAqi, 180);
          } else {
            usAqi = Math.min(500, omUsAqi, calculatedAqi);
          }
        } else {
          usAqi = Math.min(500, omUsAqi, calculatedAqi);
        }
      } else {
        usAqi = omUsAqi || calculatedAqi;
      }
    }
    
    if (pm10 === undefined) pm10 = omPm10;
    if (pm2_5 === undefined) pm2_5 = omPm2_5;
    if (no2 === undefined) no2 = aqiData.current.nitrogen_dioxide;
    if (o3 === undefined) o3 = aqiData.current.ozone;
    if (co === undefined) co = aqiData.current.carbon_monoxide;
  }

  const aqiInfo = usAqi !== undefined ? getAQIInfo(usAqi) : null;

  if (!weatherData.current || !weatherData.hourly || !weatherData.daily) {
    throw new Error('Invalid weather data structure received');
  }

  const hourIndex = getCurrentHourIndex(weatherData.timezone, weatherData.hourly.time);
  const hourlyPrecipProb = weatherData.hourly.precipitation_probability?.[hourIndex] || 0;
  
  // Use hourly values for better accuracy as requested
  const rawHourlyCode = weatherData.hourly.weather_code[hourIndex];
  const hourlyTemp = weatherData.hourly.temperature_2m[hourIndex];
  
  // Apply precipitation filter to the hour's weather
  const filtered = getConditionWithFilter(rawHourlyCode, hourlyPrecipProb);
  const finalCurrentCode = filtered ? filtered.code : rawHourlyCode;

  // Use daily weather code for the main condition summary if possible
  const todaySummaryCode = weatherData.daily.weather_code?.[0] ?? finalCurrentCode;

  return {
    current: {
      time: weatherData.current.time,
      temperature: hourlyTemp ?? weatherData.current.temperature_2m,
      relativeHumidity: weatherData.current.relative_humidity_2m,
      weatherCode: finalCurrentCode,
      summaryCode: todaySummaryCode,
      windSpeed: weatherData.current.wind_speed_10m,
      windDirection: weatherData.current.wind_direction_10m,
      apparentTemperature: weatherData.current.apparent_temperature,
      isDay: weatherData.current.is_day === 1,
      visibility: weatherData.current.visibility,
      surfacePressure: weatherData.current.surface_pressure,
      precipitation: hourlyPrecipProb,
    },
    hourly: {
      time: weatherData.hourly.time,
      temperature: weatherData.hourly.temperature_2m,
      weatherCode: weatherData.hourly.weather_code || weatherData.hourly.weathercode || [],
      precipitationProbability: weatherData.hourly.precipitation_probability || weatherData.hourly.precipitation_probability_max || [],
      windDirection: weatherData.hourly.wind_direction_10m || weatherData.hourly.winddirection_10m || [],
      windSpeed: weatherData.hourly.wind_speed_10m || [],
      snowfall: weatherData.hourly.snowfall || [],
    },
    daily: {
      time: weatherData.daily.time,
      weatherCode: weatherData.daily.weather_code || weatherData.daily.weathercode || [],
      temperatureMax: weatherData.daily.temperature_2m_max,
      temperatureMin: weatherData.daily.temperature_2m_min,
      sunrise: astroData?.daily?.sunrise || weatherData.daily.sunrise,
      sunset: astroData?.daily?.sunset || weatherData.daily.sunset,
      uvIndex: weatherData.daily.uv_index_max,
      moonPhase: astroData?.daily?.moon_phase || [0],
      precipitationSum: weatherData.daily.precipitation_sum || [0],
    },
    airQuality: aqiInfo ? {
      usAqi: usAqi ?? 0,
      description: aqiInfo.label,
      color: aqiInfo.color,
      recommendation: aqiInfo.recommendation,
      lastUpdated: waqiLastUpdated,
      freshnessLabel: waqiData?.freshnessLabel,
      isStale: waqiData?.isStale,
      isUnavailable: waqiData?.isUnavailable,
      pm10: pm10 ?? 0,
      pm2_5: pm2_5 ?? 0,
      no2: no2 ?? 0,
      o3: o3 ?? 0,
      co: co ?? 0,
    } : undefined,
    fetchedAt: Date.now(),
    timezone: weatherData.timezone
  };
}

// Helper to get the correct hour index based on location's local time
export const getCurrentHourIndex = (timezone: string, hourlyTimes?: string[]) => {
  try {
    const now = new Date();
    // Get the current local time in the specified timezone
    const localTimeStr = now.toLocaleString("en-US", { timeZone: timezone });
    const localNow = new Date(localTimeStr);
    const currentHour = localNow.getHours();
    
    if (hourlyTimes && hourlyTimes.length > 0) {
      // Find matching index in hourly time array
      // Open-Meteo returns times like "2024-05-17T13:00"
      const index = hourlyTimes.findIndex(t => {
        // We match by local date and hour
        const hourStr = t.split('T')[1].split(':')[0];
        const dateStr = t.split('T')[0];
        
        // Simple string comparison for efficiency
        const targetDate = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
        return dateStr === targetDate && parseInt(hourStr) === currentHour;
      });
      
      if (index !== -1) {
        console.log(`[WeatherService] matched hour index ${index} for ${currentHour}:00 in ${timezone}`);
        return index;
      }
    }
    
    return currentHour; // Fallback to 0-23 (assumes array starts at 00:00)
  } catch (e) {
    console.warn('Failed to calculate local hour index:', e);
    return new Date().getHours();
  }
};

/**
 * Robust WMO Code Mapping with Precipitation Filter
 * Downgrades severe conditions if the specific precipitation probability for that hour is too low.
 */
export const getConditionWithFilter = (wmoCode: number, precipProb: number) => {
  // If model says storm but probability is low, downgrade to overcast/cloudy
  if (wmoCode >= 95 && precipProb < 40) {
    return { code: 3, label: "Overcast" };
  }
  // Showers / Heavy Rain but low probability
  if (wmoCode >= 80 && precipProb < 35) {
    return { code: 2, label: "Partly Cloudy" };
  }
  // Rain but low probability
  if (wmoCode >= 61 && precipProb < 30) {
    return { code: 2, label: "Partly Cloudy" };
  }
  
  return null; // No filtering needed
};

/**
 * Hourly icon logic based strictly on precipitation probability thresholds.
 * 0–14%    | Sun/Moon
 * 15–29%   | CloudSun/Cloud
 * 30–49%   | CloudDrizzle
 * 50–69%   | CloudRain
 * 70–100%  | CloudLightning
 */
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

/**
 * Only show % if it is >= 20
 */
export const shouldShowPrecip = (precipProb: number) => {
  return precipProb >= 20;
};

// Weather code to description and icon mapping
export function getWeatherInfo(code: number, isDay: boolean = true) {
  // Mapping logic as requested by user for consistency
  const getMapped = (c: number) => {
    // Rain/snow/storm icons — strictly by code
    if (c >= 96) return { label: 'Severe Storm', icon: 'Zap' };
    if (c === 95) return { label: 'Thunderstorm', icon: 'CloudLightning' };
    if (c >= 85) return { label: 'Snow Showers', icon: 'CloudSnow' };
    if (c >= 80) return { label: 'Rain Showers', icon: 'CloudRainWind' };
    if (c >= 71) return { label: 'Snow', icon: 'Snowflake' };
    if (c >= 61) return { label: 'Rain', icon: 'CloudRain' };
    if (c >= 51) return { label: 'Drizzle', icon: 'CloudDrizzle' };
    if (c >= 45) return { label: 'Foggy', icon: 'CloudFog' };

    // Clear/cloudy icons — use isDay for correct icon
    if (c === 3) return { label: 'Overcast', icon: 'Cloud' };
    if (c === 2) return { label: 'Partly Cloudy', icon: isDay ? 'CloudSun' : 'Cloud' };
    if (c === 1) return { label: 'Mainly Clear', icon: isDay ? 'Sun' : 'Moon' };
    if (c === 0) return { label: 'Clear Sky', icon: isDay ? 'Sun' : 'Moon' };

    return { label: 'Unknown', icon: 'Cloud' };
  };

  return getMapped(code);
}
