// Ground elevation from the DEM the style renders, read at build time.
//
// The page used to ask the renderer for elevation at each waypoint, which made
// the flight depend on which tiles had loaded and on the zoom the camera
// happened to reach. Here the same DEM is fetched, decoded, and sampled in
// process, so a flight compiles to the same numbers on every run.
import { inflateSync } from "node:zlib";

export type DemSource = {
  tiles: string[];
  tileSize: number;
  minzoom: number;
  maxzoom: number;
};

export type StyleTerrain = {
  dem: DemSource;
  exaggeration: unknown;
};

const CIRCUMFERENCE = 40075016.686;

// mapbox://styles/mapbox/standard -> the style JSON, its terrain source, and
// the exaggeration expression that source is drawn with.
export async function styleTerrain(style: string, token: string): Promise<StyleTerrain> {
  const path = style.replace(/^mapbox:\/\/styles\//, "");
  const json = await getJson(`https://api.mapbox.com/styles/v1/${path}?access_token=${token}`);
  const terrain = json.terrain;
  if (!terrain) throw new Error(`${style}: the style draws no terrain`);
  const source = json.sources?.[terrain.source];
  if (source?.type !== "raster-dem") throw new Error(`${style}: terrain source ${terrain.source} is ${source?.type ?? "missing"}, not raster-dem`);
  const tileset = String(source.url ?? "").replace(/^mapbox:\/\//, "");
  if (!tileset) throw new Error(`${style}: terrain source ${terrain.source} has no url`);
  const tilejson = await getJson(`https://api.mapbox.com/v4/${tileset}.json?secure&access_token=${token}`);
  return {
    dem: {
      // The tilejson template serves webp from the raster/v1 host, which node
      // cannot decode. The v4 endpoint serves the same tiles as png, and @2x
      // is the 512 px grid the style's tileSize asks for.
      tiles: [`https://api.mapbox.com/v4/${tileset}/{z}/{x}/{y}@2x.pngraw`],
      tileSize: source.tileSize ?? tilejson.tileSize ?? 512,
      minzoom: tilejson.minzoom ?? 0,
      maxzoom: tilejson.maxzoom ?? 14,
    },
    exaggeration: terrain.exaggeration,
  };
}

// The style's exaggeration at one zoom. Only constants and linear zoom
// interpolation, which is what Standard uses; anything else throws rather than
// being guessed at, because the camera altitude depends on the answer.
export function exaggerationAt(expression: unknown, zoom: number): number {
  if (expression === undefined || expression === null) return 1;
  if (typeof expression === "number") return expression;
  if (!Array.isArray(expression) || expression[0] !== "interpolate" || JSON.stringify(expression[1]) !== '["linear"]' || JSON.stringify(expression[2]) !== '["zoom"]') {
    throw new Error(`terrain exaggeration ${JSON.stringify(expression)} is not a constant or a linear zoom interpolation`);
  }
  const stops: [number, number][] = [];
  for (let i = 3; i < expression.length; i += 2) stops.push([expression[i], expression[i + 1]]);
  if (zoom <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [z0, v0] = stops[i - 1];
    const [z1, v1] = stops[i];
    if (zoom <= z1) return v0 + ((v1 - v0) * (zoom - z0)) / (z1 - z0);
  }
  return stops[stops.length - 1][1];
}

// The overview level the renderer loads for a raster-dem source at this zoom,
// the same rounding mapbox-gl uses to pick a tile.
export function demZoomFor(renderZoom: number, dem: DemSource): number {
  const level = Math.round(renderZoom + Math.log2(512 / dem.tileSize));
  return Math.max(dem.minzoom, Math.min(dem.maxzoom, level));
}

export class Dem {
  cache = new Map<string, Promise<Tile>>();
  source: DemSource;
  token: string;

  constructor(source: DemSource, token: string) {
    this.source = source;
    this.token = token;
  }

  // Meters above sea level, bilinear between the four nearest DEM samples.
  async elevation(lng: number, lat: number, zoom: number): Promise<number> {
    const z = demZoomFor(zoom, this.source);
    const n = 2 ** z;
    const x = ((lng + 180) / 360) * n;
    const s = Math.sin((lat * Math.PI) / 180);
    const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    const tile = await this.tile(z, Math.floor(x), Math.floor(y));
    return tile.sample((x - Math.floor(x)) * 512, (y - Math.floor(y)) * 512);
  }

  // Meters per pixel of the sampled DEM there, so callers can say how coarse a
  // reading is.
  resolution(lat: number, zoom: number): number {
    return (CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** demZoomFor(zoom, this.source));
  }

  tile(z: number, x: number, y: number): Promise<Tile> {
    const key = `${z}/${x}/${y}`;
    let pending = this.cache.get(key);
    if (!pending) {
      pending = this.fetchTile(z, x, y);
      this.cache.set(key, pending);
    }
    return pending;
  }

  async fetchTile(z: number, x: number, y: number): Promise<Tile> {
    const url = this.source.tiles[0]
      .replace("{z}", String(z))
      .replace("{x}", String(x))
      .replace("{y}", String(y))
      .replace(/access_token=[^&]*/, `access_token=${this.token}`);
    const withToken = url.includes("access_token=") ? url : `${url}${url.includes("?") ? "&" : "?"}access_token=${this.token}`;
    const res = await fetch(withToken, { signal: AbortSignal.timeout(15000) });
    if (res.status === 404 || res.status === 422) return Tile.flat(); // no DEM there, which is sea level
    if (!res.ok) throw new Error(`DEM ${z}/${x}/${y}: HTTP ${res.status}`);
    return new Tile(decodePng(Buffer.from(await res.arrayBuffer())));
  }
}

type Raster = { width: number; height: number; channels: number; pixels: Buffer };

class Tile {
  border: number;
  raster: Raster;

  constructor(raster: Raster) {
    this.raster = raster;
    this.border = (raster.width - 512) / 2;
    if (!Number.isInteger(this.border) || this.border < 0) throw new Error(`DEM tile is ${raster.width} px wide, which is not 512 plus a border`);
  }

  static flat(): Tile {
    // 512 px of zero elevation: -10000 + 100000 * 0.1 encodes 0 m.
    const pixels = Buffer.alloc(512 * 512 * 3);
    for (let i = 0; i < 512 * 512; i++) {
      pixels[i * 3] = 1;
      pixels[i * 3 + 1] = 134;
      pixels[i * 3 + 2] = 160;
    }
    return new Tile({ width: 512, height: 512, channels: 3, pixels });
  }

  sample(px: number, py: number): number {
    const fx = px - 0.5;
    const fy = py - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = this.at(x0, y0);
    const b = this.at(x0 + 1, y0);
    const c = this.at(x0, y0 + 1);
    const d = this.at(x0 + 1, y0 + 1);
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }

  at(x: number, y: number): number {
    const { width, height, channels, pixels } = this.raster;
    const ix = Math.max(0, Math.min(width - 1, x + this.border));
    const iy = Math.max(0, Math.min(height - 1, y + this.border));
    const i = (iy * width + ix) * channels;
    return -10000 + (pixels[i] * 65536 + pixels[i + 1] * 256 + pixels[i + 2]) * 0.1;
  }
}

// Just enough PNG for Mapbox DEM tiles: 8-bit RGB or RGBA, not interlaced.
export function decodePng(buf: Buffer): Raster {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("DEM tile is not a PNG");
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  for (let at = 8; at + 8 <= buf.length; ) {
    const length = buf.readUInt32BE(at);
    const type = buf.toString("ascii", at + 4, at + 8);
    const body = buf.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      const color = body[9];
      if (depth !== 8) throw new Error(`DEM tile is ${depth}-bit, expected 8`);
      if (color !== 2 && color !== 6) throw new Error(`DEM tile color type ${color}, expected 2 or 6`);
      if (body[12] !== 0) throw new Error("DEM tile is interlaced");
      channels = color === 2 ? 3 : 4;
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    at += 12 + length;
  }
  if (!width || !channels) throw new Error("DEM tile has no IHDR");
  return { width, height, channels, pixels: unfilter(inflateSync(Buffer.concat(idat)), width, height, channels) };
}

function unfilter(raw: Buffer, width: number, height: number, channels: number): Buffer {
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = prior ? prior[i] : 0;
      const c = prior && i >= channels ? prior[i - channels] : 0;
      const x = line[i];
      row[i] =
        filter === 0 ? x
        : filter === 1 ? x + a
        : filter === 2 ? x + b
        : filter === 3 ? x + ((a + b) >> 1)
        : filter === 4 ? x + paeth(a, b, c)
        : (() => { throw new Error(`DEM tile row ${y} uses filter ${filter}`); })();
    }
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${url.replace(/access_token=[^&]*/, "access_token=…")}: HTTP ${res.status}`);
  return res.json();
}
