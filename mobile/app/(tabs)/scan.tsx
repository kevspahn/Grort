import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import apiClient from '../../src/api/client';
import { colors, spacing, fontSize } from '../../src/styles/theme';

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  async function pickFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setCapturedImage(result.assets[0].uri);
      await processImage(result.assets[0].uri);
    }
  }

  if (Platform.OS === 'web') {
    if (isProcessing) {
      return (
        <View style={styles.webContainer}>
          <View style={styles.webCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.processingText}>Scanning receipt...</Text>
            <Text style={styles.processingSubtext}>AI is extracting items and prices</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.webContainer}>
        <View style={styles.webCard}>
          <Text style={styles.webTitle}>Scan</Text>
          <Text style={styles.webText}>
            Upload a receipt image to scan it.
          </Text>
          <TouchableOpacity style={styles.button} onPress={pickFromGallery}>
            <Text style={styles.buttonText}>Choose Receipt Image</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>Camera access is needed to scan receipts</Text>
          <TouchableOpacity style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={pickFromGallery}>
            <Text style={styles.secondaryButtonText}>Pick from Gallery</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  async function takePicture() {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (photo) {
        setCapturedImage(photo.uri);
        await processImage(photo.uri);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to take picture');
    }
  }

  function showError(title: string, message: string) {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  async function processImage(uri: string) {
    setIsProcessing(true);
    try {
      const formData = new FormData();

      if (Platform.OS === 'web') {
        // On web, fetch the blob from the URI and append with proper name
        const response = await fetch(uri);
        const blob = await response.blob();
        const ext = blob.type === 'image/png' ? '.png' : '.jpg';
        formData.append('image', blob, `receipt${ext}`);
      } else {
        const filename = uri.split('/').pop() || 'receipt.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        formData.append('image', { uri, name: filename, type } as any);
      }

      const response = await apiClient.post('/receipts/scan', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });

      router.push({ pathname: '/(tabs)/receipt-review', params: { receiptData: JSON.stringify(response.data) } });
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Failed to process receipt. Please try again.';
      showError('Processing Failed', message);
      setCapturedImage(null);
    } finally {
      setIsProcessing(false);
    }
  }

  if (isProcessing) {
    return (
      <View style={styles.processingContainer}>
        {capturedImage && <Image source={{ uri: capturedImage }} style={styles.previewImage} />}
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.processingText}>Scanning receipt...</Text>
          <Text style={styles.processingSubtext}>AI is extracting items and prices</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
        </View>
      </CameraView>
      <View style={styles.controls}>
        <TouchableOpacity style={styles.galleryButton} onPress={pickFromGallery}>
          <Text style={styles.galleryButtonText}>Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>
        <View style={styles.placeholder} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: '85%', height: '70%', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 12 },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: spacing.lg, backgroundColor: '#000' },
  captureButton: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  captureButtonInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFF' },
  galleryButton: { padding: spacing.md },
  galleryButtonText: { color: '#FFF', fontSize: fontSize.sm },
  placeholder: { width: 60 },
  permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.background },
  permissionText: { fontSize: fontSize.md, color: colors.text, textAlign: 'center', marginBottom: spacing.lg },
  button: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: 8, width: '100%', alignItems: 'center', marginBottom: spacing.md },
  buttonText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: 'bold' },
  secondaryButton: { padding: spacing.md, borderRadius: 8, borderWidth: 1, borderColor: colors.primary, width: '100%', alignItems: 'center' },
  secondaryButtonText: { color: colors.primary, fontSize: fontSize.md },
  webContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.background },
  webCard: { width: '100%', maxWidth: 520, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: spacing.xl },
  webTitle: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.text, marginBottom: spacing.md },
  webText: { fontSize: fontSize.md, lineHeight: 22, color: colors.textSecondary, marginBottom: spacing.lg },
  processingContainer: { flex: 1, backgroundColor: '#000' },
  previewImage: { flex: 1, resizeMode: 'contain' },
  processingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  processingText: { color: '#FFF', fontSize: fontSize.lg, fontWeight: 'bold', marginTop: spacing.md },
  processingSubtext: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.sm, marginTop: spacing.xs },
});
