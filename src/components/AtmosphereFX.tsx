import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'motion/react';
import { cn } from '../lib/utils';

interface AtmosphereFXProps {
  weatherCode: number;
  isDay: boolean;
  moonPhase: number;
  locationName: string;
}

export default function AtmosphereFX({ weatherCode, isDay, moonPhase, locationName }: AtmosphereFXProps) {
  const [isVisible, setIsVisible] = useState(false);
  const { scrollY } = useScroll();
  
  // Parallax offsets: layers move slower than foreground content
  // Positive values move down less than the content (or up relative to viewport)
  const y1 = useTransform(scrollY, [0, 500], [0, 150]); // Ambient layer: 30% parallax
  const y2 = useTransform(scrollY, [0, 500], [0, 250]); // Core layer: 50% parallax
  const yStars = useTransform(scrollY, [0, 500], [0, 100]); // Stars layer: 20% parallax

  useEffect(() => {
    setIsVisible(true);
    const timer = setTimeout(() => setIsVisible(false), 12000); // Effect durations roughly match animations
    return () => {
      setIsVisible(false);
      clearTimeout(timer);
    };
  }, [locationName, weatherCode]);

  const getConfig = () => {
    // 1. Thunderstorm: Dark Grey
    if (weatherCode >= 95) {
      return {
        colors: ['rgba(30, 41, 59, 0.7)', 'rgba(71, 85, 105, 0.5)'],
        hasFlashes: true,
      };
    }
    
    // 2. Snow: Snow particles + white grey clouds
    if ((weatherCode >= 71 && weatherCode <= 77) || weatherCode === 85 || weatherCode === 86) {
      return {
        colors: isDay 
          ? ['rgba(241, 245, 249, 0.5)', 'rgba(203, 213, 225, 0.3)'] 
          : ['rgba(148, 163, 184, 0.4)', 'rgba(71, 85, 105, 0.2)'],
        hasSnow: true,
        hasClouds: true,
      };
    }

    // 3. Overcast / Cloudy: White Grey
    if (weatherCode === 3) {
      return {
        colors: isDay 
          ? ['rgba(241, 245, 249, 0.6)', 'rgba(203, 213, 225, 0.4)'] 
          : ['rgba(148, 163, 184, 0.35)', 'rgba(71, 85, 105, 0.2)'],
        hasClouds: true,
      };
    }

    // 4. Partly Cloudy (Code 2)
    if (weatherCode === 2) {
      if (isDay) {
        return {
          colors: ['rgba(241, 245, 249, 0.5)', 'rgba(226, 232, 240, 0.3)'], // White-Grey
          hasDrift: true,
        };
      } else {
        // Moon with cloud - no stars but blue
        return {
          colors: ['rgba(30, 58, 138, 0.45)', 'rgba(30, 27, 75, 0.25)'], // Blue
          hasClouds: true,
        };
      }
    }

    // 5. Rain / Drizzle: Dark Grey-Blue
    if (weatherCode >= 45 && weatherCode <= 82) {
      return {
        colors: isDay 
          ? ['rgba(71, 85, 105, 0.4)', 'rgba(30, 58, 138, 0.25)'] 
          : ['rgba(30, 41, 59, 0.5)', 'rgba(15, 23, 42, 0.3)'],
        hasMist: true,
      };
    }

    // 6. Clear / Mainly Clear (Code 0, 1)
    if (isDay) {
      // ☀️ - yellow gradient
      return {
        colors: ['rgba(251, 191, 36, 0.4)', 'rgba(255, 255, 255, 0.15)'],
      };
    } else {
      // Night Logic
      const moonPhaseSafe = Number.isFinite(moonPhase) ? moonPhase : 0.5;
      const phaseLum = Math.max(0, Math.min(1, 1 - Math.abs(0.5 - moonPhaseSafe) * 2));
      
      if (phaseLum < 0.15) {
        // 🌑 no moon - blue sky with stars
        return {
          colors: ['rgba(29, 78, 216, 0.35)', 'rgba(30, 27, 75, 0.15)'],
          hasStars: true,
        };
      } else {
        // 🌕 - whitish blue with stars
        return {
          colors: ['rgba(191, 219, 254, 0.45)', 'rgba(255, 255, 255, 0.1)'],
          hasStars: true,
        };
      }
    }
  };

  const config = getConfig();

  return (
    <AnimatePresence>
      {isVisible && locationName && config && (
        <motion.div
          key={`${locationName}-${weatherCode}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed top-0 left-0 right-0 z-[100] h-[50vh] pointer-events-none overflow-hidden gpu"
          style={{ 
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0) 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0) 100%)'
          }}
        >
          {/* Depth Layer 1: Massive Ambient Base Glow */}
          <motion.div
            style={{
              background: `radial-gradient(circle at center, ${config.colors[1] || config.colors[0]}, transparent 80%)`
            }}
            initial={{ scale: 1.4, opacity: 0 }}
            animate={{ 
              scale: 1.8, 
              opacity: [0, 0.6, 0.6, 0],
            }}
            transition={{ 
              duration: 10, 
              ease: "easeInOut",
              times: [0, 0.2, 0.8, 1]
            }}
            className="absolute top-[-40%] left-1/2 -translate-x-1/2 w-[220%] aspect-square rounded-full blur-[140px]"
          />

          {/* Depth Layer 2: Focused Core Atmosphere Animation */}
          <motion.div
            style={{
              background: `radial-gradient(circle at center, ${config.colors[0]}, transparent 70%)`
            }}
            initial={{ scale: 1.0, opacity: 0, y: 0 }}
            animate={{ 
              scale: 1.3, 
              opacity: [0, 0.9, 0.9, 0],
              y: [0, -20] 
            }}
            transition={{ 
              duration: 8, 
              ease: "easeInOut",
              times: [0, 0.2, 0.8, 1],
              delay: 0.5
            }}
            className="absolute top-[-50%] left-1/2 -translate-x-1/2 w-[180%] aspect-square rounded-full blur-[100px]"
          />

          {/* Atmospheric Mist/Glow Pulses (No structure, just color) */}
          {(config.hasClouds || config.hasDrift || config.hasMist) && (
            <div className="absolute inset-0">
               {Array.from({ length: 2 }).map((_, i) => (
                 <motion.div
                  key={`glow-${i}`}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ 
                    opacity: [0, 0.25, 0],
                    scale: [1, 1.3, 1]
                  }}
                  transition={{ 
                    duration: 8 + i * 4, 
                    ease: "easeInOut",
                    repeat: Infinity,
                    delay: i * 2
                  }}
                  className="absolute inset-0 bg-app-text/5 blur-[120px] rounded-full"
                  style={{ top: `${10 + i * 20}%` }}
                 />
               ))}
            </div>
          )}

          {/* Realistic Lightning Flashes - Improved Timing */}
          {config.hasFlashes && (
            <div className="absolute inset-0">
              <motion.div
                animate={{ 
                  opacity: [0, 0.4, 0, 0.3, 0],
                  scale: [1, 1.1, 1, 1.05, 1],
                }}
                transition={{ 
                  duration: 0.5, 
                  delay: 2.5,
                  repeat: Infinity,
                  repeatDelay: 3.5
                }}
                className="absolute inset-x-0 top-0 h-full bg-app-text/10 blur-[140px]"
              />
            </div>
          )}

          {/* Snow Particles */}
          {(config as any).hasSnow && (
            <div className="absolute inset-0">
              {Array.from({ length: 30 }).map((_, i) => (
                <motion.div
                  key={`snow-${i}`}
                  initial={{ 
                    top: -20, 
                    left: `${Math.random() * 100}%`,
                    opacity: 0,
                    scale: 0.5 + Math.random() * 0.5
                  }}
                  animate={{ 
                    top: '100%',
                    left: `${(parseFloat(`${Math.random() * 100}`) - 15) + Math.random() * 30}%`,
                    opacity: [0, 0.8, 0.8, 0],
                  }}
                  transition={{ 
                    duration: 5 + Math.random() * 5, 
                    repeat: Infinity,
                    delay: Math.random() * 12,
                    ease: "linear"
                  }}
                  className="absolute w-1.5 h-1.5 bg-white rounded-full blur-[1px]"
                />
              ))}
            </div>
          )}

          {/* Ethereal Stars - Higher Density & Depth */}
          {config.hasStars && (
            <div className="absolute inset-0 opacity-40">
              {Array.from({ length: 24 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ 
                    opacity: [0, 0.4, 0.8, 0.4, 0],
                    scale: [0.8, 1, 1.2, 1, 0.8]
                  }}
                  transition={{ 
                    duration: 3 + Math.random() * 4, 
                    delay: Math.random() * 8,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="absolute w-[2px] h-[2px] bg-white rounded-full"
                  style={{
                    top: `${Math.random() * 85}%`,
                    left: `${Math.random() * 100}%`,
                    boxShadow: '0 0 4px 1px rgba(255, 255, 255, 0.3)'
                  }}
                />
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
