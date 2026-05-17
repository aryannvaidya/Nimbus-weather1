import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RawIcons } from './WeatherIcons';
import { cn, GLASS_STYLE_SUBTLE } from '../lib/utils';

interface WeatherAlert {
  id: string;
  type: 'rain' | 'snow' | 'storm' | 'severe' | 'severe_storm';
  title: string;
  message: string;
}

interface AlertsDisplayProps {
  alerts: WeatherAlert[];
  onDismiss: (id: string) => void;
}

export default function AlertsDisplay({ alerts, onDismiss }: AlertsDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const handleToggle = (e: React.MouseEvent) => {
    // Don't toggle if clicking the dismiss button
    if ((e.target as HTMLElement).closest('button')) return;
    if (alerts.length > 1) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div 
      className={cn(
        "w-full px-6 mb-8 mt-2 transition-all duration-500 ease-in-out cursor-pointer",
        isExpanded ? "space-y-3" : "relative"
      )}
      onClick={handleToggle}
      style={{ minHeight: isExpanded ? 'auto' : '84px' }}
    >
      <AnimatePresence mode="popLayout">
        {alerts.map((alert, index) => {
          const isStacked = !isExpanded && alerts.length > 1;
          const stackIndex = index;
          
          return (
            <motion.div
              key={alert.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={isExpanded ? {
                opacity: 1,
                y: 0,
                scale: 1,
                zIndex: alerts.length - index,
                rotate: 0,
                filter: 'blur(0px)',
              } : {
                opacity: stackIndex > 2 ? 0 : 1,
                y: stackIndex * 12, // More pronounced sliver
                scale: 1 - (stackIndex * 0.05),
                zIndex: alerts.length - stackIndex,
                filter: stackIndex > 0 ? `blur(${stackIndex * 1}px)` : 'blur(0px)',
                position: isStacked && stackIndex > 0 ? 'absolute' : 'relative',
                top: 0,
                left: 0,
                right: 0,
              }}
              style={{ transformOrigin: 'top center' }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
                mass: 1
              }}
              className={cn(
                "p-4 rounded-[24px] flex gap-4 items-start relative overflow-hidden group transition-all",
                GLASS_STYLE_SUBTLE,
                "bg-app-text/[0.05] border-app-border backdrop-blur-xl",
                !isExpanded && index > 0 && "pointer-events-none"
              )}
            >
              {/* Glow background */}
              <div className="absolute inset-0 bg-gradient-to-br from-app-text/[0.03] to-transparent pointer-events-none" />
              
              <div className="mt-1 flex-shrink-0">
                {alert.type === 'rain' && <RawIcons.CloudRain className="w-5 h-5 text-blue-500" />}
                {alert.type === 'snow' && <RawIcons.Snowflake className="w-5 h-5 text-app-text" />}
                {alert.type === 'storm' && <RawIcons.CloudLightning className="w-5 h-5 text-amber-500" />}
                {alert.type === 'severe' && <RawIcons.ShieldAlert className="w-5 h-5 text-rose-500" />}
                {alert.type === 'severe_storm' && <RawIcons.Zap className="w-5 h-5 text-rose-600 animate-pulse" />}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className={cn(
                  "text-[14px] font-bold mb-0.5 tracking-tight uppercase",
                  alert.type === 'severe_storm' ? "text-rose-500" : "text-app-text"
                )}>
                  {alert.title}
                </h4>
                <p className="text-[13px] text-app-text-dim leading-tight">
                  {alert.message}
                </p>
              </div>

              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(alert.id);
                }}
                className="p-1 opacity-40 hover:opacity-100 transition-opacity flex-shrink-0"
              >
                <RawIcons.X className="w-4 h-4 text-app-text" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
      
      {/* Stack indicator hint for iOS feel */}
      {!isExpanded && alerts.length > 1 && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute -bottom-4 left-0 right-0 flex justify-center pointer-events-none"
        >
          <div className="w-8 h-1 rounded-full bg-app-text/10" />
        </motion.div>
      )}
    </div>
  );
}
