export interface Location {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
  admin2?: string;
  timezone: string;
  type?: string;
  featureCode?: string;
  isGeolocated?: boolean;
  isCurrentLocation?: boolean;
  icon?: string;
}

export interface WeatherData {
  current: {
    time: string;
    temperature: number;
    relativeHumidity: number;
    weatherCode: number;
    summaryCode?: number; // Today's daily weather code for summary
    windSpeed: number;
    windDirection: number;
    apparentTemperature: number;
    isDay: boolean;
    visibility: number;
    surfacePressure: number;
    precipitation: number;
    uvIndex: number;
  };
  hourly: {
    time: string[];
    temperature: number[];
    temperature_2m?: number[];
    weatherCode: number[];
    weathercode?: number[];
    precipitationProbability: number[];
    windDirection: number[];
    windSpeed?: number[];
    snowfall?: number[];
    precipitation?: number[];
    uvIndex?: number[];
  };
  daily: {
    time: string[];
    weatherCode: number[];
    temperatureMax: number[];
    temperatureMin: number[];
    sunrise: string[];
    sunset: string[];
    moonrise: string[];
    moonset: string[];
    uvIndex: number[];
    moonPhase: number[];
    precipitationSum: number[];
  };
  airQuality?: {
    usAqi: number;
    description: string;
    color: string;
    recommendation: string;
    lastUpdated?: string;
    freshnessLabel?: string;
    isStale?: boolean;
    isUnavailable?: boolean;
    standard?: 'IN' | 'US';
    standardLabel?: string;
    pm10?: number;
    pm2_5?: number;
    no2?: number;
    so2?: number;
    o3?: number;
    co?: number;
    historicalAqi?: { time: string; aqi: number }[];
  };
  fetchedAt: number; // local timestamp when data was fetched
  timezone: string;
}

export interface Settings {
  unitTemp: 'C' | 'F';
  unitWind: 'km/h' | 'mph' | 'm/s';
  unitPressure: 'mmHg' | 'hPa' | 'inHg' | 'mbar';
  unitVisibility: 'km' | 'miles';
  unitPrecipitation: 'mm' | 'inches';
  iconStyle: 'outline' | 'coloured';
  theme: 'black';
  hapticEnabled: boolean;
  notificationTime: string; // HH:mm
  rainThreshold: number; // probability percentage
  snowThreshold: number; // probability percentage
  stormThreshold: boolean; // boolean
  alertRain: boolean;
  alertSevere: boolean;
  alertTrip: boolean;
  alertDaily: boolean;
  alertRealtime: boolean;
  timeFormat?: '12h' | '24h';
  pushEnabled: boolean;
  alertMorningSummary: boolean;
  alertNightSummary: boolean;
  oneSignalPlayerId?: string;
  enabledTiles?: {
    aqi: boolean;
    uv: boolean;
    humidity: boolean;
    visibility: boolean;
    precipitation: boolean;
    wind: boolean;
  };
}

export interface WeatherState {
  locations: Location[];
  activeLocationIndex: number;
  weatherData: Record<number, WeatherData>; // keyed by location index in locations array
  loading: boolean;
  error: string | null;
  showSettings: boolean;
  settings: Settings;
}
