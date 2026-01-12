import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  Image,
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

const IBS_OPTIONS = [
  { value: "unknown", label: "Unknown" },
  { value: "IBS_C", label: "IBS-C (Constipation)" },
  { value: "IBS_D", label: "IBS-D (Diarrhea)" },
  { value: "IBS_M", label: "IBS-M (Mixed)" },
  { value: "IBS_U", label: "IBS-U (Unclassified)" },
];

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermStatus, setMediaPermStatus] = useState(null);

  const [loading, setLoading] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(""); // Track analysis progress
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
      
      // Step 1: Uploading
      setAnalysisStep("Uploading image...");
      
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
      formData.append("ibs_subtype", "unknown"); // Always send all subtype guidance

      // Step 2: Analyzing
      setAnalysisStep("Observing visible food components...");
      
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

      // Step 3: Processing results
      setAnalysisStep("Processing IBS guidance...");
      
      const data = await response.json();
      setResult(data);
      setAnalysisStep("");
    } catch (e) {
      console.error(e);
      setError(e.message);
      setAnalysisStep("");
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

  const getDecisionColor = (decision) => {
    if (decision === "likely_ok") return "#2ecc71"; // 🟢 green
    if (decision === "caution") return "#f1c40f"; // 🟡 yellow
    if (decision === "avoid") return "#e74c3c"; // 🔴 red
    return "#999";
  };

  const getDecisionEmoji = (decision) => {
    if (decision === "likely_ok") return "🟢";
    if (decision === "caution") return "🟡";
    if (decision === "avoid") return "🔴";
    return "⚪";
  };

  const getDecisionLabel = (decision) => {
    if (decision === "likely_ok") return "Likely OK";
    if (decision === "caution") return "Use Caution";
    if (decision === "avoid") return "Higher Risk";
    return "Unknown";
  };

  const renderConfidenceBar = (confidence) => {
    const percentage = Math.round(confidence * 100);
    return (
      <View style={styles.confidenceContainer}>
        <Text style={styles.confidenceLabel}>Confidence: {percentage}%</Text>
        <View style={styles.confidenceBarBackground}>
          <View 
            style={[
              styles.confidenceBarFill, 
              { width: `${percentage}%`, backgroundColor: percentage > 70 ? "#2ecc71" : percentage > 40 ? "#f1c40f" : "#e74c3c" }
            ]} 
          />
        </View>
      </View>
    );
  };

  const renderIBSSubtypeGuidance = () => {
    if (!result?.ibs_risk_result) return null;
    const risk = result.ibs_risk_result;

    const subtypes = [
      { key: "ibs_c_note", label: "IBS-C (Constipation)", emoji: "🟤" },
      { key: "ibs_d_note", label: "IBS-D (Diarrhea)", emoji: "💧" },
      { key: "ibs_m_note", label: "IBS-M (Mixed)", emoji: "🔄" },
      { key: "ibs_u_note", label: "IBS-U (Unclassified)", emoji: "❓" },
    ];

    return (
      <View style={styles.subtypeGuidanceContainer}>
        <Text style={styles.sectionTitle}>IBS Subtype-Specific Guidance</Text>
        {subtypes.map((subtype) => {
          const note = risk[subtype.key];
          if (!note) return null;
          return (
            <View key={subtype.key} style={styles.subtypeCard}>
              <Text style={styles.subtypeHeader}>
                {subtype.emoji} {subtype.label}
              </Text>
              <Text style={styles.subtypeText}>{note}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.mainScrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.headerContainer}>
          <Image 
            source={require('./assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.headerTextContainer}>
            <Text style={styles.title}>FoodSense</Text>
            <Text style={styles.subtitle}>
              AI-powered food analysis for IBS management
            </Text>
          </View>
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
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            {analysisStep && (
              <Text style={styles.loadingText}>{analysisStep}</Text>
            )}
          </View>
        )}

        {error && (
          <Text style={[styles.text, { color: "red", marginTop: 8 }]}>
            {error}
          </Text>
        )}

        {/* Results Section */}
        {result && (
          <>
            {/* Traffic Light Decision */}
            {result.ibs_risk_result?.decision && (
              <View style={[styles.decisionBox, { borderColor: getDecisionColor(result.ibs_risk_result.decision) }]}>
                <Text style={styles.decisionEmoji}>
                  {getDecisionEmoji(result.ibs_risk_result.decision)}
                </Text>
                <Text style={[styles.decisionLabel, { color: getDecisionColor(result.ibs_risk_result.decision) }]}>
                  {getDecisionLabel(result.ibs_risk_result.decision)}
                </Text>
                {result.ibs_risk_result.advice_short && (
                  <Text style={styles.decisionAdvice}>
                    {result.ibs_risk_result.advice_short}
                  </Text>
                )}
              </View>
            )}

            {/* What the AI Observed */}
            <Text style={styles.sectionTitle}>🧠 What the App Sees</Text>
            <View style={styles.observationCard}>
              <Text style={styles.cardLabel}>Dish Name:</Text>
              <Text style={styles.cardValue}>
                {result.food_observation?.dish_name || "Unknown"}
              </Text>

              {result.food_observation?.observed_food_components?.length > 0 && (
                <>
                  <Text style={[styles.cardLabel, { marginTop: 12 }]}>
                    Food Observed (Clearly Visible):
                  </Text>
                  {result.food_observation.observed_food_components.map((item, idx) => (
                    <Text key={idx} style={styles.bulletItem}>
                      • {item}
                    </Text>
                  ))}
                </>
              )}

              {result.food_observation?.possible_food_components?.length > 0 && (
                <>
                  <Text style={[styles.cardLabel, { marginTop: 12 }]}>
                    Possible Components (Uncertain):
                  </Text>
                  {result.food_observation.possible_food_components.map((item, idx) => (
                    <Text key={idx} style={styles.bulletItemUncertain}>
                      ◦ {item}
                    </Text>
                  ))}
                </>
              )}

              {result.food_observation?.visual_cues?.length > 0 && (
                <>
                  <Text style={[styles.cardLabel, { marginTop: 12 }]}>
                    Visual Cues:
                  </Text>
                  <Text style={styles.cardValue}>
                    {result.food_observation.visual_cues.join(", ")}
                  </Text>
                </>
              )}
            </View>

            {/* Confidence Bar */}
            {result.food_observation?.overall_confidence !== undefined && (
              <>
                <Text style={styles.sectionTitle}>📊 How Sure Is the App?</Text>
                {renderConfidenceBar(result.food_observation.overall_confidence)}
                <Text style={styles.uncertaintyNote}>
                  This guidance is based only on what is visible in the image.
                  The app cannot see hidden ingredients, seasonings, or exact portion sizes.
                </Text>
              </>
            )}

            {/* Risk Factors */}
            {result.ibs_risk_result?.risk_factors?.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>⚠️ Identified Risk Factors</Text>
                <View style={styles.riskCard}>
                  {result.ibs_risk_result.risk_factors.map((factor, idx) => (
                    <Text key={idx} style={styles.riskItem}>
                      • {factor}
                    </Text>
                  ))}
                </View>
              </>
            )}

            {/* Reasons */}
            {result.ibs_risk_result?.reasons?.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>💡 Why This Assessment?</Text>
                <View style={styles.reasonsCard}>
                  {result.ibs_risk_result.reasons.map((reason, idx) => (
                    <Text key={idx} style={styles.reasonText}>
                      {idx + 1}. {reason}
                    </Text>
                  ))}
                </View>
              </>
            )}

            {/* IBS Subtype Guidance */}
            {renderIBSSubtypeGuidance()}

            {/* Disclaimer */}
            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerTitle}>⚕️ Important Note</Text>
              <Text style={styles.disclaimerText}>
                This app provides educational guidance based on visible food features. 
                It does not diagnose IBS or replace medical advice. 
                Individual tolerance varies significantly. 
                Always consult with a healthcare provider for personalized medical guidance.
              </Text>
            </View>
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
    backgroundColor: "#FFFFFF", // White to match logo background
  },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  logo: {
    width: 120,
    height: 120,
    marginRight: 12,
  },
  headerTextContainer: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 4,
    color: "#1a1a1a",
  },
  subtitle: {
    fontSize: 13,
    color: "#555",
    lineHeight: 18,
  },
  cameraContainer: {
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 16,
    overflow: "hidden",
    height: 260,
    backgroundColor: "#000",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  camera: {
    flex: 1,
  },
  buttonRow: {
    marginTop: 6,
  },
  primaryButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 14,
    borderRadius: 28,
    alignItems: "center",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: "#ffffff",
    paddingVertical: 12,
    borderRadius: 28,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#007AFF",
  },
  secondaryButtonText: {
    color: "#007AFF",
    fontWeight: "600",
    fontSize: 15,
  },
  loadingContainer: {
    marginTop: 16,
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#007AFF",
    fontWeight: "500",
  },
  mainScrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
    color: "#1a1a1a",
  },
  decisionBox: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 16,
    borderWidth: 3,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  decisionEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  decisionLabel: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
  },
  decisionAdvice: {
    fontSize: 15,
    color: "#555",
    textAlign: "center",
    lineHeight: 22,
  },
  observationCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 15,
    color: "#555",
    lineHeight: 22,
  },
  bulletItem: {
    fontSize: 14,
    color: "#333",
    marginLeft: 8,
    marginTop: 4,
    lineHeight: 20,
  },
  bulletItemUncertain: {
    fontSize: 14,
    color: "#888",
    marginLeft: 8,
    marginTop: 4,
    fontStyle: "italic",
    lineHeight: 20,
  },
  confidenceContainer: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  confidenceLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  confidenceBarBackground: {
    height: 12,
    backgroundColor: "#e0e0e0",
    borderRadius: 6,
    overflow: "hidden",
  },
  confidenceBarFill: {
    height: "100%",
    borderRadius: 6,
  },
  uncertaintyNote: {
    fontSize: 13,
    color: "#666",
    fontStyle: "italic",
    lineHeight: 19,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  riskCard: {
    backgroundColor: "#fff8e1",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ffd54f",
  },
  riskItem: {
    fontSize: 14,
    color: "#333",
    marginBottom: 6,
    lineHeight: 20,
  },
  reasonsCard: {
    backgroundColor: "#e3f2fd",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#90caf9",
  },
  reasonText: {
    fontSize: 14,
    color: "#333",
    marginBottom: 8,
    lineHeight: 20,
  },
  subtypeGuidanceContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  subtypeCard: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  subtypeHeader: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
    marginBottom: 6,
  },
  subtypeText: {
    fontSize: 14,
    color: "#555",
    lineHeight: 20,
  },
  disclaimerBox: {
    backgroundColor: "#f9f9f9",
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  disclaimerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  disclaimerText: {
    fontSize: 13,
    color: "#666",
    lineHeight: 20,
  },
});
