import { View, Text, Image, StyleSheet } from 'react-native';

export default function KTHeaderTitle() {
  return (
    <View style={styles.row}>
      <Image
        source={{ uri: 'https://puwerappimages.blob.core.windows.net/puwerimages/largelogo.png' }}
        style={styles.logo}
      />
      <Text style={styles.text}>KNOX THOMAS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});
