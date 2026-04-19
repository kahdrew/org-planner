import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ConnectionStatusIndicator from '@/components/panels/ConnectionStatusIndicator';
import { useSseStore } from '@/stores/sseStore';

beforeEach(() => {
  useSseStore.setState({
    status: 'idle',
    orgId: null,
    lastEventTs: null,
    retryCount: 0,
    lastSeq: null,
  });
  cleanup();
});

describe('<ConnectionStatusIndicator />', () => {
  it('renders nothing when status is idle', () => {
    const { container } = render(<ConnectionStatusIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the connected badge when status is connected', () => {
    useSseStore.setState({ status: 'connected' });
    const { getByTestId } = render(<ConnectionStatusIndicator />);
    const el = getByTestId('sse-connection-indicator');
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('data-status', 'connected');
    expect(el.textContent?.toLowerCase()).toContain('connected');
  });

  it('renders the reconnecting badge when status is reconnecting', () => {
    useSseStore.setState({ status: 'reconnecting' });
    const { getByTestId } = render(<ConnectionStatusIndicator />);
    const el = getByTestId('sse-connection-indicator');
    expect(el).toHaveAttribute('data-status', 'reconnecting');
    expect(el.textContent?.toLowerCase()).toContain('reconnecting');
  });

  it('renders the offline badge when status is disconnected', () => {
    useSseStore.setState({ status: 'disconnected' });
    const { getByTestId } = render(<ConnectionStatusIndicator />);
    const el = getByTestId('sse-connection-indicator');
    expect(el).toHaveAttribute('data-status', 'disconnected');
    expect(el.textContent?.toLowerCase()).toContain('offline');
  });

  it('renders the connecting badge when status is connecting', () => {
    useSseStore.setState({ status: 'connecting' });
    const { getByTestId } = render(<ConnectionStatusIndicator />);
    const el = getByTestId('sse-connection-indicator');
    expect(el).toHaveAttribute('data-status', 'connecting');
    expect(el.textContent?.toLowerCase()).toContain('connecting');
  });

  it('renders the polling badge when status is polling', () => {
    useSseStore.setState({ status: 'polling' });
    const { getByTestId } = render(<ConnectionStatusIndicator />);
    const el = getByTestId('sse-connection-indicator');
    expect(el).toHaveAttribute('data-status', 'polling');
    expect(el.textContent?.toLowerCase()).toContain('polling');
  });
});
