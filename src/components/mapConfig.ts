import L from 'leaflet';
import type { LatLngLiteral } from 'leaflet';

// Where the map starts if the phone's location is not available.
// Palitan mo ito ng coordinates ng campus ninyo (i-right click sa Google Maps
// para makopya ang lat, lng).
export const DEFAULT_CENTER: LatLngLiteral = { lat: 14.5995, lng: 120.9842 };
export const DEFAULT_ZOOM = 16;
export const PICKED_ZOOM = 17;

// Free OpenStreetMap tiles. No API key needed. The attribution is required.
export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Teal pin drawn with SVG, so there are no missing marker images with Vite.
export const pinIcon = L.divIcon({
  className: 'findit-map-pin',
  html: `
    <svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 1C8.2 1 1 8 1 16.7 1 28.5 17 43 17 43s16-14.5 16-26.3C33 8 25.8 1 17 1z"
            fill="#0f766e" stroke="#ffffff" stroke-width="2"/>
      <circle cx="17" cy="16.5" r="6" fill="#ffffff"/>
    </svg>`,
  iconSize: [34, 44],
  iconAnchor: [17, 43],
});

export const googleMapsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export type SharedLocation = {
  lat: number;
  lng: number;
  label: string;
};