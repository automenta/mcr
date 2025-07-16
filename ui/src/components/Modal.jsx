import React from 'react';

const Modal = ({ isOpen, onClose, title, children }) => {
	if (!isOpen) return null;

	return (
		<div
			style={{
				position: 'fixed',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				backgroundColor: 'rgba(0,0,0,0.6)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				zIndex: 1000,
			}}
		>
			<div
				style={{
					backgroundColor: '#161b22',
					padding: '20px',
					borderRadius: '8px',
					minWidth: '400px',
					maxWidth: '80vw',
					maxHeight: '80vh',
					border: '1px solid #30363d',
					display: 'flex',
					flexDirection: 'column',
				}}
			>
				<div
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
						marginBottom: '15px',
					}}
				>
					<h3 style={{ margin: 0, color: '#58a6ff' }}>{title}</h3>
					<button
						onClick={onClose}
						style={{
							background: 'none',
							border: 'none',
							color: '#c9d1d9',
							fontSize: '1.5em',
							cursor: 'pointer',
						}}
					>
						&times;
					</button>
				</div>
				<div style={{ overflowY: 'auto', flexGrow: 1 }}>{children}</div>
			</div>
		</div>
	);
};

export default Modal;
