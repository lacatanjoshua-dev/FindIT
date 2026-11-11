import { useEffect, useState } from 'react';

import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

import { auth, db } from '../firebase';

type TimestampLike = { toDate?: () => Date } | null | undefined;

const getTime = (value: TimestampLike) => value?.toDate?.()?.getTime?.() ?? 0;

/**
 * Live number of conversations with a message the current user has not read.
 * Used for the red badge on the Messages tab.
 */
export const useUnreadMessagesCount = (): number => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let unsubscribeConversations: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeConversations?.();
      unsubscribeConversations = undefined;

      if (!user) {
        setCount(0);
        return;
      }

      unsubscribeConversations = onSnapshot(
        query(
          collection(db, 'conversations'),
          where('participants', 'array-contains', user.uid)
        ),
        (snapshot) => {
          let unread = 0;

          snapshot.forEach((conversationDoc) => {
            const data = conversationDoc.data();
            const lastSenderId = String(data.lastSenderId ?? '');
            const readAt = (data.readAt ?? {}) as Record<string, TimestampLike>;

            if (
              lastSenderId &&
              lastSenderId !== user.uid &&
              getTime(data.lastMessageAt) > getTime(readAt[user.uid])
            ) {
              unread += 1;
            }
          });

          setCount(unread);
        },
        (error) => {
          console.error('Unread messages listener error:', error);
          setCount(0);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeConversations?.();
    };
  }, []);

  return count;
};