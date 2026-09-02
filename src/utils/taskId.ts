/**
 * Canonical task-ID builder.
 *
 * The admin ("Dispatch"), client ("stat" pickup), and rider (fallback auto-create when starting
 * a stop before dispatch exists) flows each used to mint their own task IDs independently:
 *   - Admin's DispatchModal:      `task_${Date.now()}`               (random, per-click)
 *   - Rider's fallback creation:  `task-${date}-${routeId}-${slot}`  (deterministic)
 *
 * Because those two schemes never produce the same value for the same route+slot+day, dispatching
 * a round from the admin panel and then having a rider work that round created TWO separate
 * Firestore documents for what is really one logical job: the admin's dispatch doc sat untouched
 * at "pending", while all the rider's real progress (photos, vial counts, status) landed on a
 * second, parallel doc the admin/client dashboards never subscribed to — so completed pickups
 * never appeared to be reflected there.
 *
 * The fix: every caller that creates/looks up a task for a scheduled route round uses THIS same
 * deterministic formula, so whichever side (admin dispatching, or a rider starting a stop before
 * dispatch exists) touches a given route+slot+day first, they always resolve to one shared doc.
 */
export function buildCanonicalTaskId(routeId: string | undefined | null, timeSlot: string | undefined | null, dateStr: string): string {
  const cleanRouteId = (routeId || 'route').replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanSlot = (timeSlot || '0900').replace(/[^a-zA-Z0-9]/g, '');
  return `task-${dateStr}-${cleanRouteId}-${cleanSlot}`;
}
