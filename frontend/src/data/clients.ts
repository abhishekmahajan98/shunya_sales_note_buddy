export interface Client {
  id: string;
  name: string;
  type: 'retail' | 'institutional';
  strategy_focus: 'us' | 'international';
  firm_type: string;
  region: string;
}

export const CLIENTS: Client[] = [
  { id: 'client-a', name: 'Client A', type: 'institutional', strategy_focus: 'us',            firm_type: 'Asset Manager',         region: 'US'   },
  { id: 'client-b', name: 'Client B', type: 'retail',         strategy_focus: 'us',            firm_type: 'Wealth Management',     region: 'US'   },
  { id: 'client-c', name: 'Client C', type: 'institutional', strategy_focus: 'international',  firm_type: 'Pension Fund',          region: 'EMEA' },
  { id: 'client-d', name: 'Client D', type: 'institutional', strategy_focus: 'us',            firm_type: 'Endowment',             region: 'US'   },
  { id: 'client-e', name: 'Client E', type: 'retail',         strategy_focus: 'international', firm_type: 'Family Office',         region: 'APAC' },
  { id: 'client-f', name: 'Client F', type: 'institutional', strategy_focus: 'international',  firm_type: 'Sovereign Wealth Fund', region: 'EMEA' },
];

export interface GQGExtractionFields {
  us_equity_etf_interest?: string;
  intl_em_interest?: string;
  alpha_badger_mention?: string;
  tech_approach_interest?: string;
  ai_outlook_discussed?: string;
  oil_energy_discussed?: string;
}

export interface GQGQuestion {
  id: keyof GQGExtractionFields;
  label: string;
}

export function getGQGQuestions(strategyFocus: 'us' | 'international'): GQGQuestion[] {
  return [
    { id: 'us_equity_etf_interest',  label: 'Interest in the US Equity ETF product?' },
    {
      id: 'intl_em_interest',
      label: strategyFocus === 'us'
        ? 'Interest in International & Emerging Markets?'
        : 'Interest in US strategies?',
    },
    { id: 'alpha_badger_mention',    label: 'Any mention of Alpha Badger?' },
    { id: 'tech_approach_interest',  label: "Interest in GQG's approach to technology?" },
    { id: 'ai_outlook_discussed',    label: "GQG's outlook on AI — discussed?" },
    { id: 'oil_energy_discussed',    label: "GQG's view on oil and energy — discussed?" },
  ];
}
