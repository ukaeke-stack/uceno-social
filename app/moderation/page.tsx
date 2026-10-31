'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck, Flag } from 'lucide-react';

type Report = {
  id:string; targetType:'user'|'post'|'comment'; targetId:string; reason:string; details:string;
  status:'pending'|'reviewing'|'actioned'|'dismissed'; createdAt:string; reporterHandle:string;
  targetHandle?:string|null; targetExcerpt?:string|null; targetModerationStatus?:'active'|'suspended'|'disabled'|null;
  suspendedUntil?:string|null; contentRemovedAt?:string|null;
};

export default function ModerationPage(){
  const router=useRouter();
  const [reports,setReports]=useState<Report[]>([]);
  const [reasons,setReasons]=useState<Record<string,string>>({});
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<string|null>(null);

  async function load(){
    try{
      const r=await fetch('/api/moderation/reports',{cache:'no-store'});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||'Could not load moderation queue');
      setReports(Array.isArray(d.reports)?d.reports:[]);
      setError('');
    }catch(e){setError(e instanceof Error?e.message:'Could not load moderation queue')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[]);

  async function update(reportId:string,status:'reviewing'|'dismissed'|'actioned'){
    setBusy(reportId);
    try{
      const r=await fetch('/api/moderation/reports',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({reportId,status})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||'Could not update report');
      if(status==='dismissed') setReports(old=>old.filter(item=>item.id!==reportId));
      else setReports(old=>old.map(item=>item.id===reportId?{...item,status}:item));
      setError('');
    }catch(e){setError(e instanceof Error?e.message:'Could not update report')}
    finally{setBusy(null)}
  }

  async function enforce(report:Report,action:'warn'|'suspend'|'disable'|'remove_content'|'restore_account'|'restore_content'){
    setBusy(report.id);
    try{
      const r=await fetch('/api/moderation/reports',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({
        reportId:report.id,action,reason:reasons[report.id]||'Moderation decision based on the submitted report.',
        ...(action==='suspend'?{durationDays:7}:{})
      })});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||'Could not apply enforcement action');
      if(action==='remove_content') setReports(old=>old.map(item=>item.id===report.id?{...item,status:'actioned',contentRemovedAt:new Date().toISOString()}:item));
      else if(action==='restore_content') setReports(old=>old.map(item=>item.id===report.id?{...item,status:'actioned',contentRemovedAt:null}:item));
      else if(action==='suspend') setReports(old=>old.map(item=>item.id===report.id?{...item,status:'actioned',targetModerationStatus:'suspended'}:item));
      else if(action==='disable') setReports(old=>old.map(item=>item.id===report.id?{...item,status:'actioned',targetModerationStatus:'disabled'}:item));
      else if(action==='restore_account') setReports(old=>old.map(item=>item.id===report.id?{...item,status:'actioned',targetModerationStatus:'active',suspendedUntil:null}:item));
      else setReports(old=>old.map(item=>item.id===report.id?{...item,status:'actioned'}:item));
      setError('');
    }catch(e){setError(e instanceof Error?e.message:'Could not apply enforcement action')}
    finally{setBusy(null)}
  }

  return <main className="user-page">
    <header className="user-page-top">
      <button className="user-back" onClick={()=>router.back()}><ArrowLeft size={17}/> Back</button>
      <strong><ShieldCheck size={18}/> Moderation queue</strong>
    </header>
    <section className="user-posts-section">
      {error&&<p role="alert">{error}</p>}
      {loading?<p>Loading reports…</p>:reports.length?reports.map(report=><article className="user-post-card" key={report.id}>
        <div className="user-post-meta">
          <strong><Flag size={15}/> {report.targetType} report · {report.reason}</strong>
          <span>{report.status} · {new Date(report.createdAt).toLocaleString()}</span>
        </div>
        <p>Reported by @{report.reporterHandle}{report.targetHandle?' · Target: @'+report.targetHandle:''}</p>
        {report.targetExcerpt&&<blockquote>{report.targetExcerpt}</blockquote>}
        {report.details&&<p>{report.details}</p>}
        {report.targetType==='user'&&<p>Account status: {report.targetModerationStatus||'active'}{report.suspendedUntil?' · Suspended until '+new Date(report.suspendedUntil).toLocaleString():''}</p>}
        {report.targetType!=='user'&&<p>Content status: {report.contentRemovedAt?'Removed':'Visible'}</p>}
        <label className="user-field-label" htmlFor={'moderation-reason-'+report.id}>Moderator reason</label>
        <input id={'moderation-reason-'+report.id} value={reasons[report.id]||''} onChange={event=>setReasons(old=>({...old,[report.id]:event.target.value}))} placeholder="Reason shown in the audit record" maxLength={1000}/>
        <div className="user-action-row">
          <button disabled={busy===report.id} onClick={()=>void update(report.id,'reviewing')}>Mark reviewing</button>
          <button disabled={busy===report.id} onClick={()=>void update(report.id,'dismissed')}>Dismiss</button>
          {report.targetType==='user'?<>
            <button disabled={busy===report.id} onClick={()=>void enforce(report,'warn')}>Send warning</button>
            <button disabled={busy===report.id} onClick={()=>void enforce(report,'suspend')}>Suspend 7 days</button>
            <button disabled={busy===report.id} onClick={()=>void enforce(report,'disable')}>Disable account</button>
            {report.targetModerationStatus!=='active'&&<button disabled={busy===report.id} onClick={()=>void enforce(report,'restore_account')}>Restore account</button>}
          </>:<>
            {!report.contentRemovedAt?<button disabled={busy===report.id} onClick={()=>void enforce(report,'remove_content')}>Remove content</button>
              :<button disabled={busy===report.id} onClick={()=>void enforce(report,'restore_content')}>Restore content</button>}
          </>}
        </div>
      </article>):<div className="user-empty"><ShieldCheck size={25}/><strong>No reports in queue</strong></div>}
    </section>
  </main>;
}
