import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import { CheckCircle2, LocateFixed, MapPin, RotateCcw } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

type Coordinates = { latitude:number; longitude:number };
type AddressMapProps = {
  latitude:number|null;
  longitude:number|null;
  onChange:(coordinates:Coordinates|null)=>void;
};
const defaultCenter:L.LatLngExpression=[24.7136,46.6753];
const hasPoint=(lat:number|null,lng:number|null):lat is number=>
  lat!==null&&lng!==null&&Number.isFinite(lat)&&Number.isFinite(lng);

const pointIcon=L.divIcon({
  className:'fahdan-leaflet-marker',
  html:'<span class="fahdan-leaflet-pin"></span>',
  iconSize:[32,40],iconAnchor:[16,37]
});
const coordinate=(value:number)=>Math.round(value*1e6)/1e6;

export function AddressMap({latitude,longitude,onChange}:AddressMapProps) {
  const containerRef=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<L.Map|null>(null);
  const markerRef=useRef<L.Marker|null>(null);
  const onChangeRef=useRef(onChange);
  const [locating,setLocating]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{onChangeRef.current=onChange;},[onChange]);

  useEffect(()=>{
    const element=containerRef.current;
    if(!element)return;
    const selected=hasPoint(latitude,longitude);
    const map=L.map(element,{zoomControl:true,scrollWheelZoom:false});
    mapRef.current=map;
    map.setView(selected?[latitude!,longitude!]:defaultCenter,selected?16:5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      maxZoom:19
    }).addTo(map);
    map.on('click',e=>{
      onChangeRef.current({latitude:coordinate(e.latlng.lat),longitude:coordinate(e.latlng.lng)});
    });
    const timer=window.setTimeout(()=>map.invalidateSize(),150);
    return()=>{
      window.clearTimeout(timer);
      map.off();
      map.remove();
      mapRef.current=null;
      markerRef.current=null;
    };
    // Map is initialized once per address form; changed coordinates update its marker below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    const map=mapRef.current;
    if(!map)return;
    if(!hasPoint(latitude,longitude)) {
      markerRef.current?.remove();
      markerRef.current=null;
      return;
    }
    const position:L.LatLngExpression=[latitude,longitude!];
    if(!markerRef.current) {
      const marker=L.marker(position,{icon:pointIcon,draggable:true,title:'موقع التوصيل — اسحب الدبوس لتعديله'}).addTo(map);
      marker.on('dragend',()=>{
        const latlng=marker.getLatLng();
        onChangeRef.current({latitude:coordinate(latlng.lat),longitude:coordinate(latlng.lng)});
      });
      markerRef.current=marker;
    } else markerRef.current.setLatLng(position);
    if(!map.getBounds().contains(position)||map.getZoom()<12)map.setView(position,16);
  },[latitude,longitude]);

  function locate(){
    setError('');
    if(!navigator.geolocation){
      setError('المتصفح لا يدعم تحديد الموقع. يمكنك النقر على الخريطة بدلًا من ذلك.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      position=>{
        setLocating(false);
        const latitude=coordinate(position.coords.latitude);
        const longitude=coordinate(position.coords.longitude);
        onChangeRef.current({latitude,longitude});
        mapRef.current?.setView([latitude,longitude],17);
      },
      err=>{
        setLocating(false);
        setError(err.code===1?'لم يتم السماح بالوصول إلى الموقع. يمكنك اختيار منزلك بالنقر على الخريطة.':
          err.code===2?'تعذر العثور على موقع الجهاز. جرّب تحديده يدويًا من الخريطة.':
          'استغرق تحديد الموقع وقتًا أطول من المتوقع. يمكنك تحديد الموقع يدويًا.');
      },
      {enableHighAccuracy:true,timeout:12000,maximumAge:60000}
    );
  }

  const selected=hasPoint(latitude,longitude);
  return <section className="account-map-section" aria-label="تحديد موقع عنوان الشحن على الخريطة">
    <div className="account-map-heading">
      <div>
        <h4><MapPin size={18}/> تحديد موقع المنزل على الخريطة <span>(اختياري)</span></h4>
        <p>اضغط على موقع منزلك في الخريطة أو اسحب الدبوس إلى باب المبنى.</p>
      </div>
      <button type="button" className="account-map-locate" onClick={locate} disabled={locating}>
        <LocateFixed size={17}/>{locating?'جارٍ تحديد موقعك…':'موقعي الحالي'}
      </button>
    </div>
    <div className="account-map-frame">
      <div className="account-map-canvas" ref={containerRef} aria-label="خريطة تفاعلية لتحديد موقع المنزل"/>
    </div>
    {error&&<p className="account-map-error" role="alert">{error}</p>}
    <div className="account-map-meta">
      {selected?<div className="account-map-selected">
        <CheckCircle2 size={18}/>
        <span>تم تحديد موقع التوصيل <small dir="ltr">{latitude!.toFixed(6)}, {longitude!.toFixed(6)}</small></span>
        <button type="button" onClick={()=>onChange(null)}><RotateCcw size={15}/> مسح التحديد</button>
      </div>:<p>لم تحدد موقعًا بعد. يمكنك حفظ العنوان اليدوي دون تحديد موقع على الخريطة.</p>}
      <small>تعتمد الخريطة على OpenStreetMap؛ يُحفظ الدبوس مع عنوانك ولا يظهر للعملاء الآخرين. يُرجى مراجعة بيانات الشارع والحي يدويًا.</small>
    </div>
  </section>;
}
