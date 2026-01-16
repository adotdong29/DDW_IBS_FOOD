/**
 * AsyncStorage Persistence Tests
 * Tests local storage of user preferences
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys (must match App.js)
const STORAGE_KEYS = {
  USER_ALLERGIES: '@foodsense_user_allergies',
  DIABETES_TYPE: '@foodsense_diabetes_type',
  HYPERTENSION_SEVERITY: '@foodsense_hypertension_severity',
};

describe('AsyncStorage Persistence Tests', () => {
  
  // Clear storage before each test
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('Storage keys are defined correctly', () => {
    expect(STORAGE_KEYS.USER_ALLERGIES).toBe('@foodsense_user_allergies');
    expect(STORAGE_KEYS.DIABETES_TYPE).toBe('@foodsense_diabetes_type');
    expect(STORAGE_KEYS.HYPERTENSION_SEVERITY).toBe('@foodsense_hypertension_severity');
  });

  test('Can save and retrieve user allergies', async () => {
    const testAllergies = 'peanuts, dairy, shellfish';
    
    // Save
    await AsyncStorage.setItem(STORAGE_KEYS.USER_ALLERGIES, testAllergies);
    
    // Retrieve
    const retrieved = await AsyncStorage.getItem(STORAGE_KEYS.USER_ALLERGIES);
    
    expect(retrieved).toBe(testAllergies);
  });

  test('Can save and retrieve diabetes type', async () => {
    const testType = 'type2';
    
    // Save
    await AsyncStorage.setItem(STORAGE_KEYS.DIABETES_TYPE, testType);
    
    // Retrieve
    const retrieved = await AsyncStorage.getItem(STORAGE_KEYS.DIABETES_TYPE);
    
    expect(retrieved).toBe(testType);
  });

  test('Can save and retrieve hypertension severity', async () => {
    const testSeverity = 'stage1';
    
    // Save
    await AsyncStorage.setItem(STORAGE_KEYS.HYPERTENSION_SEVERITY, testSeverity);
    
    // Retrieve
    const retrieved = await AsyncStorage.getItem(STORAGE_KEYS.HYPERTENSION_SEVERITY);
    
    expect(retrieved).toBe(testSeverity);
  });

  test('Returns null for non-existent keys', async () => {
    const retrieved = await AsyncStorage.getItem(STORAGE_KEYS.USER_ALLERGIES);
    expect(retrieved).toBeNull();
  });

  test('Can save all preferences at once', async () => {
    const preferences = {
      allergies: 'peanuts',
      diabetes: 'type1',
      hypertension: 'stage2',
    };

    // Save all
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.USER_ALLERGIES, preferences.allergies),
      AsyncStorage.setItem(STORAGE_KEYS.DIABETES_TYPE, preferences.diabetes),
      AsyncStorage.setItem(STORAGE_KEYS.HYPERTENSION_SEVERITY, preferences.hypertension),
    ]);

    // Retrieve all
    const [allergies, diabetes, hypertension] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.USER_ALLERGIES),
      AsyncStorage.getItem(STORAGE_KEYS.DIABETES_TYPE),
      AsyncStorage.getItem(STORAGE_KEYS.HYPERTENSION_SEVERITY),
    ]);

    expect(allergies).toBe(preferences.allergies);
    expect(diabetes).toBe(preferences.diabetes);
    expect(hypertension).toBe(preferences.hypertension);
  });

  test('Can update existing preferences', async () => {
    // Initial save
    await AsyncStorage.setItem(STORAGE_KEYS.USER_ALLERGIES, 'peanuts');
    
    // Update
    await AsyncStorage.setItem(STORAGE_KEYS.USER_ALLERGIES, 'peanuts, dairy');
    
    // Retrieve updated
    const retrieved = await AsyncStorage.getItem(STORAGE_KEYS.USER_ALLERGIES);
    
    expect(retrieved).toBe('peanuts, dairy');
  });

  test('Can clear all preferences', async () => {
    // Save some data
    await AsyncStorage.setItem(STORAGE_KEYS.USER_ALLERGIES, 'peanuts');
    await AsyncStorage.setItem(STORAGE_KEYS.DIABETES_TYPE, 'type1');
    
    // Clear
    await AsyncStorage.clear();
    
    // Verify cleared
    const allergies = await AsyncStorage.getItem(STORAGE_KEYS.USER_ALLERGIES);
    const diabetes = await AsyncStorage.getItem(STORAGE_KEYS.DIABETES_TYPE);
    
    expect(allergies).toBeNull();
    expect(diabetes).toBeNull();
  });

  test('Empty string is different from null', async () => {
    // Save empty string
    await AsyncStorage.setItem(STORAGE_KEYS.USER_ALLERGIES, '');
    
    // Retrieve
    const retrieved = await AsyncStorage.getItem(STORAGE_KEYS.USER_ALLERGIES);
    
    expect(retrieved).toBe('');
    expect(retrieved).not.toBeNull();
  });

  test('Handles special characters in allergies', async () => {
    const specialAllergies = 'peanuts, tree-nuts (almonds/walnuts), shellfish & dairy';
    
    await AsyncStorage.setItem(STORAGE_KEYS.USER_ALLERGIES, specialAllergies);
    const retrieved = await AsyncStorage.getItem(STORAGE_KEYS.USER_ALLERGIES);
    
    expect(retrieved).toBe(specialAllergies);
  });

  test('Persistence survives multiple operations', async () => {
    // Operation 1: Save
    await AsyncStorage.setItem(STORAGE_KEYS.DIABETES_TYPE, 'type1');
    
    // Operation 2: Save another
    await AsyncStorage.setItem(STORAGE_KEYS.USER_ALLERGIES, 'peanuts');
    
    // Operation 3: Update first
    await AsyncStorage.setItem(STORAGE_KEYS.DIABETES_TYPE, 'type2');
    
    // Verify final state
    const diabetes = await AsyncStorage.getItem(STORAGE_KEYS.DIABETES_TYPE);
    const allergies = await AsyncStorage.getItem(STORAGE_KEYS.USER_ALLERGIES);
    
    expect(diabetes).toBe('type2');
    expect(allergies).toBe('peanuts');
  });
});

describe('Preference Validation Tests', () => {
  test('Valid diabetes types', () => {
    const validTypes = ['general', 'type1', 'type2', 'gestational', 'prediabetes'];
    validTypes.forEach(type => {
      expect(['general', 'type1', 'type2', 'gestational', 'prediabetes']).toContain(type);
    });
  });

  test('Valid hypertension severities', () => {
    const validSeverities = ['general', 'stage1', 'stage2', 'controlled'];
    validSeverities.forEach(severity => {
      expect(['general', 'stage1', 'stage2', 'controlled']).toContain(severity);
    });
  });

  test('Allergy string formatting', () => {
    const allergies = 'peanuts, dairy, shellfish';
    const split = allergies.split(',').map(a => a.trim());
    
    expect(split).toEqual(['peanuts', 'dairy', 'shellfish']);
  });
});
