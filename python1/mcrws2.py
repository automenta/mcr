# MCR-VIII "Apex" 8.0.0
# A Model Context Reasoner
#
# This is a paradigm-shifting release that introduces dynamic schema-aware
# prompting. The system now analyzes the existing KB to ground the LLM,
# dramatically improving translation accuracy and eliminating predicate invention.
#
# KEY ENHANCEMENTS:
#   - Dynamic Schema Injection: The core innovation. The system automatically
#     extracts the KB's predicate schema and injects it into prompts, forcing
#     the LLM to use existing logical structures.
#   - Hardened Prompts & Logic: Rewritten prompts enforce strict, code-only
#     output. Query decomposition is now far more robust.
#   - Modernized Dependencies: All LangChain calls updated to use the latest
#     non-deprecated packages (e.g., langchain-ollama).
#   - Robust Demo Runner: Demos now halt on failure, providing clear feedback.
#   - Nuanced Trace Visualization: Trace log uses color to distinguish between
#     successful results, valid "no" answers, and system errors.
#
# USAGE:
#   1. Install deps: pip install "fastapi[all]" python-dotenv pytholog PyQt6 requests langchain langchain-core langchain-ollama langchain-google-genai
#   2. Run the app: python mcr_apex.py
#   3. Configure LLM: Go to File -> Settings
#   4. Explore: Run a demo to see schema-aware reasoning in action.

import os
import re
import sys
import json
import uuid
import asyncio
import logging
import textwrap
import errno
import requests
import uvicorn
from contextlib import asynccontextmanager
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import pytholog as pl

from langchain_ollama import ChatOllama
from langchain_google_genai import ChatGoogleGenerativeAI

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLineEdit, QPushButton, QSplitter, QFrame, QLabel,
    QTreeWidget, QTreeWidgetItem, QComboBox, QHeaderView, QMessageBox,
    QDialog, QFormLayout, QDialogButtonBox, QMenuBar, QStackedWidget, QPlainTextEdit,
    QStatusBar
)
from PyQt6.QtGui import QFont, QColor, QPalette, QBrush, QAction, QTextOption, QCursor
from PyQt6.QtCore import Qt, pyqtSignal, QThread, QTimer

__version__ = "8.0.0"
load_dotenv()

# ==============================================================================
# PART 1: MCR CORE SERVICE LOGIC
# ==============================================================================

LOG_LEVEL = os.getenv("LOG_LEVEL", "DEBUG").upper()
MCR_STORAGE_PATH = Path(os.getenv("MCR_STORAGE_PATH", "./mcr_data"))
REASONING_TIMEOUT_SECONDS = 10
CONFIG_FILE = Path.home() / ".mcr_apex_settings.json"

class TraceIdFormatter(logging.Formatter):
    def format(self, record):
        record.trace_id = getattr(record, 'trace_id', 'system')
        return super().format(record)
logger = logging.getLogger("MCR")
logger.setLevel(LOG_LEVEL)
handler = logging.StreamHandler()
formatter = TraceIdFormatter("[%(asctime)s] [%(levelname)s] [%(trace_id)s] %(message)s")
if not logger.handlers: logger.addHandler(handler)
handler.setFormatter(formatter)
logger.propagate = False
def get_logger(): return logging.getLogger("MCR")

class MCRError(Exception): pass
class NotFoundError(MCRError): pass
class ProviderError(MCRError): pass
class ValidationError(MCRError): pass

class Session(BaseModel):
    sessionId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    knowledgeBase: str = Field(default="")
    createdAt: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    modifiedAt: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class LlmConfig(BaseModel): provider: str; model: Optional[str] = None; api_key: Optional[str] = None; base_url: Optional[str] = None
class AssertRequest(BaseModel): text: str
class QueryRequest(BaseModel): query: str
class UpdateKbRequest(BaseModel): knowledgeBase: str
class HealthResponse(BaseModel): status: str; version: str
class AssertResponse(BaseModel): addedFacts: List[str]; knowledgeBase: str; translatedProlog: List[str]
class QueryResponse(BaseModel): queryProlog: str; result: Any; answer: str; debugInfo: Optional[Dict[str, Any]] = None
class ListSessionsResponse(BaseModel): sessionId: str

class ILlmProvider(ABC):
    @abstractmethod
    async def generate(self, prompt: str, trace_id: str) -> str: ...
class IReasonProvider(ABC):
    @abstractmethod
    async def query(self, knowledge_base_str: str, query_str: str, trace_id: str) -> Any: ...
    @abstractmethod
    def validate(self, kb_str: str, trace_id: str) -> Dict[str, Union[bool, str]]: ...
class IContextProvider(ABC):
    @abstractmethod
    async def get_session(self, session_id: str, trace_id: str) -> Session: ...
    @abstractmethod
    async def save_session(self, session: Session, trace_id: str) -> None: ...
    @abstractmethod
    async def list_sessions(self, trace_id: str) -> List[str]: ...

class PromptManager:
    _PROMPTS = {
        "NL_TO_RULES": textwrap.dedent("""
            You are an expert in translating natural language to Prolog. Convert the user's text into a list of valid Prolog facts or rules.
            - Use lowercase atoms and standard Prolog syntax.
            - Infer predicate names and arity from the context.
            - If a schema is provided, STRONGLY prefer using existing predicates.
            - Output ONLY valid Prolog code. Do not include explanations, notes, or markdown formatting.

            {schema_section}
            --- EXAMPLES ---
            User: "The big red sphere is on the small blue cube."
            Output:
            size(sphere, big).
            color(sphere, red).
            position(sphere, on, cube).
            size(cube, small).
            color(cube, blue).

            User: "A person is a suspect if they were at the crime scene."
            Schema: at_location/2
            Output:
            suspect(X) :- at_location(X, crime_scene).
            --- END EXAMPLES ---

            User: "{text}"
            Output:
        """).strip(),
        "NL_TO_QUERY": textwrap.dedent("""
            You are an expert in translating a natural language question to a Prolog query.
            - Output ONLY the query goal, with no period or explanation.
            - Use variables for unknown information.
            - Decompose descriptive nouns into multiple goals (e.g., "large red sphere" -> `size(X, large), color(X, red)`).
            - If a schema is provided, use the existing predicates.

            {schema_section}
            --- EXAMPLES ---
            User: "What color is the sphere?" -> color(sphere, Color)
            User: "Is there a large, blue object?" -> size(Obj, large), color(Obj, blue)
            User: "Who is William's father?" -> father(Father, william)
            --- END EXAMPLES ---

            User: "{query}"
            Output:
        """).strip(),
        "RESULT_TO_NL": textwrap.dedent("""
            You are a helpful assistant. Based *strictly* on the following Prolog query and its JSON result, provide a clear, natural language answer.
            - If the result is an empty list `[]` or the string `"No"`, state that the query was false or found no answers.
            - If the result is a list of dictionaries, it represents successful bindings. Summarize them conversationally.
            - If the result is `true`, the query was true. Confirm this.
            - Explain the answer in the context of the original query. DO NOT invent a "Yes" answer if the result indicates failure.

            Query: {query}
            Result (JSON): {result}

            Answer:
        """).strip(),
    }
    def get(self, template_name: str, **kwargs) -> str:
        schema = kwargs.get("schema")
        schema_section = ""
        if schema:
            schema_text = ", ".join(schema)
            schema_section = f"--- SCHEMA ---\n% The knowledge base currently has these predicates: {schema_text}\n"
        kwargs["schema_section"] = schema_section
        return self._PROMPTS[template_name].format(**kwargs)

class PythologReasonProvider(IReasonProvider):
    async def query(self, knowledge_base_str: str, query_str: str, trace_id: str) -> Any:
        try:
            kb = pl.KnowledgeBase("mcr_reasoner")
            kb(knowledge_base_str.splitlines())
            result = await asyncio.wait_for(asyncio.to_thread(kb.query, pl.Expr(query_str)), timeout=REASONING_TIMEOUT_SECONDS)
            return result if result is not None else []
        except asyncio.TimeoutError: raise ProviderError(f"Reasoning query timed out after {REASONING_TIMEOUT_SECONDS}s.")
        except Exception as e: raise ProviderError(f"Pytholog reasoning error: {e}")
    def validate(self, kb_str: str, trace_id: str) -> Dict[str, Union[bool, str]]:
        try: pl.KnowledgeBase("validation_kb")(kb_str.splitlines()); return {"valid": True}
        except Exception as e: return {"valid": False, "error": str(e)}

class FileContextProvider(IContextProvider):
    def __init__(self, storage_path: Path):
        self.sessions_path = storage_path / "sessions"
        try: self.sessions_path.mkdir(parents=True, exist_ok=True)
        except OSError as e: get_logger().error(f"Could not create storage directory at {self.sessions_path}: {e}"); raise
        get_logger().info(f"Using FileContextProvider. Storage path: {self.sessions_path.resolve()}")
    async def get_session(self, session_id: str, trace_id: str) -> Session:
        session_file = self.sessions_path / f"{session_id}.json"
        if not session_file.exists(): raise NotFoundError(f"Session '{session_id}' not found.")
        return Session.model_validate_json(session_file.read_text())
    async def save_session(self, session: Session, trace_id: str) -> None:
        session.modifiedAt = datetime.now(timezone.utc).isoformat()
        session_file = self.sessions_path / f"{session.sessionId}.json"
        session_file.write_text(session.model_dump_json(indent=2))
    async def list_sessions(self, trace_id: str) -> List[str]:
        return sorted([p.stem for p in self.sessions_path.glob("*.json")])

class MockLlmProvider(ILlmProvider):
    async def generate(self, prompt: str, trace_id: str) -> str:
        get_logger().warning("Using MockLlmProvider.", extra={'trace_id': trace_id})
        if "NL_TO_RULES" in prompt: return "mock_fact(mock)."
        if "NL_TO_QUERY" in prompt: return "mock_query(X)"
        if "RESULT_TO_NL" in prompt: return "This is a mock answer from the MockLlmProvider."
        return "placeholder(mock)."
class OllamaLlmProvider(ILlmProvider):
    def __init__(self, model: str, base_url: str): self.llm = ChatOllama(model=model, base_url=base_url)
    async def generate(self, prompt: str, trace_id: str) -> str: response = await self.llm.ainvoke(prompt); return response.content
class GeminiLlmProvider(ILlmProvider):
    def __init__(self, model: str, api_key: str): self.llm = ChatGoogleGenerativeAI(model=model, google_api_key=api_key)
    async def generate(self, prompt: str, trace_id: str) -> str: response = await self.llm.ainvoke(prompt); return response.content

class MCRService:
    def __init__(self, llm: ILlmProvider, reasoner: IReasonProvider, context: IContextProvider):
        self.llm, self.reasoner, self.context, self.prompts = llm, reasoner, context, PromptManager()
    def _extract_prolog(self, text: str) -> List[str]:
        lines = [line.strip() for line in text.split('\n') if line.strip() and not line.strip().startswith('%')]
        return [f"{line}" if re.search(r'[:.]$', line) else f"{line}." for line in lines]
    def _get_kb_schema(self, kb_string: str) -> List[str]:
        predicates = set()
        for line in kb_string.splitlines():
            line = line.strip()
            if not line or line.startswith('%'): continue
            match = re.match(r'([a-z][a-zA-Z0-9_]*)\(', line)
            if match:
                name = match.group(1)
                arity = line.count(',') + 1 if '(' in line and ')' in line else 0
                if ':-' in line: arity -= line.split(':-')[1].count(',')
                predicates.add(f"{name}/{arity}")
        return sorted(list(predicates))
    async def assert_into_session(self, session_id: str, text: str, trace_id: str) -> AssertResponse:
        session = await self.context.get_session(session_id, trace_id)
        schema = self._get_kb_schema(session.knowledgeBase)
        prompt = self.prompts.get("NL_TO_RULES", text=text, schema=schema)
        get_logger().debug(f"Assert prompt for LLM:\n---\n{prompt}\n---", extra={'trace_id': trace_id})
        llm_response = await self.llm.generate(prompt, trace_id)
        get_logger().debug(f"Assert LLM response:\n---\n{llm_response}\n---", extra={'trace_id': trace_id})
        new_facts = self._extract_prolog(llm_response)
        current_kb_lines = set(session.knowledgeBase.splitlines())
        added = [fact for fact in new_facts if fact not in current_kb_lines]
        if added:
            session.knowledgeBase = (session.knowledgeBase + "\n" + "\n".join(added)).strip()
            await self.context.save_session(session, trace_id)
        return AssertResponse(addedFacts=added, knowledgeBase=session.knowledgeBase, translatedProlog=new_facts)
    async def run_query(self, session_id: str, request: QueryRequest, trace_id: str) -> QueryResponse:
        session = await self.context.get_session(session_id, trace_id)
        schema = self._get_kb_schema(session.knowledgeBase)
        debug_info = {}
        query_prompt = self.prompts.get("NL_TO_QUERY", query=request.query, schema=schema)
        get_logger().debug(f"Query prompt for LLM:\n---\n{query_prompt}\n---", extra={'trace_id': trace_id})
        prolog_query_raw = await self.llm.generate(query_prompt, trace_id)
        prolog_query = prolog_query_raw.strip().rstrip('.')
        debug_info["generated_prolog_query"] = prolog_query
        get_logger().debug(f"Generated Prolog query: {prolog_query}", extra={'trace_id': trace_id})
        result = await self.reasoner.query(session.knowledgeBase, prolog_query, trace_id)
        debug_info["raw_reasoner_result"] = result
        get_logger().debug(f"Reasoner result: {result}", extra={'trace_id': trace_id})
        result_for_llm = "true" if result is True else ("No" if result is False else result)
        answer_prompt = self.prompts.get("RESULT_TO_NL", query=prolog_query, result=json.dumps(result_for_llm))
        get_logger().debug(f"Answer prompt for LLM:\n---\n{answer_prompt}\n---", extra={'trace_id': trace_id})
        answer = await self.llm.generate(answer_prompt, trace_id)
        get_logger().debug(f"Final answer from LLM: {answer}", extra={'trace_id': trace_id})
        return QueryResponse(queryProlog=prolog_query, result=result, answer=answer, debugInfo=debug_info)

mcr_service: MCRService
llm_config_store: Dict[str, Any] = {"provider": "Mock", "model": "mock-model"}
def create_llm_provider(config: Dict[str, Any]) -> ILlmProvider:
    provider_name = config.get("provider")
    try:
        match provider_name:
            case "Ollama": return OllamaLlmProvider(model=config["model"], base_url=config["base_url"])
            case "Gemini": return GeminiLlmProvider(model=config["model"], api_key=config["api_key"])
            case "Mock": return MockLlmProvider()
            case _: raise ProviderError(f"Unknown LLM provider: {provider_name}")
    except KeyError as e: raise ProviderError(f"Missing configuration key for {provider_name}: {e}")
    except Exception as e: raise ProviderError(f"Failed to initialize {provider_name}: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    global mcr_service
    get_logger().info(f"MCR Service starting up (v{__version__})...")
    llm = create_llm_provider(llm_config_store)
    context = FileContextProvider(MCR_STORAGE_PATH)
    reasoner = PythologReasonProvider()
    mcr_service = MCRService(llm, reasoner, context)
    yield

fastapi_app = FastAPI(title="MCR Apex", version=__version__, lifespan=lifespan)
@fastapi_app.middleware("http")
async def trace_id_middleware(request: Request, call_next):
    trace_id = request.headers.get("X-Trace-ID", str(uuid.uuid4())); request.state.trace_id = trace_id; response = await call_next(request); response.headers["X-Trace-ID"] = trace_id; return response
@fastapi_app.exception_handler(MCRError)
async def mcr_exception_handler(request: Request, exc: MCRError):
    code = status.HTTP_404_NOT_FOUND if isinstance(exc, NotFoundError) else status.HTTP_400_BAD_REQUEST
    if isinstance(exc, ProviderError): code = status.HTTP_400_BAD_REQUEST
    return JSONResponse(status_code=code, content={"error": {"type": type(exc).__name__, "message": str(exc)}})

@fastapi_app.get("/health", response_model=HealthResponse)
async def health_check(): return {"status": "ok", "version": __version__}
@fastapi_app.post("/config/llm", status_code=200)
async def set_llm_config(config: LlmConfig, request: Request):
    global mcr_service, llm_config_store
    new_config_dict = config.model_dump()
    if config.api_key and all(c == '*' for c in config.api_key): new_config_dict["api_key"] = llm_config_store.get("api_key")
    try: mcr_service.llm = create_llm_provider(new_config_dict); llm_config_store = new_config_dict; get_logger().info(f"LLM provider updated to {config.provider}.", extra={'trace_id': request.state.trace_id}); return {"message": f"LLM provider updated to {config.provider}."}
    except ProviderError as e: raise HTTPException(status_code=400, detail=str(e))
@fastapi_app.post("/sessions", status_code=201, response_model=Session)
async def create_session(request: Request): session = Session(); await mcr_service.context.save_session(session, request.state.trace_id); return session
@fastapi_app.get("/sessions/list", response_model=List[ListSessionsResponse])
async def list_sessions(request: Request): return [ListSessionsResponse(sessionId=sid) for sid in await mcr_service.context.list_sessions(request.state.trace_id)]
@fastapi_app.get("/sessions/{session_id}", response_model=Session)
async def get_session(session_id: str, request: Request): return await mcr_service.context.get_session(session_id, request.state.trace_id)
@fastapi_app.post("/sessions/{session_id}/assert", response_model=AssertResponse)
async def assert_fact(session_id: str, body: AssertRequest, request: Request): return await mcr_service.assert_into_session(session_id, body.text, request.state.trace_id)
@fastapi_app.post("/sessions/{session_id}/query", response_model=QueryResponse)
async def query_session(session_id: str, body: QueryRequest, request: Request): return await mcr_service.run_query(session_id, body, request.state.trace_id)
@fastapi_app.put("/sessions/{session_id}/kb", status_code=200)
async def update_kb(session_id: str, body: UpdateKbRequest, request: Request):
    session = await mcr_service.context.get_session(session_id, request.state.trace_id)
    validation = mcr_service.reasoner.validate(body.knowledgeBase, request.state.trace_id)
    if not validation["valid"]: raise ValidationError(f"KB validation failed: {validation['error']}")
    session.knowledgeBase = body.knowledgeBase; await mcr_service.context.save_session(session, request.state.trace_id); return {"message": "Knowledge base updated."}

# ==============================================================================
# PART 2: PYQT6 GRAPHICAL USER INTERFACE
# ==============================================================================
MCR_SERVER_URL = "http://127.0.0.1:8001"
WINDOW_TITLE = f"MCR-VIII Apex v{__version__}"

class DemoManager:
    _DEMOS = {
        "Spatial Reasoning": {
            "description": "A scene with objects, demonstrating schema-aware rule creation.",
            "setup": [ "The sphere is large and red.", "The cube is small and blue.", "The cube is behind the sphere.", "The pyramid is on top of the cube.", "Something is in front of an object if that object is behind it.", "Something is above an object if it is on top of that object." ],
            "sample_query": "What is in front of the large sphere?",
        },
        "Royal Family Tree": {
            "description": "Genealogy of the British royal family, for complex relationship queries.",
            "setup": [ "Elizabeth II and Philip are the parents of Charles and Anne.", "Charles and Diana are the parents of William and Harry.", "William and Catherine are the parents of George.", "Elizabeth II, Diana, Catherine, Anne are female.", "Philip, Charles, William, Harry, George are male.", "A person's mother is their female parent.", "A person's father is their male parent.", "A grandparent is the parent of a parent." ],
            "sample_query": "Who are the grandparents of Prince George?",
        },
        "Murder Mystery": {
            "description": "A classic logic puzzle to deduce a suspect from clues.",
            "setup": [ "Plum was in the library at 9pm.", "Scarlet was in the lounge at 9pm.", "Mustard owned the dagger.", "The dagger was found in the library.", "The victim is Mr. Black.", "The crime scene is the library.", "The time of death was 9pm.", "Plum and Scarlet had a motive to harm Mr. Black.", "A person is a suspect if they had a motive and were at the crime scene at the time of death." ],
            "sample_query": "Who is a suspect?",
        },
    }
    @staticmethod
    def get_demos(): return DemoManager._DEMOS

class MCRClient:
    def __init__(self, base_url): self.base_url = base_url; self.session = requests.Session()
    def _request(self, method, endpoint, **kwargs):
        try:
            response = self.session.request(method, f"{self.base_url}{endpoint}", **kwargs, timeout=60)
            if not response.ok:
                try: return response.json()
                except json.JSONDecodeError: return {"error": {"message": f"HTTP {response.status_code}: {response.text}"}}
            return None if response.status_code == 204 else response.json()
        except requests.exceptions.RequestException as e: return {"error": {"message": str(e)}}
    def check_health(self): return self._request("GET", "/health")
    def set_llm_config(self, **kwargs): return self._request("POST", "/config/llm", json=kwargs)
    def create_session(self): return self._request("POST", "/sessions")
    def list_sessions(self): return self._request("GET", "/sessions/list")
    def get_session(self, session_id): return self._request("GET", f"/sessions/{session_id}")
    def update_kb(self, session_id, kb_content): return self._request("PUT", f"/sessions/{session_id}/kb", json={"knowledgeBase": kb_content})
    def assert_fact(self, session_id, text): return self._request("POST", f"/sessions/{session_id}/assert", json={"text": text})
    def query(self, session_id, query): return self._request("POST", f"/sessions/{session_id}/query", json={"query": query})

class ServerThread(QThread):
    server_startup_failed = pyqtSignal(str)
    def __init__(self): super().__init__(); self.server = None
    def run(self):
        config = uvicorn.Config(fastapi_app, host="127.0.0.1", port=8001, log_level="warning")
        self.server = uvicorn.Server(config)
        try: self.server.run()
        except OSError as e: msg = "Port 8001 is already in use." if e.errno == errno.EADDRINUSE else f"An OS error occurred: {e}"; self.server_startup_failed.emit(msg)
    def stop(self):
        if self.server: self.server.should_exit = True

class SettingsDialog(QDialog):
    def __init__(self, parent=None, config=None):
        super().__init__(parent)
        self.setWindowTitle("LLM Configuration"); self.setMinimumWidth(500)
        self.layout = QVBoxLayout(self)
        form_layout = QFormLayout()
        self.provider_combo = QComboBox(); self.provider_combo.addItems(["Mock", "Ollama", "Gemini"])
        form_layout.addRow("LLM Provider:", self.provider_combo)
        self.stacked_widget = QStackedWidget(); form_layout.addRow(self.stacked_widget)
        self.ui_map = { "Mock": self.stacked_widget.addWidget(QWidget()), "Ollama": self._create_ollama_ui(), "Gemini": self._create_gemini_ui() }
        self.layout.addLayout(form_layout)
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Save | QDialogButtonBox.StandardButton.Cancel)
        self.layout.addWidget(buttons)
        buttons.accepted.connect(self.accept); buttons.rejected.connect(self.reject)
        self.provider_combo.currentIndexChanged.connect(self.stacked_widget.setCurrentIndex)
        if config: self.load_config(config)
    def _create_ollama_ui(self):
        widget = QWidget(); layout = QFormLayout(widget)
        self.ollama_base_url = QLineEdit("http://localhost:11434"); self.ollama_model = QLineEdit("llama3")
        layout.addRow("Base URL:", self.ollama_base_url); layout.addRow("Model Name:", self.ollama_model)
        return self.stacked_widget.addWidget(widget)
    def _create_gemini_ui(self):
        widget = QWidget(); layout = QFormLayout(widget)
        self.gemini_api_key = QLineEdit(); self.gemini_api_key.setEchoMode(QLineEdit.EchoMode.Password)
        self.gemini_api_key.setPlaceholderText("Leave unchanged to keep existing key")
        self.gemini_model = QLineEdit("gemini-1.5-flash")
        layout.addRow("API Key:", self.gemini_api_key); layout.addRow("Model Name:", self.gemini_model)
        return self.stacked_widget.addWidget(widget)
    def load_config(self, config):
        provider = config.get("provider", "Mock")
        self.provider_combo.setCurrentText(provider)
        if provider == "Ollama": self.ollama_base_url.setText(config.get("base_url", "")); self.ollama_model.setText(config.get("model", ""))
        elif provider == "Gemini": self.gemini_model.setText(config.get("model", ""))
    def get_config_data(self):
        provider = self.provider_combo.currentText()
        data = {"provider": provider, "model": None, "api_key": None, "base_url": None}
        if provider == "Ollama": data.update(base_url=self.ollama_base_url.text(), model=self.ollama_model.text())
        elif provider == "Gemini": data.update(api_key=self.gemini_api_key.text() or "********", model=self.gemini_model.text())
        return data

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.client = MCRClient(MCR_SERVER_URL); self.server_thread = ServerThread()
        self.current_session_id = None; self.ui_config = self.load_ui_config()
        self.health_check_timer = QTimer(self); self.kb_save_timer = QTimer(self)
        self.kb_save_timer.setSingleShot(True); self.kb_save_timer.setInterval(1000)
        self.is_demo_running = False
        self.setup_ui(); self.setup_menu(); self.setup_signals(); self.apply_ui_config()
        self.start_server()

    def load_ui_config(self):
        if CONFIG_FILE.exists():
            try: return json.loads(CONFIG_FILE.read_text())
            except (json.JSONDecodeError, OSError): pass
        return {}
    def save_ui_config(self):
        self.ui_config["window_geometry"] = self.saveGeometry().data().hex()
        self.ui_config["splitter_state"] = self.splitter.saveState().data().hex()
        try: CONFIG_FILE.write_text(json.dumps(self.ui_config, indent=2))
        except OSError as e: get_logger().warning(f"Could not save UI config: {e}")
    def apply_ui_config(self):
        self.setWindowTitle(WINDOW_TITLE)
        if geom_hex := self.ui_config.get("window_geometry"): self.restoreGeometry(bytes.fromhex(geom_hex))
        else: self.setGeometry(100, 100, 1600, 900)
        if splitter_hex := self.ui_config.get("splitter_state"): self.splitter.restoreState(bytes.fromhex(splitter_hex))
        else: self.splitter.setSizes([700, 900])

    def setup_ui(self):
        main_widget = QWidget(); self.setCentralWidget(main_widget)
        main_layout = QVBoxLayout(main_widget)
        top_layout = QHBoxLayout()
        top_layout.addWidget(QLabel("<b>Session:</b>"))
        self.session_combo = QComboBox(); self.session_combo.setToolTip("Select an active reasoning session")
        top_layout.addWidget(self.session_combo, 1)
        self.new_session_btn = QPushButton("New Session"); self.new_session_btn.setToolTip("Create a new, empty session")
        top_layout.addWidget(self.new_session_btn)
        main_layout.addLayout(top_layout)
        self.splitter = QSplitter(Qt.Orientation.Horizontal)
        kb_panel = QFrame(); kb_panel.setFrameShape(QFrame.Shape.NoFrame); kb_layout = QVBoxLayout(kb_panel); kb_layout.setContentsMargins(0,0,0,0)
        kb_layout.addWidget(QLabel("<b>Knowledge Base (Facts & Rules)</b>")); self.kb_editor = QPlainTextEdit(); self.kb_editor.setFont(QFont("Consolas", 11)); self.kb_editor.setWordWrapMode(QTextOption.WrapMode.NoWrap); kb_layout.addWidget(self.kb_editor)
        wb_panel = QFrame(); wb_panel.setFrameShape(QFrame.Shape.NoFrame); wb_layout = QVBoxLayout(wb_panel); wb_layout.setContentsMargins(0,0,0,0)
        wb_layout.addWidget(QLabel("<b>Interaction Panel</b>")); self.workbench_input = QLineEdit(); self.workbench_input.setPlaceholderText("Enter natural language to assert or query..."); self.workbench_input.setFont(QFont("Segoe UI", 11)); wb_layout.addWidget(self.workbench_input)
        wb_buttons = QHBoxLayout(); self.assert_btn = QPushButton("Assert as Fact"); self.assert_btn.setToolTip("Translate text into Prolog facts/rules and add to the KB"); self.query_btn = QPushButton("Ask as Query"); self.query_btn.setToolTip("Translate text into a Prolog query and run it against the KB"); wb_buttons.addWidget(self.assert_btn); wb_buttons.addWidget(self.query_btn); wb_layout.addLayout(wb_buttons)
        trace_header = QHBoxLayout(); trace_header.addWidget(QLabel("<b>Reasoning Trace</b>"), 1); self.clear_trace_btn = QPushButton("Clear Trace"); self.clear_trace_btn.setToolTip("Clear the trace log below"); trace_header.addWidget(self.clear_trace_btn); wb_layout.addLayout(trace_header)
        self.trace_viewer = QTreeWidget(); self.trace_viewer.setHeaderLabels(["Step", "Details"]); self.trace_viewer.header().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents); wb_layout.addWidget(self.trace_viewer)
        self.splitter.addWidget(kb_panel); self.splitter.addWidget(wb_panel); main_layout.addWidget(self.splitter)
        self.set_controls_enabled(False); self.statusBar = QStatusBar(); self.setStatusBar(self.statusBar); self.statusBar.showMessage("Initializing...")

    def setup_menu(self):
        menu_bar = self.menuBar()
        file_menu = menu_bar.addMenu("&File"); settings_action = QAction("&Settings...", self); settings_action.triggered.connect(self.open_settings); file_menu.addAction(settings_action); file_menu.addSeparator(); exit_action = QAction("E&xit", self); exit_action.triggered.connect(self.close); file_menu.addAction(exit_action)
        demo_menu = menu_bar.addMenu("&Demos")
        for name, data in DemoManager.get_demos().items():
            action = QAction(name, self); action.setToolTip(data["description"]); action.triggered.connect(lambda _, d=data, n=name: self.run_demo_scenario(n, d)); demo_menu.addAction(action)
        help_menu = menu_bar.addMenu("&Help"); about_action = QAction("&About MCR Apex...", self); about_action.triggered.connect(self.show_about_dialog); help_menu.addAction(about_action)

    def set_controls_enabled(self, enabled): [w.setEnabled(enabled) for w in [self.session_combo, self.new_session_btn, self.kb_editor, self.workbench_input, self.assert_btn, self.query_btn, self.menuBar(), self.clear_trace_btn]]
    def setup_signals(self):
        self.server_thread.server_startup_failed.connect(self.on_server_startup_failed); self.health_check_timer.timeout.connect(self.check_server_health); self.session_combo.currentIndexChanged.connect(self.on_session_changed)
        self.new_session_btn.clicked.connect(self.create_new_session); self.assert_btn.clicked.connect(self.do_assert); self.query_btn.clicked.connect(self.do_query); self.workbench_input.returnPressed.connect(self.do_query)
        self.kb_editor.textChanged.connect(lambda: self.kb_save_timer.start(1000) if not self.is_demo_running else None); self.kb_save_timer.timeout.connect(self.save_kb); self.clear_trace_btn.clicked.connect(self.trace_viewer.clear)

    def start_server(self): self.server_thread.start(); self.health_check_timer.start(250)
    def on_server_startup_failed(self, message): self.health_check_timer.stop(); QMessageBox.critical(self, "Server Startup Failed", message); self.close()
    def check_server_health(self):
        if not self.server_thread.isRunning() and not self.health_check_timer.isActive(): return
        if self.client.check_health().get("status") == "ok": self.health_check_timer.stop(); self.on_server_started()
    def on_server_started(self):
        self.statusBar.showMessage("Server running. Ready.", 3000); self.set_controls_enabled(True); self.populate_sessions()
        if not self.session_combo.count(): self.create_new_session()
        if llm_conf := self.ui_config.get("llm_config"): self.client.set_llm_config(**llm_conf)

    def open_settings(self):
        dialog = SettingsDialog(self, self.ui_config.get("llm_config"))
        if dialog.exec():
            config_data = dialog.get_config_data()
            response = self.client.set_llm_config(**config_data)
            if "error" in response: QMessageBox.critical(self, "Config Error", f"Failed to apply settings:\n{response['error']['message']}")
            else: self.ui_config["llm_config"] = {k: v for k, v in config_data.items() if k != "api_key"}; self.statusBar.showMessage(f"LLM provider set to {config_data['provider']}.", 3000)

    def populate_sessions(self):
        self.session_combo.blockSignals(True); self.session_combo.clear()
        response = self.client.list_sessions()
        if response and "error" not in response: [self.session_combo.addItem(s['sessionId']) for s in response]
        self.session_combo.blockSignals(False)
        if self.session_combo.count() > 0: self.on_session_changed(0)
        else: self.current_session_id = None; self.kb_editor.clear(); self.trace_viewer.clear()

    def on_session_changed(self, index):
        if index < 0 or self.is_demo_running: return
        self.current_session_id = self.session_combo.itemText(index); self.statusBar.showMessage(f"Loading session {self.current_session_id[:8]}...", 2000)
        response = self.client.get_session(self.current_session_id)
        self.kb_editor.blockSignals(True)
        if "error" not in response: self.kb_editor.setPlainText(response.get("knowledgeBase", ""))
        else: self.kb_editor.setPlainText(f"% Error loading session: {response['error']['message']}")
        self.kb_editor.blockSignals(False); self.trace_viewer.clear()

    def create_new_session(self):
        response = self.client.create_session()
        if "error" in response: QMessageBox.critical(self, "Error", response['error']['message'])
        else: self.populate_sessions(); self.session_combo.setCurrentText(response["sessionId"]); self.statusBar.showMessage(f"New session created: {response['sessionId'][:8]}", 3000)

    def run_demo_scenario(self, name, demo_data):
        self.is_demo_running = True; self.create_new_session()
        if not self.current_session_id: self.is_demo_running = False; return
        self.trace_viewer.clear(); self.statusBar.showMessage(f"Running Demo: {name}...", 0)
        QApplication.setOverrideCursor(QCursor(Qt.CursorShape.WaitCursor)); self.set_controls_enabled(False)
        final_kb = ""
        for i, text in enumerate(demo_data["setup"]):
            self.statusBar.showMessage(f"Running Demo: Asserting step {i+1}/{len(demo_data['setup'])}...", 0)
            response = self.client.assert_fact(self.current_session_id, text)
            if "error" in response: self._display_error_trace("Demo Failed", response['error']['message']); break
            self._display_assert_trace(text, response); final_kb = response.get("knowledgeBase", "")
            QApplication.processEvents()
        else: self.workbench_input.setText(demo_data["sample_query"]); self.statusBar.showMessage(f"Demo '{name}' loaded. Ready to query.", 5000)
        self.kb_editor.blockSignals(True); self.kb_editor.setPlainText(final_kb); self.kb_editor.blockSignals(False)
        QApplication.restoreOverrideCursor(); self.set_controls_enabled(True); self.is_demo_running = False

    def save_kb(self):
        if not self.current_session_id or not self.kb_editor.isEnabled(): return
        response = self.client.update_kb(self.current_session_id, self.kb_editor.toPlainText())
        if "error" in response: self.statusBar.showMessage(f"KB Save Failed: {response['error']['message']}", 4000)
        else: self.statusBar.showMessage("Knowledge Base saved.", 2000)

    def _execute_action(self, action_func, text, action_name):
        if not text or not self.current_session_id: return
        self.set_controls_enabled(False); QApplication.setOverrideCursor(QCursor(Qt.CursorShape.WaitCursor)); self.statusBar.showMessage(f"Processing {action_name}...", 0)
        response = action_func(self.current_session_id, text)
        QApplication.restoreOverrideCursor(); self.set_controls_enabled(True); self.workbench_input.setFocus()
        return response
    def do_assert(self):
        text = self.workbench_input.text().strip(); response = self._execute_action(self.client.assert_fact, text, "Assert")
        if not response: return
        self.workbench_input.clear()
        if "error" in response: self._display_error_trace("Assert Failed", response['error']['message'])
        else: self._display_assert_trace(text, response); self.kb_editor.setPlainText(response.get("knowledgeBase", ""))
    def do_query(self):
        text = self.workbench_input.text().strip(); response = self._execute_action(self.client.query, text, "Query")
        if not response: return
        self.workbench_input.clear()
        if "error" in response: self._display_error_trace("Query Failed", response['error']['message'])
        else: self._display_query_trace(text, response)

    def _add_trace_entry(self, parent, title, detail, color="#e0e0e0", is_code=False):
        item = QTreeWidgetItem(parent, [f" {title}", str(detail)]); item.setForeground(0, QBrush(QColor(color))); item.setFont(0, QFont("Segoe UI", 10, QFont.Weight.Bold))
        if is_code: item.setFont(1, QFont("Consolas", 10))
        return item
    def _display_error_trace(self, title, message):
        self.trace_viewer.clear(); root = self._add_trace_entry(self.trace_viewer, "ERROR", title, "#e57373"); self._add_trace_entry(root, "Detail", message); self.statusBar.showMessage(f"{title}: {message}", 5000)
    def _display_assert_trace(self, nl_text, response):
        root = self._add_trace_entry(self.trace_viewer, "ACTION", "Assert Fact", "#64b5f6")
        self._add_trace_entry(root, "INPUT (NL)", f'"{nl_text}"')
        self._add_trace_entry(root, "TRANSLATION (Prolog)", "\n".join(response.get("translatedProlog", [])), "#fff176", is_code=True)
        self._add_trace_entry(root, "OUTCOME", f"{len(response.get('addedFacts', []))} fact(s) added to KB.", "#81c784")
        root.setExpanded(True)
    def _display_query_trace(self, nl_text, response):
        self.trace_viewer.clear()
        root = self._add_trace_entry(self.trace_viewer, "ACTION", "Run Query", "#64b5f6")
        self._add_trace_entry(root, "INPUT (NL)", f'"{nl_text}"')
        debug_info = response.get("debugInfo", {}); self._add_trace_entry(root, "TRANSLATION (Prolog)", debug_info.get("generated_prolog_query", "N/A"), "#fff176", is_code=True)
        reason_item = self._add_trace_entry(root, "REASONING (Execution)", f'Executing query...', "#ffb74d")
        result = response.get("result")
        result_color = "#81c784" if result and result != ['No'] else "#e57373" if result == ['No'] else "#fff176"
        self._add_trace_entry(reason_item, "Prolog Query", response.get("queryProlog", "N/A"), is_code=True)
        self._add_trace_entry(reason_item, "Raw Result", json.dumps(result), result_color, is_code=True)
        self._add_trace_entry(root, "EXPLANATION (NL)", response.get("answer", "N/A"), "#81c784")
        self.trace_viewer.expandAll(); self.statusBar.showMessage("Query successful. See trace for details.", 3000)

    def show_about_dialog(self): QMessageBox.about(self, "About MCR Apex", f"<b>MCR-VIII Apex v{__version__}</b><br><br>A workbench for exploring the paradigm of LLM-driven logical reasoning with dynamic schema awareness.")
    def closeEvent(self, event):
        self.save_ui_config(); self.health_check_timer.stop(); self.server_thread.stop(); self.server_thread.quit()
        if not self.server_thread.wait(3000): self.server_thread.terminate()
        event.accept()

def set_dark_theme(app):
    dark_palette = QPalette()
    dark_palette.setColor(QPalette.ColorRole.Window, QColor(45, 45, 45)); dark_palette.setColor(QPalette.ColorRole.WindowText, QColor(224, 224, 224))
    dark_palette.setColor(QPalette.ColorRole.Base, QColor(30, 30, 30)); dark_palette.setColor(QPalette.ColorRole.AlternateBase, QColor(53, 53, 53))
    dark_palette.setColor(QPalette.ColorRole.ToolTipBase, QColor(224, 224, 224)); dark_palette.setColor(QPalette.ColorRole.ToolTipText, QColor(30, 30, 30))
    dark_palette.setColor(QPalette.ColorRole.Text, QColor(224, 224, 224)); dark_palette.setColor(QPalette.ColorRole.Button, QColor(60, 60, 60))
    dark_palette.setColor(QPalette.ColorRole.ButtonText, QColor(224, 224, 224)); dark_palette.setColor(QPalette.ColorRole.BrightText, Qt.GlobalColor.red)
    dark_palette.setColor(QPalette.ColorRole.Link, QColor(42, 130, 218)); dark_palette.setColor(QPalette.ColorRole.Highlight, QColor(42, 130, 218))
    dark_palette.setColor(QPalette.ColorRole.HighlightedText, Qt.GlobalColor.white); dark_palette.setColor(QPalette.ColorGroup.Disabled, QPalette.ColorRole.ButtonText, QColor(127, 127, 127)); dark_palette.setColor(QPalette.ColorGroup.Disabled, QPalette.ColorRole.Text, QColor(127, 127, 127))
    app.setPalette(dark_palette); app.setStyleSheet("QToolTip { color: #e0e0e0; background-color: #3c3c3c; border: 1px solid #5a5a5a; } QTreeView::item { padding: 4px; }")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    set_dark_theme(app)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())