import { useEffect, useState } from 'react';
import type { FC } from 'react';

import { doc, onSnapshot } from 'firebase/firestore';

import { db } from '../firebase';
import { PROFILE_BUCKET, getSignedUrl } from '../services/photoService';

export type UserProfile = {
  name: string;
  photoUrl: string;
};

// Live name and profile photo of any user (from their public profile).
export const useUserProfile = (uid: string): UserProfile => {
  const [name, setName] = useState('');
  const [photoPath, setPhotoPath] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  useEffect(() => {
    setName('');
    setPhotoPath('');

    if (!uid) {
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'publicProfiles', uid),
      (snapshot) => {
        const data = snapshot.data();
        setName(String(data?.displayName ?? '').trim());
        setPhotoPath(String(data?.photoPath ?? ''));
      },
      (error) => {
        console.warn('Public profile listener error:', error);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    let cancelled = false;

    if (!photoPath) {
      setPhotoUrl('');
      return;
    }

    getSignedUrl(PROFILE_BUCKET, photoPath)
      .then((url) => {
        if (!cancelled) setPhotoUrl(url);
      })
      .catch((error) => {
        console.warn('Profile photo could not be loaded:', error);
        if (!cancelled) setPhotoUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [photoPath]);

  return { name, photoUrl };
};

const getInitials = (name: string) => {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return letters || '?';
};

type UserAvatarProps = {
  name: string;
  photoUrl?: string;
  size?: number;
};

// Round avatar: the photo, or the initials if there is no photo.
const UserAvatar: FC<UserAvatarProps> = ({ name, photoUrl, size = 44 }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [photoUrl]);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        background: '#0F766E',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {photoUrl && !failed ? (
        <img
          src={photoUrl}
          alt=""
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        getInitials(name)
      )}
    </div>
  );
};

export default UserAvatar;