import type { HubConnection } from '@microsoft/signalr';
import type { HubEventMap } from '@/services/hub/events';

type HubHandler = (...args: unknown[]) => void;

// stands in for a SignalR connection: handlers register with on(), and emit() plays an event from the server
export const createFakeHubConnection = () =>
{
    const handlersByEvent = new Map<string, HubHandler[]>();

    const connection = {
        on: (eventName: string, handler: HubHandler) =>
        {
            handlersByEvent.set(eventName, [...(handlersByEvent.get(eventName) ?? []), handler]);
        }
    } as unknown as HubConnection;

    const emit = <EventName extends keyof HubEventMap>(eventName: EventName, ...args: HubEventMap[EventName]) =>
    {
        handlersByEvent.get(eventName)?.forEach(handler => handler(...args));
    };

    return { connection, emit };
};
