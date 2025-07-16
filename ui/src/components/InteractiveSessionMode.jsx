import React, { useState } from 'react';
import Split from 'react-split';
import KnowledgeBase from './KnowledgeBase';
import REPL from './REPL';
import TauReplPane from './TauReplPane';
import './InteractiveSessionMode.css';

const InteractiveSessionMode = ({
	sessionId,
	setSessionId,
	activeStrategy,
	setActiveStrategy,
	currentKb,
	setCurrentKb,
	connectSession,
	disconnectSession,
	isMcrSessionActive,
	isWsServiceConnected,
	addMessageToHistory,
	chatHistory,
	setChatHistory,
	fetchCurrentKb,
}) => {
	const [activeTab, setActiveTab] = useState('kb');

	return (
		<Split
			className="split"
			sizes={[50, 50]}
			minSize={200}
			gutterSize={10}
			direction="horizontal"
		>
			<div className="repl-container">
				<REPL
					sessionId={sessionId}
					setSessionId={setSessionId}
					activeStrategy={activeStrategy}
					setActiveStrategy={setActiveStrategy}
					connectSession={connectSession}
					disconnectSession={disconnectSession}
					isMcrSessionActive={isMcrSessionActive}
					isWsServiceConnected={isWsServiceConnected}
					addMessageToHistory={addMessageToHistory}
					chatHistory={chatHistory}
					fetchCurrentKb={fetchCurrentKb}
					setChatHistory={setChatHistory}
				/>
			</div>
			<div className="kb-container">
				<div className="tab-buttons">
					<button
						onClick={() => setActiveTab('kb')}
						className={activeTab === 'kb' ? 'active' : ''}
					>
						Knowledge Base
					</button>
					<button
						onClick={() => setActiveTab('tau')}
						className={activeTab === 'tau' ? 'active' : ''}
					>
						Tau REPL
					</button>
				</div>
				<div className="tab-content">
					{activeTab === 'kb' && (
						<KnowledgeBase
							sessionId={sessionId}
							currentKb={currentKb}
							addMessageToHistory={addMessageToHistory}
						/>
					)}
					{activeTab === 'tau' && <TauReplPane sessionId={sessionId} />}
				</div>
			</div>
		</Split>
	);
};

export default InteractiveSessionMode;
