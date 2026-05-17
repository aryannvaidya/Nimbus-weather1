import React, { useState, useEffect } from 'react';
import { convertTemp, formatTemp, formatWind, formatVisibility, formatPrecipitation } from '../lib/units';
import { motion, AnimatePresence } from 'motion/react';
import { Icons, WeatherIcon } from './WeatherIcons';
import { Settings, WeatherData, Location } from '../types';
import { cn, GLASS_STYLE_SUBTLE } from '../lib/utils';
import { Haptic } from '../lib/haptics';

interface SettingsScreenProps {
  settings: Settings;
  onUpdate: (settings: Settings) => void;
  onClose: () => void;
  activeWeather?: WeatherData;
  activeLocation?: Location;
  panelStackRef: React.MutableRefObject<(() => void)[]>;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-8">
    <h3 className="text-[11px] font-medium tracking-[0.1em] text-app-text-dim uppercase mb-3 px-1">{title}</h3>
    <div className={cn("overflow-hidden divide-y divide-app-border", "bg-app-surface backdrop-blur-3xl border border-app-border rounded-[32px]")}>
      {children}
    </div>
  </div>
);

const ToggleRow = ({ label, description, value, onToggle, hapticEnabled }: { label: string; description?: string; value: boolean; onToggle: () => void; hapticEnabled: boolean }) => (
  <div className="p-5 flex items-center justify-between">
    <div className="flex-1 pr-4">
      <p className="text-[16px] font-medium text-app-text tracking-tight">{label}</p>
      {description && <p className="text-[13px] text-app-text-dim mt-0.5 leading-tight opacity-70">{description}</p>}
    </div>
    <button 
      type="button"
      onClick={() => {
        Haptic.medium(hapticEnabled);
        onToggle();
      }}
      className={cn(
        "w-[51px] h-[31px] rounded-full transition-all duration-300 relative",
        value ? "bg-[#34C759]" : "bg-app-text/10 outline-1 outline-app-border"
      )}
    >
      <motion.div 
        layout
        className={cn(
          "absolute top-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-md will-change-transform",
          value ? "left-[22px]" : "left-[2px]"
        )} 
        transition={{ 
          type: "spring", 
          stiffness: 700, 
          damping: 35,
          mass: 0.5
        }}
      />
    </button>
  </div>
);

const SegmentedControl = ({ value, options, onChange, hapticEnabled, layoutId }: { value: string; options: { label: string; value: string }[], onChange: (val: any) => void; hapticEnabled: boolean; layoutId: string }) => (
  <div className="flex p-1 bg-app-text/[0.04] rounded-[14px] w-full relative">
    {options.map((opt) => {
      const isSelected = value === opt.value;
      return (
        <button
          key={opt.value}
          onClick={() => {
            if (!isSelected) {
              Haptic.light(hapticEnabled);
              onChange(opt.value);
            }
          }}
          className={cn(
            "flex-1 py-1.5 text-[13px] font-semibold rounded-[10px] transition-colors duration-200 relative z-10",
            isSelected ? "text-app-text" : "text-app-text-dim hover:text-app-text/70"
          )}
        >
          {opt.label}
          {isSelected && (
            <motion.div
              layoutId={layoutId}
              className="absolute inset-0 bg-app-surface rounded-[10px] shadow-[0_2px_8px_rgba(0,0,0,0.12)] border border-app-border -z-10 will-change-transform"
              transition={{ 
                type: "spring", 
                bounce: 0.15, 
                duration: 0.35,
                stiffness: 400,
                damping: 30
              }}
            />
          )}
        </button>
      );
    })}
  </div>
);

const SelectRow = ({ label, value, options, onChange, hapticEnabled }: { label: string; value: string; options: { label: string; value: string }[], onChange: (val: any) => void; hapticEnabled: boolean }) => (
  <div className="px-5 py-4 flex flex-col gap-2.5">
    <div className="flex items-center justify-between px-0.5">
      <p className="text-[13px] font-semibold text-app-text tracking-tight">{label}</p>
      <p className="text-[12px] font-medium text-app-text-dim opacity-50 uppercase tracking-widest">{value}</p>
    </div>
    <SegmentedControl 
      value={value} 
      options={options} 
      onChange={onChange} 
      hapticEnabled={hapticEnabled} 
      layoutId={`segment-${label.toLowerCase().replace(/\s+/g, '-')}`}
    />
  </div>
);

const LinkRow = ({ label, value, onClick, hapticEnabled }: { label: string; value?: string; onClick?: () => void; hapticEnabled?: boolean }) => (
  <button 
    onClick={() => {
      if (hapticEnabled !== undefined) Haptic.medium(hapticEnabled);
      onClick?.();
    }} 
    className="w-full p-4 flex items-center justify-between text-left active:bg-app-text/5 transition-colors"
  >
    <p className="text-[15px] text-app-text">{label}</p>
    <div className="flex items-center gap-2">
      {value && <p className="text-[14px] text-app-text-dim">{value}</p>}
      <Icons.ChevronRight className="w-4 h-4 text-app-text-dim/20" />
    </div>
  </button>
);

const NumberInput = ({ 
  value, 
  onChange, 
  min = 0, 
  max = 100,
  hapticEnabled
}: { 
  value: number; 
  onChange: (val: number) => void; 
  min?: number; 
  max?: number; 
  hapticEnabled: boolean;
}) => (
  <div className="flex items-center gap-4 py-1">
    <div className="flex-1 relative">
      <input 
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const val = parseInt(e.target.value);
          if (!isNaN(val)) {
            Haptic.light(hapticEnabled);
            onChange(Math.max(min, Math.min(max, val)));
          }
        }}
        className="w-full bg-app-text/5 border border-app-border rounded-xl px-4 py-3 text-[17px] font-bold text-app-text outline-none focus:border-blue-500/50 transition-colors tabular-nums"
      />
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none opacity-30">
        <span className="text-[12px] font-black uppercase tracking-widest">%</span>
      </div>
    </div>
    
    <div className="flex gap-1">
      <button 
        onClick={() => {
          Haptic.light(hapticEnabled);
          onChange(Math.max(min, value - 5));
        }}
        className="w-12 h-12 rounded-xl bg-app-text/5 border border-app-border flex items-center justify-center text-app-text active:scale-90 transition-all"
      >
        <Icons.Minus className="w-5 h-5" strokeWidth={2.5} />
      </button>
      <button 
        onClick={() => {
          Haptic.light(hapticEnabled);
          onChange(Math.min(max, value + 5));
        }}
        className="w-12 h-12 rounded-xl bg-app-text/5 border border-app-border flex items-center justify-center text-app-text active:scale-90 transition-all"
      >
        <Icons.Plus className="w-5 h-5" strokeWidth={2.5} />
      </button>
    </div>
  </div>
);

const SliderRow = ({ 
  label, 
  value, 
  onToggle, 
  onValueChange, 
  currentValue,
  hapticEnabled
}: { 
  label: string; 
  value: boolean; 
  onToggle: () => void; 
  onValueChange: (val: number) => void;
  currentValue: number;
  hapticEnabled: boolean;
}) => {
  return (
    <div className="flex flex-col">
      <ToggleRow 
        label={label} 
        description={value ? `Threshold set to ${currentValue}%` : "Currently disabled"}
        value={value} 
        onToggle={onToggle} 
        hapticEnabled={hapticEnabled}
      />
      <AnimatePresence>
        {value && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-6 pt-1">
              <NumberInput value={currentValue} onChange={onValueChange} hapticEnabled={hapticEnabled} />
              <p className="text-[10px] text-app-text-dim/40 text-center mt-3 uppercase tracking-widest font-black">
                Type directly or use +/- for quick adjustment
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const PoweredByPill = ({ label, icon }: { label: string; icon: string }) => (
  <div className="flex items-center gap-3 px-6 py-3.5 rounded-full bg-white/[0.03] border border-white/10 backdrop-blur-xl shadow-inner">
    <span className="text-[20px] filter drop-shadow-sm leading-none flex items-center justify-center">{icon}</span>
    <span className="text-[15px] font-bold text-app-text/90 tracking-tight whitespace-nowrap">{label}</span>
  </div>
);

const LoopingWeatherIcon = () => {
  const [index, setIndex] = useState(0);
  const icons = ['Sun', 'Cloud', 'CloudLightning', 'CloudRain', 'Moon'];
  
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % icons.length);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={icons[index]}
        initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        exit={{ opacity: 0, scale: 1.1, rotate: 10 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <WeatherIcon 
          name={icons[index] as any} 
          className="w-16 h-16 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]" 
          style="coloured" 
        />
      </motion.div>
    </AnimatePresence>
  );
};

const SettingsScreen = ({ settings: globalSettings, onUpdate, onClose, activeWeather, activeLocation, panelStackRef }: SettingsScreenProps) => {
  const [localSettings, setLocalSettings] = useState(globalSettings);
  const [showAbout, setShowAbout] = useState(false);
  const [activeSubView, setActiveSubView] = useState<'none' | 'agreement' | 'privacy'>('none');

  const pushPanel = (closeFn: () => void, name: string) => {
    window.history.pushState({ panel: name }, "");
    panelStackRef.current.push(closeFn);
  };

  const handleBack = () => {
    window.history.back();
  };

  useEffect(() => {
    const handleSwipeLeft = () => {
      if (showAbout || activeSubView !== 'none') return;
      // Increase thresholds
      Haptic.medium(localSettings.hapticEnabled);
      const newRain = Math.min(100, localSettings.rainThreshold + 5);
      const newSnow = Math.min(100, localSettings.snowThreshold + 5);
      const updated = { ...localSettings, rainThreshold: newRain, snowThreshold: newSnow };
      setLocalSettings(updated);
      onUpdate(updated);
    };

    const handleSwipeRight = () => {
      if (showAbout || activeSubView !== 'none') return;
      // Decrease thresholds
      Haptic.medium(localSettings.hapticEnabled);
      const newRain = Math.max(0, localSettings.rainThreshold - 5);
      const newSnow = Math.max(0, localSettings.snowThreshold - 5);
      const updated = { ...localSettings, rainThreshold: newRain, snowThreshold: newSnow };
      setLocalSettings(updated);
      onUpdate(updated);
    };

    window.addEventListener('swipe-left', handleSwipeLeft);
    window.addEventListener('swipe-right', handleSwipeRight);
    return () => {
      window.removeEventListener('swipe-left', handleSwipeLeft);
      window.removeEventListener('swipe-right', handleSwipeRight);
    };
  }, [localSettings, showAbout, activeSubView, onUpdate]);

  const updateSetting = <T extends keyof Settings>(key: T, value: Settings[T]) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    Haptic.light(localSettings.hapticEnabled);
    onUpdate(newSettings);
  };

  const SubView = ({ title, content, onClose }: { title: string; content: string; onClose: () => void }) => (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: 15 }}
      transition={{ 
        type: "spring",
        stiffness: 400,
        damping: 30
      }}
      className="fixed inset-0 z-[100] bg-app-bg/95 backdrop-blur-2xl px-6 pt-[calc(env(safe-area-inset-top)+24px)] pb-20 overflow-y-auto gpu will-change-transform"
    >
      <div className="max-w-[390px] mx-auto min-h-full flex flex-col">
        <header className="flex items-center justify-between mb-10">
          <h2 className="text-2xl font-bold text-app-text">{title}</h2>
          <button onClick={() => {
            Haptic.light(localSettings.hapticEnabled);
            onClose();
          }} className="w-10 h-10 rounded-full bg-app-text/5 flex items-center justify-center text-app-text">
            <Icons.X className="w-6 h-6" />
          </button>
        </header>
        <div className="text-[15px] font-medium leading-relaxed text-app-text/80 space-y-6">
          {content.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </div>
    </motion.div>
  );

  if (activeSubView !== 'none') {
    const views = {
      agreement: {
        title: "User Agreement",
        content: "By using this Application, you acknowledge and agree that weather data is provided 'as is' for informational purposes only. Nimbus Labs does not guarantee the absolute accuracy, completeness, or timeliness of data due to the inherent nature of meteorological forecasting.\n\nYou agree not to use this Application for critical safety decisions, such as maritime navigation, aviation, or emergency management. Any reliance on the information provided is strictly at your own risk.\n\nWe reserve the right to modify services, features, or data providers without prior notice. Continuous service is not guaranteed during scheduled maintenance or upstream provider outages."
      },
      privacy: {
        title: "Privacy Notice",
        content: "We respect your digital privacy. This Application is designed to function with minimal data footprint. Your precise location data is processed locally to fetch hyper-local weather alerts and is never transmitted to our servers for storage or profiling.\n\nWe do not sell, rent, or lease your personal data to third parties. Any analytical data collected is fully anonymized and used solely to improve application performance and stability.\n\nYour saved locations and settings are stored locally on your device via browser storage. We have no access to this data. For integrated services like Open-Meteo, please refer to their respective privacy documentation regarding IP-based data processing."
      }
    };
    return <SubView title={views[activeSubView].title} content={views[activeSubView].content} onClose={() => handleBack()} />;
  }

  if (showAbout) {
    return (
      <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="fixed inset-0 z-[60] bg-app-bg overflow-y-auto about-page touch-pan-y"
    >
        <div className="max-w-[390px] mx-auto min-h-screen px-6 pt-[calc(env(safe-area-inset-top)+24px)] pb-32">
          <header className="flex items-center mb-12 px-1">
             <button 
              onClick={() => {
                handleBack();
              }}
              className="flex items-center text-app-text"
            >
              <span className="text-[17px] font-medium text-app-text">Back</span>
            </button>
          </header>

          <div className="flex flex-col items-center px-4">
             <motion.div 
               style={{ 
                 perspective: 1000 
               }}
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               className="flex flex-col items-center text-center mb-16 w-full"
             >
                <motion.div 
                  className="flex items-center gap-5 mb-4"
                  animate={{ 
                    y: [0, -10, 0],
                  }}
                  transition={{ 
                    duration: 4, 
                    repeat: Infinity, 
                    ease: "easeInOut" 
                  }}
                >
                   <motion.div 
                     className="relative"
                     animate={{ 
                       x: [0, 5, -5, 0],
                       y: [0, -10, 10, 0],
                       rotate: [0, -2, 2, 0]
                     }}
                     transition={{ 
                       duration: 6, 
                       repeat: Infinity, 
                       ease: "easeInOut" 
                     }}
                   >
                     <LoopingWeatherIcon />
                   </motion.div>
                   <h1 className="text-[32px] font-black tracking-[-0.04em] text-app-text uppercase">
                     Nimbus Weather
                   </h1>
                </motion.div>
                <div className="h-px w-12 bg-app-text/10" />
             </motion.div>
             
             <div className="bg-app-surface/40 backdrop-blur-md border border-app-border rounded-[24px] overflow-hidden w-full mb-16 shadow-sm">
                <button 
                  onClick={() => {
                    Haptic.light(localSettings.hapticEnabled);
                    setActiveSubView('agreement');
                    pushPanel(() => setActiveSubView('none'), 'agreement');
                  }}
                  className="w-full px-6 py-5 flex items-center justify-between text-left active:bg-white/5 transition-colors border-b border-app-border/50"
                >
                   <span className="text-[16px] text-app-text font-medium">Weather User Agreement</span>
                   <Icons.ChevronRight className="w-5 h-5 text-app-text-dim/30" />
                </button>
                <button 
                  onClick={() => {
                    Haptic.light(localSettings.hapticEnabled);
                    setActiveSubView('privacy');
                    pushPanel(() => setActiveSubView('none'), 'privacy');
                  }}
                  className="w-full px-6 py-5 flex items-center justify-between text-left active:bg-white/5 transition-colors"
                >
                   <span className="text-[16px] text-app-text font-medium">Weather Privacy Notice</span>
                   <Icons.ChevronRight className="w-5 h-5 text-app-text-dim/30" />
                </button>
             </div>

             <div className="w-full mb-20">
                <p className="text-[14px] font-black text-app-text/40 uppercase tracking-[0.25em] mb-10 text-center">Powered by</p>
                <div className="flex flex-wrap justify-center gap-4">
                   <PoweredByPill label="Open-Meteo" icon="🌤️" />
                   <PoweredByPill label="WAQI" icon="💨" />
                   <PoweredByPill label="Leaflet" icon="🗺️" />
                   <PoweredByPill label="Geolocation API" icon="📍" />
                </div>
             </div>

             <div className="flex flex-col items-center gap-1 text-center">
                <p className="text-[11px] font-bold text-app-text uppercase tracking-[0.15em] opacity-30">Built with precision</p>
                <p className="text-[11px] font-bold text-app-text opacity-30">&copy; 2026 Nimbus Weather</p>
                <div className="h-10" />
                <p className="text-[12px] font-black text-app-text/40 opacity-50 tracking-widest uppercase">Version 1.0.0</p>
             </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 40, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 40, scale: 0.99 }}
      transition={{ 
        type: "spring", 
        damping: 28, 
        stiffness: 350, 
        mass: 0.8,
        velocity: 2
      }}
      className="fixed inset-0 z-50 bg-app-bg overflow-y-auto gpu settings-panel touch-pan-y will-change-transform"
      data-no-swipe
    >
      <div className="max-w-[390px] mx-auto min-h-screen px-6 pt-[calc(env(safe-area-inset-top)+112px)] pb-24">
        <h1 className="text-[34px] font-bold text-app-text mb-8 tracking-tight px-1">Settings</h1>

        <Section title="Weather alerts">
          <SliderRow 
            label="Rain alerts" 
            value={localSettings.alertRain} 
            currentValue={localSettings.rainThreshold}
            hapticEnabled={localSettings.hapticEnabled}
            onToggle={() => updateSetting('alertRain', !localSettings.alertRain)} 
            onValueChange={(val) => updateSetting('rainThreshold', val)}
          />
          <SliderRow 
            label="Snow alerts" 
            value={localSettings.alertDaily} 
            currentValue={localSettings.snowThreshold}
            hapticEnabled={localSettings.hapticEnabled}
            onToggle={() => updateSetting('alertDaily', !localSettings.alertDaily)} 
            onValueChange={(val) => updateSetting('snowThreshold', val)}
          />
          <ToggleRow 
            label="Thunderstorm alerts" 
            value={localSettings.stormThreshold} 
            hapticEnabled={localSettings.hapticEnabled}
            onToggle={() => updateSetting('stormThreshold', !localSettings.stormThreshold)} 
          />
          <ToggleRow 
            label="Severe weather alerts" 
            value={localSettings.alertSevere} 
            hapticEnabled={localSettings.hapticEnabled}
            onToggle={() => updateSetting('alertSevere', !localSettings.alertSevere)} 
          />
        </Section>

        <Section title="Units">
          <SelectRow 
            label="Temperature" 
            value={localSettings.unitTemp} 
            hapticEnabled={localSettings.hapticEnabled}
            options={[
              { label: '°C', value: 'C' },
              { label: '°F', value: 'F' }
            ]}
            onChange={(val) => updateSetting('unitTemp', val)}
          />
          <SelectRow 
            label="Wind" 
            value={localSettings.unitWind} 
            hapticEnabled={localSettings.hapticEnabled}
            options={[
              { label: 'km/h', value: 'km/h' },
              { label: 'mph', value: 'mph' },
              { label: 'm/s', value: 'm/s' }
            ]}
            onChange={(val) => updateSetting('unitWind', val)}
          />
          <SelectRow 
            label="Visibility" 
            value={localSettings.unitVisibility} 
            hapticEnabled={localSettings.hapticEnabled}
            options={[
              { label: 'km', value: 'km' },
              { label: 'mi', value: 'miles' }
            ]}
            onChange={(val) => updateSetting('unitVisibility', val)}
          />
        </Section>

        <Section title="Icons">
          <div className="p-8 flex items-center justify-center gap-12 bg-white/[0.02] rounded-3xl">
            <button 
              type="button"
              onClick={(e) => {
                e.preventDefault();
                Haptic.medium(localSettings.hapticEnabled);
                updateSetting('iconStyle', 'outline');
              }}
              className="flex flex-col items-center gap-4 transition-all duration-300 group touch-manipulation"
            >
              <div className={cn(
                "transition-all duration-500 ease-[0.22,1,0.36,1]",
                localSettings.iconStyle === 'outline' ? "scale-125 saturate-100" : "scale-100 saturate-0 opacity-40 group-hover:opacity-60"
              )}>
                <WeatherIcon name="Sun" style="outline" className="w-12 h-12" />
              </div>
              <p className={cn(
                "text-[10px] uppercase font-bold tracking-[0.2em] transition-colors",
                localSettings.iconStyle === 'outline' ? "text-white" : "text-white/20"
              )}>Outline</p>
            </button>
            
            <button 
              type="button"
              onClick={(e) => {
                e.preventDefault();
                Haptic.medium(localSettings.hapticEnabled);
                updateSetting('iconStyle', 'coloured');
              }}
              className="flex flex-col items-center gap-4 transition-all duration-300 group touch-manipulation"
            >
              <div className={cn(
                "transition-all duration-500 ease-[0.22,1,0.36,1]",
                localSettings.iconStyle === 'coloured' ? "scale-125 saturate-100" : "scale-100 saturate-0 opacity-40 group-hover:opacity-60"
              )}>
                <WeatherIcon name="Sun" style="coloured" className="w-12 h-12" />
              </div>
              <p className={cn(
                "text-[10px] uppercase font-bold tracking-[0.2em] transition-colors",
                localSettings.iconStyle === 'coloured' ? "text-white" : "text-white/20"
              )}>Coloured</p>
            </button>
          </div>
        </Section>

        <Section title="General">
          <ToggleRow 
            label="Haptic feedback" 
            description="Subtle vibrations for buttons and scrolling"
            value={localSettings.hapticEnabled} 
            hapticEnabled={localSettings.hapticEnabled}
            onToggle={() => updateSetting('hapticEnabled', !localSettings.hapticEnabled)} 
          />
          <LinkRow 
            label="About Weather" 
            hapticEnabled={localSettings.hapticEnabled}
            onClick={() => {
              setShowAbout(true);
              pushPanel(() => setShowAbout(false), 'about');
            }}
          />
        </Section>
      </div>
    </motion.div>
  );
};

export default SettingsScreen;
