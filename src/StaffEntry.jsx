import React, { useEffect, useState } from 'react';
import { Store } from 'lucide-react';
import { getCloudClient } from './cloud-client.mjs';
import { probeDeviceAccess } from './device-client.mjs';
import './styles.css';
import './counter.css';
import './cloud.css';
const CloudApp = React.lazy(() => import('./CloudApp.jsx'));

export default function StaffEntry() {
 const [access,setAccess]=useState({pending:true});
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true;setAccess({pending:true});
  probeDeviceAccess().then(device=>{
   let client=device;
   if(!client){try{client=getCloudClient();}catch{client=null;}}
   if(active)setAccess({client,pending:false});
  }).catch(()=>{if(active)setAccess({error:true,pending:false});});
  return()=>{active=false;};
 },[attempt]);
 if(access.error)return <main className="cloud-entry"><section className="cloud-access-card"><span className="cloud-brand"><Store size={29}/><b>Khao Piek POS</b></span><h1>ເຊື່ອມຕໍ່ເຄື່ອງບໍ່ໄດ້</h1><p role="alert">ກວດວ່າແອັບເປີດຢູ່ໃນເຄື່ອງນີ້ ແລ້ວລອງໃໝ່</p><button className="button primary full" onClick={()=>setAttempt(value=>value+1)}>ລອງໃໝ່</button></section></main>;
 if(access.pending)return <div className="cloud-loading" role="status">ກຳລັງເຊື່ອມຕໍ່…</div>;
 return <React.Suspense fallback={<div className="cloud-loading" role="status">ກຳລັງເຊື່ອມຕໍ່…</div>}><CloudApp client={access.client}/></React.Suspense>;
}
