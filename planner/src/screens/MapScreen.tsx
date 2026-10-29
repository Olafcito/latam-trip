import { PlannerMap } from '../components/PlannerMap'
import { PlaceCard } from '../components/PlaceCard'

/** The route map, full size: every journey, and building on the open one. */
export function MapScreen() {
  return (
    <div className="mapscreen">
      <PlannerMap />
      <PlaceCard />
    </div>
  )
}
