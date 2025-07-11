import React, { useState, useEffect } from 'react';
import apiService from '../../apiService'; // Adjusted path

const CurriculumExplorer = () => {
  const [curriculaList, setCurriculaList] = useState([]);
  const [selectedCurriculum, setSelectedCurriculum] = useState(null); // Stores { id, name, cases: [] }
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [error, setError] = useState(null);

  const fetchCurriculaList = async () => {
    setIsLoadingList(true);
    setError(null);
    try {
      const response = await apiService.invokeTool('analysis.list_eval_curricula');
      if (response.success) {
        setCurriculaList(response.data || []);
      } else {
        setError(response.message || 'Failed to fetch curricula list.');
        setCurriculaList([]);
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred while fetching list.');
      setCurriculaList([]);
    }
    setIsLoadingList(false);
  };

  const fetchCurriculumDetails = async (curriculumId) => {
    if (!curriculumId) return;
    setIsLoadingDetails(true);
    setError(null); // Clear previous detail errors
    setSelectedCurriculum(null); // Clear previous details
    try {
      const response = await apiService.invokeTool('analysis.get_curriculum_details', { curriculumId });
      if (response.success) {
        setSelectedCurriculum(response.data); // data should be { id, name, cases: [] }
      } else {
        setError(response.message || `Failed to fetch details for ${curriculumId}.`);
      }
    } catch (err) {
      setError(err.message || `An unexpected error occurred while fetching details for ${curriculumId}.`);
    }
    setIsLoadingDetails(false);
  };

  useEffect(() => {
    fetchCurriculaList(); // Fetch list on component mount
  }, []);

  return (
    <div>
      <h4>🎓 Curriculum Explorer</h4>
      {isLoadingList && <p>⏳ Loading curricula list...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      <div style={{ display: 'flex', maxHeight: '80vh' }}>
        <div style={{ width: '30%', borderRight: '1px solid #ccc', paddingRight: '10px', overflowY: 'auto' }}>
          <h5>📚 Available Curricula</h5>
          <button onClick={fetchCurriculaList} disabled={isLoadingList}>🔄 Refresh List</button>
          {curriculaList.length > 0 ? (
            <ul style={{ listStyleType: 'none', paddingLeft: 0 }}>
              {curriculaList.map(cur => (
                <li key={cur.id} style={{ fontWeight: selectedCurriculum?.id === cur.id ? 'bold' : 'normal', marginBottom: '5px' }}>
                  <button
                    onClick={() => fetchCurriculumDetails(cur.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '5px', // Keep padding for click area
                      textAlign: 'left',
                      cursor: 'pointer',
                      width: '100%', // Make button take full width of li
                      color: 'inherit', // Inherit text color
                      font: 'inherit' // Inherit font style
                    }}
                  >
                    {cur.name} ({cur.caseCount} cases)
                    <br />
                    <small style={{color: '#777'}}>{cur.path}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            !isLoadingList && <p>🤷 No curricula files found.</p>
          )}
        </div>

        <div style={{ width: '70%', paddingLeft: '10px', overflowY: 'auto' }}>
          {isLoadingDetails && <p>⏳ Loading curriculum details...</p>}
          {selectedCurriculum ? (
            <div>
              <h5>🧪 Cases from: {selectedCurriculum.name}</h5>
              {selectedCurriculum.cases && selectedCurriculum.cases.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Description</th>
                      <th>Input Type</th>
                      <th>NL Input</th>
                      <th>Expected Prolog</th>
                      <th>Expected Answer</th>
                      <th>Tags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCurriculum.cases.map((c, index) => (
                      <tr key={c.id || index}>
                        <td>{c.id}</td>
                        <td>{c.description}</td>
                        <td>{c.inputType}</td>
                        <td><pre>{c.naturalLanguageInput}</pre></td>
                        <td><pre>{Array.isArray(c.expectedProlog) ? c.expectedProlog.join('\n') : c.expectedProlog}</pre></td>
                        <td>{c.expectedAnswer || 'N/A'}</td>
                        <td>{c.tags?.join(', ') || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p>🤷 No cases found in this curriculum file, or file is empty/invalid.</p>}
            </div>
          ) : (
            !isLoadingDetails && <p>👈 Select a curriculum file from the list to view its cases.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CurriculumExplorer;
