import React, { useState } from 'react';
import { queryAssistant, AssistantQueryResponse, ScientificCitation } from '../services/api';
import { Send, Sparkles, ExternalLink, User } from 'lucide-react';
import { EarthModule } from './EarthGlobe';

interface AssistantViewProps {
  activeModule?: EarthModule;
  selectedLocationName?: string;
  selectedDate?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  grounding?: ScientificCitation[];
  followups?: string[];
  timestamp: string;
}

export const AssistantView: React.FC<AssistantViewProps> = ({
  activeModule = null,
  selectedLocationName = 'Global Earth Systems',
  selectedDate = '2026-03',
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Welcome to the **TerraLens Scientific Assistant**.\n\nI can help you explore changes across Earth's oceans, atmosphere, and land using observations from NASA satellites—including SWOT sea surface height, GPM IMERG rainfall, and MODIS vegetation health.\n\nWhat would you like to discover?",
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
        'How does SWOT detect ocean eddies using radar?',
        'Why is monthly accumulated rain (mm) different from rainfall rate (mm/hr)?',
        'How does an El Niño ocean warming event affect the Amazon rainforest?',
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
        active_module: activeModule || 'overview',
        selected_region: selectedLocationName,
        selected_date: selectedDate,
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
    <div className="max-w-4xl mx-auto w-full flex flex-col h-[680px] bg-[#090d16]/90 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="bg-[#0b0f19] border-b border-slate-800/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">TerraLens AI Assistant</h3>
            <p className="text-[11px] text-slate-400">
              Grounded in NASA satellite observations (SWOT, GPM IMERG, MODIS)
            </p>
          </div>
        </div>

        {/* Current Active Context Badge */}
        <div className="text-[11px] font-mono text-slate-400 bg-slate-900/80 px-3 py-1 rounded-full border border-slate-800">
          Context: <span className="text-cyan-400 capitalize">{activeModule || 'Global Systems'}</span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-2xl rounded-2xl p-4 text-xs sm:text-sm leading-relaxed space-y-3 ${
                msg.role === 'user'
                  ? 'bg-cyan-600 text-white ml-8 shadow-md'
                  : 'bg-[#0f1422] border border-slate-800/80 text-slate-200 mr-8 shadow-lg'
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
                      <span className="text-cyan-400">TerraLens Assistant</span>
                    </>
                  )}
                </span>
                <span className="font-mono">{msg.timestamp}</span>
              </div>

              {/* Message text */}
              <div className="whitespace-pre-line space-y-1.5 font-normal">
                {msg.content}
              </div>

              {/* Citations */}
              {msg.grounding && msg.grounding.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block font-semibold">
                    Scientific Data Provenance
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
                    Suggested Questions
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
          <div className="flex items-center space-x-2 px-4 py-2.5 rounded-full bg-[#0f1422] border border-slate-800 text-xs font-mono text-cyan-400 w-fit">
            <div className="h-3 w-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span>Consulting planetary observation records...</span>
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="p-4 bg-[#0b0f19] border-t border-slate-800/80">
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
            className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-cyan-500 font-sans"
          />
          <button
            type="submit"
            disabled={loading || !inputPrompt.trim()}
            className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 p-3 rounded-xl font-semibold transition-all shadow-md shadow-cyan-500/20"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
