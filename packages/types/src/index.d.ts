export type ConservationStatus =
  | 'Least concern'
  | 'Near threatened'
  | 'Vulnerable'
  | 'Endangered'
  | 'Critically endangered'
  | 'Not assessed'

export type PersonaRole =
  | 'botanist'
  | 'conservation-officer'
  | 'admin'
  | 'visitor'

export interface PlantLocation {
  latitude: number
  longitude: number
}

export interface PlantRecord {
  id: string
  commonName: string
  scientificName: string
  family: string
  conservationStatus: ConservationStatus
  habitat: string
  description: string
  location: PlantLocation | null
  photographs: string[]
}

export interface PlantObservation {
  plantName: string
  scientificName: string
  notes: string
  recordedAt: string
  location: PlantLocation | null
}

export const CONSERVATION_STATUSES: readonly (ConservationStatus | 'All statuses')[]
export const DEMO_PLANTS: readonly PlantRecord[]
export const PERSONAS: readonly { id: PersonaRole; label: string }[]
export const ROLES: Readonly<{
  BOTANIST: 'botanist'
  CONSERVATION_OFFICER: 'conservation-officer'
  ADMIN: 'admin'
  VISITOR: 'visitor'
}>
export const ACCESS_CONTROL_STATUS: 'backend-integration-required'
