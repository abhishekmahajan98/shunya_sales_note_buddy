import { ArrowLeft, Building2, User, Globe, CheckSquare, Square, Zap, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { type Client, getGQGQuestions } from '../data/clients';

interface PreBriefProps {
  client: Client;
  onBack: () => void;
  onStartDebrief: () => void;
  isCreatingSession: boolean;
}

const TYPE_STYLE = {
  institutional: { bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.25)', text: '#a5b4fc', label: 'Institutional', Icon: Building2 },
  retail:        { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)', text: '#6ee7b7', label: 'Retail',         Icon: User },
};

export default function PreBrief({ client, onBack, onStartDebrief, isCreatingSession }: PreBriefProps) {
  const typeStyle = TYPE_STYLE[client.type];
  const TypeIcon = typeStyle.Icon;
  const questions = getGQGQuestions(client.strategy_focus);

  return (
    <div className="h-full flex flex-col overflow-y-auto scrollbar-hide">
      <div className="max-w-2xl mx-auto w-full px-8 py-8 flex flex-col gap-6">

        {/* Back + step indicator */}
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="p-2 rounded-xl transition-all"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
            <ArrowLeft className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="hover:text-slate-300 cursor-pointer" onClick={onBack}>Select Client</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-indigo-400 font-semibold">Pre-Brief</span>
          </div>
          <span className="ml-auto text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Step 2 of 2
          </span>
        </div>

        {/* Client info card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6"
          style={{
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl font-['Space_Grotesk']"
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.15))',
                border: '1px solid rgba(99,102,241,0.25)',
                color: '#a5b4fc',
              }}>
              {client.name.split(' ')[1]}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold font-['Space_Grotesk'] mb-1">{client.name}</h2>
              <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>{client.firm_type}</p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
                  style={{ background: typeStyle.bg, border: `1px solid ${typeStyle.border}`, color: typeStyle.text }}>
                  <TypeIcon className="w-3 h-3" />
                  {typeStyle.label}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}>
                  <Globe className="w-3 h-3" />
                  {client.region}
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#fcd34d' }}>
                  {client.strategy_focus === 'us' ? 'US Strategy Focus' : 'International / EM Focus'}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Leadership priority questions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(99,102,241,0.2)' }}
        >
          {/* Header */}
          <div className="px-6 py-4 flex items-center gap-3"
            style={{ background: 'rgba(99,102,241,0.08)', borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
            <div className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)' }}>
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-indigo-300">Leadership Priority Questions</h3>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(165,180,252,0.6)' }}>
                The AI will probe for each of these during the debrief
              </p>
            </div>
            <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)' }}>
              {questions.length} topics
            </span>
          </div>

          {/* Question list */}
          <div className="divide-y" style={{ background: 'rgba(255,255,255,0.015)', divideColor: 'rgba(255,255,255,0.05)' }}>
            {questions.map((q, i) => (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                className="flex items-center gap-3 px-6 py-3.5"
                style={{ borderBottom: i < questions.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
              >
                <div className="shrink-0">
                  <Square className="w-4 h-4" style={{ color: 'rgba(99,102,241,0.4)' }} />
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{q.label}</p>
                <span className="ml-auto text-[10px] font-mono shrink-0" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                  #{i + 1}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Context note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="rounded-xl px-5 py-4"
          style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}
        >
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(110,231,183,0.8)' }}>
            <span className="font-bold text-emerald-400">AI is pre-loaded: </span>
            The analyst knows <strong>{client.name}</strong> is a{' '}
            <strong>{typeStyle.label}</strong> client with a{' '}
            <strong>{client.strategy_focus === 'us' ? 'US strategy' : 'international'}</strong> focus — it will
            never ask redundant questions about client type.
          </p>
        </motion.div>

        {/* CTA */}
        <motion.button
          onClick={onStartDebrief}
          disabled={isCreatingSession}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          whileTap={{ scale: 0.98 }}
          className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all"
          style={{
            background: isCreatingSession
              ? 'rgba(99,102,241,0.2)'
              : 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)',
            color: isCreatingSession ? '#6366f1' : 'white',
            boxShadow: isCreatingSession ? 'none' : '0 4px 24px rgba(99,102,241,0.4)',
            border: '1px solid rgba(99,102,241,0.3)',
          }}
        >
          {isCreatingSession ? (
            <>
              <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
              Preparing Session...
            </>
          ) : (
            <>
              <CheckSquare className="w-5 h-5" />
              Start Debrief
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
