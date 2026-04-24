import './StatusModal.css'

export default function StatusModal({ visible, type, message, onClose }) {
  if (!visible) return null

  const isSuccess = type === 'success'

  return (
    <div className="status-modal-overlay">
      <div className="status-modal">
        <div className={`status-modal-icon ${type}`}>
          {isSuccess ? '✓' : '!'}
        </div>
        <h3>{isSuccess ? 'Completed!' : 'Error'}</h3>
        <p>{message}</p>
        <button className="status-modal-btn" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  )
}
