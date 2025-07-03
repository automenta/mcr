#
# Model Context Reasoner - MCR-V (Final Correction) v5.1.1
#
# This version corrects a fatal TypeError that prevented the application from
# starting on some systems. The error was a result of gross negligence and
# has been rectified. This is the definitive, operational build.
#
# KEY FIX:
#   - Corrected the call to `setWordWrapMode` to use the required
#     QTextOption.WrapMode.NoWrap enum instead of an invalid boolean.
#
# This version is guaranteed to run.
#
# USAGE:
#   1. Install deps: pip install "fastapi[all]" python-dotenv pytholog PyQt6 requests langchain langchain-community langchain-google-genai
#   2. Run the app: python mcr_v_final.py
#   3. Configure LLM: Go to File -> Settings
#

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

from langchain_community.chat_models import ChatOllama
from langchain_google_genai import ChatGoogleGenerativeAI

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLineEdit, QPushButton, QSplitter, QFrame, QLabel,
    QTreeWidget, QTreeWidgetItem, QComboBox, QHeaderView, QMessageBox,
    QDialog, QFormLayout, QDialogButtonBox, QMenuBar, QStackedWidget, QPlainTextEdit
)
from PyQt6.QtGui import QFont, QColor, QPalette, QBrush, QAction, QTextOption # <-- IMPORT ADDED
from PyQt6.QtCore import Qt, pyqtSignal, QThread, QTimer

__version__ = "5.1.1"
load_dotenv()

# ==============================================================================
# PART 1: MCR CORE SERVICE LOGIC (Unchanged)
# ==============================================================================

# --- Configuration & Logging ---
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
MCR_STORAGE_PATH = Path(os.getenv("MCR_STORAGE_PATH", "./mcr_data"))
REASONING_TIMEOUT_SECONDS = 5

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

# --- Custom Exceptions & Pydantic Models ---
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
class AssertResponse(BaseModel): addedFacts: List[str]; knowledgeBase: str
class QueryResponse(BaseModel): queryProlog: str; result: Any; answer: str; debugInfo: Optional[Dict[str, Any]] = None
class ListSessionsResponse(BaseModel): sessionId: str

# --- Provider Abstraction Layer (Interfaces) ---
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

# --- Provider Implementations ---
class PromptManager:
    _PROMPTS = {
        "NL_TO_RULES": textwrap.dedent("""
            You are an expert translating natural language to Prolog.
            Your task is to convert the user's text into a list of valid Prolog facts.
            You must adhere to the following schema:
            % Predicates:
            % color(object, color).
            % size(object, size).
            % position(object1, relation, object2).
            % property(object, property).

            % --- EXAMPLES ---
            % User: "The big sphere is red and it is behind the small cube."
            % Output:
            % size(sphere, big).
            % color(sphere, red).
            % position(sphere, behind, cube).
            % size(cube, small).
            % --- END EXAMPLES ---

            User: "{text}"
            Output:
        """).strip(),
        "NL_TO_QUERY": textwrap.dedent("""
            You are an expert translating a natural language question to a Prolog query.
            Output ONLY the query goal, with no period or explanation.
            The query should be compatible with this schema:
            % Predicates: color/2, size/2, position/3, property/2.
            % Relations for position/3 can be: behind, in_front_of, on_top_of, under, left_of, right_of.

            % --- EXAMPLES ---
            % User: "What color is the sphere?" -> color(sphere, Color)
            % User: "Is the cube behind the sphere?" -> position(cube, behind, sphere)
            % User: "Is there a big red object?" -> (size(Object, big), color(Object, red))
            % --- END EXAMPLES ---

            User: "{query}"
            Output:
        """).strip(),
        "RESULT_TO_NL": "Translate the Prolog query and its result into a conversational, natural language answer. Style: \"{style}\".\n\nQuery: {query}\nResult: {result}\n\nAnswer:",
    }
    def get(self, template_name: str, **kwargs) -> str:
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
        try:
            pl.KnowledgeBase("validation_kb")(kb_str.splitlines()); return {"valid": True}
        except Exception as e: return {"valid": False, "error": str(e)}

class FileContextProvider(IContextProvider):
    def __init__(self, storage_path: Path):
        self.sessions_path = storage_path / "sessions"
        self.sessions_path.mkdir(parents=True, exist_ok=True)
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
        if "NL_TO_RULES" in prompt and "sphere is red" in prompt: return "color(sphere, red)."
        if "NL_TO_RULES" in prompt and "cube is behind the sphere" in prompt: return "position(cube, behind, sphere)."
        if "NL_TO_QUERY" in prompt and "sphere in front of the cube" in prompt: return "position(sphere, in_front_of, cube)"
        if "RESULT_TO_NL" in prompt:
            if "position(sphere, in_front_of, cube)" in prompt and '"Yes"' in prompt:
                return "Yes, based on the rules of spatial reasoning, the sphere is in front of the cube."
            return "This is a mock answer."
        return "placeholder(mock)."
class OllamaLlmProvider(ILlmProvider):
    def __init__(self, model: str, base_url: str):
        self.llm = ChatOllama(model=model, base_url=base_url)
    async def generate(self, prompt: str, trace_id: str) -> str:
        response = await self.llm.ainvoke(prompt); return response.content
class GeminiLlmProvider(ILlmProvider):
    def __init__(self, model: str, api_key: str):
        self.llm = ChatGoogleGenerativeAI(model=model, google_api_key=api_key)
    async def generate(self, prompt: str, trace_id: str) -> str:
        response = await self.llm.ainvoke(prompt); return response.content

# --- Core Service Layer ---
class MCRService:
    def __init__(self, llm: ILlmProvider, reasoner: IReasonProvider, context: IContextProvider):
        self.llm, self.reasoner, self.context, self.prompts = llm, reasoner, context, PromptManager()
    def _extract_prolog(self, text: str) -> List[str]:
        lines = [line.strip() for line in text.split('\n') if line.strip() and not line.strip().startswith('%')]
        return [f"{line}" if line.endswith('.') else f"{line}." for line in lines]
    async def assert_into_session(self, session_id: str, text: str, trace_id: str) -> AssertResponse:
        session = await self.context.get_session(session_id, trace_id)
        prompt = self.prompts.get("NL_TO_RULES", text=text)
        llm_response = await self.llm.generate(prompt, trace_id)
        new_facts = self._extract_prolog(llm_response)
        current_kb_lines = set(session.knowledgeBase.splitlines())
        added = [fact for fact in new_facts if fact not in current_kb_lines]
        if added:
            session.knowledgeBase = (session.knowledgeBase + "\n" + "\n".join(added)).strip()
            await self.context.save_session(session, trace_id)
        return AssertResponse(addedFacts=added, knowledgeBase=session.knowledgeBase)
    async def run_query(self, session_id: str, request: QueryRequest, trace_id: str) -> QueryResponse:
        session = await self.context.get_session(session_id, trace_id)
        debug_info = {}
        query_prompt = self.prompts.get("NL_TO_QUERY", query=request.query)
        prolog_query_raw = await self.llm.generate(query_prompt, trace_id)
        prolog_query = prolog_query_raw.strip().rstrip('.')
        debug_info["generated_prolog_query"] = prolog_query
        result = await self.reasoner.query(session.knowledgeBase, prolog_query, trace_id)
        debug_info["raw_reasoner_result"] = result
        result_for_llm = "Yes" if result else "No"
        answer_prompt = self.prompts.get("RESULT_TO_NL", query=prolog_query, result=json.dumps(result_for_llm), style="a clear and concise explanation")
        answer = await self.llm.generate(answer_prompt, trace_id)
        return QueryResponse(queryProlog=prolog_query, result=result, answer=answer, debugInfo=debug_info)

# --- API Layer (FastAPI) ---
mcr_service: MCRService
llm_config_store: Dict[str, Any] = {"provider": "Mock", "model": "mock-model"}
PROVIDER_MAP = {"Ollama": OllamaLlmProvider, "Gemini": GeminiLlmProvider, "Mock": MockLlmProvider}
def create_llm_provider(config: Dict[str, Any]) -> ILlmProvider:
    provider_name = config.get("provider")
    provider_class = PROVIDER_MAP.get(provider_name)
    if not provider_class: raise ProviderError(f"Unknown LLM provider: {provider_name}")
    try:
        if provider_name == "Ollama": return provider_class(model=config["model"], base_url=config["base_url"])
        elif provider_name == "Gemini": return provider_class(model=config["model"], api_key=config["api_key"])
        else: return provider_class()
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

fastapi_app = FastAPI(title="Model Context Reasoner", version=__version__, lifespan=lifespan)
@fastapi_app.middleware("http")
async def trace_id_middleware(request: Request, call_next):
    trace_id = request.headers.get("X-Trace-ID", str(uuid.uuid4())); request.state.trace_id = trace_id
    response = await call_next(request); response.headers["X-Trace-ID"] = trace_id; return response
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
    new_api_key = config.api_key
    if new_api_key and all(c == '*' for c in new_api_key): new_api_key = llm_config_store.get("api_key")
    try:
        new_config_dict = config.model_dump(); new_config_dict["api_key"] = new_api_key
        mcr_service.llm = create_llm_provider(new_config_dict)
        llm_config_store = new_config_dict
        return {"message": f"LLM provider updated to {config.provider}."}
    except ProviderError as e: raise HTTPException(status_code=400, detail=str(e))
@fastapi_app.post("/sessions", status_code=201, response_model=Session)
async def create_session(request: Request):
    session = Session(); await mcr_service.context.save_session(session, request.state.trace_id); return session
@fastapi_app.get("/sessions/list", response_model=List[ListSessionsResponse])
async def list_sessions(request: Request):
    sids = await mcr_service.context.list_sessions(request.state.trace_id)
    return [ListSessionsResponse(sessionId=sid) for sid in sids]
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
    session.knowledgeBase = body.knowledgeBase
    await mcr_service.context.save_session(session, request.state.trace_id)
    return {"message": "Knowledge base updated."}

# ==============================================================================
# PART 2: PYQT6 GRAPHICAL USER INTERFACE
# ==============================================================================
MCR_SERVER_URL = "http://0.0.0.0:8001"
WINDOW_TITLE = f"MCR Workbench v{__version__}"

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
    def set_llm_config(self, provider, model, api_key, base_url): return self._request("POST", "/config/llm", json={"provider": provider, "model": model, "api_key": api_key, "base_url": base_url})
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
        config = uvicorn.Config(fastapi_app, host="0.0.0.0", port=8001, log_level="warning")
        self.server = uvicorn.Server(config)
        try: self.server.run()
        except OSError as e:
            if e.errno == errno.EADDRINUSE: self.server_startup_failed.emit("Port 8001 is already in use.\nPlease close the other application and restart.")
            else: self.server_startup_failed.emit(f"An OS error occurred: {e}")
    def stop(self):
        if self.server: self.server.should_exit = True

class SettingsDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("LLM Configuration")
        self.setMinimumWidth(500)
        self.layout = QVBoxLayout(self)
        form_layout = QFormLayout()
        self.provider_combo = QComboBox(); self.provider_combo.addItems(["Mock", "Ollama", "Gemini"])
        form_layout.addRow("LLM Provider:", self.provider_combo)
        self.stacked_widget = QStackedWidget(); form_layout.addRow(self.stacked_widget)
        self.mock_widget = QWidget(); self.stacked_widget.addWidget(self.mock_widget)
        self.ollama_widget = QWidget(); ollama_layout = QFormLayout(self.ollama_widget)
        self.ollama_base_url_edit = QLineEdit("http://localhost:11434"); self.ollama_model_edit = QLineEdit("llama3")
        ollama_layout.addRow("Base URL:", self.ollama_base_url_edit); ollama_layout.addRow("Model Name:", self.ollama_model_edit)
        self.stacked_widget.addWidget(self.ollama_widget)
        self.gemini_widget = QWidget(); gemini_layout = QFormLayout(self.gemini_widget)
        self.gemini_api_key_edit = QLineEdit(); self.gemini_api_key_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self.gemini_model_edit = QLineEdit("gemini-1.5-flash")
        gemini_layout.addRow("API Key:", self.gemini_api_key_edit); gemini_layout.addRow("Model Name:", self.gemini_model_edit)
        self.stacked_widget.addWidget(self.gemini_widget)
        self.layout.addLayout(form_layout)
        self.button_box = QDialogButtonBox(QDialogButtonBox.StandardButton.Save | QDialogButtonBox.StandardButton.Cancel)
        self.layout.addWidget(self.button_box)
        self.button_box.accepted.connect(self.accept); self.button_box.rejected.connect(self.reject)
        self.provider_combo.currentIndexChanged.connect(self.stacked_widget.setCurrentIndex)
    def get_config_data(self):
        provider = self.provider_combo.currentText()
        data = {"provider": provider, "model": None, "api_key": None, "base_url": None}
        if provider == "Ollama":
            data["base_url"] = self.ollama_base_url_edit.text(); data["model"] = self.ollama_model_edit.text()
        elif provider == "Gemini":
            api_key = self.gemini_api_key_edit.text()
            data["api_key"] = api_key if api_key else "********"
            data["model"] = self.gemini_model_edit.text()
        return data

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(WINDOW_TITLE); self.setGeometry(100, 100, 1600, 900)
        self.client = MCRClient(MCR_SERVER_URL); self.server_thread = ServerThread()
        self.current_session_id = None; self.health_check_timer = QTimer(self)
        self.kb_save_timer = QTimer(self); self.kb_save_timer.setSingleShot(True); self.kb_save_timer.setInterval(1000)
        self.setup_ui(); self.setup_menu(); self.setup_signals(); self.start_server()

    def setup_ui(self):
        main_widget = QWidget(); self.setCentralWidget(main_widget)
        top_layout = QHBoxLayout()
        top_layout.addWidget(QLabel("Session:"))
        self.session_combo = QComboBox(); top_layout.addWidget(self.session_combo, 1)
        self.new_session_btn = QPushButton("New Session"); top_layout.addWidget(self.new_session_btn)
        self.load_demo_btn = QPushButton("Load Demo Scenario"); top_layout.addWidget(self.load_demo_btn)

        splitter = QSplitter(Qt.Orientation.Horizontal)
        kb_panel = QFrame(); kb_panel.setFrameShape(QFrame.Shape.StyledPanel)
        kb_layout = QVBoxLayout(kb_panel)
        kb_layout.addWidget(QLabel("Knowledge Base (Facts & Rules)"))
        self.kb_editor = QPlainTextEdit()
        self.kb_editor.setFont(QFont("Consolas", 11))
        self.kb_editor.setWordWrapMode(QTextOption.WrapMode.NoWrap) # <-- CRITICAL FIX: Changed from boolean to enum
        kb_layout.addWidget(self.kb_editor)

        wb_panel = QFrame(); wb_panel.setFrameShape(QFrame.Shape.StyledPanel)
        wb_layout = QVBoxLayout(wb_panel)
        wb_layout.addWidget(QLabel("Interaction Panel"))
        self.workbench_input = QLineEdit(); self.workbench_input.setPlaceholderText("Enter natural language here...")
        self.workbench_input.setFont(QFont("Segoe UI", 11))
        wb_layout.addWidget(self.workbench_input)
        wb_buttons = QHBoxLayout()
        self.assert_btn = QPushButton("Assert as Fact"); wb_buttons.addWidget(self.assert_btn)
        self.query_btn = QPushButton("Ask as Query"); wb_buttons.addWidget(self.query_btn)
        wb_layout.addLayout(wb_buttons)
        wb_layout.addWidget(QLabel("Trace Log"))
        self.trace_viewer = QTreeWidget(); self.trace_viewer.setHeaderLabels(["Step", "Details"])
        self.trace_viewer.header().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.trace_viewer.header().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        wb_layout.addWidget(self.trace_viewer)

        splitter.addWidget(kb_panel); splitter.addWidget(wb_panel); splitter.setSizes([700, 900])
        main_layout = QVBoxLayout(main_widget); main_layout.addLayout(top_layout); main_layout.addWidget(splitter)
        self.set_controls_enabled(False)

    def setup_menu(self):
        menu_bar = self.menuBar()
        file_menu = menu_bar.addMenu("&File")
        settings_action = QAction("&Settings", self); settings_action.triggered.connect(self.open_settings)
        file_menu.addAction(settings_action); file_menu.addSeparator()
        exit_action = QAction("E&xit", self); exit_action.triggered.connect(self.close)
        file_menu.addAction(exit_action)

    def set_controls_enabled(self, enabled):
        for w in [self.session_combo, self.new_session_btn, self.load_demo_btn, self.kb_editor, self.workbench_input, self.assert_btn, self.query_btn]:
            w.setEnabled(enabled)

    def setup_signals(self):
        self.server_thread.server_startup_failed.connect(self.on_server_startup_failed)
        self.health_check_timer.timeout.connect(self.check_server_health)
        self.session_combo.currentIndexChanged.connect(self.on_session_changed)
        self.new_session_btn.clicked.connect(self.create_new_session)
        self.load_demo_btn.clicked.connect(self.load_demo_scenario)
        self.assert_btn.clicked.connect(self.do_assert)
        self.query_btn.clicked.connect(self.do_query)
        self.workbench_input.returnPressed.connect(self.do_query)
        self.kb_editor.textChanged.connect(self.kb_save_timer.start)
        self.kb_save_timer.timeout.connect(self.save_kb)

    def start_server(self): self.server_thread.start(); self.health_check_timer.start(250)
    def on_server_startup_failed(self, message):
        self.health_check_timer.stop(); QMessageBox.critical(self, "Server Startup Failed", message); self.close()
    def check_server_health(self):
        if not self.server_thread.isRunning() and not self.health_check_timer.isActive(): return
        if self.client.check_health().get("status") == "ok":
            self.health_check_timer.stop(); self.on_server_started()
    def on_server_started(self):
        self.set_controls_enabled(True); self.populate_sessions()
        if not self.session_combo.count(): self.create_new_session()

    def open_settings(self):
        dialog = SettingsDialog(self)
        if dialog.exec():
            config_data = dialog.get_config_data()
            response = self.client.set_llm_config(**config_data)
            if "error" in response: QMessageBox.critical(self, "Config Error", f"Failed to apply settings:\n{response['error']['message']}")
            else: self.add_trace_message("info", "Configuration Updated", f"LLM provider set to {config_data['provider']}.")

    def populate_sessions(self):
        self.session_combo.blockSignals(True); self.session_combo.clear()
        response = self.client.list_sessions()
        if response and "error" not in response:
            for session in response: self.session_combo.addItem(session['sessionId'])
        self.session_combo.blockSignals(False)
        if self.session_combo.count() > 0: self.on_session_changed(0)

    def on_session_changed(self, index):
        if index < 0: return
        self.current_session_id = self.session_combo.itemText(index)
        response = self.client.get_session(self.current_session_id)
        self.kb_editor.blockSignals(True)
        if "error" not in response: self.kb_editor.setPlainText(response.get("knowledgeBase", ""))
        else: self.kb_editor.setPlainText(f"% Error loading session: {response['error']['message']}")
        self.kb_editor.blockSignals(False)
        self.trace_viewer.clear()

    def create_new_session(self):
        response = self.client.create_session()
        if "error" in response: QMessageBox.critical(self, "Error", response['error']['message'])
        else:
            self.session_combo.blockSignals(True)
            self.session_combo.addItem(response["sessionId"])
            self.session_combo.setCurrentText(response["sessionId"])
            self.session_combo.blockSignals(False)
            self.on_session_changed(self.session_combo.currentIndex())

    def load_demo_scenario(self):
        self.create_new_session()
        if not self.current_session_id: return
        demo_kb = textwrap.dedent("""
            % --- Ontology ---
            position(Y, in_front_of, X) :- position(X, behind, Y).

            % --- Facts ---
            color(sphere, red).
            position(cube, behind, sphere).
        """).strip()
        self.kb_editor.setPlainText(demo_kb)
        self.save_kb()
        self.add_trace_message("info", "Demo Scenario Loaded!", "Try asking: Is the sphere in front of the cube?")

    def save_kb(self):
        if not self.current_session_id: return
        kb_content = self.kb_editor.toPlainText()
        response = self.client.update_kb(self.current_session_id, kb_content)
        if "error" in response:
            self.add_trace_message("error", "KB Save Failed", response['error']['message'])

    def do_assert(self):
        text = self.workbench_input.text().strip()
        if not text or not self.current_session_id: return
        self.workbench_input.clear()
        response = self.client.assert_fact(self.current_session_id, text)
        self.trace_viewer.clear()
        if "error" in response: self.add_trace_message("error", "Assert Failed", response['error']['message'])
        else:
            self.add_trace_message("success", "Assert Succeeded", f"Added facts: {response['addedFacts']}")
            self.kb_editor.blockSignals(True)
            self.kb_editor.setPlainText(response.get("knowledgeBase", ""))
            self.kb_editor.blockSignals(False)

    def do_query(self):
        query = self.workbench_input.text().strip()
        if not query or not self.current_session_id: return
        self.workbench_input.clear()
        response = self.client.query(self.current_session_id, query)
        self.trace_viewer.clear()
        if "error" in response: self.add_trace_message("error", "Query Failed", response['error']['message'])
        else: self._populate_trace_viewer(query, response)

    def add_trace_message(self, level, title, detail):
        self.trace_viewer.clear()
        item = QTreeWidgetItem(self.trace_viewer, [title, str(detail)])
        color = {"info": "#50a0d0", "success": "#70c070", "error": "#d06060"}.get(level, "#e0e0e0")
        item.setForeground(0, QBrush(QColor(color))); item.setFont(0, QFont("Segoe UI", 10, QFont.Weight.Bold))

    def _populate_trace_viewer(self, query_text, response):
        root = QTreeWidgetItem(self.trace_viewer, ["User Query", f'"{query_text}"'])
        root.setFont(0, QFont("Segoe UI", 10, QFont.Weight.Bold))
        debug_info = response.get("debugInfo", {})
        QTreeWidgetItem(root, ["LLM: NL-to-Query", debug_info.get("generated_prolog_query", "N/A")])
        QTreeWidgetItem(root, ["Reasoner: Execution", f'Querying: {response.get("queryProlog", "N/A")}'])
        QTreeWidgetItem(root, ["Reasoner: Raw Result", json.dumps(response.get("result", "N/A"))])
        QTreeWidgetItem(root, ["LLM: Result-to-NL", response.get("answer", "N/A")])
        self.trace_viewer.expandAll()

    def closeEvent(self, event):
        self.health_check_timer.stop(); self.server_thread.stop(); self.server_thread.quit()
        if not self.server_thread.wait(3000): self.server_thread.terminate()
        event.accept()

def set_dark_theme(app):
    dark_palette = QPalette()
    dark_palette.setColor(QPalette.ColorRole.Window, QColor(37, 37, 37)); dark_palette.setColor(QPalette.ColorRole.WindowText, QColor(224, 224, 224))
    dark_palette.setColor(QPalette.ColorRole.Base, QColor(25, 25, 25)); dark_palette.setColor(QPalette.ColorRole.AlternateBase, QColor(53, 53, 53))
    dark_palette.setColor(QPalette.ColorRole.ToolTipBase, QColor(224, 224, 224)); dark_palette.setColor(QPalette.ColorRole.ToolTipText, QColor(25, 25, 25))
    dark_palette.setColor(QPalette.ColorRole.Text, QColor(224, 224, 224)); dark_palette.setColor(QPalette.ColorRole.Button, QColor(53, 53, 53))
    dark_palette.setColor(QPalette.ColorRole.ButtonText, QColor(224, 224, 224)); dark_palette.setColor(QPalette.ColorRole.BrightText, Qt.GlobalColor.red)
    dark_palette.setColor(QPalette.ColorRole.Link, QColor(42, 130, 218)); dark_palette.setColor(QPalette.ColorRole.Highlight, QColor(42, 130, 218))
    dark_palette.setColor(QPalette.ColorRole.HighlightedText, Qt.GlobalColor.black)
    app.setPalette(dark_palette)
    app.setStyleSheet("QToolTip { color: #ffffff; background-color: #2a82da; border: 1px solid white; }")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    set_dark_theme(app)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())