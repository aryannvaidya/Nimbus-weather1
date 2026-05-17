import React, { useState, useEffect, useRef } from 'react';
import { Icons } from './WeatherIcons';
import { searchLocations } from '../services/weatherService';
import { Location } from '../types';
import debounce from 'lodash.debounce';
import { motion, AnimatePresence } from 'motion/react';
import { cn, GLASS_STYLE } from '../lib/utils';
import { Haptic } from '../lib/haptics';

interface SearchBarProps {
  onSelect: (location: Location) => void;
  onClose: () => void;
  hapticEnabled: boolean;
}

export default function SearchBar({ onSelect, onClose, hapticEnabled }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const debouncedSearch = useRef(
    debounce(async (q: string) => {
      if (q.length < 2) {
        setResults([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const locations = await searchLocations(q);
        setResults(locations);
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-app-bg/90 backdrop-blur-2xl flex flex-col pt-12"
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
                  setResults([]); 
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
                  className="w-full flex items-center gap-4 p-4 text-left active:bg-app-text/5 bg-app-surface border border-app-border rounded-2xl transition-all"
                >
                  <div className="p-3 bg-app-text/5 rounded-xl">
                    <Icons.MapPin className="w-5 h-5 text-app-text-dim/40 flex-shrink-0" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[16px] font-medium text-app-text">{loc.name}</span>
                    <span className="text-[13px] text-app-text-dim">{loc.admin1 ? `${loc.admin1}, ` : ''}{loc.country}</span>
                  </div>
                  <Icons.Plus className="w-5 h-5 text-app-text-dim/20 ml-auto" />
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
                <button 
                  onClick={() => {
                    Haptic.medium(hapticEnabled);
                    if (navigator.geolocation) {
                      setIsLoading(true);
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          const curLoc: Location = {
                            id: 0,
                            name: "Current Location",
                            latitude: pos.coords.latitude,
                            longitude: pos.coords.longitude,
                            country: "Nearby",
                            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
                          };
                          Haptic.success(hapticEnabled);
                          onSelect(curLoc);
                          setIsLoading(false);
                        },
                        (err) => {
                          console.warn("Geolocation denied in search:", err);
                          setIsLoading(false);
                          // Maybe show a toast or message
                        },
                        { timeout: 8000 }
                      );
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
