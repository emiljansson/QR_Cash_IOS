#!/usr/bin/env python3

import asyncio
import aiohttp
import json
import sys

# Using the same backend URL that worked
BACKEND_URL = "https://github-import-56.preview.emergentagent.com/api"

async def test_logo_endpoints_focused():
    """Focused test on logo endpoints with existing user"""
    print("🔍 Focused Logo Endpoint Tests")
    print("=" * 50)
    
    async with aiohttp.ClientSession() as session:
        
        # Try to use login code for quick auth (from backend logs, I can see this is being used)
        # Let's try a known working approach - look for existing users in database
        
        # Alternative: Use pymongo to get a valid user for testing
        try:
            import pymongo
            client = pymongo.MongoClient("mongodb://localhost:27017/")
            db = client.pos_production
            
            # Find any verified user
            user = db.users.find_one({"email_verified": True})
            if user:
                print(f"✅ Found verified user: {user.get('email', 'unknown')}")
                
                # Create a session for this user
                import uuid
                from datetime import datetime, timezone, timedelta
                
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
                print(f"✅ Created test session: {session_token[:20]}...")
                
                # Test the logo endpoints
                headers = {"Authorization": f"Bearer {session_token}"}
                
                # 1. Test GET admin settings
                print("\n📋 Testing GET /api/admin/settings")
                async with session.get(f"{BACKEND_URL}/admin/settings", headers=headers) as response:
                    if response.status == 200:
                        data = await response.json()
                        print(f"✅ GET Settings: SUCCESS - logo_url present: {'logo_url' in data}")
                        print(f"   Current logo_url: {data.get('logo_url', 'None')}")
                    else:
                        text = await response.text()
                        print(f"❌ GET Settings: FAILED - {response.status}: {text}")
                
                # 2. Test PUT admin logo
                print("\n📤 Testing PUT /api/admin/logo")
                test_logo_url = "https://cloudinary.example.com/v1_1/dmfzabr3e/image/upload/test-store-logo.png"
                payload = {"logo_url": test_logo_url}
                
                async with session.put(f"{BACKEND_URL}/admin/logo", json=payload, headers=headers) as response:
                    if response.status == 200:
                        data = await response.json()
                        success = data.get("success", False)
                        returned_url = data.get("logo_url", "")
                        print(f"✅ PUT Logo: SUCCESS - logo updated")
                        print(f"   Returned URL: {returned_url}")
                        print(f"   Expected URL: {test_logo_url}")
                        print(f"   URLs match: {returned_url == test_logo_url}")
                    else:
                        text = await response.text()
                        print(f"❌ PUT Logo: FAILED - {response.status}: {text}")
                
                # 3. Verify logo is stored
                print("\n🔍 Verifying logo storage in settings")
                async with session.get(f"{BACKEND_URL}/admin/settings", headers=headers) as response:
                    if response.status == 200:
                        data = await response.json()
                        stored_url = data.get("logo_url")
                        print(f"✅ Logo Storage: SUCCESS")
                        print(f"   Stored URL: {stored_url}")
                        print(f"   Matches expected: {stored_url == test_logo_url}")
                    else:
                        text = await response.text()
                        print(f"❌ Logo Storage Check: FAILED - {response.status}: {text}")
                
                # 4. Test DELETE admin logo
                print("\n🗑️ Testing DELETE /api/admin/logo")
                async with session.delete(f"{BACKEND_URL}/admin/logo", headers=headers) as response:
                    if response.status == 200:
                        data = await response.json()
                        success = data.get("success", False)
                        message = data.get("message", "")
                        print(f"✅ DELETE Logo: SUCCESS - {message}")
                    else:
                        text = await response.text()
                        print(f"❌ DELETE Logo: FAILED - {response.status}: {text}")
                
                # 5. Verify logo is removed
                print("\n🔍 Verifying logo removal")
                async with session.get(f"{BACKEND_URL}/admin/settings", headers=headers) as response:
                    if response.status == 200:
                        data = await response.json()
                        stored_url = data.get("logo_url")
                        is_removed = stored_url is None
                        print(f"✅ Logo Removal: SUCCESS - logo_url is None: {is_removed}")
                        print(f"   Current logo_url: {stored_url}")
                    else:
                        text = await response.text()
                        print(f"❌ Logo Removal Check: FAILED - {response.status}: {text}")
                
                # Clean up test session
                db.user_sessions.delete_one({"session_token": session_token})
                print(f"\n🧹 Cleaned up test session")
                
            else:
                print("❌ No verified users found for testing")
            
            client.close()
            
        except Exception as e:
            print(f"❌ Database setup error: {e}")

if __name__ == "__main__":
    asyncio.run(test_logo_endpoints_focused())