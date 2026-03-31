import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle } from 'lucide-react';

interface ExtractionData {
  client_type?: string;
  portfolio_sentiment?: string;
  flight_risk?: string;
  macro_concerns?: string[];
  next_steps?: string;
}

interface ExtractionPanelProps {
  data: ExtractionData;
  missingFields: string[];
}

const FIELD_LABELS: Record<keyof ExtractionData, string> = {
  client_type: 'Client Type',
  portfolio_sentiment: 'Sentiment',
  flight_risk: 'Flight Risk',
  macro_concerns: 'Macro Concerns',
  next_steps: 'Next Steps',
};

export default function ExtractionPanel({ data, missingFields }: ExtractionPanelProps) {
  const allFields = Object.keys(FIELD_LABELS) as Array<keyof ExtractionData>;

  return (
    <div className="w-64 bg-slate-900 border-l border-slate-800 p-6 h-full flex flex-col hidden lg:flex">
      <h3 className="text-sm font-semibold tracking-wider text-slate-400 uppercase mb-6">Live CRM Extraction</h3>
      
      <div className="space-y-4">
        {allFields.map((field) => {
          const isCaptured = !missingFields.includes(field);
          
          return (
            <motion.div 
              key={field}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-start gap-3"
            >
              <div className="mt-0.5">
                {isCaptured ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-700" />
                )}
              </div>
              <div>
                <p className={`text-sm font-medium ${isCaptured ? 'text-slate-200' : 'text-slate-500'}`}>
                  {FIELD_LABELS[field]}
                </p>
                {isCaptured && (
                  <motion.p 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="text-xs text-slate-400 mt-1 leading-snug break-words"
                  >
                    {Array.isArray(data[field]) 
                      ? (data[field] as string[]).join(', ') 
                      : data[field]}
                  </motion.p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
      
      <div className="mt-auto pt-6 border-t border-slate-800">
         <div className="bg-indigo-500/10 rounded-lg p-4 border border-indigo-500/20">
            <p className="text-xs text-indigo-300 leading-relaxed">
               <strong>AI Assistant Tip:</strong> Just chat naturally. I'll pull the structural data in the background and bring up any missing pieces.
            </p>
         </div>
      </div>
    </div>
  );
}
