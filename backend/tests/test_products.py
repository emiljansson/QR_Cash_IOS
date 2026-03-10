import pytest

class TestProducts:
    """Product CRUD tests"""

    def test_get_products_authenticated(self, authenticated_client, base_url):
        """Test getting products list"""
        response = authenticated_client.get(f"{base_url}/api/products")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        # Check that demo products exist (6 demo products seeded)
        assert len(data) >= 6
        
        # Verify product structure
        if len(data) > 0:
            product = data[0]
            assert "id" in product
            assert "name" in product
            assert "price" in product

    def test_get_products_active_only(self, authenticated_client, base_url):
        """Test getting only active products"""
        response = authenticated_client.get(f"{base_url}/api/products?active_only=true")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        # All returned products should be active
        for product in data:
            assert product.get("active", True) == True

    def test_create_product(self, authenticated_client, base_url):
        """Test creating a new product"""
        new_product = {
            "name": "TEST_Ny Produkt",
            "price": 50,
            "category": "Test"
        }
        
        response = authenticated_client.post(
            f"{base_url}/api/products",
            json=new_product
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["name"] == new_product["name"]
        assert data["price"] == new_product["price"]
        assert "id" in data
        
        # Verify product was actually created by fetching it
        product_id = data["id"]
        get_response = authenticated_client.get(f"{base_url}/api/products")
        assert get_response.status_code == 200
        products = get_response.json()
        assert any(p["id"] == product_id for p in products)

    def test_create_product_missing_fields(self, authenticated_client, base_url):
        """Test creating product with missing required fields"""
        invalid_product = {"name": "Missing Price"}
        
        response = authenticated_client.post(
            f"{base_url}/api/products",
            json=invalid_product
        )
        assert response.status_code in [400, 422]
