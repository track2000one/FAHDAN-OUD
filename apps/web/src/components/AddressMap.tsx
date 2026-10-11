import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CheckCircle2, LocateFixed, MapPin, RotateCcw } from 'lucide-react';

setWorkerUrl(workerUrl);

type Coordinates = { latitude: number; longitude: number };
type AddressMapProps = {
  latitude: number | null;
  longitude: number | null;
  onChange: (coordinates: Coordinates | null) => void;
};

const START_CENTER: [number, number] = [46.6753, 24.7136];
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const isSelected = (lat: number | null, lng: number | null) =>
  lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);
const round = (value: number) => Math.round(value * 1e6) / 1e6;

export function AddressMap({ latitude, longitude, onChange }: AddressMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    const hasSavedLocation = isSelected(latitude, longitude);
    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL,
      center: hasSavedLocation ? [longitude!, latitude!] : START_CENTER,
      zoom: hasSavedLocation ? 16 : 5,
      attributionControl: true,
      maxZoom: 19,
      dragRotate: false,
      pitchWithRotate: false
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-left');
    map.on('load', () => setMapReady(true));
    map.on('click', e => {
      onChangeRef.current({ latitude: round(e.lngLat.lat), longitude: round(e.lngLat.lng) });
    });
    map.on('error', () => {
      setError(prev => prev || 'تعذر تحميل بعض أجزاء الخريطة. يمكنك حفظ العنوان يدويًا أو المحاولة لاحقًا.');
    });
    return () => {
      mapRef.current = null;
      markerRef.current = null;
      map.remove();
    };
    // Keep map instance alive while customer edits the selected pin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!isSelected(latitude, longitude)) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const position: [number, number] = [longitude!, latitude!];
    if (!markerRef.current) {
      const marker = new Marker({ color: '#213e2f', draggable: true })
        .setLngLat(position)
        .addTo(map);
      marker.on('dragend', () => {
        const point = marker.getLngLat();
        onChangeRef.current({ latitude: round(point.lat), longitude: round(point.lng) });
      });
      markerRef.current = marker;
    } else markerRef.current.setLngLat(position);
    if (map.getZoom() < 12 || !map.getBounds().contains(position)) {
      map.flyTo({ center: position, zoom: 16, essential: true });
    }
  }, [latitude, longitude]);

  function locate() {
    setError('');
    if (!navigator.geolocation) {
      setError('المتصفح لا يدعم تحديد الموقع. يمكنك اختيار موقع منزلك بالنقر على الخريطة.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocating(false);
        const latitude = round(position.coords.latitude);
        const longitude = round(position.coords.longitude);
        onChangeRef.current({ latitude, longitude });
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 17, essential: true });
      },
      err => {
        setLocating(false);
        setError(err.code === 1
          ? 'تم رفض إذن الموقع. يمكنك تحديد منزلك بالنقر على الخريطة.'
          : err.code === 2
            ? 'تعذر تحديد موقع الجهاز. اختر المكان يدويًا.'
            : 'استغرق تحديد الموقع وقتًا أطول من المتوقع. اختر المكان يدويًا.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  const selected = isSelected(latitude, longitude);
  return <section className="account-map-section" aria-label="تحديد موقع عنوان الشحن على الخريطة">
    <div className="account-map-heading">
      <div>
        <h4><MapPin size={18}/> تحديد موقع المنزل على الخريطة <span>(اختياري)</span></h4>
        <p>اضغط على موقع منزلك في الخريطة أو اسحب الدبوس إلى باب المبنى.</p>
      </div>
      <button type="button" className="account-map-locate" onClick={locate} disabled={locating}>
        <LocateFixed size={17}/>{locating ? 'جارٍ تحديد موقعك…' : 'موقعي الحالي'}
      </button>
    </div>
    <div className="account-map-frame">
      <div className="account-map-canvas" ref={containerRef} aria-label="خريطة تفاعلية لتحديد موقع المنزل"/>
      {!mapReady && <span className="account-map-loading">جارٍ تحميل خريطة الأحياء والشوارع…</span>}
    </div>
    {error && <p className="account-map-error" role="alert">{error}</p>}
    <div className="account-map-meta">
      {selected ? <div className="account-map-selected">
        <CheckCircle2 size={18}/>
        <span>تم تحديد موقع التوصيل <small dir="ltr">{latitude!.toFixed(6)}, {longitude!.toFixed(6)}</small></span>
        <button type="button" onClick={() => onChange(null)}><RotateCcw size={15}/> مسح التحديد</button>
      </div> : <p>لم تحدد موقعًا بعد. يمكنك حفظ العنوان اليدوي دون تحديد موقع على الخريطة.</p>}
      <small>الخرائط من OpenFreeMap وبيانات OpenStreetMap. راجع بيانات الشارع والحي يدويًا قبل الحفظ.</small>
    </div>
  </section>;
}
