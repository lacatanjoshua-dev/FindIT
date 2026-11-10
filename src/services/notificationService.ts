import {
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
 
import { db } from '../firebase';
 
// Claim decisions use Approved / Rejected.
// Report status updates use Active / Claimed / Resolved.
export type NotificationStatus =
  | 'Approved'
  | 'Rejected'
  | 'Active'
  | 'Claimed'
  | 'Resolved';
 
export type FindItNotification = {
  id: string;
  userId: string;
  title: string;
  message: string;
  itemId?: string;
  claimId?: string;
  status?: NotificationStatus;
  isRead: boolean;
  createdAt?: unknown;
};
 
/**
 * Creates a notification for a specific FindIt user.
 */
export const createNotification = async ({
  userId,
  title,
  message,
  itemId,
  claimId,
  status,
}: {
  userId: string;
  title: string;
  message: string;
  itemId?: string;
  claimId?: string;
  status?: NotificationStatus;
}) => {
  if (!userId) {
    throw new Error('Notification recipient user ID is required.');
  }
 
  await addDoc(collection(db, 'notifications'), {
    userId,
    title,
    message,
    itemId: itemId ?? null,
    claimId: claimId ?? null,
    status: status ?? null,
    isRead: false,
    createdAt: serverTimestamp(),
  });
};
 