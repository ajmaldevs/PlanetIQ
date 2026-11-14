import React from 'react';
import { AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

interface DataNoticeProps {
  type: 'demo' | 'info' | 'pending' | 'verified';
  title?: string;
  children: React.ReactNode;
}

export const DataNotice: React.FC<DataNoticeProps> = ({
  type,
  title,
  children,
}) => {
  const styles = {
    demo: {
      bg: 'bg-amber-950/20 border-amber-800/40 text-amber-300',
      icon: <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />,
      defaultTitle: 'Demonstration Model (Pre-Ingestion)',
    },
    info: {
      bg: 'bg-cyan-950/20 border-cyan-800/40 text-cyan-300',
      icon: <Info className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />,
      defaultTitle: 'Scientific Dataset Context',
    },
    pending: {
      bg: 'bg-rose-950/20 border-rose-800/40 text-rose-300',
      icon: <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />,
      defaultTitle: 'Decision Required / Content Unavailable',
    },
    verified: {
      bg: 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300',
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />,
      defaultTitle: 'Calibrated Observation',
    },
  }[type];

  return (
    <div className={`border rounded-lg p-3 text-xs flex items-start space-x-2.5 ${styles.bg}`}>
      {styles.icon}
      <div className="space-y-0.5">
        <p className="font-semibold tracking-wide uppercase text-[10px]">
          {title || styles.defaultTitle}
        </p>
        <div className="text-slate-300 leading-relaxed">{children}</div>
      </div>
    </div>
  );
};
