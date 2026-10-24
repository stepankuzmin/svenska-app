#!/usr/bin/env node
// usage: node orbit.ts <lng> <lat> <radius-m> <altitude-m> [points=8] [start-bearing=0] [sweep=360]
//
// Prints Point features on a circle around the center, all looking at it.
// Paste them into the FeatureCollection, or pipe to a file and add properties.
const [lng, lat, radius, altitude, points = 8, start = 0, sweep = 360] = process.argv.slice(2).map(Number);

if ([lng, lat, radius, altitude].some(Number.isNaN)) {
  console.error("usage: orbit.ts <lng> <lat> <radius-m> <altitude-m> [points=8] [start-bearing=0] [sweep=360]");
  process.exit(1);
}

const metersPerDegLat = 111320;
const metersPerDegLng = metersPerDegLat * Math.cos((lat * Math.PI) / 180);
const fullCircle = sweep >= 360;
const count = fullCircle ? points + 1 : points;
const round = (n: number) => Number(n.toFixed(6));

const features = Array.from({ length: count }, (_, i) => {
  const bearing = ((start + (sweep * i) / (fullCircle ? points : points - 1)) * Math.PI) / 180;
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [round(lng + (radius * Math.sin(bearing)) / metersPerDegLng), round(lat + (radius * Math.cos(bearing)) / metersPerDegLat), altitude],
    },
    properties: { lookAt: [lng, lat] },
  };
});

console.log(JSON.stringify(features, null, 2));
