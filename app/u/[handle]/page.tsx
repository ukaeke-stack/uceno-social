'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, MessageCircle, Phone, Video, UserRound, CalendarDays, Users, FileText, Heart, MessageSquare, UserPlus, UserCheck, Check, XCircle } from 'lucide-react';

type Profile = { id:string; displayName:string; handle:string; accountType?:'person'|'page'; joinedAt:string; followers:number; following:number; postCount:number; isFollowing:boolean; mutualStatus?:'self'|'none'|'accepted'|'incoming_pending'|'outgoing_pending'|'page'|'page_account'; mutualRequestId?:string|null; isOwnProfile?:boolean; bio?:string; location?:string; website?:string; avatarUrl?:string|null };
type Post = { id:string; body:string; createdAt:string; likes:number; comments:number; mediaUrl?:string|null; mediaType?:'image'|'video'|null };

export default function UserHomePage() {
  const params = useParams<{handle:string}>(); const router = useRouter();
  const [data,setData] = useState<{profile:Profile;posts:Post[]}|null>(null);
  const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  const handle = String(params.handle||'').replace(/^@/,'').toLowerCase();
  useEffect(()=>{let cancelled=false;fetch('/api/users/'+encodeURIComponent(handle),{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not load this user');return d}).then(d=>{if(!cancelled)setData(d)}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Could not load this user')});return()=>{cancelled=true}},[handle]);
  async function follow(){if(!data||busy)return;setBusy(true);try{const r=await fetch('/api/users/'+encodeURIComponent(handle)+'/follow',{method:'POST'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Follow failed');setData(old=>old?({...old,profile:{...old.profile,isFollowing:!!d.following,followers:Math.max(0,old.profile.followers+(d.following?1:-1))}}):old)}catch(e){setError(e instanceof Error?e.message:'Follow failed')}finally{setBusy(false)}}
  async function mutualAction(action:'send'|'accept'|'decline'|'remove'){
    if(!data||busy)return;
    setBusy(true);setError('');
    try{
      const r=await fetch('/api/users/'+encodeURIComponent(handle)+'/mutual',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,requestId:data.profile.mutualRequestId})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not update mutual connection');
      const mutualStatus=d.status==='accepted'?'accepted':d.status==='outgoing_pending'?'outgoing_pending':'none';
      setData(old=>old?({...old,profile:{...old.profile,mutualStatus,mutualRequestId:d.requestId||null}}):old);
    }catch(e){setError(e instanceof Error?e.message:'Could not update mutual connection')}finally{setBusy(false)}
  }
  async function messageOrCall(mode?:'audio'|'video'){
    if(mode&&data?.profile.mutualStatus!=='accepted'){setError('Direct calls are available only with accepted mutual connections.');return}
    setBusy(true);setError('');
    try{if(mode){router.push('/calls?handle='+encodeURIComponent(handle)+'&mode='+mode+'&start=1');return}const r=await fetch('/api/conversations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({handle})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not start conversation');router.push('/messages?conversation='+encodeURIComponent(d.conversation.id))}catch(e){setError(e instanceof Error?e.message:'Could not start conversation')}finally{setBusy(false)}
  }
  if(error&&!data)return <main className="user-page"><button className="user-back" onClick={()=>router.back()}><ArrowLeft size={17}/> Back</button><p role="alert">{error}</p></main>;
  if(!data)return <main className="user-page"><p>Loading user homepage…</p></main>;
  const p=data.profile;
  return <main className="user-page"><header className="user-page-top"><button className="user-back" onClick={()=>router.back()}><ArrowLeft size={17}/> Back</button><strong>UCENO · @{p.handle}</strong><button className="user-outline-button" onClick={()=>router.push('/mutuals')}><Users size={16}/> Mutuals & requests</button></header>
    <section className="user-cover"><div className="user-cover-glow"/><div className="user-avatar-large">{p.avatarUrl?<img src={p.avatarUrl} alt={p.displayName}/>:<UserRound size={35}/>}</div><div className="user-cover-actions"><button onClick={()=>router.push('/u/'+encodeURIComponent(handle)+'/profile')}>View full profile</button></div></section>
    <section className="user-home-card"><div className="user-name-row"><div><h1>{p.displayName}</h1><p>@{p.handle}{p.accountType==='page'&&<span className="user-profile-meta"> · Page</span>}</p></div>{!p.isOwnProfile&&<div className="user-profile-buttons"><button className="user-follow-button" onClick={()=>void follow()} disabled={busy}>{p.isFollowing?'Following':'Follow'}</button>{p.accountType!=='page'&&p.mutualStatus!=='page_account'&&(p.mutualStatus==='accepted'?<button className="user-outline-button" onClick={()=>void mutualAction('remove')} disabled={busy}><UserCheck size={16}/> Mutuals · Remove</button>:p.mutualStatus==='incoming_pending'?<><button className="user-follow-button" onClick={()=>void mutualAction('accept')} disabled={busy}><Check size={16}/> Accept request</button><button className="user-outline-button" onClick={()=>void mutualAction('decline')} disabled={busy}><XCircle size={16}/> Decline</button></>:p.mutualStatus==='outgoing_pending'?<button className="user-outline-button" disabled><UserPlus size={16}/> Request sent</button>:<button className="user-outline-button" onClick={()=>void mutualAction('send')} disabled={busy}><UserPlus size={16}/> Add mutual</button>)}</div>}</div>{p.bio&&<p className="user-profile-intro">{p.bio}</p>}{p.location&&<p className="user-profile-meta">Location: {p.location}</p>}{p.website&&<p className="user-profile-meta"><a href={p.website} target="_blank" rel="noreferrer">{p.website}</a></p>}
      <div className="user-stats"><span><FileText size={17}/><b>{p.postCount}</b> posts</span><span><Users size={17}/><b>{p.followers}</b> followers</span><span><Users size={17}/><b>{p.following}</b> following</span></div>
      {!p.isOwnProfile&&<><div className="user-action-row"><button onClick={()=>void messageOrCall()} disabled={busy}><MessageCircle size={17}/> Message</button>{p.accountType!=='page'&&p.mutualStatus==='accepted'&&<><button onClick={()=>void messageOrCall('audio')} disabled={busy}><Phone size={17}/> Audio call</button><button onClick={()=>void messageOrCall('video')} disabled={busy}><Video size={17}/> Video call</button></>}</div>{p.accountType==='page'?<p className="user-profile-meta">Page account · follow updates or send a message. Personal mutual connections and direct calls are not available for Pages.</p>:p.mutualStatus==='page_account'?<p className="user-profile-meta">Your account is a Page. You can follow or message this profile, but Page accounts cannot request mutual connections or make direct calls.</p>:p.mutualStatus!=='accepted'&&<p className="user-profile-meta">Direct calls are available only after a mutual connection request is accepted. Messaging remains available.</p>}</>}
    </section>
    <section className="user-posts-section"><div className="user-section-heading"><h2>Homepage</h2><p>Posts shared by @{p.handle}</p></div>{data.posts.length?data.posts.map(post=><article className="user-post-card" key={post.id}><div className="user-post-meta"><strong>{p.displayName}</strong><span>{new Date(post.createdAt).toLocaleString()}</span></div>{post.body&&<p>{post.body}</p>}{post.mediaType==='video'&&post.mediaUrl&&<video src={post.mediaUrl} controls playsInline/>}{post.mediaType==='image'&&post.mediaUrl&&<img src={post.mediaUrl} alt="Post media"/>}<div className="user-post-engagement"><span><Heart size={15}/> {post.likes} likes</span><span><MessageSquare size={15}/> {post.comments} comments</span></div></article>):<div className="user-empty"><FileText size={25}/><strong>No public posts yet</strong><span>When this person shares a post, it will appear here.</span></div>}</section>
    {error&&<p className="user-inline-error" role="alert">{error}</p>}
  </main>;
}
