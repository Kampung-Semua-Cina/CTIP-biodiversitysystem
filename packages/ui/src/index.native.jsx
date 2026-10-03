import { useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { colors, radii, spacing, typography } from '@ctip/design-system'

export function StatusBadge({ children }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{children}</Text>
    </View>
  )
}

export function PlantCard({ plant, onPress, selected = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.plantCard, selected && styles.plantCardSelected]}
    >
      <View style={styles.plantIcon}><Text style={styles.plantIconText}>✳</Text></View>
      <View style={styles.plantCardContent}>
        <Text numberOfLines={1} style={styles.plantName}>{plant.commonName}</Text>
        <Text numberOfLines={1} style={styles.scientificName}>{plant.scientificName}</Text>
        <Text numberOfLines={1} style={styles.mutedSmall}>{plant.family}</Text>
      </View>
      <StatusBadge>{plant.conservationStatus}</StatusBadge>
    </Pressable>
  )
}

export function PlantDetailsFrame({ plant }) {
  return (
    <View style={styles.detailFrame}>
      <View style={styles.detailVisual}>
        <Text style={styles.detailVisualText}>
          <Image
            source={{
              uri: 'https://www.thespruce.com/thmb/9bRoVgugsqiKmtJB0BI-hyIpiVs=/750x0/filters:no_upscale():max_bytes(150000):strip_icc()/pitcher-plant-2538a0de05424f2488792e5f51b1f538.jpg',
            }}
            resizeMode="cover"
            style={styles.detailImage}
          />
        </Text>
        </View>
      <View style={styles.detailBody}>
        <Text style={styles.eyebrow}>{plant.family}</Text>
        <Text style={styles.detailTitle}>{plant.commonName}</Text>
        <Text style={styles.scientificName}>{plant.scientificName}</Text>
        <StatusBadge>{plant.conservationStatus}</StatusBadge>
        <Text style={styles.description}>{plant.description}</Text>
        <View style={styles.facts}>
          <Fact label="Habitat" value={plant.habitat} />
          <Fact
            label="Recorded location"
            value={plant.location
              ? `${plant.location.latitude}, ${plant.location.longitude}`
              : 'No coordinates attached'}
          />
          <Fact label="Photographs" value={String(plant.photographs.length)} />
        </View>
      </View>
    </View>
  )
}

function Fact({ label, value }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.mutedSmall}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  )
}

export function SearchBar({ value, onChange, placeholder = 'Search plants' }) {
  return (
    <View style={styles.search}>
      <Text style={styles.searchIcon}>⌕</Text>
      <TextInput
        accessibilityLabel="Search plants"
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        style={styles.searchInput}
        value={value}
      />
    </View>
  )
}

export function StatusFilter({ options, value, onChange }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <View style={styles.filterWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        style={styles.filterButton}
      >
        <Text style={styles.filterLabel}>Status: {value}  {expanded ? '−' : '+'}</Text>
      </Pressable>
      {expanded && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterOptions}>
          {options.map((option) => (
            <Pressable
              accessibilityRole="button"
              key={option}
              onPress={() => {
                onChange(option)
                setExpanded(false)
              }}
              style={[styles.filterOption, option === value && styles.filterOptionSelected]}
            >
              <Text style={[styles.filterOptionText, option === value && styles.filterOptionTextSelected]}>
                {option}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

export function SyncStatus({ status = 'Offline-ready', detail = 'Changes sync when a connection is available' }) {
  return (
    <View accessibilityRole="text" style={styles.sync}>
      <View style={styles.syncDot} />
      <View style={styles.syncText}>
        <Text style={styles.syncTitle}>{status}</Text>
        <Text style={styles.syncDetail}>{detail}</Text>
      </View>
    </View>
  )
}

export function SecurityPlaceholder() {
  return (
    <View accessibilityRole="alert" style={styles.securityNotice}>
      <Text style={styles.securityTitle}>Backend security integration pending</Text>
      <Text style={styles.securityText}>
        Persona selection is a UI preview only. Authentication, server-enforced role permissions,
        encryption, and key management must be implemented by the backend team.
      </Text>
    </View>
  )
}

export function SectionCard({ title, eyebrow, action, children, style }) {
  return (
    <View style={[styles.sectionCard, style]}>
      {(title || eyebrow || action) && (
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeading}>
            {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
            {title && <Text style={styles.sectionTitle}>{title}</Text>}
          </View>
          {action}
        </View>
      )}
      {children}
    </View>
  )
}

export function EmptyState({ title, detail }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>⌕</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </View>
  )
}

export function MetricCard({ label, value, detail }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.mutedSmall}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.syncDetail}>{detail}</Text>
    </View>
  )
}

export function ObservationForm({ onSubmit, submitLabel = 'Save field note' }) {
  const [plantName, setPlantName] = useState('')
  const [scientificName, setScientificName] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  function submit() {
    if (!plantName.trim()) {
      setError('Enter a plant name before saving this observation.')
      return
    }
    onSubmit({
      plantName: plantName.trim(),
      scientificName: scientificName.trim(),
      notes: notes.trim(),
      recordedAt: new Date().toISOString(),
      location: null,
    })
    setPlantName('')
    setScientificName('')
    setNotes('')
    setError('')
  }

  return (
    <View style={styles.form}>
      <FormField label="Common or field name" onChangeText={setPlantName} value={plantName} required />
      <FormField label="Scientific name (if known)" onChangeText={setScientificName} value={scientificName} />
      <FormField label="Observation notes" onChangeText={setNotes} value={notes} multiline />
      {error ? <Text accessibilityRole="alert" style={styles.formError}>{error}</Text> : null}
      <Text style={styles.formHint}>Camera, QR scanning, and GPS capture connect through mobile device adapters.</Text>
      <Pressable accessibilityRole="button" onPress={submit} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>{submitLabel}</Text>
      </Pressable>
    </View>
  )
}

function FormField({ label, value, onChangeText, multiline = false, required = false }) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}{required ? ' *' : ''}</Text>
      <TextInput
        accessibilityLabel={label}
        maxLength={multiline ? 2000 : 160}
        multiline={multiline}
        onChangeText={onChangeText}
        style={[styles.formInput, multiline && styles.multilineInput]}
        value={value}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    backgroundColor: '#edf1e8',
  },
  badgeText: { color: '#536249', fontSize: typography.caption, fontWeight: '700' },
  plantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  plantCardSelected: { borderColor: colors.border, backgroundColor: colors.surface },
  plantIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.leaf,
  },
  plantIconText: { color: colors.forest, fontSize: 20 },
  plantCardContent: { flex: 1, gap: 2 },
  plantName: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  scientificName: { color: colors.muted, fontSize: typography.small, fontStyle: 'italic' },
  mutedSmall: { color: colors.muted, fontSize: typography.caption },
  detailFrame: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface },
  detailVisual: { minHeight: 135, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e4eee2' },
  detailVisualText: { fontSize: 52 },
  detailBody: { gap: spacing.sm, padding: spacing.md },
  eyebrow: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  detailTitle: { color: colors.ink, fontSize: 22, fontWeight: '700' },
  description: { marginTop: spacing.sm, color: colors.muted, fontSize: typography.small, lineHeight: 21 },
  facts: { gap: spacing.sm, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  factValue: { flexShrink: 1, color: colors.ink, fontSize: typography.caption, fontWeight: '600', textAlign: 'right' },
  search: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  searchIcon: { color: colors.muted, fontSize: 20 },
  searchInput: { flex: 1, color: colors.ink, fontSize: typography.small },
  filterWrap: { gap: spacing.sm },
  filterButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, padding: spacing.sm, backgroundColor: colors.surface },
  filterLabel: { color: colors.ink, fontSize: typography.caption },
  filterOptions: { flexGrow: 0 },
  filterOption: { marginRight: spacing.sm, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  filterOptionSelected: { backgroundColor: colors.forest },
  filterOptionText: { color: colors.ink, fontSize: typography.caption },
  filterOptionTextSelected: { color: colors.surface, fontWeight: '700' },
  sync: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  syncDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#72a47b' },
  syncText: { gap: 2 },
  syncTitle: { color: colors.ink, fontSize: typography.caption, fontWeight: '700' },
  syncDetail: { color: colors.muted, fontSize: 10 },
  securityNotice: { gap: spacing.xs, borderWidth: 1, borderColor: '#efdfb8', borderRadius: radii.md, padding: spacing.md, backgroundColor: colors.warningSurface },
  securityTitle: { color: '#75591d', fontSize: typography.caption, fontWeight: '700' },
  securityText: { color: '#75591d', fontSize: 11, lineHeight: 16 },
  sectionCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, backgroundColor: colors.surface },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.md },
  sectionHeading: { flex: 1, gap: spacing.xs },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  emptyState: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  emptyIcon: { color: colors.muted, fontSize: 25 },
  emptyTitle: { color: colors.ink, fontSize: typography.small, fontWeight: '700' },
  emptyDetail: { color: colors.muted, fontSize: typography.caption, textAlign: 'center' },
  metricCard: { flex: 1, gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, backgroundColor: colors.surface },
  metricValue: { color: colors.forest, fontSize: typography.heading, fontWeight: '700' },
  form: { gap: spacing.md },
  formField: { gap: spacing.xs },
  formLabel: { color: colors.ink, fontSize: typography.caption, fontWeight: '600' },
  formInput: { minHeight: 42, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, color: colors.ink, backgroundColor: colors.surface },
  multilineInput: { minHeight: 96, textAlignVertical: 'top' },
  formHint: { color: colors.muted, fontSize: typography.caption, lineHeight: 18 },
  formError: { color: colors.danger, fontSize: typography.caption },
  primaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, paddingHorizontal: spacing.md, backgroundColor: colors.forest },
  primaryButtonText: { color: colors.surface, fontSize: typography.small, fontWeight: '700' },
})
