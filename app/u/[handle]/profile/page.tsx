'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, FileText, Users, UserRound, Heart, MessageSquare } from 'lucide-react';

type Profile = { displayName:string; handle:string; joinedAt:string; followers:number; following:number; postCount:number; isFollowing:boolean };
type Post = { id:string; body:string; createdAt:string; likes:number; comments:number; mediaUrl?:string|null; mediaType?:'image'|'video'|null };

export default function UserProfilePage(){
 const params=useParams<{handle:string}>();const router=useRouter();const handle=String(params.handle||'').replace(/^@/,'').toLowerCase();
 const [data,setData]=useState<{profile:Profile;posts:Post[]}|null>(null);const [error,setError]=useState('');
 useEffect(()=>{let cancelled=false;fetch('/api/users/'+encodeURIComponent(handle),{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not load profile');return d}).then(d=>{if(!cancelled)setData(d)}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Could not load profile')});return()=>{cancelled=true}},[handle]);
 if(error&&!data)return <main className="user-page"><button className="user-back" onClick={()=>router.back()}><ArrowLeft size={17}/> Back</button><p role="alert">{error}</p></main>;
 if(!data)return <main className="user-page"><p>Loading profile…</p></main>;
 const p=data.profile;
 return <main className="user-page"><header className="user-page-top"><button className="user-back" onClick={()=>router.push('/u/'+encodeURIComponent(handle))}><ArrowLeft size={17}/> User homepage</button><strong>Profile details</strong></header>
 <section className="user-profile-detail"><div className="user-avatar-large"><UserRound size={35}/></div><h1>{p.displayName}</h1><p className="user-handle">@{p.handle}</p><p className="user-profile-intro">UCENO member. Explore public posts and follow this account to keep up with new conversations.</p>
 <div className="user-stats"><span><FileText size={17}/><b>{p.postCount}</b> posts</span><span><Users size={17}/><b>{p.followers}</b> followers</span><span><Users size={17}/><b>{p.following}</b> following</span></div>
 <div className="user-detail-list"><div><CalendarDays size={18}/><span><small>Member since</small><strong>{new Date(p.joinedAt).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'})}</strong></span></div><div><UserRound size={18}/><span><small>Username</small><strong>@{p.handle}</strong></span></div><div><FileText size={18}/><span><small>Public posts</small><strong>{p.postCount}</strong></span></div></div>
 <button className="user-outline-button" onClick={()=>router.push('/u/'+encodeURIComponent(handle))}>Return to homepage</button></section>
 <section className="user-posts-section"><div className="user-section-heading"><h2>Recent public posts</h2><p>Public content from this account</p></div>{data.posts.length?data.posts.map(post=><article className="user-post-card" key={post.id}><div className="user-post-meta"><strong>{p.displayName}</strong><span>{new Date(post.createdAt).toLocaleString()}</span></div>{post.body&&<p>{post.body}</p>}{post.mediaType==='video'&&post.mediaUrl&&<video src={post.mediaUrl} controls playsInline/>}{post.mediaType==='image'&&post.mediaUrl&&<img src={post.mediaUrl} alt="Post media"/>}<div className="user-post-engagement"><span><Heart size={15}/> {post.likes} likes</span><span><MessageSquare size={15}/> {post.comments} comments</span></div></article>):<div className="user-empty"><FileText size={25}/><strong>No public posts yet</strong></div>}</section></main>;
}
