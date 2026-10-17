---
name: flyover
description: Turn a text description or an existing path into a cinematic 3D map flyover. Produces a GeoJSON list of camera waypoints and a self-contained HTML page that animates them with Mapbox GL JS, using the token in MAPBOX_ACCESS_TOKEN. Use whenever the user asks for a flyover, fly-through, drone shot, aerial tour, orbit around a landmark, camera path, or animated map of a place, route, or region, or wants to fly along a GPS track, GPX, KML, or GeoJSON file, even if they never say "Mapbox" or "map". Also use when they want to tweak an existing flyover's speed, altitude, path, or mood.
---

# Flyover

You are the drone pilot and the editor. The user names a place, a route, or
a file with a track, and a mood. You choose the shot, write the waypoints,
build the page, and open it.

Output is two files next to each other, in the working directory unless the
user names another place:

- `<slug>.geojson`, the flight. Format in `references/waypoints.md`.
- `<slug>.html`, built from `assets/template.html` by `scripts/build.ts`.

The page is the map, the camera path, Space to pause, one button that records
the flight to a video file, and a labelled bar that tracks the warm-up before
frame one. A title card, captions, a progress bar for the flight itself, or
controls are for the user to ask for. Offer them at the end and never bake
them in.

The page carries no token. It reads `access_token` from its URL, asks for one
when the URL has none, and puts what it is given back in the URL. The style is
Mapbox Standard with default options. The build prints the link.

The page draws into a fixed 1280 by 720 frame that CSS scales to the window,
letterboxed. That size is what makes the flight predictable: the zoom the
camera reaches depends on the frame's height, so a fixed frame lets the build
compute every zoom before the page loads, and the recorded video is that size
on every machine.

## Workflow

1. Read the brief in this order, because each answer constrains the next:
   subject, then the one camera move, then speed, then mood. Decide as a
   pilot would instead of asking. Default length is 45 seconds.
2. Get coordinates. Use what you know for famous places. When unsure,
   geocode:

   ```bash
   curl -s "https://api.mapbox.com/search/geocode/v6/forward?q=Bethesda+Terrace+Central+Park&limit=1&access_token=$MAPBOX_ACCESS_TOKEN" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).features[0].geometry.coordinates))'
   ```

   Geocoding returns wrong hits for small park features. Sanity-check every
   result against the coordinates you already know. Keep the token in the
   shell variable. Its value belongs only in the link the build prints.
3. Design the shot and write `<slug>.geojson`. See "Designing the shot".
   When the path already exists as a file, see "Flying an existing path".
4. Build and read the report:

   ```bash
   node <skill-dir>/scripts/build.ts <slug>.geojson
   ```

   The build reads the style's DEM, solves each waypoint's ground, altitude,
   pitch, and zoom against each other until they agree, and bakes the result
   into the page, so the page runs no terrain queries and flies the same path
   every time. `MAPBOX_ACCESS_TOKEN` must be set or the build stops.

   The report prints one line per waypoint with ground elevation, absolute
   camera altitude, pitch, and the zoom it will render at, then one line per
   leg with speed, time, altitude, and turn angle. It warns about hairpins,
   speed out of proportion to altitude, buildings within 150 m, terrain the
   camera passes within 100 m of, a `lookAt` that sits below a nearby summit,
   and waypoints that render where Standard has flattened the terrain. You
   cannot watch the result, so read the report instead. Fix every warning
   unless the brief asked for that exact thing, then rebuild. The last line
   is the link, token included.
5. Open the link: `open "<link>"`. If the page stays black, the browser is
   blocking tile workers on `file://`. Serve the folder instead with
   `python3 -m http.server 8765` and use the same query string.
6. Look at the result. Drive the page with a browser tool, wait for the
   fade-in, and screenshot it. The report cannot tell you that the frame is
   empty, flat, or pointed at sky.
7. Report the two paths and the link, describe the flight in two sentences,
   and say that editing the GeoJSON and rerunning the build changes the
   flight. Mention that the page's button downloads the flight as a video.
   Offer overlays as the follow-up if they would help. Skip the Artifact
   tool. Its sandbox blocks Mapbox requests, so the page renders black
   there.

## Designing the shot

### One move, done well

Name the move before placing a single waypoint. A flight with one clear
move reads as a film. A flight that tries three moves reads as a screensaver.

| Move | How | Good for |
| --- | --- | --- |
| Orbit | `scripts/orbit.ts` around the subject, one altitude, every waypoint looks at it. Eight or more points, or it turns into a polygon. | A landmark, a stadium, a bridge. |
| Reveal | Start low and close behind a detail, rise and pull back until the whole subject is in frame. | A park, a campus, a district. |
| Tracking | Waypoints along a street, river, or ridge, no `lookAt`, so the camera looks ahead. | Routes, valleys, coastlines. |
| Approach | Start far and high, descend toward the subject, `hold` at the end. | An arrival, a hero shot. |
| Pass-by | Straight line past the subject, `lookAt` fixed on it, so it pans across the frame. | Skylines, waterfronts. |

Put one bold move in each flight, such as a long bearing sweep, a dive, or
a climb. Keep the rest of the flight quiet.

### Frame one

The viewer watches the first second more than any other. The page fades in
with the camera already at cruise speed, so the first waypoint sets the
opening:

- The subject is in frame and nothing stands between camera and target.
  Start over open ground: water, a park, a plaza, a wide avenue. Over a
  downtown, start above the tallest building within 150 m by 100 m or more.
  The build report tells you when you are below a roof.
- The camera is already moving in the direction the flight will keep.
  Do not `hold` on the first waypoint.
- The target is within about ten altitudes. Farther, and the pitch clamps at
  85 degrees and the frame becomes sky.

### Speed

Speed is the first thing viewers feel and the first thing briefs mention.
Set `speed` in m/s whenever the brief says anything about pace, and use
`duration` only when it names a length.

| Brief says | Cruise speed | Ramp | Holds |
| --- | --- | --- | --- |
| calm, slow, cinematic, night | altitude / 8 | 2000 ms | one or two, up to 2 s |
| nothing about pace | altitude / 5 | 1500 ms | at most one |
| dynamic, fast, energetic, drone racing | altitude / 3 | 800 ms | none |

Altitude is the lowest waypoint altitude on the leg. Per-waypoint `speed`
changes pace mid-flight. A fast pass that slows into an orbit is a stronger
shot than one constant speed.

| Scene | Altitude |
| --- | --- |
| Landmark orbit | 150 to 400 m, radius about 1.5 times the altitude |
| City district | 250 to 600 m |
| Street canyon | 60 to 120 m, over a wide avenue or river only |
| Mountains, coast | 3000 to 5000 m, 12 km or more from the subject |
| Country, region | 10 to 60 km |

### Terrain and the zoom band

Standard draws terrain at full height between z7 and z12 and ramps it to
nothing by z13.7. A waypoint does not set the zoom. Mapbox GL derives it from
how far the camera sits above the point it looks at:

```
above = camera altitude - target altitude, in meters
above >= 20600 * cos(pitch) * cos(latitude)    keeps the waypoint at z12
```

A camera 1500 m above a summit, 14 km away, pitched 84 degrees, renders at
z12 with the mountain at its full height. Move that camera to 500 m above the
summit and 3 km away and it renders at z14, where Standard draws no terrain
and the peak becomes a flat map. The hero shot from a peak's own height is
not available on Standard. The shot that is available is high, far, and
nearly horizontal, and the pitch clamps at 85 degrees.

Flying lower is what a city asks for and terrain there is flat anyway, so the
band only binds in mountains. The build prints the zoom per waypoint and the
climb that would bring it back into the band.

### Motion that feels real

- Constant speed inside a leg, ramps only where speed changes or the camera
  stops. The velocity model does this for you. Do not fake it with extra
  waypoints.
- Nothing pops. Before frame one the page flies the whole path once with the
  map hidden, so every tile is in the cache when the flight starts. That
  warm-up costs roughly a second per kilometer of path: a 49 km flight waits
  about 43 seconds before it begins. Do not shorten a flight to dodge the
  wait, and do not report the wait as a hang. It is also what keeps the
  recorded video free of popping terrain.
- Nothing stops dead. A `hold` decelerates over one ramp and accelerates
  out over another. The flight ends with the same deceleration.
- Ease-out, never ease-in. The flight is at full speed on frame one and
  slows into its ending. A flight that starts slow feels sluggish for its
  whole length.
- Pair two motions. A pass-by that climbs while it pans, an orbit that
  gains 50 m per quarter turn, an approach that slows as it descends.
- Match the personality. A night skyline is slow and level. A sports venue
  is fast with sharp ramps. A national park is high, slow, and wide.
- With `prefers-reduced-motion` the page shows frame one and waits for
  Space.

### Flying an existing path

The user may hand you a GPX, KML, TCX, CSV, or GeoJSON LineString with a
hike, a ride, a road trip, or a race course. The skill has no importer. Read
the file yourself and write the waypoint format from
`references/waypoints.md`.

- Read the coordinates yourself and note the length. A track has hundreds of
  points; a flight wants 8 to 20 waypoints. Keep the first and the last,
  then keep points spaced evenly by distance, and add one at each real
  change of direction. Drop everything else. GPS jitter becomes wobble if
  you keep it.
- The track is the subject, so use the Tracking move: no `lookAt`, the
  camera looks ahead along the path. A `lookAt` on a summit or a finish
  line is the one exception.
- Altitude is above ground, so a mountain track and a city ride take the
  same numbers. Pick from the scene table: a trail at 150 to 400 m, a road
  trip at 600 to 2000 m.
- Let speed come from `duration` unless the brief says otherwise. A 40 km
  ride in 45 s reads as a helicopter; a 2 km walk in 45 s reads as a drone.
- Recorded tracks follow every bend of the road or trail. Widen hairpins
  as the report suggests and skip sections that double back.

### Spacing

Space waypoints evenly along the path, so the spline stays smooth. Two
waypoints closer than a fifth of the others make the camera wobble. A turn
sharper than 100 degrees between waypoints overshoots; add a waypoint or
widen the turn. The report flags both.

`lookAt` moves too. Interpolating the target from one landmark to the next
pans the camera. Sliding the target from far to near as the drone descends
tilts it down. A target with altitude, such as a tower top at
`[lng, lat, 300]`, keeps the horizon out of the frame.

## Mistakes to avoid

- A building in front of the lens. Raise the camera or move over open
  ground. Never accept a clearance warning on the first waypoint.
- Ignoring a speed word in the brief. "Dynamic" means altitude / 3 and no
  holds, whatever the default says.
- Holds everywhere. Each stop resets the viewer's attention. One is a beat,
  three is a slideshow.
- Editing `template.html` for one flight. Change the GeoJSON. Change the
  template only when every future flyover needs the change.
- Adding UI. The page has one button. Offer more, do not ship them.
- Flying a mountain close and low. It lands above z13.7, where Standard
  draws no terrain, and the peak renders flat. Climb and pull back until the
  report says z12, and never add terrain settings to the page.
- Aiming a target at a peak's name rather than its top. Geocoders and
  well-known coordinates land on a shoulder or a hut, hundreds of meters
  below the summit, and the shot frames the slope. The build names the higher
  point when it finds one.
- Changing the style or the light preset. The page renders Standard as it
  ships.
