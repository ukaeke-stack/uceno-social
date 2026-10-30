'use client';

import { useEffect } from 'react';

export default function NativeCallActionHandler() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('nativeCallAction');
    const invitationId = params.get('invitationId');
    if ((action !== 'accept' && action !== 'reject') || !invitationId) return;

    let cancelled = false;
    const dispatch = async () => {
      try {
        // Resolve the invitation while it is still pending, so Answer can
        // navigate to the existing call-join flow after accepting it.
        const listResponse = await fetch('/api/calls/invitations', { cache: 'no-store' });
        if (!listResponse.ok) throw new Error('Sign in to respond to this call.');
        const list = await listResponse.json();
        const invitation = (list.invitations || []).find(
          (item: { id: string; status: string }) => item.id === invitationId && item.status === 'pending'
        );
        if (!invitation) throw new Error('This call is no longer available.');

        const response = await fetch('/api/calls/invitations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: action === 'accept' ? 'accept' : 'reject', invitationId }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not respond to call.');
        if (cancelled) return;

        if (action === 'accept') {
          const handle = encodeURIComponent(invitation.callerHandle);
          const mode = invitation.mode === 'video' ? 'video' : 'audio';
          window.location.replace('/calls?handle=' + handle + '&mode=' + mode + '&accept=' + encodeURIComponent(invitationId));
        } else {
          window.location.replace('/');
        }
      } catch (error) {
        if (cancelled) return;
        console.error('UCENO notification call action failed', error);
        window.history.replaceState({}, '', '/');
      }
    };
    void dispatch();
    return () => { cancelled = true; };
  }, []);

  return null;
}
