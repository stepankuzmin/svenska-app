#!/usr/bin/env node
// usage: node build.ts <flight.geojson> [out.html] [--no-buildings]
//
// Renders assets/template.html with the waypoints, the latest stable Mapbox
// GL JS, and the flyover library. Prints a flight report, then the link to
// open with the token from MAPBOX_ACCESS_TOKEN in the query string.
import { readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compileFlight, poseAt, type Flight, type FlightCollection, type Ground, type LngLat, type Pose, type Waypoint } from "../assets/flyover.ts";
import { Dem, demZoomFor, exaggerationAt, styleTerrain } from "./elevation.ts";

process.removeAllListeners("warning"); // stripTypeScriptTypes still prints an ExperimentalWarning

// The page lays the map out at this size and CSS-scales it to the window, so
// the zoom the camera reaches is the zoom computed here. Mapbox GL's default
// vertical field of view, in degrees.
const FRAME = { width: 1280, height: 720, fov: 36.87 };
const STYLE = "mapbox://styles/mapbox/standard";
const CIRCUMFERENCE = 40075016.686;
const rad = Math.PI / 180;
const wrapLng = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;

const args = process.argv.slice(2);
const [input, output = input?.replace(/\.geojson$/, "") + ".html"] = args.filter((a) => !a.startsWith("--"));
if (!input) fail("usage: build.ts <flight.geojson> [out.html] [--no-buildings]");

const token = process.env.MAPBOX_ACCESS_TOKEN;
if (!token) fail("MAPBOX_ACCESS_TOKEN is not set. The build reads the style's terrain to place the camera, so it cannot run without one.");
const flight = validate(JSON.parse(readFileSync(input, "utf8")));
const title = flight.properties?.title ?? "Flyover";
const version = await latestVersion();
const solved = await solveTerrain();

const asset = (name: string) => readFileSync(new URL(`../assets/${name}`, import.meta.url), "utf8");
const html = render(asset("template.html"), {
  title: escapeHtml(title),
  version,
  frameWidth: String(FRAME.width),
  frameHeight: String(FRAME.height),
  waypoints: literal(flight),
  ground: JSON.stringify(solved.ground),
  library: Buffer.from(stripTypeScriptTypes(asset("flyover.ts"))).toString("base64"),
});
writeFileSync(output, html);

report(compileFlight(flight, solved.ground));
await checkTerrain();
if (!args.includes("--no-buildings")) await checkBuildings(token);
else console.warn("warn: building check skipped");

console.log(`\n${pathToFileURL(resolve(output))}${token ? `?access_token=${encodeURIComponent(token)}` : ""}`);

// The zoom mapbox-gl derives from a camera pose. It is the distance from the
// camera to the point it looks at, measured in screen pixels, turned back into
// a scale. Verified against the browser on six poses: the largest disagreement
// was 0.007 zoom levels.
function renderZoom(pose: Pose, center: LngLat, centerAltitude: number): number {
  const pixels = (0.5 / Math.tan((FRAME.fov * rad) / 2)) * FRAME.height;
  const metersPerWorld = CIRCUMFERENCE * Math.cos(center[1] * rad);
  const above = Math.max(pose.altitude - centerAltitude, 1);
  return Math.log2((pixels * Math.cos(pose.pitch * rad) * metersPerWorld) / (512 * above));
}

interface TerrainRow {
  zoom: number;
  demZoom: number;
  exaggeration: number;
  raw: number;
  drawn: number;
  pose: Pose;
}

// Ground under every waypoint, read from the DEM the style draws.
//
// Altitude is measured above ground, the zoom follows from the altitude, the
// zoom picks the DEM overview and how much of the terrain's height Standard
// still draws, and that height is the ground again. The circle is solved here
// by repeating until the numbers stop moving, so the page gets one fixed set
// of altitudes instead of resolving the same circle against whichever tiles
// happened to have loaded.
async function solveTerrain() {
  const terrain = await styleTerrain(STYLE, token!);
  const dem = new Dem(terrain.dem, token!);
  const count = flight.features.length;
  let ground: Ground[] = Array.from({ length: count }, () => ({ camera: 0, look: 0 }));
  let rows: TerrainRow[] = [];

  for (let pass = 0; pass < 6; pass++) {
    const compiled = compileFlight(flight, ground);
    const next: Ground[] = [];
    rows = [];
    for (let i = 0; i < count; i++) {
      const wp = compiled.waypoints[i];
      const pose = poseAt(compiled, compiled.plan.waypointTimes[i]);
      const lookAltitude = ground[i].look + (flight.features[i].properties?.lookAt?.[2] ?? 0);
      const zoom = renderZoom(pose, wp.lookLngLat, lookAltitude);
      const exaggeration = exaggerationAt(terrain.exaggeration, zoom);
      const raw = await dem.elevation(wp.lngLat[0], wp.lngLat[1], zoom);
      const lookRaw = await dem.elevation(wp.lookLngLat[0], wp.lookLngLat[1], zoom);
      // Above ground means above the real mountain, not above whatever fraction
      // of its height the style has left at this zoom. Scaling the ground by
      // the exaggeration instead would push the camera down, which raises the
      // zoom, which flattens the terrain further, all the way to a flat map.
      next.push({ camera: raw, look: lookRaw });
      rows.push({ zoom, demZoom: demZoomFor(zoom, terrain.dem), exaggeration, raw, drawn: raw * exaggeration, pose });
    }
    const settled = next.every((g, i) => Math.abs(g.camera - ground[i].camera) < 0.5 && Math.abs(g.look - ground[i].look) < 0.5);
    ground = next;
    if (settled) return { ground, rows, dem, terrain };
  }
  console.warn("warn: the ground and the zoom never agreed after six passes, which happens when waypoints sit where the style's terrain exaggeration is changing. The flight below uses the last values. Move those waypoints into the zoom band the report prints.");
  return { ground, rows, dem, terrain };
}

// The camera against the terrain it flies over, sampled between waypoints
// where the spline, not the author, decides the altitude.
async function checkTerrain() {
  const { rows, dem } = solved;
  for (const [i, row] of rows.entries()) {
    // Flattening only shows where there is something to flatten. Over a river
    // or a plain the drawn ground is the same at any exaggeration.
    if (row.exaggeration > 0.9 || (await relief(dem, row)) < 200) continue;
    const wanted = (row.pose.altitude - (solved.ground[i].look + (flight.features[i].properties?.lookAt?.[2] ?? 0))) * 2 ** (row.zoom - 12);
    const climb = Math.round((wanted - (row.pose.altitude - row.raw)) / 10) * 10;
    console.warn(`warn: waypoint ${i + 1} renders at z${row.zoom.toFixed(1)}, where the style draws terrain at ${row.exaggeration.toFixed(2)} of its height, so the ground flattens. Raise the altitude by about ${climb} m, or move the camera farther from its target.`);
  }

  // A target a few hundred meters off a summit sits on a slope, and the shot
  // frames the slope. Coordinates for famous peaks are often the viewpoint or
  // the hut rather than the top.
  const reported = new Set<string>();
  for (const [i, row] of rows.entries()) {
    const target = flight.features[i].properties?.lookAt;
    if (!target) continue;
    const key = `${target[0].toFixed(4)},${target[1].toFixed(4)}`;
    if (reported.has(key)) continue;
    reported.add(key);
    const here = solved.ground[i].look;
    const peak = await localMax(dem, target[0], target[1], row.zoom);
    if (peak.elevation - here > 100) {
      console.warn(`warn: waypoint ${i + 1} looks at ground ${here.toFixed(0)} m, but the ground rises to ${peak.elevation.toFixed(0)} m at ${peak.lng.toFixed(4)}, ${peak.lat.toFixed(4)}, ${peak.meters.toFixed(0)} m away. Aim there to frame the summit instead of its shoulder.`);
    }
  }

  const compiled = compileFlight(flight, solved.ground);
  const step = Math.max(2000, compiled.plan.total / 200);
  const zoomNear = (t: number) => rows[nearestWaypoint(compiled, t)].zoom;
  let worst: { clearance: number; lngLat: LngLat; t: number } | null = null;
  for (let t = 0; t <= compiled.plan.total; t += step) {
    const pose = poseAt(compiled, t);
    const groundHere = await dem.elevation(pose.lngLat[0], pose.lngLat[1], zoomNear(t));
    const clearance = pose.altitude - groundHere;
    if (!worst || clearance < worst.clearance) worst = { clearance, lngLat: pose.lngLat, t };
  }
  if (worst && worst.clearance < 100) {
    console.warn(`warn: the camera passes ${worst.clearance.toFixed(0)} m above the terrain at ${worst.lngLat[0].toFixed(4)}, ${worst.lngLat[1].toFixed(4)}, ${(worst.t / 1000).toFixed(0)} s in. Raise the waypoints on either side or move the path off the ridge.`);
  }
}

// How much the ground rises and falls within a kilometer of a waypoint. Under
// 200 m the terrain reads as flat however the style draws it.
const reliefCache = new Map<TerrainRow, number>();
async function relief(dem: Dem, row: TerrainRow): Promise<number> {
  const cached = reliefCache.get(row);
  if (cached !== undefined) return cached;
  const step = 0.0022; // about 250 m
  const [lng, lat] = row.pose.lngLat;
  let low = Infinity;
  let high = -Infinity;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const e = await dem.elevation(lng + (dx * step) / Math.cos(lat * rad), lat + dy * step, row.zoom);
      low = Math.min(low, e);
      high = Math.max(high, e);
    }
  }
  reliefCache.set(row, high - low);
  return high - low;
}

// The highest DEM sample within 750 m, which is where a summit sits when the
// coordinate names the mountain rather than its top.
async function localMax(dem: Dem, lng: number, lat: number, zoom: number) {
  const step = 0.00045; // about 50 m
  const lngStep = step / Math.cos(lat * rad);
  let best = { elevation: -Infinity, lng, lat, meters: 0 };
  for (let dy = -15; dy <= 15; dy++) {
    for (let dx = -15; dx <= 15; dx++) {
      const p = [lng + dx * lngStep, lat + dy * step];
      const elevation = await dem.elevation(p[0], p[1], zoom);
      if (elevation > best.elevation) {
        best = { elevation, lng: p[0], lat: p[1], meters: Math.hypot(dx * 50, dy * 50) };
      }
    }
  }
  return best;
}

function nearestWaypoint(compiled: Flight, time: number): number {
  const times = compiled.plan.waypointTimes;
  let best = 0;
  times.forEach((wt, i) => { if (Math.abs(wt - time) < Math.abs(times[best] - time)) best = i; });
  return best;
}

// {{slot}} placeholders. Every slot must be provided and every provided slot
// must be used, so a renamed placeholder fails the build.
function render(template: string, slots: Record<string, string>): string {
  const used = new Set<string>();
  const out = template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (!(name in slots)) fail(`template: no value for {{${name}}}`);
    used.add(name);
    return slots[name];
  });
  for (const name of Object.keys(slots)) if (!used.has(name)) fail(`template: {{${name}}} is never used`);
  return out;
}

// GeoJSON as a readable JS literal: one line per array of numbers.
function literal(fc: FlightCollection): string {
  return JSON.stringify(fc, null, 4)
    .replace(/\[\s+(-?[\d.]+(?:,\s+-?[\d.]+)*)\s+\]/g, (_, nums: string) => `[${nums.replace(/\s+/g, " ")}]`)
    .replace(/</g, "\\u003c");
}

async function latestVersion(): Promise<string> {
  const url = "https://api.mapbox.com/mapbox-gl-js/versions.json";
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch((e: Error) => fail(`${url}: ${e.message}`));
  if (!res.ok) fail(`${url}: HTTP ${res.status}`);
  const versions: Record<string, { prerelease: boolean }> = await res.json();
  const stable = Object.keys(versions).filter((name) => /^v\d+\.\d+\.\d+$/.test(name) && !versions[name].prerelease).map((name) => name.slice(1));
  stable.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  if (!stable.length) fail(`${url}: no stable release listed`);
  return stable[0];
}

function report(compiled: Flight) {
  const { plan } = compiled;
  const coords = flight.features.map((f) => f.geometry.coordinates);
  console.log(`${output}: ${coords.length} waypoints, ${(plan.distance / 1000).toFixed(1)} km, ${(plan.total / 1000).toFixed(0)} s, mapbox-gl v${version}, frame ${FRAME.width}x${FRAME.height}`);
  solved.rows.forEach((row, i) => {
    const flat = row.exaggeration < 0.9 && row.raw > 50 ? `, terrain drawn at ${row.exaggeration.toFixed(2)} of its height` : "";
    console.log(`  waypoint ${i + 1}: ground ${row.raw.toFixed(0)} m, camera ${row.pose.altitude.toFixed(0)} m, pitch ${row.pose.pitch.toFixed(0)}°, z${row.zoom.toFixed(1)} off dem z${row.demZoom}${flat}`);
  });
  plan.phases.filter((p) => p.type === "leg").forEach((leg, i) => {
    const [alt0, alt1] = [coords[i][2], coords[i + 1][2]];
    const turn = i > 0 ? turnAngle(coords[i - 1], coords[i], coords[i + 1]) : 0;
    const hold = flight.features[i + 1].properties?.hold;
    console.log(`  leg ${i + 1}: ${leg.D.toFixed(0)} m, ${leg.vc.toFixed(0)} m/s, ${(leg.T / 1000).toFixed(1)} s, ${alt0}→${alt1} m${turn ? `, turn ${turn.toFixed(0)}°` : ""}${hold ? `, hold ${hold} ms` : ""}`);
    const low = Math.min(alt0, alt1);
    if (leg.vc > low / 3) console.warn(`warn: leg ${i + 1}: ${leg.vc.toFixed(0)} m/s at ${low} m is faster than altitude/3. Fine for a fast brief, a rocket otherwise.`);
    if (turn > 100) console.warn(`warn: waypoint ${i + 1}: ${turn.toFixed(0)}° turn. The spline overshoots hairpins; add a waypoint or widen the turn.`);
  });
}

// Tallest building within 150 m of every waypoint and every leg midpoint,
// compared with the camera height above ground there.
async function checkBuildings(token: string) {
  const coords = flight.features.map((f) => f.geometry.coordinates);
  const spots = coords.map((c, i) => ({ label: `waypoint ${i + 1}`, lng: c[0], lat: c[1], alt: c[2] }));
  for (let i = 0; i < coords.length - 1; i++) {
    const [a, b] = [coords[i], coords[i + 1]];
    const midLng = wrapLng(a[0] + wrapLng(b[0] - a[0]) / 2); // averaging raw lngs puts a date-line midpoint on Greenwich
    spots.push({ label: `between waypoints ${i + 1} and ${i + 2}`, lng: midLng, lat: (a[1] + b[1]) / 2, alt: (a[2] + b[2]) / 2 });
  }
  const heights = await Promise.all(spots.map(async ({ lng, lat }) => {
    const url = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${lng.toFixed(6)},${lat.toFixed(6)}.json?radius=150&limit=50&layers=building&access_token=${token}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!res?.ok) return null;
    const body: { features: { properties: { height?: number } }[] } = await res.json();
    return body.features.reduce((m, f) => Math.max(m, f.properties.height ?? 0), 0);
  }));
  if (heights.every((h) => h === null)) console.warn("warn: building check skipped: tilequery unavailable");
  spots.forEach((s, i) => {
    const h = heights[i];
    if (h !== null && h > s.alt - 40) console.warn(`warn: ${s.label}: camera ${s.alt.toFixed(0)} m above ground, buildings up to ${h.toFixed(0)} m within 150 m. Raise the camera or move over open ground.`);
  });
}

function turnAngle(a: number[], b: number[], c: number[]) {
  const diff = Math.abs(bearing(b, c) - bearing(a, b)) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function bearing([lng1, lat1]: number[], [lng2, lat2]: number[]) {
  const r = Math.PI / 180;
  const y = Math.sin((lng2 - lng1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lng2 - lng1) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

function validate(fc: any): FlightCollection {
  if (fc?.type !== "FeatureCollection" || !Array.isArray(fc.features)) fail("flight must be a GeoJSON FeatureCollection");
  const points: Waypoint[] = fc.features.filter((f: any) => f?.geometry?.type === "Point");
  if (points.length < 2) fail("need at least two Point features");
  points.forEach((f, i) => {
    const c = f.geometry.coordinates;
    if (!Array.isArray(c) || c.length < 3) fail(`waypoint ${i + 1}: coordinates must be [lng, lat, altitude]`);
    checkLngLat(c, `waypoint ${i + 1}`);
    if (typeof c[2] !== "number" || c[2] < 0) fail(`waypoint ${i + 1}: altitude must be a number of meters above ground`);
    const p = f.properties ?? {};
    if (p.lookAt !== undefined) {
      if (!Array.isArray(p.lookAt) || p.lookAt.length < 2) fail(`waypoint ${i + 1}: lookAt must be [lng, lat] or [lng, lat, altitude]`);
      checkLngLat(p.lookAt, `waypoint ${i + 1} lookAt`);
    }
    if (p.hold !== undefined && (typeof p.hold !== "number" || p.hold < 0)) fail(`waypoint ${i + 1}: hold must be milliseconds >= 0`);
    if (p.speed !== undefined && (typeof p.speed !== "number" || p.speed <= 0)) fail(`waypoint ${i + 1}: speed must be m/s > 0`);
  });
  const props = fc.properties ?? {};
  if (props.duration !== undefined && (typeof props.duration !== "number" || props.duration <= 0)) fail("properties.duration must be milliseconds > 0");
  if (props.speed !== undefined && (typeof props.speed !== "number" || props.speed <= 0)) fail("properties.speed must be m/s > 0");
  if (props.ramp !== undefined && (typeof props.ramp !== "number" || props.ramp < 0)) fail("properties.ramp must be milliseconds >= 0");
  return { type: "FeatureCollection", properties: props, features: points };
}

function checkLngLat([lng, lat]: number[], where: string) {
  if (typeof lng !== "number" || lng < -180 || lng > 180) fail(`${where}: longitude ${lng} out of range`);
  if (typeof lat !== "number" || lat < -90 || lat > 90) fail(`${where}: latitude ${lat} out of range`);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
