export const convertTemp = (celsius: number, unit: 'C' | 'F') => {
  if (unit === 'F') return (celsius * 9) / 5 + 32;
  return celsius;
};

export const formatTemp = (celsius: number, unit: 'C' | 'F') => {
  return Math.round(convertTemp(celsius, unit));
};

export const convertWind = (ms: number, unit: 'km/h' | 'mph' | 'm/s') => {
  switch (unit) {
    case 'km/h': return ms * 3.6;
    case 'mph': return ms * 2.23694;
    case 'm/s': return ms;
    default: return ms;
  }
};

export const formatWind = (ms: number, unit: 'km/h' | 'mph' | 'm/s') => {
  return Math.round(convertWind(ms, unit));
};

export const convertVisibility = (meters: number, unit: 'km' | 'miles') => {
  const km = meters / 1000;
  if (unit === 'miles') return km * 0.621371;
  return km;
};

export const formatVisibility = (meters: number, unit: 'km' | 'miles') => {
  const val = convertVisibility(meters, unit);
  if (unit === 'miles') {
    // 15 miles is the standard vertical/horizontal meteorological ceiling in Open-Meteo
    return Math.min(15, Math.round(val));
  } else {
    // 24 km is the standard metric meteorological ceiling for unlimited visibility
    if (val < 1) return val.toFixed(1);
    return Math.min(24, Math.round(val));
  }
};

export const convertPrecipitation = (mm: number, unit: 'mm' | 'in') => {
  if (unit === 'in') return mm * 0.0393701;
  return mm;
};

export const formatPrecipitation = (mm: number, unit: 'mm' | 'in') => {
  const val = convertPrecipitation(mm, unit);
  if (val === 0) return '0';
  if (val < 0.1) return '<0.1';
  return val.toFixed(1);
};

export const getTimeFormatPreference = (): '12h' | '24h' => {
  try {
    const s = localStorage.getItem('app_settings');
    if (s) {
      const parsed = JSON.parse(s);
      if (parsed.timeFormat === '24h') return '24h';
    }
  } catch (e) {
    console.warn("Failed to read time format preference from local storage", e);
  }
  return '12h';
};

export const formatGlobalTime = (
  dateInput: Date | string,
  options?: { hourOnly?: boolean; timeZone?: string; timeFormat?: '12h' | '24h' }
): string => {
  const formatPref = options?.timeFormat || getTimeFormatPreference();
  const rawDate = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  
  if (isNaN(rawDate.getTime())) {
    if (typeof dateInput === 'string') return dateInput;
    return '';
  }

  try {
    const is24h = formatPref === '24h';
    let fmtOptions: Intl.DateTimeFormatOptions;

    if (options?.hourOnly) {
      fmtOptions = is24h
        ? { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23' }
        : { hour: 'numeric', hour12: true };
    } else {
      fmtOptions = is24h
        ? { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23' }
        : { hour: 'numeric', minute: '2-digit', hour12: true };
    }

    if (options?.timeZone) {
      fmtOptions.timeZone = options.timeZone;
    }

    const formatted = new Intl.DateTimeFormat('en-US', fmtOptions).format(rawDate);
    return formatted.replace(/\u202f/g, ' ').trim();
  } catch (err) {
    console.warn("formatGlobalTime failed, falling back to local formatting", err);
    return rawDate.toTimeString().substring(0, 5);
  }
};
