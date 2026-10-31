'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bookmark, BookmarkX, FileText, Heart, MessageSquare } from 'lucide-react';

type SavedPost = { id:string; body:string; mediaUrl?:string|null; mediaType?:'image'|'video'|null; createdAt:string; displayName:string; handle:string; likes:number; comments:number; savedAt:string };

export default function SavedPostsPage() {
  const router = useRouter();
  const [posts,setPosts] = useState<SavedPost[]>([]);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  useEffect(()=>{let active=true;fetch('/api/bookmarks',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not load saved posts');return d}).then(d=>{if(active)setPosts(Array.isArray(d.posts)?d.posts:[])}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Could not load saved posts')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
  async function remove(postId:string){try{const r=await fetch('/api/bookmarks',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({postId})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not remove bookmark');setPosts(old=>old.filter(p=>p.id!==postId))}catch(e){setError(e instanceof Error?e.message:'Could not remove bookmark')}}
  return <main className="user-page"><header className="user-page-top"><button className="user-back" onClick={()=>router.back()}><ArrowLeft size={17}/> Back</button><strong><Bookmark size={17}/> Saved posts</strong></header><section className="user-posts-section">{loading?<p>Loading saved posts…</p>:error?<p role="alert">{error}</p>:posts.length?posts.map(post=><article className="user-post-card" key={post.id}><div className="user-post-meta"><strong>{post.displayName} · @{post.handle}</strong><span>{new Date(post.createdAt).toLocaleString()}</span></div>{post.body&&<p>{post.body}</p>}{post.mediaType==='video'&&post.mediaUrl&&<video src={post.mediaUrl} controls playsInline/>}{post.mediaType==='image'&&post.mediaUrl&&<img src={post.mediaUrl} alt="Post media"/>}<div className="user-post-engagement"><span><Heart size={15}/> {post.likes} likes</span><span><MessageSquare size={15}/> {post.comments} comments</span><button onClick={()=>void remove(post.id)}><BookmarkX size={15}/> Remove saved post</button></div></article>):<div className="user-empty"><FileText size={25}/><strong>No saved posts</strong><span>Posts you bookmark will appear here.</span></div>}</section></main>;
}
