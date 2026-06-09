import React from 'react';
import { WeatherData, Settings } from '../types';
import { RawIcons, WeatherIcon } from './WeatherIcons';
import { cn, GLASS_STYLE_SUBTLE } from '../lib/utils';
import { formatTemp, formatWind, formatVisibility, formatPrecipitation } from '../lib/units';
import { format, parseISO } from 'date-fns';
import { motion } from 'motion/react';
import { getCurrentHourIndex } from '../services/weatherService';

interface AQISparklineProps {
  trend?: { time: string; aqi: number }[];
  color: string;
  currentAqi?: number;
}

export function AQISparkline({ trend, color, currentAqi }: AQISparklineProps) {
  if (!trend || trend.length < 2) return null;
  
  let cleanTrend = trend.map(t => t.aqi);
  
  if (currentAqi !== undefined && cleanTrend.length > 0) {
    const originalLastVal = cleanTrend[cleanTrend.length - 1];
    if (originalLastVal !== currentAqi) {
      const scaleRatio = originalLastVal > 0 ? (currentAqi / originalLastVal) : 1;
      cleanTrend = cleanTrend.map((v, idx) => {
        if (idx === cleanTrend.length - 1) return currentAqi;
        return Math.max(0, Math.round(v * scaleRatio));
      });
    }
  }

  const minVal = Math.min(...cleanTrend);
  const maxVal = Math.max(...cleanTrend);
  const valRange = maxVal - minVal;
  const divisor = valRange === 0 ? 1 : valRange;

  const points = trend.map((item, i) => {
    const x = 6 + (i / (trend.length - 1)) * 488;
    const y = 70 - ((cleanTrend[i] - minVal) / divisor) * 55;
    return { x, y, aqi: cleanTrend[i], time: item.time };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} 80 L ${points[0].x.toFixed(1)} 80 Z`;

  const peakIdx = cleanTrend.indexOf(maxVal);
  const currentVal = points[points.length - 1];
  
  // Use a unique ID based on values to prevent multiple sparklines on same page from colliding
  const gradId = `spark-grad-${Math.round(points[0]?.y || 0)}-${points.length}`;

  return (
    <div className="flex flex-col gap-2 mt-2 pt-4 border-t border-app-border/30">
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.1em] text-app-text-dim/60">
        <span>24-Hour Trend</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-app-text-dim/30" />
            Min: <strong className="text-app-text font-bold">{minVal}</strong>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
            Max: <strong className="text-app-text font-semibold" style={{ color: color }}>{maxVal}</strong>
          </span>
        </div>
      </div>

      <div className="w-full mt-1">
        <div className="relative w-full h-14 overflow-visible">
          <svg 
            width="100%" 
            height="100%" 
            viewBox="0 0 500 80" 
            preserveAspectRatio="none" 
            className="overflow-visible"
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                <stop offset="100%" stopColor={color} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Sparkline Area Fill */}
            <path 
              d={areaPath} 
              fill={`url(#${gradId})`} 
              className="transition-all duration-500"
            />

            {/* Sparkline Line */}
            <path 
              d={linePath} 
              fill="none" 
              stroke={color} 
              strokeWidth="3" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              className="transition-all duration-500"
            />
          </svg>

          {/* Peak dot with glow effect as perfect circle */}
          {peakIdx !== -1 && peakIdx !== points.length - 1 && (
            <div 
              className="absolute pointer-events-none flex items-center justify-center -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${(points[peakIdx].x / 500) * 100}%`,
                top: `${(points[peakIdx].y / 80) * 100}%`,
                width: '14px',
                height: '14px'
              }}
            >
              {/* Pulsing ring */}
              <div 
                className="absolute w-5 h-5 rounded-full border border-current animate-pulse opacity-60" 
                style={{ color }} 
              />
              {/* Inner dot */}
              <div 
                className="w-2 h-2 rounded-full absolute bg-current" 
                style={{ color }} 
              />
            </div>
          )}

          {/* Current / Now node point as perfect circle */}
          {currentVal && (
            <div 
              className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${(currentVal.x / 500) * 100}%`,
                top: `${(currentVal.y / 80) * 100}%`,
                width: '13px',
                height: '13px'
              }}
            >
              <div 
                className="w-full h-full rounded-full bg-white border-[3.5px]" 
                style={{ borderColor: color }} 
              />
            </div>
          )}
        </div>

        {/* Axis labels */}
        <div className="flex justify-between text-[8.5px] font-black uppercase tracking-[0.1em] text-app-text-dim/40 pt-2 mt-1">
          <span>24h Ago</span>
          <span>Now</span>
        </div>
      </div>
    </div>
  );
}

interface WeatherDetailsProps {
  weather: WeatherData;
  settings: Settings;
}

export default function WeatherDetails({ weather, settings }: WeatherDetailsProps) {
  if (!weather || !weather.current) return null;
  const aqi = weather.airQuality;
  
  const currentIdx = getCurrentHourIndex(weather.timezone, weather.hourly?.time || []);
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

  // AQI Live Label calculations
  let liveLabelText = "LIVE";
  let liveLabelColor = "#4ade80";
  if (aqi && aqi.lastUpdated && !aqi.isUnavailable) {
    try {
      const cleanTime = aqi.lastUpdated.includes(' ') && !aqi.lastUpdated.includes('T') ? aqi.lastUpdated.replace(' ', 'T') : aqi.lastUpdated;
      const updated = new Date(cleanTime);
      const ageHours = (Date.now() - updated.getTime()) / (1000 * 60 * 60);
      if (ageHours > 1) {
        liveLabelText = `${Math.round(ageHours)}H AGO`;
        if (ageHours > 6) {
          liveLabelColor = "#f59e0b";
        } else {
          liveLabelColor = "#94a3b8";
        }
      } else {
        liveLabelText = "LIVE";
      }
    } catch {
      liveLabelText = "LIVE";
    }
  }

   // UV Index Calculations (past 6 hours, current, and upcoming 6 hours - 13 points total)
  const currentUv = Math.round(weather.current.uvIndex ?? 0);
  const uvHourly = weather.hourly.uvIndex || [];
  const uvTrendData: { time: string; uv: number }[] = [];
  
  for (let offset = -6; offset <= 6; offset++) {
    const targetIdx = currentIdx + offset;
    let indexToUse = targetIdx;
    if (indexToUse < 0) indexToUse = 0;
    if (indexToUse >= weather.hourly.time.length) {
      indexToUse = weather.hourly.time.length - 1;
    }
    uvTrendData.push({
      time: weather.hourly.time[indexToUse] || new Date().toISOString(),
      uv: offset === 0 ? (weather.current.uvIndex ?? uvHourly[indexToUse] ?? 0) : (uvHourly[indexToUse] ?? 0)
    });
  }

  const uvDesc = getUVDesc(currentUv);
  const uvColor = getUVColor(currentUv);

  const tiles = settings.enabledTiles || {
    aqi: true,
    uv: true,
    humidity: true,
    visibility: true,
    precipitation: true,
    wind: true
  };

  const activeDetails = details.filter(detail => {
    if (detail.label === 'Humidity' && !tiles.humidity) return false;
    if (detail.label === 'Visibility' && !tiles.visibility) return false;
    if (detail.label === 'Precipitation' && !tiles.precipitation) return false;
    if (detail.label === 'Wind Speed' && !tiles.wind) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6 px-0">
      {/* 1. Enhanced Compact AQI Card (Full Width) */}
      {tiles.aqi && (
        <div className="w-full bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[32px] py-5 px-6 flex flex-col gap-4 overflow-hidden shadow-2xl relative group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-app-text/5 flex items-center justify-center transition-transform group-hover:scale-110 duration-500 shrink-0">
                <WeatherIcon name="Wind" className="w-5 h-5" strokeWidth={2} forceColoured={true} />
              </div>
              <span className="text-[14px] font-bold text-app-text tracking-tight uppercase">AIR QUALITY</span>
            </div>
            {aqi && !aqi.isUnavailable && (
              <span className="text-[10px] font-black uppercase tracking-[0.1em] flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-app-text/[0.04] border border-app-border/40 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: liveLabelColor }} />
                <span style={{ color: liveLabelColor }}>{liveLabelText}</span>
              </span>
            )}
          </div>

          {!aqi ? (
            <div className="py-12 flex flex-col items-center gap-4 text-center">
               <div className="w-12 h-12 rounded-full border-2 border-dashed border-app-border animate-spin-slow flex items-center justify-center">
                  <WeatherIcon name="Info" className="w-5 h-5 text-app-text-dim/40" />
               </div>
               <div className="flex flex-col gap-1">
                  <span className="text-app-text font-bold text-base tracking-tight">AQI Data Unavailable</span>
                  <p className="text-app-text-dim text-xs max-w-[200px] leading-relaxed">
                    We couldn't reach the air quality station for this location right now.
                  </p>
               </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <span className="text-6xl font-[200] tracking-tighter text-app-text leading-none shrink-0">
                  {aqi.isUnavailable ? "--" : aqi.usAqi}
                </span>
                <div className="flex flex-col justify-center">
                  <span className="text-[18px] font-bold tracking-tight leading-none uppercase" style={{ color: aqi.isUnavailable ? 'inherit' : aqi.color }}>
                    {aqi.isUnavailable ? "Limited Data" : aqi.description}
                  </span>
                  <span className="text-[11px] font-black text-app-text-dim uppercase tracking-widest mt-1.5 leading-none">
                    {(aqi.standardLabel || 'AQI · US Standard').replace(/^AQI\s*[·•\-]\s*/i, '').toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-1">
                <div className="w-full h-[10px] rounded-full bg-app-text/5 relative overflow-hidden">
                  {/* Visual Gradient Track based on defined categories */}
                  <div className="absolute inset-0 bg-gradient-to-r from-[#32D74B] via-[#FFD60A] via-[#FF9F0A] via-[#FF453A] via-[#BF5AF2] to-[#8E3020] opacity-90" />
                  
                  {/* Indicator Thumb */}
                  <motion.div 
                    className="absolute top-0 w-4 h-full bg-app-text shadow-[0_0_15px_rgba(255,255,255,1)] border-x border-black/20 z-10"
                    style={{ borderRadius: '9999px' }}
                    initial={{ left: '0%', x: '0%' }}
                    animate={{ 
                      left: `${Math.min(100, (aqi.usAqi / 500) * 100)}%`,
                      x: `-${Math.min(100, (aqi.usAqi / 500) * 100)}%` 
                    }}
                    transition={{ duration: 1.8, ease: [0.34, 1.56, 0.64, 1] }}
                  />
                </div>
              </div>

              {/* 24-Hour Minimalist Sparkline Trend with Real-Time Scaling */}
              <AQISparkline trend={aqi.historicalAqi} color={aqi.isUnavailable ? "#94a3b8" : aqi.color} currentAqi={aqi.usAqi} />

              <div className="bg-app-text/[0.04] rounded-[24px] p-5 border border-app-border/50">
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-full bg-app-text/5 shrink-0 flex items-center justify-center">
                    <WeatherIcon name="Info" className="w-4 h-4 text-app-text/40" />
                  </div>
                  <p className="text-[14px] text-app-text/80 font-medium leading-[1.5] py-1">
                    {aqi.recommendation}
                  </p>
                </div>
                
                <div className="grid grid-cols-5 gap-3 pt-5 mt-5 border-t border-app-border/30">
                  {[
                    { label: 'PM2.5', value: aqi.pm2_5, unit: 'µg/m³' },
                    { label: 'PM10', value: aqi.pm10, unit: 'µg/m³' },
                    { label: 'CO', value: aqi.co, unit: 'µg/m³' },
                    { label: 'NO₂', value: aqi.no2, unit: 'µg/m³' },
                    { label: 'O₃', value: aqi.o3, unit: 'µg/m³' }
                  ].map((p, i) => (
                    <div key={i} className="flex flex-col gap-1.5">
                      <span className="text-[9px] font-black text-app-text-dim/50 uppercase tracking-[0.05em] truncate">{p.label}</span>
                      <div className="flex flex-col">
                        <span className="text-[16px] font-bold text-app-text tracking-tighter leading-none">{Math.round(p.value || 0)}</span>
                        <span className="text-[9px] text-app-text-dim/60 font-bold leading-tight mt-0.5">{p.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 2. Compact UV Index Card (Full Width) */}
      {tiles.uv && (
        <div className="w-full bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[32px] py-5 px-6 flex flex-col gap-4 overflow-hidden shadow-2xl relative group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-app-text/5 flex items-center justify-center transition-transform group-hover:scale-110 duration-500 shrink-0">
                <WeatherIcon name="Sun" className="w-5 h-5 text-[#ffd60a]" strokeWidth={2} forceColoured={true} />
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-[14px] font-bold text-app-text tracking-tight uppercase">UV Index</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-6xl font-[200] tracking-tighter text-app-text leading-none shrink-0">
              {currentUv}
            </span>
            <div className="flex flex-col justify-center">
              <span className="text-[18px] font-bold tracking-tight leading-none uppercase" style={{ color: uvColor }}>
                {uvDesc}
              </span>
              <span className="text-[11px] font-black text-app-text-dim uppercase tracking-widest mt-1.5 leading-none">
                Current Exposure
              </span>
            </div>
          </div>

          {/* 13-Point UV Index Sparkline (Past 6 hours, Current hour, Upcoming 6 hours) */}
          {uvTrendData && uvTrendData.length >= 2 ? (
            <div className="flex flex-col gap-2 mt-2 pt-4 border-t border-app-border/30">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.1em] text-app-text-dim/60">
                <span>12-Hour Trend</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-app-text-dim/30" />
                    Min: <strong className="text-app-text font-bold">{Math.min(...uvTrendData.map(t => t.uv))}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: uvColor }} />
                    Max: <strong className="text-app-text font-semibold" style={{ color: uvColor }}>{Math.max(...uvTrendData.map(t => t.uv))}</strong>
                  </span>
                </div>
              </div>

              <div className="w-full mt-1">
                <div className="relative w-full h-14 overflow-visible">
                  <svg 
                    width="100%" 
                    height="100%" 
                    viewBox="0 0 500 80" 
                    preserveAspectRatio="none" 
                    className="overflow-visible"
                  >
                    <defs>
                      <linearGradient id="uv-spark-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={uvColor} stopOpacity="0.25" />
                        <stop offset="100%" stopColor={uvColor} stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Area Fill */}
                    <path 
                      d={(() => {
                        const trendVals = uvTrendData.map(t => t.uv);
                        const minVal = Math.min(...trendVals);
                        const maxVal = Math.max(...trendVals);
                        const valRange = maxVal - minVal;
                        const divisor = valRange === 0 ? 1 : valRange;
                        const points = uvTrendData.map((item, i) => {
                          const x = 6 + (i / (uvTrendData.length - 1)) * 488;
                          const y = 70 - ((item.uv - minVal) / divisor) * 55;
                          return { x, y };
                        });
                        const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
                        return `${linePath} L ${points[points.length - 1].x.toFixed(1)} 80 L ${points[0].x.toFixed(1)} 80 Z`;
                      })()} 
                      fill="url(#uv-spark-grad)" 
                      className="transition-all duration-500"
                    />

                    {/* Sparkline Line */}
                    <path 
                      d={(() => {
                        const trendVals = uvTrendData.map(t => t.uv);
                        const minVal = Math.min(...trendVals);
                        const maxVal = Math.max(...trendVals);
                        const valRange = maxVal - minVal;
                        const divisor = valRange === 0 ? 1 : valRange;
                        const points = uvTrendData.map((item, i) => {
                          const x = 6 + (i / (uvTrendData.length - 1)) * 488;
                          const y = 70 - ((item.uv - minVal) / divisor) * 55;
                          return { x, y };
                        });
                        return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
                      })()} 
                      fill="none" 
                      stroke={uvColor} 
                      strokeWidth="3" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                      className="transition-all duration-500"
                    />

                  </svg>

                  {/* Current Node Point as perfect circle */}
                  {(() => {
                    const trendVals = uvTrendData.map(t => t.uv);
                    const minVal = Math.min(...trendVals);
                    const maxVal = Math.max(...trendVals);
                    const valRange = maxVal - minVal;
                    const divisor = valRange === 0 ? 1 : valRange;
                    const uvX = 6 + (6 / (uvTrendData.length - 1)) * 488;
                    const uvY = 70 - (((uvTrendData[6]?.uv ?? 0) - minVal) / divisor) * 55;
                    const pctX = (uvX / 500) * 100;
                    const pctY = (uvY / 80) * 100;
                    return (
                      <div 
                        className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 rounded-full w-3.5 h-3.5 bg-white border-[3.5px]"
                        style={{
                          left: `${pctX}%`,
                          top: `${pctY}%`,
                          borderColor: uvColor
                        }}
                      />
                    );
                  })()}
                </div>

                {/* Axis labels with middle label NOW */}
                <div className="flex justify-between text-[8.5px] font-black uppercase tracking-[0.1em] text-app-text-dim/40 pt-2 mt-1">
                  <span>6h Ago</span>
                  <span className="text-app-text-dim">Now</span>
                  <span>In 6h</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {activeDetails.length > 0 && (
        <div className="grid grid-cols-2 gap-5 w-full pb-6">
          {activeDetails.map((detail, i) => {
            const isFullWidth = activeDetails.length === 1 || (activeDetails.length === 3 && i === 2);
            return (
              <div 
                key={i} 
                className={cn(
                  "px-4 py-6 flex flex-col justify-between bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[28px] h-[140px] shadow-lg transition-all duration-300 hover:bg-app-text/[0.05]",
                  isFullWidth ? "col-span-2" : "col-span-1",
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
            );
          })}
        </div>
      )}
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

function getUVColor(index: number) {
  if (index <= 2) return '#32d74b';
  if (index <= 5) return '#ffd60a';
  if (index <= 7) return '#ff9f0a';
  if (index <= 10) return '#ff453a';
  return '#bf5af2';
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
