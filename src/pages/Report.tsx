import { useRef, useState } from 'react';
import type { FC, ChangeEvent } from 'react';

import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonLabel,
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
  locationOutline,
  calendarOutline,
  documentTextOutline,
  imageOutline,
  closeCircleOutline,
} from 'ionicons/icons';

import {
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';

import { auth, db } from '../firebase';
import { supabase } from '../supabase';
import type { AppTab } from '../App';
import { ITEM_CATEGORIES, DEFAULT_CATEGORY } from '../constants/categories';
import type { ItemCategory } from '../constants/categories';

import './Home.css';

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
    // then log the role and sub that Supabase will see.
    let firebaseRole: unknown;

    try {
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
      setError('Please fill in all report fields.');
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

          <IonTitle>
            <span className="brand-pin">●</span> Report an Item
          </IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="findit-content ion-padding">
        <section className="welcome-section">
          <p className="eyebrow">UNIVERSITY LOST &amp; FOUND</p>
          <h1>Report an Item</h1>
          <p className="welcome-description">
            Help reunite lost belongings with their owners by providing
            the details below.
          </p>
        </section>

        <div className="report-form">
          {/* Item Photo */}
          <IonLabel position="stacked">Item Photo</IonLabel>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            style={{ display: 'none' }}
          />

          <IonButton
            expand="block"
            fill="outline"
            disabled={saving}
            onClick={() => fileInputRef.current?.click()}
          >
            <IonIcon icon={imageOutline} slot="start" />
            {selectedPhoto ? 'Change Photo' : 'Choose Photo'}
          </IonButton>

          {photoPreview && (
            <div className="report-photo-preview">
              <img
                src={photoPreview}
                alt="Selected item preview"
                style={{
                  display: 'block',
                  width: '100%',
                  maxHeight: '280px',
                  objectFit: 'contain',
                  borderRadius: '12px',
                  marginTop: '12px',
                }}
              />

              <IonButton
                expand="block"
                fill="clear"
                color="danger"
                disabled={saving}
                onClick={removePhoto}
              >
                <IonIcon icon={closeCircleOutline} slot="start" />
                Remove Photo
              </IonButton>
            </div>
          )}

          <p style={{ fontSize: '12px', color: '#718582' }}>
            Optional. Image files only, maximum 5 MB.
          </p>

          {/* Item Name */}
          <IonLabel position="stacked">Item Name</IonLabel>
          <IonInput
            className="report-input"
            value={name}
            placeholder="e.g. Black backpack"
            onIonInput={(event) =>
              setName(String(event.detail.value ?? ''))
            }
          />

          {/* Report Type */}
          <IonLabel position="stacked">Report Type</IonLabel>
          <IonSelect
            className="report-input"
            value={type}
            interface="popover"
            placeholder="Choose Lost or Found"
            onIonChange={(event) =>
              setType(event.detail.value as 'Lost' | 'Found')
            }
          >
            <IonSelectOption value="Lost">Lost Item</IonSelectOption>
            <IonSelectOption value="Found">Found Item</IonSelectOption>
          </IonSelect>

          {/* Category */}
          <IonLabel position="stacked">Category</IonLabel>
          <IonSelect
            className="report-input"
            value={category}
            interface="popover"
            placeholder="Choose a category"
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

          {/* Location */}
          <IonLabel position="stacked">
            <IonIcon icon={locationOutline} /> Location
          </IonLabel>
          <IonInput
            className="report-input"
            value={location}
            placeholder="Where was it lost or found?"
            onIonInput={(event) =>
              setLocation(String(event.detail.value ?? ''))
            }
          />

          {/* Date */}
          <IonLabel position="stacked">
            <IonIcon icon={calendarOutline} /> Date
          </IonLabel>
          <IonInput
            className="report-input"
            type="date"
            value={date}
            onIonInput={(event) =>
              setDate(String(event.detail.value ?? ''))
            }
          />

          {/* Description */}
          <IonLabel position="stacked">
            <IonIcon icon={documentTextOutline} /> Description
          </IonLabel>
          <IonTextarea
            className="report-input"
            value={description}
            placeholder="Describe the item, its color, brand, or other identifying details."
            autoGrow
            onIonInput={(event) =>
              setDescription(String(event.detail.value ?? ''))
            }
          />

          {error && (
            <p className="findit-message error-message" role="alert">
              {error}
            </p>
          )}

          {/* Submit */}
          <IonButton
            expand="block"
            className="submit-report-button"
            disabled={saving}
            onClick={() => void submitReport()}
          >
            {saving ? (
              <IonSpinner name="crescent" />
            ) : (
              <>
                <IonIcon icon={addCircleOutline} slot="start" />
                Submit Report
              </>
            )}
          </IonButton>

          {/* Cancel */}
          <IonButton
            expand="block"
            fill="outline"
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