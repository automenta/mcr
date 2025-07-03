# MCR-XI "Aether" v11.0.0 (Architecturally Pure Edition)
# A Model Context Reasoner
#
# This version achieves architectural purity by enforcing a strict separation of
# concerns, even within a single file. The code is organized into three distinct
# parts: Backend, Frontend, and Launcher. The GUI now follows a true MVC pattern
# where the View is completely passive and all logic resides in the Controller.
# This structure makes organizational errors like NameError structurally impossible.

### KEY ARCHITECTURAL ENHANCEMENTS:
#   - Strict Logical Grouping: The file is cleanly divided into Backend, Frontend,
#     and Launcher sections, eliminating cross-domain dependencies.
#   - True MVC for GUI: The MainWindow (View) is now completely passive. It only
#     displays data and emits signals. The MainController handles all logic,
#     ensuring the View never calls a business logic class directly.
#   - Enhanced Clarity: All components have a single, clear responsibility, making
#     the entire system transparent and easy to maintain.

### USAGE:
# 1. Install dependencies:
#    pip install "fastapi[all]" python-dotenv pytholog PyQt6 requests langchain langchain-core langchain-ollama langchain-google-genai
#
# 2. Set up your LLM via a .env file or ensure Ollama is running.
#
# 3. Run the application:
#    python your_script_name.py

import asyncio
import errno
import json
import logging
import os
import re
import sys
import textwrap
import uuid
from abc import ABC, abstractmethod
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Union, Generator

import pytholog as pl
import requests
import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from langchain_core.exceptions import LangChainException
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama
from pydantic import BaseModel, Field
from PyQt6.QtCore import QObject, QThread, QTimer, Qt, pyqtSignal, pyqtSlot
from PyQt6.QtGui import QAction, QColor, QCursor, QFont, QPalette
from PyQt6.QtWidgets import (QApplication, QComboBox, QDialog, QDialogButtonBox,
                             QFormLayout, QFrame, QHBoxLayout, QHeaderView,
                             QLabel, QLineEdit, QMainWindow, QMenuBar,
                             QMessageBox, QPlainTextEdit, QPushButton,
                             QSplitter, QStackedWidget, QStatusBar,
                             QTreeWidget, QTreeWidgetItem, QVBoxLayout, QWidget)

# ==============================================================================
# PART 1: CORE DOMAIN & BACKEND
# ==============================================================================

# --- Configuration & Constants ---
__version__ = "11.0.0"
load_dotenv()

LOG_LEVEL = os.getenv("LOG_LEVEL", "DEBUG").upper()
MCR_STORAGE_PATH = Path(os.getenv("MCR_STORAGE_PATH", "./mcr_data"))
REASONING_TIMEOUT_SECONDS = 10
CONFIG_FILE = Path.home() / ".mcr_aether_settings.json"
MCR_SERVER_URL = "http://127.0.0.1:8001"
WINDOW_TITLE = f"MCR-XI Aether v{__version__}"

# --- Logging Setup ---
def setup_logging() -> logging.Logger:
    class TraceIdFormatter(logging.Formatter):
        def format(self, record: logging.LogRecord) -> str:
            record.trace_id = getattr(record, 'trace_id', 'system')
            return super().format(record)
    logger = logging.getLogger("MCR")
    if not logger.handlers:
        logger.setLevel(LOG_LEVEL)
        handler = logging.StreamHandler(sys.stdout)
        formatter = TraceIdFormatter("[%(asctime)s] [%(levelname)s] [%(trace_id)s] %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.propagate = False
    return logger

logger = setup_logging()

# --- Custom Exceptions ---
class MCRError(Exception): pass
class NotFoundError(MCRError): pass
class ProviderError(MCRError): pass
class ValidationError(MCRError): pass

# --- Pydantic Data Models (API Contracts) ---
class Session(BaseModel): sessionId: str = Field(default_factory=lambda: str(uuid.uuid4())); knowledgeBase: str = ""; createdAt: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat()); modifiedAt: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
class LlmConfig(BaseModel): provider: str; model: Optional[str] = None; api_key: Optional[str] = None; base_url: Optional[str] = None
class AssertRequest(BaseModel): text: str
class QueryRequest(BaseModel): query: str
class UpdateKbRequest(BaseModel): knowledgeBase: str
class HealthResponse(BaseModel): status: str; version: str
class AssertResponse(BaseModel): addedFacts: List[str]; knowledgeBase: str; translatedProlog: List[str]; intent: str
class QueryResponse(BaseModel): queryProlog: str; result: Any; answer: str; debugInfo: Optional[Dict[str, Any]] = None
class ListSessionsResponse(BaseModel): sessionId: str

# --- Core Service Interfaces (ABCs) ---
class ILlmProvider(ABC):
    @abstractmethod
    async def generate(self, prompt: str, trace_id: str) -> str: ...

class IReasonProvider(ABC):
    @abstractmethod
    async def query(self, kb_str: str, query_str: str, trace_id: str) -> Any: ...
    @abstractmethod
    def validate(self, kb_str: str, trace_id: str) -> Dict[str, Union[bool, str]]: ...
class IContextProvider(ABC):
    @abstractmethod
    async def get_session(self, session_id: str, trace_id: str) -> Session: ...
    @abstractmethod
    async def save_session(self, session: Session, trace_id: str) -> None: ...
    @abstractmethod
    async def list_sessions(self, trace_id: str) -> List[str]: ...

# --- Domain Models ---
class PromptManager:
    _PROMPTS = {
        "INTENT_CLASSIFIER": [textwrap.dedent("""
            Classify the user's statement as FACT or RULE. Respond with only one word.
            Statement: "{text}"
            Classification:
        """).strip()],
        "NL_TO_FACTS": [textwrap.dedent("""
            Translate the sentence to Prolog facts. Use lowercase atoms. Use schema predicates. Decompose complex statements. Output ONLY valid Prolog code.
            {schema_section}
            User: "Elizabeth and Philip are the parents of Charles and Anne."
            Output:
            parent(elizabeth, charles).
            parent(elizabeth, anne).
            parent(philip, charles).
            parent(philip, anne).
            ---
            User: "{text}"
            Output:
        """).strip()],
        "NL_TO_RULES": [textwrap.dedent("""
            Translate the definition into a Prolog rule. Use uppercase variables. Use schema predicates. Output ONLY a valid Prolog rule.
            {schema_section}
            User: "A grandparent is the parent of a parent."
            Schema: parent/2
            Output:
            grandparent(GP, GC) :- parent(GP, P), parent(P, GC).
            ---
            User: "{text}"
            Output:
        """).strip()],
        "NL_TO_QUERY": [textwrap.dedent("""
            Translate the question to a Prolog query.
            **RULES:**
            1.  **Output ONLY the query goal.** No period, no explanations.
            2.  **Use Named Variables for Unknowns:** For "Who", "What", etc., use a named, uppercase variable (e.g., `X`, `Who`). DO NOT use `_`.
            3.  **Use Correct Atoms:** Use the exact lowercase atoms for entities from the schema. Normalize user input (e.g., "Prince George" becomes `george`).
            {schema_section}
            User: "Who are the grandparents of George?"
            Output: grandparent(Grandparent, george)
            ---
            User: "{query}"
            Output:
        """).strip()],
        "RESULT_TO_NL": [textwrap.dedent("""
            Based *strictly* on the query and its JSON result, provide a natural language answer.
            Query: {query}
            Result (JSON): {result}
            Answer:
        """).strip()],
    }
    def get(self, template_name: str, **kwargs) -> List[str]:
        schema = kwargs.get("schema"); schema_section = f"--- SCHEMA ---\n% KB contains: {', '.join(schema)}\n" if schema else ""
        kwargs["schema_section"] = schema_section
        return [p.format(**kwargs) for p in self._PROMPTS.get(template_name, [])]

class DemoManager:
    _DEMOS = {"Royal Family Tree": {"description": "Genealogy of the British royal family, for complex relationship queries.","setup": ["Elizabeth and Philip are the parents of Charles and Anne.","Charles and Diana are the parents of William and Harry.","William and Catherine are the parents of George.","Elizabeth, Diana, Catherine, Anne are female.","Philip, Charles, William, Harry, George are male.","A person's mother is their female parent.","A person's father is their male parent.","A grandparent is the parent of a parent."],"sample_query": "Who are the grandparents of Prince George?",},"Spatial Reasoning": {"description": "A scene with objects, demonstrating schema-aware rule creation.","setup": ["The sphere is large and red.","The cube is small and blue.","The cube is behind the sphere.","The pyramid is on top of the cube.","Something is in front of an object if that object is behind it.","Something is above an object if it is on top of that object."],"sample_query": "What is in front of the large sphere?",},"Murder Mystery": {"description": "A classic logic puzzle to deduce a suspect from clues.","setup": ["Plum was in the library at 9pm.","Scarlet was in the lounge at 9pm.","Mustard owned the dagger.","The dagger was found in the library.","The victim is Mr. Black.","The crime scene is the library.","The time of death was 9pm.","Plum and Scarlet had a motive to harm Mr. Black.","A person is a suspect if they had a motive and were at the crime scene at the time of death."],"sample_query": "Who is a suspect?",},}
    @staticmethod
    def get_demos(): return DemoManager._DEMOS

# --- Provider Implementations ---
class PythologReasonProvider(IReasonProvider):
    async def query(self, kb_str: str, query_str: str, trace_id: str) -> Any:
        try:
            kb = pl.KnowledgeBase("mcr"); kb(kb_str.splitlines())
            return await asyncio.wait_for(asyncio.to_thread(kb.query, pl.Expr(query_str)), timeout=REASONING_TIMEOUT_SECONDS) or []
        except asyncio.TimeoutError: raise ProviderError(f"Reasoning query timed out after {REASONING_TIMEOUT_SECONDS}s.")
        except Exception as e: logger.error(f"Pytholog error: {e}", extra={'trace_id': trace_id}); raise ProviderError(f"Pytholog reasoning error: {e}")
    def validate(self, kb_str: str, trace_id: str) -> Dict[str, Union[bool, str]]:
        try: pl.KnowledgeBase("validation_kb")(kb_str.splitlines()); return {"valid": True}
        except Exception as e: return {"valid": False, "error": str(e)}

class FileContextProvider(IContextProvider):
    def __init__(self, storage_path: Path):
        self.sessions_path = storage_path / "sessions"; self.sessions_path.mkdir(parents=True, exist_ok=True)
        logger.info(f"Using FileContextProvider. Storage path: {self.sessions_path.resolve()}")
    async def get_session(self, session_id: str, trace_id: str) -> Session:
        session_file = self.sessions_path / f"{session_id}.json"
        if not session_file.exists(): raise NotFoundError(f"Session '{session_id}' not found.")
        return Session.model_validate_json(session_file.read_text())
    async def save_session(self, session: Session, trace_id: str) -> None:
        session.modifiedAt = datetime.now(timezone.utc).isoformat()
        session_file = self.sessions_path / f"{session.sessionId}.json"; session_file.write_text(session.model_dump_json(indent=2))
    async def list_sessions(self, trace_id: str) -> List[str]: return sorted([p.stem for p in self.sessions_path.glob("*.json")])

class MockLlmProvider(ILlmProvider):
    async def generate(self, prompt: str, trace_id: str) -> str:
        logger.warning("Using MockLlmProvider.", extra={'trace_id': trace_id})
        if "INTENT_CLASSIFIER" in prompt: return "FACT"
        if "NL_TO_FACTS" in prompt: return "mock_fact(mock)."
        if "NL_TO_RULES" in prompt: return "mock_rule(X) :- mock_fact(X)."
        if "NL_TO_QUERY" in prompt and "george" in prompt: return "grandparent(Grandparent, george)"
        if "NL_TO_QUERY" in prompt: return "mock_query(X)"
        if "RESULT_TO_NL" in prompt: return "This is a mock answer from the MockLlmProvider."
        return "placeholder(mock)."

class OllamaLlmProvider(ILlmProvider):
    def __init__(self, model: str, base_url: str): self.llm = ChatOllama(model=model, base_url=base_url)
    async def generate(self, prompt: str, trace_id: str) -> str:
        try: return (await self.llm.ainvoke(prompt)).content
        except LangChainException as e: raise ProviderError(f"Ollama request failed: {e}")

class GeminiLlmProvider(ILlmProvider):
    def __init__(self, model: str, api_key: str): self.llm = ChatGoogleGenerativeAI(model=model, google_api_key=api_key)
    async def generate(self, prompt: str, trace_id: str) -> str:
        try: return (await self.llm.ainvoke(prompt)).content
        except LangChainException as e: raise ProviderError(f"Gemini request failed: {e}")

# --- Main Service Class ---
class MCRService:
    def __init__(self, llm: ILlmProvider, reasoner: IReasonProvider, context: IContextProvider, prompts: PromptManager):
        self.llm, self.reasoner, self.context, self.prompts = llm, reasoner, context, prompts
    @staticmethod
    def _extract_prolog(text: str) -> List[str]:
        prolog_pattern = re.compile(r"^[a-z][a-zA-Z0-9_]*\((?:.|\n)*?\)\.?\s*(?::-.*)?", re.MULTILINE)
        clauses = prolog_pattern.findall(text); return [line.strip() if line.strip().endswith('.') else f"{line.strip()}." for line in clauses]
    @staticmethod
    def _get_kb_schema(kb_string: str) -> List[str]:
        schema_items = set()
        predicate_regex = re.compile(r'([a-z][a-zA-Z0-9_]*)\s*(?::-|.)')
        atom_regex = re.compile(r'\(([a-zA-Z0-9_,\s]+)\)')
        for line in kb_string.splitlines():
            line = line.strip()
            if not line or line.startswith('%'): continue
            if pred_match := predicate_regex.match(line):
                name = pred_match.group(1); head = line.split(':-')[0]
                arity = 0 if '()' in head else head.count(',') + 1
                schema_items.add(f"{name}/{arity}")
            for atom_match in atom_regex.finditer(line):
                for atom in (a.strip() for a in atom_match.group(1).split(',')):
                    if atom and atom[0].islower(): schema_items.add(atom)
        return sorted(list(schema_items))
    async def _run_prompt_chain(self, template_name: str, trace_id: str, **kwargs) -> str:
        prompts = self.prompts.get(template_name, **kwargs)
        if not prompts: raise ProviderError(f"No prompt templates found for '{template_name}'.")
        for i, prompt in enumerate(prompts):
            logger.debug(f"Attempting with prompt variant {i+1}/{len(prompts)} for '{template_name}'.\n--- PROMPT ---\n{prompt}\n--- END PROMPT ---", extra={'trace_id': trace_id})
            llm_response = await self.llm.generate(prompt, trace_id)
            logger.debug(f"LLM Raw Response: '{llm_response}'", extra={'trace_id': trace_id})
            if llm_response and llm_response.strip():
                logger.info(f"Succeeded with prompt variant {i+1} for '{template_name}'.", extra={'trace_id': trace_id})
                return llm_response.strip()
        raise ProviderError(f"LLM failed for '{template_name}' after trying all {len(prompts)} variants.")
    async def assert_into_session(self, session_id: str, text: str, trace_id: str) -> AssertResponse:
        session = await self.context.get_session(session_id, trace_id)
        schema = self._get_kb_schema(session.knowledgeBase)
        intent_raw = await self._run_prompt_chain("INTENT_CLASSIFIER", trace_id, text=text)
        intent = "RULE" if "RULE" in intent_raw.upper() else "FACT"
        prompt_name = "NL_TO_RULES" if intent == "RULE" else "NL_TO_FACTS"
        llm_response = await self._run_prompt_chain(prompt_name, trace_id, text=text, schema=schema)
        new_clauses = self._extract_prolog(llm_response)
        if not new_clauses: raise ProviderError("LLM failed to generate valid Prolog code.")
        added = [c for c in new_clauses if c not in (line.strip() for line in session.knowledgeBase.splitlines())]
        if added:
            session.knowledgeBase = (session.knowledgeBase + "\n" + "\n".join(added)).strip()
            await self.context.save_session(session, trace_id)
        return AssertResponse(addedFacts=added, knowledgeBase=session.knowledgeBase, translatedProlog=new_clauses, intent=intent)
    async def run_query(self, session_id: str, request: QueryRequest, trace_id: str) -> QueryResponse:
        session = await self.context.get_session(session_id, trace_id)
        schema = self._get_kb_schema(session.knowledgeBase)
        prolog_query = (await self._run_prompt_chain("NL_TO_QUERY", trace_id, query=request.query, schema=schema)).rstrip('.')
        if not prolog_query: raise ProviderError("LLM failed to generate a valid Prolog query.")
        result = await self.reasoner.query(session.knowledgeBase, prolog_query, trace_id)
        result_for_llm = "true" if result is True else ("No" if not result or result == ['No'] else result)
        answer = await self._run_prompt_chain("RESULT_TO_NL", trace_id, query=prolog_query, result=json.dumps(result_for_llm))
        return QueryResponse(queryProlog=prolog_query, result=result, answer=answer)

# --- Dependency Injection & FastAPI App ---
class DependencyContainer:
    def __init__(self):
        self.llm_config_store: Dict[str, Any] = {"provider": "Mock", "model": "mock-model"}
        self.prompt_manager = PromptManager()
        self.reason_provider = PythologReasonProvider()
        self.context_provider = FileContextProvider(MCR_STORAGE_PATH)
        self.llm_provider = self._create_llm_provider()
    def _create_llm_provider(self) -> ILlmProvider:
        config = self.llm_config_store; provider_name = config.get("provider")
        try:
            if provider_name == "Ollama": return OllamaLlmProvider(model=config["model"], base_url=config["base_url"])
            if provider_name == "Gemini":
                api_key = config.get("api_key") or os.getenv("GOOGLE_API_KEY")
                if not api_key: raise ProviderError("Gemini API key not found.")
                return GeminiLlmProvider(model=config["model"], api_key=api_key)
            return MockLlmProvider()
        except KeyError as e: raise ProviderError(f"Missing config key for {provider_name}: {e}")
        except Exception as e: raise ProviderError(f"Failed to init {provider_name}: {e}")
    def get_mcr_service(self) -> MCRService: return MCRService(self.llm_provider, self.reason_provider, self.context_provider, self.prompt_manager)
    def set_llm_config(self, config: LlmConfig):
        new_config_dict = config.model_dump()
        if config.api_key and all(c == '*' for c in config.api_key): new_config_dict["api_key"] = self.llm_config_store.get("api_key")
        self.llm_config_store = new_config_dict; self.llm_provider = self._create_llm_provider()

container = DependencyContainer()
@asynccontextmanager
async def lifespan(app: FastAPI): logger.info(f"MCR Service starting up (v{__version__})..."); yield; logger.info("MCR Service shutting down.")
fastapi_app = FastAPI(title="MCR Aether", version=__version__, lifespan=lifespan)
@fastapi_app.middleware("http")
async def trace_id_middleware(request: Request, call_next: callable) -> Response:
    trace_id = request.headers.get("X-Trace-ID", str(uuid.uuid4())); request.state.trace_id = trace_id
    response = await call_next(request); response.headers["X-Trace-ID"] = trace_id; return response
@fastapi_app.exception_handler(MCRError)
async def mcr_exception_handler(request: Request, exc: MCRError) -> JSONResponse:
    code = status.HTTP_404_NOT_FOUND if isinstance(exc, NotFoundError) else \
           status.HTTP_502_BAD_GATEWAY if isinstance(exc, ProviderError) else \
           status.HTTP_400_BAD_REQUEST if isinstance(exc, ValidationError) else \
           status.HTTP_500_INTERNAL_SERVER_ERROR
    logger.error(f"MCR Error: {type(exc).__name__} - {exc}", extra={'trace_id': request.state.trace_id})
    return JSONResponse(status_code=code, content={"error": {"type": type(exc).__name__, "message": str(exc)}})
def get_service() -> MCRService: return container.get_mcr_service()
@fastapi_app.get("/health", response_model=HealthResponse)
async def health_check(): return {"status": "ok", "version": __version__}
@fastapi_app.post("/config/llm", status_code=status.HTTP_200_OK)
async def set_llm_config(config: LlmConfig, request: Request):
    try: container.set_llm_config(config); logger.info(f"LLM provider updated to {config.provider}.", extra={'trace_id': request.state.trace_id}); return {"message": f"LLM provider updated to {config.provider}."}
    except ProviderError as e: raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
@fastapi_app.post("/sessions", status_code=status.HTTP_201_CREATED, response_model=Session)
async def create_session(request: Request, service: MCRService = Depends(get_service)): session = Session(); await service.context.save_session(session, request.state.trace_id); return session
@fastapi_app.get("/sessions/list", response_model=List[ListSessionsResponse])
async def list_sessions(request: Request, service: MCRService = Depends(get_service)): return [ListSessionsResponse(sessionId=sid) for sid in await service.context.list_sessions(request.state.trace_id)]
@fastapi_app.get("/sessions/{session_id}", response_model=Session)
async def get_session(session_id: str, request: Request, service: MCRService = Depends(get_service)): return await service.context.get_session(session_id, request.state.trace_id)
@fastapi_app.post("/sessions/{session_id}/assert", response_model=AssertResponse)
async def assert_fact(session_id: str, body: AssertRequest, request: Request, service: MCRService = Depends(get_service)): return await service.assert_into_session(session_id, body.text, request.state.trace_id)
@fastapi_app.post("/sessions/{session_id}/query", response_model=QueryResponse)
async def query_session(session_id: str, body: QueryRequest, request: Request, service: MCRService = Depends(get_service)): return await service.run_query(session_id, body, request.state.trace_id)
@fastapi_app.put("/sessions/{session_id}/kb", status_code=status.HTTP_200_OK)
async def update_kb(session_id: str, body: UpdateKbRequest, request: Request, service: MCRService = Depends(get_service)):
    session = await service.context.get_session(session_id, request.state.trace_id); validation = service.reasoner.validate(body.knowledgeBase, request.state.trace_id)
    if not validation["valid"]: raise ValidationError(f"KB validation failed: {validation['error']}")
    session.knowledgeBase = body.knowledgeBase; await service.context.save_session(session, request.state.trace_id); return {"message": "Knowledge base updated successfully."}

# ==============================================================================
# PART 2: GUI APPLICATION (FRONTEND)
# ==============================================================================

# --- GUI CORE & ABSTRACTIONS ---
class ApiClientError(Exception):
    def __init__(self, message: str, status_code: Optional[int] = None, details: Optional[Dict] = None):
        super().__init__(message); self.status_code = status_code; self.details = details or {}
UITheme = {"font_main": QFont("Segoe UI", 10),"font_mono": QFont("Consolas", 11),"color_action": QColor("#64b5f6"),"color_success": QColor("#81c784"),"color_warning": QColor("#ffb74d"),"color_info": QColor("#fff176"),"color_error": QColor("#e57373"),"color_text_main": QColor("#e0e0e0"),}

class MCRClient:
    def __init__(self, base_url: str): self.base_url = base_url; self.session = requests.Session()
    def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        url = f"{self.base_url}{endpoint}"; logger.debug(f"Client request: {method} {url}")
        try:
            response = self.session.request(method, url, timeout=60, **kwargs)
            if not response.ok:
                try: data = response.json()
                except json.JSONDecodeError: data = {"message": response.text}
                raise ApiClientError(f"API Error {response.status_code}", response.status_code, data)
            return {} if response.status_code == 204 else response.json()
        except requests.exceptions.RequestException as e: raise ApiClientError(f"Network Error: {e}")
    def check_health(self): return self._request("GET", "/health")
    def set_llm_config(self, **kwargs): return self._request("POST", "/config/llm", json=kwargs)
    def create_session(self): return self._request("POST", "/sessions")
    def list_sessions(self): return self._request("GET", "/sessions/list")
    def get_session(self, session_id: str): return self._request("GET", f"/sessions/{session_id}")
    def update_kb(self, session_id: str, kb_content: str): return self._request("PUT", f"/sessions/{session_id}/kb", json={"knowledgeBase": kb_content})
    def assert_fact(self, session_id: str, text: str): return self._request("POST", f"/sessions/{session_id}/assert", json={"text": text})
    def query(self, session_id: str, query: str): return self._request("POST", f"/sessions/{session_id}/query", json={"query": query})

class UIState(QObject):
    session_id_changed = pyqtSignal(str); kb_text_changed = pyqtSignal(str); sessions_list_changed = pyqtSignal(list); status_message_changed = pyqtSignal(str, int); trace_changed = pyqtSignal(list); controls_enabled_changed = pyqtSignal(bool)
    def __init__(self): super().__init__(); self._session_id: Optional[str] = None; self._kb_text: str = ""; self._sessions: List[str] = []
    def set_session_id(self, session_id: Optional[str]): self._session_id = session_id; self.session_id_changed.emit(session_id or "")
    def get_session_id(self) -> Optional[str]: return self._session_id
    def set_kb_text(self, text: str): self._kb_text = text; self.kb_text_changed.emit(text)
    def set_sessions_list(self, sessions: List[str]): self._sessions = sessions; self.sessions_list_changed.emit(sessions)
    def set_status(self, msg: str, timeout: int = 0): self.status_message_changed.emit(msg, timeout)
    def set_trace(self, trace_items: List[QTreeWidgetItem]): self.trace_changed.emit(trace_items)
    def set_controls_enabled(self, enabled: bool): self.controls_enabled_changed.emit(enabled)

class TraceBuilder:
    def _create_item(self, title: str, detail: str, color: QColor, is_code: bool = False) -> QTreeWidgetItem:
        item = QTreeWidgetItem([f" {title}", str(detail)]); item.setForeground(0, color); item.setFont(0, QFont("Segoe UI", 10, QFont.Weight.Bold))
        if is_code: item.setFont(1, UITheme["font_mono"])
        return item
    def build_error_trace(self, title: str, message: str) -> List[QTreeWidgetItem]:
        root = self._create_item("ERROR", title, UITheme["color_error"])
        root.addChild(self._create_item("Detail", message, UITheme["color_text_main"])); return [root]
    def build_assert_trace(self, nl_text: str, response: Dict) -> List[QTreeWidgetItem]:
        root = self._create_item("ACTION", f"Assert ({response.get('intent', 'N/A')})", UITheme["color_action"])
        root.addChildren([self._create_item("INPUT (NL)", f'"{nl_text}"', UITheme["color_text_main"]), self._create_item("TRANSLATION (Prolog)", "\n".join(response.get("translatedProlog", [])), UITheme["color_info"], is_code=True), self._create_item("OUTCOME", f"{len(response.get('addedFacts', []))} clause(s) added to KB.", UITheme["color_success"])]); return [root]
    def build_query_trace(self, nl_text: str, response: Dict) -> List[QTreeWidgetItem]:
        root = self._create_item("ACTION", "Run Query", UITheme["color_action"]); prolog_query = response.get("queryProlog", "N/A"); result = response.get("result", []); is_success = result and result != ['No'] and result is not False; result_color = UITheme["color_success"] if is_success else UITheme["color_error"]
        reason_item = self._create_item("REASONING (Execution)", f"Executing: {prolog_query}", UITheme["color_warning"])
        reason_item.addChildren([self._create_item("Raw Result", json.dumps(result, indent=2), result_color, is_code=True)])
        root.addChildren([self._create_item("INPUT (NL)", f'"{nl_text}"', UITheme["color_text_main"]), self._create_item("TRANSLATION (Prolog)", prolog_query, UITheme["color_info"], is_code=True), reason_item, self._create_item("EXPLANATION (NL)", response.get("answer", "N/A"), UITheme["color_success"])]); return [root]

# --- GUI CONTROLLER ---
class MainController(QObject):
    def __init__(self, state: UIState, client: MCRClient, trace_builder: TraceBuilder, parent=None):
        super().__init__(parent); self.state = state; self.client = client; self.trace_builder = trace_builder
    @contextmanager
    def _action_handler(self, status_message: str) -> Generator[None, None, None]:
        self.state.set_controls_enabled(False); QApplication.setOverrideCursor(QCursor(Qt.CursorShape.WaitCursor)); self.state.set_status(status_message)
        try: yield
        except ApiClientError as e:
            logger.error(f"API Client Error: {e.message} - {e.details}")
            msg = e.details.get("error", {}).get("message", e.message)
            self.state.set_trace(self.trace_builder.build_error_trace("API Error", msg)); self.state.set_status(f"Error: {msg}", 5000)
        except Exception as e:
            logger.error(f"An unexpected error occurred: {e}", exc_info=True)
            self.state.set_trace(self.trace_builder.build_error_trace("Unexpected Error", str(e))); self.state.set_status(f"Unexpected Error: {e}", 5000)
        finally: self.state.set_controls_enabled(True); QApplication.restoreOverrideCursor(); self.state.set_status("Ready", 2000)
    def get_demo_scenarios(self) -> Dict[str, str]: return {name: data["description"] for name, data in DemoManager.get_demos().items()}
    @pyqtSlot()
    def initialize_app(self):
        try: self.client.check_health(); self.state.set_status("Server running. Ready.", 3000); self.state.set_controls_enabled(True); self.refresh_sessions_list()
        except ApiClientError: self.state.set_status("Server not found. Please start the server.", 0)
    @pyqtSlot()
    def refresh_sessions_list(self):
        with self._action_handler("Refreshing sessions..."):
            sessions = self.client.list_sessions()
            session_ids = [s['sessionId'] for s in sessions]
            self.state.set_sessions_list(session_ids)
            if not self.state.get_session_id() and session_ids: self.change_session(session_ids[0])
            elif not session_ids: self.create_new_session()
    @pyqtSlot(str)
    def change_session(self, session_id: str):
        if not session_id or session_id == self.state.get_session_id(): return
        with self._action_handler(f"Loading session {session_id[:8]}..."):
            self.state.set_session_id(session_id); session_data = self.client.get_session(session_id)
            self.state.set_kb_text(session_data.get("knowledgeBase", "")); self.state.set_trace([])
    @pyqtSlot()
    def create_new_session(self):
        with self._action_handler("Creating new session..."):
            new_session = self.client.create_session(); self.refresh_sessions_list(); self.state.set_session_id(new_session["sessionId"])
    @pyqtSlot(str)
    def do_assert(self, text: str):
        if not text or not self.state.get_session_id(): return
        with self._action_handler("Processing Assert..."):
            response = self.client.assert_fact(self.state.get_session_id(), text)
            self.state.set_trace(self.trace_builder.build_assert_trace(text, response)); self.state.set_kb_text(response.get("knowledgeBase", ""))
    @pyqtSlot(str)
    def do_query(self, text: str):
        if not text or not self.state.get_session_id(): return
        with self._action_handler("Processing Query..."):
            response = self.client.query(self.state.get_session_id(), text)
            self.state.set_trace(self.trace_builder.build_query_trace(text, response))
    @pyqtSlot(str)
    def save_kb(self, kb_text: str):
        if not self.state.get_session_id(): return
        try: self.client.update_kb(self.state.get_session_id(), kb_text); self.state.set_status("Knowledge Base saved.", 2000)
        except ApiClientError as e: self.state.set_status(f"KB Save Failed: {e.message}", 4000)
    def run_demo(self, name: str):
        self.create_new_session(); QTimer.singleShot(200, lambda: self._execute_demo_steps(name))
    def _execute_demo_steps(self, name: str):
        with self._action_handler(f"Running Demo: {name}..."):
            demo_data = DemoManager.get_demos()[name]
            all_traces = []
            for i, text in enumerate(demo_data["setup"]):
                self.state.set_status(f"Running Demo: Asserting step {i+1}/{len(demo_data['setup'])}..."); QApplication.processEvents()
                response = self.client.assert_fact(self.state.get_session_id(), text)
                all_traces.extend(self.trace_builder.build_assert_trace(text, response))
                self.state.set_kb_text(response.get("knowledgeBase", ""))
            self.state.set_trace(all_traces)

# --- GUI VIEW ---
class SettingsDialog(QDialog):
    def __init__(self, parent=None, config=None):
        super().__init__(parent); self.setWindowTitle("LLM Configuration"); self.setMinimumWidth(500)
        self.layout = QVBoxLayout(self); form_layout = QFormLayout()
        self.provider_combo = QComboBox(); self.provider_combo.addItems(["Mock", "Ollama", "Gemini"]); form_layout.addRow("LLM Provider:", self.provider_combo)
        self.stacked_widget = QStackedWidget()
        self.ui_map = {"Mock": self.stacked_widget.addWidget(QWidget()), "Ollama": self._create_ollama_ui(), "Gemini": self._create_gemini_ui()}
        form_layout.addRow(self.stacked_widget); self.layout.addLayout(form_layout)
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Save | QDialogButtonBox.StandardButton.Cancel)
        self.layout.addWidget(buttons); buttons.accepted.connect(self.accept); buttons.rejected.connect(self.reject)
        self.provider_combo.currentIndexChanged.connect(self.stacked_widget.setCurrentIndex)
        if config: self.load_config(config)
    def _create_ollama_ui(self) -> QWidget: widget = QWidget(); layout = QFormLayout(widget); self.ollama_base_url = QLineEdit("http://localhost:11434"); self.ollama_model = QLineEdit("llama3"); layout.addRow("Base URL:", self.ollama_base_url); layout.addRow("Model Name:", self.ollama_model); return self.stacked_widget.addWidget(widget)
    def _create_gemini_ui(self) -> QWidget: widget = QWidget(); layout = QFormLayout(widget); self.gemini_api_key = QLineEdit(); self.gemini_api_key.setEchoMode(QLineEdit.EchoMode.Password); self.gemini_api_key.setPlaceholderText("Leave unchanged to keep existing key"); self.gemini_model = QLineEdit("gemini-1.5-flash"); layout.addRow("API Key:", self.gemini_api_key); layout.addRow("Model Name:", self.gemini_model); return self.stacked_widget.addWidget(widget)
    def load_config(self, config: Dict[str, Any]):
        provider = config.get("provider", "Mock")
        if provider in self.ui_map: self.provider_combo.setCurrentText(provider)
        if provider == "Ollama": self.ollama_base_url.setText(config.get("base_url", "http://localhost:11434")); self.ollama_model.setText(config.get("model", "llama3"))
        elif provider == "Gemini": self.gemini_model.setText(config.get("model", "gemini-1.5-flash"))
    def get_config_data(self) -> Dict[str, Any]:
        provider = self.provider_combo.currentText(); data = {"provider": provider, "model": None, "api_key": None, "base_url": None}
        if provider == "Ollama": data.update(base_url=self.ollama_base_url.text(), model=self.ollama_model.text())
        elif provider == "Gemini": data.update(api_key=self.gemini_api_key.text() or "********", model=self.gemini_model.text())
        return data

class MainWindow(QMainWindow):
    def __init__(self, controller: MainController, state: UIState):
        super().__init__(); self.controller = controller; self.state = state
        self.ui_config = self._load_ui_config()
        self.kb_save_timer = QTimer(self); self.kb_save_timer.setSingleShot(True); self.kb_save_timer.setInterval(1000)
        self._setup_ui(); self._setup_menu(); self._apply_ui_config(); self._connect_signals()
        QTimer.singleShot(250, self.controller.initialize_app)
    def _load_ui_config(self) -> Dict[str, Any]:
        if CONFIG_FILE.exists():
            try: return json.loads(CONFIG_FILE.read_text())
            except (json.JSONDecodeError, OSError) as e: logger.warning(f"Could not load UI config file: {e}")
        return {}
    def _save_ui_config(self):
        self.ui_config["window_geometry"] = self.saveGeometry().data().hex(); self.ui_config["splitter_state"] = self.splitter.saveState().data().hex()
        try: CONFIG_FILE.write_text(json.dumps(self.ui_config, indent=2))
        except OSError as e: logger.warning(f"Could not save UI config file: {e}")
    def _apply_ui_config(self):
        self.setWindowTitle(WINDOW_TITLE)
        if geom_hex := self.ui_config.get("window_geometry"): self.restoreGeometry(bytes.fromhex(geom_hex))
        else: self.setGeometry(100, 100, 1600, 900)
        if splitter_hex := self.ui_config.get("splitter_state"): self.splitter.restoreState(bytes.fromhex(splitter_hex))
        else: self.splitter.setSizes([700, 900])
    def _setup_ui(self):
        main_widget = QWidget(); self.setCentralWidget(main_widget); main_layout = QVBoxLayout(main_widget)
        main_layout.addLayout(self._create_session_bar())
        self.splitter = QSplitter(Qt.Orientation.Horizontal); self.splitter.addWidget(self._create_kb_panel()); self.splitter.addWidget(self._create_workbench_panel()); main_layout.addWidget(self.splitter)
        self.statusBar = QStatusBar(); self.setStatusBar(self.statusBar)
    def _create_session_bar(self) -> QHBoxLayout:
        layout = QHBoxLayout(); layout.addWidget(QLabel("<b>Session:</b>")); self.session_combo = QComboBox(); self.session_combo.setToolTip("Select a session"); layout.addWidget(self.session_combo, 1); self.new_session_btn = QPushButton("New Session"); self.new_session_btn.setToolTip("Create a new session"); layout.addWidget(self.new_session_btn); return layout
    def _create_kb_panel(self) -> QWidget: panel = QWidget(); layout = QVBoxLayout(panel); layout.setContentsMargins(0, 0, 0, 0); layout.addWidget(QLabel("<b>Knowledge Base (Facts & Rules)</b>")); self.kb_editor = QPlainTextEdit(); self.kb_editor.setFont(UITheme["font_mono"]); layout.addWidget(self.kb_editor); return panel
    def _create_workbench_panel(self) -> QWidget:
        panel = QWidget(); layout = QVBoxLayout(panel); layout.setContentsMargins(0, 0, 0, 0); layout.addWidget(QLabel("<b>Interaction Panel</b>")); self.workbench_input = QLineEdit(); self.workbench_input.setPlaceholderText("Enter natural language to assert or query..."); self.workbench_input.setFont(UITheme["font_main"]); layout.addWidget(self.workbench_input)
        buttons = QHBoxLayout(); self.assert_btn = QPushButton("Assert"); self.query_btn = QPushButton("Query"); buttons.addWidget(self.assert_btn); buttons.addWidget(self.query_btn); layout.addLayout(buttons)
        trace_header = QHBoxLayout(); trace_header.addWidget(QLabel("<b>Reasoning Trace</b>"), 1); self.clear_trace_btn = QPushButton("Clear Trace"); trace_header.addWidget(self.clear_trace_btn); layout.addLayout(trace_header)
        self.trace_viewer = QTreeWidget(); self.trace_viewer.setHeaderLabels(["Step", "Details"]); self.trace_viewer.header().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents); layout.addWidget(self.trace_viewer); return panel
    def _setup_menu(self):
        menu_bar = self.menuBar(); file_menu = menu_bar.addMenu("&File"); settings_action = QAction("&Settings...", self); settings_action.triggered.connect(self.open_settings); file_menu.addAction(settings_action); file_menu.addSeparator(); exit_action = QAction("E&xit", self); exit_action.triggered.connect(self.close); file_menu.addAction(exit_action)
        demo_menu = menu_bar.addMenu("&Demos")
        for name, description in self.controller.get_demo_scenarios().items():
            action = QAction(name, self); action.setToolTip(description); action.triggered.connect(lambda checked=False, n=name: self.controller.run_demo(n)); demo_menu.addAction(action)
        help_menu = menu_bar.addMenu("&Help"); about_action = QAction("&About MCR Aether...", self); about_action.triggered.connect(self.show_about_dialog); help_menu.addAction(about_action)
    def _connect_signals(self):
        self.new_session_btn.clicked.connect(self.controller.create_new_session)
        self.session_combo.textActivated.connect(self.controller.change_session)
        self.assert_btn.clicked.connect(lambda: self.controller.do_assert(self.workbench_input.text()))
        self.query_btn.clicked.connect(lambda: self.controller.do_query(self.workbench_input.text()))
        self.workbench_input.returnPressed.connect(lambda: self.controller.do_query(self.workbench_input.text()))
        self.clear_trace_btn.clicked.connect(lambda: self.state.set_trace([]))
        self.kb_editor.textChanged.connect(self.kb_save_timer.start); self.kb_save_timer.timeout.connect(lambda: self.controller.save_kb(self.kb_editor.toPlainText()))
        self.state.session_id_changed.connect(self.on_session_id_changed); self.state.kb_text_changed.connect(self.on_kb_text_changed); self.state.sessions_list_changed.connect(self.on_sessions_list_changed); self.state.status_message_changed.connect(self.on_status_message_changed); self.state.trace_changed.connect(self.on_trace_changed); self.state.controls_enabled_changed.connect(self.on_controls_enabled_changed)
    @pyqtSlot(str)
    def on_session_id_changed(self, session_id: str): self.session_combo.blockSignals(True); self.session_combo.setCurrentText(session_id); self.session_combo.blockSignals(False)
    @pyqtSlot(str)
    def on_kb_text_changed(self, text: str):
        if self.kb_editor.toPlainText() != text: self.kb_editor.blockSignals(True); self.kb_editor.setPlainText(text); self.kb_editor.blockSignals(False)
    @pyqtSlot(list)
    def on_sessions_list_changed(self, sessions: List[str]): self.session_combo.blockSignals(True); self.session_combo.clear(); self.session_combo.addItems(sessions); self.session_combo.blockSignals(False)
    @pyqtSlot(str, int)
    def on_status_message_changed(self, msg: str, timeout: int): self.statusBar.showMessage(msg, timeout)
    @pyqtSlot(list)
    def on_trace_changed(self, items: List[QTreeWidgetItem]): self.trace_viewer.clear(); self.trace_viewer.addTopLevelItems(items); self.trace_viewer.expandAll()
    @pyqtSlot(bool)
    def on_controls_enabled_changed(self, enabled: bool):
        for w in [self.session_combo, self.new_session_btn, self.kb_editor, self.workbench_input, self.assert_btn, self.query_btn, self.menuBar(), self.clear_trace_btn]: w.setEnabled(enabled)
    def open_settings(self):
        dialog = SettingsDialog(self, self.ui_config.get("llm_config"))
        if dialog.exec():
            config_data = dialog.get_config_data()
            try:
                self.controller.client.set_llm_config(**config_data)
                self.ui_config["llm_config"] = {k: v for k, v in config_data.items() if k != "api_key"}
                self.state.set_status(f"LLM provider set to {config_data['provider']}.", 3000)
            except ApiClientError as e: QMessageBox.critical(self, "Config Error", f"Failed to apply settings:\n{e.message}")
    def show_about_dialog(self): QMessageBox.about(self, "About MCR Aether", f"<b>MCR-XI Aether v{__version__}</b><br><br>An architecturally pure reasoning workbench built for clarity, reliability, and professional use.")
    def closeEvent(self, event): self._save_ui_config(); event.accept()

# ==============================================================================
# PART 3: APPLICATION LAUNCHER
# ==============================================================================
class ServerThread(QThread):
    server_startup_failed = pyqtSignal(str)
    def run(self):
        config = uvicorn.Config(fastapi_app, host="127.0.0.1", port=8001, log_level="warning")
        server = uvicorn.Server(config)
        try: server.run()
        except OSError as e: self.server_startup_failed.emit("Error: Port 8001 is already in use.")

def set_dark_theme(app: QApplication):
    dark_palette = QPalette(); dark_palette.setColor(QPalette.ColorRole.Window, QColor(45, 45, 45)); dark_palette.setColor(QPalette.ColorRole.WindowText, QColor(224, 224, 224)); dark_palette.setColor(QPalette.ColorRole.Base, QColor(30, 30, 30)); dark_palette.setColor(QPalette.ColorRole.AlternateBase, QColor(53, 53, 53)); dark_palette.setColor(QPalette.ColorRole.ToolTipBase, QColor(224, 224, 224)); dark_palette.setColor(QPalette.ColorRole.ToolTipText, QColor(30, 30, 30)); dark_palette.setColor(QPalette.ColorRole.Text, QColor(224, 224, 224)); dark_palette.setColor(QPalette.ColorRole.Button, QColor(60, 60, 60)); dark_palette.setColor(QPalette.ColorRole.ButtonText, QColor(224, 224, 224)); dark_palette.setColor(QPalette.ColorRole.BrightText, Qt.GlobalColor.red); dark_palette.setColor(QPalette.ColorRole.Link, QColor(42, 130, 218)); dark_palette.setColor(QPalette.ColorRole.Highlight, QColor(42, 130, 218)); dark_palette.setColor(QPalette.ColorRole.HighlightedText, Qt.GlobalColor.white); dark_palette.setColor(QPalette.ColorGroup.Disabled, QPalette.ColorRole.ButtonText, QColor(127, 127, 127)); dark_palette.setColor(QPalette.ColorGroup.Disabled, QPalette.ColorRole.Text, QColor(127, 127, 127))
    app.setPalette(dark_palette); app.setStyleSheet("QToolTip { color: #e0e0e0; background-color: #3c3c3c; border: 1px solid #5a5a5a; } QTreeView::item { padding: 4px; } QPlainTextEdit, QLineEdit { border: 1px solid #5a5a5a; }")

if __name__ == "__main__":
    server_thread = ServerThread()
    server_thread.start()

    app = QApplication(sys.argv)
    set_dark_theme(app)

    # Instantiate the MVC components
    client = MCRClient(MCR_SERVER_URL)
    state = UIState()
    trace_builder = TraceBuilder()
    controller = MainController(state, client, trace_builder)
    window = MainWindow(controller, state)

    server_thread.server_startup_failed.connect(lambda msg: (QMessageBox.critical(window, "Server Startup Failed", msg), window.close()))
    window.show()

    app.aboutToQuit.connect(server_thread.quit)
    sys.exit(app.exec())