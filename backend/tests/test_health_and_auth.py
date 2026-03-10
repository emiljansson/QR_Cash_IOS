import pytest
import requests

class TestHealthAndAuth:
    """Health check and authentication endpoint tests"""

    def test_health_check(self, api_client, base_url):
        """Test API health endpoint"""
        response = api_client.get(f"{base_url}/api/")
        assert response.status_code == 200
        
        data = response.json()
        assert "status" in data
        assert data["status"] == "running"
        assert "version" in data

    def test_login_success(self, api_client, base_url, test_user):
        """Test login with valid credentials"""
        response = api_client.post(
            f"{base_url}/api/auth/login",
            json=test_user
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "session_token" in data
        assert "user" in data
        assert data["user"]["email"] == test_user["email"]

    def test_login_invalid_credentials(self, api_client, base_url):
        """Test login with invalid credentials"""
        response = api_client.post(
            f"{base_url}/api/auth/login",
            json={"email": "invalid@test.se", "password": "wrongpass"}
        )
        assert response.status_code in [400, 401]

    def test_get_me_authenticated(self, authenticated_client, base_url):
        """Test getting current user info with valid token"""
        response = authenticated_client.get(f"{base_url}/api/auth/me")
        assert response.status_code == 200
        
        data = response.json()
        assert "email" in data
        assert "user_id" in data

    def test_get_me_unauthenticated(self, api_client, base_url):
        """Test getting current user info without token"""
        response = api_client.get(f"{base_url}/api/auth/me")
        assert response.status_code in [401, 403]
