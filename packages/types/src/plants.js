export const CONSERVATION_STATUSES = [
  'All statuses',
  'Least concern',
  'Near threatened',
  'Vulnerable',
  'Endangered',
  'Critically endangered',
  'Not assessed',
]

export const PERSONAS = [
  { id: 'botanist', label: 'Botanist' },
  { id: 'conservation-officer', label: 'Conservation officer' },
  { id: 'admin', label: 'Admin' },
  { id: 'visitor', label: 'Visitor' },
]

// Illustrative UI fixtures only. Replace with API data before production use.
export const DEMO_PLANTS = [
  {
    id: 'demo-nepenthes',
    commonName: 'Tropical pitcher plant',
    scientificName: 'Nepenthes ampullaria',
    family: 'Nepenthaceae',
    conservationStatus: 'Not assessed',
    habitat: 'Lowland tropical rainforest',
    description:
      'A ground-dwelling pitcher plant. Confirm identification and conservation information with an authoritative source before publishing.',
    location: null,
    photographs: [],
  },
  {
    id: 'demo-dipterocarp',
    commonName: 'Forest canopy tree',
    scientificName: 'Shorea sp.',
    family: 'Dipterocarpaceae',
    conservationStatus: 'Not assessed',
    habitat: 'Mixed dipterocarp forest',
    description:
      'Example taxonomic record for layout and workflow testing. Species-level identification is pending.',
    location: null,
    photographs: [],
  },
  {
    id: 'demo-fern',
    commonName: 'Understory fern',
    scientificName: 'Species identification pending',
    family: 'Unconfirmed',
    conservationStatus: 'Not assessed',
    habitat: 'Shaded forest understory',
    description:
      'Example field observation awaiting review by a botanist.',
    location: null,
    photographs: [],
  },
]
