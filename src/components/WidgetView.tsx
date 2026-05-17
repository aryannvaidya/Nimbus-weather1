import React from 'react';
import { motion } from 'motion/react';
import { WeatherData, Location, Settings } from '../types';
import { WeatherIcon, Icons } from './WeatherIcons';
import { getWeatherInfo } from '../services/weatherService';
import { formatTemp, formatWind } from '../lib/units';
import { cn } from '../lib/utils';
import { format, parseISO, isAfter, startOfHour } from 'date-fns';

interface WidgetViewProps {
  weather: WeatherData;
  location: Location;
  settings: Settings;
  onRefresh?: () => void;
}

export default function WidgetView({ weather, location, settings, onRefresh }: WidgetViewProps) {
  const info = getWeatherInfo(weather.current.weatherCode, weather.current.isDay);

  // Dynamic color palette based on weather
  const getThemeColors = () => {
    const code = weather.current.weatherCode;
    const isDay = weather.current.isDay;

    if (!isDay) return {
      bg: 'from-slate-900/40 to-indigo-950/40',
      accent: 'bg-indigo-400',
      glow: 'bg-indigo-500/20'
    };

    if (code === 0 || code === 1) return { // Clear
      bg: 'from-orange-500/20 to-amber-600/30',
      accent: 'bg-amber-400',
      glow: 'bg-amber-500/20'
    };
    if (code === 2 || code === 3) return { // Cloudy
      bg: 'from-slate-400/20 to-slate-600/30',
      accent: 'bg-slate-300',
      glow: 'bg-slate-400/20'
    };
    if (code >= 51 && code <= 65) return { // Rain
      bg: 'from-blue-600/20 to-indigo-700/30',
      accent: 'bg-blue-400',
      glow: 'bg-blue-500/20'
    };
    if (code >= 71 && code <= 75) return { // Snow
      bg: 'from-cyan-100/10 to-blue-200/20',
      accent: 'bg-cyan-200',
      glow: 'bg-cyan-300/10'
    };
    if (code >= 95) return { // Storm
      bg: 'from-purple-900/30 to-slate-900/40',
      accent: 'bg-yellow-400',
      glow: 'bg-purple-500/20'
    };

    return {
      bg: 'from-blue-500/20 to-blue-600/30',
      accent: 'bg-blue-400',
      glow: 'bg-blue-500/20'
    };
  };

  const theme = getThemeColors();

  // Get next 5 hours of forecast starting from the city's current time
  const getHourlyIndices = () => {
    const baseCityTime = parseISO(weather.current.time.includes('Z') ? weather.current.time : `${weather.current.time}:00Z`);
    const elapsedMs = Date.now() - weather.fetchedAt;
    const cityNow = new Date(baseCityTime.getTime() + elapsedMs);
    const referenceTime = startOfHour(cityNow);

    return weather.hourly.time
      .map((t, i) => ({ 
        time: parseISO(t.includes('Z') ? t : `${t}:00Z`), 
        index: i 
      }))
      .filter(item => item.time.getTime() >= referenceTime.getTime())
      .slice(0, 5);
  };

  const hourlyIndices = getHourlyIndices();

  const currentIdx = weather.hourly.time.findIndex(t => {
    const time = parseISO(t.includes('Z') ? t : `${t}:00Z`);
    const baseCityTime = parseISO(weather.current.time.includes('Z') ? weather.current.time : `${weather.current.time}:00Z`);
    const elapsedMs = Date.now() - weather.fetchedAt;
    const cityNow = new Date(baseCityTime.getTime() + elapsedMs);
    return time.getTime() >= cityNow.getTime() - 1800000;
  });
  const rainChance = weather.hourly.precipitationProbability[currentIdx === -1 ? 0 : currentIdx] ?? 0;

  return (
    <div className={cn(
      "w-full max-w-[350px] aspect-square rounded-[40px] border border-white/10 p-6 flex flex-col justify-between relative overflow-hidden backdrop-blur-2xl shadow-2xl transition-all duration-700 bg-gradient-to-br",
      theme.bg
    )}>
      {/* Background Glow */}
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.1, 0.2, 0.1]
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className={cn("absolute -top-10 -right-10 w-48 h-48 blur-[60px] rounded-full", theme.glow)} 
      />
      
      <header className="flex justify-between items-start z-10">
        <div className="flex flex-col">
          <span className="text-[14px] font-bold text-white/50 uppercase tracking-[0.2em]">{location.name}</span>
          <span className="text-[12px] font-medium text-white/30">{info.label}</span>
        </div>
        <WeatherIcon 
          name={info.icon as any} 
          style="coloured" 
          className="w-10 h-10 drop-shadow-lg" 
        />
      </header>

      <div className="flex flex-col z-10 mt-1">
        <div className="flex items-start">
          <span className="text-[72px] leading-none font-[200] tracking-tighter text-white">
            {formatTemp(weather.current.temperature, settings.unitTemp)}
          </span>
          <span className="text-2xl font-light text-white/40 mt-2">°</span>
        </div>
        
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
            H: {formatTemp(weather.daily.temperatureMax?.[0] ?? 0, settings.unitTemp)}°
          </span>
          <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
            L: {formatTemp(weather.daily.temperatureMin?.[0] ?? 0, settings.unitTemp)}°
          </span>
        </div>
      </div>

      {/* Compact 5-hour Forecast - Replaced with Weather Condition "Graph" Bar */}
      <div className="flex flex-col gap-2 pt-4 mt-2 border-t border-white/5 z-10">
        <div className="flex items-center justify-between px-1">
          <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Next 5 Hours</span>
        </div>
        <div className="h-10 w-full flex items-center gap-1.5 px-0.5">
          {hourlyIndices.map((item) => {
            const itemTime = item.time;
            const dateStr = format(itemTime, 'yyyy-MM-dd');
            const dayIdx = weather.daily.time.indexOf(dateStr);
            let hIsDay = true;
            
            if (dayIdx !== -1) {
              const sunrise = parseISO(weather.daily.sunrise[dayIdx].includes('Z') ? weather.daily.sunrise[dayIdx] : `${weather.daily.sunrise[dayIdx]}:00Z`);
              const sunset = parseISO(weather.daily.sunset[dayIdx].includes('Z') ? weather.daily.sunset[dayIdx] : `${weather.daily.sunset[dayIdx]}:00Z`);
              hIsDay = itemTime >= sunrise && itemTime < sunset;
            }

            const hInfo = getWeatherInfo(weather.hourly.weatherCode[item.index], hIsDay);
            
            // Map weather codes to specific "condition colors" for the graph
            const getConditionColor = (code: number) => {
              if (code === 0 || code === 1) return 'bg-amber-400'; // Clear
              if (code === 2 || code === 3) return 'bg-slate-400'; // Cloudy
              if (code >= 51 && code <= 65) return 'bg-blue-400';  // Rain
              if (code >= 71 && code <= 75) return 'bg-cyan-300';  // Snow
              if (code >= 95) return 'bg-yellow-400';             // Storm
              return 'bg-blue-500';
            };

            return (
              <div key={item.index} className="flex-1 flex flex-col items-center gap-1 group">
                <WeatherIcon 
                  name={hInfo.icon as any} 
                  className="w-4 h-4 text-white/60 mb-0.5" 
                  strokeWidth={2}
                />
                <div className={cn(
                  "w-full h-1.5 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(255,255,255,0.1)]",
                  getConditionColor(weather.hourly.weatherCode[item.index])
                )} />
              </div>
            );
          })}
        </div>
      </div>

      <footer className="flex items-center justify-between pt-4 mt-2 border-t border-white/5 z-10">
        <div className="flex items-center gap-1.5">
          <Icons.Droplets className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[11px] font-bold text-white/40 tracking-tighter">{rainChance}%</span>
        </div>
        <div className="flex items-center gap-1.5" title="Wind Speed">
          <Icons.Wind className="w-3.5 h-3.5 text-sky-400" strokeWidth={2} />
          <span className="text-[11px] font-bold text-white/40 tracking-tighter">{formatWind(weather.current.windSpeed, settings.unitWind)} {settings.unitWind}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Icons.Sun className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[11px] font-bold text-white/40 tracking-tighter">UV {weather.daily.uvIndex[0]}</span>
        </div>
      </footer>
    </div>
  );
}
