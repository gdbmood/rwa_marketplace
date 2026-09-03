import { create } from 'zustand';
import { getMyProfile } from '@/actions/profile';
import { logout as logoutAction } from '@/actions/login';
import type { Tables } from '@/types/database';
import { clearRlsTokenCache } from '@/hooks/useSupabaseBrowser';

/**
 * Authenticated session state, hydrated from the server (the session cookie
 * is HttpOnly, so the browser can only learn about it by asking). Every
 * login path (thirdweb connect, test wallet button) calls refresh() after the
 * cookie is set; logout() clears the cookie through the server action.
 */

export type SessionUser = Tables<'users'>;

export type SessionStatus =
    | 'idle'
    | 'loading'
    | 'authenticated'
    | 'unauthenticated'
    | 'error';

interface SessionState {
    user: SessionUser | null;
    status: SessionStatus;
    error: string | null;
    /** Re-reads the session from the server. Safe to call repeatedly. */
    refresh: () => Promise<SessionUser | null>;
    /** Clears the session cookie server side and resets local state. */
    logout: () => Promise<void>;
    /** Local reset only (no server call), e.g. after a 401 from an API. */
    clear: () => void;
    /** Replaces the cached user, e.g. with the row a profile action returned. */
    setUser: (user: SessionUser) => void;
}

const sessionStore = create<SessionState>((set, get) => ({
    user: null,
    status: 'idle',
    error: null,

    refresh: async () => {
        set((state) => ({
            status: state.status === 'authenticated' ? 'authenticated' : 'loading',
            error: null,
        }));
        try {
            const result = await getMyProfile();
            if (result.ok) {
                set({ user: result.data, status: 'authenticated', error: null });
                return result.data;
            }
            if (result.error.code === 'unauthenticated' || result.error.code === 'not_found') {
                set({ user: null, status: 'unauthenticated', error: null });
                return null;
            }
            set({ user: null, status: 'error', error: result.error.message });
            return null;
        } catch {
            set({ user: null, status: 'error', error: 'Could not load your session' });
            return null;
        }
    },

    logout: async () => {
        try {
            await logoutAction();
        } finally {
            clearRlsTokenCache();
            get().clear();
        }
    },

    clear: () => {
        clearRlsTokenCache();
        set({ user: null, status: 'unauthenticated', error: null });
    },

    setUser: (user: SessionUser) => {
        set({ user, status: 'authenticated', error: null });
    },
}));

export default sessionStore;
