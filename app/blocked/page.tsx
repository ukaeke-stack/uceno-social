'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Ban, UserRound, Unlock } from 'lucide-react';

type BlockedUser={id:string;displayName:string;handle:string;blockedAt:string};
export default function BlockedAccountsPage(){
 const router=useRouter();const [users,setUsers]=useState<BlockedUser[]>([]);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;fetch('/api/blocks',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not load blocked accounts');return d}).then(d=>{if(active)setUsers(Array.isArray(d.blockedUsers)?d.blockedUsers:[])}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Could not load blocked accounts')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 async function unblock(handle:string){try{const r=await fetch('/api/blocks',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({handle})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not unblock account');setUsers(old=>old.filter(u=>u.handle!==handle))}catch(e){setError(e instanceof Error?e.message:'Could not unblock account')}}
 return <main className="user-page"><header className="user-page-top"><button className="user-back" onClick={()=>router.back()}><ArrowLeft size={17}/> Back</button><strong><Ban size={17}/> Blocked accounts</strong></header><section className="user-posts-section">{error&&<p role="alert">{error}</p>}{loading?<p>Loading blocked accounts…</p>:users.length?users.map(user=><article className="user-post-card" key={user.id}><div className="user-post-meta"><strong><UserRound size={16}/> {user.displayName} · @{user.handle}</strong><span>Blocked {new Date(user.blockedAt).toLocaleDateString()}</span></div><div className="user-action-row"><button onClick={()=>void unblock(user.handle)}><Unlock size={16}/> Unblock</button></div></article>):<div className="user-empty"><Ban size={25}/><strong>No blocked accounts</strong></div>}</section></main>;
}
