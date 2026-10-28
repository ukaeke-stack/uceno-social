'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, createLocalTracks } from 'livekit-client';
import { ArrowLeft, Mic, MicOff, PhoneCall, PhoneOff, Video, VideoOff } from 'lucide-react';

export default function CallsPage() {
  const [targetHandle, setTargetHandle] = useState('');
  const [mode, setMode] = useState<'audio'|'video'>('video');
  const [status, setStatus] = useState('Ready to call');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const roomRef = useRef<Room|null>(null);
  const localRef = useRef<HTMLDivElement>(null);
  const remoteRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const params = new URLSearchParams(window.location.search); const handle = params.get('handle'); const requestedMode = params.get('mode'); if (handle && /^[a-zA-Z0-9_]{3,24}$/.test(handle)) setTargetHandle(handle); if (requestedMode === 'audio' || requestedMode === 'video') setMode(requestedMode); }, []);
  useEffect(() => () => { void roomRef.current?.disconnect(); }, []);

  function mountTrack(track: Track, participant: 'local'|'remote') {
    const host = participant === 'local' ? localRef.current : remoteRef.current;
    if (!host) return;
    const element = track.attach();
    element.style.width = '100%';
    element.style.height = '100%';
    if (element instanceof HTMLVideoElement) element.style.objectFit = 'cover';
    host.appendChild(element);
  }

  async function joinCall() {
    if (connected || !targetHandle.trim()) return;
    setError('');
    setStatus('Connecting…');
    try {
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        mountTrack(track, participant.identity === room.localParticipant.identity ? 'local' : 'remote');
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach(el => el.remove()));
      room.on(RoomEvent.Disconnected, () => { setConnected(false); setStatus('Call ended'); });
      const response = await fetch('/api/calls/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetHandle: targetHandle.trim().replace(/^@/, '').toLowerCase(), mode })
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
      setStatus('Connected with @' + targetHandle.trim().replace(/^@/, '').toLowerCase());
    } catch (e) {
      await roomRef.current?.disconnect();
      roomRef.current = null;
      setConnected(false);
      setStatus('Not connected');
      setError(e instanceof Error ? e.message : 'Call could not start');
    }
  }

  async function leaveCall() {
    await roomRef.current?.disconnect();
    roomRef.current = null;
    if (localRef.current) localRef.current.replaceChildren();
    if (remoteRef.current) remoteRef.current.replaceChildren();
    setConnected(false);
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
    <section className="call-setup">
      <label htmlFor="call-target">Username of the person to call</label>
      <input id="call-target" value={targetHandle} onChange={e=>setTargetHandle(e.target.value.replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g,'').slice(0,24))} placeholder="Enter their UCENO username" disabled={connected} autoComplete="off" />
      <p>Call any UCENO user by username. You do not need to share a room or belong to the same conversation.</p>
      <div className="call-mode"><button className={mode==='audio'?'selected':''} onClick={()=>setMode('audio')} disabled={connected}><Mic size={16}/> Audio</button><button className={mode==='video'?'selected':''} onClick={()=>setMode('video')} disabled={connected}><Video size={16}/> Video</button></div>
      {!connected ? <button className="call-primary" onClick={()=>void joinCall()} disabled={!/^[a-zA-Z0-9_]{3,24}$/.test(targetHandle.trim().replace(/^@/,''))}><PhoneCall size={17}/> Join call</button> : <div className="call-controls"><button onClick={()=>void toggleMute()}>{muted?<MicOff size={17}/>:<Mic size={17}/>} {muted?'Unmute':'Mute'}</button>{mode==='video'&&<button onClick={()=>void toggleCamera()}>{cameraOff?<VideoOff size={17}/>:<Video size={17}/>} {cameraOff?'Turn camera on':'Turn camera off'}</button>}<button className="hangup" onClick={()=>void leaveCall()}><PhoneOff size={17}/> Leave call</button></div>}
      <p role="status">{status}</p>{error&&<p className="call-error" role="alert">{error}</p>}
    </section>
    <section className="call-stage"><div><strong>You</strong><div className="call-video" ref={localRef}>Your camera preview appears here</div></div><div><strong>Other participants</strong><div className="call-video" ref={remoteRef}>Waiting for the other user to join the call…</div></div></section>
    <p className="call-note">Calls require the administrator to configure LiveKit in the hosting environment. Allow microphone and camera access when your browser asks. Calls are private to the two selected accounts. The other user must open the same direct call to connect; incoming-call ringing and accept/reject controls are being added separately.</p>
  </main>;
}
