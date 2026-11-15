import React, { lazy, Suspense } from 'react';

const Customer = lazy(() => import('./LanCustomer.jsx'));
const StaffEntry = lazy(() => import('./StaffEntry.jsx'));

export default function App() {
 const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
 const customer = params.has('table') || params.has('key');
 return <Suspense fallback={<div className="app-loading" role="status">ກຳລັງເຊື່ອມຕໍ່…</div>}>
  {customer ? <Customer table={params.get('table')}/> : <StaffEntry/>}
 </Suspense>;
}
