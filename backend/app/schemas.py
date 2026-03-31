from typing import TypedDict, Annotated, List, Optional
from pydantic import BaseModel, Field
from langgraph.graph.message import add_messages


class SalesDebriefData(BaseModel):
    client_type: Optional[str] = Field(description="Retail or Institutional")
    portfolio_sentiment: Optional[str] = Field(description="Client's feeling on current holdings, performance, or tracking error")
    flight_risk: Optional[str] = Field(description="Low, Medium, High - with brief reasoning")
    macro_concerns: Optional[List[str]] = Field(description="Any specific rants or concerns about the macro environment")
    next_steps: Optional[str] = Field(description="Follow-up actions required by the sales team")
    extensive_notes: Optional[str] = Field(description="Comprehensive, detailed notes capturing the entire conversation context and nuances.")


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    extracted_data: dict # Dict representation of SalesDebriefData
    missing_fields: List[str] # Fields from SalesDebriefData that are still None
