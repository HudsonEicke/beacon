import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

// a request no test expected fails the test instead of reaching the network
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

afterEach(() =>
{
    cleanup();
    server.resetHandlers();
    localStorage.clear();
});

afterAll(() => server.close());
