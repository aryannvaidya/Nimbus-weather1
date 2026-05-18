import { 
  Sun, 
  Cloud, 
  CloudSun, 
  CloudMoon, 
  CloudFog, 
  CloudDrizzle, 
  CloudRain, 
  CloudLightning, 
  CloudSnow,
  CloudRainWind,
  CloudSunRain,
  CloudMoonRain,
  Snowflake, 
  Moon,
  MoonStar,
  Wind,
  Droplets,
  Thermometer,
  Sunrise,
  Sunset,
  Eye,
  Navigation,
  Search,
  MapPin,
  Settings2,
  ChevronRight,
  ChevronLeft,
  X,
  Bell,
  Info,
  ChevronDown,
  Plus,
  Minus,
  ShieldAlert,
  Trash2,
  GripVertical,
  LayoutGrid,
  Loader2,
  ArrowDown,
  Clock,
  CloudOff,
  RotateCcw,
  ShieldCheck,
  Mountain,
  Plane,
  Map,
  Zap,
  ArrowLeft
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export const RawIcons = {
  Sun,
  Cloud,
  CloudSun,
  CloudMoon,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudLightning,
  CloudSnow,
  CloudRainWind,
  CloudSunRain,
  CloudMoonRain,
  Snowflake,
  Moon,
  MoonStar,
  Wind,
  Droplets,
  Thermometer,
  Sunrise,
  Sunset,
  Eye,
  Navigation,
  Search,
  MapPin,
  Settings2,
  ChevronRight,
  ChevronLeft,
  X,
  Bell,
  Info,
  ChevronDown,
  Plus,
  Minus,
  ShieldAlert,
  Trash2,
  GripVertical,
  LayoutGrid,
  Loader2,
  ArrowDown,
  Clock,
  CloudOff,
  RotateCcw,
  ShieldCheck,
  Mountain,
  Plane,
  Map,
  Zap,
  ArrowLeft
};

export type IconType = keyof typeof RawIcons;

interface WeatherIconProps {
  name: IconType;
  style?: 'outline' | 'coloured' | '3d';
  className?: string;
  strokeWidth?: number;
  forceColoured?: boolean;
}

export const WeatherIcon = ({ name, style: propStyle = 'outline', className, strokeWidth = 1.6, forceColoured = false }: WeatherIconProps) => {
  const Icon = RawIcons[name] || Cloud;
  const style = forceColoured ? 'coloured' : propStyle;

  // Define colors for 'coloured' and '3d'
  const getColor = () => {
    // Default to app text for outline unless explicitly asked to be coloured
    if (style === 'outline' && !forceColoured) {
      return 'text-app-text';
    }

    switch (name) {
      case 'Sun': case 'Sunrise': case 'Sunset': return 'text-yellow-400';
      case 'Moon': return 'text-blue-200';
      case 'MoonStar': return 'text-blue-100';
      case 'CloudSunRain': return 'text-orange-200';
      case 'CloudMoonRain': return 'text-blue-200';
      case 'CloudRainWind': return 'text-blue-500';
      case 'CloudSnow': return 'text-blue-100';
      case 'CloudSun': return 'text-orange-300';
      case 'CloudMoon': return 'text-blue-300';
      case 'CloudRain': case 'CloudDrizzle': return 'text-blue-400';
      case 'CloudLightning': return 'text-yellow-500';
      case 'Zap': return 'text-rose-500';
      case 'Snowflake': return 'text-cyan-200';
      case 'Wind': return 'text-sky-400';
      case 'Droplets': return 'text-cyan-400';
      case 'Eye': return 'text-indigo-400';
      case 'Cloud': case 'CloudFog': return 'text-app-text-dim';
      default: return 'text-app-text';
    }
  };

  if (style === 'outline') {
    return <Icon className={cn(getColor(), className)} strokeWidth={strokeWidth} />;
  }

  if (style === 'coloured') {
    return (
      <div className="relative isolate">
        <Icon 
          className={cn(className, getColor())} 
          strokeWidth={strokeWidth || 2} 
        />
        {/* Subtle backing for visibility on light themes */}
        <Icon 
          className={cn(className, "absolute inset-0 -z-10 blur-[1px] opacity-20 text-black")} 
          strokeWidth={(strokeWidth || 2) + 0.5} 
        />
      </div>
    );
  }

  if (style === '3d') {
    return (
      <div className="relative group isolate">
        <Icon 
          className={cn(className, getColor(), "drop-shadow-[0_4px_12px_rgba(0,0,0,0.3)]")} 
          strokeWidth={(strokeWidth || 1.6) + 0.2} 
        />
        {/* Secondary shadow layer */}
        <Icon 
          className={cn(className, "absolute inset-0 -z-10 blur-[4px] opacity-10 text-black")} 
          strokeWidth={(strokeWidth || 1.6) + 1} 
        />
      </div>
    );
  }

  return <Icon className={className} strokeWidth={strokeWidth} />;
};

export const Icons = RawIcons;
