import React, { useState, useEffect } from 'react';
import { convertTemp, formatTemp, formatWind, formatVisibility, formatPrecipitation } from '../lib/units';
import { motion, AnimatePresence } from 'motion/react';
import { Icons, WeatherIcon } from './WeatherIcons';
import { Settings, WeatherData, Location } from '../types';
import { cn, GLASS_STYLE_SUBTLE } from '../lib/utils';
import { Haptic } from '../lib/haptics';
import WidgetView from './WidgetView';

interface SettingsScreenProps {
  settings: Settings;
  onUpdate: (settings: Settings) => void;
  onClose: () => void;
  activeWeather?: WeatherData;
  activeLocation?: Location;
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

const SegmentedControl = ({ value, options, onChange, hapticEnabled }: { value: string; options: { label: string; value: string }[], onChange: (val: any) => void; hapticEnabled: boolean }) => (
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
              layoutId="segment-indicator"
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
    <SegmentedControl value={value} options={options} onChange={onChange} hapticEnabled={hapticEnabled} />
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

const SettingsScreen = ({ settings: globalSettings, onUpdate, onClose, activeWeather, activeLocation }: SettingsScreenProps) => {
  const [localSettings, setLocalSettings] = useState(globalSettings);
  const [showAbout, setShowAbout] = useState(false);
  const [showWidgetSetup, setShowWidgetSetup] = useState(false);
  const [activeSubView, setActiveSubView] = useState<'none' | 'agreement' | 'privacy'>('none');

  useEffect(() => {
    const handleSwipeLeft = () => {
      if (showAbout || showWidgetSetup || activeSubView !== 'none') return;
      // Increase thresholds
      Haptic.medium(localSettings.hapticEnabled);
      const newRain = Math.min(100, localSettings.rainThreshold + 5);
      const newSnow = Math.min(100, localSettings.snowThreshold + 5);
      const updated = { ...localSettings, rainThreshold: newRain, snowThreshold: newSnow };
      setLocalSettings(updated);
      onUpdate(updated);
    };

    const handleSwipeRight = () => {
      if (showAbout || showWidgetSetup || activeSubView !== 'none') return;
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
  }, [localSettings, showAbout, showWidgetSetup, activeSubView, onUpdate]);

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
      className="fixed inset-0 z-[100] bg-app-bg/95 backdrop-blur-2xl px-6 py-20 overflow-y-auto gpu will-change-transform"
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
    return <SubView title={views[activeSubView].title} content={views[activeSubView].content} onClose={() => setActiveSubView('none')} />;
  }

  if (showWidgetSetup && activeWeather && activeLocation) {
    return (
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className="fixed inset-0 z-[100] bg-app-bg overflow-y-auto"
      >
        <div className="max-w-[390px] mx-auto min-h-screen px-6 pt-16 pb-24 flex flex-col items-center">
          <header className="w-full flex items-center mb-12">
            <button 
              onClick={() => {
                Haptic.light(localSettings.hapticEnabled);
                setShowWidgetSetup(false);
              }}
              className="w-10 h-10 rounded-full bg-app-text/5 flex items-center justify-center text-app-text"
            >
              <Icons.ChevronLeft className="w-6 h-6" />
            </button>
            <h2 className="ml-4 text-xl font-bold text-app-text">Widget Preview</h2>
          </header>

          <WidgetView 
            weather={activeWeather} 
            location={activeLocation} 
            settings={localSettings} 
          />

          <div className="mt-12 w-full space-y-8">
            <div className="p-6 rounded-[32px] bg-app-surface border border-app-border">
              <h3 className="text-sm font-bold text-app-text mb-2 tracking-tight">How to add to Home Screen</h3>
              <ol className="space-y-4 text-[13px] text-app-text-dim list-decimal pl-4">
                <li>Tap the <span className="text-app-text font-bold">Share</span> button in your browser's toolbar.</li>
                <li>Scroll down and selecting <span className="text-app-text font-bold">Add to Home Screen</span>.</li>
                <li>Long-press the app icon on your home screen and select <span className="text-app-text font-bold">Add Widget</span> (if supported by your OS / PWA launcher).</li>
              </ol>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  if (showAbout) {
    return (
      <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="fixed inset-0 z-[60] bg-app-bg overflow-y-auto about-page touch-pan-y"
    >
        <div className="max-w-[390px] mx-auto min-h-screen px-6 pt-16 pb-24">
          <header className="flex items-center mb-16 px-1">
             <button 
              onClick={() => {
                Haptic.light(localSettings.hapticEnabled);
                setShowAbout(false);
              }}
              className="flex items-center text-app-text"
            >
              <Icons.ChevronLeft className="w-7 h-7 mr-3" strokeWidth={2} />
              <span className="text-[20px] font-semibold text-app-text">About Weather</span>
            </button>
          </header>

          <div className="flex flex-col items-center text-center px-4">
             <div className="mb-6">
                <div className="w-[100px] h-[100px] bg-gradient-to-b from-blue-400 to-blue-600 rounded-[28%] flex items-center justify-center shadow-xl relative overflow-hidden">
                   <div className="absolute inset-0 bg-white/10" />
                   <WeatherIcon name="Sun" className="w-16 h-16 drop-shadow-lg" style="coloured" />
                </div>
             </div>
             
             <h2 className="text-[24px] font-bold text-app-text mb-1">Weather</h2>
             <p className="text-app-text-dim/60 text-[13px] mb-12">Version: 16.29.4</p>
             
             <div className="bg-app-surface/40 backdrop-blur-md border border-app-border rounded-[24px] overflow-hidden w-full mb-16 shadow-sm">
                <button 
                  onClick={() => setActiveSubView('agreement')}
                  className="w-full px-6 py-5 flex items-center justify-between text-left active:bg-white/5 transition-colors border-b border-app-border/50"
                >
                   <span className="text-[16px] text-app-text font-medium">Weather User Agreement</span>
                   <Icons.ChevronRight className="w-5 h-5 text-app-text-dim/30" />
                </button>
                <button 
                  onClick={() => setActiveSubView('privacy')}
                  className="w-full px-6 py-5 flex items-center justify-between text-left active:bg-white/5 transition-colors"
                >
                   <span className="text-[16px] text-app-text font-medium">Weather Privacy Notice</span>
                   <Icons.ChevronRight className="w-5 h-5 text-app-text-dim/30" />
                </button>
             </div>

             <div className="flex flex-col items-center gap-1.5 opacity-30">
                <p className="text-[10px] font-medium tracking-[0.1em] uppercase">Built with precision</p>
                <p className="text-[10px]">&copy; 2026 Weather Labs</p>
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
      <div className="max-w-[390px] mx-auto min-h-screen px-6 pt-32 pb-24">
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
          <SelectRow 
            label="Precipitation" 
            value={localSettings.unitPrecipitation} 
            hapticEnabled={localSettings.hapticEnabled}
            options={[
              { label: 'mm', value: 'mm' },
              { label: 'in', value: 'inches' }
            ]}
            onChange={(val) => updateSetting('unitPrecipitation', val)}
          />
        </Section>

        <Section title="Appearance">
          <div className="p-6">
            <p className="text-[14px] font-medium text-white/40 mb-4 px-1">Theme</p>
            <div className="flex items-center gap-4 px-1 mb-2">
              {[
                { id: 'white', label: 'White', bg: '#ffffff', text: '#000000' },
                { id: 'ivory', label: 'Ivory', bg: '#f4f1ea', text: '#1a1a1a' },
                { id: 'dark', label: 'Dark', bg: '#262626', text: '#ffffff' },
                { id: 'black', label: 'Black', bg: '#000000', text: '#ffffff' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    Haptic.medium(localSettings.hapticEnabled);
                    updateSetting('theme', t.id as any);
                  }}
                  className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 relative",
                    localSettings.theme === t.id ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-black scale-110" : "opacity-60 hover:opacity-100"
                  )}
                  style={{ backgroundColor: t.bg }}
                >
                  <span className="text-[17px] font-medium" style={{ color: t.text }}>Aa</span>
                </button>
              ))}
            </div>
          </div>

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
          <LinkRow 
            label="Home Screen Widget"
            value="Installation guide"
            hapticEnabled={localSettings.hapticEnabled}
            onClick={() => {
              setShowWidgetSetup(true);
            }}
          />
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
            }}
          />
        </Section>
      </div>
    </motion.div>
  );
};

export default SettingsScreen;
