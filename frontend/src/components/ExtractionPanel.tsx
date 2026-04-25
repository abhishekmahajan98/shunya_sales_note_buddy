import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, FileText, Sparkles, TrendingUp, User, AlertTriangle, Navigation, Brain, Zap } from 'lucide-react';
import { getGQGQuestions, type Client } from '../data/clients';

interface ExtractionData {
  client_type?: string;
  portfolio_sentiment?: string;
  flight_risk?: string;
  macro_concerns?: string[];
  next_steps?: string;
  extensive_notes?: string;
  us_equity_etf_interest?: string;
  intl_em_interest?: string;
  alpha_badger_mention?: string;
  tech_approach_interest?: string;
  ai_outlook_discussed?: string;
  oil_energy_discussed?: string;
}

interface ExtractionPanelProps {
  data: ExtractionData;
  missingFields: string[];
  client?: Client | null;
}

const FIELD_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  portfolio_sentiment: { label: 'Sentiment',       icon: <TrendingUp className="w-3.5 h-3.5" /> },
  flight_risk:         { label: 'Flight Risk',     icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  macro_concerns:      { label: 'Macro Concerns',  icon: <FileText className="w-3.5 h-3.5" /> },
  next_steps:          { label: 'Next Steps',      icon: <Navigation className="w-3.5 h-3.5" /> },
};

const getRiskColor = (risk?: string) => {
  if (!risk) return { bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.2)', text: '#a5b4fc' };
  const r = risk.toLowerCase();
  if (r.includes('low'))    return { bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.2)',  text: '#6ee7b7' };
  if (r.includes('medium')) return { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', text: '#fcd34d' };
  if (r.includes('high'))   return { bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.2)',  text: '#fca5a5' };
  return { bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.2)', text: '#a5b4fc' };
};

export default function ExtractionPanel({ data, missingFields, client }: ExtractionPanelProps) {
  const standardFields = Object.keys(FIELD_CONFIG);
  const gqgQuestions = getGQGQuestions(client?.strategy_focus ?? 'us');

  const standardDone  = standardFields.filter(f => !missingFields.includes(f)).length;
  const gqgDone       = gqgQuestions.filter(q => !missingFields.includes(q.id)).length;
  const totalDone     = standardDone + gqgDone;
  const totalFields   = standardFields.length + gqgQuestions.length;
  const pct           = Math.round((totalDone / totalFields) * 100);

  return (
    <div className="w-[300px] h-full flex flex-col hidden lg:flex shrink-0"
      style={{ background: 'rgba(6,8,15,0.6)', borderLeft: '1px solid var(--border-subtle)', backdropFilter: 'blur(20px)' }}>

      {/* Header */}
      <div className="px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <Sparkles className="w-3 h-3 text-indigo-400" />
            </div>
            <h3 className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--text-secondary)' }}>Live CRM</h3>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold"
            style={{ background: totalDone === totalFields ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.1)', color: totalDone === totalFields ? '#6ee7b7' : '#a5b4fc' }}>
            {totalDone}/{totalFields}
          </div>
        </div>
        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
            animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
        </div>
        <p className="text-[10px] mt-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>{pct}% extracted</p>
      </div>

      {/* Client context pill */}
      {client && (
        <div className="px-5 py-3 shrink-0 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs font-['Space_Grotesk']"
            style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)' }}>
            {client.name.split(' ')[1]}
          </div>
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{client.name}</p>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {client.type === 'institutional' ? 'Institutional' : 'Retail'} · {client.strategy_focus === 'us' ? 'US Strategy' : 'Intl / EM'}
            </p>
          </div>
          <div className="ml-auto">
            <User className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          </div>
        </div>
      )}

      {/* ── Standard CRM fields ────────────────────────────────── */}
      <div className="px-5 py-3 space-y-3 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Standard CRM</p>
        {standardFields.map((field, idx) => {
          const isCaptured = !missingFields.includes(field);
          const config = FIELD_CONFIG[field];
          const val = (data as any)[field];

          return (
            <motion.div key={field} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }}
              className="flex items-start gap-2.5">
              <div className="mt-0.5 shrink-0">
                {isCaptured
                  ? <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><CheckCircle2 className="w-4 h-4 text-emerald-400" /></motion.div>
                  : <Circle className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span style={{ color: 'var(--text-muted)' }}>{config.icon}</span>
                  <p className="text-xs font-semibold" style={{ color: isCaptured ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {config.label}
                  </p>
                </div>
                <AnimatePresence>
                  {isCaptured && val !== undefined && val !== null && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                      {field === 'flight_risk' ? (
                        <div className="mt-1">
                          {(() => {
                            const { bg, border, text } = getRiskColor(val);
                            return <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                              style={{ background: bg, border: `1px solid ${border}`, color: text }}>{val}</span>;
                          })()}
                        </div>
                      ) : field === 'macro_concerns' && Array.isArray(val) ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {val.map((c: string, ci: number) => (
                            <span key={ci} className="inline-block px-2 py-0.5 rounded-md text-[9px] font-medium break-words"
                              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.15)', color: '#fcd34d', maxWidth: '100%' }}>
                              {c}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] leading-snug mt-0.5 break-words" style={{ color: '#94a3b8' }}>{val}</p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── GQG Leadership Priority Questions ─────────────────── */}
      <div className="px-5 py-3 space-y-2.5 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-md flex items-center justify-center"
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <Zap className="w-2.5 h-2.5 text-indigo-400" />
          </div>
          <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#a5b4fc' }}>
            Leadership Priorities
          </p>
          <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
            {gqgDone}/{gqgQuestions.length}
          </span>
        </div>

        {gqgQuestions.map((q, idx) => {
          const isCaptured = !missingFields.includes(q.id);
          const val = (data as any)[q.id];

          return (
            <motion.div key={q.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + idx * 0.04 }}
              className="flex items-start gap-2.5">
              <div className="mt-0.5 shrink-0">
                {isCaptured
                  ? <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" /></motion.div>
                  : <Circle className="w-3.5 h-3.5" style={{ color: 'rgba(99,102,241,0.25)' }} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] leading-snug" style={{ color: isCaptured ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {q.label}
                </p>
                <AnimatePresence>
                  {isCaptured && val && (
                    <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="text-[10px] mt-0.5 break-words" style={{ color: '#6366f1' }}>
                      {val}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Analyst Notes ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 px-5 py-3">
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <div className="w-5 h-5 rounded-md flex items-center justify-center"
            style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <Brain className="w-3 h-3 text-purple-400" />
          </div>
          <h4 className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#c084fc' }}>Analyst Notes</h4>
          {data.extensive_notes && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="ml-auto flex h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: '#8b5cf6' }} />
          )}
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide rounded-xl p-3 min-h-0"
          style={{ background: 'rgba(6,8,15,0.8)', border: '1px solid rgba(139,92,246,0.1)' }}>
          {data.extensive_notes ? (
            <p className="text-[11px] leading-relaxed whitespace-pre-wrap" style={{ color: '#94a3b8' }}>
              {data.extensive_notes}
            </p>
          ) : (
            <div className="h-full flex items-center justify-center text-center py-4">
              <p className="text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                Notes appear as<br />session progresses
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
