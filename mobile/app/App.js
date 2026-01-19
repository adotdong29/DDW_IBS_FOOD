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
import { LinearGradient } from 'expo-linear-gradient';
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

const HEALTH_CONDITIONS = [
    {
    value: "allergy",
    label: "Food Allergies",
    icon: require('./assets/images/food_allergy.png'),
    description: "Allergens & cross-contamination",
    color: "#FF5722" // Red-o5range67
  },
  {
    value: "diabetes",
    label: "Diabetes Support",
    icon: require('./assets/images/diabetes.png'),
    description: "Blood sugar & carbs",
    color: "#2196F3" // Blue
  },
  {
    value: "hypertension",
    label: "Hypertension Care",
    icon: require('./assets/images/hypertension.png'),
    description: "Blood pressure & sodium",
    color: "#F44336" // Red
  },
  {
    value: "ibs",
    label: "IBS Management",
    icon: require('./assets/images/ibs.png'),
    description: "Digestive health & FODMAPs",
    color: "#9C27B0" // Purple
  },
];

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermStatus, setMediaPermStatus] = useState(null);

  const [currentScreen, setCurrentScreen] = useState("home"); // "home" or "camera"
  const [selectedCondition, setSelectedCondition] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analysisStep, setAnalysisStep] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const cameraRef = useRef(null);

  const handleConditionSelect = (condition) => {
    setSelectedCondition(condition);
    setCurrentScreen("camera");
    setResult(null);
    setError(null);
  };

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
      formData.append("condition", selectedCondition);

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

  const getCurrentCondition = () => {
    return HEALTH_CONDITIONS.find(c => c.value === selectedCondition);
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

  const getRiskResultKey = (condition) => {
    return `${condition}_risk_result`;
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

  const renderConditionSpecificGuidance = () => {
    if (!result || !result.condition) return null;
    
    const riskResult = result[getRiskResultKey(result.condition)];
    if (!riskResult) return null;

    // IBS Subtype Guidance
    if (result.condition === "ibs") {
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
            const note = riskResult[subtype.key];
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
    }

    // Allergy-Specific Display
    if (result.condition === "allergy") {
      return (
        <>
          {riskResult.suspected_allergens?.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>⚠️ Suspected Allergens</Text>
              <View style={styles.allergyCard}>
                {riskResult.suspected_allergens.map((allergen, idx) => (
                  <Text key={idx} style={styles.allergenItem}>
                    • {allergen}
                  </Text>
                ))}
              </View>
            </>
          )}
          {riskResult.possible_hidden_allergens?.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>❓ Possible Hidden Allergens</Text>
              <View style={styles.hiddenAllergyCard}>
                {riskResult.possible_hidden_allergens.map((allergen, idx) => (
                  <Text key={idx} style={styles.hiddenAllergenItem}>
                    ◦ {allergen}
                  </Text>
                ))}
              </View>
            </>
          )}
          {riskResult.cross_contamination_risks?.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>🔄 Cross-Contamination Risks</Text>
              <View style={styles.crossContamCard}>
                {riskResult.cross_contamination_risks.map((risk, idx) => (
                  <Text key={idx} style={styles.crossContamItem}>
                    • {risk}
                  </Text>
                ))}
              </View>
            </>
          )}
        </>
      );
    }

    // Diabetes-Specific Display
    if (result.condition === "diabetes") {
      return (
        <>
          {riskResult.glucose_curve_prediction && (
            <>
              <Text style={styles.sectionTitle}>📈 Glucose Curve Prediction</Text>
              <View style={styles.diabetesCard}>
                <Text style={styles.diabetesMetric}>
                  Impact: <Text style={styles.diabetesValue}>{riskResult.glucose_curve_prediction}</Text>
                </Text>
                {riskResult.carbohydrate_load && (
                  <Text style={styles.diabetesMetric}>
                    Carb Load: <Text style={styles.diabetesValue}>{riskResult.carbohydrate_load}</Text>
                  </Text>
                )}
                {riskResult.net_carbs_estimate && (
                  <Text style={styles.diabetesMetric}>
                    Net Carbs: <Text style={styles.diabetesValue}>{riskResult.net_carbs_estimate}</Text>
                  </Text>
                )}
              </View>
            </>
          )}
          {riskResult.glucose_drivers?.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>⬆️ Glucose Drivers</Text>
              <View style={styles.driversCard}>
                {riskResult.glucose_drivers.map((driver, idx) => (
                  <Text key={idx} style={styles.driverItem}>
                    • {driver}
                  </Text>
                ))}
              </View>
            </>
          )}
          {riskResult.glucose_buffers?.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>⬇️ Glucose Buffers</Text>
              <View style={styles.buffersCard}>
                {riskResult.glucose_buffers.map((buffer, idx) => (
                  <Text key={idx} style={styles.bufferItem}>
                    • {buffer}
                  </Text>
                ))}
              </View>
            </>
          )}
          {riskResult.insulin_resistance_risks?.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>⚠️ Insulin Resistance Risks</Text>
              <View style={styles.insulinRisksCard}>
                {riskResult.insulin_resistance_risks.map((risk, idx) => (
                  <Text key={idx} style={styles.insulinRiskItem}>
                    • {risk}
                  </Text>
                ))}
              </View>
            </>
          )}
        </>
      );
    }

    // Hypertension-Specific Display
    if (result.condition === "hypertension") {
      return (
        <>
          {riskResult.sodium_load_estimate && (
            <>
              <Text style={styles.sectionTitle}>🧂 Sodium Load</Text>
              <View style={styles.hypertensionCard}>
                <Text style={styles.hypertensionMetric}>
                  Estimated Level: <Text style={styles.hypertensionValue}>{riskResult.sodium_load_estimate}</Text>
                </Text>
              </View>
            </>
          )}
          {riskResult.pressure_drivers?.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>⬆️ Pressure Drivers</Text>
              <View style={styles.pressureDriversCard}>
                {riskResult.pressure_drivers.map((driver, idx) => (
                  <Text key={idx} style={styles.pressureDriverItem}>
                    • {driver}
                  </Text>
                ))}
              </View>
            </>
          )}
          {riskResult.pressure_buffers?.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>⬇️ Pressure Buffers (DASH)</Text>
              <View style={styles.pressureBuffersCard}>
                {riskResult.pressure_buffers.map((buffer, idx) => (
                  <Text key={idx} style={styles.pressureBufferItem}>
                    • {buffer}
                  </Text>
                ))}
              </View>
            </>
          )}
        </>
      );
    }

    return null;
  };

  // HOME SCREEN - Simple condition selection
  if (currentScreen === "home") {
    return (
      <View style={styles.homeContainer}>
        <ScrollView 
          style={styles.homeScrollView}
          contentContainerStyle={styles.homeScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo and Description77777777777777 */}
          <View style={styles.homeHeader}>
            <Image
              source={require('./assets/images/newest_logo1.png')}
              style={styles.homeLogo}
              resizeMode="contain"
            />
            <Text style={styles.homeDescription}>
              Scan. Analyze. Eat Safely
            </Text>
            <Text style={styles.homeSubDescription}>
              AI powered food analysis
            </Text>
            <Text style={styles.homeMinorDescription}>
              Select Your Condition To Begin
            </Text>
          </View>

          {/* 4 Co55ndition Buttons */}
          <View style={styles.homeButtons}>
            {HEALTH_CONDITIONS.map((condition) => (
              <TouchableOpacity
                key={condition.value}
                style={styles.homeButtonWrapper}
                onPress={() => handleConditionSelect(condition.value)}
              >
                <LinearGradient
                  colors={['#FFFFFF', '#FAFAFA', '#FFFFFF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.homeButton, { borderColor: condition.color }]}
                >
                  <Image
                    source={condition.icon}
                    style={styles.homeButtonIcon}
                    resizeMode="contain"
                  />
                  <Text style={styles.homeButtonText}>{condition.label}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  // CAMERA SCREEN - Main App
  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.mainScrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {/* Minimal Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => {
              setCurrentScreen("home");
              setResult(null);
              setError(null);
            }}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.appTitleSection}>
            <Image
              source={require('./assets/images/newest_logo1.png')}
              style={styles.smallLogo}
              resizeMode="contain"
            />
            <Text style={styles.appTitle}>
              {HEALTH_CONDITIONS.find(c => c.value === selectedCondition)?.label || "FoodSense"}
            </Text>
          </View>
          <View style={{ width: 60 }} />
        </View>

        {/* Camera Section */}
        <View style={styles.cameraSection}>
          <Text style={styles.cameraLabel}>CAMERA</Text>
          <View style={styles.cameraContainer}>
            <CameraView style={styles.camera} ref={cameraRef} />
          </View>
          
          {/* Action Buttons */}
          <TouchableOpacity
            style={[
              styles.primaryButton,
              loading && styles.primaryButtonDisabled,
            ]}
            onPress={takePictureAndAnalyze}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? "Analyzing..." : "Take Photo"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.secondaryButton,
              loading && { opacity: 0.5 },
            ]}
            onPress={pickImageFromGalleryAndAnalyze}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>
              {loading ? "Analyzing..." : "Choose from Gallery"}
            </Text>
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1A73E8" />
            {analysisStep && (
              <Text style={styles.loadingText}>{analysisStep}</Text>
            )}
          </View>
        )}

        {error && (
          <Text style={[styles.text, { color: "red", marginTop: 8, marginHorizontal: 20 }]}>
            {error}
          </Text>
        )}

        {/* Results Section */}
        {result && (
          <>
            {/* Show analysis condition */}
            <View style={[styles.conditionBadge, { backgroundColor: getCurrentCondition()?.color }]}>
              <Text style={styles.conditionBadgeIcon}>{getCurrentCondition()?.icon}</Text>
              <Text style={styles.conditionBadgeText}>
                {getCurrentCondition()?.label} Analysis
              </Text>
            </View>

            {/* Traffic Light Decision */}
            {(() => {
              const riskResult = result[getRiskResultKey(result.condition)];
              if (!riskResult?.decision) return null;
              
              return (
                <View style={[styles.decisionBox, { borderColor: getDecisionColor(riskResult.decision) }]}>
                  <Text style={styles.decisionEmoji}>
                    {getDecisionEmoji(riskResult.decision)}
                  </Text>
                  <Text style={[styles.decisionLabel, { color: getDecisionColor(riskResult.decision) }]}>
                    {getDecisionLabel(riskResult.decision)}
                  </Text>
                  {riskResult.advice_short && (
                    <Text style={styles.decisionAdvice}>
                      {riskResult.advice_short}
                    </Text>
                  )}
                </View>
              );
            })()}

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
            {(() => {
              const riskResult = result[getRiskResultKey(result.condition)];
              const riskFactors = riskResult?.risk_factors;
              if (!riskFactors || !Array.isArray(riskFactors) || riskFactors.length === 0) return null;
              
              return (
                <>
                  <Text style={styles.sectionTitle}>⚠️ Identified Risk Factors</Text>
                  <View style={styles.riskCard}>
                    {riskFactors.map((factor, idx) => (
                      <Text key={idx} style={styles.riskItem}>
                        • {factor}
                      </Text>
                    ))}
                  </View>
                </>
              );
            })()}

            {/* Reasons */}
            {(() => {
              const riskResult = result[getRiskResultKey(result.condition)];
              const reasons = riskResult?.reasons;
              if (!reasons || !Array.isArray(reasons) || reasons.length === 0) return null;
              
              return (
                <>
                  <Text style={styles.sectionTitle}>💡 Why This Assessment?</Text>
                  <View style={styles.reasonsCard}>
                    {reasons.map((reason, idx) => (
                      <Text key={idx} style={styles.reasonText}>
                        {idx + 1}. {reason}
                      </Text>
                    ))}
                  </View>
                </>
              );
            })()}

            {/* Condition-Specific Guidance */}
            {renderConditionSpecificGuidance()}

            {/* Disclaimer */}
            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerTitle}>⚕️ Important Note</Text>
              <Text style={styles.disclaimerText}>
                {result.disclaimer || 
                  "This app provides educational guidance based on visible food features. " +
                  "It does not diagnose health conditions or replace medical advice. " +
                  "Individual tolerance varies significantly. " +
                  "Always consult with a healthcare provider for personalized medical guidance."
                }
              </Text>
            </View>
          </>
        )}
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  // Google Material Design System
  container: {
    flex: 1,
    backgroundColor: "#f3f3f4",
  },
  
  // App Bar - Material Design
  topBar: {
    height: 64,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 30,
    paddingHorizontal: 16,
    backgroundColor: "#f3f3f4",
    borderBottomWidth: 1,
    borderBottomColor: "#E8EAED",
  },
  appTitleSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  smallLogo: {
    width: 40,
    height: 40,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: "500",
    color: "#202124",
    letterSpacing: -0.25,
  },
  profileButton: {
    width: 32,
    height: 32,
    backgroundColor: "#E8F0FE",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  profileIcon: {
    fontSize: 16,
  },
  // Active Conditions Bar - Material Design
  activeConditionsSection: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#f3f3f4",
    borderBottomWidth: 1,
    borderBottomColor: "#E8EAED",
  },
  activeConditionsLabel: {
    fontSize: 12,
    color: "#5F6368",
    marginBottom: 8,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  conditionChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  conditionChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DADCE0",
    gap: 6,
  },
  conditionChipIcon: {
    fontSize: 14,
  },
  conditionChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#202124",
  },
  personalizationContainer: {
    backgroundColor: "#f9f9f9",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  personalizationLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#333",
  },
  helperText: {
    fontSize: 11,
    color: "#666",
    marginTop: 4,
    fontStyle: "italic",
  },
  //yy7777777777
  homeSubDescription: {
    marginBottom:36,
    fontSize: 14,
    color: "#555",
    textAlign: "center",
  },
  homeMinorDescription: {
    fontWeight: "500",
    fontSize: 14,
    color: "#black",
    textAlign: "center",
    marginTop: 4,
    paddingBottom: 1,
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionChip: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#ccc",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 6,
    marginBottom: 6,
  },
  optionChipSelected: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  optionChipText: {
    fontSize: 12,
    color: "#333",
    fontWeight: "500",
  },
  optionChipTextSelected: {
    color: "#fff",
    fontWeight: "600",
  },
  // Camera Section - Material Design
  cameraSection: {
    padding: 24,
    paddingTop: 16,
  },
  cameraLabel: {
    fontSize: 12,
    color: "#5F6368",
    marginBottom: 12,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  cameraContainer: {
    width: "100%",
    height: 343,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#000",
    marginBottom: 16,
  },
  camera: {
    flex: 1,
  },
  // Buttons - Ma55terial Design
  primaryButton: {
    backgroundColor: "#1A73E8",
    paddingVertical: 5,
    paddingHorizontal: 24,
    borderRadius: 4,
    alignItems: "center",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  primaryButtonDisabled: {
    backgroundColor: "#F1F3F4",
    shadowOpacity: 0,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "500",
    fontSize: 14,
    letterSpacing: 0.25,
  },
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 5,
    paddingHorizontal: 24,
    borderRadius: 4,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#DADCE0",
  },
  secondaryButtonText: {
    color: "#1A73E8",
    fontWeight: "500",
    fontSize: 14,
    letterSpacing: 0.25,
  },
  loadingContainer: {
    marginTop: 16,
    marginHorizontal: 20,
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
    paddingBottom: 80,
    flexGrow: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
    marginHorizontal: 20,
    color: "#1a1a1a",
  },
  conditionBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  conditionBadgeIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  conditionBadgeText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  decisionBox: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 16,
    borderWidth: 3,
    alignItems: "center",
    marginHorizontal: 20,
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
    marginHorizontal: 20,
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
    marginHorizontal: 20,
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
    marginHorizontal: 20,
    paddingHorizontal: 4,
  },
  riskCard: {
    backgroundColor: "#fff8e1",
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 20,
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
    marginHorizontal: 20,
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
    marginHorizontal: 20,
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
    marginHorizontal: 20,
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
  // Allergy-specific styles
  allergyCard: {
    backgroundColor: "#ffebee",
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ef5350",
  },
  allergenItem: {
    fontSize: 14,
    color: "#c62828",
    marginBottom: 6,
    fontWeight: "600",
    lineHeight: 20,
  },
  hiddenAllergyCard: {
    backgroundColor: "#fff3e0",
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ffb74d",
  },
  hiddenAllergenItem: {
    fontSize: 14,
    color: "#e65100",
    marginBottom: 6,
    fontStyle: "italic",
    lineHeight: 20,
  },
  crossContamCard: {
    backgroundColor: "#fff8e1",
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ffd54f",
  },
  crossContamItem: {
    fontSize: 14,
    color: "#f57c00",
    marginBottom: 6,
    lineHeight: 20,
  },
  // Diabetes-specific styles
  diabetesCard: {
    backgroundColor: "#e3f2fd",
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#64b5f6",
  },
  diabetesMetric: {
    fontSize: 15,
    color: "#1565c0",
    marginBottom: 8,
    fontWeight: "600",
  },
  diabetesValue: {
    fontSize: 15,
    color: "#0d47a1",
    fontWeight: "700",
  },
  driversCard: {
    backgroundColor: "#ffebee",
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ef5350",
  },
  driverItem: {
    fontSize: 14,
    color: "#c62828",
    marginBottom: 6,
    lineHeight: 20,
  },
  buffersCard: {
    backgroundColor: "#e8f5e9",
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#66bb6a",
  },
  bufferItem: {
    fontSize: 14,
    color: "#2e7d32",
    marginBottom: 6,
    lineHeight: 20,
  },
  insulinRisksCard: {
    backgroundColor: "#fff3e0",
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ff9800",
  },
  insulinRiskItem: {
    fontSize: 14,
    color: "#e65100",
    marginBottom: 6,
    lineHeight: 20,
    fontWeight: "500",
  },
  // Hypertension-specific styles
  hypertensionCard: {
    backgroundColor: "#fce4ec",
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#f06292",
  },
  hypertensionMetric: {
    fontSize: 15,
    color: "#c2185b",
    fontWeight: "600",
  },
  hypertensionValue: {
    fontSize: 15,
    color: "#880e4f",
    fontWeight: "700",
  },
  pressureDriversCard: {
    backgroundColor: "#ffebee",
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ef5350",
  },
  pressureDriverItem: {
    fontSize: 14,
    color: "#c62828",
    marginBottom: 6,
    lineHeight: 20,
  },
  pressureBuffersCard: {
    backgroundColor: "#e8f5e9",
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#66bb6a",
  },
  pressureBufferItem: {
    fontSize: 14,
    color: "#2e7d32",
    marginBottom: 6,
    lineHeight: 20,
  },
  
  // Onboarding - Material Design
  onbHeader: {
    marginBottom: 48,
  },
  onbLogo: {
    width: 96,
    height: 96,
    marginBottom: 24,
  },
  onbTitle: {
    fontSize: 32,
    fontWeight: "400",
    color: "#202124",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  onbSubtitle: {
    fontSize: 16,
    color: "#5F6368",
    lineHeight: 24,
  },
  onbSectionTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#202124",
    marginBottom: 16,
    letterSpacing: 0.25,
  },
  onbConditionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#E8EAED",
    borderRadius: 8,
    marginBottom: 12,
  },
  onbConditionItemSelected: {
    backgroundColor: "#E8F0FE",
    borderColor: "#1A73E8",
  },
  onbConditionIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  onbConditionInfo: {
    flex: 1,
  },
  onbConditionName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#202124",
    marginBottom: 2,
  },
  onbConditionDesc: {
    fontSize: 14,
    color: "#5F6368",
  },
  onbConditionCheck: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: "#DADCE0",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  onbConditionCheckSelected: {
    backgroundColor: "#1A73E8",
    borderColor: "#1A73E8",
  },
  onbConditionCheckmark: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  onbContinueButton: {
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: "#1A73E8",
    borderRadius: 4,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  onbContinueButtonDisabled: {
    backgroundColor: "#F1F3F4",
    shadowOpacity: 0,
  },
  onbContinueButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 0.25,
  },
  onbFooter: {
    fontSize: 12,
    color: "#80868B",
    textAlign: "center",
    marginBottom: 40,
  },
  
  // Home Screen - Simple Selection
  homeContainer: {
    flex: 1,
    backgroundColor: "#f3f3f4",
  },
  homeScrollView: {
    flex: 1,
  },
  homeScrollContent: {
    flexGrow: 1,
    paddingTop: 80,
    paddingBottom: 40,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  homeHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  //marker8888888888888
  homeLogo: {
    width: 580,
    height: 180,
    marginBottom: 1,
  },
  homeTitle: {
    fontSize: 32,
    fontWeight: "400",
    color: "#202124",
    marginBottom: 1,
    letterSpacing: -0.5,
  },
  homeDescription: {
    fontSize: 20,
    color: "black",
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 300,
    paddingBottom: 5,
    fontWeight: "500",
  },
  homeButtons: {
    width: "100%",
    gap: 16,
    alignItems: "center",
  },
  homeButtonWrapper: {
    width: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
    borderRadius: 20,
  },
  //55555
  homeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderWidth: 2,
    borderRadius: 20,
    gap: 7,
    overflow: 'hidden',
  },
  homeButtonIcon: {
    width: 32,
    height: 32,
  },
  homeButtonText: {
    fontSize: 18,
    fontWeight: "500",
    color: "#202124",
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: "#1A73E8",
    fontWeight: "500",
  },
  
  // Settings Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  modalClose: {
    fontSize: 28,
    color: "#666",
    fontWeight: "300",
  },
  modalScroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  settingsSection: {
    marginBottom: 24,
  },
  settingsSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 12,
  },
  settingsTextInput: {
    backgroundColor: "#f9f9f9",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#333",
    minHeight: 50,
  },
  settingsHelperText: {
    fontSize: 12,
    color: "#666",
    marginTop: 6,
    fontStyle: "italic",
  },
  settingsOptionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  settingsOptionChip: {
    backgroundColor: "#f5f5f5",
    borderWidth: 2,
    borderColor: "#ddd",
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  settingsOptionChipSelected: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  settingsOptionText: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },
  settingsOptionTextSelected: {
    color: "#fff",
    fontWeight: "700",
  },
  settingsInfoBox: {
    backgroundColor: "#e3f2fd",
    padding: 14,
    borderRadius: 10,
    marginTop: 8,
    marginBottom: 16,
  },
  settingsInfoText: {
    fontSize: 13,
    color: "#1565c0",
    lineHeight: 19,
  },
  modalSaveButton: {
    backgroundColor: "#007AFF",
    marginHorizontal: 20,
    marginVertical: 16,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  modalSaveButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
});

// Export styles for testing
export { styles };
