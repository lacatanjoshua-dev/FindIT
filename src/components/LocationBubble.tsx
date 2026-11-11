import type { FC } from 'react';

import { IonIcon } from '@ionic/react';
import { locationOutline, openOutline } from 'ionicons/icons';

import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { TILE_ATTRIBUTION, TILE_URL, googleMapsUrl, pinIcon } from './mapConfig';
import './Location.css';

type LocationBubbleProps = {
  lat: number;
  lng: number;
  label: string;
  mine: boolean;
};

// A small, non-movable map shown inside a chat bubble.
// Tapping it opens the spot in Google Maps for directions.
const LocationBubble: FC<LocationBubbleProps> = ({ lat, lng, label, mine }) => {
  const url = googleMapsUrl(lat, lng);

  return (
    <div className={`location-bubble ${mine ? 'location-bubble-mine' : ''}`}>
      <div className="location-bubble-map">
        <MapContainer
          center={{ lat, lng }}
          zoom={17}
          style={{ width: '100%', height: '100%' }}
          dragging={false}
          zoomControl={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          touchZoom={false}
          boxZoom={false}
          keyboard={false}
        >
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
          <Marker position={{ lat, lng }} icon={pinIcon} interactive={false} />
        </MapContainer>

        <a
          className="location-bubble-overlay"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open this location in Google Maps"
        />
      </div>

      <a
        className="location-bubble-info"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <IonIcon icon={locationOutline} />
        <span className="location-bubble-text">
          <strong>{label || 'Shared location'}</strong>
          <small>Open in Google Maps</small>
        </span>
        <IonIcon icon={openOutline} className="location-bubble-open" />
      </a>
    </div>
  );
};

export default LocationBubble;