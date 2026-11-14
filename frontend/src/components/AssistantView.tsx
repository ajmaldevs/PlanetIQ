import React, { useState } from 'react';
import { queryAssistant, AssistantQueryResponse, ScientificCitation } from '../services/api';
import { Bot, Send, Sparkles, BookOpen, ExternalLink, HelpCircle, User } from 'lucide-react';

interface AssistantViewProps {
  activeModule?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  grounding?: ScientificCitation[];
  followups?: string[];
  timestamp: string;
}

export const AssistantView: React.FC<AssistantViewProps> = ({ activeModule = 'overview' }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hello! I am your **TerraLens Scientific Assistant**. I can help you understand Earth's interconnected spheres across SWOT Ocean Altimetry (Option A), GPM IMERG Precipitation, and MODIS Global Vegetation Dynamics.\n\nAsk me about measurement units, satellite instruments, regional anomalies, or climate teleconnections!",
      grounding: [
        {
          dataset_id: 'SWOT_L2_LR_SSH',
          mission: 'Surface Water and Ocean Topography',
          variable: 'Sea Surface Height (m)',
          units: 'meters (m)',
          doi_or_url: 'https://podaac.jpl.nasa.gov/swot',
        },
        {
          dataset_id: 'GPM_3IMERGM',
          mission: 'Global Precipitation Measurement',
          variable: 'Final Monthly Precipitation',
          units: 'mm/hr and mm',
          doi_or_url: 'https://gpm.nasa.gov/data/imerg',
        },
        {
          dataset_id: 'MOD13C2',
          mission: 'MODIS Terra/Aqua',
          variable: 'Vegetation Indices (NDVI/EVI)',
          units: 'dimensionless (-0.2 to 1.0)',
          doi_or_url: 'https://lpdaac.usgs.gov/products/mod13c2v061/',
        },
      ],
      followups: [
        'Why must monthly accumulated precipitation (mm) not be confused with precipitation rate (mm/hr)?',
        'How does SWOT detect meso-scale ocean eddies with KaRIn radar?',
        'How does an El Niño event affect Amazon vegetation vitality?',
      ],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async (textToSend?: string) => {
    const prompt = textToSend || inputPrompt;
    if (!prompt.trim() || loading) return;

    const userMsg: Message = {
      role: 'user',
      content: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputPrompt('');
    setLoading(true);

    try {
      const result: AssistantQueryResponse = await queryAssistant(prompt, {
        active_module: activeModule,
      });

      const assistantMsg: Message = {
        role: 'assistant',
        content: result.response,
        grounding: result.scientific_grounding,
        followups: result.suggested_followups,
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

  return (
    <div className="flex flex-col h-[650px] bg-[#0c101a] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="bg-[#0f141f] border-b border-slate-800 px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-md shadow-cyan-500/20">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-white">TerraLens Scientific Intelligence</span>
              <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800/60 px-1.5 py-0.2 rounded font-mono">
                Gemini Powered
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Grounded in SWOT KaRIn Ocean, GPM IMERG Atmosphere, and MODIS NDVI Land Systems
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <span className="hidden sm:inline">Active Sphere:</span>
          <span className="px-2 py-0.5 bg-slate-900 border border-slate-700 text-cyan-400 font-mono text-[11px] rounded uppercase">
            {activeModule}
          </span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-2xl rounded-xl p-4 text-xs leading-relaxed space-y-2.5 shadow-md ${
                msg.role === 'user'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white ml-8'
                  : 'bg-[#111726] border border-slate-800 text-slate-200 mr-8'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1 border-b border-slate-700/40 pb-1">
                <span className="flex items-center space-x-1 font-semibold">
                  {msg.role === 'user' ? (
                    <>
                      <User className="h-3 w-3 text-white" />
                      <span className="text-white">Researcher / Student</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3 text-cyan-400" />
                      <span className="text-cyan-400">TerraLens Assistant</span>
                    </>
                  )}
                </span>
                <span className="font-mono text-slate-400">{msg.timestamp}</span>
              </div>

              {/* Message text with basic markdown formatting */}
              <div className="whitespace-pre-line space-y-1.5">
                {msg.content}
              </div>

              {/* Grounded Citations */}
              {msg.grounding && msg.grounding.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-1">
                  <div className="flex items-center space-x-1 text-[10px] uppercase font-mono text-cyan-400 font-semibold tracking-wider">
                    <BookOpen className="h-3 w-3 text-cyan-400" />
                    <span>Scientific Provenance & Mission Citations</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                    {msg.grounding.map((c, cIdx) => (
                      <a
                        key={cIdx}
                        href={c.doi_or_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-slate-900/90 hover:bg-slate-800 p-2 rounded border border-slate-800 text-[11px] flex items-center justify-between text-slate-300 hover:text-cyan-300 transition-colors"
                      >
                        <div className="truncate pr-2">
                          <span className="font-semibold text-slate-200">{c.dataset_id}</span>
                          <span className="block text-[10px] text-slate-400 truncate">{c.variable} ({c.units})</span>
                        </div>
                        <ExternalLink className="h-3 w-3 shrink-0 text-slate-500" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested Follow-Ups */}
              {msg.followups && msg.followups.length > 0 && (
                <div className="mt-3 pt-2 border-t border-slate-800 space-y-1.5">
                  <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider flex items-center space-x-1">
                    <HelpCircle className="h-3 w-3 text-cyan-400" />
                    <span>Suggested Explorations</span>
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.followups.map((f, fIdx) => (
                      <button
                        key={fIdx}
                        onClick={() => handleSend(f)}
                        className="text-[11px] bg-slate-900/80 hover:bg-cyan-950/60 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-cyan-800/80 px-2.5 py-1 rounded-md text-left transition-colors"
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
          <div className="flex items-center space-x-2 text-cyan-400 text-xs font-mono p-3 bg-[#111726] rounded-xl border border-slate-800 max-w-sm">
            <div className="h-3.5 w-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span>Consulting NASA Earth Observation Grounding Engine...</span>
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="p-4 bg-[#0f141f] border-t border-slate-800">
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
            placeholder="Ask anything about SWOT ocean altimetry, GPM rainfall, MODIS vegetation, or teleconnections..."
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-cyan-500 font-sans"
          />
          <button
            type="submit"
            disabled={loading || !inputPrompt.trim()}
            className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-md shadow-cyan-500/20"
          >
            <span>Query</span>
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
