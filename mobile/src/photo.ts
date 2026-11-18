import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

export type Foto = { uri: string; base64: string };

/** Toma una foto con la cámara (o la elige de la galería en la web). Calidad 0,6: 300-800 KB. */
export async function tomarFoto(opciones: { frontal?: boolean; galeria?: boolean } = {}): Promise<Foto | { error: string } | null> {
  const camara = !opciones.galeria && Platform.OS !== "web";
  const perm = camara ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { error: camara ? "Sin permiso para usar la cámara." : "Sin permiso para ver tus fotos." };
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"], quality: 0.6, base64: true, allowsEditing: false,
    cameraType: opciones.frontal ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  };
  const r = camara ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const a = r.canceled ? null : r.assets[0];
  return a?.base64 ? { uri: a.uri, base64: a.base64 } : null;
}
