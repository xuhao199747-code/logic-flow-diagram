const BASE_WIDTH = 1400;
const BASE_HEIGHT = 800;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.2;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const clean = (value) => Number(value.toFixed(3));

function constrained(viewport) {
  const width = BASE_WIDTH / viewport.zoom;
  const height = BASE_HEIGHT / viewport.zoom;
  return {
    zoom: viewport.zoom,
    x: clamp(viewport.x, -width * 0.75, BASE_WIDTH - width * 0.25),
    y: clamp(viewport.y, -height * 0.75, BASE_HEIGHT - height * 0.25),
  };
}

export function createCanvasViewport() {
  return { zoom: 1, x: 0, y: 0 };
}

export function viewBoxFor(viewport) {
  return [viewport.x, viewport.y, BASE_WIDTH / viewport.zoom, BASE_HEIGHT / viewport.zoom]
    .map(clean)
    .join(" ");
}

export function zoomCanvasAt(viewport, requestedZoom, anchor) {
  const zoom = clamp(requestedZoom, MIN_ZOOM, MAX_ZOOM);
  const ratio = viewport.zoom / zoom;
  return constrained({
    zoom,
    x: anchor.x - (anchor.x - viewport.x) * ratio,
    y: anchor.y - (anchor.y - viewport.y) * ratio,
  });
}

export function panCanvasBy(viewport, deltaX, deltaY) {
  return constrained({ ...viewport, x: viewport.x + deltaX, y: viewport.y + deltaY });
}

export function wheelActionFor({ ctrlKey, deltaX, deltaY, deltaMode }) {
  if (ctrlKey) return "zoom";
  if (deltaX !== 0 || (deltaMode === 0 && Math.abs(deltaY) < 50)) return "pan";
  return "zoom";
}
