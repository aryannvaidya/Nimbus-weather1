import React from 'react';
import { WeatherData, Settings } from '../types';
import { WeatherIcon } from './WeatherIcons';
import { getWeatherInfo, getHourlyIcon, shouldShowPrecip, getCurrentHourIndex } from '../services/weatherService';
import { formatTemp } from '../lib/units';
import { motion } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { cn, GLASS_STYLE_SUBTLE } from '../lib/utils';

import { Haptic } from '../lib/haptics';

interface ForecastProps {
  weather: WeatherData;
  settings: Settings;
}

export function HourlyForecast({ weather, settings }: ForecastProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const lastScrollPos = React.useRef(0);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const current = scrollRef.current.scrollLeft;
    // Trigger haptic every 64px (width of one card)
    if (Math.abs(current - lastScrollPos.current) > 64) {
      Haptic.light(settings.hapticEnabled);
      lastScrollPos.current = current;
    }
  };
  // Get the city's current local time robustly using its timezone
  const hourIndex = getCurrentHourIndex(weather.timezone, weather.hourly.time);
  
  const hourlyData = (weather?.hourly?.time || [])
    .map((time, i) => {
      const itemTime = parseISO(time.includes('Z') ? time : `${time}:00Z`);
      
      // Determine if it's day or night for this specific hour
      const dateStr = time.split('T')[0];
      const dayIdx = weather.daily.time.indexOf(dateStr);
      let isDay = true;
      
      if (dayIdx !== -1) {
        const sunrise = parseISO(weather.daily.sunrise[dayIdx].includes('Z') ? weather.daily.sunrise[dayIdx] : `${weather.daily.sunrise[dayIdx]}:00Z`);
        const sunset = parseISO(weather.daily.sunset[dayIdx].includes('Z') ? weather.daily.sunset[dayIdx] : `${weather.daily.sunset[dayIdx]}:00Z`);
        isDay = itemTime >= sunrise && itemTime < sunset;
      }

      return {
        time: itemTime,
        temp: weather.hourly.temperature?.[i] ?? 0,
        pop: weather.hourly.precipitationProbability?.[i] ?? 0,
        isDay
      };
    })
    .slice(hourIndex, hourIndex + 24);

  return (
    <div className="relative -mx-6 hourly-forecast">
      <div className="flex items-center justify-between px-6 mb-3">
        <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-app-text-dim">Hourly Forecast</span>
      </div>
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-3 overflow-x-auto no-scrollbar pb-4 px-6 snap-x snap-mandatory scroll-smooth will-change-transform"
      >
        {hourlyData.length > 0 ? hourlyData.map((item, i) => {
          const info = getHourlyIcon(item.pop, !item.isDay);
          const isNow = i === 0;
          
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03, duration: 0.4 }}
              className={cn(
                "flex flex-col items-center justify-between min-w-[64px] h-[130px] py-4 px-1 transition-all duration-300 snap-center gpu",
                "rounded-[30px] border border-app-border backdrop-blur-3xl",
                isNow ? "bg-app-text/10 border-app-text/20" : "bg-app-surface"
              )}
            >
              <span className={cn(
                "text-[11px] font-medium tracking-tight",
                isNow ? "text-app-text" : "text-app-text-dim"
              )}>
                {isNow ? 'Now' : (isNaN(item.time.getTime()) ? '--' : item.time.toLocaleTimeString("en-US", {
                  timeZone: "UTC",
                  hour: 'numeric',
                  hour12: true
                }))}
              </span>
              
              <div className="flex flex-col items-center gap-1">
                <WeatherIcon 
                  name={info.icon as any} 
                  style={settings.iconStyle} 
                  className="w-7 h-7"
                />
                {shouldShowPrecip(item.pop) && (
                  <span className="text-[9px] font-bold text-cyan-400/80 tracking-tighter">
                    {item.pop}%
                  </span>
                )}
              </div>

              <span className={cn(
                "text-[16px] font-light",
                isNow ? "font-medium text-app-text" : "text-app-text"
              )}>
                {formatTemp(item.temp, settings.unitTemp)}°
              </span>
            </motion.div>
          );
        }) : (
          <div className="w-full py-8 text-center bg-app-surface border border-app-border rounded-[30px] opacity-40">
            <span className="text-[10px] font-bold uppercase tracking-widest italic">No upcoming hourly data</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function DailyForecast({ weather, settings }: ForecastProps) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between px-2 mb-3">
        <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-app-text-dim">7-Day Forecast</span>
        <Icons.ChevronRight className="w-4 h-4 text-app-text-dim/50" />
      </div>
      <div className={cn("flex flex-col gap-1 p-2 gpu", "bg-app-surface backdrop-blur-2xl border border-app-border rounded-[32px]")}>
        {(weather?.daily?.time || []).map((time, i) => {
          const info = getWeatherInfo(weather.daily.weatherCode?.[i] ?? 0);
          const date = parseISO(time);
          
          return (
            <div key={i} className="flex items-center justify-between px-3 py-4 last:border-none">
              <span className="text-[15px] font-medium w-24 text-app-text">
                {i === 0 ? 'Today' : (isNaN(date.getTime()) ? '---' : format(date, 'EEEE'))}
              </span>
              <div className="flex items-center gap-2 flex-1 justify-center">
                <WeatherIcon 
                  name={info.icon as any} 
                  style={settings.iconStyle} 
                  className="w-6 h-6" 
                />
                <span className="text-[13px] text-app-text-dim hidden sm:inline-block truncate max-w-[100px]">{info.label}</span>
              </div>
              <div className="flex items-center gap-4 w-24 justify-end">
                <span className="text-[15px] font-semibold text-app-text">{formatTemp(weather.daily.temperatureMax?.[i] ?? 0, settings.unitTemp)}°</span>
                <span className="text-[15px] font-medium text-app-text-dim">{formatTemp(weather.daily.temperatureMin?.[i] ?? 0, settings.unitTemp)}°</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const Icons = {
  ChevronRight: (props: any) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>
};
