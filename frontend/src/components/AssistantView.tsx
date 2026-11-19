import React, { useState, useEffect, useRef } from 'react';
import {
  queryAssistant,
  AssistantQueryResponse,
  ScientificCitation,
  VisualBlock,
  MetricCardBlock,
  TimeseriesChartBlock,
  ComparisonTableBlock,
  AnomalyAlertBlock,
  DataQualityBlock,
} from '../services/api';
import {
  Send,
  Sparkles,
  ExternalLink,
  User,
  Activity,
  AlertTriangle,
  Database,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';
import { EarthModule } from './EarthGlobe';
import { DataNotice } from './DataNotice';

interface AssistantViewProps {
  activeModule?: EarthModule;
  selectedLocationName?: string;
  selectedDate?: string;
  initialPrompt?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  grounding?: ScientificCitation[];
  followups?: string[];
  visualBlocks?: VisualBlock[];
  toolCalls?: string[];
  dataStatus?: string;
  timestamp: string;
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  get_ocean_observations: 'Ocean Altimetry & Chlorophyll-a',
  get_precipitation_data: 'GPM Precipitation',
  get_vegetation_indices: 'MODIS Vegetation Indices',
  compare_regions: 'Regional Comparison',
  get_historical_trends: 'Historical Trends',
  get_cross_system_analysis: 'Teleconnection Coupling',
  get_dataset_metadata: 'Dataset Metadata',
  get_data_quality_information: 'Data Quality Audit',
};

const renderInlineMarkdown = (text: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`|\[.*?\]\(.*?\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={match.index} className="text-white font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={match.index} className="text-slate-200 italic">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={match.index}
          className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 text-cyan-300 rounded font-mono text-[11px]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
      const linkText = token.substring(1, token.indexOf(']('));
      const linkUrl = token.substring(token.indexOf('](') + 2, token.length - 1);
      parts.push(
        <a
          key={match.index}
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-400 hover:text-cyan-300 underline inline-flex items-center gap-0.5"
        >
          {linkText}
          <ExternalLink className="h-2.5 w-2.5 inline opacity-70" />
        </a>
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return parts.length > 0 ? parts : text;
};

const FormattedMarkdown: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listItems: React.ReactNode[] = [];
  let inAlert = false;
  let alertLines: string[] = [];

  const flushList = () => {
    if (inList) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-1.5 space-y-1 list-disc list-inside text-slate-300 pl-1">
          {listItems}
        </ul>
      );
      inList = false;
      listItems = [];
    }
  };

  const flushAlert = () => {
    if (inAlert) {
      const alertContent = alertLines.join(' ');
      const cleanAlert = alertContent.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i, '');
      elements.push(
        <div
          key={`alert-${elements.length}`}
          className="my-2.5 p-3 rounded-xl bg-cyan-950/40 border border-cyan-800/60 text-cyan-200 text-xs flex items-start space-x-2"
        >
          <ShieldCheck className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">{renderInlineMarkdown(cleanAlert)}</div>
        </div>
      );
      inAlert = false;
      alertLines = [];
    }
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    // Blockquote alerts: > [!NOTE] or > text
    if (trimmed.startsWith('>')) {
      flushList();
      inAlert = true;
      alertLines.push(trimmed.replace(/^>\s*/, ''));
      return;
    } else if (inAlert) {
      flushAlert();
    }

    // Horizontal rule
    if (trimmed === '---' || trimmed === '***') {
      flushList();
      elements.push(<hr key={`hr-${i}`} className="border-slate-800/80 my-2.5" />);
      return;
    }

    // Headers
    if (trimmed.startsWith('#### ')) {
      flushList();
      elements.push(
        <h4 key={`h4-${i}`} className="text-xs font-semibold text-cyan-300 mt-2 mb-1 flex items-center gap-1.5">
          {renderInlineMarkdown(trimmed.replace(/^####\s*/, ''))}
        </h4>
      );
      return;
    }
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h3 key={`h3-${i}`} className="text-sm font-semibold text-white mt-3 mb-1.5 flex items-center gap-1.5 border-b border-slate-800/50 pb-1">
          {renderInlineMarkdown(trimmed.replace(/^###\s*/, ''))}
        </h3>
      );
      return;
    }

    // List items
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      inList = true;
      listItems.push(
        <li key={`li-${i}`} className="text-slate-300 text-xs sm:text-sm leading-relaxed">
          {renderInlineMarkdown(trimmed.replace(/^[-*]\s*/, ''))}
        </li>
      );
      return;
    } else {
      flushList();
    }

    // Blank line
    if (!trimmed) {
      return;
    }

    // Standard paragraph
    elements.push(
      <p key={`p-${i}`} className="text-slate-200 leading-relaxed text-xs sm:text-sm my-1">
        {renderInlineMarkdown(trimmed)}
      </p>
    );
  });

  flushList();
  flushAlert();

  return <div className="space-y-1">{elements}</div>;
};

export const AssistantView: React.FC<AssistantViewProps> = ({
  activeModule = null,
  selectedLocationName = 'Global Earth Systems',
  selectedDate = '2026-03',
  initialPrompt,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Welcome to the **PlanetIQ Scientific Assistant**.\n\nI am connected to authoritative NASA Earth observation tools (SWOT KaRIn ocean altimetry, GPM IMERG precipitation, and MODIS vegetation indices). I can analyse physical measurements, compare regions, chart historical anomalies, and inspect satellite data quality.\n\nWhat would you like to investigate?',
      grounding: [
        {
          dataset_id: 'SWOT_L2_LR_SSH',
          mission: 'Surface Water and Ocean Topography',
          variable: 'Sea Surface Height (m)',
          units: 'meters (m)',
          doi_or_url: 'https://doi.org/10.5067/SWOT-SSH-L2-LR',
        },
        {
          dataset_id: 'GPM_3IMERGM',
          mission: 'Global Precipitation Measurement',
          variable: 'Final Monthly Precipitation',
          units: 'mm/hr and mm',
          doi_or_url: 'https://doi.org/10.5067/GPM/IMERG/3B-MONTH/07',
        },
        {
          dataset_id: 'MOD13C2',
          mission: 'MODIS Terra/Aqua',
          variable: 'Vegetation Indices (NDVI/EVI)',
          units: 'dimensionless (-0.2 to 1.0)',
          doi_or_url: 'https://doi.org/10.5067/MODIS/MOD13C2.061',
        },
      ],
      followups: [
        'What are the ocean eddies and SSH in the Gulf Stream?',
        'Compare precipitation between the Amazon and the Sahel.',
        'Show historical trends of rainfall in the Bay of Bengal.',
        'Explain how El Niño couples ocean height to vegetation greenness.',
      ],
      dataStatus: 'observation',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const prompt = textToSend || inputPrompt;
    if (!prompt.trim() || loading) return;

    const userMsg: Message = {
      role: 'user',
      content: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const currentHistory = messages.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputPrompt('');
    setLoading(true);

    try {
      const result: AssistantQueryResponse = await queryAssistant(
        prompt,
        {
          active_module: activeModule || 'overview',
          selected_region: selectedLocationName,
          selected_date: selectedDate,
        },
        currentHistory
      );

      const assistantMsg: Message = {
        role: 'assistant',
        content: result.response,
        grounding: result.scientific_grounding,
        followups: result.suggested_followups,
        visualBlocks: result.visual_blocks,
        toolCalls: result.tool_calls_executed,
        dataStatus: result.data_status,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error('Error querying assistant:', err);
      const errorMsg: Message = {
        role: 'assistant',
        content:
          'I encountered a communication delay connecting to the scientific intelligence service. Please ensure the backend is running at http://localhost:8000 and try again.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const autoPromptSentRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialPrompt && initialPrompt.trim() && autoPromptSentRef.current !== initialPrompt) {
      autoPromptSentRef.current = initialPrompt;
      handleSend(initialPrompt);
    }
  }, [initialPrompt]);

  // --- Visual Block Renderers ---

  const renderMetricCardBlock = (block: MetricCardBlock, idx: number) => (
    <div key={idx} className="mt-3 p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
      <div className="flex items-center justify-between text-[11px] font-semibold text-cyan-400">
        <span className="flex items-center space-x-1.5">
          <Activity className="h-3 w-3" />
          <span>{block.title}</span>
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {block.metrics.map((m, mIdx) => (
          <div key={mIdx} className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
            <div className="text-[10px] text-slate-400 font-mono truncate">{m.title}</div>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-base font-bold text-white font-mono">{m.value}</span>
              <span className="text-[10px] text-cyan-400 font-mono">{m.unit}</span>
            </div>
            {m.subtext && <div className="text-[9px] text-slate-400 mt-0.5">{m.subtext}</div>}
            {m.badge && (
              <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-mono">
                {m.badge}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderTimeseriesChartBlock = (block: TimeseriesChartBlock, idx: number) => {
    const pts = block.points || [];
    if (pts.length < 2) return null;

    const values = pts.map((p) => p.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1.0;

    const svgWidth = 380;
    const svgHeight = 90;
    const padX = 15;
    const padY = 12;

    const coords = pts.map((p, i) => {
      const x = padX + (i / (pts.length - 1)) * (svgWidth - 2 * padX);
      const y = svgHeight - padY - ((p.value - minVal) / range) * (svgHeight - 2 * padY);
      return { x, y, ...p };
    });

    const pathD = coords.reduce(
      (acc, c, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`,
      ''
    );
    const areaD = `${pathD} L ${coords[coords.length - 1].x.toFixed(1)} ${svgHeight - padY} L ${coords[0].x.toFixed(1)} ${svgHeight - padY} Z`;

    return (
      <div key={idx} className="mt-3 p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-[11px] font-semibold text-cyan-400">
          <span className="flex items-center space-x-1.5">
            <TrendingUp className="h-3 w-3" />
            <span>{block.title}</span>
          </span>
          <span className="text-[10px] font-mono text-slate-400">Unit: {block.unit}</span>
        </div>

        <div className="bg-slate-950/90 p-2 rounded-lg border border-slate-800/80">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-24 overflow-visible">
            <defs>
              <linearGradient id={`grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            {/* Area Fill */}
            <path d={areaD} fill={`url(#grad-${idx})`} />
            {/* Line Path */}
            <path d={pathD} fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" />
            {/* Latest Point Dot */}
            {coords.length > 0 && (
              <circle
                cx={coords[coords.length - 1].x}
                cy={coords[coords.length - 1].y}
                r="3.5"
                fill="#22d3ee"
                className="animate-pulse"
              />
            )}
          </svg>

          {/* Timeline Labels */}
          <div className="flex justify-between items-center text-[9px] font-mono text-slate-400 mt-1 px-1">
            <span>{pts[0]?.date}</span>
            <span className="text-cyan-300 font-semibold">
              Min: {minVal.toFixed(2)} | Max: {maxVal.toFixed(2)} {block.unit}
            </span>
            <span>{pts[pts.length - 1]?.date}</span>
          </div>
        </div>

        {block.interpretation && (
          <div className="text-[10px] text-slate-300 font-sans italic bg-slate-950/40 p-2 rounded border border-slate-800/40">
            {block.interpretation}
          </div>
        )}
      </div>
    );
  };

  const renderComparisonTableBlock = (block: ComparisonTableBlock, idx: number) => (
    <div key={idx} className="mt-3 p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
      <div className="flex items-center justify-between text-[11px] font-semibold text-cyan-400">
        <span className="flex items-center space-x-1.5">
          <Activity className="h-3 w-3" />
          <span>{block.title}</span>
        </span>
        <span className="text-[10px] font-mono text-slate-400">{block.metric_label}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px] border border-slate-800/80 rounded-lg overflow-hidden font-mono">
          <thead className="bg-slate-950 text-slate-400 text-[10px] border-b border-slate-800">
            <tr>
              <th className="py-1.5 px-2.5">Region / Parameter</th>
              <th className="py-1.5 px-2.5">Value</th>
              <th className="py-1.5 px-2.5">Unit</th>
              <th className="py-1.5 px-2.5">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {block.rows.map((r, rIdx) => (
              <tr key={rIdx} className={r.metric === 'Absolute Delta' ? 'bg-cyan-950/30 font-semibold text-cyan-300' : 'bg-slate-900/40 text-slate-200'}>
                <td className="py-1.5 px-2.5">{r.region || r.metric}</td>
                <td className="py-1.5 px-2.5 font-bold">{r.value}</td>
                <td className="py-1.5 px-2.5 text-slate-400">{r.unit}</td>
                <td className="py-1.5 px-2.5 text-slate-400 text-[10px]">{r.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderAnomalyAlertBlock = (block: AnomalyAlertBlock, idx: number) => (
    <div
      key={idx}
      className={`mt-3 p-3 rounded-xl border flex items-start space-x-2.5 ${
        block.level === 'critical'
          ? 'bg-rose-950/30 border-rose-800/70 text-rose-200'
          : block.level === 'warning'
          ? 'bg-amber-950/30 border-amber-800/70 text-amber-200'
          : 'bg-cyan-950/30 border-cyan-800/70 text-cyan-200'
      }`}
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="space-y-1">
        <div className="text-[11px] font-bold">{block.title}</div>
        <div className="text-[10px] leading-relaxed text-slate-300 font-sans">{block.description}</div>
        {block.affected_region && (
          <div className="text-[9px] font-mono text-cyan-400">Region: {block.affected_region}</div>
        )}
      </div>
    </div>
  );

  const renderDataQualityBlock = (block: DataQualityBlock, idx: number) => (
    <div key={idx} className="mt-3 p-3 bg-slate-950/80 border border-slate-800/90 rounded-xl space-y-1.5 text-[10px]">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-1">
        <span className="flex items-center space-x-1.5 font-mono font-semibold text-slate-300">
          <ShieldCheck className="h-3 w-3 text-emerald-400" />
          <span>Scientific Provenance & Limitations</span>
        </span>
        <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-800">
          Status: {block.data_status === 'observation' ? 'Live Ingested Observation' : 'Dataset Methodology Reference'}
        </span>
      </div>
      <div className="text-slate-400 font-sans">
        <span className="text-slate-300 font-semibold font-mono">Sensor Suite:</span> {block.sensor}
      </div>
      {block.limitations && block.limitations.length > 0 && (
        <ul className="list-disc list-inside space-y-0.5 text-slate-400 text-[9px] font-sans pl-1">
          {block.limitations.map((lim, lIdx) => (
            <li key={lIdx}>{lim}</li>
          ))}
        </ul>
      )}
      {block.uncertainty_note && (
        <div className="text-[9px] text-slate-500 font-mono pt-0.5">{block.uncertainty_note}</div>
      )}
    </div>
  );

  const renderVisualBlock = (block: VisualBlock, idx: number) => {
    switch (block.type) {
      case 'metric_card':
        return renderMetricCardBlock(block as MetricCardBlock, idx);
      case 'timeseries_chart':
        return renderTimeseriesChartBlock(block as TimeseriesChartBlock, idx);
      case 'comparison_table':
        return renderComparisonTableBlock(block as ComparisonTableBlock, idx);
      case 'anomaly_alert':
        return renderAnomalyAlertBlock(block as AnomalyAlertBlock, idx);
      case 'data_quality':
        return renderDataQualityBlock(block as DataQualityBlock, idx);
      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full flex flex-col h-[calc(100dvh-7.5rem)] min-h-[380px] max-h-[780px] bg-[#090d16]/90 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="bg-[#0b0f19] border-b border-slate-800/80 px-3.5 sm:px-6 py-3 sm:py-4 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-semibold text-white">PlanetIQ AI Research Assistant</h3>
            <p className="text-[10px] sm:text-[11px] text-slate-400 line-clamp-1">
              Grounded in NASA SWOT KaRIn, GPM IMERG v07, and MODIS MOD13C2
            </p>
          </div>
        </div>

        {/* Current Active Context Badges */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/50 text-[10px] text-emerald-300 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>NASA Grounded</span>
          </div>
          <div className="text-[10px] sm:text-[11px] font-mono text-slate-400 bg-slate-900/80 px-2.5 sm:px-3 py-1 rounded-full border border-slate-800 shrink-0">
            Sphere: <span className="text-cyan-400 capitalize">{activeModule || 'Global Systems'}</span>
          </div>
          <div className="text-[10px] sm:text-[11px] font-mono text-slate-400 bg-slate-900/80 px-2.5 sm:px-3 py-1 rounded-full border border-slate-800 shrink-0 hidden sm:block">
            Date: <span className="text-cyan-400">{selectedDate}</span>
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-4">
        <DataNotice type="info" title="Scientific Assistant Scope & Provenance">
          Answers synthesize verified NASA dataset methodology with live telemetry queries. Calibrated algorithms and official CMR granule discovery are active across land, ocean, and atmosphere spheres.
        </DataNotice>

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-2xl rounded-2xl p-3.5 sm:p-4 text-xs sm:text-sm leading-relaxed space-y-3 ${
                msg.role === 'user'
                  ? 'bg-cyan-600 text-white ml-2 sm:ml-6 md:ml-8 shadow-md'
                  : 'bg-[#0f1422] border border-slate-800/80 text-slate-200 mr-2 sm:mr-6 md:mr-8 shadow-lg w-full'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-700/30 pb-1">
                <span className="flex items-center space-x-1.5 font-medium">
                  {msg.role === 'user' ? (
                    <>
                      <User className="h-3 w-3 text-white" />
                      <span className="text-white">You</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3 text-cyan-400" />
                      <span className="text-cyan-400 font-semibold">PlanetIQ Assistant</span>
                    </>
                  )}
                </span>
                <span className="font-mono">{msg.timestamp}</span>
              </div>

              {/* Tool Execution Badges */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center pt-0.5">
                  <span className="text-[9px] font-mono text-slate-400 uppercase">Scientific Tools:</span>
                  {msg.toolCalls.map((tName, tIdx) => (
                    <span
                      key={tIdx}
                      className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-cyan-950/70 border border-cyan-800/60 text-cyan-300 font-medium"
                    >
                      {TOOL_DISPLAY_NAMES[tName] || tName}
                    </span>
                  ))}
                </div>
              )}

              {/* Message text with formatted markdown */}
              {msg.role === 'assistant' ? (
                <FormattedMarkdown content={msg.content} />
              ) : (
                <div className="whitespace-pre-line space-y-1.5 font-normal">
                  {msg.content}
                </div>
              )}

              {/* Visual Analysis Blocks */}
              {msg.visualBlocks && msg.visualBlocks.length > 0 && (
                <div className="space-y-2 pt-1 border-t border-slate-800/60">
                  {msg.visualBlocks.map((block, bIdx) => renderVisualBlock(block, bIdx))}
                </div>
              )}

              {/* Citations */}
              {msg.grounding && msg.grounding.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block font-semibold flex items-center space-x-1">
                    <Database className="h-3 w-3 text-cyan-400" />
                    <span>Scientific Data Provenance & Citations</span>
                  </span>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {msg.grounding.map((c, cIdx) => (
                      <a
                        key={cIdx}
                        href={c.doi_or_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-slate-900/90 hover:bg-slate-800 px-2 py-1 rounded text-[11px] font-mono text-cyan-300 hover:text-cyan-200 border border-slate-800 flex items-center space-x-1 transition-colors"
                      >
                        <span>{c.dataset_id}</span>
                        <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested Followups */}
              {msg.followups && msg.followups.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-1.5">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block">
                    Suggested Research Questions
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.followups.map((f, fIdx) => (
                      <button
                        key={fIdx}
                        onClick={() => handleSend(f)}
                        className="text-[11px] text-left px-2.5 py-1 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 transition-colors"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center space-x-2 px-4 py-2.5 rounded-full bg-[#0f1422] border border-slate-800 text-xs font-mono text-cyan-400 w-fit shadow-md">
            <div className="h-3 w-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span>Consulting NASA observation tools and formulating response...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-3 sm:p-4 bg-[#0b0f19] border-t border-slate-800/80">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center space-x-2"
        >
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder="Ask anything about Earth's ocean, atmosphere, land, or satellite observations..."
            className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-cyan-500 font-sans"
          />
          <button
            type="submit"
            disabled={loading || !inputPrompt.trim()}
            className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 p-2.5 sm:p-3 rounded-xl font-semibold transition-all shadow-md shadow-cyan-500/20 shrink-0 min-w-[42px] min-h-[42px] flex items-center justify-center cursor-pointer"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
