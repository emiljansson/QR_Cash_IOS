"""
Backend tests for new features:
- Parked Carts (parkerade varukorgar)
- Email Receipts (e-postkvitton)
"""
import pytest
import requests


@pytest.fixture
def auth_token(api_client, base_url):
    """Get authentication token"""
    response = api_client.post(f"{base_url}/api/auth/login", json={
        "email": "test@test.se",
        "password": "test123"
    })
    assert response.status_code == 200
    data = response.json()
    return data["session_token"]


@pytest.fixture
def auth_headers(auth_token):
    """Headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestParkedCarts:
    """Parked Carts (Parkerade varukorgar) endpoint tests"""

    def test_get_parked_carts_requires_auth(self, api_client, base_url):
        """GET /api/parked-carts requires authentication"""
        response = api_client.get(f"{base_url}/api/parked-carts")
        assert response.status_code == 401

    def test_get_parked_carts_success(self, api_client, base_url, auth_headers):
        """GET /api/parked-carts returns list of parked carts"""
        response = api_client.get(f"{base_url}/api/parked-carts", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/parked-carts returned {len(data)} carts")

    def test_create_parked_cart(self, api_client, base_url, auth_headers):
        """POST /api/parked-carts creates a parked cart"""
        cart_data = {
            "name": "TEST_Bord 5",
            "items": [
                {"product_id": "test_123", "name": "Kaffe", "price": 30.0, "quantity": 2},
                {"product_id": "test_456", "name": "Kanelbulle", "price": 25.0, "quantity": 1}
            ],
            "total": 85.0
        }
        response = api_client.post(f"{base_url}/api/parked-carts", json=cart_data, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["name"] == "TEST_Bord 5"
        assert len(data["items"]) == 2
        assert data["total"] == 85.0
        print(f"✓ Created parked cart: {data['name']}")
        
        # Verify persistence by GET
        get_response = api_client.get(f"{base_url}/api/parked-carts", headers=auth_headers)
        assert get_response.status_code == 200
        carts = get_response.json()
        created_cart = next((c for c in carts if c["name"] == "TEST_Bord 5"), None)
        assert created_cart is not None
        print(f"✓ Parked cart persisted successfully")
        
        return data["id"]

    def test_delete_parked_cart(self, api_client, base_url, auth_headers):
        """DELETE /api/parked-carts/{id} deletes a parked cart"""
        # First create a cart
        cart_data = {
            "name": "TEST_Delete_Me",
            "items": [{"product_id": "test_789", "name": "Vatten", "price": 15.0, "quantity": 1}],
            "total": 15.0
        }
        create_response = api_client.post(f"{base_url}/api/parked-carts", json=cart_data, headers=auth_headers)
        assert create_response.status_code == 200
        cart_id = create_response.json()["id"]
        
        # Delete the cart
        delete_response = api_client.delete(f"{base_url}/api/parked-carts/{cart_id}", headers=auth_headers)
        assert delete_response.status_code == 200
        assert delete_response.json()["success"] is True
        print(f"✓ Deleted parked cart {cart_id}")
        
        # Verify deletion
        get_response = api_client.get(f"{base_url}/api/parked-carts", headers=auth_headers)
        carts = get_response.json()
        deleted_cart = next((c for c in carts if c["id"] == cart_id), None)
        assert deleted_cart is None
        print(f"✓ Cart no longer exists after deletion")

    def test_send_parked_cart_to_display(self, api_client, base_url, auth_headers):
        """POST /api/parked-carts/{id}/send-to-display sends cart to customer display"""
        # Create a parked cart
        cart_data = {
            "name": "TEST_Send_To_Display",
            "items": [{"product_id": "test_111", "name": "Latte", "price": 45.0, "quantity": 1}],
            "total": 45.0
        }
        create_response = api_client.post(f"{base_url}/api/parked-carts", json=cart_data, headers=auth_headers)
        assert create_response.status_code == 200
        cart_id = create_response.json()["id"]
        
        # Send to display
        send_response = api_client.post(f"{base_url}/api/parked-carts/{cart_id}/send-to-display", headers=auth_headers)
        assert send_response.status_code == 200
        data = send_response.json()
        assert data["success"] is True
        assert "order_id" in data
        print(f"✓ Sent parked cart to display, created order: {data['order_id']}")
        
        # Verify cart was deleted after sending
        get_response = api_client.get(f"{base_url}/api/parked-carts", headers=auth_headers)
        carts = get_response.json()
        sent_cart = next((c for c in carts if c["id"] == cart_id), None)
        assert sent_cart is None
        print(f"✓ Parked cart deleted after sending to display")


class TestEmailReceipts:
    """Email Receipts (E-postkvitton) endpoint tests"""

    def test_send_receipt_requires_auth(self, api_client, base_url):
        """POST /api/receipts/send requires authentication"""
        response = api_client.post(f"{base_url}/api/receipts/send", json={
            "order_id": "test_order",
            "recipient_email": "test@example.com"
        })
        assert response.status_code == 401

    def test_send_receipt_no_api_key(self, api_client, base_url, auth_headers):
        """POST /api/receipts/send returns 503 when Resend API key not configured"""
        # First create an order to get a valid order_id
        order_data = {
            "items": [{"product_id": "test_prod", "name": "Test Product", "price": 50.0, "quantity": 1}],
            "total": 50.0,
            "swish_phone": "1234567890"
        }
        order_response = api_client.post(f"{base_url}/api/orders", json=order_data, headers=auth_headers)
        assert order_response.status_code == 200
        order_id = order_response.json()["id"]
        
        # Try to send receipt (should fail with 503 - no API key configured)
        receipt_data = {
            "order_id": order_id,
            "recipient_email": "customer@example.com"
        }
        response = api_client.post(f"{base_url}/api/receipts/send", json=receipt_data, headers=auth_headers)
        
        # EXPECTED: 503 Service Unavailable (no Resend API key)
        assert response.status_code == 503
        error = response.json()
        assert "e-posttjänsten är inte konfigurerad" in error["detail"].lower() or "resend api" in error["detail"].lower()
        print(f"✓ Email receipt correctly returns 503 when API key not configured")
        print(f"  Error message: {error['detail']}")

    def test_send_receipt_invalid_order(self, api_client, base_url, auth_headers):
        """POST /api/receipts/send returns 404 for non-existent order"""
        receipt_data = {
            "order_id": "nonexistent_order_12345",
            "recipient_email": "test@example.com"
        }
        response = api_client.post(f"{base_url}/api/receipts/send", json=receipt_data, headers=auth_headers)
        
        # Should return 404 or 503 (503 if API key check happens first)
        assert response.status_code in [404, 503]
        print(f"✓ Invalid order handled correctly: {response.status_code}")


class TestSubscriptionData:
    """Subscription data is returned in user profile"""

    def test_user_has_subscription_fields(self, api_client, base_url, auth_headers):
        """GET /api/auth/me returns user with subscription fields"""
        response = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        assert response.status_code == 200
        user = response.json()
        
        # Check subscription fields are present
        assert "subscription_active" in user
        assert "subscription_start" in user
        assert "subscription_end" in user
        
        print(f"✓ User has subscription fields:")
        print(f"  - subscription_active: {user.get('subscription_active')}")
        print(f"  - subscription_start: {user.get('subscription_start')}")
        print(f"  - subscription_end: {user.get('subscription_end')}")
        
        # For test user, subscription should be active
        assert user["subscription_active"] is True
        print(f"✓ Test user subscription is active")
