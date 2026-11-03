import { useState } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { BookingDto, BookingStatus, ClassSessionDto } from '@/api/types';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/i18n';
import { isLateCancellation } from '@/lib/classState';
import { errorMessage } from '@/lib/errors';
import { useBookClass, useBookingPolicy, useBookingStanding, useCancelBooking } from './queries';

/** Book / join the waitlist / cancel, with the confirmations and feedback shared by list and detail. */
export function useBookingActions() {
  const { t } = useI18n();
  const toast = useToast();
  const book = useBookClass();
  const cancel = useCancelBooking();
  const standing = useBookingStanding();
  const policy = useBookingPolicy();
  const [busyId, setBusyId] = useState<string | null>(null);

  const reserve = async (session: ClassSessionDto, spotNumber?: number): Promise<BookingDto | null> => {
    setBusyId(session.id);
    try {
      const booking = await book.mutateAsync({ sessionId: session.id, spotNumber });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      toast(
        booking.status === 'WAITLISTED'
          ? t('classes.waitlistedToast', { position: booking.waitlistPosition ?? '?' })
          : spotNumber
            ? `${t('classes.bookedToast')} · ${t('classes.spotN', { n: spotNumber })}`
            : t('classes.bookedToast'),
        booking.status === 'WAITLISTED' ? 'info' : 'success',
      );
      return booking;
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      toast(errorMessage(error, t), 'error');
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const confirmCancel = (session: ClassSessionDto, bookingId: string, status: BookingStatus, onDone?: () => void) => {
    const waitlisted = status === 'WAITLISTED';
    const late = status === 'BOOKED' && isLateCancellation(session.cancelDeadline, Date.now());
    const limit = policy.data?.noShowLimit ?? 3;
    const message = waitlisted
      ? t('classes.leaveConfirm', { title: session.title })
      : late
        ? `${t('classes.cancelConfirm', { title: session.title })}\n\n${t('classes.lateCancelWarning', {
            count: (standing.data?.strikes30d ?? 0) + 1,
            limit,
          })}`
        : t('classes.cancelConfirm', { title: session.title });

    if (late) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);

    Alert.alert(waitlisted ? t('classes.leaveWaitlist') : t('classes.cancel'), message, [
      { text: t('common.no'), style: 'cancel' },
      {
        text: t('common.yes'),
        style: 'destructive',
        onPress: async () => {
          setBusyId(session.id);
          try {
            await cancel.mutateAsync(bookingId);
            toast(
              waitlisted ? t('classes.leftWaitlistToast') : late ? t('classes.lateCancelledToast') : t('classes.cancelledToast'),
              late ? 'error' : 'info',
            );
            onDone?.();
          } catch (error) {
            toast(errorMessage(error, t), 'error');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  return { reserve, confirmCancel, busyId };
}
