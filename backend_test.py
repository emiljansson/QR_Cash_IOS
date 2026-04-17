#!/usr/bin/env python3
"""
Comprehensive Backend Test Suite for Commhub.cloud Integration
Tests auth flow, products CRUD, orders CRUD, and parked carts functionality.
"""

import asyncio
import httpx
import json
import sys
from datetime import datetime
from typing import Dict, Any, Optional

# Backend URL from frontend environment
BACKEND_URL = "https://github-import-56.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        self.session_token: Optional[str] = None
        self.test_user_email = "backendtest@test.com"
        self.test_user_password = "test123"
        self.test_user_name = "Backend Test"
        self.test_org_name = "Test Org"
        self.test_phone = "0701234567"
        self.created_product_id: Optional[str] = None
        self.created_order_id: Optional[str] = None
        self.created_cart_id: Optional[str] = None
        
    async def close(self):
        await self.client.aclose()
    
    def log(self, message: str, level: str = "INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")
    
    def log_error(self, message: str):
        self.log(message, "ERROR")
    
    def log_success(self, message: str):
        self.log(message, "SUCCESS")
    
    async def make_request(self, method: str, endpoint: str, data: Dict[Any, Any] = None, 
                          headers: Dict[str, str] = None, expect_status: int = 200) -> Dict[Any, Any]:
        """Make HTTP request with error handling"""
        url = f"{BACKEND_URL}{endpoint}"
        
        # Add session token to headers if available
        if self.session_token and headers is None:
            headers = {}
        if self.session_token:
            headers = headers or {}
            headers["Authorization"] = f"Bearer {self.session_token}"
        
        try:
            if method.upper() == "GET":
                response = await self.client.get(url, headers=headers)
            elif method.upper() == "POST":
                response = await self.client.post(url, json=data, headers=headers)
            elif method.upper() == "PUT":
                response = await self.client.put(url, json=data, headers=headers)
            elif method.upper() == "DELETE":
                response = await self.client.delete(url, headers=headers)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            self.log(f"{method} {endpoint} -> {response.status_code}")
            
            if response.status_code != expect_status:
                self.log_error(f"Expected {expect_status}, got {response.status_code}")
                self.log_error(f"Response: {response.text}")
                return {"error": f"HTTP {response.status_code}", "response": response.text}
            
            try:
                return response.json()
            except:
                return {"success": True, "response": response.text}
                
        except Exception as e:
            self.log_error(f"Request failed: {str(e)}")
            return {"error": str(e)}
    
    async def test_health_check(self) -> bool:
        """Test basic API health"""
        self.log("Testing API health check...")
        result = await self.make_request("GET", "/")
        
        if "error" in result:
            self.log_error("Health check failed")
            return False
        
        if result.get("status") == "running":
            self.log_success("API is running")
            return True
        else:
            self.log_error(f"Unexpected health response: {result}")
            return False
    
    async def test_user_registration(self) -> bool:
        """Test user registration"""
        self.log("Testing user registration...")
        
        data = {
            "email": self.test_user_email,
            "password": self.test_user_password,
            "name": self.test_user_name,
            "organization_name": self.test_org_name,
            "phone": self.test_phone
        }
        
        result = await self.make_request("POST", "/auth/register", data)
        
        if "error" in result:
            # Check if user already exists
            if "redan registrerad" in result.get("response", ""):
                self.log("User already exists, continuing with login test")
                return True
            self.log_error("Registration failed")
            return False
        
        if result.get("success"):
            self.log_success("User registration successful")
            return True
        else:
            self.log_error(f"Registration failed: {result}")
            return False
    
    async def manually_verify_user(self) -> bool:
        """Manually verify user by updating database directly"""
        self.log("Manually verifying user email...")
        
        # We need to use a Python script to update the database
        # Since we're using Commhub, we'll create a simple script
        script_content = f'''
import asyncio
import os
import sys
sys.path.append('/app/backend')

from utils.database import get_db

async def verify_user():
    db = get_db()
    result = await db.users.update_one(
        {{"email": "{self.test_user_email}"}},
        {{"$set": {{"email_verified": True}}}}
    )
    print(f"Updated {{result.modified_count}} user(s)")

if __name__ == "__main__":
    asyncio.run(verify_user())
'''
        
        # Write and execute the script
        with open("/tmp/verify_user.py", "w") as f:
            f.write(script_content)
        
        import subprocess
        try:
            result = subprocess.run([
                sys.executable, "/tmp/verify_user.py"
            ], capture_output=True, text=True, cwd="/app/backend")
            
            if result.returncode == 0:
                self.log_success("User email verified manually")
                return True
            else:
                self.log_error(f"Manual verification failed: {result.stderr}")
                return False
        except Exception as e:
            self.log_error(f"Manual verification error: {e}")
            return False
    
    async def test_user_login(self) -> bool:
        """Test user login"""
        self.log("Testing user login...")
        
        data = {
            "email": self.test_user_email,
            "password": self.test_user_password
        }
        
        result = await self.make_request("POST", "/auth/login", data)
        
        if "error" in result:
            self.log_error("Login failed")
            return False
        
        if result.get("success") and result.get("session_token"):
            self.session_token = result["session_token"]
            self.log_success("Login successful, session token obtained")
            return True
        else:
            self.log_error(f"Login failed: {result}")
            return False
    
    async def test_auth_me(self) -> bool:
        """Test getting current user info"""
        self.log("Testing /auth/me endpoint...")
        
        if not self.session_token:
            self.log_error("No session token available")
            return False
        
        result = await self.make_request("GET", "/auth/me")
        
        if "error" in result:
            self.log_error("Auth me failed")
            return False
        
        if result.get("email") == self.test_user_email:
            self.log_success("Auth me successful")
            return True
        else:
            self.log_error(f"Auth me failed: {result}")
            return False
    
    async def test_products_crud(self) -> bool:
        """Test Products CRUD operations"""
        self.log("Testing Products CRUD...")
        
        if not self.session_token:
            self.log_error("No session token for products test")
            return False
        
        # Test GET products (should be empty initially)
        self.log("Testing GET /products...")
        result = await self.make_request("GET", "/products")
        
        if "error" in result:
            self.log_error("GET products failed")
            return False
        
        if isinstance(result, list):
            self.log_success(f"GET products successful, found {len(result)} products")
        else:
            self.log_error(f"GET products unexpected response: {result}")
            return False
        
        # Test POST product
        self.log("Testing POST /products...")
        product_data = {
            "name": "Test Product",
            "price": 99.0,
            "category": "Test"
        }
        
        result = await self.make_request("POST", "/products", product_data, expect_status=200)
        
        if "error" in result:
            self.log_error("POST product failed")
            return False
        
        if result.get("id"):
            self.created_product_id = result["id"]
            self.log_success(f"POST product successful, ID: {self.created_product_id}")
        else:
            self.log_error(f"POST product failed: {result}")
            return False
        
        # Test PUT product
        self.log("Testing PUT /products...")
        update_data = {
            "name": "Updated Product",
            "price": 150.0
        }
        
        result = await self.make_request("PUT", f"/products/{self.created_product_id}", update_data)
        
        if "error" in result:
            self.log_error("PUT product failed")
            return False
        
        if result.get("name") == "Updated Product" and result.get("price") == 150.0:
            self.log_success("PUT product successful")
        else:
            self.log_error(f"PUT product failed: {result}")
            return False
        
        # Test DELETE product
        self.log("Testing DELETE /products...")
        result = await self.make_request("DELETE", f"/products/{self.created_product_id}")
        
        if "error" in result:
            self.log_error("DELETE product failed")
            return False
        
        if result.get("success"):
            self.log_success("DELETE product successful")
            return True
        else:
            self.log_error(f"DELETE product failed: {result}")
            return False
    
    async def test_orders_crud(self) -> bool:
        """Test Orders CRUD operations"""
        self.log("Testing Orders CRUD...")
        
        if not self.session_token:
            self.log_error("No session token for orders test")
            return False
        
        # Test GET orders (should be empty initially)
        self.log("Testing GET /orders...")
        result = await self.make_request("GET", "/orders")
        
        if "error" in result:
            self.log_error("GET orders failed")
            return False
        
        if isinstance(result, list):
            self.log_success(f"GET orders successful, found {len(result)} orders")
        else:
            self.log_error(f"GET orders unexpected response: {result}")
            return False
        
        # Test POST order
        self.log("Testing POST /orders...")
        order_data = {
            "items": [
                {
                    "product_id": "test",
                    "name": "Test",
                    "quantity": 1,
                    "price": 50.0
                }
            ],
            "total": 50.0,
            "swish_phone": "0701234567"
        }
        
        result = await self.make_request("POST", "/orders", order_data, expect_status=200)
        
        if "error" in result:
            self.log_error("POST order failed")
            return False
        
        if result.get("id"):
            self.created_order_id = result["id"]
            self.log_success(f"POST order successful, ID: {self.created_order_id}")
            return True
        else:
            self.log_error(f"POST order failed: {result}")
            return False
    
    async def test_parked_carts_crud(self) -> bool:
        """Test Parked Carts CRUD operations"""
        self.log("Testing Parked Carts CRUD...")
        
        if not self.session_token:
            self.log_error("No session token for parked carts test")
            return False
        
        # Test GET parked carts
        self.log("Testing GET /parked-carts...")
        result = await self.make_request("GET", "/parked-carts")
        
        if "error" in result:
            self.log_error("GET parked carts failed")
            return False
        
        if isinstance(result, list):
            self.log_success(f"GET parked carts successful, found {len(result)} carts")
        else:
            self.log_error(f"GET parked carts unexpected response: {result}")
            return False
        
        # Test POST parked cart
        self.log("Testing POST /parked-carts...")
        cart_data = {
            "items": [
                {
                    "product_id": "test",
                    "name": "Test",
                    "quantity": 1,
                    "price": 10.0
                }
            ],
            "name": "Test Cart",
            "total": 10.0
        }
        
        result = await self.make_request("POST", "/parked-carts", cart_data, expect_status=200)
        
        if "error" in result:
            self.log_error("POST parked cart failed")
            return False
        
        if result.get("id"):
            self.created_cart_id = result["id"]
            self.log_success(f"POST parked cart successful, ID: {self.created_cart_id}")
            return True
        else:
            self.log_error(f"POST parked cart failed: {result}")
            return False
    
    async def check_backend_logs(self):
        """Check backend logs for any errors"""
        self.log("Checking backend logs...")
        try:
            import subprocess
            result = subprocess.run([
                "tail", "-n", "50", "/var/log/supervisor/backend.err.log"
            ], capture_output=True, text=True)
            
            if result.returncode == 0 and result.stdout.strip():
                self.log("Recent backend error logs:")
                print(result.stdout)
            else:
                self.log("No recent backend errors found")
        except Exception as e:
            self.log_error(f"Could not check logs: {e}")
    
    async def run_all_tests(self) -> bool:
        """Run all tests in sequence"""
        self.log("Starting comprehensive backend test suite...")
        self.log(f"Testing against: {BACKEND_URL}")
        
        tests = [
            ("Health Check", self.test_health_check),
            ("User Registration", self.test_user_registration),
            ("Manual User Verification", self.manually_verify_user),
            ("User Login", self.test_user_login),
            ("Auth Me", self.test_auth_me),
            ("Products CRUD", self.test_products_crud),
            ("Orders CRUD", self.test_orders_crud),
            ("Parked Carts CRUD", self.test_parked_carts_crud),
        ]
        
        passed = 0
        failed = 0
        
        for test_name, test_func in tests:
            self.log(f"\n{'='*50}")
            self.log(f"Running: {test_name}")
            self.log(f"{'='*50}")
            
            try:
                success = await test_func()
                if success:
                    passed += 1
                    self.log_success(f"✅ {test_name} PASSED")
                else:
                    failed += 1
                    self.log_error(f"❌ {test_name} FAILED")
            except Exception as e:
                failed += 1
                self.log_error(f"❌ {test_name} FAILED with exception: {e}")
        
        self.log(f"\n{'='*50}")
        self.log(f"TEST SUMMARY")
        self.log(f"{'='*50}")
        self.log(f"Total tests: {passed + failed}")
        self.log(f"Passed: {passed}")
        self.log(f"Failed: {failed}")
        
        if failed > 0:
            self.log_error("Some tests failed. Checking backend logs...")
            await self.check_backend_logs()
        
        return failed == 0


async def main():
    """Main test runner"""
    tester = BackendTester()
    
    try:
        success = await tester.run_all_tests()
        return 0 if success else 1
    finally:
        await tester.close()


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)