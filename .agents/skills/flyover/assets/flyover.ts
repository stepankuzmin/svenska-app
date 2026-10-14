// Everything a generated flyover page needs. The first half is pure math
// shared with the build report. The second half touches the map and the
// clock. Nothing runs at import, so Node can load it for the build report.

declare const mapboxgl: any;

export type LngLat = [number, number];

export interface WaypointProperties {
  lookAt?: number[];
  hold?: number;
  speed?: number;
}

export interface FlightProperties {
  title?: string;
  speed?: number;
  duration?: number;
  ramp?: number;
  loop?: boolean;
  minAltitude?: number;
}

export interface Waypoint {
  type: "Feature";
  geometry: { type: "Point"; coordinates: number[] };
  properties?: WaypointProperties;
}

export interface FlightCollection {
  type: "FeatureCollection";
  properties?: FlightProperties;
  features: Waypoint[];
}

export const defaults = { duration: 45000, ramp: 1500, loop: false, minAltitude: 10 };
export type FlightOptions = typeof defaults & FlightProperties;

export interface Pose {
  lngLat: LngLat;
  altitude: number;
  pitch: number;
  bearing: number;
}

export interface Flight {
  options: FlightOptions;
  plan: Plan;
  samples: Sample[];
  waypoints: { lngLat: LngLat; lookLngLat: LngLat }[];
}

export interface Ground { camera: number; look: number } // meters, per waypoint

type Vec3 = [number, number, number]; // mercator x, mercator y, meters
interface Sample { pos: Vec3; look: Vec3; d: number }

const EARTH = 40030228.88;
const rad = Math.PI / 180;
const SAMPLES = 64;

export function mercator([lng, lat]: LngLat): [number, number] {
  return [(180 + lng) / 360, (180 - Math.log(Math.tan(Math.PI / 4 + (lat * rad) / 2)) / rad) / 360];
}

export function lngLatOf([x, y]: [number, number]): LngLat {
  return [x * 360 - 180, (Math.atan(Math.exp((180 - y * 360) * rad)) / rad) * 2 - 90];
}

const wrapLng = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;

// Longitudes on one continuous world copy. A leg from 179.9 to -179.9 is 22 km
// across the date line, and mercator x has to run past 1 to say so instead of
// sliding back through Greenwich.
function unwrapLngs(lngs: number[]): number[] {
  const out = [lngs[0]];
  for (let i = 1; i < lngs.length; i++) out.push(out[i - 1] + wrapLng(lngs[i] - out[i - 1]));
  return out;
}

const metersPerUnit = (lat: number) => EARTH * Math.cos(lat * rad);

// ground[i] is the ground elevation under waypoint i's camera and target, so
// altitudes above ground become absolute. The build passes nothing and
// reports altitudes as given.
export function compileFlight(fc: FlightCollection, ground: Ground[] = []): Flight {
  const options: FlightOptions = { ...defaults, ...fc.properties };
  const points = fc.features.filter((f) => f.geometry.type === "Point");
  const meanLat = points.reduce((a, f) => a + f.geometry.coordinates[1], 0) / points.length;
  const scale = metersPerUnit(meanLat);

  // Everything from here to the pose is on one world copy, so the spline never
  // crosses the antimeridian. poseAt wraps the longitude back on the way out.
  const lngs = unwrapLngs(points.map((f) => f.geometry.coordinates[0]));
  const path: LngLat[] = points.map((f, i) => [lngs[i], f.geometry.coordinates[1]]);

  const nodes = points.map((f, i) => {
    const agl = f.geometry.coordinates[2] ?? 100;
    const p = f.properties ?? {};
    const lngLat = path[i];
    const lookLngLat: LngLat = p.lookAt
      ? [lngs[i] + wrapLng(p.lookAt[0] - lngs[i]), p.lookAt[1]]
      : ahead(path, i, agl * 3, scale);
    return {
      lngLat,
      lookLngLat,
      pos: [...mercator(lngLat), Math.max(agl, options.minAltitude) + (ground[i]?.camera ?? 0)] as Vec3,
      look: [...mercator(lookLngLat), (p.lookAt?.[2] ?? 0) + (ground[i]?.look ?? 0)] as Vec3,
      hold: p.hold ?? 0,
      speed: p.speed,
    };
  });

  const samples = samplePath(nodes, scale);
  const plan = planFlight(nodes.map((n, i) => ({ d: samples[i * SAMPLES].d, hold: n.hold, speed: n.speed })), options);
  const waypoints = nodes.map(({ lngLat, lookLngLat }) => ({
    lngLat: [wrapLng(lngLat[0]), lngLat[1]] as LngLat,
    lookLngLat: [wrapLng(lookLngLat[0]), lookLngLat[1]] as LngLat,
  }));
  return { options, plan, samples, waypoints };
}

export function poseAt(flight: Flight, time: number): Pose {
  const { pos, look } = sampleAt(flight.samples, distanceAt(flight.plan, time));
  const [lng, lat] = lngLatOf([pos[0], pos[1]]);
  const lngLat: LngLat = [wrapLng(lng), lat];
  const dx = look[0] - pos[0];
  const dy = look[1] - pos[1];
  const dz = (look[2] - pos[2]) / metersPerUnit(lngLat[1]);
  return {
    lngLat,
    altitude: pos[2],
    pitch: Math.min(Math.atan2(Math.hypot(dx, dy), -dz) / rad, 85),
    bearing: Math.atan2(dx, -dy) / rad,
  };
}

// A point `meters` ahead of waypoint i along the direction from its
// neighbors, so a waypoint without lookAt reads as a forward-facing drone.
function ahead(path: LngLat[], i: number, meters: number, scale: number): LngLat {
  const at = (k: number) => mercator(path[Math.max(0, Math.min(path.length - 1, k))]);
  const [hx, hy] = at(i);
  const [ax, ay] = at(i - 1);
  const [bx, by] = at(i + 1);
  const len = Math.hypot(bx - ax, by - ay) || 1e-9;
  const step = meters / scale / len;
  return lngLatOf([hx + (bx - ax) * step, hy + (by - ay) * step]);
}

function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  return p1.map((_, i) => 0.5 * (
    2 * p1[i] +
    (-p0[i] + p2[i]) * t +
    (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
    (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3)) as Vec3;
}

// Meters between two path points. The third component is already meters, and a
// climb over one spot is real travel: leave it out and the leg measures zero,
// which gives the plan a zero cruise speed and a NaN duration.
const span = (a: Vec3, b: Vec3, scale: number) =>
  Math.hypot((b[0] - a[0]) * scale, (b[1] - a[1]) * scale, b[2] - a[2]);

function samplePath(nodes: { pos: Vec3; look: Vec3 }[], scale: number): Sample[] {
  const n = (i: number) => nodes[Math.max(0, Math.min(nodes.length - 1, i))];
  const samples: Sample[] = [];
  let d = 0;
  for (let s = 0; s < nodes.length - 1; s++) {
    for (let k = 0; k < SAMPLES; k++) {
      const t = k / SAMPLES;
      const pos = catmullRom(n(s - 1).pos, n(s).pos, n(s + 1).pos, n(s + 2).pos, t);
      const look = catmullRom(n(s - 1).look, n(s).look, n(s + 1).look, n(s + 2).look, t);
      const prev = samples.at(-1);
      if (prev) d += span(prev.pos, pos, scale);
      samples.push({ pos, look, d });
    }
  }
  const last = nodes[nodes.length - 1];
  const prev = samples[samples.length - 1];
  d += span(prev.pos, last.pos, scale);
  samples.push({ pos: last.pos, look: last.look, d });
  return samples;
}

function sampleAt(samples: Sample[], d: number): { pos: Vec3; look: Vec3 } {
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].d < d) lo = mid + 1; else hi = mid;
  }
  const b = samples[Math.max(lo, 1)];
  const a = samples[Math.max(lo - 1, 0)];
  const t = Math.max(0, Math.min(1, (d - a.d) / (b.d - a.d || 1)));
  const lerp = (u: Vec3, v: Vec3) => u.map((x, i) => x + (v[i] - x) * t) as Vec3;
  return { pos: lerp(a.pos, b.pos), look: lerp(a.look, b.look) };
}

// Timing. A flight is legs between consecutive waypoints. Each leg cruises
// at one speed; speed changes and stops happen inside short ramps with a
// smoothstep velocity profile. The flight is at cruise speed on frame one.

export interface Leg {
  from: number; // meters along the path
  D: number; // leg length, meters
  T: number; // leg time, ms
  ta: number; // acceleration ramp, ms
  td: number; // deceleration ramp, ms
  vs: number; // speed at start, m/s
  vc: number; // cruise speed, m/s
  ve: number; // speed at end, m/s
}

type Phase =
  | { type: "hold"; start: number; end: number; d: number }
  | ({ type: "leg"; start: number; end: number } & Leg);

export interface Plan {
  phases: Phase[];
  waypointTimes: number[]; // ms at which the camera reaches each waypoint
  total: number; // ms
  cruise: number; // m/s
  distance: number; // meters
}

interface PlanNode { d: number; hold: number; speed?: number }

const S = (u: number) => u * u * u - (u * u * u * u) / 2; // integral of smoothstep on [0, u]

export function planFlight(nodes: PlanNode[], opts: { duration: number; speed?: number; ramp: number }): Plan {
  const n = nodes.length;
  const distance = nodes[n - 1].d;
  const stopAt = (i: number) => i === n - 1 || nodes[i].hold > 0;
  const holds = nodes.reduce((a, w) => a + w.hold, 0);

  let cruise = opts.speed;
  if (!cruise) {
    let rampTime = 0;
    for (let i = 0; i < n - 1; i++) {
      if (i > 0 && stopAt(i)) rampTime += opts.ramp / 2;
      if (stopAt(i + 1)) rampTime += opts.ramp / 2;
    }
    const travel = opts.duration - holds - rampTime;
    cruise = (distance / (travel > 0 ? travel : opts.duration / 2)) * 1000;
  }

  const legs: Leg[] = [];
  for (let i = 0; i < n - 1; i++) {
    const vc = nodes[i].speed || cruise;
    const startsAtStop = stopAt(i);
    const vs = startsAtStop ? 0 : vc;
    const ve = stopAt(i + 1) ? 0 : nodes[i + 1].speed || cruise;
    let ta = startsAtStop ? opts.ramp : 0;
    let td = ve !== vc ? opts.ramp : 0;
    const D = nodes[i + 1].d - nodes[i].d;
    let T = 0;
    for (let k = 0; k < 4; k++) {
      T = ((D + ((vc - vs) * ta) / 2000 + ((vc - ve) * td) / 2000) / vc) * 1000;
      if (ta + td <= T) break;
      const shrink = T / (ta + td);
      ta *= shrink;
      td *= shrink;
    }
    legs.push({ from: nodes[i].d, D, T, ta, td, vs, vc, ve });
  }

  const phases: Phase[] = [];
  const waypointTimes: number[] = [];
  let clock = 0;
  for (let i = 0; i < n; i++) {
    waypointTimes.push(clock);
    if (nodes[i].hold > 0) {
      phases.push({ type: "hold", start: clock, end: clock + nodes[i].hold, d: nodes[i].d });
      clock += nodes[i].hold;
    }
    if (i < n - 1) {
      phases.push({ type: "leg", start: clock, end: clock + legs[i].T, ...legs[i] });
      clock += legs[i].T;
    }
  }
  return { phases, waypointTimes, total: clock, cruise, distance };
}

// Meters along the path at `time` ms into the flight.
export function distanceAt(plan: Plan, time: number): number {
  const p = plan.phases.find((ph) => time < ph.end) ?? plan.phases[plan.phases.length - 1];
  if (p.type === "hold") return p.d;
  if (p.T <= 0) return p.from;
  const t = Math.min(Math.max(time - p.start, 0), p.T);
  const { ta, td, vs, vc, ve, T } = p;
  const dA = (vs * ta + ((vc - vs) * ta) / 2) / 1000;
  if (t < ta) return p.from + (vs * t + (vc - vs) * ta * S(t / ta)) / 1000;
  if (t < T - td) return p.from + dA + (vc * (t - ta)) / 1000;
  const tau = t - (T - td);
  return p.from + dA + (vc * (T - ta - td)) / 1000 + (vc * tau + (ve - vc) * td * S(tau / td)) / 1000;
}

export function setCamera(map: any, pose: Pose) {
  const camera = new mapboxgl.FreeCameraOptions(mapboxgl.MercatorCoordinate.fromLngLat(pose.lngLat, pose.altitude));
  camera.setPitchBearing(pose.pitch, pose.bearing);
  map.setFreeCameraOptions(camera);
}

// Ask the renderer for every tile the flight will need, then wait until the
// network and the map go quiet. One _preloadTiles call dedupes tiles across
// all sampled camera states; jumpTo({ preloadOnly }) per state would reload
// each tile once per call. Resolves with the camera on frame one.
// Loads every tile the flight will draw, before frame one.
//
// Predicting the tiles with Map._preloadTiles does not work: mapbox-gl keeps
// adjusting a transform after the camera is set, so a pose at rest settles at
// a different zoom than the same pose under a camera driven every frame, and
// the tiles it fetches are a level or two off the ones the flight draws.
// Measured on a 49 km flight, that left 214 tiles loading in the air. Flying
// the path first cannot miss, because the warm-up renders the poses the
// flight renders, and it leaves 21.
export async function preload(map: any, flight: Flight, onProgress?: (done: number, total: number) => void) {
  setCamera(map, poseAt(flight, 0));
  await idle(map);

  // A stop every kilometer of path. Measured on a 49 km flight: 48 stops left
  // 21 tiles loading in the air and took 43 s, 32 stops left 39 and took 32 s.
  const steps = Math.max(24, Math.min(96, Math.round(flight.plan.distance / 1000)));
  for (let i = 0; i <= steps; i++) {
    setCamera(map, poseAt(flight, (flight.plan.total * i) / steps));
    await idle(map, 4000);
    onProgress?.(i + 1, steps + 1);
  }

  setCamera(map, poseAt(flight, 0));
  await idle(map);
}

function idle(map: any, maxMs = 10000) {
  return Promise.race([
    new Promise<void>((resolve) => { map.once("idle", resolve); map.triggerRepaint(); }),
    new Promise<void>((resolve) => setTimeout(resolve, maxMs)),
  ]);
}

export interface Player {
  toggle(): void; // pause, or resume from the same spot
  restart(): Promise<void>; // from frame one; resolves when the flight reaches its end
}

// Drives the camera along the flight with requestAnimationFrame. Honors
// prefers-reduced-motion by showing frame one and waiting for toggle().
export function play(map: any, flight: Flight): Player {
  const total = flight.plan.total;
  let startedAt: number | null = null;
  let pausedAt: number | null = null;
  let raf = 0;
  let onEnd: (() => void)[] = [];

  function frame(now: number) {
    startedAt ??= now;
    let t = now - startedAt;
    if (t >= total) {
      onEnd.splice(0).forEach((f) => f());
      startedAt = flight.options.loop ? now : null;
      if (!flight.options.loop) return setCamera(map, poseAt(flight, total));
      t = 0;
    }
    setCamera(map, poseAt(flight, t));
    raf = requestAnimationFrame(frame);
  }
  const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); };

  setCamera(map, poseAt(flight, 0));
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) pausedAt = performance.now();
  else run();

  return {
    toggle() {
      if (pausedAt === null) {
        pausedAt = performance.now();
        cancelAnimationFrame(raf);
      } else {
        if (startedAt !== null) startedAt += performance.now() - pausedAt;
        pausedAt = null;
        run();
      }
    },
    restart() {
      startedAt = null;
      pausedAt = null;
      run();
      return new Promise<void>((resolve) => onEnd.push(resolve));
    },
  };
}

// Records one pass of the flight from the map canvas and downloads it. The
// map needs preserveDrawingBuffer: true for the canvas to be capturable.
export async function record(map: any, player: Player, filename = document.title) {
  const type = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) throw new Error("MediaRecorder cannot encode video in this browser");
  const recorder = new MediaRecorder(map.getCanvas().captureStream(), { mimeType: type, videoBitsPerSecond: 16e6 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
  recorder.start();
  await player.restart();
  await new Promise((resolve) => setTimeout(resolve, 300));
  recorder.stop();
  await stopped;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(chunks, { type }));
  a.download = `${filename}.${type.startsWith("video/mp4") ? "mp4" : "webm"}`;
  a.click();
}
