#!/usr/bin/env python3
"""
Comprehensive Backend Tests for FoodSense API
Tests all 4 conditions with personalization
"""
import sys
import os
import json
import base64
import requests
from io import BytesIO
from PIL import Image

# Test configuration
BACKEND_URL = "http://localhost:8000"
TEST_IMAGE_PATH = "test_food.jpg"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def print_success(msg):
    print(f"{Colors.GREEN}✓ {msg}{Colors.END}")

def print_error(msg):
    print(f"{Colors.RED}✗ {msg}{Colors.END}")

def print_info(msg):
    print(f"{Colors.BLUE}ℹ {msg}{Colors.END}")

def print_warning(msg):
    print(f"{Colors.YELLOW}⚠ {msg}{Colors.END}")

# Generate test image if it doesn't exist
def create_test_image():
    """Create a simple test food image"""
    if os.path.exists(TEST_IMAGE_PATH):
        return
    
    print_info("Creating test image...")
    img = Image.new('RGB', (400, 400), color=(200, 150, 100))
    img.save(TEST_IMAGE_PATH)
    print_success(f"Created {TEST_IMAGE_PATH}")

# Test 1: Health Check
def test_health_check():
    print_info("\n=== Test 1: Health Check ===")
    try:
        response = requests.get(f"{BACKEND_URL}/")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["status"] == "ok", "Status should be 'ok'"
        assert "version" in data, "Should have version"
        assert "supported_conditions" in data, "Should list supported conditions"
        assert len(data["supported_conditions"]) == 4, "Should support 4 conditions"
        
        print_success("Health check passed")
        return True
    except Exception as e:
        print_error(f"Health check failed: {e}")
        return False

# Test 2: IBS Analysis (No personalization)
def test_ibs_analysis():
    print_info("\n=== Test 2: IBS Analysis ===")
    try:
        with open(TEST_IMAGE_PATH, 'rb') as f:
            files = {'file': ('test.jpg', f, 'image/jpeg')}
            data = {'condition': 'ibs'}
            response = requests.post(f"{BACKEND_URL}/analyze", files=files, data=data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        result = response.json()
        assert "condition" in result, "Should have condition"
        assert result["condition"] == "ibs", "Condition should be 'ibs'"
        assert "food_observation" in result, "Should have food_observation"
        assert "ibs_risk_result" in result, "Should have ibs_risk_result"
        
        # Check IBS-specific fields
        ibs_result = result["ibs_risk_result"]
        assert "decision" in ibs_result, "Should have decision"
        assert ibs_result["decision"] in ["likely_ok", "caution", "avoid"], "Invalid decision"
        assert "ibs_c_note" in ibs_result, "Should have IBS-C note"
        assert "ibs_d_note" in ibs_result, "Should have IBS-D note"
        assert "ibs_m_note" in ibs_result, "Should have IBS-M note"
        assert "ibs_u_note" in ibs_result, "Should have IBS-U note"
        
        print_success("IBS analysis passed")
        return True
    except Exception as e:
        print_error(f"IBS analysis failed: {e}")
        return False

# Test 3: Allergy Analysis (Without user allergies)
def test_allergy_general():
    print_info("\n=== Test 3: Allergy Analysis (General) ===")
    try:
        with open(TEST_IMAGE_PATH, 'rb') as f:
            files = {'file': ('test.jpg', f, 'image/jpeg')}
            data = {'condition': 'allergy'}
            response = requests.post(f"{BACKEND_URL}/analyze", files=files, data=data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        result = response.json()
        assert result["condition"] == "allergy", "Condition should be 'allergy'"
        assert "allergy_risk_result" in result, "Should have allergy_risk_result"
        
        allergy_result = result["allergy_risk_result"]
        assert "suspected_allergens" in allergy_result, "Should have suspected_allergens"
        assert "possible_hidden_allergens" in allergy_result, "Should have possible_hidden_allergens"
        assert "cross_contamination_risks" in allergy_result, "Should have cross_contamination_risks"
        
        print_success("Allergy general analysis passed")
        return True
    except Exception as e:
        print_error(f"Allergy general analysis failed: {e}")
        return False

# Test 4: Allergy Analysis (With user allergies)
def test_allergy_personalized():
    print_info("\n=== Test 4: Allergy Analysis (Personalized) ===")
    try:
        with open(TEST_IMAGE_PATH, 'rb') as f:
            files = {'file': ('test.jpg', f, 'image/jpeg')}
            data = {
                'condition': 'allergy',
                'user_allergies': 'peanuts, shellfish, dairy'
            }
            response = requests.post(f"{BACKEND_URL}/analyze", files=files, data=data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        result = response.json()
        assert "allergy_risk_result" in result, "Should have allergy_risk_result"
        
        # Personalized advice should mention user's specific allergies
        allergy_result = result["allergy_risk_result"]
        advice = allergy_result.get("advice_short", "").lower()
        
        print_success("Allergy personalized analysis passed")
        print_info(f"   Advice mentions personalization: {'peanuts' in advice or 'dairy' in advice or 'shellfish' in advice}")
        return True
    except Exception as e:
        print_error(f"Allergy personalized analysis failed: {e}")
        return False

# Test 5: Diabetes Analysis (General)
def test_diabetes_general():
    print_info("\n=== Test 5: Diabetes Analysis (General) ===")
    try:
        with open(TEST_IMAGE_PATH, 'rb') as f:
            files = {'file': ('test.jpg', f, 'image/jpeg')}
            data = {'condition': 'diabetes'}
            response = requests.post(f"{BACKEND_URL}/analyze", files=files, data=data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        result = response.json()
        assert "diabetes_risk_result" in result, "Should have diabetes_risk_result"
        
        diabetes_result = result["diabetes_risk_result"]
        assert "glucose_curve_prediction" in diabetes_result, "Should have glucose_curve_prediction"
        assert "carbohydrate_load" in diabetes_result, "Should have carbohydrate_load"
        assert "glucose_drivers" in diabetes_result, "Should have glucose_drivers"
        assert "glucose_buffers" in diabetes_result, "Should have glucose_buffers"
        
        print_success("Diabetes general analysis passed")
        return True
    except Exception as e:
        print_error(f"Diabetes general analysis failed: {e}")
        return False

# Test 6: Diabetes Analysis (Type 2)
def test_diabetes_type2():
    print_info("\n=== Test 6: Diabetes Analysis (Type 2) ===")
    try:
        with open(TEST_IMAGE_PATH, 'rb') as f:
            files = {'file': ('test.jpg', f, 'image/jpeg')}
            data = {
                'condition': 'diabetes',
                'diabetes_type': 'type2'
            }
            response = requests.post(f"{BACKEND_URL}/analyze", files=files, data=data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        result = response.json()
        assert "diabetes_risk_result" in result, "Should have diabetes_risk_result"
        
        print_success("Diabetes Type 2 analysis passed")
        return True
    except Exception as e:
        print_error(f"Diabetes Type 2 analysis failed: {e}")
        return False

# Test 7: Hypertension Analysis (General)
def test_hypertension_general():
    print_info("\n=== Test 7: Hypertension Analysis (General) ===")
    try:
        with open(TEST_IMAGE_PATH, 'rb') as f:
            files = {'file': ('test.jpg', f, 'image/jpeg')}
            data = {'condition': 'hypertension'}
            response = requests.post(f"{BACKEND_URL}/analyze", files=files, data=data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        result = response.json()
        assert "hypertension_risk_result" in result, "Should have hypertension_risk_result"
        
        hypertension_result = result["hypertension_risk_result"]
        assert "sodium_load_estimate" in hypertension_result, "Should have sodium_load_estimate"
        assert "pressure_drivers" in hypertension_result, "Should have pressure_drivers"
        assert "pressure_buffers" in hypertension_result, "Should have pressure_buffers"
        
        print_success("Hypertension general analysis passed")
        return True
    except Exception as e:
        print_error(f"Hypertension general analysis failed: {e}")
        return False

# Test 8: Hypertension Analysis (Stage 2)
def test_hypertension_stage2():
    print_info("\n=== Test 8: Hypertension Analysis (Stage 2) ===")
    try:
        with open(TEST_IMAGE_PATH, 'rb') as f:
            files = {'file': ('test.jpg', f, 'image/jpeg')}
            data = {
                'condition': 'hypertension',
                'hypertension_severity': 'stage2'
            }
            response = requests.post(f"{BACKEND_URL}/analyze", files=files, data=data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        result = response.json()
        assert "hypertension_risk_result" in result, "Should have hypertension_risk_result"
        
        print_success("Hypertension Stage 2 analysis passed")
        return True
    except Exception as e:
        print_error(f"Hypertension Stage 2 analysis failed: {e}")
        return False

# Test 9: Invalid condition
def test_invalid_condition():
    print_info("\n=== Test 9: Invalid Condition (Error Handling) ===")
    try:
        with open(TEST_IMAGE_PATH, 'rb') as f:
            files = {'file': ('test.jpg', f, 'image/jpeg')}
            data = {'condition': 'invalid_condition'}
            response = requests.post(f"{BACKEND_URL}/analyze", files=files, data=data)
        
        # Should return error (422 validation error)
        assert response.status_code != 200, "Should reject invalid condition"
        
        print_success("Invalid condition properly rejected")
        return True
    except Exception as e:
        print_error(f"Invalid condition test failed: {e}")
        return False

# Test 10: All conditions have required fields
def test_response_structure():
    print_info("\n=== Test 10: Response Structure Validation ===")
    conditions = ["ibs", "allergy", "diabetes", "hypertension"]
    all_passed = True
    
    for condition in conditions:
        try:
            with open(TEST_IMAGE_PATH, 'rb') as f:
                files = {'file': ('test.jpg', f, 'image/jpeg')}
                data = {'condition': condition}
                response = requests.post(f"{BACKEND_URL}/analyze", files=files, data=data)
            
            result = response.json()
            
            # Check common fields
            assert "condition" in result, f"{condition}: Missing 'condition'"
            assert "food_observation" in result, f"{condition}: Missing 'food_observation'"
            assert "disclaimer" in result, f"{condition}: Missing 'disclaimer'"
            
            # Check food observation fields
            obs = result["food_observation"]
            assert "dish_name" in obs, f"{condition}: Missing 'dish_name'"
            assert "overall_confidence" in obs, f"{condition}: Missing 'overall_confidence'"
            
            print_success(f"   {condition}: Structure valid")
        except Exception as e:
            print_error(f"   {condition}: Structure invalid - {e}")
            all_passed = False
    
    if all_passed:
        print_success("All response structures valid")
    return all_passed

# Run all tests
def run_all_tests():
    print_info("\n" + "="*60)
    print_info("   FOODSENSE BACKEND TEST SUITE")
    print_info("="*60)
    
    # Check if backend is running
    try:
        requests.get(f"{BACKEND_URL}/", timeout=2)
    except requests.exceptions.ConnectionError:
        print_error(f"\n✗ Backend not running at {BACKEND_URL}")
        print_info("Start backend with: cd backend && uvicorn backend:app --host 0.0.0.0 --port 8000")
        return False
    
    create_test_image()
    
    tests = [
        ("Health Check", test_health_check),
        ("IBS Analysis", test_ibs_analysis),
        ("Allergy General", test_allergy_general),
        ("Allergy Personalized", test_allergy_personalized),
        ("Diabetes General", test_diabetes_general),
        ("Diabetes Type 2", test_diabetes_type2),
        ("Hypertension General", test_hypertension_general),
        ("Hypertension Stage 2", test_hypertension_stage2),
        ("Invalid Condition", test_invalid_condition),
        ("Response Structure", test_response_structure),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            passed = test_func()
            results.append((name, passed))
        except Exception as e:
            print_error(f"Unexpected error in {name}: {e}")
            results.append((name, False))
    
    # Summary
    print_info("\n" + "="*60)
    print_info("   TEST RESULTS SUMMARY")
    print_info("="*60)
    
    passed_count = sum(1 for _, passed in results if passed)
    total_count = len(results)
    
    for name, passed in results:
        if passed:
            print_success(f"{name}")
        else:
            print_error(f"{name}")
    
    print_info(f"\nPassed: {passed_count}/{total_count}")
    
    if passed_count == total_count:
        print_success("\n🎉 ALL TESTS PASSED! 🎉\n")
        return True
    else:
        print_warning(f"\n⚠ {total_count - passed_count} test(s) failed\n")
        return False

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
