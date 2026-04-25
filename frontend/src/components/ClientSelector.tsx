import { useState } from 'react';
import { Search, Building2, User, Globe, ChevronRight, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CLIENTS, type Client } from '../data/clients';

interface ClientSelectorProps {
  onSelect: (client: Client) => void;
}

const TYPE_STYLE = {
  institutional: { bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.25)', text: '#a5b4fc', label: 'Institutional' },
  retail:        { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)', text: '#6ee7b7', label: 'Retail' },
};

const REGION_STYLE: Record<string, string> = {
  US:   '#94a3b8',
  EMEA: '#c084fc',
  APAC: '#67e8f9',
};

export default function ClientSelector({ onSelect }: ClientSelectorProps) {
  const [search, setSearch] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filtered = CLIENTS.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.firm_type.toLowerCase().includes(search.toLowerCase()) ||
    c.region.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      {/* Page header */}
      <div className="px-8 py-8 shrink-0">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <Users className="w-4 h-4 text-indigo-400" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Step 1 of 2
            </span>
          </div>
          <h2 className="text-2xl font-bold font-['Space_Grotesk'] mb-1">Select Client</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Choose the client you met with to pre-load their context before the debrief.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="px-8 mb-6 shrink-0">
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="w-full pl-11 pr-4 py-3 rounded-xl text-sm outline-none transition-all"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.4)'}
            onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'}
          />
        </div>
      </div>

      {/* Client grid */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-8 pb-8">
        <AnimatePresence>
          {filtered.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 text-center">
              <Search className="w-8 h-8 mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No clients match "{search}"</p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((client, i) => {
                const typeStyle = TYPE_STYLE[client.type];
                const isHovered = hoveredId === client.id;

                return (
                  <motion.button
                    key={client.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => onSelect(client)}
                    onMouseEnter={() => setHoveredId(client.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className="text-left rounded-2xl p-5 transition-all duration-200 group relative"
                    style={{
                      background: isHovered ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.025)',
                      border: `1px solid ${isHovered ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      transform: isHovered ? 'translateY(-2px)' : 'none',
                      boxShadow: isHovered ? '0 8px 32px rgba(99,102,241,0.12)' : 'none',
                    }}
                  >
                    {/* Client avatar */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg font-['Space_Grotesk']"
                        style={{
                          background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))',
                          border: '1px solid rgba(99,102,241,0.2)',
                          color: '#a5b4fc'
                        }}>
                        {client.name.split(' ')[1]}
                      </div>
                      <ChevronRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                        style={{ color: isHovered ? '#6366f1' : 'var(--text-muted)', opacity: isHovered ? 1 : 0.4 }} />
                    </div>

                    {/* Client name */}
                    <h3 className="text-base font-bold mb-1 font-['Space_Grotesk']" style={{ color: 'var(--text-primary)' }}>
                      {client.name}
                    </h3>
                    <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{client.firm_type}</p>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-2">
                      {/* Type badge */}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                        style={{ background: typeStyle.bg, border: `1px solid ${typeStyle.border}`, color: typeStyle.text }}>
                        {client.type === 'institutional' ? <Building2 className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
                        {typeStyle.label}
                      </span>

                      {/* Region badge */}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: REGION_STYLE[client.region] || '#94a3b8' }}>
                        <Globe className="w-2.5 h-2.5" />
                        {client.region}
                      </span>

                      {/* Strategy focus */}
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
                        {client.strategy_focus === 'us' ? 'US Strategy' : 'Intl / EM'}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
