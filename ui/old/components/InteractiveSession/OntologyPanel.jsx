// ui/src/components/InteractiveSession/OntologyPanel.jsx
import React, { useState, useEffect, useCallback } from 'react'; // Added useCallback
import apiService from '../../apiService';
import Modal from '../Modal';
import PrologCodeViewer from '../PrologCodeViewer';

const OntologyPanel = ({
	sessionId,
	isMcrSessionActive,
	isWsServiceConnected,
	addMessageToHistory,
	// listOntologiesFunc, // This will be triggered by useEffect based on session status
	// initialOntologies // If we want to pass them down initially
}) => {
	const [ontologies, setOntologies] = useState([]);
	const [isOntologyModalOpen, setIsOntologyModalOpen] = useState(false);
	const [selectedOntologyContent, setSelectedOntologyContent] = useState({
		name: '',
		rules: '',
	});

	const listOntologies = useCallback(async () => {
		if (!isMcrSessionActive || !isWsServiceConnected) {
			setOntologies([]);
			return;
		}
		try {
			const response = await apiService.invokeTool('ontology.list', {
				includeRules: false,
			});
			if (response.success) {
				setOntologies(response.data || []);
			} else {
				addMessageToHistory({
					type: 'system',
					text: `❌ Error listing ontologies: ${response.message}`,
				});
				setOntologies([]);
			}
		} catch (error) {
			addMessageToHistory({
				type: 'system',
				text: `❌ Error: ${error.message || 'Failed to list ontologies'}`,
			});
			setOntologies([]);
		}
	}, [
		isMcrSessionActive,
		isWsServiceConnected,
		addMessageToHistory,
		setOntologies,
	]);

	useEffect(() => {
		if (isMcrSessionActive && isWsServiceConnected) {
			// Condition also in listOntologies
			listOntologies();
		} else {
			setOntologies([]);
		}
	}, [isMcrSessionActive, isWsServiceConnected, sessionId, listOntologies]); // Added listOntologies

	const viewOntology = async ontologyName => {
		if (!isMcrSessionActive || !isWsServiceConnected) {
			addMessageToHistory({
				type: 'system',
				text: '⚠️ Session not active. Cannot view ontology.',
			});
			return;
		}
		try {
			const response = await apiService.invokeTool('ontology.get', {
				name: ontologyName,
				includeRules: true,
			});
			if (response.success && response.data) {
				setSelectedOntologyContent({
					name: response.data.name,
					rules: response.data.rules || '// No rules defined.',
				});
				setIsOntologyModalOpen(true);
			} else {
				addMessageToHistory({
					type: 'system',
					text: `❌ Error fetching ontology '${ontologyName}': ${response.message}`,
				});
			}
		} catch (error) {
			addMessageToHistory({
				type: 'system',
				text: `❌ Error: ${error.message || `Failed to fetch ontology ${ontologyName}`}`,
			});
		}
	};

	const loadOntologyToSession = async ontologyName => {
		if (!isMcrSessionActive || !sessionId || !isWsServiceConnected) {
			addMessageToHistory({
				type: 'system',
				text: '⚠️ Session not active. Cannot load ontology.',
			});
			return;
		}
		addMessageToHistory({
			type: 'system',
			text: `➕ Loading ontology '${ontologyName}' to session...`,
		});
		try {
			const ontResponse = await apiService.invokeTool('ontology.get', {
				name: ontologyName,
				includeRules: true,
			});
			if (ontResponse.success && ontResponse.data?.rules) {
				const assertResponse = await apiService.invokeTool(
					'session.assert_rules',
					{ sessionId, rules: ontResponse.data.rules }
				);
				if (assertResponse.success) {
					addMessageToHistory({
						type: 'system',
						text: `✅ Ontology '${ontologyName}' rules asserted successfully. KB will update.`,
					});
					// KB update is handled by global kb_updated message, no direct setCurrentKb here
				} else {
					addMessageToHistory({
						type: 'system',
						text: `❌ Error asserting ontology '${ontologyName}': ${assertResponse.message || 'Unknown error'}`,
					});
				}
			} else {
				addMessageToHistory({
					type: 'system',
					text: `❌ Error getting ontology rules for '${ontologyName}': ${ontResponse.message}`,
				});
			}
		} catch (error) {
			addMessageToHistory({
				type: 'system',
				text: `❌ Error: ${error.message || 'Failed to load ontology'}`,
			});
		}
	};

	return (
		<div>
			<h4>📚 Ontologies</h4>
			<button
				onClick={listOntologies}
				disabled={!isMcrSessionActive || !isWsServiceConnected}
				title="Refresh Ontology List"
			>
				🔄 List Ontologies
			</button>
			{ontologies.length === 0 && isMcrSessionActive && (
				<p className="text-muted" style={{ marginTop: '5px' }}>
					🤷 No ontologies found.
				</p>
			)}
			<ul>
				{ontologies.map(ont => (
					<li
						key={ont.id || ont.name}
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
						}}
					>
						<span>{ont.name}</span>
						<div>
							<button
								onClick={() => viewOntology(ont.name)}
								disabled={!isMcrSessionActive || !isWsServiceConnected}
								title="View Ontology Rules"
							>
								👁️ View
							</button>
							<button
								onClick={() => loadOntologyToSession(ont.name)}
								disabled={!isMcrSessionActive || !isWsServiceConnected}
								title="Load Ontology into Session"
								style={{ marginLeft: '5px' }}
							>
								➕ Load
							</button>
						</div>
					</li>
				))}
			</ul>

			<Modal
				isOpen={isOntologyModalOpen}
				onClose={() => setIsOntologyModalOpen(false)}
				title={`📚 Ontology: ${selectedOntologyContent.name}`}
			>
				<PrologCodeViewer
					code={selectedOntologyContent.rules}
					title={selectedOntologyContent.name}
					addMessageToHistory={addMessageToHistory}
				/>
			</Modal>
		</div>
	);
};

export default OntologyPanel;
