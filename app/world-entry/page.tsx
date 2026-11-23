"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Copy, Globe2, House, MapPin, Users } from "lucide-react";

type World = { id: string; cityId: string; name: string; description: string; livePlayers: number; upcomingEvents: number; region: string };
type City = { id: string; name: string; identity: string; climate: string; architecture: string; districts: {id:string;name:string;role:string}[]; landmarks: {id:string;name:string;kind:string}[]; worlds: World[]; available: boolean; livePlayers: number; upcomingEvents: number };
type Home = { id: string; name: string; worldId: string; cityId: string; visibility: string };
type LastLocation = { worldId: string; cityId: string; districtId?: string; locationKind: string; targetId?: string; savedAt: string };
type DestinationData = { cities: City[]; homes: Home[] };

export default function WorldEntryPage() {
  const [data,setData] = useState<DestinationData | null>(null);
  const [last,setLast] = useState<LastLocation | null>(null);
  const [selectedWorld,setSelectedWorld] = useState("");
  const [selectedHome,setSelectedHome] = useState("");
  const [mode,setMode] = useState<"continue"|"home"|"city"|"events"|"people">("city");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [entryCode,setEntryCode] = useState("");
  const [copied,setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/worlds/destinations",{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error||"Destinations unavailable");return j as DestinationData;}),
      fetch("/api/worlds/last-location",{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error||"Saved location unavailable");return j.canContinue ? j.location as LastLocation : null;})
    ]).then(([catalog,saved])=>{
      setData(catalog);setLast(saved);
      const first=catalog.cities.find(c=>c.available)?.worlds[0];
      if(first)setSelectedWorld(first.id);
    }).catch(e=>setError(e instanceof Error?e.message:"Unable to load world destinations"));
  },[]);

  const selectedCity = useMemo(()=>data?.cities.find(c=>c.worlds.some(w=>w.id===selectedWorld)) ?? null,[data,selectedWorld]);
  const activeWorld = useMemo(()=>data?.cities.flatMap(c=>c.worlds).find(w=>w.id===selectedWorld) ?? null,[data,selectedWorld]);

  async function enter(worldId:string) {
    if(!worldId)return;
    setBusy(true);setError("");setEntryCode("");setCopied(false);
    try {
      const response=await fetch("/api/worlds/entry",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({worldId,clientType:"unity-android"})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Could not prepare world entry");
      setEntryCode(result.code);
    } catch(e) {setError(e instanceof Error?e.message:"Could not prepare world entry");}
    finally {setBusy(false);}
  }

  async function copyCode() {
    if(!entryCode)return;
    try {await navigator.clipboard.writeText(entryCode);setCopied(true);}
    catch {setError("Clipboard access failed. Select and copy the code manually.");}
  }

  const cardStyle:CSSProperties={background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.13)",borderRadius:18,padding:16};
  const buttonStyle:React.CSSProperties={border:0,borderRadius:14,padding:"13px 16px",fontWeight:700,cursor:"pointer",background:"#8bd6ff",color:"#0b1a2a",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8};
  return <main style={{minHeight:"100dvh",background:"radial-gradient(ellipse at 15% 0%,#294d78 0%,#111a2c 48%,#090e18 100%)",color:"#f6f8ff",padding:"max(22px,env(safe-area-inset-top)) 18px max(28px,env(safe-area-inset-bottom))",fontFamily:"Arial,sans-serif"}}>
    <div style={{maxWidth:1000,margin:"0 auto"}}>
      <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:30}}>
        <a href="/" style={{color:"#dcecff",display:"inline-flex",alignItems:"center",gap:8,textDecoration:"none"}}><ArrowLeft size={18}/> UCENO Social</a>
        <span style={{fontSize:12,letterSpacing:2,color:"#9fb9d9"}}>VIRTUAL WORLD</span>
      </header>
      <section style={{marginBottom:24}}>
        <p style={{fontSize:12,letterSpacing:3,color:"#92d8ff",fontWeight:700}}>YOUR WORLD. YOUR CHOICE.</p>
        <h1 style={{fontSize:"clamp(30px,6vw,52px)",lineHeight:1.05,margin:"8px 0 12px"}}>Where would you like to go?</h1>
        <p style={{color:"#bdcce0",maxWidth:650,lineHeight:1.6}}>Return to your last safe location, visit your home, or choose a city to explore. You decide where to enter.</p>
      </section>
      <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:10,marginBottom:24}}>
        {[
          {id:"continue" as const,label:"Continue",desc:"Last location",icon:<MapPin size={20}/>,disabled:!last},
          {id:"home" as const,label:"My Home",desc:"Your residence",icon:<House size={20}/>,disabled:!data?.homes.length},
          {id:"city" as const,label:"Explore Cities",desc:"Choose a city",icon:<Globe2 size={20}/>,disabled:false},
          {id:"people" as const,label:"Join People",desc:"Friends & social spaces",icon:<Users size={20}/>,disabled:true},
          {id:"events" as const,label:"Events",desc:"Activities & gatherings",icon:<CalendarDays size={20}/>,disabled:!data?.cities.some(c=>c.upcomingEvents>0)}
        ].map(item=><button key={item.id} type="button" disabled={item.disabled} onClick={()=>{setMode(item.id);setEntryCode("");}} style={{...cardStyle,textAlign:"left",color:"inherit",opacity:item.disabled ? .48 : 1,cursor:item.disabled?"not-allowed":"pointer",outline:mode===item.id?"2px solid #8bd6ff":"none"}}>
          <div style={{color:"#9bdfff",marginBottom:12}}>{item.icon}</div><strong>{item.label}</strong><div style={{fontSize:12,color:"#aebed3",marginTop:5}}>{item.desc}</div>
        </button>)}
      </section>

      {mode==="continue" && <section style={cardStyle}>
        <h2 style={{marginTop:0}}>Continue where you left off</h2>
        {last ? <><p style={{color:"#c1d0e4"}}>{data?.cities.find(c=>c.id===last.cityId)?.name ?? last.cityId}{last.districtId? " · "+last.districtId:""} · Saved {new Date(last.savedAt).toLocaleString()}</p><button style={buttonStyle} disabled={busy} onClick={()=>enter(last.worldId)}>Prepare return <ArrowRight size={17}/></button></> : <p>No accessible saved location is available. Choose a city instead.</p>}
      </section>}

      {mode==="home" && <section style={cardStyle}>
        <h2 style={{marginTop:0}}>Choose your residence</h2>
        {!data?.homes.length?<p>No accessible home is registered yet.</p>:<div style={{display:"grid",gap:10}}>{data.homes.map(home=><button key={home.id} onClick={()=>{setSelectedHome(home.id);setSelectedWorld(home.worldId);}} style={{...cardStyle,textAlign:"left",color:"inherit",outline:selectedHome===home.id?"2px solid #8bd6ff":"none"}}><strong>{home.name}</strong><p style={{color:"#aebed3",margin:"5px 0 0",fontSize:13}}>{data.cities.find(c=>c.id===home.cityId)?.name ?? home.cityId} · {home.visibility}</p></button>)}</div>}
        {selectedHome && <button style={{...buttonStyle,marginTop:14}} disabled={busy} onClick={()=>enter(data?.homes.find(h=>h.id===selectedHome)?.worldId||"")}>Prepare entry <ArrowRight size={17}/></button>}
      </section>}

      {mode==="city" && <section>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:12}}><h2 style={{margin:0}}>Explore the cities</h2><span style={{fontSize:12,color:"#9fb9d9"}}>{data?.cities.length ?? 0} registered cities</span></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12}}>
          {data?.cities.map(city=><article key={city.id} style={{...cardStyle,opacity:city.available?1:.58}}>
            <div style={{height:92,borderRadius:12,background:"linear-gradient(135deg,rgba(66,143,198,.65),rgba(25,37,62,.95))",display:"flex",alignItems:"end",padding:12,marginBottom:12}}>
              <span style={{fontSize:11,letterSpacing:2,color:"#e0f4ff"}}>{city.climate.toUpperCase()}</span>
            </div>
            <h3 style={{margin:"0 0 6px",fontSize:20}}>{city.name}</h3>
            <p style={{fontSize:13,color:"#c1d0e4",lineHeight:1.45,minHeight:38}}>{city.identity}</p>
            <p style={{fontSize:12,color:"#9fb9d9"}}>{city.districts.length} districts · {city.landmarks.length} landmarks · {city.livePlayers} online · {city.upcomingEvents} events</p>
            <p style={{fontSize:12,color:"#aebed3",lineHeight:1.5}}>{city.architecture}</p>
            {city.available ? <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><select aria-label={"Select "+city.name+" world"} value={city.worlds.some(w=>w.id===selectedWorld)?selectedWorld:""} onChange={e=>setSelectedWorld(e.target.value)} style={{flex:1,minWidth:120,padding:10,borderRadius:10,background:"#18253a",color:"white",border:"1px solid #52647b"}}>{city.worlds.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select><button style={buttonStyle} disabled={busy} onClick={()=>enter(city.worlds.find(w=>w.id===selectedWorld)?.id||city.worlds[0].id)}>Enter <ArrowRight size={16}/></button></div> : <p style={{fontSize:12,color:"#ffce9c"}}>No published world instance is currently available for this city.</p>}
          </article>)}
        </div>
      </section>}

      {mode==="events" && <section style={cardStyle}><h2 style={{marginTop:0}}>Events & activities</h2><p style={{color:"#c1d0e4"}}>Choose a city with upcoming events to see its published worlds. Event joining still requires an RSVP and an authorized event session.</p>{data?.cities.filter(c=>c.upcomingEvents>0).map(c=><button key={c.id} onClick={()=>{setMode("city");setSelectedWorld(c.worlds[0]?.id||"");}} style={{...cardStyle,display:"block",width:"100%",textAlign:"left",color:"inherit",marginTop:8}}>{c.name} · {c.upcomingEvents} upcoming events</button>)}</section>}

      {mode==="people" && <section style={cardStyle}><h2 style={{marginTop:0}}>Join People</h2><p>Friend-location discovery is not yet connected to this entry screen. Private destinations will remain protected by membership and invitation checks.</p></section>}

      {activeWorld && mode==="city" && <p style={{fontSize:12,color:"#9fb9d9",marginTop:14}}>Selected world: {activeWorld.name}{selectedCity?" · "+selectedCity.name:""} · {activeWorld.livePlayers} online</p>}

      {error && <p role="alert" style={{background:"#512c35",padding:12,borderRadius:12,color:"#ffe1e5"}}>{error}</p>}
      {entryCode && <section style={{...cardStyle,marginTop:20,borderColor:"#8bd6ff"}}>
        <h2 style={{marginTop:0}}>Your one-time entry code</h2>
        <p style={{color:"#c1d0e4",fontSize:13}}>This code expires in 90 seconds and can only be used once. Enter it in the UCENO Unity client. Do not share it.</p>
        <div style={{padding:14,borderRadius:12,background:"#080f1c",fontFamily:"monospace",overflowWrap:"anywhere",fontSize:14}}>{entryCode}</div>
        <button style={{...buttonStyle,marginTop:12}} onClick={copyCode}>{copied?<Check size={17}/>:<Copy size={17}/>} {copied?"Copied":"Copy code"}</button>
      </section>}
      <footer style={{marginTop:30,paddingTop:18,borderTop:"1px solid rgba(255,255,255,.12)",fontSize:12,color:"#8194ae"}}>UCENO Virtual World · One UCENO Social account · Your destination is always your choice.</footer>
    </div>
  </main>;
}
