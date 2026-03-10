import pytest
import requests
import os

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def base_url():
    """Base URL from environment"""
    # Try to load from frontend .env file
    frontend_env_path = os.path.join(os.path.dirname(__file__), '../../frontend/.env')
    if os.path.exists(frontend_env_path):
        with open(frontend_env_path, 'r') as f:
            for line in f:
                if line.startswith('EXPO_PUBLIC_BACKEND_URL='):
                    url = line.split('=', 1)[1].strip().strip('"').strip("'")
                    return url.rstrip('/')
    # Fallback to environment variable
    url = os.environ.get('EXPO_PUBLIC_BACKEND_URL')
    if url:
        return url.rstrip('/')
    # Final fallback
    return 'https://github-import-56.preview.emergentagent.com'

@pytest.fixture
def test_user():
    """Test user credentials"""
    return {
        "email": "test@test.se",
        "password": "test123"
    }

@pytest.fixture
def authenticated_client(api_client, base_url, test_user):
    """Client with authentication token"""
    response = api_client.post(
        f"{base_url}/api/auth/login",
        json=test_user
    )
    if response.status_code == 200:
        data = response.json()
        api_client.headers.update({"Authorization": f"Bearer {data['session_token']}"})
    return api_client
