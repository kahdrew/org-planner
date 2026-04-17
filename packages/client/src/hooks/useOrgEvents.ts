import { useEffect } from 'react';
import { useOrgStore } from '@/stores/orgStore';
import { useSseStore } from '@/stores/sseStore';

/**
 * Keep an SSE subscription open that follows the user's currently
 * selected org. Connects when an org is selected and the user is
 * authenticated; reconnects automatically when the org changes;
 * disconnects on unmount.
 */
export function useOrgEvents(): void {
  const currentOrgId = useOrgStore((s) => s.currentOrg?._id ?? null);
  const connect = useSseStore((s) => s.connect);
  const disconnect = useSseStore((s) => s.disconnect);

  useEffect(() => {
    if (!currentOrgId) {
      disconnect();
      return;
    }
    // A fresh currentOrgId triggers a new connection. The store keeps
    // connections idempotent — calling `connect` for the same org twice
    // is a no-op.
    connect(currentOrgId);
    return () => {
      // Only tear down on final unmount; when the org changes, the effect
      // re-runs and the next connect() call cleans up the previous one.
    };
  }, [currentOrgId, connect, disconnect]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);
}
