import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { auth, db } from '../firebase';

export type MessagingItem = {
  id: string;
  name: string;
  type: 'Lost' | 'Found';
  userId?: string;
  reporterName?: string;
};

/**
 * Opens (or creates) the conversation between the current user and the
 * reporter of an item. There is one conversation per item per user, so the
 * conversation ID is "<itemId>_<otherUserId>".
 *
 * - Found item: the reporter is the finder; the user who messages is the owner.
 * - Lost item: the reporter is the owner; the user who messages is the finder.
 */
export const startConversation = async (
  item: MessagingItem
): Promise<string> => {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('Please log in to send a message.');
  }

  if (!item.userId) {
    throw new Error('This report has no reporter to message.');
  }

  if (item.userId === user.uid) {
    throw new Error('This is your own report.');
  }

  const conversationId = `${item.id}_${user.uid}`;
  const conversationRef = doc(db, 'conversations', conversationId);

  const existingConversation = await getDoc(conversationRef);

  if (!existingConversation.exists()) {
    const isLostReport = item.type === 'Lost';

    await setDoc(conversationRef, {
      itemId: item.id,
      itemName: item.name,
      itemType: item.type,
      reporterId: item.userId,
      reporterName: item.reporterName ?? '',
      otherId: user.uid,
      otherName:
        user.displayName?.trim() ||
        user.email?.split('@')[0] ||
        'FindIt user',
      participants: [item.userId, user.uid],
      ownerId: isLostReport ? item.userId : user.uid,
      finderId: isLostReport ? user.uid : item.userId,
      lastMessage: '',
      lastMessageAt: serverTimestamp(),
      lastSenderId: '',
      readAt: { [user.uid]: serverTimestamp() },
      createdAt: serverTimestamp(),
    });
  }

  return conversationId;
};
