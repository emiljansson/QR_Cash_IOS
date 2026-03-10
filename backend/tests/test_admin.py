import pytest

class TestAdmin:
    """Admin endpoint tests"""

    def test_verify_pin_success(self, authenticated_client, base_url):
        """Test PIN verification with correct PIN"""
        response = authenticated_client.post(
            f"{base_url}/api/admin/verify-pin",
            json={"pin": "1234"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "verified" in data or "message" in data

    def test_verify_pin_failure(self, authenticated_client, base_url):
        """Test PIN verification with wrong PIN"""
        response = authenticated_client.post(
            f"{base_url}/api/admin/verify-pin",
            json={"pin": "9999"}
        )
        assert response.status_code in [400, 401, 403]

    def test_get_settings(self, authenticated_client, base_url):
        """Test getting admin settings"""
        response = authenticated_client.get(f"{base_url}/api/admin/settings")
        assert response.status_code == 200
        
        data = response.json()
        # Settings should be a dictionary
        assert isinstance(data, dict)

    def test_get_admin_stats(self, authenticated_client, base_url):
        """Test getting admin statistics"""
        response = authenticated_client.get(f"{base_url}/api/admin/stats")
        assert response.status_code == 200
        
        data = response.json()
        assert "total_orders" in data
        assert "total_products" in data
        assert isinstance(data["total_orders"], int)
        assert isinstance(data["total_products"], int)

    def test_update_settings(self, authenticated_client, base_url):
        """Test updating admin settings"""
        new_settings = {
            "store_name": "TEST_Store"
        }
        
        response = authenticated_client.put(
            f"{base_url}/api/admin/settings",
            json=new_settings
        )
        assert response.status_code == 200
        
        # Verify settings were updated
        get_response = authenticated_client.get(f"{base_url}/api/admin/settings")
        assert get_response.status_code == 200
        settings = get_response.json()
        assert settings.get("store_name") == new_settings["store_name"]
