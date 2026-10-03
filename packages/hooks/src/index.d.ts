import type { PlantRecord } from '@ctip/types'

export function usePlantSearch(
  plants: readonly PlantRecord[],
  query: string,
  status?: string,
): PlantRecord[]
