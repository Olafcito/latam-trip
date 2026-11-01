import { PlannerMap } from '../components/PlannerMap'
import { Notice } from '../components/Notice'
import { PlaceCard } from '../components/PlaceCard'

/** The route map, full size: every journey, and building on the open one. */
export function MapScreen() {
  return (
    <>
      {/* the Save button is on this tab, so a save that waits or fails says so here */}
      <Notice />
      <div className="mapscreen">
        <PlannerMap />
        <PlaceCard />
      </div>
    </>
  )
}
