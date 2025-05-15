// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiYXBodWFuZyIsImEiOiJjbWFvdTN0M3UwODMwMm1wdDZ4ZXk4d3B0In0.wUB6XIixjYSVn_aX0DcJTA';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

// Global function to get projected coordinates
function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}

map.on('load', async () => {
  // ─── Add Bike Lanes ───────────────────────────────
  const bikeLaneStyle = {
    'line-color': '#32D400',
    'line-width': 4,
    'line-opacity': 0.6,
  };

  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });

  map.addLayer({
    id: 'bike-lanes-boston',
    type: 'line',
    source: 'boston_route',
    paint: bikeLaneStyle,
  });

  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://data.cambridgema.gov/api/geospatial/y2fc-nnb2?method=export&format=GeoJSON',
  });

  map.addLayer({
    id: 'bike-lanes-cambridge',
    type: 'line',
    source: 'cambridge_route',
    paint: bikeLaneStyle,
  });

  // ─── Load Station Info ─────────────────────────────
  const svg = d3.select('#map').select('svg');
  let stations = [];

  try {
    const stationJson = await d3.json('https://gbfs.bluebikes.com/gbfs/en/station_information.json');
    stations = stationJson.data.stations;
  } catch (e) {
    console.error('Error loading station JSON:', e);
    return;
  }

  // ─── Load Traffic CSV ──────────────────────────────
  let trips = [];
  try {
    trips = await d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv');
  } catch (e) {
    console.error('Error loading CSV:', e);
    return;
  }

  // ─── Compute Departures and Arrivals ───────────────
  const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
  const arrivals = d3.rollup(trips, v => v.length, d => d.end_station_id);

  // ─── Annotate Stations with Traffic Data ───────────
  stations = stations.map((station) => {
    const id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });

  // ─── Radius Scale for Circles ──────────────────────
  const radiusScale = d3.scaleSqrt()
    .domain([0, d3.max(stations, d => d.totalTraffic)])
    .range([0, 25]);

  // ─── Draw Circles ──────────────────────────────────
  const circles = svg.selectAll('circle')
    .data(stations)
    .enter()
    .append('circle')
    .attr('fill', 'steelblue')
    .attr('stroke', 'white')
    .attr('stroke-width', 1)
    .attr('opacity', 0.6)
    .attr('r', d => radiusScale(d.totalTraffic))
    .style('pointer-events', 'auto') // Enable tooltip interaction
    .each(function (d) {
      d3.select(this)
        .append('title')
        .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
    });

  // ─── Update Circle Positions ───────────────────────
  function updatePositions() {
    circles
      .attr('cx', d => getCoords(d).cx)
      .attr('cy', d => getCoords(d).cy);
  }

  updatePositions();
  map.on('move', updatePositions);
  map.on('zoom', updatePositions);
  map.on('resize', updatePositions);
  map.on('moveend', updatePositions);
});