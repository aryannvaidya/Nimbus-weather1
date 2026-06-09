import React, { useEffect } from 'react';
import { motion, useInView, animate, useMotionValue, useTransform } from 'motion/react';
import { WeatherData, Settings } from '../types';
import { WeatherIcon, RawIcons } from './WeatherIcons';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { cn } from '../lib/utils';

interface SunPathProps {
  weather: WeatherData;
  settings: Settings;
}

const width = 350;
const height = 150; 
const horizonY = 90;
const curveHeight = 60; 
const startX = 60;
const endX = 290;
const centerX = (startX + endX) / 2;
const daylightControlY = horizonY - (2 * curveHeight);

const MoonriseIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="1.8" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={cn("text-blue-300", className)}
  >
    <path d="M2 21h20" />
    <path d="M10 7a5 5 0 0 0 5 5 5 5 0 1 1-5-5Z" />
    <path d="M18 12V4" />
    <path d="m15 7 3-3 3 3" />
  </svg>
);

const MoonsetIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="1.8" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={cn("text-blue-300", className)}
  >
    <path d="M2 21h20" />
    <path d="M10 7a5 5 0 0 0 5 5 5 5 0 1 1-5-5Z" />
    <path d="M18 4v8" />
    <path d="m15 9 3 3 3-3" />
  </svg>
);

export default function SunPath({ weather, settings }: SunPathProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: false, amount: 0.1 });
  
  // Local state to force re-renders for real-time sun movement
  const [, setTick] = React.useState(0);
  
  // Motion setup for smooth, path-aligned animation
  const motionProgress = useMotionValue(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const iconX = useTransform(motionProgress, (v) => 
    Math.pow(1 - v, 2) * startX + 2 * (1 - v) * v * centerX + Math.pow(v, 2) * endX
  );
  const iconY = useTransform(motionProgress, (v) => 
    Math.pow(1 - v, 2) * horizonY + 2 * (1 - v) * v * daylightControlY + Math.pow(v, 2) * horizonY
  );

  // BUG 1 FIX: Calculate current time in the target location's timezone
  const getNowInLocation = (timezone: string) => {
    try {
      const now = new Date();
      const resolvedTZ = timezone === 'auto' ? undefined : timezone;
      // Use toLocaleString to get the time in the target timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: resolvedTZ,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false
      });
      
      const parts = formatter.formatToParts(now);
      const partValues: Record<string, any> = {};
      parts.forEach(p => partValues[p.type] = p.value);
      
      const yr = parseInt(partValues.year);
      const mo = parseInt(partValues.month);
      const dy = parseInt(partValues.day);
      const hr = parseInt(partValues.hour);
      const mn = parseInt(partValues.minute);
      const sc = parseInt(partValues.second) || 0;
      
      if (isNaN(yr) || isNaN(mo) || isNaN(dy) || isNaN(hr) || isNaN(mn)) {
        throw new Error('Invalid date components');
      }
      // Construct a Date object that represents the local time in that city
      return new Date(yr, mo - 1, dy, hr, mn, sc);
    } catch (e) {
      console.warn('Timezone conversion failed, falling back to naive:', e);
      return new Date();
    }
  };

  const nowInLocation = getNowInLocation(weather?.timezone || "UTC");
  const currentHour = nowInLocation.getHours();
  const currentMinute = nowInLocation.getMinutes();
  const nowMinutes = currentHour * 60 + currentMinute;

  // Helper to get minutes from H:M format
  const getMinutesFromISO = (iso: string) => {
    if (!iso) return null;
    // Open-Meteo with timezone=auto returns "YYYY-MM-DDTHH:MM"
    const timePart = iso.split('T')[1] || iso;
    if (!timePart || !timePart.includes(':')) return null;
    const [h, m] = timePart.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  // Display formatting for labels using the target timezone
  const formatTime = (iso: string) => {
    if (!iso) return "";
    try {
      const date = parseISO(iso.includes('Z') ? iso : `${iso}:00Z`);
      const is24h = settings.timeFormat === '24h';
      return date.toLocaleTimeString("en-US", {
        timeZone: "UTC",
        hour: "2-digit",
        minute: "2-digit",
        hour12: !is24h,
        ...(is24h ? { hourCycle: 'h23' } : {})
      });
    } catch {
      return iso;
    }
  };

  const sunriseMinutes = getMinutesFromISO(weather?.daily?.sunrise?.[0] || "") || 360;
  const sunsetMinutes = getMinutesFromISO(weather?.daily?.sunset?.[0] || "") || 1080;
  const moonriseMinutes = getMinutesFromISO(weather?.daily?.moonrise?.[0] || "");
  const moonsetMinutes = getMinutesFromISO(weather?.daily?.moonset?.[0] || "");
  
  // Determine if it is Day or Night for the cycle
  const isNight = nowMinutes < sunriseMinutes || nowMinutes > sunsetMinutes;

  // Calculate active span for the current path (Day or Night)
  let activeStartMinutes: number;
  let activeEndMinutes: number;
  let cycleProgress: number;
  let cycleLabelStart: string;
  let cycleLabelEnd: string;
  let cycleStartName: string;
  let cycleEndName: string;

  if (!isNight) {
    // Day Cycle: Sunrise to Sunset
    activeStartMinutes = sunriseMinutes;
    activeEndMinutes = sunsetMinutes;
    cycleLabelStart = formatTime(weather?.daily?.sunrise?.[0] || "2026-05-19T06:00");
    cycleLabelEnd = formatTime(weather?.daily?.sunset?.[0] || "2026-05-19T18:00");
    cycleStartName = "Sunrise";
    cycleEndName = "Sunset";
  } else {
    // Night Cycle: Prefer actual Moonrise->Moonset if available, 
    // but fallback to a pure "Night" cycle (Sunset -> Sunrise next day) if moon data is missing
    if (moonriseMinutes !== null && moonsetMinutes !== null && moonriseMinutes !== moonsetMinutes) {
      activeStartMinutes = moonriseMinutes;
      activeEndMinutes = moonsetMinutes;
      cycleLabelStart = formatTime(weather?.daily?.moonrise?.[0] || "");
      cycleLabelEnd = formatTime(weather?.daily?.moonset?.[0] || "");
      cycleStartName = "Moonrise";
      cycleEndName = "Moonset";
    } else {
      // Fallback: Night is from Sunset to next Sunrise
      if (nowMinutes >= sunsetMinutes) {
        activeStartMinutes = sunsetMinutes;
        const tomorrowSunrise = getMinutesFromISO(weather?.daily?.sunrise?.[1] || "");
        activeEndMinutes = (tomorrowSunrise !== null) ? (tomorrowSunrise + 1440) : (sunriseMinutes + 1440);
        cycleLabelStart = formatTime(weather?.daily?.sunset?.[0] || "2026-05-19T18:00");
        cycleLabelEnd = weather?.daily?.sunrise?.[1] ? formatTime(weather.daily.sunrise[1]) : formatTime(weather?.daily?.sunrise?.[0] || "2026-05-19T06:00");
      } else {
        // After Midnight, before Sunrise
        activeStartMinutes = sunsetMinutes - 1440;
        activeEndMinutes = sunriseMinutes;
        cycleLabelStart = formatTime(weather?.daily?.sunset?.[0] || "2026-05-19T18:00");
        cycleLabelEnd = formatTime(weather?.daily?.sunrise?.[0] || "2026-05-19T06:00");
      }
      cycleStartName = "Sunset";
      cycleEndName = "Sunrise";
    }

    if (activeStartMinutes > activeEndMinutes) {
      if (nowMinutes >= activeStartMinutes) {
        activeEndMinutes += 1440;
      } else {
        activeStartMinutes -= 1440;
      }
    }
  }

  const cycleDuration = activeEndMinutes - activeStartMinutes;
  const cycleElapsed = nowMinutes - activeStartMinutes;
  
  cycleProgress = Math.max(0, Math.min(1, cycleElapsed / cycleDuration));
  const isIconVisible = cycleProgress > 0 && cycleProgress < 1;

  const troughHeight = curveHeight * 0.4;

  const daylightArch = `M ${startX} ${horizonY} Q ${centerX} ${daylightControlY} ${endX} ${horizonY}`;
  const leftTrough = `M 10 ${horizonY + troughHeight} Q 35 ${horizonY + troughHeight} ${startX} ${horizonY}`;
  const rightTrough = `M ${endX} ${horizonY} Q ${width - 35} ${horizonY + troughHeight} ${width - 10} ${horizonY + troughHeight}`;

  useEffect(() => {
    if (isInView) {
      animate(motionProgress, cycleProgress, { 
        duration: 2.5, 
        ease: [0.34, 1.56, 0.64, 1] 
      });
    }
  }, [isInView, cycleProgress, motionProgress]);

  return (
    <div ref={containerRef} className="w-full px-2 mt-8 mb-4 overflow-hidden relative">
      <div className="relative w-full h-[150px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible translate-x-0">
          <defs>
            {/* Day Gradient */}
            <linearGradient id="sunDayGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#9C27B0" /> 
              <stop offset="15%" stopColor="#FF3D00" />
              <stop offset="35%" stopColor="#FFD600" />
              <stop offset="50%" stopColor="#FFFFFF" />
              <stop offset="65%" stopColor="#FFD600" />
              <stop offset="85%" stopColor="#FF3D00" />
              <stop offset="100%" stopColor="#9C27B0" />
            </linearGradient>

            {/* Moon Gradient */}
            <linearGradient id="moonNightGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2D3B4E" /> 
              <stop offset="25%" stopColor="#B3E5FC" />
              <stop offset="50%" stopColor="#FFFFFF" />
              <stop offset="75%" stopColor="#B3E5FC" />
              <stop offset="100%" stopColor="#2D3B4E" />
            </linearGradient>

            <clipPath id="horizonClip">
              <rect x="-50" y="-50" width={width + 100} height={horizonY + 50} />
            </clipPath>

            <mask id="iconGap">
              <rect x="-50" y="-50" width={width + 100} height={height + 100} fill="white" />
              <motion.circle 
                cx={iconX}
                cy={iconY}
                animate={{ r: isIconVisible ? 18 : 0 }}
                fill="black" 
              />
            </mask>
          </defs>

          {/* Horizon Line */}
          <line 
            x1="0" y1={horizonY} x2={width} y2={horizonY} 
            stroke="var(--border-color)" 
            strokeWidth="1" 
            opacity="0.5"
          />

          {/* Troughs */}
          <path d={leftTrough} fill="none" stroke="var(--border-color)" strokeWidth="4.5" strokeLinecap="round" opacity="0.3" />
          <path d={rightTrough} fill="none" stroke="var(--border-color)" strokeWidth="4.5" strokeLinecap="round" opacity="0.3" />

          {/* Elements ABOVE horizon */}
          <g clipPath="url(#horizonClip)">
            <g mask="url(#iconGap)">
              {/* Future Path */}
              <path 
                d={daylightArch}
                fill="none" 
                stroke="white" 
                strokeWidth="4" 
                strokeLinecap="round"
                opacity="0.1"
              />

              {/* Active Path */}
              <motion.path 
                d={daylightArch}
                fill="none" 
                stroke={isNight ? "url(#moonNightGradient)" : "url(#sunDayGradient)"} 
                strokeWidth="5.5" 
                strokeLinecap="round"
                style={{ pathLength: motionProgress }}
              />
            </g>

            {/* Current Cycle Icon */}
            <motion.g
              style={{ x: iconX, y: iconY }}
              initial={{ opacity: 0, scale: 0 }}
              animate={isInView && isIconVisible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
              transition={{ duration: 0.5 }}
            >
              <foreignObject x="-14" y="-14" width="28" height="28">
                <div className="flex items-center justify-center w-full h-full">
                  {isNight ? (
                    <WeatherIcon 
                      name="Moon" 
                      className="w-7 h-7" 
                      style="coloured"
                      strokeWidth={1.8}
                      forceColoured={true}
                    />
                  ) : (
                    <WeatherIcon 
                      name="Sun" 
                      forceColoured={true} 
                      className="w-7 h-7" 
                      strokeWidth={2}
                    />
                  )}
                </div>
              </foreignObject>
            </motion.g>
          </g>

          {/* Labels */}
          <foreignObject x="0" y={horizonY + 30} width="85" height="24">
            <div className="flex items-center justify-end gap-1.5 text-app-text font-bold text-[11px] tracking-tight h-full select-none">
              <span>{cycleLabelStart}</span>
              {cycleStartName === 'Moonrise' && <MoonriseIcon className="w-3.5 h-3.5" />}
            </div>
          </foreignObject>

          <foreignObject x={endX - 25} y={horizonY + 30} width="85" height="24">
            <div className="flex items-center justify-start gap-1.5 text-app-text font-bold text-[11px] tracking-tight h-full select-none">
              {cycleEndName === 'Moonset' && <MoonsetIcon className="w-3.5 h-3.5" />}
              <span>{cycleLabelEnd}</span>
            </div>
          </foreignObject>
        </svg>
      </div>
    </div>
  );
}
