type Props = { kind:string; hero?:boolean };
export function ProductArt({kind,hero=false}:Props) {
  if (kind === 'GIFT_BOX') return <svg className="art-svg" viewBox="0 0 300 280" role="img" aria-label="رسم توضيحي لتغليف هدايا فهدان">
    <ellipse cx="155" cy="247" rx="103" ry="16" fill="#150b06" opacity=".2"/>
    <rect x="55" y="99" width="195" height="139" rx="10" fill="#172721" stroke="#C6A36C" strokeWidth="3"/>
    <rect x="47" y="90" width="211" height="43" rx="8" fill="#425848" stroke="#C6A36C" strokeWidth="3"/>
    <rect x="135" y="92" width="29" height="145" fill="#C29E67"/>
    <path d="M150 91C100 89 91 51 118 47c23-5 32 20 32 44ZM150 91c51-2 62-35 38-44-28-10-38 20-38 44" fill="none" stroke="#E2C995" strokeWidth="10"/>
    <path d="M108 180H190" stroke="#E2C995" strokeWidth="2"/><text x="150" y="174" textAnchor="middle" fill="#E2C995" fontSize="15" fontFamily="serif">FAHDAN</text>
  </svg>;
  if (kind === 'BAKHOOR') return <svg className="art-svg" viewBox="0 0 300 280" role="img" aria-label="رسم توضيحي لوعاء بخور">
    <path d="M138 109c-27-27 25-38 2-75M167 114c32-33-12-44 10-83M114 102c-17-14 8-33-4-49" stroke="#e3cbaa" strokeWidth="6" fill="none" opacity=".8" strokeLinecap="round"/>
    <ellipse cx="151" cy="174" rx="109" ry="36" fill="#865b3b"/>
    <path d="M44 175Q49 246 151 250Q252 246 258 175Z" fill="#38271f" stroke="#C6A36C" strokeWidth="4"/>
    <ellipse cx="151" cy="175" rx="104" ry="29" fill="#1b1b17"/>
    <g fill="#9b744b"><rect x="90" y="157" width="42" height="21" rx="4" transform="rotate(15 90 157)"/><rect x="142" y="151" width="45" height="23" rx="4" transform="rotate(-18 142 151)"/><rect x="186" y="168" width="38" height="22" rx="4" transform="rotate(25 186 168)"/></g>
    <path d="M105 221q45 27 91 0" stroke="#C6A36C" strokeWidth="3" fill="none"/>
  </svg>;
  if (kind === 'OUD_OIL') return <svg className="art-svg" viewBox="0 0 300 280" role="img" aria-label="رسم توضيحي لقارورة دهن العود">
    <ellipse cx="151" cy="244" rx="90" ry="13" fill="#150b06" opacity=".2"/>
    <rect x="132" y="28" width="37" height="45" rx="4" fill="#A98052"/><rect x="119" y="67" width="63" height="21" rx="4" fill="#D7B481"/>
    <rect x="76" y="84" width="150" height="156" rx="26" fill="#8C5C35" stroke="#E1BB87" strokeWidth="6"/>
    <rect x="94" y="102" width="115" height="121" rx="15" fill="#1D3228" stroke="#DFBB7C" strokeWidth="2"/>
    <text x="152" y="165" textAnchor="middle" fill="#E8C991" fontSize="20" fontFamily="serif">FAHDAN</text>
  </svg>;
  return <svg className={`art-svg ${hero?'hero-wood':''}`} viewBox="0 0 340 280" role="img" aria-label="رسم توضيحي لقطع عود طبيعي">
    <ellipse cx="168" cy="244" rx="122" ry="18" fill="#170d0a" opacity=".24"/>
    <g stroke="#C19A73" strokeLinejoin="round" strokeWidth="1.7">
      <path d="M38 191 104 66 131 72 95 217Z" fill="#513524"/>
      <path d="M90 212 125 43 162 57 154 228Z" fill="#785133"/>
      <path d="M150 229 210 45 236 84 205 231Z" fill="#503524"/>
      <path d="M210 228 277 120 310 152 259 237Z" fill="#966746"/>
      <path d="M39 223 179 117 199 147 97 245Z" fill="#AE8059"/>
      <path d="M99 236 237 139 254 178 153 249Z" fill="#443021"/>
    </g>
    <g fill="none" stroke="#D9B286" strokeWidth="2" opacity=".66">
      <path d="M103 86 57 199M143 64 106 204M222 72 170 210M285 146 233 222M172 137 72 219M227 166 145 228"/>
    </g>
  </svg>;
}
