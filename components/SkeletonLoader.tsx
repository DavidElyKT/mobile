import { View, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import { Colors } from '@/constants/Colors';

function SkeletonBox({ width, height, style }: { width?: number | string; height: number; style?: object }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={[
        { width: width ?? '100%', height, borderRadius: 6, backgroundColor: Colors.border },
        { opacity },
        style,
      ]}
    />
  );
}

function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.iconPlaceholder}>
        <SkeletonBox width={50} height={50} style={{ borderRadius: 12 }} />
      </View>
      <View style={styles.bodyPlaceholder}>
        <SkeletonBox width="60%" height={16} style={{ marginBottom: 8 }} />
        <SkeletonBox width="40%" height={12} />
      </View>
    </View>
  );
}

export function SkeletonDetailScreen() {
  return (
    <View style={styles.container}>
      {/* Banner placeholder */}
      <SkeletonBox height={120} style={{ borderRadius: 0, marginBottom: 24 }} />
      <View style={styles.section}>
        <SkeletonBox width="30%" height={12} style={{ marginBottom: 12 }} />
        <SkeletonCard />
        <SkeletonCard />
      </View>
      <View style={styles.section}>
        <SkeletonBox width="25%" height={12} style={{ marginBottom: 12 }} />
        <SkeletonCard />
      </View>
    </View>
  );
}

export function SkeletonListScreen() {
  return (
    <View style={styles.container}>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingTop: 8 },
  section: { paddingHorizontal: 19, marginBottom: 8 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 19,
    marginHorizontal: 19,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconPlaceholder: { marginRight: 17 },
  bodyPlaceholder: { flex: 1 },
});
