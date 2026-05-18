import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icons } from './WeatherIcons';
import { searchLocations, reverseGeocode } from '../services/weatherService';
import { Location } from '../types';
import debounce from 'lodash.debounce';
import { motion, AnimatePresence } from 'motion/react';
import { cn, GLASS_STYLE } from '../lib/utils';
import { Haptic } from '../lib/haptics';
import Fuse from 'fuse.js';

interface SearchBarProps {
  onSelect: (location: Location) => void;
  onClose: () => void;
  hapticEnabled: boolean;
}

export default function SearchBar({ onSelect, onClose, hapticEnabled }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [rawResults, setRawResults] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Fuse instance for client-side fuzzy refinement
  const fuse = useMemo(() => {
    return new Fuse(rawResults, {
      keys: ['name', 'admin1', 'admin2', 'country', 'type'],
      threshold: 0.4,
      includeScore: true,
      shouldSort: true,
    });
  }, [rawResults]);

  // Derived results using Fuse.js if query is present, otherwise raw
  const results = useMemo(() => {
    if (!query || rawResults.length === 0) return rawResults;
    const fuseResults = fuse.search(query);
    return fuseResults.length > 0 ? fuseResults.map(r => r.item) : rawResults;
  }, [fuse, rawResults, query]);

  const debouncedSearch = useRef(
    debounce(async (q: string) => {
      if (q.length < 2) {
        setRawResults([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const locations = await searchLocations(q);
        setRawResults(locations);
      } catch (error) {
        console.error('Search failed', error);
      } finally {
        setIsLoading(false);
      }
    }, 300)
  ).current;

  useEffect(() => {
    debouncedSearch(query);
  }, [query]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 30, scale: 0.98 }}
      transition={{ 
        duration: 0.5, 
        ease: [0.22, 1, 0.36, 1],
        opacity: { duration: 0.3 }
      }}
      className="fixed inset-0 z-[100] bg-app-bg/90 backdrop-blur-2xl flex flex-col pt-[calc(env(safe-area-inset-top)+24px)]"
    >
      <div className="max-w-[390px] mx-auto w-full px-6 flex flex-col h-full">
        <header className="flex items-center gap-4 mb-8">
          <div className={cn(
            "flex-1 flex items-center gap-3 px-4 py-3 bg-app-text/10 border border-app-border rounded-2xl transition-all duration-300",
            "focus-within:bg-app-text/15 focus-within:ring-1 focus-within:ring-app-text/20"
          )}>
            <Icons.Search className="w-5 h-5 text-app-text-dim/40" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search city..."
              className="bg-transparent border-none outline-none flex-1 text-app-text placeholder:text-app-text-dim/60 text-[17px]"
            />
            {query && (
              <button 
                onClick={() => { 
                  Haptic.light(hapticEnabled);
                  setQuery(''); 
                  setRawResults([]); 
                }} 
                className="text-app-text-dim/40 hover:text-app-text"
              >
                <Icons.X className="w-5 h-5 bg-app-text/10 rounded-full p-1" />
              </button>
            )}
          </div>
          <button 
            onClick={() => {
              Haptic.light(hapticEnabled);
              onClose();
            }}
            className="text-[17px] font-medium text-app-text-dim hover:text-app-text transition-colors"
          >
            Cancel
          </button>
        </header>

        <div className="flex-1 overflow-y-auto no-scrollbar pb-12">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-app-border border-t-app-text rounded-full animate-spin" />
              <p className="text-[13px] font-medium text-app-text-dim/40 uppercase tracking-widest">Searching</p>
            </div>
          ) : results.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-[11px] font-semibold text-app-text-dim/40 uppercase tracking-[0.1em] px-2 mb-2">Search Results</h3>
              {results.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => {
                    Haptic.success(hapticEnabled);
                    onSelect(loc);
                  }}
                  className="w-full flex items-center gap-4 p-4 text-left active:bg-app-text/5 bg-app-surface border border-app-border rounded-2xl transition-all group"
                >
                  <div className="p-3 bg-app-text/5 rounded-xl group-active:scale-95 transition-transform">
                    {loc.type === 'Mountain' || loc.type === 'Peak' ? (
                      <Icons.Mountain className="w-5 h-5 text-app-text-dim/40 flex-shrink-0" />
                    ) : loc.type === 'Airport' ? (
                      <Icons.Plane className="w-5 h-5 text-app-text-dim/40 flex-shrink-0" />
                    ) : loc.type === 'Region' || loc.type === 'District' ? (
                      <Icons.Map className="w-5 h-5 text-app-text-dim/40 flex-shrink-0" />
                    ) : (
                      <Icons.MapPin className="w-5 h-5 text-app-text-dim/40 flex-shrink-0" />
                    )}
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[16px] font-medium text-app-text truncate">{loc.name}</span>
                      {loc.type && (
                        <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-app-text/10 text-app-text-dim/60 rounded-[4px]">
                          {loc.type}
                        </span>
                      )}
                    </div>
                    <span className="text-[13px] text-app-text-dim truncate">
                      {loc.admin2 ? `${loc.admin2}, ` : ''}
                      {loc.admin1 ? `${loc.admin1}, ` : ''}
                      {loc.country}
                    </span>
                  </div>
                  <Icons.Plus className="w-5 h-5 text-app-text-dim/20" />
                </button>
              ))}
            </div>
          ) : query.length >= 2 ? (
            <div className="py-20 text-center opacity-40">
              <Icons.Search className="w-12 h-12 mx-auto mb-4 opacity-10" />
              <p className="text-[15px] text-app-text">No results found for "{query}"</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <h3 className="text-[11px] font-semibold text-app-text-dim/40 uppercase tracking-[0.1em] px-2 mb-2">Nearby</h3>
                
                {geoError && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl mb-2"
                  >
                    <div className="flex gap-3">
                      <Icons.ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0" />
                      <div className="flex flex-col gap-1">
                        <p className="text-[13px] font-bold text-red-500 uppercase tracking-wider">Location Error</p>
                        <p className="text-[12px] text-app-text-dim leading-relaxed">
                          {geoError.includes('denied') 
                            ? "Location access is blocked. Please enable GPS/Location in your device settings and allow the browser to see your location."
                            : geoError}
                        </p>
                        <button 
                          onClick={() => setGeoError(null)}
                          className="text-[11px] font-black text-app-text uppercase tracking-widest mt-2 hover:opacity-70 transition-all text-left"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                <button 
                  onClick={() => {
                    Haptic.medium(hapticEnabled);
                    setGeoError(null);
                    if (navigator.geolocation) {
                      setIsLoading(true);
                      navigator.geolocation.getCurrentPosition(
                        async (pos) => {
                          try {
                            const lat = pos.coords.latitude;
                            const lon = pos.coords.longitude;
                            
                            // Try to get a real city name
                            const resolvedLocation = await reverseGeocode(lat, lon);
                            
                            const curLoc: Location = {
                              id: resolvedLocation?.name ? Math.floor(Date.now() / 1000) : 0, 
                              name: resolvedLocation?.name || "Current Location",
                              latitude: lat,
                              longitude: lon,
                              country: resolvedLocation?.country || "Nearby",
                              admin1: resolvedLocation?.admin1,
                              admin2: resolvedLocation?.admin2,
                              timezone: resolvedLocation?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                              type: resolvedLocation?.type,
                              featureCode: resolvedLocation?.featureCode
                            };
                            
                            Haptic.success(hapticEnabled);
                            onSelect(curLoc);
                          } catch (err) {
                            console.error("Reverse geocoding error:", err);
                            // Fallback if reverse geocode fails
                            onSelect({
                              id: 0,
                              name: "Current Location",
                              latitude: pos.coords.latitude,
                              longitude: pos.coords.longitude,
                              country: "Nearby",
                              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
                            });
                          } finally {
                            setIsLoading(false);
                          }
                        },
                        (err) => {
                          console.warn("Geolocation denied in search:", err);
                          setIsLoading(false);
                          if (err.code === err.PERMISSION_DENIED) {
                            setGeoError("Permission denied. We need your permission to fetch weather for your exact location.");
                          } else if (err.code === err.POSITION_UNAVAILABLE) {
                            setGeoError("Location signals unavailable. Ensure GPS is enabled or try using a high-precision location service.");
                          } else if (err.code === err.TIMEOUT) {
                            setGeoError("Location request timed out. Please check your connection.");
                          } else {
                            setGeoError("An unknown location error occurred.");
                          }
                        },
                        { timeout: 10000, enableHighAccuracy: true }
                      );
                    } else {
                      setGeoError("Geolocation is not supported by your browser.");
                    }
                  }}
                  className="w-full flex items-center gap-4 p-4 text-left active:bg-app-text/5 bg-app-surface border border-app-border rounded-2xl transition-all"
                >
                  <div className="p-3 bg-app-text/5 rounded-xl">
                    <Icons.Navigation className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[16px] font-medium text-app-text">Current Location</span>
                    <span className="text-[13px] text-app-text-dim/60">Use your device's GPS</span>
                  </div>
                  <Icons.ChevronRight className="w-5 h-5 text-app-text-dim/20 ml-auto" />
                </button>
              </div>

              <div className="py-10 text-center opacity-20">
                <Icons.MapPin className="w-16 h-16 mx-auto mb-6 opacity-10" />
                <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-app-text">Global Database</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
