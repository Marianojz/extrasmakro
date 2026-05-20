// timeline.js
// Helpers to normalize and format operational timeline events for a lightweight UI.

export function normalizeEvents(events) {
  return (events||[])
    .map(e=>({
      ts: e.ts || e.timestamp || e.date || new Date().toISOString(),
      type: e.type || 'event',
      title: e.title || e.type || 'event',
      meta: e.meta || {}
    }))
    .sort((a,b)=> new Date(a.ts) - new Date(b.ts));
}

export function groupByDay(events) {
  const grouped = {};
  normalizeEvents(events).forEach(e=>{
    const day = new Date(e.ts).toISOString().slice(0,10);
    grouped[day] = grouped[day]||[];
    grouped[day].push(e);
  });
  return grouped;
}

export function formatForUI(events) {
  return normalizeEvents(events).map(e=>({
    time: new Date(e.ts).toLocaleString(),
    title: e.title,
    type: e.type,
    meta: e.meta
  }));
}
