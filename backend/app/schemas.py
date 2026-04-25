from typing import TypedDict, Annotated, List, Optional
from pydantic import BaseModel, Field
from langgraph.graph.message import add_messages


class SalesDebriefData(BaseModel):
    # ── Standard CRM fields ──────────────────────────────────────────────────
    client_type: Optional[str] = Field(default=None, description="Retail or Institutional")
    portfolio_sentiment: Optional[str] = Field(default=None, description="Client's feeling on current holdings, performance, or tracking error")
    flight_risk: Optional[str] = Field(default=None, description="Low, Medium, High - with brief reasoning")
    macro_concerns: Optional[List[str]] = Field(default=None, description="Any specific rants or concerns about the macro environment")
    next_steps: Optional[str] = Field(default=None, description="Follow-up actions required by the sales team")
    extensive_notes: Optional[str] = Field(default=None, description="Comprehensive, detailed notes capturing the entire conversation context and nuances.")

    # ── GQG Leadership Priority Topics ──────────────────────────────────────
    us_equity_etf_interest: Optional[str] = Field(default=None, description="Client's interest in GQG's US Equity ETF product")
    intl_em_interest: Optional[str] = Field(default=None, description="Client's interest in International & Emerging Markets (or US strategies if intl client)")
    alpha_badger_mention: Optional[str] = Field(default=None, description="Any mention of Alpha Badger — GQG's new offering")
    tech_approach_interest: Optional[str] = Field(default=None, description="Client's interest in GQG's approach to technology")
    ai_outlook_discussed: Optional[str] = Field(default=None, description="Whether GQG's outlook on AI was discussed, and what was said")
    oil_energy_discussed: Optional[str] = Field(default=None, description="Whether GQG's view on oil and energy was discussed, and what was said")


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    extracted_data: dict
    missing_fields: List[str]
