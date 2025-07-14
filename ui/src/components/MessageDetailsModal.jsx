import React from 'react';
import Modal from './Modal';
import './MessageDetailsModal.css';

const MessageDetailsModal = ({ message, onClose }) => {
  return (
    <Modal isOpen={!!message} onClose={onClose} title="Message Details">
      {message && (
        <div className="message-details-modal">
          <div className="details-content">
            <p><strong>Type:</strong> {message.type}</p>
            <p><strong>Text:</strong> {message.text}</p>
            {/* Add more details as needed */}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default MessageDetailsModal;
