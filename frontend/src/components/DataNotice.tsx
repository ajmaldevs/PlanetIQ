import React, { useState } from 'react';
import { AlertTriangle, Info, CheckCircle2, X } from 'lucide-react';

interface DataNoticeProps {
  type: 'demo' | 'info' | 'pending' | 'verified';
  title?: string;
  children: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

export const DataNotice: React.FC<DataNoticeProps> = ({
  type,
  title,
  children,
  dismissible = false,
  onDismiss,
  className = '',
}) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (onDismiss) onDismiss();
  };

  const styles = {
    demo: {
      bg: 'bg-amber-950/30 border-amber-800/50 text-amber-300',
      icon: <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />,
      defaultTitle: 'Demonstration Model (Pre-Ingestion)',
    },
    info: {
      bg: 'bg-cyan-950/30 border-cyan-800/50 text-cyan-300',
      icon: <Info className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />,
      defaultTitle: 'Scientific Dataset Context',
    },
    pending: {
      bg: 'bg-rose-950/30 border-rose-800/50 text-rose-300',
      icon: <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />,
      defaultTitle: 'Decision Required / Content Unavailable',
    },
    verified: {
      bg: 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300',
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />,
      defaultTitle: 'Calibrated Observation',
    },
  }[type];

  return (
    <div className={`border rounded-xl p-3 text-xs flex items-start justify-between space-x-2.5 backdrop-blur-md shadow-lg ${styles.bg} ${className}`}>
      <div className="flex items-start space-x-2.5 min-w-0">
        {styles.icon}
        <div className="space-y-0.5 min-w-0">
          <p className="font-semibold tracking-wide uppercase text-[10px]">
            {title || styles.defaultTitle}
          </p>
          <div className="text-slate-300 leading-relaxed text-[11px] sm:text-xs">{children}</div>
        </div>
      </div>
      {(dismissible || onDismiss) && (
        <button
          onClick={handleDismiss}
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors shrink-0 ml-2 cursor-pointer"
          title="Dismiss notice"
          aria-label="Dismiss notice"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};
