#!/usr/bin/env python3
"""
CommHub File Storage Integration Test
Tests the new file upload endpoints and product image upload functionality
"""

import asyncio
import httpx
import base64
import json
import os
from pathlib import Path

# Test configuration
BACKEND_URL = "https://github-import-56.preview.emergentagent.com/api"
TEST_USER_EMAIL = "testuser2@test.com"
TEST_USER_PASSWORD = "test123"

# Test image data (1x1 pixel PNG)
TEST_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

class CommHubFileStorageTest:
    def __init__(self):
        self.session_token = None
        self.client = httpx.AsyncClient(timeout=30.0)
        self.test_results = []
        
    async def log_result(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = f"{status}: {test_name}"
        if details:
            result += f" - {details}"
        print(result)
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
    
    async def test_1_health_check(self):
        """Test API health check"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/")
            if response.status_code == 200:
                data = response.json()
                await self.log_result("API Health Check", True, f"Status: {data.get('status')}, Version: {data.get('version')}")
                return True
            else:
                await self.log_result("API Health Check", False, f"Status code: {response.status_code}")
                return False
        except Exception as e:
            await self.log_result("API Health Check", False, f"Error: {str(e)}")
            return False
    
    async def test_2_user_login(self):
        """Test user authentication"""
        try:
            login_data = {
                "email": TEST_USER_EMAIL,
                "password": TEST_USER_PASSWORD
            }
            response = await self.client.post(f"{BACKEND_URL}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                self.session_token = data.get("session_token")
                if self.session_token:
                    await self.log_result("User Login", True, f"Session token obtained")
                    return True
                else:
                    await self.log_result("User Login", False, "No session token in response")
                    return False
            else:
                await self.log_result("User Login", False, f"Status code: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            await self.log_result("User Login", False, f"Error: {str(e)}")
            return False
    
    async def test_3_auth_me_endpoint(self):
        """Test authenticated user info endpoint"""
        if not self.session_token:
            await self.log_result("Auth Me Endpoint", False, "No session token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            response = await self.client.get(f"{BACKEND_URL}/auth/me", headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                user_id = data.get("user_id")
                email = data.get("email")
                await self.log_result("Auth Me Endpoint", True, f"User ID: {user_id}, Email: {email}")
                return True
            else:
                await self.log_result("Auth Me Endpoint", False, f"Status code: {response.status_code}")
                return False
        except Exception as e:
            await self.log_result("Auth Me Endpoint", False, f"Error: {str(e)}")
            return False
    
    async def test_4_file_upload_base64(self):
        """Test base64 file upload endpoint"""
        if not self.session_token:
            await self.log_result("File Upload Base64", False, "No session token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            upload_data = {
                "image": f"data:image/png;base64,{TEST_IMAGE_BASE64}",
                "folder": "test"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/files/upload-base64",
                headers=headers,
                json=upload_data
            )
            
            if response.status_code == 200:
                data = response.json()
                success = data.get("success")
                url = data.get("url")
                file_id = data.get("file_id")
                
                if success and url:
                    # Check if URL is CloudFront URL
                    is_cloudfront = "cloudfront.net" in url or "commhub" in url
                    await self.log_result("File Upload Base64", True, f"URL: {url}, CloudFront: {is_cloudfront}, File ID: {file_id}")
                    return True
                else:
                    await self.log_result("File Upload Base64", False, f"Invalid response: {data}")
                    return False
            else:
                await self.log_result("File Upload Base64", False, f"Status code: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            await self.log_result("File Upload Base64", False, f"Error: {str(e)}")
            return False
    
    async def test_5_file_upload_multipart(self):
        """Test multipart file upload endpoint"""
        if not self.session_token:
            await self.log_result("File Upload Multipart", False, "No session token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            
            # Create test image file
            image_data = base64.b64decode(TEST_IMAGE_BASE64)
            files = {
                "file": ("test.png", image_data, "image/png")
            }
            data = {
                "folder": "test"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/files/upload",
                headers=headers,
                files=files,
                data=data
            )
            
            if response.status_code == 200:
                data = response.json()
                success = data.get("success")
                url = data.get("url")
                file_id = data.get("file_id")
                
                if success and url:
                    # Check if URL is CloudFront URL
                    is_cloudfront = "cloudfront.net" in url or "commhub" in url
                    await self.log_result("File Upload Multipart", True, f"URL: {url}, CloudFront: {is_cloudfront}, File ID: {file_id}")
                    return True
                else:
                    await self.log_result("File Upload Multipart", False, f"Invalid response: {data}")
                    return False
            else:
                await self.log_result("File Upload Multipart", False, f"Status code: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            await self.log_result("File Upload Multipart", False, f"Error: {str(e)}")
            return False
    
    async def test_6_create_product(self):
        """Test creating a product for image upload testing"""
        if not self.session_token:
            await self.log_result("Create Product", False, "No session token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            product_data = {
                "name": "CommHub Image Test Product",
                "price": 10.0,
                "category": "Test"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/products",
                headers=headers,
                json=product_data
            )
            
            if response.status_code == 200:
                data = response.json()
                product_id = data.get("id")
                name = data.get("name")
                
                if product_id:
                    self.test_product_id = product_id
                    await self.log_result("Create Product", True, f"Product ID: {product_id}, Name: {name}")
                    return True
                else:
                    await self.log_result("Create Product", False, f"No product ID in response: {data}")
                    return False
            else:
                await self.log_result("Create Product", False, f"Status code: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            await self.log_result("Create Product", False, f"Error: {str(e)}")
            return False
    
    async def test_7_product_image_upload(self):
        """Test product image upload endpoint"""
        if not self.session_token:
            await self.log_result("Product Image Upload", False, "No session token available")
            return False
        
        if not hasattr(self, 'test_product_id'):
            await self.log_result("Product Image Upload", False, "No test product available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            
            # Create test image file
            image_data = base64.b64decode(TEST_IMAGE_BASE64)
            files = {
                "file": ("product_test.png", image_data, "image/png")
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/products/{self.test_product_id}/upload-image",
                headers=headers,
                files=files
            )
            
            if response.status_code == 200:
                data = response.json()
                success = data.get("success")
                image_url = data.get("image_url")
                
                if success and image_url:
                    # Check if URL is CloudFront URL
                    is_cloudfront = "cloudfront.net" in image_url or "commhub" in image_url
                    await self.log_result("Product Image Upload", True, f"Image URL: {image_url}, CloudFront: {is_cloudfront}")
                    return True
                else:
                    await self.log_result("Product Image Upload", False, f"Invalid response: {data}")
                    return False
            else:
                await self.log_result("Product Image Upload", False, f"Status code: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            await self.log_result("Product Image Upload", False, f"Error: {str(e)}")
            return False
    
    async def test_8_verify_product_image_updated(self):
        """Test that product image URL was updated in database"""
        if not self.session_token:
            await self.log_result("Verify Product Image Updated", False, "No session token available")
            return False
        
        if not hasattr(self, 'test_product_id'):
            await self.log_result("Verify Product Image Updated", False, "No test product available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            
            response = await self.client.get(
                f"{BACKEND_URL}/products/{self.test_product_id}",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                image_url = data.get("image_url")
                
                if image_url and (image_url != "/api/uploads/default-product.png"):
                    # Check if URL is CloudFront URL
                    is_cloudfront = "cloudfront.net" in image_url or "commhub" in image_url
                    await self.log_result("Verify Product Image Updated", True, f"Product image URL updated: {image_url}, CloudFront: {is_cloudfront}")
                    return True
                else:
                    await self.log_result("Verify Product Image Updated", False, f"Product image not updated: {image_url}")
                    return False
            else:
                await self.log_result("Verify Product Image Updated", False, f"Status code: {response.status_code}")
                return False
        except Exception as e:
            await self.log_result("Verify Product Image Updated", False, f"Error: {str(e)}")
            return False
    
    async def test_9_existing_crud_operations(self):
        """Test that existing CRUD operations still work"""
        if not self.session_token:
            await self.log_result("Existing CRUD Operations", False, "No session token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            
            # Test GET /api/products
            response = await self.client.get(f"{BACKEND_URL}/products", headers=headers)
            if response.status_code != 200:
                await self.log_result("Existing CRUD Operations", False, f"GET /products failed: {response.status_code}")
                return False
            
            # Test GET /api/orders
            response = await self.client.get(f"{BACKEND_URL}/orders", headers=headers)
            if response.status_code != 200:
                await self.log_result("Existing CRUD Operations", False, f"GET /orders failed: {response.status_code}")
                return False
            
            # Test GET /api/parked-carts
            response = await self.client.get(f"{BACKEND_URL}/parked-carts", headers=headers)
            if response.status_code != 200:
                await self.log_result("Existing CRUD Operations", False, f"GET /parked-carts failed: {response.status_code}")
                return False
            
            await self.log_result("Existing CRUD Operations", True, "All CRUD endpoints working")
            return True
            
        except Exception as e:
            await self.log_result("Existing CRUD Operations", False, f"Error: {str(e)}")
            return False
    
    async def test_10_unauthenticated_file_upload(self):
        """Test that file upload requires authentication"""
        try:
            upload_data = {
                "image": f"data:image/png;base64,{TEST_IMAGE_BASE64}",
                "folder": "test"
            }
            
            # Use a fresh client without any session data
            async with httpx.AsyncClient(timeout=30.0) as fresh_client:
                response = await fresh_client.post(
                    f"{BACKEND_URL}/files/upload-base64",
                    json=upload_data
                )
            
            if response.status_code == 401:
                await self.log_result("Unauthenticated File Upload", True, "Correctly rejected unauthenticated request")
                return True
            else:
                await self.log_result("Unauthenticated File Upload", False, f"Expected 401, got {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            await self.log_result("Unauthenticated File Upload", False, f"Error: {str(e)}")
            return False
    
    async def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting CommHub File Storage Integration Tests")
        print("=" * 60)
        
        tests = [
            self.test_1_health_check,
            self.test_2_user_login,
            self.test_3_auth_me_endpoint,
            self.test_4_file_upload_base64,
            self.test_5_file_upload_multipart,
            self.test_6_create_product,
            self.test_7_product_image_upload,
            self.test_8_verify_product_image_updated,
            self.test_9_existing_crud_operations,
            self.test_10_unauthenticated_file_upload
        ]
        
        passed = 0
        failed = 0
        
        for test in tests:
            result = await test()
            if result:
                passed += 1
            else:
                failed += 1
            print()  # Add spacing between tests
        
        print("=" * 60)
        print(f"📊 TEST SUMMARY: {passed} passed, {failed} failed")
        
        if failed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['details']}")
        
        await self.client.aclose()
        return failed == 0

async def main():
    """Main test runner"""
    tester = CommHubFileStorageTest()
    success = await tester.run_all_tests()
    
    if success:
        print("\n🎉 All tests passed! CommHub file storage integration is working correctly.")
    else:
        print("\n💥 Some tests failed. Check the details above.")
    
    return success

if __name__ == "__main__":
    asyncio.run(main())