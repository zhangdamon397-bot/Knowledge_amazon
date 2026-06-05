import { useCallback, useMemo, useState } from "react";
import type { User } from "@knowledge-amazon/shared";
import { ApiClient } from "./api";

const TOKEN_KEY = "knowledge-amazon-token";
const USER_KEY = "knowledge-amazon-user";

export function useSession() {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  });

  const api = useMemo(() => new ApiClient(token), [token]);

  const setToken = useCallback((nextToken: string | null, nextUser: User | null) => {
    setTokenState(nextToken);
    setUser(nextUser);
    if (nextToken && nextUser) {
      localStorage.setItem(TOKEN_KEY, nextToken);
      localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }, []);

  return {
    api,
    token,
    user,
    setToken,
    isAuthenticated: Boolean(token && user)
  };
}
