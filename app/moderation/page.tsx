'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck, Flag } from 'lucide-react';

type Report = { id:string; targetType:'user'|'post'|'comment'; targetId:string; reason:string; details:string; status:'pending'|'reviewing'|'actioned'|'dismissed'; createdAt:string; reporterHandle:string; targetHandle?:string|null; targetExcerpt?:string|null };

export default function ModerationPage(){
  const router=useRouter();
  const [reports,setReports]=useState<Report[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  async function load(){try{const r=await fetch('/api/moderation/reports',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Moderator access required');setReports(Array.isArray(d.reports)?d.reports:[]);setError('')}catch(e){setError(e instanceof Error?e.message:'Could not load moderation queue')}finally{setLoading(false)}}
  useEffect(()=>{void load()},[]);
  async function update(reportId:string,status:'reviewing'|'dismissed'|'actioned'){try{const r=await fetch('/api/moderation/reports',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({reportId,status})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not update report');setReports(old=>old.map(item=>item.id===reportId?{...item,status}:item))}catch(e){setError(e instanceof Error?e.message:'Could not update report')}}
  return <main className="user-page"><header className="user-page-top"><button className="user-back" onClick={()=>router.back()}><ArrowLeft size={17}/> Back</button><strong><ShieldCheck size={18}/> Moderation queue</strong></header><section className="user-posts-section">{error&&<p role="alert">{error}</p>}{loading?<p>Loading reports…</p>:reports.length?reports.map(report=><article className="user-post-card" key={report.id}><div className="user-post-meta"><strong><Flag size={15}/> {report.targetType} report · {report.reason}</strong><span>{report.status} · {new Date(report.createdAt).toLocaleString()}</span></div><p>Reported by @{report.reporterHandle}{report.targetHandle?' · Target: @'+report.targetHandle:''}</p>{report.targetExcerpt&&<blockquote>{report.targetExcerpt}</blockquote>}{report.details&&<p>{report.details}</p>}<div className="user-action-row"><button onClick={()=>void update(report.id,'reviewing')}>Mark reviewing</button><button onClick={()=>void update(report.id,'dismissed')}>Dismiss</button><button onClick={()=>void update(report.id,'actioned')}>Mark actioned</button></div></article>):<div className="user-empty"><ShieldCheck size={25}/><strong>No reports in queue</strong></div>}</section></main>;
}
