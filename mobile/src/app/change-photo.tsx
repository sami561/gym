import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ApiError } from '@/api/client';
import type { MemberDto } from '@/api/types';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { MemberAvatar } from '@/components/MemberAvatar';
import { ModalScreen } from '@/components/ModalScreen';
import { ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useDeletePhoto, useMe, useUploadPhoto } from '@/hooks/queries';
import { useI18n, type TranslationKey } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { PhotoTooLargeError, preparePhoto } from '@/lib/preparePhoto';
import { colors, spacing } from '@/theme';

type Action = 'camera' | 'library' | 'remove';
type Notice = { kind: 'camera-denied'; canAskAgain: boolean } | { kind: 'error'; message: string };

const PREVIEW_SIZE = 168;

/** Square crop in the system editor (always square on iOS); preparePhoto then resizes and compresses once. */
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: 'images',
  allowsEditing: true,
  aspect: [1, 1],
  quality: 1,
};

function photoError(error: unknown, t: (key: TranslationKey) => string): string {
  if (error instanceof PhotoTooLargeError) return t('photo.tooLarge');
  // Server refusals are French and ready to show (400 not a JPEG, 413 over 512 KB, 429).
  if (error instanceof ApiError) return errorMessage(error, t);
  return t('photo.failed');
}

function PhotoChoices({ member }: { member: MemberDto }) {
  const { t } = useI18n();
  const toast = useToast();
  const navigation = useNavigation();
  const upload = useUploadPhoto();
  const remove = useDeletePhoto();
  const [busy, setBusy] = useState<Action | null>(null);
  /** The prepared JPEG, shown while it uploads. */
  const [preview, setPreview] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const succeed = (message: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    toast(message);
    // Back to the profile, unless the member already left this screen during the upload.
    if (!navigation.isFocused()) return;
    if (router.canGoBack()) router.back();
    else router.replace('/profile');
  };

  const fail = (error: unknown) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    setPreview(null);
    setNotice({ kind: 'error', message: photoError(error, t) });
  };

  const pick = async (action: 'camera' | 'library') => {
    if (busy) return;
    setNotice(null);
    setBusy(action);
    try {
      if (action === 'camera') {
        // The gallery opens the system picker, which needs no permission; the camera does.
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
          setNotice({ kind: 'camera-denied', canAskAgain: permission.canAskAgain });
          return;
        }
      }
      const result =
        action === 'camera'
          ? await ImagePicker.launchCameraAsync({ ...PICKER_OPTIONS, cameraType: ImagePicker.CameraType.front })
          : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return;
      const uri = await preparePhoto(asset.uri);
      setPreview(uri);
      await upload.mutateAsync(uri);
      succeed(t('photo.saved'));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  const removePhoto = async () => {
    setNotice(null);
    setBusy('remove');
    try {
      await remove.mutateAsync();
      succeed(t('photo.removed'));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  const confirmRemove = () => {
    if (busy) return;
    Alert.alert(t('photo.remove'), t('photo.removeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('photo.remove'), style: 'destructive', onPress: removePhoto },
    ]);
  };

  return (
    <>
      <View style={styles.previewArea}>
        {preview ? (
          <View>
            <Image source={{ uri: preview }} style={styles.preview} contentFit="cover" />
            <View style={[styles.preview, styles.previewBusy]}>
              <ActivityIndicator color={colors.white} size="large" />
            </View>
          </View>
        ) : (
          <MemberAvatar member={member} size={PREVIEW_SIZE} />
        )}
      </View>

      <Button
        title={t('photo.takePhoto')}
        icon="camera-outline"
        loading={busy === 'camera'}
        disabled={busy !== null && busy !== 'camera'}
        onPress={() => pick('camera')}
      />
      <Button
        title={t('photo.chooseFromLibrary')}
        variant="secondary"
        icon="images-outline"
        loading={busy === 'library'}
        disabled={busy !== null && busy !== 'library'}
        onPress={() => pick('library')}
      />
      {member.photoUpdatedAt ? (
        <Button
          title={t('photo.remove')}
          variant="danger"
          icon="trash-outline"
          loading={busy === 'remove'}
          disabled={busy !== null && busy !== 'remove'}
          onPress={confirmRemove}
        />
      ) : null}

      {notice?.kind === 'camera-denied' ? (
        <Animated.View entering={FadeIn} style={styles.notice}>
          <AppText variant="label" align="center">
            {t('photo.cameraDenied')}
          </AppText>
          {!notice.canAskAgain ? (
            <Button
              title={t('photo.openSettings')}
              variant="secondary"
              size="sm"
              icon="settings-outline"
              onPress={() => Linking.openSettings()}
            />
          ) : null}
        </Animated.View>
      ) : null}
      {notice?.kind === 'error' ? (
        <Animated.View entering={FadeIn} style={styles.notice}>
          <AppText variant="label" align="center" color="#FF8A8E">
            {notice.message}
          </AppText>
        </Animated.View>
      ) : null}
    </>
  );
}

/** "Changer ma photo" (profile): take a photo, pick one from the gallery or remove it. */
export default function ChangePhotoScreen() {
  const { t } = useI18n();
  const me = useMe();
  const member = me.data?.profile.member;

  return (
    <ModalScreen title={t('photo.title')} subtitle={t('photo.subtitle')}>
      {member ? (
        <PhotoChoices member={member} />
      ) : me.isError ? (
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      ) : (
        <LoadingState />
      )}
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  previewArea: { alignItems: 'center', paddingVertical: spacing.md },
  preview: { width: PREVIEW_SIZE, height: PREVIEW_SIZE, borderRadius: PREVIEW_SIZE / 2 },
  previewBusy: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: { gap: spacing.md, alignItems: 'center' },
});
