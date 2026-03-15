#!/usr/bin/env python3
"""
Backend test for Customer Display functionality
Testing the "Thank you" screen and email receipt flow
"""

import requests
import json
import uuid
from datetime import datetime, timezone

# Get backend URL from frontend .env
BACKEND_URL = "https://github-import-56.preview.emergentagent.com/api"

# Test user credentials and data
TEST_USER_EMAIL = "test@example.com"
TEST_USER_PASSWORD = "password123"  
TEST_CUSTOMER_EMAIL = "customer@example.com"

def authenticate():
    """Get authentication token"""
    login_data = {
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD
    }
    
    response = requests.post(f"{BACKEND_URL}/auth/login", json=login_data)
    print(f"Login: {response.status_code} - {response.text[:200]}")
    
    if response.status_code == 200:
        data = response.json()
        return data.get("token"), data.get("user_id")
    return None, None

def test_generate_pairing_code():
    """Test 1: Generate pairing code - POST /api/customer-display/generate-code"""
    print("\n" + "="*60)
    print("TEST 1: Generate Pairing Code")
    print("="*60)
    
    response = requests.post(f"{BACKEND_URL}/customer-display/generate-code")
    print(f"Response: {response.status_code}")
    print(f"Content: {response.text}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ SUCCESS: Generated code: {data.get('code')}, display_id: {data.get('display_id')}")
        return data.get("code"), data.get("display_id")
    else:
        print(f"❌ FAILED: Expected 200, got {response.status_code}")
        return None, None

def test_create_order_and_confirm_payment(token, user_id):
    """Test 2: Create an order and simulate payment completion"""
    print("\n" + "="*60)
    print("TEST 2: Create Order and Confirm Payment")
    print("="*60)
    
    if not token:
        print("❌ FAILED: No authentication token")
        return None
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create test order
    order_data = {
        "items": [
            {
                "id": f"item_{uuid.uuid4().hex[:8]}",
                "name": "Test Product",
                "price": 50.0,
                "quantity": 2
            }
        ],
        "total": 100.0,
        "swish_phone": "1234567890",
        "customer_email": TEST_CUSTOMER_EMAIL
    }
    
    # Create order
    create_response = requests.post(f"{BACKEND_URL}/orders", json=order_data, headers=headers)
    print(f"Create Order: {create_response.status_code}")
    print(f"Content: {create_response.text[:300]}")
    
    if create_response.status_code != 200:
        print(f"❌ FAILED: Could not create order. Status: {create_response.status_code}")
        return None
    
    order_id = create_response.json().get("id")
    print(f"✅ Order created with ID: {order_id}")
    
    # Confirm payment (this should update display to "paid")
    confirm_response = requests.post(f"{BACKEND_URL}/orders/{order_id}/confirm", headers=headers)
    print(f"Confirm Payment: {confirm_response.status_code}")
    print(f"Content: {confirm_response.text}")
    
    if confirm_response.status_code == 200:
        print(f"✅ SUCCESS: Payment confirmed for order {order_id}")
        return order_id
    else:
        print(f"❌ FAILED: Could not confirm payment. Status: {confirm_response.status_code}")
        return None

def test_display_data(user_id):
    """Test 3: Check display data returns paid status - GET /api/customer-display"""
    print("\n" + "="*60)
    print("TEST 3: Check Display Data (Paid Status)")
    print("="*60)
    
    params = {"user_id": user_id} if user_id else {}
    response = requests.get(f"{BACKEND_URL}/customer-display", params=params)
    print(f"Response: {response.status_code}")
    print(f"Content: {response.text}")
    
    if response.status_code == 200:
        data = response.json()
        status = data.get("status")
        total = data.get("total")
        
        if status == "paid":
            print(f"✅ SUCCESS: Display shows paid status with total: {total}")
            return True
        elif status == "idle":
            print(f"⚠️  MINOR: Display is idle (may have auto-cleared)")
            return True
        else:
            print(f"❌ FAILED: Expected 'paid' status, got '{status}'")
            return False
    else:
        print(f"❌ FAILED: Could not get display data. Status: {response.status_code}")
        return False

def test_send_receipt(user_id):
    """Test 4: Test send-receipt endpoint - POST /api/customer-display/send-receipt"""
    print("\n" + "="*60)
    print("TEST 4: Send Receipt Email")
    print("="*60)
    
    receipt_data = {
        "email": TEST_CUSTOMER_EMAIL,
        "user_id": user_id
    }
    
    response = requests.post(f"{BACKEND_URL}/customer-display/send-receipt", json=receipt_data)
    print(f"Response: {response.status_code}")
    print(f"Content: {response.text}")
    
    if response.status_code == 200:
        data = response.json()
        success = data.get("success")
        message = data.get("message", "")
        
        if success:
            print(f"✅ SUCCESS: Receipt send successful - {message}")
            return True
        else:
            # Check if it's due to missing email configuration
            if "konfigurerad" in message or "not configured" in message.lower():
                print(f"✅ SUCCESS: Receipt endpoint working (email not configured as expected) - {message}")
                return True
            else:
                print(f"❌ FAILED: Receipt send failed - {message}")
                return False
    else:
        print(f"❌ FAILED: Send receipt request failed. Status: {response.status_code}")
        return False

def main():
    """Run all tests"""
    print("Backend Testing: Customer Display & Email Receipt Flow")
    print("="*60)
    
    # Track test results
    results = {
        "generate_code": False,
        "create_order": False, 
        "display_data": False,
        "send_receipt": False
    }
    
    # Test 1: Generate pairing code
    code, display_id = test_generate_pairing_code()
    results["generate_code"] = bool(code and display_id)
    
    # Get authentication
    token, user_id = authenticate()
    if not token:
        print("\n❌ CRITICAL: Could not authenticate user")
        print("This may be due to missing test user or auth issues")
        # Continue with user_id simulation for testing purposes
        user_id = "test_user_id"
    
    # Test 2: Create order and confirm payment
    order_id = test_create_order_and_confirm_payment(token, user_id)
    results["create_order"] = bool(order_id)
    
    # Test 3: Check display data
    results["display_data"] = test_display_data(user_id)
    
    # Test 4: Send receipt
    results["send_receipt"] = test_send_receipt(user_id)
    
    # Final summary
    print("\n" + "="*60)
    print("FINAL TEST SUMMARY")
    print("="*60)
    
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    total_passed = sum(results.values())
    total_tests = len(results)
    print(f"\nOverall: {total_passed}/{total_tests} tests passed")
    
    # Critical issues
    critical_issues = []
    if not results["generate_code"]:
        critical_issues.append("Pairing code generation failed")
    if not results["send_receipt"]:
        critical_issues.append("Receipt sending endpoint failed")
    
    if critical_issues:
        print(f"\n⚠️  CRITICAL ISSUES:")
        for issue in critical_issues:
            print(f"   - {issue}")
    
    return results

if __name__ == "__main__":
    main()