"use client";

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import * as api from "./api";
import { AuthUser } from "./api";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Adopts an already-issued session (accessToken + user) without
   * making a fresh /auth/login call. Used by /join: join-code
   * redemption (see apps/api's JoinController) already returns a real
   * session in the same shape /auth/login does and sets the same
   * refresh/csrf cookies, so re-submitting the password through
   * `login()` would be a redundant round trip against the same
   * rate-limited window.
   */
  applySession: (accessToken: string, user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Holds the access token in memory only (component state), never
 * localStorage — an XSS payload that can run JS can always read
 * localStorage, but a token that only ever lives in a React closure
 * is gone the moment the tab is closed. On mount it tries to recover
 * a session via the httpOnly refresh cookie, so a page reload doesn't
 * force a fresh login as long as the cookie is still valid.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .refresh()
      .then((session) => {
        if (cancelled) return;
        setAccessToken(session.accessToken);
        setUser(session.user);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("unauthenticated");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await api.login({ email, password });
    setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus("authenticated");
  }, []);

  const applySession = useCallback((token: string, sessionUser: AuthUser) => {
    setAccessToken(token);
    setUser(sessionUser);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setAccessToken(null);
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, accessToken, login, logout, applySession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
