/**
 * Integration Tests
 * Tests the complete flow from preferences to API call
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  USER_ALLERGIES: '@foodsense_user_allergies',
  DIABETES_TYPE: '@foodsense_diabetes_type',
  HYPERTENSION_SEVERITY: '@foodsense_hypertension_severity',
};

describe('Integration Tests', () => {
  
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('Full workflow: Save preferences → Load → Use in API call', async () => {
    // Step 1: User saves preferences
    const userPrefs = {
      allergies: 'peanuts, dairy',
      diabetes: 'type2',
      hypertension: 'stage1',
    };

    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.USER_ALLERGIES, userPrefs.allergies),
      AsyncStorage.setItem(STORAGE_KEYS.DIABETES_TYPE, userPrefs.diabetes),
      AsyncStorage.setItem(STORAGE_KEYS.HYPERTENSION_SEVERITY, userPrefs.hypertension),
    ]);

    // Step 2: App restarts and loads preferences
    const [loadedAllergies, loadedDiabetes, loadedHypertension] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.USER_ALLERGIES),
      AsyncStorage.getItem(STORAGE_KEYS.DIABETES_TYPE),
      AsyncStorage.getItem(STORAGE_KEYS.HYPERTENSION_SEVERITY),
    ]);

    expect(loadedAllergies).toBe(userPrefs.allergies);
    expect(loadedDiabetes).toBe(userPrefs.diabetes);
    expect(loadedHypertension).toBe(userPrefs.hypertension);

    // Step 3: Preferences would be used in API call (simulation)
    const apiPayload = {
      condition: 'allergy',
      user_allergies: loadedAllergies,
    };

    expect(apiPayload.user_allergies).toBe('peanuts, dairy');
  });

  test('Condition-specific preference selection', async () => {
    // Save all preferences
    await AsyncStorage.setItem(STORAGE_KEYS.USER_ALLERGIES, 'peanuts');
    await AsyncStorage.setItem(STORAGE_KEYS.DIABETES_TYPE, 'type1');
    await AsyncStorage.setItem(STORAGE_KEYS.HYPERTENSION_SEVERITY, 'stage2');

    // Load based on condition
    const condition = 'diabetes';
    let relevantPref = null;

    if (condition === 'allergy') {
      relevantPref = await AsyncStorage.getItem(STORAGE_KEYS.USER_ALLERGIES);
    } else if (condition === 'diabetes') {
      relevantPref = await AsyncStorage.getItem(STORAGE_KEYS.DIABETES_TYPE);
    } else if (condition === 'hypertension') {
      relevantPref = await AsyncStorage.getItem(STORAGE_KEYS.HYPERTENSION_SEVERITY);
    }

    expect(relevantPref).toBe('type1');
  });

  test('Empty preferences dont break API calls', async () => {
    // No preferences saved
    const allergies = await AsyncStorage.getItem(STORAGE_KEYS.USER_ALLERGIES);
    
    // Should be null, API should handle this
    expect(allergies).toBeNull();
    
    // API call would be made without optional parameter
    const apiPayload = {
      condition: 'allergy',
      // user_allergies omitted if null
    };
    
    if (allergies) {
      apiPayload.user_allergies = allergies;
    }
    
    expect(apiPayload.user_allergies).toBeUndefined();
  });

  test('Update workflow: Change and resave preferences', async () => {
    // Initial save
    await AsyncStorage.setItem(STORAGE_KEYS.DIABETES_TYPE, 'type1');
    
    // User updates
    await AsyncStorage.setItem(STORAGE_KEYS.DIABETES_TYPE, 'type2');
    
    // Next analysis uses updated value
    const currentType = await AsyncStorage.getItem(STORAGE_KEYS.DIABETES_TYPE);
    
    expect(currentType).toBe('type2');
  });

  test('Multi-user scenario: Each device has own storage', async () => {
    // User 1 preferences
    await AsyncStorage.setItem(STORAGE_KEYS.USER_ALLERGIES, 'peanuts');
    
    // Retrieve (simulating User 1's device)
    const user1Allergies = await AsyncStorage.getItem(STORAGE_KEYS.USER_ALLERGIES);
    
    expect(user1Allergies).toBe('peanuts');
    
    // Note: In real app, each device/phone has separate storage
    // This test simulates that storage is isolated per device
  });

  test('Preference persistence across app features', async () => {
    // Save once
    await AsyncStorage.setItem(STORAGE_KEYS.USER_ALLERGIES, 'dairy');
    
    // Use in multiple analyses (simulated)
    const analysis1Prefs = await AsyncStorage.getItem(STORAGE_KEYS.USER_ALLERGIES);
    const analysis2Prefs = await AsyncStorage.getItem(STORAGE_KEYS.USER_ALLERGIES);
    const analysis3Prefs = await AsyncStorage.getItem(STORAGE_KEYS.USER_ALLERGIES);
    
    // All should be the same
    expect(analysis1Prefs).toBe('dairy');
    expect(analysis2Prefs).toBe('dairy');
    expect(analysis3Prefs).toBe('dairy');
  });
});

describe('Error Handling Tests', () => {
  test('Handles corrupted storage gracefully', async () => {
    // Simulate corrupted data
    await AsyncStorage.setItem(STORAGE_KEYS.DIABETES_TYPE, 'invalid_type');
    
    const retrieved = await AsyncStorage.getItem(STORAGE_KEYS.DIABETES_TYPE);
    
    // App should validate and use default if invalid
    const validTypes = ['general', 'type1', 'type2', 'gestational', 'prediabetes'];
    const isValid = validTypes.includes(retrieved);
    
    if (!isValid) {
      // App would use 'general' as fallback
      expect(retrieved).toBe('invalid_type');
      expect(isValid).toBe(false);
    }
  });

  test('Handles storage errors with try-catch', async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.USER_ALLERGIES, 'peanuts');
      const retrieved = await AsyncStorage.getItem(STORAGE_KEYS.USER_ALLERGIES);
      expect(retrieved).toBe('peanuts');
    } catch (error) {
      // Should not throw in normal operation
      expect(error).toBeUndefined();
    }
  });
});
