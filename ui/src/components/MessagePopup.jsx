import React from 'react';
import './MessagePopup.css';

const MessagePopup = ({ message, onClose }) => {
  if (!message) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Message Details</h3>
          <button onClick={onClose} className="close-button">&times;</button>
        </div>
        <div className="modal-body">
          <pre>{JSON.stringify(message, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
};

export default MessagePopup;
