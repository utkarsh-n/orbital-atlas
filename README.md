# Space Age · Orbital Atlas

A separate, local p5.js solar-system instrument. The original phosphor dashboard on port 3000 is untouched.

```sh
npm start       # http://localhost:3001/
npm test        # numerical regression suite; no network required
npm run build   # self-contained static output in dist/
```

No installation is needed: p5 is vendored with its license. The local server uses only Node built-ins, binds to loopback, and accepts a `PORT` environment variable. Nothing is published or registered with Sites.

## Physical model

The ten moving markers are Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto, and Earth’s Moon. States come from JPL Horizons, retrieved October 2, 2026. The supported interval runs from January 1, 1900 through December 31, 2100. Planetary coordinates are geometric heliocentric J2000 ecliptic; the Moon cache is Earth-centered in the same frame, without light-time or aberration corrections. Outer planets and Pluto use system barycenters, explicitly disclosed in the interface. Time is Horizons UT: UT1 before 1962, UTC afterward, with unknown future leap seconds.

`src/physics.js` evaluates the position at an arbitrary supported instant by cubic Hermite interpolation of adjacent JPL positions and velocities. For normalized interval time u and interval length h:

```
r(u) = (2u³ − 3u² + 1)r₀ + (u³ − 2u² + u)h v₀
     + (−2u³ + 3u²)r₁ + (u³ − u²)h v₁
v(u) = (1/h) dr/du
```

This is a date-locked, perturbed numerical ephemeris, not an exact closed-form law for all spacetime. Ellipse guides are instantaneous osculating conics derived from each state and JPL gravitational constants; they do not drive motion. The Moon uses JPL DE441 Earth-centered vectors sampled every six hours. Its osculating guide uses Earth + Moon gravity; its main-map position adds the Earth-relative vector to Earth’s position. In Atlas spacing that vector is uniformly enlarged, preserving direction and orbital shape. True AU preserves the physical separation. The inset always shows a physical Earth-centered orbit from ecliptic north.

## Moon phase

The phase panel reads the same timeline as the planet map, in every view. With Earth heliocentric position E and Moon geocentric position M, the Moon-to-Sun vector is −(E+M) and the Moon-to-Earth vector is −M. The illuminated fraction is `(1 + cos(phase angle)) / 2`. Waxing and waning follow the difference between lunar and solar geocentric ecliptic longitudes. Phase labels name the nearest primary phase within 4 degrees, otherwise crescent or gibbous. The schematic’s illuminated area follows spherical terminator geometry; it does not simulate eclipses, lunar surface features, or local sky orientation. Twelve published USNO 2026 phase events are covered by the regression suite.

## Views and scale

- 2D projects onto the ecliptic; 3D preserves inclination.
- 4D projects x, y, z, time worldlines.
- 5D is a presentation label for cylinder, torus, and phase-track lenses, not an additional measured spatial dimension.
- Torus closure is an explicitly marked display join.
- Atlas spacing uniformly rescales each orbit. True AU applies one common distance scale. Body glyph sizes are always artistically compressed. Numeric readouts always use physical coordinates.

Drag/touch rotates every view; arrows rotate; Home resets; plus/minus zoom. Space controls playback outside form controls. Dates, rates, stepping, direction, selection, and visibility controls use the same shared state. Reduced-motion preferences suppress control animations.

## Data and verification

`public/ephemeris/*.bin` stores little-endian Float64 records `[x,y,z,vx,vy,vz]` in AU and AU/day. The manifest records timestamps, cadence, sources, and request provenance. `data/` retains detailed reports; `tests/` contains 772 independently requested JPL reference states (540 planetary + 232 lunar).

The observed maximum interpolation residual in those checks was 46.12 km, including leap-second intervals; the Moon’s maximum was 0.917 km around leap-second intervals (19.51 m at ordinary sampled epochs). These are sampled reconstruction errors, not universal bounds or the underlying ephemeris uncertainty. Tests also cover derivatives, endpoint reproduction, date validation, orbital geometry, lunar phase, projection, and camera framing.

The browser uses bundled data and makes no NASA API calls. `scripts/fetch-ephemeris.py` downloads planetary caches sequentially when files are missing. Moon provenance is in `data/moon-meta.json`; `scripts/fetch-moon.py` refreshes its cache.

Sources: [Horizons](https://ssd.jpl.nasa.gov/horizons/), [API specification](https://ssd-api.jpl.nasa.gov/doc/horizons.html), [reference frames and timescales](https://ssd.jpl.nasa.gov/horizons/manual.html), [JPL constants](https://ssd.jpl.nasa.gov/astro_par.html), [NASA Moon phases](https://science.nasa.gov/moon/moon-phases/), [USNO phase definitions](https://aa.usno.navy.mil/faq/moon_phases).


## Celestial layers

The Zodiac control selects tropical mean signs or the explicitly chosen Lahiri mean sidereal convention. Both have twelve equal 30-degree sectors, distinct from unequal IAU constellation boundaries. The IAU 2006 frame transform uses adapted SOFA mathematics and includes the [SOFA license](public/vendor/SOFA-LICENSE.txt). Its independent C-library comparison fixtures are in `tests/zodiac-references.json`. Lahiri mean is anchored to the Indian Astronomical Ephemeris J2000 value 23°51′25.53″ and advanced with IAU 2006 precession (about 0.13 arcsecond from IMD's printed 2026 value).

Sun/Moon zodiac and calendar readings are geocentric geometric mean longitudes of date. The zodiac ring and eternal markers retain a spatial compass layout in every time lens. The heliocentric map's zodiac ring is an angular reference, not an Earth-observer planetary sign chart. Tithi, paksha, nakshatra and pada follow the Positional Astronomy Centre definitions. Event buttons solve angular crossings with bounded bisection and never extrapolate the cached interval. These are geometric estimates, not apparent almanac events; government fixture comparisons use a 15-minute tolerance. Solar and lunar phase wheels share the same simulation time. Sunrise-based daily panchang, regional lunar-month conventions and festival rules are not inferred.

Sample A (1 January 2000, UTC+05:30) and Sample B (1 July 2001, UTC−06:00) are wholly synthetic example profiles for symbolic persistent birth-sky nodes. They do not describe real people. Local noon is the default estimate; editable birth times refine both the markers and their readings. Full local-day Moon/nakshatra ranges are shown while time is unknown. Markers use geocentric birth-Sun directions and artistic radius; they appear at all simulation dates. The quantum tether, mandala and Seed of Life are visual symbolism, not a physical entanglement or measured galactic-location model.

The separate traditional-timescale slider follows a declared Hindu chronology, anchored to PAC's Kali epoch: midnight IST beginning 18 February 3102 BCE proleptic Julian (JD UT 588465.2708333334). The 4:3:2:1 yugas form a 4.32-million-year mahayuga; 71 form a manvantara; 14 manvantaras plus 15 intervening sandhyas form a 4.32-billion-year kalpa. The current cycle nesting is seventh Manvantara, 28th Mahayuga. Huge BCE/CE labels are approximate year arithmetic; conversion from the modern timeline uses a nominal 365.25-day display year. The cosmological slider never moves the astronomical model outside 1900–2100.

References: [PAC calendar definitions](https://packolkata.imd.gov.in/panchang/en/explanation), [IMD IAE2026](https://packolkata.imd.gov.in/download/IAE2026.zip), [IAU SOFA](https://www.iausofa.org/2023-10-11c), [Bhagavata cycle lengths](https://vedabase.io/en/library/sb/3/11/19/), [traditional cycle nesting](https://vedabase.io/en/library/cc/adi/3/9/).


## Public snapshot

See [PUBLICATION.md](PUBLICATION.md) for publication exclusions and setup requirements.
