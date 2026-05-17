import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RawIcons } from './WeatherIcons';
import { cn } from '../lib/utils';
import { Haptic } from '../lib/haptics';

interface WeatherAlert {
  id: string;
  type: 'rain' | 'snow' | 'storm' | 'severe' | 'severe_storm';
  title: string;
  message: string;
}

interface AlertsDisplayProps {
  alerts: WeatherAlert[];
  onDismiss: (id: string) => void;
  hapticEnabled?: boolean;
}

const CARD_HEIGHT = 72;
const PEEK = 10;
const SCALE_STEP = 0.04;

export default function AlertsDisplay({ alerts, onDismiss, hapticEnabled = true }: AlertsDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const toggleStack = () => {
    setIsExpanded(!isExpanded);
    Haptic.light(hapticEnabled);
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'rain': return "🌧️";
      case 'snow': return "❄️";
      case 'storm': return "🌩️";
      case 'severe': return "⚠️";
      case 'severe_storm': return "🌪️";
      default: return "⚠️";
    }
  };

  return (
    <div className="relative w-full px-6 mb-8 mt-2 select-none">
      <motion.div 
        layout
        className={cn(
          "warnings-stack",
          !isExpanded ? "collapsed" : "expanded"
        )}
        data-count={alerts.length}
        style={{ 
          height: isExpanded 
            ? (alerts.length * (CARD_HEIGHT + 10)) 
            : (CARD_HEIGHT + ((alerts.length - 1) * PEEK)) 
        }}
        onClick={() => {
          if (!isExpanded && alerts.length > 1) {
            toggleStack();
          }
        }}
      >
        <AnimatePresence mode="popLayout">
          {alerts.map((alert, index) => {
            const offset = index * PEEK;
            const scale = 1 - (index * SCALE_STEP);
            const opacity = isExpanded ? 1 : (index > 2 ? 0 : 1 - (index * 0.15));
            
            return (
              <motion.div
                key={alert.id}
                layout
                initial={{ opacity: 0, x: 50, scale: 0.8 }}
                animate={{
                  opacity,
                  scale: isExpanded ? 1 : scale,
                  y: isExpanded ? index * (CARD_HEIGHT + 10) : offset,
                  zIndex: alerts.length - index,
                }}
                exit={{ 
                  opacity: 0, 
                  x: 100,
                  transition: { duration: 0.3 }
                }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 35,
                  mass: 0.8
                }}
                className={cn(
                  "warning-card",
                  !isExpanded && index > 1 && "pointer-events-none"
                )}
                onClick={(e) => {
                  if (isExpanded) {
                    toggleStack();
                  }
                }}
              >
                <div className="warning-inner">
                  <span className="warning-icon">
                    {getAlertIcon(alert.type)}
                  </span>
                  <div className="warning-text">
                    <div className="warning-title">
                      {alert.title}
                    </div>
                    <div className="warning-msg">
                      {alert.message}
                    </div>
                  </div>
                  <button 
                    className="warning-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss(alert.id);
                      Haptic.light(hapticEnabled);
                      if (isExpanded && alerts.length <= 2) {
                        setIsExpanded(false);
                      }
                    }}
                  >
                    <RawIcons.X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

