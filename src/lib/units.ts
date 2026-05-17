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
  if (val < 1) return val.toFixed(1);
  return Math.round(val);
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
