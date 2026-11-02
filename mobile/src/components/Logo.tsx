import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { radius } from '@/theme';

/** The Meliora logo has a white background: present it on a white rounded tile. */
export function Logo({ size = 56 }: { size?: number }) {
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: Math.max(radius.sm, size * 0.22) }]}>
      <Image
        source={require('../../assets/images/logo.jpg')}
        style={{ width: size * 0.92, height: size * 0.92 }}
        contentFit="contain"
        accessibilityLabel="Meliora Gym"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
