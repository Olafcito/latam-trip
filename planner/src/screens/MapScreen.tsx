import { PlannerMap } from '../components/PlannerMap'

/** The route map, full size: every journey, and building on the open one. */
export function MapScreen() {
  return (
    <div className="mapscreen">
      <PlannerMap />
    </div>
  )
}
