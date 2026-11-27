import { combineReducers, configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import userReducer from './userSlice'
import conversationReducer from './conversationSlice'
import serverReducer from './serverSlice'
import channelReducer from './channelSlice'
import friendReducer from './friendSlice'
import hubReducer from './hubSlice'
import readingReducer from './readingSlice'
import { listenerMiddleware } from './listenerMiddleware';

const rootReducer = combineReducers({
    auth: authReducer,
    user: userReducer,
    conversation: conversationReducer,
    server: serverReducer,
    channel: channelReducer,
    friend: friendReducer,
    hub: hubReducer,
    reading: readingReducer
});

// tests build their own store so each one starts from a known state
export const setupStore = (preloadedState?: Partial<RootState>) => configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(listenerMiddleware.middleware)
});

export const store = setupStore();

export type RootState = ReturnType<typeof rootReducer>
export type AppStore = ReturnType<typeof setupStore>
export type AppDispatch = AppStore['dispatch']
