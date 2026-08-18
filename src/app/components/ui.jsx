/**
 * The shared pieces, mirroring exam-portal/src/components.
 *
 * Same names and same props as the React Native versions (AppButton,
 * InputField, AppModal) so a change made on one app reads the same on the
 * other. StyleSheet objects become class names; the visual result is the same.
 */

export function AppButton({ title, onClick, loading, variant = 'primary', disabled, className = '', type = 'button' }) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${className}`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
      {loading ? 'Please wait…' : title}
    </button>
  );
}

export function InputField({ icon, value, onChange, placeholder, type = 'text', autoFocus, autoComplete, onKeyDown }) {
  return (
    <label className="field">
      {icon ? <span className="field-icon">{icon}</span> : null}
      <input
        className="field-input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        onKeyDown={onKeyDown}
        spellCheck={false}
      />
    </label>
  );
}

export function AppModal({
  visible,
  icon = 'info',
  title,
  text,
  showCancelButton = true,
  confirmButtonText = 'Confirm',
  cancelButtonText = 'Cancel',
  onConfirm,
  onCancel,
  onClose,
}) {
  if (!visible) return null;

  const glyph = { info: 'i', warning: '!', success: '✓', danger: '✕' }[icon] || 'i';

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <span className={`modal-icon modal-icon-${icon}`}>{glyph}</span>
        <h3 className="modal-title">{title}</h3>
        {text ? <p className="modal-text">{text}</p> : null}
        <div className="modal-actions">
          {showCancelButton ? (
            <AppButton title={cancelButtonText} variant="ghost" onClick={onCancel || onClose} />
          ) : null}
          <AppButton title={confirmButtonText} onClick={onConfirm} />
        </div>
      </div>
    </div>
  );
}

/** The small stat tiles the dashboard uses. */
export function StatTile({ value, label, tone }) {
  return (
    <div className={`stat-tile ${tone ? `stat-tile-${tone}` : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function UserIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  );
}

export function KeyIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9M17 12v4M20 12v3" />
    </svg>
  );
}
