import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@/api/client';
import type { MemberDto } from '@/api/types';
import { queryKeys } from '@/hooks/queries';
import { useAccessToken } from '@/hooks/useAccessToken';
import { useI18n } from '@/i18n';
import { initials } from '@/lib/format';
import { memberPhotoSource } from '@/lib/memberPhoto';
import { colors, fonts, radius } from '@/theme';
import { AppText } from './AppText';

interface Props {
  /** The signed-in member (GET /api/me): the photo comes from /api/me/photo. */
  member: Pick<MemberDto, 'id' | 'firstName' | 'lastName' | 'photoUpdatedAt'>;
  size: number;
  /** Round on the profile, a rounded square (ID photo) on the pass. */
  shape?: 'circle' | 'rounded';
}

/**
 * The member's photo over their initials (shown while it loads and when there is none). A failed load (token expired
 * meanwhile, photo removed at the desk, offline) refetches the profile, which refreshes the token or brings the new
 * photoUpdatedAt: either one gives a new source, tried again. Otherwise the initials stay.
 */
export function MemberAvatar({ member, size, shape = 'circle' }: Props) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const token = useAccessToken();
  const { id, photoUpdatedAt } = member;
  const source = useMemo(() => memberPhotoSource(API_URL, token, { id, photoUpdatedAt }), [token, id, photoUpdatedAt]);
  const [failedSource, setFailedSource] = useState<ImageSource | null>(null);
  const borderRadius = shape === 'circle' ? size / 2 : radius.md;
  const name = `${member.firstName} ${member.lastName}`.trim();

  return (
    <View style={[styles.base, { width: size, height: size, borderRadius }]}>
      <AppText style={[styles.initials, { fontSize: Math.round(size * 0.52), lineHeight: Math.round(size * 0.56) }]}>
        {initials(member.firstName, member.lastName)}
      </AppText>
      {source && source !== failedSource ? (
        <Image
          source={source}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          accessibilityLabel={t('photo.photoOf', { name })}
          onError={() => {
            setFailedSource(source);
            queryClient.invalidateQueries({ queryKey: queryKeys.me }, { cancelRefetch: false });
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: { fontFamily: fonts.display, color: colors.white, letterSpacing: 0.8 },
});
