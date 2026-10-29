'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Clock3, Users, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Person = { id:string; handle:string; displayName:string; avatarUrl?:string|null; createdAt?:string; connectedAt?:string };
type Data = { incoming:Person[]; outgoing:Person[]; mutuals:Person[] };

export default function MutualsPage() {
  const router = useRouter();
  const [data,setData] = useState<Data>({incoming:[],outgoing:[],mutuals:[]});
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState('');
  const [error,setError] = useState('');
  const load = useCallback(async()=>{try{const r=await fetch('/api/mutuals',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not load mutuals');setData({incoming:d.incoming||[],outgoing:d.outgoing||[],mutuals:d.mutuals||[]})}catch(e){setError(e instanceof Error?e.message:'Could not load mutuals')}finally{setLoading(false)}},[]);
  useEffect(()=>{void load()},[load]);
  async function action(person:Person, action:'accept'|'decline'|'remove') {
    setBusy(person.handle+action);setError('');
    try{const r=await fetch('/api/users/'+encodeURIComponent(person.handle)+'/mutual',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,requestId:person.id})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not update connection');await load()}catch(e){setError(e instanceof Error?e.message:'Could not update connection')}finally{setBusy('')}
  }
  async function openMessage(person:Person) {
    setBusy(person.handle+'message');setError('');
    try{const r=await fetch('/api/conversations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({handle:person.handle})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not start conversation');router.push('/messages?conversation='+encodeURIComponent(d.conversation.id))}
    catch(e){setError(e instanceof Error?e.message:'Could not start conversation')}finally{setBusy('')}
  }
  function personRow(person:Person, kind:'incoming'|'outgoing'|'mutual') {
    return <article className="user-post-card" key={person.id}>
      <div className="user-post-meta"><div><strong>{person.displayName}</strong><p>@{person.handle}</p></div><button className="user-outline-button" onClick={()=>router.push('/u/'+encodeURIComponent(person.handle))}>View profile</button></div>
      {kind==='incoming'&&<div className="user-action-row"><button className="user-follow-button" disabled={!!busy} onClick={()=>void action(person,'accept')}><Check size={16}/> Accept</button><button className="user-outline-button" disabled={!!busy} onClick={()=>void action(person,'decline')}><XCircle size={16}/> Decline</button></div>}
      {kind==='outgoing'&&<p className="user-profile-meta"><Clock3 size={15}/> Request sent · waiting for acceptance</p>}
      {kind==='mutual'&&<div className="user-action-row"><button disabled={!!busy} onClick={()=>void openMessage(person)}>Message</button><button disabled={!!busy} onClick={()=>router.push('/calls?handle='+encodeURIComponent(person.handle)+'&mode=audio&start=1')}>Audio call</button><button disabled={!!busy} onClick={()=>router.push('/calls?handle='+encodeURIComponent(person.handle)+'&mode=video&start=1')}>Video call</button><button className="user-outline-button" disabled={!!busy} onClick={()=>void action(person,'remove')}><XCircle size={16}/> Remove mutual</button></div>}
    </article>
  }
  return <main className="user-page"><header className="user-page-top"><button className="user-back" onClick={()=>router.back()}><ArrowLeft size={17}/> Back</button><strong>Mutual connections</strong></header>
    <section className="user-posts-section"><div className="user-section-heading"><h1><Users size={22}/> Mutuals & requests</h1><p>Only accepted mutual connections can make direct audio or video calls. Following someone does not grant calling permission.</p></div>
      {error&&<p role="alert" className="user-inline-error">{error}</p>}
      {loading?<p>Loading mutual connections…</p>:<>
        <h2>Incoming requests ({data.incoming.length})</h2>{data.incoming.length?data.incoming.map(p=>personRow(p,'incoming')):<p className="user-profile-meta">No pending requests.</p>}
        <h2>Requests you sent ({data.outgoing.length})</h2>{data.outgoing.length?data.outgoing.map(p=>personRow(p,'outgoing')):<p className="user-profile-meta">No outgoing requests.</p>}
        <h2>Your mutuals ({data.mutuals.length})</h2>{data.mutuals.length?data.mutuals.map(p=>personRow(p,'mutual')):<p className="user-profile-meta">Accepted connections will appear here.</p>}
      </>}
    </section>
  </main>
}
