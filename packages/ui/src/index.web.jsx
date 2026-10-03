import './styles.css'

export function StatusBadge({ children }) {
  return <span className="ui-status-badge">{children}</span>
}

export function PlantCard({ plant, onPress, selected = false }) {
  return (
    <button
      type="button"
      className={`ui-plant-card${selected ? ' is-selected' : ''}`}
      onClick={onPress}
    >
      <span className="ui-plant-card__icon" aria-hidden="true">✳</span>
      <span className="ui-plant-card__content">
        <strong>{plant.commonName}</strong>
        <em>{plant.scientificName}</em>
        <span>{plant.family}</span>
      </span>
      <StatusBadge>{plant.conservationStatus}</StatusBadge>
    </button>
  )
}

export function PlantDetailsFrame({ plant }) {
  return (
    <article className="ui-detail-frame">
      <div className="ui-detail-frame__visual">
        <img
          src="https://www.thespruce.com/thmb/9bRoVgugsqiKmtJB0BI-hyIpiVs=/750x0/filters:no_upscale():max_bytes(150000):strip_icc()/pitcher-plant-2538a0de05424f2488792e5f51b1f538.jpg"
          alt={plant.commonName}
          className="ui-detail-frame__image"
        />
      </div>
      <div className="ui-detail-frame__body">
        <p className="ui-eyebrow">{plant.family}</p>
        <h2>{plant.commonName}</h2>
        <p className="ui-scientific-name">{plant.scientificName}</p>
        <StatusBadge>{plant.conservationStatus}</StatusBadge>
        <p className="ui-detail-frame__description">{plant.description}</p>
        <dl className="ui-plant-facts">
          <div><dt>Habitat</dt><dd>{plant.habitat}</dd></div>
          <div>
            <dt>Recorded location</dt>
            <dd>
              {plant.location
                ? `${plant.location.latitude}, ${plant.location.longitude}`
                : 'No coordinates attached'}
            </dd>
          </div>
          <div><dt>Photographs</dt><dd>{plant.photographs.length}</dd></div>
        </dl>
      </div>
    </article>
  )
}

export function SearchBar({ value, onChange, placeholder = 'Search plants' }) {
  return (
    <label className="ui-search">
      <span aria-hidden="true">⌕</span>
      <span className="ui-visually-hidden">Search plants</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

export function StatusFilter({ options, value, onChange }) {
  return (
    <label className="ui-filter">
      <span>Status</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  )
}

export function SyncStatus({ status = 'Offline-ready', detail = 'Changes sync when a connection is available' }) {
  return (
    <div className="ui-sync-status" role="status">
      <span className="ui-sync-status__dot" />
      <span><strong>{status}</strong><small>{detail}</small></span>
    </div>
  )
}

export function SecurityPlaceholder() {
  return (
    <aside className="ui-security-notice" role="note">
      <strong>Backend security integration pending</strong>
      <span>Persona selection is a UI preview only. Authentication, server-enforced role permissions, encryption, and key management must be implemented by the backend team.</span>
    </aside>
  )
}

export function SectionCard({ title, eyebrow, action, children, className = '' }) {
  return (
    <section className={`ui-section-card ${className}`}>
      {(title || eyebrow || action) && (
        <header className="ui-section-card__header">
          <div>
            {eyebrow && <p className="ui-eyebrow">{eyebrow}</p>}
            {title && <h2>{title}</h2>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function EmptyState({ title, detail }) {
  return (
    <div className="ui-empty-state">
      <span aria-hidden="true">⌕</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  )
}

export function MetricCard({ label, value, detail }) {
  return (
    <article className="ui-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  )
}

export function ObservationForm({ onSubmit, submitLabel = 'Save field note' }) {
  function handleSubmit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    onSubmit({
      plantName: String(form.get('plantName')).trim(),
      scientificName: String(form.get('scientificName')).trim(),
      notes: String(form.get('notes')).trim(),
      recordedAt: new Date().toISOString(),
      location: null,
    })
    event.currentTarget.reset()
  }

  return (
    <form className="ui-observation-form" onSubmit={handleSubmit}>
      <label>Common or field name<input name="plantName" required maxLength={120} /></label>
      <label>Scientific name (if known)<input name="scientificName" maxLength={160} /></label>
      <label>Observation notes<textarea name="notes" rows="4" maxLength={2000} /></label>
      <p className="ui-form-hint">Camera, QR scanning, and GPS capture connect through mobile device adapters.</p>
      <button className="ui-primary-button" type="submit">{submitLabel}</button>
    </form>
  )
}
