import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import apiService from './apiService';

// Establish WebSocket connection when the application starts
apiService.connect()
	.then(() => {
		console.log('WebSocket connected successfully.');
		createRoot(document.getElementById('root')).render(
			<StrictMode>
				<App />
			</StrictMode>
		);
	})
	.catch(error => {
		console.error('Failed to connect to WebSocket:', error);
		// Optionally render an error message to the user
		createRoot(document.getElementById('root')).render(
			<StrictMode>
				<div>Error: Could not connect to the backend. Please ensure the server is running.</div>
			</StrictMode>
		);
	});
