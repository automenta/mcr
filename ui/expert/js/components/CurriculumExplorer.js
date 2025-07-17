import WebSocketService from '../WebSocketService.js';

class CurriculumExplorer extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    margin-top: 1rem;
                }
                h2 {
                    margin-top: 0;
                }
                textarea {
                    width: 100%;
                    height: 150px;
                    margin-top: 1rem;
                }
                .controls {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1rem;
                }
            </style>
            <div>
                <h2>Curriculum Explorer</h2>
                <div class="controls">
                    <select id="curriculum-select"></select>
                    <div>
                        <button id="create-curriculum">Create</button>
                        <button id="delete-curriculum">Delete</button>
                    </div>
                </div>
                <textarea id="curriculum-display" placeholder="Select a curriculum to view its content..."></textarea>
                <button id="update-curriculum">Update Curriculum</button>
            </div>
        `;

		this.select = this.shadowRoot.querySelector('#curriculum-select');
		this.createButton = this.shadowRoot.querySelector('#create-curriculum');
		this.deleteButton = this.shadowRoot.querySelector('#delete-curriculum');
		this.display = this.shadowRoot.querySelector('#curriculum-display');
		this.updateButton = this.shadowRoot.querySelector('#update-curriculum');

		this.select.addEventListener(
			'change',
			this.onCurriculumSelected.bind(this)
		);
		this.createButton.addEventListener(
			'click',
			this.createCurriculum.bind(this)
		);
		this.deleteButton.addEventListener(
			'click',
			this.deleteCurriculum.bind(this)
		);
		this.updateButton.addEventListener(
			'click',
			this.updateCurriculum.bind(this)
		);
	}

	connectedCallback() {
		WebSocketService.connect().then(() => {
			this.listCurricula();
		});
	}

	listCurricula() {
		// This is a placeholder for the actual API call
		const curricula = [
			{ id: 'evalCase1', name: 'Evaluation Case 1' },
			{ id: 'evalCase2', name: 'Evaluation Case 2' },
		];
		this.updateCurriculumList(curricula);
	}

	updateCurriculumList(curricula) {
		this.select.innerHTML = '<option value="">Select a curriculum</option>';
		curricula.forEach(curriculum => {
			const option = document.createElement('option');
			option.value = curriculum.id;
			option.textContent = curriculum.name;
			this.select.appendChild(option);
		});
	}

	onCurriculumSelected() {
		const curriculumId = this.select.value;
		if (!curriculumId) {
			this.display.value = '';
			return;
		}
		// This is a placeholder for the actual API call
		this.display.value = `Content of ${curriculumId}`;
	}

	createCurriculum() {
		const curriculumName = prompt('Enter a name for the new curriculum:');
		if (!curriculumName) return;
		// This is a placeholder for the actual API call
		alert(`Curriculum "${curriculumName}" created.`);
		this.listCurricula();
	}

	deleteCurriculum() {
		const curriculumId = this.select.value;
		if (!curriculumId) return;

		if (
			confirm(
				`Are you sure you want to delete the curriculum "${curriculumId}"?`
			)
		) {
			// This is a placeholder for the actual API call
			alert(`Curriculum "${curriculumId}" deleted.`);
			this.listCurricula();
			this.display.value = '';
		}
	}

	updateCurriculum() {
		const curriculumId = this.select.value;
		if (!curriculumId) return;

		const content = this.display.value;
		// This is a placeholder for the actual API call
		alert(`Curriculum "${curriculumId}" updated.`);
	}
}

customElements.define('curriculum-explorer', CurriculumExplorer);
