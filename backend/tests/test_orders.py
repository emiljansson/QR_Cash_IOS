import pytest

class TestOrders:
    """Order management tests"""

    def test_get_orders(self, authenticated_client, base_url):
        """Test getting orders list"""
        response = authenticated_client.get(f"{base_url}/api/orders?limit=50")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)

    def test_create_order(self, authenticated_client, base_url):
        """Test creating a new order"""
        # First, get products to use in order
        products_response = authenticated_client.get(f"{base_url}/api/products?active_only=true")
        assert products_response.status_code == 200
        products = products_response.json()
        
        if len(products) == 0:
            pytest.skip("No products available for order creation")
        
        product = products[0]
        
        new_order = {
            "items": [
                {
                    "product_id": product["id"],
                    "name": product["name"],
                    "price": product["price"],
                    "quantity": 2
                }
            ],
            "total": product["price"] * 2,
            "swish_phone": "0701234567"
        }
        
        response = authenticated_client.post(
            f"{base_url}/api/orders",
            json=new_order
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "id" in data
        assert data["total"] == new_order["total"]
        assert data["status"] in ["pending", "paid"]
        
        # Verify order was created by fetching it
        order_id = data["id"]
        get_response = authenticated_client.get(f"{base_url}/api/orders?limit=50")
        assert get_response.status_code == 200
        orders = get_response.json()
        assert any(o["id"] == order_id for o in orders)

    def test_confirm_order(self, authenticated_client, base_url):
        """Test confirming an order (mark as paid)"""
        # First create an order
        products_response = authenticated_client.get(f"{base_url}/api/products?active_only=true")
        products = products_response.json()
        
        if len(products) == 0:
            pytest.skip("No products available")
        
        product = products[0]
        new_order = {
            "items": [{"product_id": product["id"], "name": product["name"], "price": product["price"], "quantity": 1}],
            "total": product["price"],
            "swish_phone": "0701234567"
        }
        
        create_response = authenticated_client.post(f"{base_url}/api/orders", json=new_order)
        assert create_response.status_code == 200
        order = create_response.json()
        
        # Confirm the order
        confirm_response = authenticated_client.post(f"{base_url}/api/orders/{order['id']}/confirm")
        assert confirm_response.status_code == 200
        
        confirmed = confirm_response.json()
        assert confirmed["status"] == "paid"

    def test_get_daily_stats(self, authenticated_client, base_url):
        """Test getting daily statistics"""
        response = authenticated_client.get(f"{base_url}/api/orders/daily-stats?period=day")
        assert response.status_code == 200
        
        data = response.json()
        assert "totalSales" in data
        assert "orderCount" in data
        assert isinstance(data["totalSales"], (int, float))
        assert isinstance(data["orderCount"], int)
