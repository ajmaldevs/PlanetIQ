import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Calendar,
  CheckCircle2,
  Sliders,
  ChevronDown,
} from 'lucide-react';

export interface SharedTimelineProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  activeModules: ('ocean' | 'atmosphere' | 'land')[];
  sidePanelOpen?: boolean;
  trendsOpen?: boolean;
  trendsExpanded?: boolean;
  onOpenPeriodComparison?: () => void;
}

// Generate the 36 continuous calendar months from 2024-01 to 2026-12
export const TIMELINE_MONTHS: Array<{
  id: string;
  year: number;
  month: number;
  label: string;
  shortLabel: string;
  season: 'Winter' | 'Spring' | 'Summer' | 'Autumn';
}> = [];

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

for (let y = 2024; y <= 2026; y++) {
  for (let m = 1; m <= 12; m++) {
    const id = `${y}-${m.toString().padStart(2, '0')}`;
    const season: 'Winter' | 'Spring' | 'Summer' | 'Autumn' =
      m === 12 || m <= 2 ? 'Winter' : m <= 5 ? 'Spring' : m <= 8 ? 'Summer' : 'Autumn';
    TIMELINE_MONTHS.push({
      id,
      year: y,
      month: m,
      label: `${FULL_MONTH_NAMES[m - 1]} ${y}`,
      shortLabel: `${MONTH_NAMES[m - 1]} '${y.toString().slice(2)}`,
      season,
    });
  }
}

export const SharedTimeline: React.FC<SharedTimelineProps> = ({
  selectedDate,
  onDateChange,
  activeModules,
  sidePanelOpen = false,
  trendsOpen = false,
  trendsExpanded = false,
  onOpenPeriodComparison,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.5 | 1 | 2>(1);
  const [rangeStart, setRangeStart] = useState<string>('2024-01');
  const [rangeEnd, setRangeEnd] = useState<string>('2026-12');
  const [showRangePicker, setShowRangePicker] = useState<boolean>(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Active indices
  const currentIndex = useMemo(() => {
    const idx = TIMELINE_MONTHS.findIndex((m) => m.id === selectedDate);
    return idx >= 0 ? idx : TIMELINE_MONTHS.length - 1; // Default to latest
  }, [selectedDate]);

  const rawStartIndex = useMemo(() => {
    const idx = TIMELINE_MONTHS.findIndex((m) => m.id === rangeStart);
    return idx >= 0 ? idx : 0;
  }, [rangeStart]);

  const rawEndIndex = useMemo(() => {
    const idx = TIMELINE_MONTHS.findIndex((m) => m.id === rangeEnd);
    return idx >= 0 ? idx : TIMELINE_MONTHS.length - 1;
  }, [rangeEnd]);

  const startIndex = Math.min(rawStartIndex, rawEndIndex);
  const endIndex = Math.max(rawStartIndex, rawEndIndex);

  // Step controls
  const handlePrev = useCallback(() => {
    const nextIdx = Math.max(startIndex, currentIndex - 1);
    onDateChange(TIMELINE_MONTHS[nextIdx].id);
  }, [currentIndex, startIndex, onDateChange]);

  const handleNext = useCallback(() => {
    const nextIdx = Math.min(endIndex, currentIndex + 1);
    onDateChange(TIMELINE_MONTHS[nextIdx].id);
  }, [currentIndex, endIndex, onDateChange]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const intervalMs = playbackSpeed === 0.5 ? 2000 : playbackSpeed === 1 ? 1100 : 550;

    timerRef.current = setInterval(() => {
      const nextIdx = currentIndex + 1 > endIndex ? startIndex : currentIndex + 1;
      onDateChange(TIMELINE_MONTHS[nextIdx].id);
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, playbackSpeed, currentIndex, startIndex, endIndex, onDateChange]);

  const currentMonthObj = TIMELINE_MONTHS[currentIndex] || TIMELINE_MONTHS[0];

  // Satellite pass & data status calculation
  const coverageStatus = useMemo(() => {
    const parts: string[] = [];
    if (activeModules.includes('ocean')) parts.push('SWOT KaRIn example');
    if (activeModules.includes('atmosphere')) parts.push('GPM IMERG example');
    if (activeModules.includes('land')) parts.push('MODIS example');
    return parts.length > 0 ? parts.join(' • ') : 'Global Planetary Baseline';
  }, [activeModules]);

  return (
    <div
      aria-label="Shared earth observation timeline"
      className={`fixed z-20 transition-all duration-150 pointer-events-none ${
        sidePanelOpen ? 'left-3 sm:left-6 right-3 lg:right-[400px]' : 'left-3 sm:left-6 right-3 sm:right-6'
      } ${trendsOpen ? (trendsExpanded ? 'bottom-[596px] max-[799px]:hidden' : 'bottom-[335px] sm:bottom-[395px]') : 'bottom-16 sm:bottom-6'}`}
    >
      <div className="max-w-4xl mx-auto bg-[#070b14]/95 border border-slate-800/90 rounded-2xl shadow-2xl backdrop-blur-xl p-3 sm:p-4 text-white pointer-events-auto space-y-3">
        {/* Top Controls & Current Date Readout */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 pb-2.5">
          {/* Left: Playback controls */}
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            <button
              onClick={handlePrev}
              disabled={currentIndex <= startIndex}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Step Backward (Previous Month)"
              aria-label="Previous month"
            >
              <SkipBack className="h-4 w-4" />
            </button>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`px-3 py-1.5 rounded-xl font-semibold text-xs flex items-center space-x-1.5 transition-all shadow-md ${
                isPlaying
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30'
              }`}
              title={isPlaying ? 'Pause Timeline Playback' : 'Play Timeline Progression'}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <>
                  <Pause className="h-3.5 w-3.5 fill-current" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                  <span>Play</span>
                </>
              )}
            </button>

            <button
              onClick={handleNext}
              disabled={currentIndex >= endIndex}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Step Forward (Next Month)"
              aria-label="Next month"
            >
              <SkipForward className="h-4 w-4" />
            </button>

            {/* Playback speed selector */}
            <div className="flex items-center bg-slate-900/90 rounded-lg border border-slate-800 p-0.5 text-[11px] font-mono">
              {([0.5, 1, 2] as const).map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    playbackSpeed === spd
                      ? 'bg-cyan-500/30 text-cyan-200 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title={`${spd}x Playback Speed`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          {/* Center / Right: Active Date Indicator & Range Selector */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 bg-slate-900/90 border border-slate-800/80 px-3 py-1 rounded-xl shadow-inner">
              <Calendar className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-xs sm:text-sm font-bold tracking-wide font-mono text-cyan-200">
                {currentMonthObj.label}
              </span>
              <span className="hidden sm:inline-block text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                {currentMonthObj.season}
              </span>
            </div>

            {/* Range Toggle */}
            <button
              onClick={() => setShowRangePicker(!showRangePicker)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors flex items-center space-x-1 text-xs"
              title="Configure Time Range"
            >
              <Sliders className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-[11px]">Range</span>
              <ChevronDown className="h-3 w-3" />
            </button>

            {/* Direct Link to Period Comparison */}
            {onOpenPeriodComparison && (
              <button
                onClick={onOpenPeriodComparison}
                className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-[11px] font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer"
                title="Compare Two Historical Periods (Period A vs Period B)"
              >
                <span className="hidden sm:inline">Compare Periods</span>
                <span className="sm:hidden">Compare</span>
              </button>
            )}
          </div>
        </div>

        {/* Range picker collapsible bar */}
        {showRangePicker && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/70 text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-slate-400">Window:</span>
              <select
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
              >
                {TIMELINE_MONTHS.map((m) => (
                  <option key={`start-${m.id}`} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <span className="text-slate-500">to</span>
              <select
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
              >
                {TIMELINE_MONTHS.map((m) => (
                  <option key={`end-${m.id}`} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-1.5 text-[11px]">
              <span className="text-slate-400">Quick Presets:</span>
              <button
                onClick={() => {
                  setRangeStart('2024-01');
                  setRangeEnd('2024-12');
                }}
                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300"
              >
                2024 (El Niño)
              </button>
              <button
                onClick={() => {
                  setRangeStart('2025-01');
                  setRangeEnd('2025-12');
                }}
                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300"
              >
                2025 (Neutral)
              </button>
              <button
                onClick={() => {
                  setRangeStart('2024-01');
                  setRangeEnd('2026-12');
                }}
                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300"
              >
                Full Multi-Year
              </button>
            </div>
          </div>
        )}

        {/* Interactive Timeline Scrubber Slider */}
        <div className="space-y-1.5">
          <div className="relative flex items-center">
            {/* Base track */}
            <input
              type="range"
              min={startIndex}
              max={endIndex}
              step={1}
              value={currentIndex}
              onChange={(e) => {
                const idx = parseInt(e.target.value, 10);
                if (TIMELINE_MONTHS[idx]) {
                  onDateChange(TIMELINE_MONTHS[idx].id);
                }
              }}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
              aria-label="Earth Observation Timeline Scrubber"
            />
          </div>

          {/* Month Tick Markers & Years */}
          <div className="flex justify-between items-center px-1 text-[10px] font-mono text-slate-400 select-none">
            <span
              onClick={() => onDateChange('2024-01')}
              className="cursor-pointer hover:text-cyan-300 transition-colors"
            >
              2024 Jan (El Niño Peak)
            </span>
            <span
              onClick={() => onDateChange('2025-01')}
              className="cursor-pointer hover:text-cyan-300 transition-colors hidden sm:inline"
            >
              2025 Jan
            </span>
            <span
              onClick={() => onDateChange('2025-07')}
              className="cursor-pointer hover:text-cyan-300 transition-colors hidden md:inline"
            >
              2025 Jul (Neutral)
            </span>
            <span
              onClick={() => onDateChange('2026-03')}
              className="cursor-pointer hover:text-cyan-300 transition-colors"
            >
              2026 Mar (Recent)
            </span>
            <span
              onClick={() => onDateChange('2026-12')}
              className="cursor-pointer hover:text-cyan-300 transition-colors"
            >
              2026 Dec
            </span>
          </div>
        </div>

        {/* Observation coverage status */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400 font-sans border-t border-slate-800/60">
          <div className="flex items-center space-x-1.5 min-w-0">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">
              Observation coverage: <strong className="text-slate-300">{coverageStatus}</strong>
            </span>
          </div>

          <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-500">
            <span>Telemetry cadence: Monthly</span>
            <span>•</span>
            <span>Calibrated observations</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedTimeline;
