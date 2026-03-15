#!/usr/bin/env python3
"""
Backend API Testing for Password Change Endpoint
Test scenarios for POST /api/org/users/me/change-password
"""

import requests
import json
import sys
import os
from typing import Optional

# Get backend URL from frontend .env
BACKEND_URL = "https://github-import-56.preview.emergentagent.com/api"

# Test data - create a fresh user for testing
TEST_EMAIL = "testuser@example.com"
TEST_PASSWORD = "testpass123"  
TEST_NEW_PASSWORD_VALID = "newpassword123"
TEST_NEW_PASSWORD_SHORT = "12345"  # Too short (< 6 chars)

class PasswordChangeTest:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.test_results = []

    def log_result(self, test_name: str, passed: bool, details: str):
        """Log test result"""
        status = "✅ PASS" if passed else "❌ FAIL" 
        print(f"{status} {test_name}: {details}")
        self.test_results.append({
            'test': test_name,
            'passed': passed,
            'details': details
        })

    def test_health_check(self) -> bool:
        """Test if backend API is accessible"""
        try:
            response = self.session.get(f"{BACKEND_URL}/")
            if response.status_code == 200:
                data = response.json()
                self.log_result("Health Check", True, f"Backend accessible - {data.get('message', 'OK')}")
                return True
            else:
                self.log_result("Health Check", False, f"Backend returned {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Health Check", False, f"Connection failed: {str(e)}")
            return False

    def create_test_user(self) -> bool:
        """Create a test user for authentication"""  
        try:
            # Check if user already exists first
            user_data = {
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD,
                "organization_name": "Test Company AB",
                "phone": "+46701234567",
                "name": "Test Admin"
            }
            
            response = self.session.post(f"{BACKEND_URL}/auth/register", json=user_data)
            
            if response.status_code == 200:
                self.log_result("Test User Creation", True, "Test user created successfully")
                return True
            elif response.status_code == 400 and "redan registrerad" in response.text:
                self.log_result("Test User Creation", True, "Test user already exists")
                return True
            else:
                self.log_result("Test User Creation", False, f"Failed to create user: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Test User Creation", False, f"Error creating user: {str(e)}")
            return False

    def verify_user_email(self) -> bool:
        """Manually verify the test user's email by updating the database"""
        try:
            import subprocess
            result = subprocess.run([
                'mongosh', 
                'mongodb://localhost:27017/pos_production',
                '--eval',
                f'db.users.updateOne({{"email": "{TEST_EMAIL}"}}, {{"$set": {{"email_verified": true}}}});print("Verified user email");',
                '--quiet'
            ], capture_output=True, text=True, timeout=10)
            
            if result.returncode == 0:
                self.log_result("Email Verification", True, "User email verified manually for testing")
                return True
            else:
                self.log_result("Email Verification", False, f"Failed to verify email: {result.stderr}")
                return False
        except Exception as e:
            self.log_result("Email Verification", False, f"Error verifying email: {str(e)}")
            return False

    def authenticate_user(self) -> bool:
        """Login and get authentication token"""
        try:
            login_data = {
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD
            }
            
            response = self.session.post(f"{BACKEND_URL}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                self.auth_token = data.get("session_token")
                
                if self.auth_token:
                    self.log_result("Authentication", True, f"Successfully logged in, got token: {self.auth_token[:20]}...")
                    return True
                else:
                    self.log_result("Authentication", False, "No session token in response")
                    return False
                    
            elif response.status_code == 403 and "verifierad" in response.text:
                # Need to verify email - let's simulate this
                self.log_result("Authentication", False, "Email not verified - need manual verification")
                return False
            else:
                self.log_result("Authentication", False, f"Login failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Authentication", False, f"Login error: {str(e)}")
            return False

    def test_password_change_without_auth(self) -> bool:
        """Test 1: Password change without authentication - should return 401"""
        try:
            change_data = {"new_password": TEST_NEW_PASSWORD_VALID}
            
            # Make request without auth header AND without session cookies
            # Create a new session to avoid cookies from login
            no_auth_session = requests.Session()
            response = no_auth_session.post(
                f"{BACKEND_URL}/org/users/me/change-password",
                json=change_data
            )
            
            if response.status_code == 401:
                response_data = response.json()
                detail = response_data.get("detail", "")
                
                if "inloggad" in detail.lower():
                    self.log_result("No Auth Test", True, f"Correctly returned 401 with message: {detail}")
                    return True
                else:
                    self.log_result("No Auth Test", False, f"Got 401 but wrong message: {detail}")
                    return False
            else:
                self.log_result("No Auth Test", False, f"Expected 401, got {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("No Auth Test", False, f"Error: {str(e)}")
            return False

    def test_password_change_short_password(self) -> bool:
        """Test 2: Password change with too short password - should return 400"""
        if not self.auth_token:
            self.log_result("Short Password Test", False, "No auth token available")
            return False
            
        try:
            change_data = {"new_password": TEST_NEW_PASSWORD_SHORT}
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            
            response = self.session.post(
                f"{BACKEND_URL}/org/users/me/change-password",
                json=change_data,
                headers=headers
            )
            
            if response.status_code == 400:
                response_data = response.json()
                detail = response_data.get("detail", "")
                
                if "6 tecken" in detail:
                    self.log_result("Short Password Test", True, f"Correctly returned 400 with message: {detail}")
                    return True
                else:
                    self.log_result("Short Password Test", False, f"Got 400 but wrong message: {detail}")
                    return False
            else:
                self.log_result("Short Password Test", False, f"Expected 400, got {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Short Password Test", False, f"Error: {str(e)}")
            return False

    def test_password_change_valid(self) -> bool:
        """Test 3: Valid password change - should return success"""
        if not self.auth_token:
            self.log_result("Valid Password Change Test", False, "No auth token available")
            return False
            
        try:
            change_data = {"new_password": TEST_NEW_PASSWORD_VALID}
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            
            response = self.session.post(
                f"{BACKEND_URL}/org/users/me/change-password",
                json=change_data,
                headers=headers
            )
            
            if response.status_code == 200:
                response_data = response.json()
                message = response_data.get("message", "")
                success = response_data.get("success", False)
                
                if success and "ändrats" in message:
                    self.log_result("Valid Password Change Test", True, f"Successfully changed password: {message}")
                    return True
                else:
                    self.log_result("Valid Password Change Test", False, f"Unexpected response format: {response_data}")
                    return False
            else:
                self.log_result("Valid Password Change Test", False, f"Expected 200, got {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Valid Password Change Test", False, f"Error: {str(e)}")
            return False

    def test_login_with_new_password(self) -> bool:
        """Test 4: Verify password was actually changed by logging in with new password"""
        try:
            # First try with old password - should fail
            old_login_data = {
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD
            }
            
            response = self.session.post(f"{BACKEND_URL}/auth/login", json=old_login_data)
            
            if response.status_code == 401:
                # Good - old password rejected
                # Now try with new password
                new_login_data = {
                    "email": TEST_EMAIL,
                    "password": TEST_NEW_PASSWORD_VALID
                }
                
                response = self.session.post(f"{BACKEND_URL}/auth/login", json=new_login_data)
                
                if response.status_code == 200:
                    data = response.json()
                    new_token = data.get("session_token")
                    
                    if new_token:
                        self.log_result("Login With New Password Test", True, f"Successfully logged in with new password, got token: {new_token[:20]}...")
                        return True
                    else:
                        self.log_result("Login With New Password Test", False, "Login succeeded but no token in response")
                        return False
                else:
                    self.log_result("Login With New Password Test", False, f"Login with new password failed: {response.status_code} - {response.text}")
                    return False
            else:
                self.log_result("Login With New Password Test", False, f"Old password still works (expected 401, got {response.status_code})")
                return False
                
        except Exception as e:
            self.log_result("Login With New Password Test", False, f"Error: {str(e)}")
            return False

    def run_all_tests(self):
        """Run all password change tests"""
        print("=== Password Change Endpoint Testing ===")
        print(f"Testing endpoint: POST {BACKEND_URL}/org/users/me/change-password")
        print()
        
        # Health check
        if not self.test_health_check():
            print("❌ Backend not accessible - stopping tests")
            return
        
        # Setup test user
        print("\n--- Setup Phase ---")
        if not self.create_test_user():
            print("❌ Could not create test user - stopping tests")
            return
        
        # Verify the user's email
        if not self.verify_user_email():
            print("❌ Could not verify user email - stopping tests")
            return
        
        if not self.authenticate_user():
            print("❌ Could not authenticate - stopping tests")
            return
        
        # Run the actual tests
        print("\n--- Password Change Tests ---")
        
        # Test 1: No authentication
        self.test_password_change_without_auth()
        
        # Test 2: Too short password
        self.test_password_change_short_password()
        
        # Test 3: Valid password change
        valid_change_success = self.test_password_change_valid()
        
        # Test 4: Verify password was changed (only if previous test passed)
        if valid_change_success:
            self.test_login_with_new_password()
        else:
            self.log_result("Login With New Password Test", False, "Skipped - password change failed")
        
        # Summary
        print("\n=== Test Summary ===")
        passed = sum(1 for result in self.test_results if result['passed'])
        total = len(self.test_results)
        
        print(f"Tests Passed: {passed}/{total}")
        
        if passed == total:
            print("🎉 All tests passed!")
        else:
            print("⚠️  Some tests failed - check details above")
            
        print("\n--- Detailed Results ---")
        for result in self.test_results:
            status = "✅" if result['passed'] else "❌"
            print(f"{status} {result['test']}: {result['details']}")

if __name__ == "__main__":
    tester = PasswordChangeTest()
    tester.run_all_tests()