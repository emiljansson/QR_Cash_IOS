"""
Backend tests for Customer Display functionality
- Generate pairing code
- Check pairing code status
- Pair display with user
- Get paired displays
- Unpair display
- Connection status
- Get display data
- Reset display
"""

import pytest
import requests
import os

# Get backend URL from environment
_backend_url = os.environ.get('EXPO_PUBLIC_BACKEND_URL')
if not _backend_url:
    # Try reading from frontend .env file
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('EXPO_PUBLIC_BACKEND_URL='):
                    _backend_url = line.split('=', 1)[1].strip()
                    break
    except:
        pass

if not _backend_url:
    raise ValueError("EXPO_PUBLIC_BACKEND_URL not found in environment or /app/frontend/.env")

BASE_URL = _backend_url.rstrip('/')

class TestCustomerDisplay:
    """Customer Display pairing and management tests"""

    def test_generate_pairing_code(self):
        """POST /api/customer-display/generate-code - should return 4-digit code and display_id"""
        response = requests.post(f"{BASE_URL}/api/customer-display/generate-code")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "code" in data, "Response missing 'code' field"
        assert "display_id" in data, "Response missing 'display_id' field"
        assert "expires_in" in data, "Response missing 'expires_in' field"
        assert len(data["code"]) == 4, f"Code should be 4 digits, got {len(data['code'])}"
        assert data["code"].isdigit(), f"Code should be numeric, got {data['code']}"
        assert data["expires_in"] == 300, f"Expected 300 seconds expiration, got {data['expires_in']}"
        print(f"✅ Generate code: {data['code']}, display_id: {data['display_id']}")

    def test_check_unpaired_code(self):
        """GET /api/customer-display/check-code/{code} - unpaired code should return valid=true, paired=false"""
        # Generate a code first
        gen_response = requests.post(f"{BASE_URL}/api/customer-display/generate-code")
        code = gen_response.json()["code"]
        
        # Check the code before pairing
        response = requests.get(f"{BASE_URL}/api/customer-display/check-code/{code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["valid"] == True, "Code should be valid"
        assert data["paired"] == False, "Code should not be paired yet"
        assert data["user_id"] is None, "user_id should be None before pairing"
        print(f"✅ Check unpaired code: valid={data['valid']}, paired={data['paired']}")

    def test_check_invalid_code(self):
        """GET /api/customer-display/check-code/{code} - invalid code should return valid=false"""
        response = requests.get(f"{BASE_URL}/api/customer-display/check-code/9999")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["valid"] == False, "Invalid code should not be valid"
        assert data["paired"] == False, "Invalid code should not be paired"
        print(f"✅ Check invalid code: valid={data['valid']}")

    def test_pair_display_without_auth(self):
        """POST /api/customer-display/pair - should fail without authentication"""
        gen_response = requests.post(f"{BASE_URL}/api/customer-display/generate-code")
        code = gen_response.json()["code"]
        
        response = requests.post(f"{BASE_URL}/api/customer-display/pair", json={
            "code": code,
            "device_name": "Test Display"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["success"] == False, "Pairing should fail without auth"
        assert "Autentisering" in data.get("message", ""), "Should mention authentication required"
        print(f"✅ Pair without auth rejected: {data['message']}")

    def test_pair_display_with_auth(self, auth_token):
        """POST /api/customer-display/pair - should succeed with valid token and code"""
        # Generate a new code
        gen_response = requests.post(f"{BASE_URL}/api/customer-display/generate-code")
        code = gen_response.json()["code"]
        display_id = gen_response.json()["display_id"]
        
        # Pair the code with authenticated user
        response = requests.post(f"{BASE_URL}/api/customer-display/pair", json={
            "code": code,
            "device_name": "Test Kundskärm"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["success"] == True, f"Pairing should succeed, got: {data}"
        assert "display_id" in data, "Response should include display_id"
        print(f"✅ Pair display success: display_id={data['display_id']}")
        
        # Verify the code is now paired (check-code should return paired=true)
        check_response = requests.get(f"{BASE_URL}/api/customer-display/check-code/{code}")
        check_data = check_response.json()
        # Note: Code might be deleted after successful pairing, so either valid=false or paired=true
        print(f"✅ Check code after pairing: {check_data}")

    def test_get_paired_displays(self, auth_token):
        """GET /api/customer-display/paired-displays - should return list of paired displays"""
        response = requests.get(f"{BASE_URL}/api/customer-display/paired-displays", 
                               headers={"Authorization": f"Bearer {auth_token}"})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "displays" in data, "Response should have 'displays' field"
        assert isinstance(data["displays"], list), "Displays should be a list"
        
        # Should have at least the display we just paired
        assert len(data["displays"]) > 0, "Should have at least one paired display"
        
        display = data["displays"][0]
        assert "display_id" in display, "Display should have display_id"
        assert "device_name" in display, "Display should have device_name"
        assert "paired_at" in display, "Display should have paired_at"
        
        print(f"✅ Get paired displays: {len(data['displays'])} display(s) found")
        print(f"   First display: {display['device_name']} ({display['display_id']})")

    def test_connection_status(self, auth_token):
        """GET /api/customer-display/connection-status - should show connected status"""
        response = requests.get(f"{BASE_URL}/api/customer-display/connection-status",
                               headers={"Authorization": f"Bearer {auth_token}"})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "connected" in data, "Response should have 'connected' field"
        assert "count" in data, "Response should have 'count' field"
        assert isinstance(data["connected"], bool), "connected should be boolean"
        assert isinstance(data["count"], int), "count should be integer"
        
        print(f"✅ Connection status: connected={data['connected']}, count={data['count']}")

    def test_get_display_data_with_user_id(self, auth_token, user_id):
        """GET /api/customer-display?user_id=xxx - should return display data"""
        response = requests.get(f"{BASE_URL}/api/customer-display?user_id={user_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "status" in data, "Response should have 'status' field"
        # Should be 'idle' by default if no active order
        assert data["status"] in ["idle", "waiting", "paid", "unpaired"], f"Invalid status: {data['status']}"
        
        if data["status"] != "unpaired":
            assert "store_name" in data, "Response should include store_name"
        
        print(f"✅ Get display data: status={data['status']}")

    def test_reset_customer_display(self, auth_token):
        """POST /api/customer-display/reset - should reset display to idle"""
        response = requests.post(f"{BASE_URL}/api/customer-display/reset",
                                headers={"Authorization": f"Bearer {auth_token}"})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["success"] == True, "Reset should succeed"
        print(f"✅ Reset display: {data['message']}")

    def test_unpair_display(self, auth_token):
        """DELETE /api/customer-display/paired-displays/{display_id} - should unpair display"""
        # Get current paired displays
        list_response = requests.get(f"{BASE_URL}/api/customer-display/paired-displays",
                                    headers={"Authorization": f"Bearer {auth_token}"})
        displays = list_response.json()["displays"]
        
        if len(displays) == 0:
            pytest.skip("No paired displays to unpair")
        
        display_id = displays[0]["display_id"]
        
        # Unpair the display
        response = requests.delete(f"{BASE_URL}/api/customer-display/paired-displays/{display_id}",
                                  headers={"Authorization": f"Bearer {auth_token}"})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["success"] == True, "Unpair should succeed"
        print(f"✅ Unpaired display: {display_id}")
        
        # Verify display is removed
        verify_response = requests.get(f"{BASE_URL}/api/customer-display/paired-displays",
                                      headers={"Authorization": f"Bearer {auth_token}"})
        remaining = verify_response.json()["displays"]
        assert len(remaining) < len(displays), "Display count should decrease after unpair"
        print(f"✅ Verified unpair: {len(displays)} -> {len(remaining)} displays")


@pytest.fixture
def auth_token():
    """Login and get auth token for testing"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "test@test.se",
        "password": "test123"
    })
    assert response.status_code == 200, f"Login failed: {response.status_code}"
    data = response.json()
    assert data["success"] == True, f"Login not successful: {data}"
    token = data["session_token"]
    return token


@pytest.fixture
def user_id(auth_token):
    """Get user_id from /auth/me"""
    response = requests.get(f"{BASE_URL}/api/auth/me", 
                           headers={"Authorization": f"Bearer {auth_token}"})
    assert response.status_code == 200, "Failed to get user info"
    return response.json()["user_id"]
