import json
import os
from dotenv import load_dotenv
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, START, END
from pydantic import ValidationError
from app.schemas import AgentState, SalesDebriefData

# Load environment variables from .env file
load_dotenv()

# Use Google Gemini-3-Flash for the LLM
llm = ChatGoogleGenerativeAI(model="gemini-3-flash-preview", temperature=0.5)

def conversationalist_node(state: AgentState):
    """Generates a natural, empathetic audio response."""
    messages = state.get('messages', [])
    missing_fields = state.get('missing_fields', [])
    
    system_prompt = (
        "You are a junior analyst at a boutique long-only equities firm, debriefing a senior salesperson. "
        "Listen to their rants or wins. Validate them. Keep your response very brief, conversational, and suitable for spoken dialogue. "
        "Never list options or sound like a form."
    )
    
    if missing_fields:
        # Pick one field to focus on to weave into the conversation naturally
        focus_field = missing_fields[0]
        field_hints = {
            "client_type": "Try to casually find out if the client was retail or institutional.",
            "portfolio_sentiment": "Gently probe how the client was feeling about their current holdings or performance.",
            "flight_risk": "Try to get a sense of whether the client might be a flight risk (low, medium, or high).",
            "macro_concerns": "Ask if the client mentioned any concerns about the broader macro environment.",
            "next_steps": "Casually ask what the follow-up or next steps are."
        }
        hint = field_hints.get(focus_field, f"Smoothly weave in a question about {focus_field}.")
        system_prompt += f"\n\nRight now, we are missing the '{focus_field}' field. {hint} Ask only one question or make one clarifying statement."
    
    sys_msg = SystemMessage(content=system_prompt)
    response = llm.invoke([sys_msg] + messages)
    return {"messages": [response]}


def extractor_node(state: AgentState):
    """Uses structured output to analyze the entire messages history and extract data."""
    messages = state.get('messages', [])
    current_data = state.get('extracted_data', {})
    
    # We want to extract ALL fields every time based on the full conversation context to allow updates.
    system_prompt = (
        "Analyze the transcript of the debrief between the junior analyst (you) and the senior salesperson (user). "
        "Extract the current state of the following data points based on what the senior salesperson said. "
        "If the user goes on a tangent about long-only philosophy or macroeconomics, capture it in macro_concerns. "
        "Do not invent data. If a field hasn't been mentioned, leave it empty."
    )
    
    sys_msg = SystemMessage(content=system_prompt)
    
    # Use structured output for extraction
    extractor = llm.with_structured_output(SalesDebriefData)
    
    try:
        extracted = extractor.invoke([sys_msg] + messages)
        # Convert to dict, dropping any fields that are still None
        new_data = {k: v for k, v in extracted.model_dump().items() if v is not None}
        
        # Merge with existing data (new extractions overwrite old ones)
        updated_data = {**current_data, **new_data}
        
        # Recalculate missing fields
        all_fields = list(SalesDebriefData.model_fields.keys())
        missing = [f for f in all_fields if f not in updated_data or not updated_data[f]]
        
        return {
            "extracted_data": updated_data,
            "missing_fields": missing
        }
    except Exception as e:
        print(f"Extraction error: {e}")
        return {}


# Build the Graph
builder = StateGraph(AgentState)
builder.add_node("conversationalist", conversationalist_node)
builder.add_node("extractor", extractor_node)

# User input goes to both nodes conceptually, but we can structure them sequentially 
# per the requirements: "User input flows to BOTH... simultaneously (or sequentially if easier to manage state)."
# Sequential is simpler for StateGraph. Since they don't depend on each other's immediate output, order doesn't matter too much.
builder.add_edge(START, "extractor")
builder.add_edge("extractor", "conversationalist")
builder.add_edge("conversationalist", END)

# Compile
graph = builder.compile()
