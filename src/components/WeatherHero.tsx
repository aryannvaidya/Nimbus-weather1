import React from 'react';
import { WeatherData, Location, Settings } from '../types';
import { WeatherIcon, Icons } from './WeatherIcons';
import { getHourlyIcon, getMoonPhaseInfo } from '../services/weatherService';
import { formatTemp } from '../lib/units';
import { motion } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { RawIcons } from './WeatherIcons';
import { cn } from '../lib/utils';
import { Haptic } from '../lib/haptics';

interface WeatherHeroProps {
  weather: WeatherData;
  location: Location;
  settings: Settings;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function WeatherHero({ weather, location, settings, onRefresh, isRefreshing }: WeatherHeroProps) {
  const info = getHourlyIcon(weather.current.precipitation, !weather.current.isDay);
  const moonPhase = getMoonPhaseInfo(weather.daily.moonPhase?.[0] ?? 0);

  const formatDate = (dateStr: string) => {
    try {
      const d = parseISO(dateStr.includes('Z') ? dateStr : `${dateStr}:00Z`);
      return d.toLocaleDateString("en-US", {
        timeZone: "UTC",
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });
    } catch {
      return 'Today';
    }
  };

  const formatLastUpdated = (ts: number) => {
    const minutes = Math.floor((Date.now() - ts) / 60000);
    if (minutes < 1) return 'NOW';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  return (
    <div className="flex flex-col items-center text-center py-6">
      {/* Status Bar - Moon Phase & Last Updated */}
      <div className="flex items-center gap-2 mb-4">
        <motion.div 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2 bg-app-surface py-1.5 px-3 rounded-full border border-app-border"
        >
          <span className="text-[10px] uppercase font-bold tracking-widest text-app-text-dim whitespace-nowrap">
            {moonPhase.emoji} {moonPhase.label} • {moonPhase.illumination}%
          </span>
        </motion.div>

        {weather.fetchedAt && (
          <div className="flex items-center gap-1.5">
            <motion.div 
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 bg-app-surface py-1.5 px-3 rounded-full border border-app-border"
            >
              <Icons.Clock className="w-3 h-3 text-app-text-dim/60" />
              <span className="text-[10px] uppercase font-bold tracking-widest text-app-text-dim/60">
                {formatLastUpdated(weather.fetchedAt)}
              </span>
            </motion.div>

            {onRefresh && (
              <motion.button
                onClick={() => {
                  Haptic.medium(settings.hapticEnabled);
                  onRefresh();
                }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                whileTap={{ scale: 0.9 }}
                className="w-7 h-7 bg-app-surface border border-app-border rounded-full flex items-center justify-center text-app-text-dim hover:text-app-text transition-colors shadow-sm"
              >
                <Icons.RotateCcw className={cn("w-3 h-3", isRefreshing && "animate-spin")} />
              </motion.button>
            )}
          </div>
        )}
      </div>

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="mb-4"
      >
        <WeatherIcon 
          name={info.icon as any} 
          style={settings.iconStyle}
          className="w-32 h-32 text-app-text drop-shadow-[0_0_30px_var(--border-color)]" 
          strokeWidth={1.2} 
        />
      </motion.div>
      
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.8 }}
        className="relative"
      >
        <div className="flex justify-center -mr-6">
          <span className="text-[140px] leading-none font-[200] tracking-tighter text-app-text">
            {formatTemp(weather.current.temperature, settings.unitTemp)}
          </span>
          <span className="text-3xl font-light text-app-text-dim mt-6 ml-2">°</span>
        </div>
        <div className="flex flex-col items-center gap-2 mt-4">
          <span className="text-xl font-medium text-app-text/90">{info.label}</span>
          <div className="flex items-center gap-3 text-app-text-dim text-[14px] font-medium tracking-wide">
            <span>H: {formatTemp(weather.daily.temperatureMax?.[0] ?? 0, settings.unitTemp)}°</span>
            <span className="w-1 h-1 bg-app-border rounded-full" />
            <span>L: {formatTemp(weather.daily.temperatureMin?.[0] ?? 0, settings.unitTemp)}°</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
