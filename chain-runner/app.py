from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, ValidationError
from typing import Dict, Any, Optional
import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
from langsmith import Client
from langchain.callbacks import LangChainTracer
import traceback
import re

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="Chain Runner Service",
    description="FastAPI service for running LangChain chains with LangSmith tracing",
    version="1.0.0"
)

# Initialize LangSmith client
def get_langsmith_client():
    """Initialize and return LangSmith client"""
    api_key = os.getenv("LANGSMITH_API_KEY")
    if not api_key:
        raise ValueError("LANGSMITH_API_KEY environment variable is required")
    
    return Client(api_key=api_key)

# Initialize OpenAI LLM with LangSmith tracing
def get_llm():
    """Initialize and return OpenAI LLM with LangSmith tracing"""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable is required")
    
    # Set up LangSmith tracing
    langsmith_api_key = os.getenv("LANGSMITH_API_KEY")
    if not langsmith_api_key:
        raise ValueError("LANGSMITH_API_KEY environment variable is required")
    
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_ENDPOINT"] = "https://api.smith.langchain.com"
    os.environ["LANGCHAIN_API_KEY"] = langsmith_api_key
    os.environ["LANGCHAIN_PROJECT"] = "smartspreadsheet-mvp"
    
    return ChatOpenAI(
        model="gpt-3.5-turbo",
        temperature=0.7,
        api_key=api_key
    )

# Request/Response models
class ChainRunRequest(BaseModel):
    prompt_template: str
    inputs: Dict[str, Any]

class ChainRunResponse(BaseModel):
    result: str
    trace_id: str
    error: Optional[str] = None

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint for Docker health checks"""
    return {"status": "healthy", "service": "chain-runner"}

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "service": "Chain Runner",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "chain_run": "/chain/run"
        }
    }

# Chain execution endpoint with LangSmith tracing
@app.post("/chain/run", response_model=ChainRunResponse)
async def run_chain(request: ChainRunRequest):
    """
    Execute a LangChain chain with the provided prompt template and inputs.
    Returns a result, trace_id, and error (if any).
    """
    try:
        # Extract all {variable} occurrences using regex
        prompt_vars = set(re.findall(r"{(.*?)}", request.prompt_template))
        missing_vars = prompt_vars - set(request.inputs.keys())
        if missing_vars:
            return ChainRunResponse(
                result="",
                trace_id="",
                error=f"Missing input variables for template: {', '.join(missing_vars)}"
            )

        # Initialize LangSmith client and LLM
        # langsmith_client = get_langsmith_client()  # Not needed for trace_id lookup now
        llm = get_llm()
        prompt = PromptTemplate(
            input_variables=list(request.inputs.keys()),
            template=request.prompt_template
        )
        chain = LLMChain(llm=llm, prompt=prompt)
        result = chain.run(request.inputs)
        trace_id = "not-available"
        return ChainRunResponse(
            result=result,
            trace_id=trace_id,
            error=None
        )
    except ValidationError as ve:
        return ChainRunResponse(result="", trace_id="", error=f"Validation error: {ve}")
    except Exception as e:
        tb = traceback.format_exc()
        return ChainRunResponse(result="", trace_id="", error=f"Chain execution failed: {str(e)}\nTraceback:\n{tb}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 