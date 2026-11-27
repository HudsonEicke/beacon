import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import type { RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { setupStore } from '@/store/store';
import type { AppStore, RootState } from '@/store/store';
import { injectStore } from '@/services/api';

// every slice's starting state, for building preloaded state
export const emptyRootState = (): RootState => setupStore().getState();

// a new store for each test, also handed to the axios client so its requests read this store's tokens
export const setupTestStore = (preloadedState?: Partial<RootState>): AppStore =>
{
    const store = setupStore(preloadedState);
    injectStore(store);

    return store;
};

interface ProviderRenderOptions extends Omit<RenderOptions, 'wrapper'>
{
    preloadedState?: Partial<RootState>;
    route?: string;
}

export const renderWithProviders = (ui: ReactElement, { preloadedState, route = '/', ...renderOptions }: ProviderRenderOptions = {}) =>
{
    const store = setupTestStore(preloadedState);

    const Wrapper = ({ children }: { children: ReactNode }) => (
        <Provider store={store}>
            <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </Provider>
    );

    return {
        store,
        user: userEvent.setup(),
        ...render(ui, { wrapper: Wrapper, ...renderOptions })
    };
};
