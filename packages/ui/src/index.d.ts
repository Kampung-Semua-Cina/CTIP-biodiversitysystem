import type { ReactElement, ReactNode } from 'react'
import type { PlantObservation, PlantRecord } from '@ctip/types'

export function StatusBadge(props: { children: ReactNode }): ReactElement
export function PlantCard(props: {
  plant: PlantRecord
  onPress?: () => void
  selected?: boolean
}): ReactElement
export function PlantDetailsFrame(props: { plant: PlantRecord }): ReactElement
export function SearchBar(props: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}): ReactElement
export function StatusFilter(props: {
  options: readonly string[]
  value: string
  onChange: (value: string) => void
}): ReactElement
export function SyncStatus(props?: { status?: string; detail?: string }): ReactElement
export function SecurityPlaceholder(): ReactElement
export function SectionCard(props: {
  title?: string
  eyebrow?: string
  action?: ReactNode
  children?: ReactNode
  className?: string
  style?: object
}): ReactElement
export function EmptyState(props: { title: string; detail: string }): ReactElement
export function MetricCard(props: {
  label: string
  value: string
  detail: string
}): ReactElement
export function ObservationForm(props: {
  onSubmit: (observation: PlantObservation) => void
  submitLabel?: string
}): ReactElement
