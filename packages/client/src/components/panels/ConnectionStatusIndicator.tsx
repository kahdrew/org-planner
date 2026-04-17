import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useSseStore } from '@/stores/sseStore';
import { cn } from '@/utils/cn';

/**
 * Small badge rendered in the app toolbar that reflects the live SSE
 * connection status. Pure visual read of the sseStore — no side effects.
 */
export default function ConnectionStatusIndicator() {
  const status = useSseStore((s) => s.status);

  // Don't render anything until the user has picked an org and we've
  // actually tried to connect at least once.
  if (status === 'idle') return null;

  const config = (() => {
    switch (status) {
      case 'connected':
        return {
          icon: <Wifi size={14} />,
          label: 'Connected',
          title: 'Realtime updates connected',
          tone: 'bg-emerald-100 text-emerald-700 border-emerald-200',
          dot: 'bg-emerald-500',
        };
      case 'connecting':
        return {
          icon: <Loader2 size={14} className="animate-spin" />,
          label: 'Connecting…',
          title: 'Establishing realtime connection',
          tone: 'bg-amber-100 text-amber-700 border-amber-200',
          dot: 'bg-amber-500',
        };
      case 'reconnecting':
        return {
          icon: <Loader2 size={14} className="animate-spin" />,
          label: 'Reconnecting…',
          title: 'Connection dropped — reconnecting',
          tone: 'bg-amber-100 text-amber-700 border-amber-200',
          dot: 'bg-amber-500',
        };
      case 'disconnected':
      default:
        return {
          icon: <WifiOff size={14} />,
          label: 'Offline',
          title: 'Realtime updates are offline',
          tone: 'bg-rose-100 text-rose-700 border-rose-200',
          dot: 'bg-rose-500',
        };
    }
  })();

  return (
    <div
      data-testid="sse-connection-indicator"
      data-status={status}
      title={config.title}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        config.tone,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('inline-block h-2 w-2 rounded-full', config.dot)}
      />
      {config.icon}
      <span className="sr-only md:not-sr-only">{config.label}</span>
    </div>
  );
}
