import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";

// Resolve backend URL depending on environment so real devices can reach your dev machine.
const getBackendUrl = () => {
  // Highest priority: explicit env override.
  const envUrl =
    process.env.EXPO_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || null;
  if (envUrl) return envUrl;

  // Next: infer from Expo dev server host (works on LAN dev with Expo Go).
  const host = Constants.expoConfig?.hostUri?.split(":")?.[0];
  if (host) {
    return `http://${host}:8000`;
  }

  // Fallbacks: emulator defaults, then localhost.
  if (Platform.OS === "android") return "http://10.0.2.2:8000";
  return "http://localhost:8000";
};

const BACKEND_URL = getBackendUrl();

const IBS_OPTIONS = ["unknown", "IBS_C", "IBS_D", "IBS_M"];

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermStatus, setMediaPermStatus] = useState(null);

  const [ibsSubtype, setIbsSubtype] = useState("unknown");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const cameraRef = useRef(null);

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const ensureMediaLibraryPermission = async () => {
    if (mediaPermStatus === "granted") return true;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    setMediaPermStatus(perm.status);
    return perm.granted;
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>GI VisionEat (Prototype)</Text>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>GI VisionEat (Prototype)</Text>
        <Text style={{ marginBottom: 12 }}>
          We need access to your camera to analyze meals.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Grant Camera Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const sendImageToBackend = async (uri) => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const fileName = uri.split("/").pop() || "meal.jpg";
      const match = /\.(\w+)$/.exec(fileName);
      const ext = match ? match[1] : "jpg";
      const mimeType = `image/${ext === "jpg" ? "jpeg" : ext}`;

      const formData = new FormData();
      formData.append("file", {
        uri,
        name: fileName,
        type: mimeType,
      });
      formData.append("ibs_subtype", ibsSubtype);

      const response = await fetch(`${BACKEND_URL}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "multipart/form-data",
        },
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server error: ${response.status} ${text}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (e) {
      console.error(e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const takePictureAndAnalyze = async () => {
    setError(null);
    setResult(null);

    if (!cameraRef.current) {
      setError("Camera not ready.");
      return;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
      });
      await sendImageToBackend(photo.uri);
    } catch (e) {
      console.error(e);
      setError(e.message);
    }
  };

  const pickImageFromGalleryAndAnalyze = async () => {
    setError(null);
    setResult(null);

    const granted = await ensureMediaLibraryPermission();
    if (!granted) {
      setError("Permission to access photos is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      await sendImageToBackend(uri);
    }
  };

  const renderRecommendation = () => {
    if (!result?.gi_interpretation) return null;
    const gi = result.gi_interpretation;
    let color = "#999";

    if (gi.eat_recommendation === "yes") color = "#2ecc71"; // green
    else if (gi.eat_recommendation === "caution") color = "#f1c40f"; // yellow
    else if (gi.eat_recommendation === "no") color = "#e74c3c"; // red

    return (
      <View style={[styles.recommendationBox, { borderColor: color }]}>
        <Text style={[styles.recommendationLabel, { color }]}>
          {gi.eat_label || "Recommendation"}
        </Text>
        <Text style={styles.recommendationAdvice}>
          {gi.advice_short || "No advice available."}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GI VisionEat (Prototype)</Text>

      {/* IBS subtype chips */}
      <View style={styles.ibsRow}>
        <Text style={styles.label}>IBS subtype:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {IBS_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[
                styles.ibsChip,
                ibsSubtype === opt && styles.ibsChipSelected,
              ]}
              onPress={() => setIbsSubtype(opt)}
            >
              <Text
                style={[
                  styles.ibsChipText,
                  ibsSubtype === opt && styles.ibsChipTextSelected,
                ]}
              >
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Camera view */}
      <View style={styles.cameraContainer}>
        <CameraView style={styles.camera} ref={cameraRef} />
      </View>

      {/* Capture / Gallery buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            loading && { opacity: 0.5 },
          ]}
          onPress={takePictureAndAnalyze}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? "Analyzing..." : "Take Photo & Analyze"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[
            styles.secondaryButton,
            loading && { opacity: 0.5 },
          ]}
          onPress={pickImageFromGalleryAndAnalyze}
          disabled={loading}
        >
          <Text style={styles.secondaryButtonText}>
            {loading ? "Analyzing..." : "Pick from Gallery & Analyze"}
          </Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <ActivityIndicator size="large" style={{ marginTop: 8 }} />
      )}

      {error && (
        <Text style={[styles.text, { color: "red", marginTop: 8 }]}>
          {error}
        </Text>
      )}

      <ScrollView style={styles.resultBox}>
        {result && (
          <>
            <Text style={styles.sectionTitle}>What we see</Text>
            <Text style={styles.text}>
              Dish: {result.food?.dish_name || "N/A"}
            </Text>
            <Text style={styles.text}>
              Ingredients: {result.food?.ingredients?.join(", ") || "N/A"}
            </Text>
            <Text style={styles.text}>
              Preparation: {result.food?.preparation || "N/A"}
            </Text>

            <Text style={styles.sectionTitle}>GI summary</Text>
            <Text style={styles.text}>
              Overall FODMAP:{" "}
              {result.gi_interpretation?.fodmap_overall || "N/A"}
            </Text>
            <Text style={styles.text}>
              Fiber: {result.gi_interpretation?.fiber || "N/A"} | Fat:{" "}
              {result.gi_interpretation?.fat || "N/A"}
            </Text>
            <Text style={styles.text}>
              Lactose: {result.gi_interpretation?.lactose || "N/A"} | Gluten:{" "}
              {result.gi_interpretation?.gluten || "N/A"}
            </Text>
            <Text style={styles.text}>
              Spice: {result.gi_interpretation?.spice || "N/A"}
            </Text>

            {renderRecommendation()}

            {result.gi_interpretation?.explanation && (
              <>
                <Text style={styles.sectionTitle}>Why this answer?</Text>
                <Text style={styles.text}>
                  {result.gi_interpretation.explanation}
                </Text>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 16,
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  ibsRow: {
    marginBottom: 8,
  },
  label: {
    fontWeight: "600",
    marginBottom: 4,
  },
  ibsChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ccc",
    marginRight: 8,
  },
  ibsChipSelected: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  ibsChipText: {
    fontSize: 13,
    color: "#333",
  },
  ibsChipTextSelected: {
    color: "#fff",
  },
  cameraContainer: {
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 12,
    overflow: "hidden",
    height: 260,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  buttonRow: {
    marginTop: 6,
  },
  primaryButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: "#ffffff",
    paddingVertical: 10,
    borderRadius: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  secondaryButtonText: {
    color: "#007AFF",
    fontWeight: "600",
    fontSize: 15,
  },
  resultBox: {
    marginTop: 12,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 10,
    marginBottom: 4,
  },
  text: {
    fontSize: 14,
    marginBottom: 2,
  },
  recommendationBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: "#fff",
  },
  recommendationLabel: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  recommendationAdvice: {
    fontSize: 14,
  },
});
