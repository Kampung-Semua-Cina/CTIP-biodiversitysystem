import { useMemo } from 'react'

export function usePlantSearch(plants, query, status = 'All statuses') {
  return useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()

    return plants.filter((plant) => {
      const matchesQuery =
        !normalizedQuery ||
        [
          plant.commonName,
          plant.scientificName,
          plant.family,
          plant.habitat,
        ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))
      const matchesStatus =
        status === 'All statuses' || plant.conservationStatus === status

      return matchesQuery && matchesStatus
    })
  }, [plants, query, status])
}
