import { create } from "zustand";

type Role = "rider" | "client" | null;

interface SessionState {
  userId: string | null;
  role: Role;
  setSession: (userId: string, role: Exclude<Role, null>) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  userId: null,
  role: null,
  setSession: (userId, role) => set({ userId, role }),
  clearSession: () => set({ userId: null, role: null }),
}));
