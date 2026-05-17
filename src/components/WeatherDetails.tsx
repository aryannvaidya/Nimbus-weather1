import React from 'react';
import { WeatherData, Settings } from '../types';
import { RawIcons, WeatherIcon } from './WeatherIcons';
import { cn, GLASS_STYLE_SUBTLE } from '../lib/utils';
import { formatTemp, formatWind, formatVisibility, formatPrecipitation } from '../lib/units';
import { format, parseISO } from 'date-fns';
import { motion } from 'motion/react';

interface WeatherDetailsProps {
  weather: WeatherData;
  settings: Settings;
}

export default function WeatherDetails({ weather, settings }: WeatherDetailsProps) {
  const aqi = weather.airQuality;
  
  const getCurrentIndex = () => {
    // Current time in the city's timezone
    const baseCityTime = parseISO(weather.current.time.includes('Z') ? weather.current.time : `${weather.current.time}:00Z`);
    const elapsedMs = Date.now() - weather.fetchedAt;
    const cityNow = new Date(baseCityTime.getTime() + elapsedMs);

    // Find the hourly index closest to the current time
    const index = weather.hourly.time.findIndex(t => {
      const time = parseISO(t.includes('Z') ? t : `${t}:00Z`);
      return time.getTime() >= cityNow.getTime() - 1800000; // Half hour grace
    });

    return index === -1 ? 0 : index;
  };

  const currentIdx = getCurrentIndex();
  const rainChance = weather.hourly.precipitationProbability?.[currentIdx] ?? 0;

  const details = [
    {
      label: 'Humidity',
      value: Math.round(weather.current.relativeHumidity || 0),
      unit: '%',
      icon: 'Droplets'
    },
    {
      label: 'Visibility',
      value: formatVisibility(weather.current.visibility || 0, settings.unitVisibility),
      unit: settings.unitVisibility === 'miles' ? 'mi' : 'km',
      icon: 'Eye'
    },
    {
      label: 'Precipitation',
      value: formatPrecipitation(weather?.daily?.precipitationSum?.[0] || 0, settings.unitPrecipitation as any),
      unit: settings.unitPrecipitation === 'inches' ? 'in' : 'mm',
      icon: 'CloudRain',
      desc: `Today • Chance: ${rainChance}%`,
      isPrecip: true
    },
    {
      label: 'Wind Speed',
      value: formatWind(weather.current.windSpeed || 0, settings.unitWind),
      unit: settings.unitWind,
      icon: 'Wind',
      desc: getWindDir(weather.current.windDirection || 0),
      isWind: true
    }
  ];

  return (
    <div className="flex flex-col gap-6 px-0">
      {/* 1. Robust AQI Card (Full Width) */}
      <div className="w-full bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[32px] pt-5 pb-6 px-6 flex flex-col gap-5 overflow-hidden shadow-2xl relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-app-text/5 flex items-center justify-center">
              <WeatherIcon name="Wind" className="w-4 h-4" strokeWidth={2} forceColoured={true} />
            </div>
            <span className="text-[12px] font-bold tracking-[0.1em] uppercase text-app-text-dim">Air Quality</span>
          </div>
          {aqi && (
            <div className="flex items-center gap-2">
              {(() => {
                const updatedTime = aqi.lastUpdated ? new Date(aqi.lastUpdated.replace(' ', 'T')) : null;
                const ageMinutes = updatedTime ? (Date.now() - updatedTime.getTime()) / 60000 : 0;
                if (ageMinutes > 120) {
                  return (
                    <div className="flex items-center gap-1.5 bg-orange-500/10 px-2.5 py-1 rounded-full border border-orange-500/20">
                      <span className="text-[9px] font-black text-orange-400 uppercase tracking-wider">
                        ⚠ Data from {Math.round(ageMinutes/60)}h ago
                      </span>
                    </div>
                  );
                }
                return (
                  <div className="flex items-center gap-1.5 bg-app-text/5 px-2.5 py-1 rounded-full border border-app-border">
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: aqi.color }} />
                    <span className="text-[10px] font-bold text-app-text-dim uppercase tracking-widest">Live</span>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {!aqi ? (
          <div className="py-8 flex flex-col items-center gap-3">
             <div className="w-10 h-10 rounded-full border-2 border-dashed border-app-border animate-spin-slow" />
             <span className="text-app-text-dim text-sm font-medium">AQI unavailable</span>
          </div>
        ) : (
          <>
            <div className="flex items-end justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-6xl font-[200] tracking-tighter text-app-text leading-none">
                  {aqi.usAqi}
                </span>
                <div className="flex flex-col mt-2">
                  <span className="text-[17px] font-semibold tracking-tight leading-tight" style={{ color: aqi.color }}>
                    {aqi.description}
                  </span>
                  {aqi.lastUpdated && (
                    <span className="text-[10px] text-app-text-dim/60 font-bold uppercase tracking-wider mt-1">
                      Updated: {(() => {
                        try {
                          const date = new Date(aqi.lastUpdated.replace(' ', 'T'));
                          // Using en-IN locale and Asia/Kolkata timezone as requested for reliable India-centric display if needed, 
                          // though native format with city timezone is usually preferred.
                          return date.toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true
                          });
                        } catch (e) {
                          return aqi.lastUpdated;
                        }
                      })()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-1">
              <div className="w-full h-[8px] rounded-full bg-app-text/5 relative overflow-hidden group">
                {/* Visual Gradient Track based on defined categories */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#32D74B] via-[#FFD60A] via-[#FF9F0A] via-[#FF453A] via-[#BF5AF2] to-[#8E3020]" />
                
                {/* Indicator Thumb */}
                <motion.div 
                  className="absolute top-0 w-3 h-full bg-app-text shadow-[0_0_10px_rgba(255,255,255,0.8)] border border-black/10 z-10"
                  style={{ borderRadius: '4px' }}
                  initial={{ left: '0%', x: '0%' }}
                  animate={{ 
                    left: `${Math.min(100, (aqi.usAqi / 500) * 100)}%`,
                    x: `-${Math.min(100, (aqi.usAqi / 500) * 100)}%` 
                  }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                />
              </div>
              <div className="flex justify-between px-0.5">
                 <span className="text-[9px] font-bold text-app-text-dim/40">0</span>
                 <span className="text-[9px] font-bold text-app-text-dim/40">500</span>
              </div>
            </div>

            <div className="bg-app-text/[0.03] rounded-2xl p-4 border border-app-border">
              <p className="text-[13px] text-app-text/70 font-medium leading-[1.4] mb-4">
                {aqi.recommendation}
              </p>
              
              <div className="grid grid-cols-5 gap-2 pt-4 border-t border-app-border">
                {[
                  { label: 'PM2.5', value: aqi.pm2_5, unit: 'µg/m³' },
                  { label: 'PM10', value: aqi.pm10, unit: 'µg/m³' },
                  { label: 'CO', value: aqi.co, unit: 'µg/m³' },
                  { label: 'NO₂', value: aqi.no2, unit: 'µg/m³' },
                  { label: 'O₃', value: aqi.o3, unit: 'µg/m³' }
                ].map((p, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <span className="text-[9px] font-black text-app-text-dim/40 uppercase tracking-tighter truncate">{p.label}</span>
                    <div className="flex flex-col">
                      <span className="text-[14px] font-semibold text-app-text">{Math.round(p.value || 0)}</span>
                      <span className="text-[8px] text-app-text-dim font-bold leading-none">{p.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-5 w-full pb-6">
        {details.map((detail, i) => (
          <div 
            key={i} 
            className={cn(
              "px-4 py-6 flex flex-col justify-between bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[28px] h-[140px] shadow-lg transition-all duration-300 hover:bg-app-text/[0.05]",
              ('isWind' in detail) && "py-5"
            )}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="shrink-0">
                <WeatherIcon 
                  name={detail.icon as any} 
                  className={cn(
                    "w-5 h-5",
                    settings.iconStyle === 'coloured' ? "" : "text-app-text"
                  )} 
                  strokeWidth={2.2} 
                  style={settings.iconStyle === 'coloured' ? 'coloured' : 'outline'} 
                />
              </div>
              <span className="text-[11px] font-bold uppercase text-app-text-dim break-all leading-none">
                {detail.label}
              </span>
            </div>
            
            <div className="flex items-center justify-between w-full">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-1.5 overflow-hidden">
                  <span className="text-[34px] font-medium tracking-tighter text-app-text leading-none">
                    {detail.value}
                  </span>
                  {detail.unit && (
                    <span className="text-[14px] font-bold text-app-text-dim tracking-tight">
                      {detail.unit}
                    </span>
                  )}
                </div>
                {('desc' in detail) && detail.desc && (
                  <span className="text-[11px] text-app-text-dim font-semibold tracking-tight truncate">
                    {detail.desc}
                  </span>
                )}
              </div>
              {'extra' in detail && detail.extra}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getAQIRecommendation(aqi: number) {
  if (aqi <= 50) return 'Ideal for outdoor activities and fresh air.';
  if (aqi <= 100) return 'Acceptable quality; sensitive groups should limit exertion.';
  if (aqi <= 150) return 'Reduce prolonged outdoor exertion; masks recommended.';
  if (aqi <= 200) return 'Avoid outdoor activities; everyone may experience health effects.';
  return 'Health warning: serious risks. Stay indoors with air filtration.';
}

function getUVDesc(index: number) {
  if (index <= 2) return 'Low risk';
  if (index <= 5) return 'Moderate risk';
  if (index <= 7) return 'High risk';
  if (index <= 10) return 'Very high risk';
  return 'Extreme risk';
}

function getWindBeaufort(speed: number) {
  // speed in m/s
  if (speed < 0.3) return 'Calm';
  if (speed < 1.6) return 'Light Air';
  if (speed < 3.4) return 'Light Breeze';
  if (speed < 5.5) return 'Gentle Breeze';
  if (speed < 8.0) return 'Mod Breeze';
  if (speed < 10.8) return 'Fresh Breeze';
  if (speed < 13.9) return 'Strong Breeze';
  if (speed < 17.2) return 'Near Gale';
  return 'Gale';
}

function getWindDir(item: number) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(item / 45) % 8];
}
