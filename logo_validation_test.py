#!/usr/bin/env python3

import asyncio
import aiohttp
import json
import sys

BACKEND_URL = "https://github-import-56.preview.emergentagent.com/api"

async def test_logo_validation():
    """Test logo endpoint validation and error handling"""
    print("🔍 Logo Endpoint Validation Tests")
    print("=" * 50)
    
    async with aiohttp.ClientSession() as session:
        # Set up authenticated session
        try:
            import pymongo
            import uuid
            from datetime import datetime, timezone, timedelta
            
            client = pymongo.MongoClient("mongodb://localhost:27017/")
            db = client.pos_production
            
            user = db.users.find_one({"email_verified": True})
            if not user:
                print("❌ No verified users found")
                return
            
            session_token = f"token_{uuid.uuid4().hex}"
            expires_at = datetime.now(timezone.utc) + timedelta(days=7)
            
            session_doc = {
                "session_id": f"sess_{uuid.uuid4().hex}",
                "user_id": user["user_id"],
                "session_token": session_token,
                "expires_at": expires_at.isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            db.user_sessions.insert_one(session_doc)
            headers = {"Authorization": f"Bearer {session_token}"}
            
            # Test 1: PUT with missing logo_url
            print("\n📤 Testing PUT /api/admin/logo with missing logo_url")
            async with session.put(f"{BACKEND_URL}/admin/logo", json={}, headers=headers) as response:
                if response.status == 400:
                    text = await response.text()
                    print(f"✅ Missing logo_url: Correctly rejected (400) - {text}")
                else:
                    print(f"❌ Missing logo_url: Should reject with 400, got {response.status}")
            
            # Test 2: PUT with empty logo_url
            print("\n📤 Testing PUT /api/admin/logo with empty logo_url")
            async with session.put(f"{BACKEND_URL}/admin/logo", json={"logo_url": ""}, headers=headers) as response:
                if response.status == 400:
                    text = await response.text()
                    print(f"✅ Empty logo_url: Correctly rejected (400) - {text}")
                else:
                    print(f"❌ Empty logo_url: Should reject with 400, got {response.status}")
            
            # Test 3: PUT with valid logo_url
            print("\n📤 Testing PUT /api/admin/logo with valid logo_url")
            valid_url = "https://res.cloudinary.com/dmfzabr3e/image/upload/v1234567890/logos/store_logo.png"
            async with session.put(f"{BACKEND_URL}/admin/logo", json={"logo_url": valid_url}, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ Valid logo_url: SUCCESS - {data}")
                else:
                    text = await response.text()
                    print(f"❌ Valid logo_url: Failed - {response.status}: {text}")
            
            # Test 4: Authentication required tests
            print("\n🔒 Testing authentication requirements")
            
            # Test without headers
            async with session.put(f"{BACKEND_URL}/admin/logo", json={"logo_url": valid_url}) as response:
                if response.status == 401:
                    print(f"✅ PUT without auth: Correctly rejected (401)")
                else:
                    print(f"❌ PUT without auth: Should reject with 401, got {response.status}")
            
            async with session.delete(f"{BACKEND_URL}/admin/logo") as response:
                if response.status == 401:
                    print(f"✅ DELETE without auth: Correctly rejected (401)")
                else:
                    print(f"❌ DELETE without auth: Should reject with 401, got {response.status}")
            
            async with session.get(f"{BACKEND_URL}/admin/settings") as response:
                if response.status == 401:
                    print(f"✅ GET settings without auth: Correctly rejected (401)")
                else:
                    print(f"❌ GET settings without auth: Should reject with 401, got {response.status}")
            
            # Test 5: Invalid auth token
            print("\n🔑 Testing invalid auth token")
            invalid_headers = {"Authorization": "Bearer invalid_token_123"}
            async with session.put(f"{BACKEND_URL}/admin/logo", json={"logo_url": valid_url}, headers=invalid_headers) as response:
                if response.status == 401:
                    print(f"✅ Invalid token: Correctly rejected (401)")
                else:
                    print(f"❌ Invalid token: Should reject with 401, got {response.status}")
            
            # Clean up
            db.user_sessions.delete_one({"session_token": session_token})
            client.close()
            print(f"\n🧹 Cleaned up test session")
            
        except Exception as e:
            print(f"❌ Test setup error: {e}")

if __name__ == "__main__":
    asyncio.run(test_logo_validation())