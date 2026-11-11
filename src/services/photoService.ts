import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';

import { auth, db } from '../firebase';
import { supabase } from '../supabase';
import { ensureAuthenticatedRole } from './claimService';

export const PROFILE_BUCKET = 'profile-photos';
export const CHAT_BUCKET = 'chat-images';
export const MISSING_ROLE_ERROR = 'MISSING_AUTHENTICATED_ROLE';

const SIGNED_URL_SECONDS = 60 * 60;
const SAFETY_MARGIN_MS = 5 * 60 * 1000;
const MAX_DIMENSION = 1280;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

type CachedUrl = { url: string; expiresAt: number };

const urlCache = new Map<string, CachedUrl>();

// Creates (or reuses) a temporary link to a private Supabase file.
export const getSignedUrl = async (
  bucket: string,
  path: string
): Promise<string> => {
  const key = `${bucket}/${path}`;
  const cached = urlCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_SECONDS);

  if (error) {
    throw error;
  }

  urlCache.set(key, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGNED_URL_SECONDS * 1000 - SAFETY_MARGIN_MS,
  });

  return data.signedUrl;
};

// Copies the name and photo path to a public profile that other users can
// read. The private "users" document (with the email) stays private.
export const ensureMyPublicProfile = async (user: User): Promise<void> => {
  try {
    const profileSnapshot = await getDoc(doc(db, 'users', user.uid));
    const data = profileSnapshot.exists() ? profileSnapshot.data() : {};

    await setDoc(
      doc(db, 'publicProfiles', user.uid),
      {
        displayName: String(data.displayName ?? user.displayName ?? '').trim(),
        photoPath: String(data.photoPath ?? ''),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.warn('Could not sync the public profile:', error);
  }
};

// Shrinks big phone photos before uploading (max 1280px, JPEG).
const compressImage = async (file: File): Promise<File> => {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Could not read the image.'));
      element.src = objectUrl;
    });

    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(image.width, image.height)
    );
    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');

    if (!context) {
      return file;
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.8)
    );

    if (!blob || (scale === 1 && blob.size >= file.size)) {
      return file;
    }

    return new File([blob], `${Date.now()}.jpg`, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

// Uploads a chat image to Supabase and returns its storage path.
export const uploadChatImage = async (
  file: File,
  conversationId: string
): Promise<string> => {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('Please log in to send an image.');
  }

  // Add the upload role if this account does not have it yet,
  // then refresh the token so the latest custom claims are included.
  await ensureAuthenticatedRole(user);
  await user.getIdToken(true);
  const tokenResult = await user.getIdTokenResult();

  if (tokenResult.claims.role !== 'authenticated') {
    throw new Error(MISSING_ROLE_ERROR);
  }

  const imageToUpload = await compressImage(file);
  const extension = EXTENSIONS[imageToUpload.type] ?? 'jpg';
  const path = `${user.uid}/${conversationId}/${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(CHAT_BUCKET)
    .upload(path, imageToUpload, {
      contentType: imageToUpload.type,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return path;
};