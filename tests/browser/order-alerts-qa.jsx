// Isolated hook fixture; no shop, database, device credential or real audio.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useOrderAlerts} from '../../src/use-order-alerts.js';
const params=new URLSearchParams(location.search);
const rows=numbers=>numbers.map(number=>({id:`${number}`,orderNumber:number,source:'qr',status:'pending',table:1,createdAt:Date.now()}));
window.alertsQa={soundStarts:0};
window.AudioContext=class{
 state='running';currentTime=0;destination={};
 createOscillator(){return{frequency:{},connect(){},disconnect(){},start(){window.alertsQa.soundStarts++;},stop(){queueMicrotask(()=>this.onended?.());}};}
 createGain(){return{gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
 async resume(){this.state='running';}async close(){this.state='closed';}
};
function Fixture(){
 const [state,setState]=useState({scope:params.get('scope')||'A',orders:rows((params.get('numbers')||'100').split(',').map(Number)),enabled:true});
 const alerts=useOrderAlerts({...state,storage:localStorage});
 window.alertsQa.setOrders=numbers=>setState(value=>({...value,orders:rows(numbers)}));
 window.alertsQa.setScope=(scope,numbers=[])=>setState({scope,orders:rows(numbers),enabled:Boolean(scope)});
 return <><output id="unread">{alerts.unreadCount}</output><output id="notice">{alerts.notice?.orderNumber??''}</output><button id="read" onClick={alerts.markRead}>Read</button><button id="sound" onClick={()=>alerts.setSound(true)}>Sound</button></>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
