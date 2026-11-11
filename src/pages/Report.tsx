import { useRef, useState } from 'react';
import type { FC, ChangeEvent } from 'react';

import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonTitle,
  IonToolbar,
  IonAlert,
  IonSpinner,
} from '@ionic/react';

import {
  addCircleOutline,
  arrowBackOutline,
  bagHandleOutline,
  calendarOutline,
  cameraOutline,
  closeOutline,
  documentTextOutline,
  locationOutline,
  pricetagOutline,
  searchOutline,
} from 'ionicons/icons';

import {
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';

import { auth, db } from '../firebase';
import { supabase } from '../supabase';
import { ensureAuthenticatedRole } from '../services/claimService';
import type { AppTab } from '../App';
import { ITEM_CATEGORIES, DEFAULT_CATEGORY } from '../constants/categories';
import type { ItemCategory } from '../constants/categories';

import './Home.css';
import './Report.css';

const getTodayDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

type ReportProps = {
  onTabChange: (tab: AppTab) => void;
};

const Report: FC<ReportProps> = ({ onTabChange }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<'Lost' | 'Found'>('Lost');
  const [category, setCategory] = useState<ItemCategory>(DEFAULT_CATEGORY);
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(getTodayDate());
  const [description, setDescription] = useState('');

  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file.');
      event.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be 5 MB or less.');
      event.target.value = '';
      return;
    }

    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }

    setSelectedPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError('');
  };

  const removePhoto = () => {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }

    setSelectedPhoto(null);
    setPhotoPreview('');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const resetForm = () => {
    setName('');
    setType('Lost');
    setCategory(DEFAULT_CATEGORY);
    setLocation('');
    setDate(getTodayDate());
    setDescription('');
    setError('');
    removePhoto();
  };

  const submitReport = async () => {
    const user = auth.currentUser;

    if (!user) {
      setError('Please log in before submitting a report.');
      return;
    }

    // Refresh the Firebase token so the latest custom claims are included,
    // then read the role that Supabase will see.
    let firebaseRole: unknown;

    try {
      // Add the upload role first if this is a new account.
      if (selectedPhoto) {
        await ensureAuthenticatedRole(user);
      }

      await user.getIdToken(true);

      const tokenResult = await user.getIdTokenResult();
      firebaseRole = tokenResult.claims.role;
    } catch (tokenError) {
      console.error('Could not read Firebase token claims:', tokenError);
    }

    if (
      !name.trim() ||
      !location.trim() ||
      !date ||
      !description.trim()
    ) {
      setError('Please fill in all required fields.');
      return;
    }

    setSaving(true);
    setError('');

    let uploadedImagePath = '';

    try {
      let imageUrl = '';

      // Upload selected image to Supabase Storage.
      if (selectedPhoto) {
        if (firebaseRole !== 'authenticated') {
          throw new Error(
            'Your login token has no "authenticated" role yet. Please log out, log in again, and try again. If this keeps happening, check your internet connection.',
          );
        }

        const fileExtension =
          selectedPhoto.name.split('.').pop()?.toLowerCase() || 'jpg';

        const imagePath = `${user.uid}/${Date.now()}-${crypto.randomUUID()}.${fileExtension}`;

        const { error: uploadError } = await supabase.storage
          .from('item-photos')
          .upload(imagePath, selectedPhoto, {
            cacheControl: '3600',
            upsert: false,
            contentType: selectedPhoto.type,
          });

        if (uploadError) {
          throw new Error(`Photo upload failed: ${uploadError.message}`);
        }

        uploadedImagePath = imagePath;

        const { data: publicUrlData } = supabase.storage
          .from('item-photos')
          .getPublicUrl(imagePath);

        imageUrl = publicUrlData.publicUrl;
      }

      // Save report details and image URL to Firestore.
      await addDoc(collection(db, 'items'), {
        name: name.trim(),
        type,
        category,
        location: location.trim(),
        date,
        description: description.trim(),
        status: 'Active',
        userId: user.uid,
        reporterName:
          user.displayName?.trim() ||
          user.email?.split('@')[0] ||
          'FindIt user',
        imageUrl,
        imagePath: uploadedImagePath,
        createdAt: serverTimestamp(),
      });

      resetForm();
      setShowSuccess(true);
    } catch (err) {
      console.error('Report submission error:', err);

      if (uploadedImagePath) {
        console.warn(
          'The image was uploaded but the report may not have been saved. Uploaded image path:',
          uploadedImagePath,
        );
      }

      setError(
        err instanceof Error
          ? err.message
          : 'Could not submit the report. Please check your connection and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <IonPage>
      <IonHeader className="findit-header">
        <IonToolbar>
          <IonButton
            slot="start"
            fill="clear"
            aria-label="Back to Home"
            onClick={() => onTabChange('home')}
          >
            <IonIcon icon={arrowBackOutline} />
          </IonButton>

          <IonTitle>Report an Item</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="findit-content">
        <section className="welcome-section rp-hero">
          <p className="eyebrow">NEW REPORT</p>
          <h1>What happened?</h1>
          <p className="welcome-description">
            Fill in the details so the owner or finder can recognize the item.
          </p>
        </section>

        <div className="rp-body">
          {/* Lost or Found */}
          <div className="rp-type-toggle" role="radiogroup" aria-label="Report type">
            <button
              type="button"
              role="radio"
              aria-checked={type === 'Lost'}
              className={`rp-type rp-type-lost ${type === 'Lost' ? 'is-active' : ''}`}
              disabled={saving}
              onClick={() => setType('Lost')}
            >
              <span className="rp-type-icon">
                <IonIcon icon={searchOutline} />
              </span>
              <strong>I lost something</strong>
              <small>Ask others to help find it</small>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={type === 'Found'}
              className={`rp-type rp-type-found ${type === 'Found' ? 'is-active' : ''}`}
              disabled={saving}
              onClick={() => setType('Found')}
            >
              <span className="rp-type-icon">
                <IonIcon icon={bagHandleOutline} />
              </span>
              <strong>I found something</strong>
              <small>Help return it to the owner</small>
            </button>
          </div>

          {/* Photo */}
          <section className="rp-card">
            <h2 className="rp-card-title">
              <IonIcon icon={cameraOutline} /> Photo
              <span className="rp-optional">Optional</span>
            </h2>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              style={{ display: 'none' }}
              aria-label="Choose a photo of the item"
            />

            {photoPreview ? (
              <div className="rp-photo-preview">
                <img src={photoPreview} alt="Selected item preview" />

                <button
                  type="button"
                  className="rp-photo-remove"
                  aria-label="Remove photo"
                  disabled={saving}
                  onClick={removePhoto}
                >
                  <IonIcon icon={closeOutline} />
                </button>

                <button
                  type="button"
                  className="rp-photo-change"
                  disabled={saving}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <IonIcon icon={cameraOutline} /> Change
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="rp-dropzone"
                disabled={saving}
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="rp-dropzone-icon">
                  <IonIcon icon={cameraOutline} />
                </span>
                <strong>Add a photo</strong>
                <small>A clear photo makes the item easier to recognize · max 5 MB</small>
              </button>
            )}
          </section>

          {/* Item details */}
          <section className="rp-card">
            <h2 className="rp-card-title">
              <IonIcon icon={pricetagOutline} /> Item details
            </h2>

            <div className="rp-field">
              <span className="rp-label">
                Item name <span className="rp-req">*</span>
              </span>
              <IonInput
                className="rp-input"
                aria-label="Item name"
                value={name}
                maxlength={80}
                placeholder="e.g. Black backpack"
                disabled={saving}
                onIonInput={(event) => setName(String(event.detail.value ?? ''))}
              />
            </div>

            <div className="rp-field">
              <span className="rp-label">Category</span>
              <IonSelect
                className="rp-input"
                aria-label="Category"
                value={category}
                interface="popover"
                placeholder="Choose a category"
                disabled={saving}
                onIonChange={(event) =>
                  setCategory(event.detail.value as ItemCategory)
                }
              >
                {ITEM_CATEGORIES.map((itemCategory) => (
                  <IonSelectOption key={itemCategory} value={itemCategory}>
                    {itemCategory}
                  </IonSelectOption>
                ))}
              </IonSelect>
            </div>
          </section>

          {/* Where and when */}
          <section className="rp-card">
            <h2 className="rp-card-title">
              <IonIcon icon={locationOutline} /> Where and when
            </h2>

            <div className="rp-field">
              <span className="rp-label">
                Location <span className="rp-req">*</span>
              </span>
              <IonInput
                className="rp-input"
                aria-label="Location"
                value={location}
                maxlength={120}
                placeholder={
                  type === 'Lost'
                    ? 'Where did you last have it?'
                    : 'Where did you find it?'
                }
                disabled={saving}
                onIonInput={(event) =>
                  setLocation(String(event.detail.value ?? ''))
                }
              />
            </div>

            <div className="rp-field">
              <span className="rp-label">
                <IonIcon icon={calendarOutline} /> Date{' '}
                <span className="rp-req">*</span>
              </span>
              <IonInput
                className="rp-input"
                aria-label="Date"
                type="date"
                value={date}
                max={getTodayDate()}
                disabled={saving}
                onIonInput={(event) => setDate(String(event.detail.value ?? ''))}
              />
            </div>
          </section>

          {/* Description */}
          <section className="rp-card">
            <h2 className="rp-card-title">
              <IonIcon icon={documentTextOutline} /> Description{' '}
              <span className="rp-req">*</span>
            </h2>

            <IonTextarea
              className="rp-input rp-textarea"
              aria-label="Description"
              value={description}
              maxlength={500}
              counter
              autoGrow
              placeholder="Color, brand, size, stickers, what's inside… anything that helps identify it."
              disabled={saving}
              onIonInput={(event) =>
                setDescription(String(event.detail.value ?? ''))
              }
            />
          </section>

          {error && (
            <p className="findit-message error-message" role="alert">
              {error}
            </p>
          )}

          <IonButton
            expand="block"
            className="rp-submit"
            disabled={saving}
            onClick={() => void submitReport()}
          >
            {saving ? (
              <IonSpinner name="crescent" />
            ) : (
              <>
                <IonIcon icon={addCircleOutline} slot="start" />
                Submit {type} Report
              </>
            )}
          </IonButton>

          <IonButton
            expand="block"
            fill="clear"
            className="rp-cancel"
            disabled={saving}
            onClick={() => onTabChange('home')}
          >
            Cancel
          </IonButton>
        </div>
      </IonContent>

      <IonAlert
        isOpen={showSuccess}
        header="Report Submitted"
        message="Your report has been submitted successfully. You can view it in My Reports."
        buttons={[
          {
            text: 'View My Reports',
            handler: () => onTabChange('myreports'),
          },
          {
            text: 'Back to Home',
            handler: () => onTabChange('home'),
          },
        ]}
        onDidDismiss={() => setShowSuccess(false)}
      />
    </IonPage>
  );
};

export default Report;