import { useMemo, useState } from 'react'
import { usePlantSearch } from '@ctip/hooks'
import {
  CONSERVATION_STATUSES,
  DEMO_PLANTS,
  PERSONAS,
} from '@ctip/types'
import {
  EmptyState,
  MetricCard,
  ObservationForm,
  PlantCard,
  PlantDetailsFrame,
  SearchBar,
  SectionCard,
  SecurityPlaceholder,
  StatusFilter,
  SyncStatus,
} from '@ctip/ui'
import './App.css'

const NAVIGATION = {
  botanist: [
    { id: 'plants', label: 'Plant library', icon: '◈' },
    { id: 'field', label: 'Field notes', icon: '＋' },
  ],
  'conservation-officer': [
    { id: 'plants', label: 'Plant library', icon: '◈' },
    { id: 'reviews', label: 'Review queue', icon: '✓' },
    { id: 'reports', label: 'Reports', icon: '▤' },
  ],
  admin: [
    { id: 'plants', label: 'Plant library', icon: '◈' },
    { id: 'monitoring', label: 'Monitoring', icon: '⌁' },
    { id: 'reports', label: 'Reports', icon: '▤' },
    { id: 'settings', label: 'Settings', icon: '⚙' },
  ],
  visitor: [{ id: 'plants', label: 'Explore plants', icon: '◈' }],
}

const REVIEW_ITEMS = [
  { name: 'Understory fern', detail: 'Species identification pending · Field observation' },
  { name: 'Forest canopy tree', detail: 'Shorea sp. · Taxonomic record needs review' },
]

function App() {
  const [persona, setPersona] = useState('conservation-officer')
  const [activeView, setActiveView] = useState('plants')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All statuses')
  const [selectedPlantId, setSelectedPlantId] = useState(DEMO_PLANTS[0].id)
  const [observations, setObservations] = useState([])
  const [notice, setNotice] = useState('')

  const filteredPlants = usePlantSearch(DEMO_PLANTS, query, status)
  const selectedPlant = useMemo(
    () => filteredPlants.find((plant) => plant.id === selectedPlantId) ?? filteredPlants[0],
    [filteredPlants, selectedPlantId],
  )
  const navigation = NAVIGATION[persona]
  const activeLabel = navigation.find((item) => item.id === activeView)?.label ?? navigation[0].label

  function changePersona(event) {
    const nextPersona = event.target.value
    setPersona(nextPersona)
    setActiveView(NAVIGATION[nextPersona][0].id)
  }

  function saveObservation(observation) {
    setObservations((current) => [observation, ...current])
    setNotice('Field note saved in this preview. Connect the API and offline store to persist it.')
  }

  function renderView() {
    if (activeView === 'field') {
      return (
        <div className="workspace-grid workspace-grid--form">
          <SectionCard eyebrow="Field collection" title="New observation">
            <ObservationForm onSubmit={saveObservation} />
            {notice && <p className="app-inline-notice" role="status">{notice}</p>}
          </SectionCard>
          <SectionCard eyebrow="This session only" title="Draft observations">
            {observations.length ? (
              <div className="app-observation-list">
                {observations.map((item, index) => (
                  <article className="app-observation" key={`${item.recordedAt}-${index}`}>
                    <strong>{item.plantName}</strong>
                    <em>{item.scientificName || 'Identification pending'}</em>
                    <span>{item.notes || 'No notes added'}</span>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No field notes yet" detail="New observations appear here while this preview is open." />
            )}
            <div className="app-adapter-note">QR scanning, camera, GPS capture, and offline persistence need mobile/API adapters.</div>
          </SectionCard>
        </div>
      )
    }

    if (activeView === 'reviews') {
      return (
        <SectionCard eyebrow="Conservation workflow" title="Observations awaiting review">
          <div className="app-review-list">
            {REVIEW_ITEMS.map((item) => (
              <article className="app-review-item" key={item.name}>
                <div><strong>{item.name}</strong><span>{item.detail}</span></div>
                <button type="button" className="app-secondary-button" onClick={() => setNotice('Review actions require authenticated API permissions.')}>Open review</button>
              </article>
            ))}
          </div>
          {notice && <p className="app-inline-notice" role="status">{notice}</p>}
          <p className="app-adapter-note">Approval and rejection must be authorized and recorded by the backend.</p>
        </SectionCard>
      )
    }

    if (activeView === 'monitoring') {
      return (
        <>
          <div className="app-metrics">
            <MetricCard label="Connected sensors" value="—" detail="Live device data not connected" />
            <MetricCard label="Open alerts" value="—" detail="Alert service not connected" />
            <MetricCard label="Latest reading" value="—" detail="Environmental stream not connected" />
          </div>
          <SectionCard eyebrow="IoT protection" title="Sensor monitoring">
            <EmptyState title="Connect a sensor feed" detail="GPS, environmental readings, and threat alerts will appear here when the API is integrated." />
          </SectionCard>
        </>
      )
    }

    if (activeView === 'reports') {
      return (
        <SectionCard eyebrow="Conservation insights" title="Biodiversity reports">
          <EmptyState title="Reports are not connected" detail="Report filters and export actions need the reporting API before they can show real data." />
        </SectionCard>
      )
    }

    if (activeView === 'settings') {
      return (
        <SectionCard eyebrow="Workspace" title="Administration">
          <EmptyState title="Admin services are not connected" detail="Account management, audit logs, and system settings are backend-owned integrations." />
        </SectionCard>
      )
    }

    return (
      <div className="workspace-grid">
        <SectionCard
          className="app-directory"
          eyebrow={filteredPlants.length === 1 ? '1 record' : `${filteredPlants.length} records`}
          title="Plant directory"
        >
          <div className="app-directory-tools">
            <SearchBar value={query} onChange={setQuery} placeholder="Name, family, or habitat" />
            <StatusFilter options={CONSERVATION_STATUSES} value={status} onChange={setStatus} />
          </div>
          <div className="app-plant-list">
            {filteredPlants.length ? filteredPlants.map((plant) => (
              <PlantCard
                key={plant.id}
                plant={plant}
                selected={plant.id === selectedPlant?.id}
                onPress={() => setSelectedPlantId(plant.id)}
              />
            )) : (
              <EmptyState title="No plants found" detail="Try another name or clear the conservation status filter." />
            )}
          </div>
        </SectionCard>

        {selectedPlant ? (
          <div className="app-detail-column">
            <div className="app-detail-heading">
              <div><p className="app-eyebrow">Species profile</p><h2>Plant details</h2></div>
              <button
                className="app-secondary-button"
                onClick={() => setNotice('QR scanning and plant-label generation will be connected through the platform adapters.')}
                type="button"
              >
                QR tools
              </button>
            </div>
            <PlantDetailsFrame plant={selectedPlant} />
            {notice && <p className="app-inline-notice" role="status">{notice}</p>}
            <div className="app-data-caption">Illustrative sample data · verify species and conservation details before publication</div>
          </div>
        ) : (
          <SectionCard title="Plant details">
            <EmptyState title="Choose a plant" detail="Select a record to view its profile." />
          </SectionCard>
        )}
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <a className="app-brand" href="#home" onClick={(event) => event.preventDefault()}>
          <span className="app-brand-mark">F</span>
          <span><strong>Forest</strong><small>FIELDNOTES</small></span>
        </a>
        <div className="app-workspace-label">WORKSPACE</div>
        <nav className="app-navigation" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              aria-current={activeView === item.id ? 'page' : undefined}
              className={`app-nav-item${activeView === item.id ? ' is-active' : ''}`}
              key={item.id}
              onClick={() => { setActiveView(item.id); setNotice('') }}
              type="button"
            >
              <span aria-hidden="true">{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="app-sidebar-bottom">
          <SyncStatus status="Preview mode" detail="Backend sync not connected" />
          <SecurityPlaceholder />
        </div>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <div className="app-breadcrumb">Niah National Park <span>/</span> {activeLabel}</div>
          <label className="app-persona">
            <span>Preview persona</span>
            <select value={persona} onChange={changePersona}>
              {PERSONAS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        </header>
        <section className="app-page">
          <div className="app-page-heading">
            <div>
              <p className="app-eyebrow">SMART GROUND-TRUTHING · NIAH NATIONAL PARK</p>
              <h1>{activeLabel}</h1>
              <p className="app-page-description">
                {activeView === 'plants'
                  ? 'Explore plant records, taxonomy, habitat, and conservation information.'
                  : 'A shared workspace preview for biodiversity field operations.'}
              </p>
            </div>
            {activeView === 'plants' && persona === 'botanist' && (
              <button className="app-primary-button" onClick={() => setActiveView('field')} type="button">
                <span aria-hidden="true">＋</span> New field note
              </button>
            )}
          </div>
          <div className="app-content">{renderView()}</div>
        </section>
      </main>
    </div>
  )
}

export default App
