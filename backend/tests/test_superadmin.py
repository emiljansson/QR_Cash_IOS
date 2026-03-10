"""
Backend tests for Superadmin features
- Login/logout
- User management
- Statistics
- Settings
- Guest1 toggle
"""

import pytest
import requests
import os

# Read from frontend .env file
FRONTEND_ENV = {}
try:
    with open('/app/frontend/.env', 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                FRONTEND_ENV[key] = value.strip().strip('"').strip("'")
except:
    pass

BASE_URL = FRONTEND_ENV.get('EXPO_PUBLIC_BACKEND_URL', 'https://github-import-56.preview.emergentagent.com').rstrip('/')


class TestSuperadminAuth:
    """Superadmin authentication tests"""
    
    def test_login_success(self):
        """Test superadmin can login successfully"""
        response = requests.post(
            f"{BASE_URL}/api/superadmin/login",
            json={"email": "admin@test.com", "password": "admin123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "admin" in data
        assert data["admin"]["email"] == "admin@test.com"
        assert "session_token" in data
        print(f"✓ Superadmin login successful: {data['admin']['email']}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials fails"""
        response = requests.post(
            f"{BASE_URL}/api/superadmin/login",
            json={"email": "admin@test.com", "password": "wrongpass"}
        )
        assert response.status_code == 401
        print("✓ Invalid credentials rejected correctly")
    
    def test_get_me_authenticated(self):
        """Test GET /me returns admin info when authenticated"""
        # Login first
        login_resp = requests.post(
            f"{BASE_URL}/api/superadmin/login",
            json={"email": "admin@test.com", "password": "admin123"}
        )
        assert login_resp.status_code == 200
        session_token = login_resp.json()["session_token"]
        
        # Get /me
        response = requests.get(
            f"{BASE_URL}/api/superadmin/me",
            cookies={"admin_session_token": session_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert "admin_id" in data
        assert data["email"] == "admin@test.com"
        print(f"✓ GET /me returns admin: {data['email']}")
    
    def test_get_me_unauthenticated(self):
        """Test GET /me returns 401 without auth"""
        response = requests.get(f"{BASE_URL}/api/superadmin/me")
        assert response.status_code == 401
        print("✓ Unauthenticated request rejected")
    
    def test_logout(self):
        """Test logout clears session"""
        # Login first
        login_resp = requests.post(
            f"{BASE_URL}/api/superadmin/login",
            json={"email": "admin@test.com", "password": "admin123"}
        )
        session_token = login_resp.json()["session_token"]
        
        # Logout
        logout_resp = requests.post(
            f"{BASE_URL}/api/superadmin/logout",
            cookies={"admin_session_token": session_token}
        )
        assert logout_resp.status_code == 200
        
        # Try to access /me with old token
        me_resp = requests.get(
            f"{BASE_URL}/api/superadmin/me",
            cookies={"admin_session_token": session_token}
        )
        assert me_resp.status_code == 401
        print("✓ Logout clears session successfully")


class TestSuperadminStats:
    """Superadmin statistics tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login before each test"""
        login_resp = requests.post(
            f"{BASE_URL}/api/superadmin/login",
            json={"email": "admin@test.com", "password": "admin123"}
        )
        self.session_token = login_resp.json()["session_token"]
    
    def test_get_stats(self):
        """Test GET /stats returns system statistics"""
        response = requests.get(
            f"{BASE_URL}/api/superadmin/stats",
            cookies={"admin_session_token": self.session_token}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "total_users" in data
        assert "verified_users" in data
        assert "active_subscriptions" in data
        assert "total_orders" in data
        assert "total_products" in data
        assert "shared_images" in data
        
        # Verify data types
        assert isinstance(data["total_users"], int)
        assert isinstance(data["total_orders"], int)
        
        print(f"✓ Stats retrieved: {data['total_users']} users, {data['total_orders']} orders")
    
    def test_get_economic_overview(self):
        """Test GET /economic-overview returns financial data"""
        response = requests.get(
            f"{BASE_URL}/api/superadmin/economic-overview",
            cookies={"admin_session_token": self.session_token}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "users" in data
        assert "totals" in data
        assert isinstance(data["users"], list)
        
        # Verify totals structure
        totals = data["totals"]
        assert "total_revenue" in totals
        assert "total_orders" in totals
        assert "active_users" in totals
        
        print(f"✓ Economic overview: {totals['total_revenue']} kr revenue, {totals['active_users']} active users")


class TestSuperadminUsers:
    """Superadmin user management tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login before each test"""
        login_resp = requests.post(
            f"{BASE_URL}/api/superadmin/login",
            json={"email": "admin@test.com", "password": "admin123"}
        )
        self.session_token = login_resp.json()["session_token"]
    
    def test_list_users(self):
        """Test GET /users returns user list"""
        response = requests.get(
            f"{BASE_URL}/api/superadmin/users",
            cookies={"admin_session_token": self.session_token}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "users" in data
        assert "total" in data
        assert isinstance(data["users"], list)
        assert isinstance(data["total"], int)
        
        # Verify no sensitive data leaked
        if data["users"]:
            user = data["users"][0]
            assert "password_hash" not in user
            assert "verification_token" not in user
            assert "user_id" in user
            assert "email" in user
        
        print(f"✓ Users list retrieved: {data['total']} total users")
    
    def test_get_user_by_id(self):
        """Test GET /users/{user_id} returns specific user"""
        # First get a user from the list
        users_resp = requests.get(
            f"{BASE_URL}/api/superadmin/users",
            cookies={"admin_session_token": self.session_token}
        )
        users = users_resp.json()["users"]
        
        if not users:
            pytest.skip("No users available to test")
        
        user_id = users[0]["user_id"]
        
        # Get specific user
        response = requests.get(
            f"{BASE_URL}/api/superadmin/users/{user_id}",
            cookies={"admin_session_token": self.session_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == user_id
        print(f"✓ Retrieved user: {data.get('email')}")
    
    def test_update_subscription(self):
        """Test PUT /users/{user_id}/subscription updates subscription"""
        # Get a user
        users_resp = requests.get(
            f"{BASE_URL}/api/superadmin/users",
            cookies={"admin_session_token": self.session_token}
        )
        users = users_resp.json()["users"]
        
        if not users:
            pytest.skip("No users available to test")
        
        user_id = users[0]["user_id"]
        current_status = users[0].get("subscription_active", False)
        
        # Update subscription
        response = requests.put(
            f"{BASE_URL}/api/superadmin/users/{user_id}/subscription",
            cookies={"admin_session_token": self.session_token},
            json={
                "subscription_active": not current_status,
                "subscription_end": "2026-12-31T23:59:59Z"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        
        # Verify change persisted
        verify_resp = requests.get(
            f"{BASE_URL}/api/superadmin/users/{user_id}",
            cookies={"admin_session_token": self.session_token}
        )
        updated_user = verify_resp.json()
        assert updated_user["subscription_active"] == (not current_status)
        
        # Restore original state
        requests.put(
            f"{BASE_URL}/api/superadmin/users/{user_id}/subscription",
            cookies={"admin_session_token": self.session_token},
            json={"subscription_active": current_status}
        )
        
        print(f"✓ Subscription updated and verified for user {user_id}")
    
    def test_verify_user_email(self):
        """Test PUT /users/{user_id}/verify marks email as verified"""
        # Get a user
        users_resp = requests.get(
            f"{BASE_URL}/api/superadmin/users",
            cookies={"admin_session_token": self.session_token}
        )
        users = users_resp.json()["users"]
        
        if not users:
            pytest.skip("No users available to test")
        
        user_id = users[0]["user_id"]
        
        # Verify email
        response = requests.put(
            f"{BASE_URL}/api/superadmin/users/{user_id}/verify",
            cookies={"admin_session_token": self.session_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        
        # Verify change persisted
        verify_resp = requests.get(
            f"{BASE_URL}/api/superadmin/users/{user_id}",
            cookies={"admin_session_token": self.session_token}
        )
        updated_user = verify_resp.json()
        assert updated_user["email_verified"] is True
        
        print(f"✓ Email verified for user {user_id}")
    
    def test_reset_pin(self):
        """Test POST /users/{user_id}/reset-pin resets PIN to 1234"""
        # Get a user
        users_resp = requests.get(
            f"{BASE_URL}/api/superadmin/users",
            cookies={"admin_session_token": self.session_token}
        )
        users = users_resp.json()["users"]
        
        if not users:
            pytest.skip("No users available to test")
        
        user_id = users[0]["user_id"]
        
        # Reset PIN
        response = requests.post(
            f"{BASE_URL}/api/superadmin/users/{user_id}/reset-pin",
            cookies={"admin_session_token": self.session_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "1234" in data["message"]
        
        print(f"✓ PIN reset to 1234 for user {user_id}")


class TestSuperadminSettings:
    """Superadmin system settings tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login before each test"""
        login_resp = requests.post(
            f"{BASE_URL}/api/superadmin/login",
            json={"email": "admin@test.com", "password": "admin123"}
        )
        self.session_token = login_resp.json()["session_token"]
    
    def test_get_settings(self):
        """Test GET /settings returns system settings"""
        response = requests.get(
            f"{BASE_URL}/api/superadmin/settings",
            cookies={"admin_session_token": self.session_token}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "id" in data
        assert data["id"] == "system_settings"
        assert "grace_period_days" in data
        assert "app_name" in data
        
        print(f"✓ Settings retrieved: app_name={data.get('app_name')}, grace_period={data.get('grace_period_days')}")
    
    def test_update_settings(self):
        """Test PUT /settings updates system settings"""
        # Get current settings
        current_resp = requests.get(
            f"{BASE_URL}/api/superadmin/settings",
            cookies={"admin_session_token": self.session_token}
        )
        current_settings = current_resp.json()
        original_app_name = current_settings.get("app_name")
        
        # Update settings
        test_app_name = "TEST_QR-Kassan"
        response = requests.put(
            f"{BASE_URL}/api/superadmin/settings",
            cookies={"admin_session_token": self.session_token},
            json={
                "app_name": test_app_name,
                "grace_period_days": 10,
                "contact_email": "test@example.com"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["app_name"] == test_app_name
        assert data["grace_period_days"] == 10
        assert data["contact_email"] == "test@example.com"
        
        # Verify persistence
        verify_resp = requests.get(
            f"{BASE_URL}/api/superadmin/settings",
            cookies={"admin_session_token": self.session_token}
        )
        verify_data = verify_resp.json()
        assert verify_data["app_name"] == test_app_name
        
        # Restore original
        requests.put(
            f"{BASE_URL}/api/superadmin/settings",
            cookies={"admin_session_token": self.session_token},
            json={"app_name": original_app_name or "Kassasystem"}
        )
        
        print(f"✓ Settings updated and verified")


class TestSuperadminGuest1:
    """Guest1 test account management tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login before each test"""
        login_resp = requests.post(
            f"{BASE_URL}/api/superadmin/login",
            json={"email": "admin@test.com", "password": "admin123"}
        )
        self.session_token = login_resp.json()["session_token"]
    
    def test_get_guest1_status(self):
        """Test GET /guest1-status returns status"""
        response = requests.get(
            f"{BASE_URL}/api/superadmin/guest1-status",
            cookies={"admin_session_token": self.session_token}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "exists" in data
        assert "enabled" in data
        
        print(f"✓ Guest1 status: exists={data['exists']}, enabled={data['enabled']}")
    
    def test_toggle_guest1(self):
        """Test POST /toggle-guest1 creates/toggles Guest1 account"""
        # Get current status
        status_resp = requests.get(
            f"{BASE_URL}/api/superadmin/guest1-status",
            cookies={"admin_session_token": self.session_token}
        )
        current_status = status_resp.json()
        
        # Toggle
        response = requests.post(
            f"{BASE_URL}/api/superadmin/toggle-guest1",
            cookies={"admin_session_token": self.session_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["exists"] is True
        assert "enabled" in data
        
        # Verify change persisted
        verify_resp = requests.get(
            f"{BASE_URL}/api/superadmin/guest1-status",
            cookies={"admin_session_token": self.session_token}
        )
        verify_data = verify_resp.json()
        
        if current_status["exists"]:
            # Should have toggled
            assert verify_data["enabled"] != current_status["enabled"]
        else:
            # Should have been created as enabled
            assert verify_data["enabled"] is True
        
        print(f"✓ Guest1 toggled: exists={data['exists']}, enabled={data['enabled']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
