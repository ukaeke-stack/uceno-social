'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, createLocalTracks } from 'livekit-client';
import { ArrowLeft, Mic, MicOff, PhoneCall, PhoneOff, Video, VideoOff, PhoneIncoming, X } from 'lucide-react';

type Invitation = { id: string; callerHandle: string; calleeHandle: string; mode: 'audio'|'video'; status: string; createdAt: string };
type MissedCall = { id: string; callerHandle: string; mode: 'audio'|'video'; createdAt: string };

export default function CallsPage() {
  const [targetHandle, setTargetHandle] = useState('');
  const [mode, setMode] = useState<'audio'|'video'>('video');
  const [status, setStatus] = useState('Ready to call');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [incoming, setIncoming] = useState<Invitation[]>([]);
  const [missedCalls, setMissedCalls] = useState<MissedCall[]>([]);
  const [lockedTarget, setLockedTarget] = useState(false);
  const [busy, setBusy] = useState(false);
  const roomRef = useRef<Room|null>(null);
  const localRef = useRef<HTMLDivElement>(null);
  const remoteRef = useRef<HTMLDivElement>(null);
  const activeInvitationRef = useRef<string|null>(null);
  const cancelledRef = useRef(false);
  const autoStartRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const handle = params.get('handle');
    const requestedMode = params.get('mode');
    if (handle && /^[a-zA-Z0-9_]{3,24}$/.test(handle)) { setTargetHandle(handle); setLockedTarget(true); }
    if (requestedMode === 'audio' || requestedMode === 'video') setMode(requestedMode);
  }, []);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const response = await fetch('/api/calls/invitations', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (alive && Array.isArray(data.invitations)) setIncoming(data.invitations.filter((item: Invitation) => item.status === 'pending'));
        if (alive && Array.isArray(data.missedCalls)) setMissedCalls(data.missedCalls);
      } catch { /* transient network failure; retry on next poll */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => () => { cancelledRef.current = true; void roomRef.current?.disconnect(); }, []);

  function mountTrack(track: Track, participant: 'local'|'remote') {
    const host = participant === 'local' ? localRef.current : remoteRef.current;
    if (!host) return;
    const element = track.attach();
    element.style.width = '100%';
    element.style.height = '100%';
    if (element instanceof HTMLVideoElement) element.style.objectFit = 'cover';
    host.appendChild(element);
  }

  async function joinCall(skipInvitation = false) {
    const handle = targetHandle.trim().replace(/^@/, '').toLowerCase();
    if (connected || busy || !/^[a-z0-9_]{3,24}$/.test(handle)) return;
    setBusy(true);
    setError('');
    cancelledRef.current = false;
    setStatus(skipInvitation ? 'Joining call…' : 'Calling @' + handle + '…');
    try {
      if (!skipInvitation) {
        const inviteResponse = await fetch('/api/calls/invitations', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create', targetHandle: handle, mode })
        });
        const inviteData = await inviteResponse.json();
        if (!inviteResponse.ok) throw new Error(inviteData.error || 'Could not start call');
        activeInvitationRef.current = inviteData.invitationId;
        setStatus('Ringing @' + handle + '… Waiting for them to answer');
        const deadline = Date.now() + 60000;
        let accepted = false;
        while (Date.now() < deadline && !cancelledRef.current) {
          const poll = await fetch('/api/calls/invitations', { cache: 'no-store' });
          const pollData = await poll.json();
          const current = (pollData.invitations || []).find((item: Invitation) => item.id === inviteData.invitationId);
          if (current?.status === 'accepted') { accepted = true; break; }
          if (current?.status === 'rejected' || current?.status === 'cancelled') throw new Error('The call was declined or cancelled');
          await new Promise(resolve => window.setTimeout(resolve, 1500));
        }
        if (cancelledRef.current) return;
        if (!accepted) throw new Error('No answer. Try calling again later.');
      }

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        mountTrack(track, participant.identity === room.localParticipant.identity ? 'local' : 'remote');
      });
      room.on(RoomEvent.TrackUnsubscribed, track => track.detach().forEach(el => el.remove()));
      room.on(RoomEvent.Disconnected, () => { setConnected(false); setStatus('Call ended'); });
      const response = await fetch('/api/calls/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetHandle: handle, mode })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create call');
      await room.connect(data.url, data.token);
      const tracks = await createLocalTracks({ audio: true, video: mode === 'video' });
      for (const track of tracks) {
        await room.localParticipant.publishTrack(track);
        mountTrack(track, 'local');
      }
      setConnected(true);
      setStatus('Connected with @' + handle);
    } catch (e) {
      await roomRef.current?.disconnect();
      roomRef.current = null;
      setConnected(false);
      setStatus('Not connected');
      setError(e instanceof Error ? e.message : 'Call could not start');
    } finally { setBusy(false); }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (lockedTarget && targetHandle && params.get('start') === '1' && !autoStartRef.current) {
      autoStartRef.current = true;
      void joinCall();
    }
  }, [lockedTarget, targetHandle]);

  async function respondToInvitation(invitation: Invitation, action: 'accept'|'reject') {
    setError('');
    try {
      const response = await fetch('/api/calls/invitations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, invitationId: invitation.id })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not respond to call');
      setIncoming(items => items.filter(item => item.id !== invitation.id));
      if (action === 'accept') {
        activeInvitationRef.current = invitation.id;
        setTargetHandle(invitation.callerHandle);
        setMode(invitation.mode);
        setStatus('Joining @' + invitation.callerHandle + '…');
        // State updates are asynchronous, so pass the caller handle and mode through URL state.
        window.location.href = '/calls?handle=' + encodeURIComponent(invitation.callerHandle) + '&mode=' + invitation.mode + '&accept=' + invitation.id;
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not respond to call'); }
  }

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('accept');
    if (!id) return;
    activeInvitationRef.current = id;
    let active = true;
    const acceptAndJoin = async () => {
      const handle = new URLSearchParams(window.location.search).get('handle') || '';
      const requestedMode = new URLSearchParams(window.location.search).get('mode');
      if (!/^[a-zA-Z0-9_]{3,24}$/.test(handle) || (requestedMode !== 'audio' && requestedMode !== 'video')) return;
      setTargetHandle(handle);
      setMode(requestedMode);
      try {
        const response = await fetch('/api/calls/token', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetHandle: handle, mode: requestedMode })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not join call');
        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;
        room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => mountTrack(track, participant.identity === room.localParticipant.identity ? 'local' : 'remote'));
        room.on(RoomEvent.TrackUnsubscribed, track => track.detach().forEach(el => el.remove()));
        room.on(RoomEvent.Disconnected, () => { setConnected(false); setStatus('Call ended'); });
        await room.connect(data.url, data.token);
        const tracks = await createLocalTracks({ audio: true, video: requestedMode === 'video' });
        for (const track of tracks) { await room.localParticipant.publishTrack(track); mountTrack(track, 'local'); }
        if (active) { setConnected(true); setStatus('Connected with @' + handle); window.history.replaceState({}, '', '/calls'); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Could not join call'); }
    };
    void acceptAndJoin();
    return () => { active = false; };
  }, []);

  async function leaveCall() {
    cancelledRef.current = true;
    const invitationId = activeInvitationRef.current;
    activeInvitationRef.current = null;
    if (invitationId) {
      await fetch('/api/calls/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', invitationId }) }).catch(() => {});
    }
    await roomRef.current?.disconnect();
    roomRef.current = null;
    if (localRef.current) localRef.current.replaceChildren();
    if (remoteRef.current) remoteRef.current.replaceChildren();
    setConnected(false);
    setBusy(false);
    setStatus('Call ended');
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }

  async function toggleCamera() {
    const room = roomRef.current;
    if (!room) return;
    const next = !cameraOff;
    await room.localParticipant.setCameraEnabled(!next);
    setCameraOff(next);
  }

  return <main className="calls-page">
    <header><a href="/"><ArrowLeft size={18}/> UCENO</a><div><small>REAL-TIME CONVERSATION</small><h1>Audio & video calls</h1></div></header>
    {incoming.length > 0 && <section className="call-setup" aria-label="Incoming calls">
      <h2><PhoneIncoming size={18}/> Incoming call{incoming.length > 1 ? 's' : ''}</h2>
      {incoming.map(invitation => <div key={invitation.id} className="call-controls">
        <p><strong>@{invitation.callerHandle}</strong> is calling you ({invitation.mode})</p>
        <button className="call-answer" onClick={() => void respondToInvitation(invitation, 'accept')}>Answer</button>
        <button className="hangup" onClick={() => void respondToInvitation(invitation, 'reject')}><X size={16}/> Decline</button>
      </div>)}
    </section>}
    <section className="call-setup">
      {!lockedTarget && <><label htmlFor="call-target">UCENO username</label>
      <input id="call-target" value={targetHandle} onChange={e=>setTargetHandle(e.target.value.replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g,'').slice(0,24))} placeholder="Enter the person’s username" disabled={connected || busy} autoComplete="off" />
      <p>Select a person from their profile to call without entering a username.</p></>}
      <div className="call-mode"><button className={mode==='audio'?'selected':''} onClick={()=>setMode('audio')} disabled={connected||busy}><Mic size={16}/> Audio</button><button className={mode==='video'?'selected':''} onClick={()=>setMode('video')} disabled={connected||busy}><Video size={16}/> Video</button></div>
      {busy && !connected ? <div className="call-controls"><span role="status">{status}</span><button type="button" className="hangup" onClick={()=>void leaveCall()}><PhoneOff size={17}/> Cancel call</button></div> : !connected ? <button id="call-start" className="call-primary" onClick={()=>void joinCall()} disabled={!(/^[a-zA-Z0-9_]{3,24}$/.test(targetHandle.trim().replace(/^@/,'')))}><PhoneCall size={17}/> Call now</button> : <div className="call-controls"><button onClick={()=>void toggleMute()}>{muted?<MicOff size={17}/>:<Mic size={17}/>} {muted?'Unmute':'Mute'}</button>{mode==='video'&&<button onClick={()=>void toggleCamera()}>{cameraOff?<VideoOff size={17}/>:<Video size={17}/>} {cameraOff?'Turn camera on':'Turn camera off'}</button>}<button className="hangup" onClick={()=>void leaveCall()}><PhoneOff size={17}/> End call</button></div>}
      <p role="status">{status}</p>{error&&<p className="call-error" role="alert">{error}</p>}
    </section>
    {missedCalls.length > 0 && <section className="call-setup" aria-label="Missed calls"><h2>Missed calls</h2>{missedCalls.map(call => <div className="call-controls" key={call.id}><p><strong>@{call.callerHandle}</strong> · {call.mode} · {new Date(call.createdAt).toLocaleString()}</p><button className="call-primary" onClick={() => { window.location.href = '/calls?handle=' + encodeURIComponent(call.callerHandle) + '&mode=' + call.mode + '&start=1'; }}> <PhoneCall size={16}/> Call back</button></div>)}</section>}
    <section className="call-stage"><div><strong>You</strong><div className="call-video" ref={localRef}>Your camera preview appears here</div></div><div><strong>Other participant</strong><div className="call-video" ref={remoteRef}>Waiting for the other person to answer…</div></div></section>
    <p className="call-note">Incoming calls are checked while this page is open. For calls to ring when UCENO is closed or in the background, the server still needs a verified push-notification delivery path and Android device testing.</p>
  </main>;
}
