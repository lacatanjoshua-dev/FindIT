import type { User } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';

// On the website, "/api/set-claim" is on the same server.
// In the Android app the page runs on https://localhost, so it must call
// the Vercel website directly.
const API_BASE = Capacitor.isNativePlatform()
  ? import.meta.env.VITE_API_BASE_URL || 'https://find-it-five-gamma.vercel.app'
  : '';

// Makes sure the user's login token has { role: "authenticated" },
// which Supabase Storage needs for photo uploads.
// If it is missing, the Vercel Function /api/set-claim adds it.
//
// Returns true when the role is there, false if it could not be added
// (for example while testing with "npm run dev", where /api does not run).

let pending: Promise<boolean> | null = null;

export const ensureAuthenticatedRole = (user: User): Promise<boolean> => {
  // Share one request when several parts of the app ask at the same time.
  if (pending) {
    return pending;
  }

  pending = (async () => {
    try {
      const tokenResult = await user.getIdTokenResult();

      if (tokenResult.claims.role === 'authenticated') {
        return true;
      }

      const response = await fetch(`${API_BASE}/api/set-claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenResult.token}` },
      });

      if (!response.ok) {
        const details = await response.text().catch(() => '');
        console.warn('Could not add the upload role:', response.status, details);
        return false;
      }

      // Get a new token that includes the role.
      const refreshed = await user.getIdTokenResult(true);

      return refreshed.claims.role === 'authenticated';
    } catch (error) {
      console.warn('Could not add the upload role:', error);
      return false;
    } finally {
      pending = null;
    }
  })();

  return pending;
};