'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Compass, Plus, Search, Users, X } from 'lucide-react';

type Community = { id:string; name:string; slug:string; description:string; createdAt:string; creatorName?:string; members:number; isMember:boolean };

export default function CommunitiesPage() {
  const [communities,setCommunities]=useState<Community[]>([]);
  const [search,setSearch]=useState('');
  const [name,setName]=useState('');
  const [description,setDescription]=useState('');
  const [createOpen,setCreateOpen]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [busyId,setBusyId]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch('/api/communities',{cache:'no-store'});
      const data=await response.json();
      if(response.status===401){window.location.replace('/account');return}
      if(!response.ok)throw new Error(data.error||'Could not load communities');
      setCommunities(Array.isArray(data.communities)?data.communities:[]);
      setError('');
    }catch(e){setError(e instanceof Error?e.message:'Could not load communities')}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{void load()},[load]);

  const visible=communities.filter(c=>(c.name+' '+c.description+' '+c.slug).toLowerCase().includes(search.toLowerCase()));

  async function create(event:FormEvent){
    event.preventDefault();
    if(name.trim().length<3)return;
    setSaving(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/communities',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.trim(),description:description.trim()})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Could not create community');
      setCommunities(old=>[data.community,...old.filter(c=>c.id!==data.community.id)]);
      setCreateOpen(false);setName('');setDescription('');setNotice('Community created. You are its first administrator.');
    }catch(e){setError(e instanceof Error?e.message:'Could not create community')}
    finally{setSaving(false)}
  }

  async function toggleMembership(community:Community){
    if(busyId)return;
    setBusyId(community.id);setError('');setNotice('');
    try{
      const response=await fetch('/api/communities/'+encodeURIComponent(community.id)+'/membership',{method:'POST'});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Could not update membership');
      setCommunities(old=>old.map(c=>c.id===community.id?{...c,isMember:Boolean(data.isMember),members:Number(data.members)}:c));
      setNotice(data.isMember?'You joined '+community.name+'.':'You left '+community.name+'.');
    }catch(e){setError(e instanceof Error?e.message:'Could not update membership')}
    finally{setBusyId('')}
  }

  return <main className="communities-page">
    <header className="communities-topbar"><button className="communities-back" onClick={()=>window.location.assign('/')}><ArrowLeft size={18}/><span>UCENO</span></button><div><small>FIND YOUR PEOPLE</small><h1>Communities</h1></div><button className="communities-create" onClick={()=>setCreateOpen(true)}><Plus size={16}/><span>Create</span></button></header>
    <section className="communities-hero"><span><Compass size={23}/></span><div><h2>Good things grow together.</h2><p>Discover people who share your interests, join a space, or create a community of your own.</p></div></section>
    {error&&<div className="communities-alert" role="alert">{error}<button onClick={()=>setError('')}><X size={15}/></button></div>}
    {notice&&<div className="communities-notice" role="status">{notice}<button onClick={()=>setNotice('')}><X size={15}/></button></div>}
    <label className="communities-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search communities by name or topic"/></label>
    <div className="communities-section-head"><div><small>YOUR NEXT CORNER</small><h2>Explore communities</h2></div><span>{visible.length} {visible.length===1?'community':'communities'}</span></div>
    {loading?<div className="communities-empty">Loading communities…</div>:visible.length===0?<div className="communities-empty"><Users size={25}/><strong>{search?'No matching communities':'No communities yet'}</strong><p>{search?'Try a different search.':'Create the first community and give people a place to connect.'}</p>{!search&&<button onClick={()=>setCreateOpen(true)}><Plus size={16}/> Create a community</button>}</div>:<div className="communities-grid">{visible.map((community,index)=><article className="community-tile" key={community.id}><div className={'community-tile-cover cover-'+(index%4)}><span><Users size={24}/></span><small>UCENO COMMUNITY</small></div><div className="community-tile-body"><h3>{community.name}</h3><p>{community.description||'A place to meet, share ideas, and build something together.'}</p><div className="community-tile-meta"><span><Users size={14}/>{community.members} {community.members===1?'member':'members'}</span><span>By {community.creatorName||'UCENO member'}</span></div><button disabled={busyId===community.id} className={community.isMember?'community-leave':'community-join'} onClick={()=>void toggleMembership(community)}>{busyId===community.id?'Please wait…':community.isMember?'Joined · Leave':'Join community'}</button></div></article>)}</div>}
    <footer className="communities-footer">Communities help people connect around shared interests. Be respectful and keep spaces welcoming.</footer>
    {createOpen&&<div className="communities-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCreateOpen(false)}}><form className="communities-modal" onSubmit={create}><div className="communities-modal-head"><div><small>START SOMETHING GOOD</small><h2>Create a community</h2></div><button type="button" onClick={()=>setCreateOpen(false)} aria-label="Close"><X size={18}/></button></div><label>Community name<input value={name} onChange={e=>setName(e.target.value)} required minLength={3} maxLength={80} placeholder="e.g. Port Harcourt Creators"/></label><label>Description<textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={500} rows={4} placeholder="What brings this community together?"/></label><div className="communities-modal-actions"><button type="button" onClick={()=>setCreateOpen(false)}>Cancel</button><button type="submit" disabled={saving||name.trim().length<3}>{saving?'Creating…':'Create community'}</button></div></form></div>}
    <style jsx global>{`
      .communities-page{min-height:100vh;background:#0d1018;color:#f0f2fa;padding:0 max(16px,calc((100vw - 1050px)/2));font-family:'DM Sans',sans-serif}
      .communities-topbar{height:84px;display:flex;align-items:center;gap:17px;border-bottom:1px solid #ffffff12}.communities-topbar>div{flex:1}.communities-topbar small,.communities-section-head small,.communities-modal-head small{font-size:9px;letter-spacing:1.4px;color:#a99cff;font-weight:700}.communities-topbar h1{font:800 23px Manrope,sans-serif;margin:4px 0 0}.communities-back,.communities-create{display:flex;align-items:center;gap:8px;border:1px solid #ffffff17;border-radius:11px;background:#ffffff06;color:#e7e8f2;padding:10px 12px}.communities-create{background:#9585f4;color:#171426;border-color:transparent;font-weight:700}
      .communities-hero{display:flex;align-items:center;gap:17px;padding:27px;margin-top:24px;border:1px solid #9b8cff24;border-radius:18px;background:radial-gradient(ellipse at 80% 20%,#8f7af31c,transparent 45%),linear-gradient(120deg,#171a2a,#131925)}.communities-hero>span{width:54px;height:54px;border-radius:17px;background:#9b8cff20;color:#c2b8ff;display:grid;place-items:center;flex-shrink:0}.communities-hero h2{font:800 22px Manrope,sans-serif;margin:0 0 8px}.communities-hero p{margin:0;color:#9ba3b8;line-height:1.7;font-size:12px;max-width:620px}
      .communities-search{display:flex;align-items:center;gap:10px;margin:22px 0;padding:0 15px;height:46px;border:1px solid #ffffff16;border-radius:12px;background:#111621;color:#8d95a9}.communities-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:#f0f2fa}.communities-section-head{display:flex;align-items:center;justify-content:space-between;margin:28px 0 15px}.communities-section-head h2{font:700 19px Manrope,sans-serif;margin:5px 0 0}.communities-section-head>span{color:#8d95a9;font-size:11px}
      .communities-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.community-tile{border:1px solid #ffffff14;border-radius:16px;overflow:hidden;background:#121722;min-width:0}.community-tile-cover{height:105px;display:flex;align-items:flex-end;justify-content:space-between;padding:14px;background:linear-gradient(135deg,#37305e,#1c2639)}.community-tile-cover.cover-1{background:linear-gradient(135deg,#23534f,#172d36)}.community-tile-cover.cover-2{background:linear-gradient(135deg,#573a4c,#282037)}.community-tile-cover.cover-3{background:linear-gradient(135deg,#35466b,#202a42)}.community-tile-cover>span{width:40px;height:40px;border-radius:13px;background:#ffffff18;border:1px solid #ffffff20;display:grid;place-items:center}.community-tile-cover small{font-size:8px;letter-spacing:1px;color:#e0dcff}.community-tile-body{padding:17px}.community-tile-body h3{font:700 15px Manrope,sans-serif;margin:0 0 8px;overflow-wrap:anywhere}.community-tile-body>p{color:#9ba3b8;font-size:11px;line-height:1.7;min-height:56px;margin:0 0 15px;overflow-wrap:anywhere}.community-tile-meta{display:flex;flex-direction:column;gap:7px;color:#7f899e;font-size:10px;margin-bottom:15px}.community-tile-meta span{display:flex;align-items:center;gap:6px}.community-join,.community-leave{width:100%;height:37px;border-radius:10px;border:1px solid #9b8cff55;background:#9585f41a;color:#cfc7ff;font-weight:700;font-size:11px}.community-leave{border-color:#ffffff18;background:#ffffff06;color:#b8bfd0}.community-join:disabled,.community-leave:disabled{opacity:.5}
      .communities-empty{min-height:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#8d95a9;text-align:center;border:1px dashed #ffffff1d;border-radius:16px;padding:22px}.communities-empty strong{color:#f0f2fa}.communities-empty p{font-size:12px;max-width:350px;line-height:1.7;margin:0}.communities-empty button{display:flex;align-items:center;gap:7px;border:0;border-radius:9px;background:#9585f4;color:#171426;padding:10px 13px;font-weight:700}.communities-footer{text-align:center;color:#697287;font-size:10px;padding:25px 0}
      .communities-alert,.communities-notice{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;border-radius:10px;font-size:12px;margin-top:12px}.communities-alert{color:#ffb7c1;background:#8f334020;border:1px solid #e86d7d44}.communities-notice{color:#a6edcf;background:#278b6b1c;border:1px solid #6ac9a544}.communities-alert button,.communities-notice button{background:transparent;border:0;color:inherit;display:grid;place-items:center}
      .communities-overlay{position:fixed;inset:0;background:#05070bd9;backdrop-filter:blur(8px);z-index:100;display:grid;place-items:center;padding:16px}.communities-modal{width:min(100%,480px);background:#151a26;border:1px solid #ffffff18;border-radius:18px;padding:22px;box-shadow:0 24px 80px #0008}.communities-modal-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px}.communities-modal-head h2{font:800 20px Manrope,sans-serif;margin:5px 0}.communities-modal-head button{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;border:1px solid #ffffff17;background:transparent}.communities-modal>label{display:flex;flex-direction:column;gap:8px;color:#c2c8d8;font-size:11px;font-weight:700;margin-bottom:15px}.communities-modal input,.communities-modal textarea{width:100%;border:1px solid #ffffff18;background:#0d111a;border-radius:10px;padding:12px;color:#f0f2fa;outline:0;resize:vertical}.communities-modal input:focus,.communities-modal textarea:focus{border-color:#9b8cff77}.communities-modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}.communities-modal-actions button{border:1px solid #ffffff18;border-radius:10px;padding:10px 13px;background:#ffffff07}.communities-modal-actions button[type=submit]{background:#9585f4;color:#171426;border-color:transparent;font-weight:700}.communities-modal-actions button:disabled{opacity:.5}
      @media(max-width:760px){.communities-page{padding:0 13px}.communities-topbar{height:74px;gap:10px}.communities-back{padding:9px}.communities-back span{display:none}.communities-topbar h1{font-size:20px}.communities-hero{padding:18px;gap:12px;margin-top:15px}.communities-hero h2{font-size:17px}.communities-hero>span{width:43px;height:43px;border-radius:13px}.communities-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.community-tile-body{padding:12px}.community-tile-body h3{font-size:13px}.community-tile-body>p{font-size:10px;min-height:68px}.community-tile-cover{height:85px;padding:10px}.community-tile-cover small{font-size:7px}.communities-section-head h2{font-size:17px}}
      @media(max-width:430px){.communities-grid{grid-template-columns:1fr}.community-tile{display:grid;grid-template-columns:92px minmax(0,1fr)}.community-tile-cover{height:100%;min-height:210px;flex-direction:column;align-items:flex-start;justify-content:space-between}.community-tile-cover small{writing-mode:vertical-rl;transform:rotate(180deg)}.community-tile-body>p{min-height:0}}
    `}</style>
  </main>;
}
