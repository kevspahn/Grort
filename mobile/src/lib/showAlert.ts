import { Alert, Platform } from 'react-native';

/**
 * Web-aware alert. React Native's Alert.alert is a no-op on React Native Web,
 * so on web we fall back to window.alert. Use this instead of Alert.alert
 * anywhere a message must be visible on grort.app.
 */
export function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}: ${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}
