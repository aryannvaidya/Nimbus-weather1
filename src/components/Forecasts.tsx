import React from 'react';
import { WeatherData, Settings } from '../types';
import { WeatherIcon } from './WeatherIcons';
import { getWeatherInfo, getHourlyIcon, shouldShowPrecip, getCurrentHourIndex, parseTimeToAbsoluteDate } from '../services/weatherService';
import { formatTemp } from '../lib/units';
import { motion } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { cn, GLASS_STYLE_SUBTLE } from '../lib/utils';

import { Haptic } from '../lib/haptics';

interface ForecastProps {
  weather: WeatherData;
  settings: Settings;
}

function formatLocalTime(date: Date, timeZone: string, type: 'hour' | 'time', timeFormat?: '12h' | '24h'): string {
  const is24h = timeFormat === '24h';
  try {
    const options: Intl.DateTimeFormatOptions = type === 'hour'
      ? (is24h ? { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23' } : { hour: 'numeric', hour12: true })
      : (is24h ? { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23' } : { hour: 'numeric', minute: '2-digit', hour12: true });
    const formatted = new Intl.DateTimeFormat('en-US', {
      ...options,
      timeZone: timeZone === 'auto' ? undefined : timeZone
    }).format(date);
    return formatted.replace(/\u202f/g, ' ').trim();
  } catch (err) {
    console.warn("formatLocalTime failed for timezone", timeZone, err);
    if (is24h) return format(date, 'HH:mm');
    return format(date, type === 'hour' ? 'h a' : 'h:mm a');
  }
}

function getLocalDateString(date: Date, timeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone === 'auto' ? undefined : timeZone,
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

function formatHourlyTimeFromISO(timeVal: string | Date, timeZone: string, timeFormat?: '12h' | '24h'): string {
  try {
    const parsedDate = typeof timeVal === 'string' ? parseTimeToAbsoluteDate(timeVal, timeZone) : timeVal;
    const is24h = timeFormat === '24h';
    const options: Intl.DateTimeFormatOptions = is24h
      ? { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23' }
      : { hour: 'numeric', hour12: true };
    const formatted = new Intl.DateTimeFormat('en-US', {
      ...options,
      timeZone: timeZone === 'auto' ? undefined : timeZone
    }).format(parsedDate);
    return formatted.replace(/\u202f/g, ' ').trim();
  } catch {
    return typeof timeVal === 'string' ? timeVal : timeVal.toLocaleTimeString();
  }
}

export function HourlyForecast({ weather, settings }: ForecastProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const lastScrollPos = React.useRef(0);
  const scrollTimeoutRef = React.useRef<any>(null);

  React.useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (typeof window !== 'undefined') {
        (window as any).isScrollingHourly = false;
        (window as any).isInteractingWithHourly = false;
      }
    };
  }, []);

  if (!weather || !weather.hourly || !weather.daily) return null;

  const handleScroll = () => {
    if (typeof window !== 'undefined') {
      (window as any).isScrollingHourly = true;
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        (window as any).isScrollingHourly = false;
      }, 300);
    }

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
  
  const times = weather.hourly.time || [];
  const temps_2m = weather.hourly.temperature_2m || weather.hourly.temperature || [];
  const wcodes = weather.hourly.weathercode || weather.hourly.weatherCode || [];

  const rawHourly = times
    .map((time, i) => {
      if (!time) return null;
      const itemTime = parseTimeToAbsoluteDate(time, weather.timezone);
      
      // Determine if it's day or night for this specific hour in target timezone
      const localDateStr = getLocalDateString(itemTime, weather.timezone);
      const dayIdx = weather.daily.time.indexOf(localDateStr);
      let isDay = true;
      
      if (dayIdx !== -1) {
        const sunriseStr = weather.daily.sunrise?.[dayIdx];
        const sunsetStr = weather.daily.sunset?.[dayIdx];
        
        if (sunriseStr && sunsetStr) {
          const sunrise = parseTimeToAbsoluteDate(sunriseStr, weather.timezone);
          const sunset = parseTimeToAbsoluteDate(sunsetStr, weather.timezone);
          isDay = itemTime >= sunrise && itemTime < sunset;
        }
      }

      return {
        type: 'weather' as const,
        time: itemTime,
        rawTimeStr: time,
        temp: temps_2m[i] ?? 0,
        pop: weather.hourly.precipitationProbability?.[i] ?? 0,
        weatherCode: wcodes[i] ?? 0,
        isDay
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(hourIndex, hourIndex + 24);

  // Inject sunrise and sunset
  const hourlyData: any[] = [...rawHourly];
  
  // Find sunrise/sunset that fall within the viewable range using proper absolute date comparison
  weather.daily.time.forEach((_, i) => {
    const sunriseStr = weather.daily.sunrise?.[i];
    const sunsetStr = weather.daily.sunset?.[i];
    
    if (sunriseStr && sunsetStr) {
      const sunrise = parseTimeToAbsoluteDate(sunriseStr, weather.timezone);
      const sunset = parseTimeToAbsoluteDate(sunsetStr, weather.timezone);
      
      const firstHour = rawHourly[0]?.time;
      const lastHour = rawHourly[rawHourly.length - 1]?.time;
  
      if (firstHour && lastHour) {
        if (sunrise > firstHour && sunrise < lastHour) {
          hourlyData.push({ type: 'sunrise', time: sunrise });
        }
        if (sunset > firstHour && sunset < lastHour) {
          hourlyData.push({ type: 'sunset', time: sunset });
        }
      }
    }
  });

  // Sort strictly chronologically by UNIX timestamps
  hourlyData.sort((a, b) => a.time.getTime() - b.time.getTime());

  return (
    <div className="relative -mx-6 hourly-forecast">
      <div className="flex items-center justify-between px-6 mb-3">
        <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-app-text-dim">Hourly Forecast</span>
      </div>
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchStart={() => { if (typeof window !== 'undefined') (window as any).isInteractingWithHourly = true; }}
        onTouchEnd={() => { 
          if (typeof window !== 'undefined') {
            setTimeout(() => { (window as any).isInteractingWithHourly = false; }, 200);
          }
        }}
        onTouchCancel={() => { 
          if (typeof window !== 'undefined') {
            setTimeout(() => { (window as any).isInteractingWithHourly = false; }, 200);
          }
        }}
        onPointerDown={() => { if (typeof window !== 'undefined') (window as any).isInteractingWithHourly = true; }}
        onPointerUp={() => { 
          if (typeof window !== 'undefined') {
            setTimeout(() => { (window as any).isInteractingWithHourly = false; }, 200);
          }
        }}
        onPointerCancel={() => { 
          if (typeof window !== 'undefined') {
            setTimeout(() => { (window as any).isInteractingWithHourly = false; }, 200);
          }
        }}
        className="flex gap-3 overflow-x-auto no-scrollbar pb-4 px-6 snap-x snap-mandatory scroll-smooth will-change-transform"
      >
        {hourlyData.length > 0 ? hourlyData.map((item, i) => {
          if (item.type === 'sunrise' || item.type === 'sunset') {
            const isSunrise = item.type === 'sunrise';
            return (
              <motion.div
                key={`astro-${i}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03, duration: 0.4 }}
                className={cn(
                  "flex flex-col items-center justify-between min-w-[64px] h-[130px] py-4 px-1 snap-center gpu",
                  "rounded-[30px] border border-app-border bg-amber-500/5 backdrop-blur-3xl"
                )}
              >
                <span className="text-[11px] font-medium tracking-tight text-app-text-dim">
                  {formatLocalTime(item.time, weather.timezone, 'time', settings.timeFormat)}
                </span>
                
                <div className="flex flex-col items-center gap-1">
                  <WeatherIcon 
                    name={isSunrise ? "Sunrise" : "Sunset"} 
                    style={settings.iconStyle} 
                    className="w-7 h-7"
                    forceColoured={true}
                  />
                </div>

                <span className="text-[12px] font-bold text-app-text uppercase tracking-wider">
                  {isSunrise ? 'Sunrise' : 'Sunset'}
                </span>
              </motion.div>
            );
          }

          const isNow = i === 0 && item.type === 'weather';
          const info = getWeatherInfo(item.weatherCode, item.isDay);
          
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
                "text-[11px] font-medium tracking-tight whitespace-nowrap",
                isNow ? "text-app-text" : "text-app-text-dim"
              )}>
                {isNow ? 'Now' : formatHourlyTimeFromISO(item.rawTimeStr, weather.timezone, settings.timeFormat)}
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
  if (!weather || !weather.daily) return null;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between px-2 mb-3">
        <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-app-text-dim">7-Day Forecast</span>
        <Icons.ChevronRight className="w-4 h-4 text-app-text-dim/50" />
      </div>
      <div className={cn("flex flex-col gap-1 p-2", "bg-app-surface backdrop-blur-2xl border border-app-border rounded-[32px]")}>
        {(weather?.daily?.time || []).map((time, i) => {
          const info = getWeatherInfo(weather.daily.weatherCode?.[i] ?? 0);
          const date = parseISO(time);
          
          return (
            <div key={time} className="flex items-center justify-between px-3 py-4 last:border-none">
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
