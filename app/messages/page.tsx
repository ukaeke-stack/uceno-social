'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageCircle, PhoneCall, Plus, RefreshCw, Send, Users, Video, X } from 'lucide-react';

type Conversation = {
  id: string;
  type: 'direct' | 'group' | 'channel';
  title?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  memberCount?: number;
  otherDisplayName?: string | null;
  otherHandle?: string | null;
};
type Message = {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  senderName?: string;
  senderHandle?: string;
};

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [handle, setHandle] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingList(true);
    try {
      const response = await fetch('/api/conversations', { cache: 'no-store' });
      const data = await response.json();
      if (response.status === 401) { window.location.replace('/account'); return; }
      if (!response.ok) throw new Error(data.error || 'Could not load conversations');
      const items = Array.isArray(data.conversations) ? data.conversations as Conversation[] : [];
      setConversations(items);
      const requestedId = new URLSearchParams(window.location.search).get('conversation');
      if (requestedId) { const requested = items.find(item => item.id === requestedId); if (requested) setSelected(requested); }
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load conversations');
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversation: Conversation, quiet = false) => {
    if (!quiet) setLoadingMessages(true);
    try {
      const response = await fetch('/api/conversations/' + encodeURIComponent(conversation.id) + '/messages', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load messages');
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load messages');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then(async response => {
      const data = await response.json();
      if (!response.ok || !data.user) { window.location.replace('/account'); return; }
      setCurrentUserId(String(data.user.id || ''));
    }).catch(() => window.location.replace('/account'));
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selected) return;
    void loadMessages(selected);
    const timer = window.setInterval(() => {
      void loadMessages(selected, true);
      void loadConversations(true);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [selected?.id, loadMessages, loadConversations]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, selected?.id]);

  async function startConversation(event: FormEvent) {
    event.preventDefault();
    const normalized = handle.trim().replace(/^@/, '').toLowerCase();
    if (!normalized) return;
    setStarting(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: normalized })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start conversation');
      setHandle('');
      await loadConversations(true);
      const convo = data.conversation as Conversation;
      const match = { ...convo, otherHandle: convo.otherHandle || normalized };
      setSelected(match);
      setNotice('Conversation ready.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start conversation');
    } finally {
      setStarting(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!selected || !draft.trim() || sending) return;
    setSending(true); setError('');
    try {
      const response = await fetch('/api/conversations/' + encodeURIComponent(selected.id) + '/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft.trim() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not send message');
      setMessages(old => [...old, data.message as Message]);
      setDraft('');
      void loadConversations(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send message');
    } finally {
      setSending(false);
    }
  }

  function titleFor(conversation: Conversation) {
    return conversation.title || conversation.otherDisplayName || (conversation.otherHandle ? '@' + conversation.otherHandle : 'Conversation');
  }

  return (
    <main className="messages-page">
      <header className="messages-topbar">
        <button className="messages-back" onClick={() => window.location.assign('/')} aria-label="Back to UCENO"><ArrowLeft size={18} /> <span>UCENO</span></button>
        <div><small>PRIVATE CONVERSATIONS</small><h1>Messages</h1></div>
        <button className="messages-refresh" onClick={() => { void loadConversations(); if (selected) void loadMessages(selected); }} aria-label="Refresh messages"><RefreshCw size={17} /></button>
      </header>
      {error && <div className="messages-alert" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={15}/></button></div>}
      {notice && <div className="messages-notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={15}/></button></div>}
      <section className="messages-layout">
        <aside className={'messages-sidebar' + (selected ? ' messages-sidebar-mobile-hidden' : '')}>
          <form className="messages-new-form" onSubmit={startConversation}>
            <label htmlFor="message-handle">Start a conversation</label>
            <div><span>@</span><input id="message-handle" value={handle} onChange={e => setHandle(e.target.value)} placeholder="username" maxLength={24} autoCapitalize="none" autoCorrect="off" /><button disabled={starting || !handle.trim()} type="submit" aria-label="Start conversation">{starting ? <RefreshCw size={16}/> : <Plus size={17}/>}</button></div>
          </form>
          <div className="messages-list-title"><strong>Your conversations</strong><span>{conversations.length}</span></div>
          <div className="messages-conversation-list">
            {loadingList ? <p className="messages-empty">Loading conversations…</p> : conversations.length === 0 ? <p className="messages-empty">No conversations yet. Enter a username above to send your first message.</p> : conversations.map(conversation => (
              <button key={conversation.id} className={'messages-conversation' + (selected?.id === conversation.id ? ' selected' : '')} onClick={() => { setSelected(conversation); setError(''); }}>
                <span className="messages-avatar">{conversation.type === 'direct' ? (titleFor(conversation).slice(0, 1).toUpperCase()) : <Users size={17}/>}</span>
                <span className="messages-conversation-copy"><strong>{titleFor(conversation)}</strong><small>{conversation.lastMessage || (conversation.type === 'direct' ? 'Start a conversation' : 'Group conversation')}</small></span>
                <span className="messages-conversation-time">{conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleDateString() : ''}</span>
              </button>
            ))}
          </div>
        </aside>
        <section className={'messages-thread' + (!selected ? ' messages-thread-mobile-hidden' : '')}>
          {!selected ? <div className="messages-welcome"><span><MessageCircle size={29}/></span><h2>Your conversations, in one place</h2><p>Choose a conversation or start a new one using someone’s UCENO username.</p></div> : <>
            <div className="messages-thread-head"><button className="messages-thread-back" onClick={() => setSelected(null)} aria-label="Back to conversation list"><ArrowLeft size={18}/></button><span className="messages-avatar">{titleFor(selected).slice(0, 1).toUpperCase()}</span><div><strong>{titleFor(selected)}</strong><small>{selected.otherHandle ? '@' + selected.otherHandle : selected.type === 'direct' ? 'Direct message' : (selected.memberCount || 1) + ' members'}</small></div><div className="messages-call-actions"><button aria-label="Start audio call" title="Audio call" onClick={() => window.location.assign('/calls?room=' + encodeURIComponent(selected.id) + '&mode=audio')}><PhoneCall size={16}/></button><button aria-label="Start video call" title="Video call" onClick={() => window.location.assign('/calls?room=' + encodeURIComponent(selected.id) + '&mode=video')}><Video size={16}/></button></div></div>
            <div className="messages-thread-body">
              {loadingMessages && messages.length === 0 ? <p className="messages-empty">Loading messages…</p> : messages.length === 0 ? <div className="messages-empty-thread"><MessageCircle size={23}/><strong>No messages yet</strong><span>Send a message to start the conversation.</span></div> : messages.map(message => {
                const mine = Boolean(currentUserId) && message.senderId === currentUserId;
                return <div key={message.id} className={'message-row' + (mine ? ' message-row-mine' : '')}><div className="message-bubble">{!mine && <small>{message.senderName || (message.senderHandle ? '@' + message.senderHandle : 'Member')}</small>}<p>{message.body}</p><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div></div>;
              })}
              <div ref={bottomRef}/>
            </div>
            <form className="messages-compose" onSubmit={sendMessage}><input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Write a message…" maxLength={5000} aria-label="Write a message" /><button type="submit" disabled={!draft.trim() || sending} aria-label="Send message">{sending ? <RefreshCw size={17}/> : <Send size={17}/>}</button></form>
          </>}
        </section>
      </section>
      <footer className="messages-footer">Messages are private to conversation members. Keep your conversations respectful.</footer>
      <style jsx global>{`
        .messages-page{min-height:100vh;background:#0d1018;color:#f0f2fa;padding:0 max(16px,calc((100vw - 1120px)/2));font-family:'DM Sans',sans-serif}
        .messages-topbar{height:86px;display:flex;align-items:center;gap:18px;border-bottom:1px solid #ffffff12}
        .messages-topbar>div{flex:1}.messages-topbar small{font-size:9px;letter-spacing:1.5px;color:#9b8cff;font-weight:700}.messages-topbar h1{font:800 23px Manrope,sans-serif;margin:4px 0 0}
        .messages-back,.messages-refresh,.messages-thread-back{display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid #ffffff17;border-radius:11px;background:#ffffff06;color:#d5d9e8;padding:10px 12px}
        .messages-refresh{padding:11px}.messages-layout{display:grid;grid-template-columns:340px minmax(0,1fr);height:min(760px,calc(100vh - 145px));min-height:500px;margin-top:22px;border:1px solid #ffffff13;border-radius:18px;overflow:hidden;background:#111621}
        .messages-sidebar{border-right:1px solid #ffffff12;min-width:0;display:flex;flex-direction:column}.messages-new-form{padding:18px;border-bottom:1px solid #ffffff10}.messages-new-form label{display:block;font-size:12px;font-weight:700;margin-bottom:10px}.messages-new-form>div{display:flex;align-items:center;gap:7px;border:1px solid #ffffff17;background:#0d111a;border-radius:11px;padding:5px 7px}.messages-new-form>div>span{color:#9b8cff;padding-left:4px}.messages-new-form input{background:transparent;border:0;outline:0;min-width:0;flex:1;color:#f0f2fa;padding:7px 0}.messages-new-form button,.messages-compose button{display:grid;place-items:center;border:0;border-radius:9px;background:#9585f4;color:#151426;width:34px;height:34px}.messages-new-form button:disabled,.messages-compose button:disabled{opacity:.45}
        .messages-list-title{display:flex;align-items:center;gap:9px;padding:17px 18px 10px;font-size:12px}.messages-list-title span{font-size:10px;color:#a99dff;background:#9b8cff20;border-radius:7px;padding:3px 6px}.messages-conversation-list{overflow-y:auto;min-height:0}.messages-conversation{width:100%;display:flex;align-items:center;gap:11px;text-align:left;padding:13px 15px;background:transparent;border:0;border-left:2px solid transparent;color:#eef0f8}.messages-conversation:hover,.messages-conversation.selected{background:#ffffff08;border-left-color:#9b8cff}.messages-avatar{width:40px;height:40px;flex-shrink:0;display:grid;place-items:center;border-radius:50%;background:linear-gradient(145deg,#6255c8,#9b8cff);color:white;font-weight:700}.messages-conversation-copy{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1}.messages-conversation-copy strong{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.messages-conversation-copy small{font-size:11px;color:#8d95a9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px}.messages-conversation-time{font-size:9px;color:#747d92;align-self:flex-start}
        .messages-thread{min-width:0;display:flex;flex-direction:column}.messages-thread-head{height:72px;flex-shrink:0;display:flex;align-items:center;gap:11px;padding:0 18px;border-bottom:1px solid #ffffff12}.messages-thread-head>div{display:flex;flex-direction:column;gap:5px}.messages-thread-head strong{font-size:13px}.messages-thread-head small{font-size:11px;color:#8d95a9}.messages-call-actions{display:flex;gap:6px;margin-left:auto}.messages-call-actions button{display:grid;place-items:center;width:32px;height:32px;border:1px solid #ffffff18;border-radius:9px;background:#ffffff07;color:#b9abff}.messages-thread-back{display:none}.messages-thread-body{flex:1;min-height:0;overflow-y:auto;padding:22px;display:flex;flex-direction:column;gap:13px}.message-row{display:flex;justify-content:flex-start}.message-row-mine{justify-content:flex-end}.message-bubble{max-width:min(78%,470px);padding:11px 13px;border-radius:14px 14px 14px 4px;background:#1c2332;border:1px solid #ffffff0b;overflow-wrap:anywhere}.message-row-mine .message-bubble{background:#6257b9;border-radius:14px 14px 4px 14px}.message-bubble small{font-size:10px;color:#c5bbff}.message-bubble p{white-space:pre-wrap;line-height:1.55;font-size:13px;margin:4px 0 7px}.message-bubble time{display:block;text-align:right;font-size:9px;color:#c0c3d3}.messages-compose{display:flex;gap:10px;align-items:center;padding:15px 18px;border-top:1px solid #ffffff12}.messages-compose input{flex:1;min-width:0;border:1px solid #ffffff16;background:#0c1018;border-radius:12px;padding:13px 14px;color:#f0f2fa;outline:0}.messages-compose input:focus{border-color:#9b8cff77}.messages-compose button{width:42px;height:42px}
        .messages-welcome,.messages-empty-thread{margin:auto;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:25px;gap:10px;color:#8d95a9}.messages-welcome>span{width:62px;height:62px;border-radius:20px;background:#9b8cff18;color:#bcb0ff;display:grid;place-items:center}.messages-welcome h2{font:700 19px Manrope,sans-serif;color:#f0f2fa;margin:6px 0 0}.messages-welcome p{font-size:12px;line-height:1.7;max-width:290px;margin:0}.messages-empty{padding:16px;color:#8d95a9;font-size:12px;line-height:1.7}.messages-empty-thread strong{font-size:13px;color:#e8eaf4}.messages-empty-thread span{font-size:11px}.messages-alert,.messages-notice{margin-top:12px;border-radius:10px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;font-size:12px}.messages-alert{background:#8f334020;border:1px solid #e86d7d44;color:#ffb5c0}.messages-notice{background:#278b6b1c;border:1px solid #6ac9a544;color:#a6edcf}.messages-alert button,.messages-notice button{background:transparent;border:0;display:grid;place-items:center}.messages-footer{text-align:center;padding:17px;color:#687186;font-size:10px}
        @media(max-width:720px){.messages-page{padding:0 12px}.messages-topbar{height:74px;gap:10px}.messages-back{padding:9px}.messages-back span{display:none}.messages-topbar h1{font-size:20px}.messages-layout{display:block;height:calc(100dvh - 125px);min-height:0;margin-top:12px;border-radius:14px}.messages-sidebar{height:100%;border-right:0}.messages-sidebar-mobile-hidden{display:none}.messages-thread{height:100%}.messages-thread-mobile-hidden{display:none}.messages-thread-back{display:grid;width:35px;height:35px;padding:0}.messages-thread-head{padding:0 12px}.messages-thread-body{padding:15px 12px}.messages-compose{padding:11px}.messages-compose input{padding:12px}.messages-footer{padding:12px 4px}.messages-conversation-copy small{max-width:150px}}
      `}</style>
    </main>
  );
}
