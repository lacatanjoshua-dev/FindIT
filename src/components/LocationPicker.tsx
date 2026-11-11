import { useRef, useState } from 'react';
import type { FC } from 'react';

import {
  IonButton,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react';

import { closeOutline, locateOutline, sendOutline } from 'ionicons/icons';

import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import type { LatLngLiteral, Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';

import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  PICKED_ZOOM,
  TILE_ATTRIBUTION,
  TILE_URL,
  pinIcon,
} from './mapConfig';
import type { SharedLocation } from './mapConfig';
import './Location.css';

type LocationPickerProps = {
  isOpen: boolean;
  sending: boolean;
  onClose: () => void;
  onSend: (location: SharedLocation) => void | Promise<void>;
};

// Moves the pin to wherever the user taps on the map.
const TapToPick: FC<{ onPick: (latLng: LatLngLiteral) => void }> = ({ onPick }) => {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });

  return null;
};

const LocationPicker: FC<LocationPickerProps> = ({
  isOpen,
  sending,
  onClose,
  onSend,
}) => {
  // The map is only drawn after the modal finished opening, otherwise
  // Leaflet measures a 0px box and only half of the tiles show.
  const [ready, setReady] = useState(false);
  const [position, setPosition] = useState<LatLngLiteral | null>(null);
  const [label, setLabel] = useState('');
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');

  const mapRef = useRef<LeafletMap | null>(null);

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setLocError('This device cannot share its location. Move the pin manually.');
      setPosition((current) => current ?? DEFAULT_CENTER);
      return;
    }

    setLocating(true);
    setLocError('');

    navigator.geolocation.getCurrentPosition(
      (result) => {
        const next = {
          lat: result.coords.latitude,
          lng: result.coords.longitude,
        };

        setPosition(next);
        mapRef.current?.setView(next, PICKED_ZOOM);
        setLocating(false);
      },
      (geoError) => {
        console.error('Geolocation error:', geoError);
        setLocating(false);
        setPosition((current) => current ?? DEFAULT_CENTER);
        setLocError(
          geoError.code === geoError.PERMISSION_DENIED
            ? 'Location permission was denied. Tap the map to place the pin.'
            : 'Could not get your location. Tap the map to place the pin.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const handleDidPresent = () => {
    setReady(true);
    locate();
  };

  const handleDidDismiss = () => {
    setReady(false);
    setPosition(null);
    setLabel('');
    setLocError('');
    setLocating(false);
    mapRef.current = null;
    onClose();
  };

  const handleSend = () => {
    if (!position || sending) {
      return;
    }

    void onSend({
      lat: Number(position.lat.toFixed(6)),
      lng: Number(position.lng.toFixed(6)),
      label: label.trim().slice(0, 80),
    });
  };

  return (
    <IonModal
      isOpen={isOpen}
      onDidPresent={handleDidPresent}
      onDidDismiss={handleDidDismiss}
    >
      <IonHeader className="findit-header">
        <IonToolbar>
          <IonTitle>Send location</IonTitle>

          <IonButton
            slot="end"
            fill="clear"
            aria-label="Close"
            onClick={onClose}
          >
            <IonIcon icon={closeOutline} />
          </IonButton>
        </IonToolbar>
      </IonHeader>

      <IonContent scrollY={false}>
        <div className="location-picker-map">
          {ready && (
            <MapContainer
              ref={mapRef}
              center={position ?? DEFAULT_CENTER}
              zoom={position ? PICKED_ZOOM : DEFAULT_ZOOM}
              style={{ width: '100%', height: '100%' }}
              whenReady={() => {
                setTimeout(() => mapRef.current?.invalidateSize(), 150);
              }}
            >
              <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />

              <TapToPick onPick={setPosition} />

              {position && (
                <Marker
                  position={position}
                  icon={pinIcon}
                  draggable
                  eventHandlers={{
                    dragend: (event) => {
                      const latLng = event.target.getLatLng();
                      setPosition({ lat: latLng.lat, lng: latLng.lng });
                    },
                  }}
                />
              )}
            </MapContainer>
          )}

          <div className="location-picker-hint">
            {locating
              ? 'Finding your location...'
              : locError || 'Tap the map or drag the pin to the meeting spot.'}
          </div>

          <button
            type="button"
            className="location-picker-locate"
            aria-label="Use my current location"
            onClick={locate}
            disabled={locating}
          >
            {locating ? (
              <IonSpinner name="crescent" />
            ) : (
              <IonIcon icon={locateOutline} />
            )}
          </button>
        </div>
      </IonContent>

      <IonFooter>
        <IonToolbar>
          <div className="location-picker-footer">
            <IonInput
              className="location-picker-label"
              value={label}
              maxlength={80}
              placeholder="Add a label (e.g. Library entrance)"
              onIonInput={(event) => setLabel(String(event.detail.value ?? ''))}
            />

            <IonButton
              className="location-picker-send"
              disabled={!position || sending}
              onClick={handleSend}
            >
              {sending ? (
                <IonSpinner name="crescent" />
              ) : (
                <>
                  <IonIcon icon={sendOutline} slot="start" />
                  Send
                </>
              )}
            </IonButton>
          </div>
        </IonToolbar>
      </IonFooter>
    </IonModal>
  );
};

export default LocationPicker;