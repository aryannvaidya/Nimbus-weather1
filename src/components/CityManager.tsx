import React from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { Icons, WeatherIcon } from './WeatherIcons';
import { Location, WeatherData } from '../types';
import { cn, GLASS_STYLE_SUBTLE } from '../lib/utils';
import { Haptic } from '../lib/haptics';
import { getWeatherInfo } from '../services/weatherService';

interface CityManagerProps {
  locations: Location[];
  activeLocationIndex: number;
  weatherData: Record<number, WeatherData>;
  hapticEnabled: boolean;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onReorder: (newLocations: Location[]) => void;
  onClose: () => void;
  panelStackRef: React.MutableRefObject<(() => void)[]>;
}

const CityManager = ({ 
  locations, 
  activeLocationIndex, 
  weatherData, 
  hapticEnabled,
  onSelect, 
  onAdd, 
  onRemove, 
  onReorder,
  onClose,
  panelStackRef
}: CityManagerProps) => {

  const handleRemove = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    Haptic.warning(hapticEnabled);
    onRemove(index);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: 10 }}
      transition={{ 
        duration: 0.4, 
        ease: [0.22, 1, 0.36, 1],
        scale: { duration: 0.5 },
        opacity: { duration: 0.3 }
      }}
      className="fixed inset-0 z-[100] bg-black overflow-y-auto gpu"
    >
      <div className="max-w-[390px] mx-auto min-h-screen px-6 pt-32 pb-24">
        <header className="flex items-center justify-between mb-8 px-1">
          <h1 className="text-[34px] font-bold text-white tracking-tight">Weather</h1>
          <button 
            onClick={() => {
              Haptic.light(hapticEnabled);
              onClose();
            }}
            className="w-10 h-10 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
          >
            <Icons.X className="w-5 h-5" />
          </button>
        </header>

        <Reorder.Group 
          values={locations} 
          onReorder={onReorder}
          className="flex flex-col gap-3"
        >
          {locations.map((loc, i) => {
            const weather = weatherData[i];
            const info = weather ? getWeatherInfo(weather.current.weatherCode, weather.current.isDay) : null;
            const isSelected = activeLocationIndex === i;

            return (
              <Reorder.Item 
                key={`${loc.latitude}-${loc.longitude}-${loc.name}`} 
                value={loc}
                className="relative"
              >
                <motion.div
                  onClick={() => {
                    Haptic.light(hapticEnabled);
                    onSelect(i);
                  }}
                  className={cn(
                    "p-5 flex items-center justify-between rounded-[28px] border transition-all duration-300",
                    isSelected ? "bg-white/10 border-white/20" : "bg-white/5 border-white/5"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col gap-1 items-center opacity-40 cursor-grab active:cursor-grabbing">
                      <Icons.GripVertical className="w-4 h-4" />
                    </div>
                    
                    <div className="flex flex-col">
                      <span className="text-[17px] font-semibold">{loc.name}</span>
                      <span className="text-[13px] text-white/45">{loc.country}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {weather ? (
                      <div className="flex items-center gap-3">
                         <span className="text-2xl font-semibold tracking-tight">
                           {Math.round(weather.current.temperature)}°
                         </span>
                         {info && (
                           <WeatherIcon 
                             name={info.icon as any} 
                             className="w-7 h-7 text-white" 
                             style="outline" 
                           />
                         )}
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full border border-white/10 border-t-white animate-spin opacity-20" />
                    )}

                    <button 
                      onClick={(e) => handleRemove(e, i)}
                      className="p-2 text-white/20 hover:text-red-400/60 transition-colors"
                    >
                      <Icons.Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>

        <button 
          onClick={() => {
            Haptic.medium(hapticEnabled);
            onAdd();
          }}
          className="w-full mt-6 py-5 bg-white/10 border border-dashed border-white/20 rounded-[28px] flex items-center justify-center gap-3 text-white active:scale-95 transition-all text-[15px] font-medium"
        >
          <Icons.Plus className="w-5 h-5 text-white/60" />
          <span>Add new city</span>
        </button>

        <div className="mt-12 text-center">
            <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-white/20">Manage Locations</p>
        </div>
      </div>
    </motion.div>
  );
};

export default CityManager;
