import { setupServer } from 'msw/node';

// no default handlers: each test declares the requests it expects with server.use
export const server = setupServer();

export const apiUrl = (path: string) => `${import.meta.env.VITE_API_URL}${path}`;
