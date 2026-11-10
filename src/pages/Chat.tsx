import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FC, KeyboardEvent } from 'react';

import {
  IonAlert,
  IonBadge,
  IonButton,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react';

import {
  arrowBackOutline,
  checkmarkCircleOutline,
  closeOutline,
  imageOutline,
  sendOutline,
} from 'ionicons/icons';

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { auth, db } from '../firebase';
import UserAvatar, { useUserProfile } from '../components/UserAvatar';
import {
  CHAT_BUCKET,
  MISSING_ROLE_ERROR,
  getSignedUrl,
  uploadChatImage,
} from '../services/photoService';

type ChatProps = {
  conversationId: string;
  onBack: () => void;
};

type TimestampLike = {
  toDate?: () => Date;
} | null;

type ConversationData = {
  id: string;
  itemId: string;
  itemName: string;
  itemType: 'Lost' | 'Found';
  reporterId: string;
  reporterName: string;
  otherId: string;
  otherName: string;
  ownerId: string;
  finderId: string;
  lastMessageAt?: TimestampLike;
  lastSenderId: string;
  readAt: Record<string, TimestampLike>;
};

type ChatMessage = {
  id: string;
  senderId: string;
  text: string;
  imagePath: string;
  createdAt?: TimestampLike;
};

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const getTime = (value?: TimestampLike) =>
  value?.toDate?.()?.getTime?.() ?? 0;

const formatTime = (value?: TimestampLike) => {
  const date = value?.toDate?.();

  if (!date) {
    return 'Sending...';
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getSendErrorMessage = (error: unknown) => {
  const code = (error as { code?: string } | null)?.code;
  const rawMessage =
    error instanceof Error
      ? error.message
      : String((error as { message?: string } | null)?.message ?? error);

  if (rawMessage === MISSING_ROLE_ERROR) {
    return 'Your account is missing upload permission. Log out, log in again, and try again.';
  }

  if (rawMessage.toLowerCase().includes('row-level security')) {
    return 'The Supabase Storage policy blocked the image upload.';
  }

  if (code === 'permission-denied') {
    return 'Firestore rules blocked sending this message.';
  }

  return 'Could not send your message. Check your connection and try again.';
};

type ChatImageProps = {
  path: string;
  onOpen: (url: string) => void;
  onLoaded: () => void;
};

// Shows an image that was sent in the chat.
const ChatImage: FC<ChatImageProps> = ({ path, onOpen, onLoaded }) => {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    getSignedUrl(CHAT_BUCKET, path)
      .then((signedUrl) => {
        if (!cancelled) setUrl(signedUrl);
      })
      .catch((error) => {
        console.error('Chat image error:', error);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  if (failed) {
    return <div style={{ fontSize: '13px' }}>Could not load the image.</div>;
  }

  if (!url) {
    return (
      <div
        style={{
          width: '180px',
          height: '120px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <IonSpinner name="crescent" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt="Sent photo"
      onClick={() => onOpen(url)}
      onLoad={onLoaded}
      onError={() => setFailed(true)}
      style={{
        display: 'block',
        maxWidth: '100%',
        maxHeight: '260px',
        borderRadius: '10px',
        cursor: 'pointer',
      }}
    />
  );
};

const Chat: FC<ChatProps> = ({ conversationId, onBack }) => {
  const [conversation, setConversation] = useState<ConversationData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [itemStatus, setItemStatus] = useState('');
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [viewerUrl, setViewerUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [marking, setMarking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastMarkedReadRef = useRef(0);

  const me = auth.currentUser?.uid ?? '';

  const otherUid = conversation
    ? me === conversation.reporterId
      ? conversation.otherId
      : conversation.reporterId
    : '';

  const otherProfile = useUserProfile(otherUid);

  // Listen to the conversation.
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'conversations', conversationId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setConversation(null);
          setError('This conversation was not found.');
          setLoading(false);
          return;
        }

        const data = snapshot.data();

        setConversation({
          id: snapshot.id,
          itemId: String(data.itemId ?? ''),
          itemName: String(data.itemName ?? 'Item'),
          itemType: data.itemType === 'Found' ? 'Found' : 'Lost',
          reporterId: String(data.reporterId ?? ''),
          reporterName: String(data.reporterName ?? ''),
          otherId: String(data.otherId ?? ''),
          otherName: String(data.otherName ?? ''),
          ownerId: String(data.ownerId ?? ''),
          finderId: String(data.finderId ?? ''),
          lastMessageAt: data.lastMessageAt ?? null,
          lastSenderId: String(data.lastSenderId ?? ''),
          readAt: (data.readAt ?? {}) as Record<string, TimestampLike>,
        });

        setLoading(false);
        setError('');
      },
      (snapshotError) => {
        console.error('Conversation listener error:', snapshotError);
        setError('Could not open this conversation.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [conversationId]);

  // Listen to the messages.
  useEffect(() => {
    const messagesQuery = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        setMessages(
          snapshot.docs.map((messageDoc) => {
            const data = messageDoc.data();

            return {
              id: messageDoc.id,
              senderId: String(data.senderId ?? ''),
              text: String(data.text ?? ''),
              imagePath: String(data.imagePath ?? ''),
              createdAt: data.createdAt ?? null,
            };
          })
        );
      },
      (snapshotError) => {
        console.error('Messages listener error:', snapshotError);
        setError('Could not load the messages.');
      }
    );

    return () => unsubscribe();
  }, [conversationId]);

  // Listen to the item's status.
  const itemId = conversation?.itemId;

  useEffect(() => {
    if (!itemId) {
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'items', itemId),
      (snapshot) => {
        setItemStatus(
          snapshot.exists() ? String(snapshot.data().status ?? 'Active') : 'Missing'
        );
      },
      () => setItemStatus('')
    );

    return () => unsubscribe();
  }, [itemId]);

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Release the temporary preview of the selected image.
  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  // Mark the conversation as read when there are new messages from the other user.
  useEffect(() => {
    if (!conversation || !me) {
      return;
    }

    const lastAt = getTime(conversation.lastMessageAt);
    const readAt = getTime(conversation.readAt[me]);

    if (
      conversation.lastSenderId &&
      conversation.lastSenderId !== me &&
      lastAt > readAt &&
      lastMarkedReadRef.current !== lastAt
    ) {
      lastMarkedReadRef.current = lastAt;

      void updateDoc(doc(db, 'conversations', conversation.id), {
        [`readAt.${me}`]: serverTimestamp(),
      }).catch((readError) => {
        console.error('Mark as read error:', readError);
      });
    }
  }, [conversation, me]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview('');
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError('Only JPG, PNG, or WEBP images are allowed.');
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setError('The maximum image size is 15 MB.');
      return;
    }

    setError('');
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSend = async () => {
    const user = auth.currentUser;
    const trimmed = text.trim();

    if (!user || !conversation || (!trimmed && !imageFile)) {
      return;
    }

    if (trimmed.length > 1000) {
      setError('Your message is too long. The maximum is 1000 characters.');
      return;
    }

    setSending(true);
    setError('');

    try {
      let imagePath = '';

      if (imageFile) {
        imagePath = await uploadChatImage(imageFile, conversation.id);
      }

      const batch = writeBatch(db);

      const messageRef = doc(
        collection(db, 'conversations', conversation.id, 'messages')
      );

      const messageData: Record<string, unknown> = {
        senderId: user.uid,
        text: trimmed,
        createdAt: serverTimestamp(),
      };

      if (imagePath) {
        messageData.imagePath = imagePath;
      }

      batch.set(messageRef, messageData);

      const lastMessage = imagePath
        ? trimmed
          ? `📷 ${trimmed}`
          : '📷 Photo'
        : trimmed;

      batch.update(doc(db, 'conversations', conversation.id), {
        lastMessage: lastMessage.slice(0, 120),
        lastMessageAt: serverTimestamp(),
        lastSenderId: user.uid,
        [`readAt.${user.uid}`]: serverTimestamp(),
      });

      await batch.commit();
      setText('');
      clearImage();
    } catch (sendError) {
      console.error('Send message error:', sendError);
      setError(getSendErrorMessage(sendError));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLIonInputElement>) => {
    if (event.key === 'Enter' && !sending) {
      event.preventDefault();
      void handleSend();
    }
  };

  // The owner confirms that the item was received.
  const handleMarkClaimed = async () => {
    const user = auth.currentUser;

    if (!user || !conversation) {
      return;
    }

    setMarking(true);
    setError('');

    try {
      const ownerIsReporter = conversation.ownerId === conversation.reporterId;

      const ownerName =
        (ownerIsReporter ? conversation.reporterName : conversation.otherName) ||
        'FindIt user';

      const finderName =
        (ownerIsReporter ? conversation.otherName : conversation.reporterName) ||
        'FindIt user';

      const batch = writeBatch(db);

      // History record for the Admin (one record per item).
      batch.set(doc(db, 'claimRecords', conversation.itemId), {
        itemId: conversation.itemId,
        itemName: conversation.itemName,
        itemType: conversation.itemType,
        conversationId: conversation.id,
        reporterId: conversation.reporterId,
        ownerId: conversation.ownerId,
        ownerName,
        finderId: conversation.finderId,
        finderName,
        claimedAt: serverTimestamp(),
      });

      batch.update(doc(db, 'items', conversation.itemId), {
        status: 'Claimed',
        claimedAt: serverTimestamp(),
        claimedBy: user.uid,
      });

      await batch.commit();
    } catch (markError) {
      console.error('Mark as claimed error:', markError);
      setError('Could not mark the item as claimed. Please try again.');
    } finally {
      setMarking(false);
    }
  };

  const storedOtherName = conversation
    ? me === conversation.reporterId
      ? conversation.otherName
      : conversation.reporterName
    : '';

  const otherName = conversation
    ? otherProfile.name || storedOtherName || 'FindIt user'
    : '';

  const iAmOwner = Boolean(conversation) && me === conversation?.ownerId;
  const canMarkClaimed = iAmOwner && itemStatus === 'Active';
  const alreadyClaimed = itemStatus === 'Claimed' || itemStatus === 'Resolved';

  return (
    <IonPage>
      <IonHeader className="findit-header">
        <IonToolbar>
          <IonButton
            slot="start"
            fill="clear"
            aria-label="Back to messages"
            onClick={onBack}
          >
            <IonIcon icon={arrowBackOutline} />
          </IonButton>

          <IonTitle>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {conversation && (
                <UserAvatar
                  name={otherName}
                  photoUrl={otherProfile.photoUrl}
                  size={32}
                />
              )}
              <span>{otherName || 'Chat'}</span>
            </div>
          </IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding">
        {loading ? (
          <div className="empty-state">
            <IonSpinner name="crescent" />
            <p>Opening conversation...</p>
          </div>
        ) : !conversation ? (
          <p className="findit-message error-message" role="alert">
            {error || 'This conversation could not be opened.'}
          </p>
        ) : (
          <>
            <div
              style={{
                background: '#E6F7F3',
                borderRadius: '12px',
                padding: '12px',
                marginBottom: '12px',
              }}
            >
              <strong>{conversation.itemName}</strong>{' '}
              <IonBadge color={conversation.itemType === 'Found' ? 'success' : 'tertiary'}>
                {conversation.itemType}
              </IonBadge>{' '}
              {itemStatus && (
                <IonBadge
                  color={
                    itemStatus === 'Active'
                      ? 'primary'
                      : itemStatus === 'Missing'
                        ? 'medium'
                        : 'warning'
                  }
                >
                  {itemStatus === 'Missing' ? 'Report removed' : itemStatus}
                </IonBadge>
              )}

              <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#718582' }}>
                {iAmOwner
                  ? 'You are the owner of this item.'
                  : 'The other user is the owner of this item.'}
              </p>

              {alreadyClaimed && (
                <p style={{ margin: '8px 0 0', fontSize: '13px', fontWeight: 700 }}>
                  This item has been marked as claimed.
                </p>
              )}

              {canMarkClaimed && (
                <IonButton
                  size="small"
                  color="success"
                  style={{ marginTop: '8px' }}
                  disabled={marking}
                  onClick={() => setConfirmOpen(true)}
                >
                  <IonIcon icon={checkmarkCircleOutline} slot="start" />
                  {marking ? 'Saving...' : 'I received my item'}
                </IonButton>
              )}
            </div>

            {error && (
              <p className="findit-message error-message" role="alert">
                {error}
              </p>
            )}

            {messages.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#718582' }}>
                No messages yet. Say hello and describe the item.
              </p>
            ) : (
              messages.map((message, index) => {
                const mine = message.senderId === me;
                const isLastOfGroup =
                  messages[index + 1]?.senderId !== message.senderId;

                return (
                  <div
                    key={message.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-end',
                      gap: '6px',
                      justifyContent: mine ? 'flex-end' : 'flex-start',
                      marginBottom: '8px',
                    }}
                  >
                    {!mine && (
                      <div style={{ width: '28px', flexShrink: 0 }}>
                        {isLastOfGroup && (
                          <UserAvatar
                            name={otherName}
                            photoUrl={otherProfile.photoUrl}
                            size={28}
                          />
                        )}
                      </div>
                    )}

                    <div
                      style={{
                        maxWidth: '75%',
                        padding: '10px 12px',
                        borderRadius: '14px',
                        background: mine ? '#0F766E' : '#E6F7F3',
                        color: mine ? '#ffffff' : '#183B39',
                        overflowWrap: 'anywhere',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {message.imagePath && (
                        <div style={{ marginBottom: message.text ? '6px' : 0 }}>
                          <ChatImage
                            path={message.imagePath}
                            onOpen={setViewerUrl}
                            onLoaded={scrollToBottom}
                          />
                        </div>
                      )}

                      {message.text && <div>{message.text}</div>}

                      <div
                        style={{
                          fontSize: '11px',
                          opacity: 0.75,
                          marginTop: '4px',
                          textAlign: 'right',
                        }}
                      >
                        {formatTime(message.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            <div ref={bottomRef} />
          </>
        )}
      </IonContent>

      {conversation && (
        <IonFooter>
          <IonToolbar>
            {imagePreview && (
              <div
                style={{
                  position: 'relative',
                  display: 'inline-block',
                  margin: '8px 12px 0',
                }}
              >
                <img
                  src={imagePreview}
                  alt="Selected"
                  style={{ height: '80px', borderRadius: '10px', display: 'block' }}
                />

                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={clearImage}
                  disabled={sending}
                  style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '-8px',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    border: 'none',
                    background: '#183B39',
                    color: '#ffffff',
                    fontSize: '14px',
                    lineHeight: '24px',
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 8px',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                style={{ display: 'none' }}
                aria-label="Choose an image to send"
              />

              <IonButton
                fill="clear"
                aria-label="Attach an image"
                disabled={sending}
                onClick={() => fileInputRef.current?.click()}
              >
                <IonIcon icon={imageOutline} slot="icon-only" />
              </IonButton>

              <IonInput
                value={text}
                placeholder="Type a message..."
                maxlength={1000}
                disabled={sending}
                onIonInput={(event) => setText(String(event.detail.value ?? ''))}
                onKeyDown={handleKeyDown}
                style={{ flex: 1 }}
              />

              <IonButton
                onClick={() => void handleSend()}
                disabled={sending || (!text.trim() && !imageFile)}
                aria-label="Send message"
              >
                {sending ? (
                  <IonSpinner name="crescent" />
                ) : (
                  <IonIcon icon={sendOutline} slot="icon-only" />
                )}
              </IonButton>
            </div>
          </IonToolbar>
        </IonFooter>
      )}

      {/* Full-size image viewer */}
      <IonModal isOpen={viewerUrl !== ''} onDidDismiss={() => setViewerUrl('')}>
        <IonHeader>
          <IonToolbar>
            <IonTitle>Photo</IonTitle>

            <IonButton
              slot="end"
              fill="clear"
              aria-label="Close photo"
              onClick={() => setViewerUrl('')}
            >
              <IonIcon icon={closeOutline} />
            </IonButton>
          </IonToolbar>
        </IonHeader>

        <IonContent>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '100%',
              background: '#000000',
            }}
          >
            {viewerUrl && (
              <img
                src={viewerUrl}
                alt="Full size"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            )}
          </div>
        </IonContent>
      </IonModal>

      <IonAlert
        isOpen={confirmOpen}
        header="Confirm"
        message="Confirm only if you already received your item. This will be recorded in the claim history and cannot be undone."
        buttons={[
          {
            text: 'Cancel',
            role: 'cancel',
            handler: () => setConfirmOpen(false),
          },
          {
            text: 'Yes, I received it',
            handler: () => {
              setConfirmOpen(false);
              void handleMarkClaimed();
            },
          },
        ]}
        onDidDismiss={() => setConfirmOpen(false)}
      />
    </IonPage>
  );
};

export default Chat;