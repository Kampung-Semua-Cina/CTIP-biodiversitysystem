export {
  CONSERVATION_STATUSES,
  DEMO_PLANTS,
  PERSONAS,
} from './plants.js'
export { ACCESS_CONTROL_STATUS, ROLES } from './security.js'

/**
 * @typedef {object} PlantRecord
 * @property {string} id
 * @property {string} commonName
 * @property {string} scientificName
 * @property {string} family
 * @property {string} conservationStatus
 * @property {string} habitat
 * @property {string} description
 * @property {{latitude: number, longitude: number} | null} location
 * @property {string[]} photographs
 */

/**
 * @typedef {object} PlantObservation
 * @property {string} plantName
 * @property {string} scientificName
 * @property {string} notes
 * @property {string} recordedAt
 * @property {{latitude: number, longitude: number} | null} location
 */
