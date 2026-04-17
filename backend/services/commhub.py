"""
CommHub API Client

Handles all communication with CommHub services:
- Datastore (database)
- Files (S3 storage)
- Email
- WebSocket (realtime)
"""

import os
import httpx
import asyncio
from typing import Optional, Dict, Any, List
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# CommHub Configuration
COMMHUB_BASE_URL = os.getenv("COMMHUB_BASE_URL", "https://commhub.cloud/api")
COMMHUB_API_KEY = os.getenv("COMMHUB_API_KEY", "")
COMMHUB_APP_ID = os.getenv("COMMHUB_APP_ID", "")


class CommHubClient:
    """Client for CommHub API"""
    
    def __init__(self, api_key: str = None, app_id: str = None, base_url: str = None):
        self.api_key = api_key or COMMHUB_API_KEY
        self.app_id = app_id or COMMHUB_APP_ID
        self.base_url = base_url or COMMHUB_BASE_URL
        self._client: Optional[httpx.AsyncClient] = None
    
    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "X-API-Key": self.api_key,
                    "Content-Type": "application/json",
                },
                timeout=30.0
            )
        return self._client
    
    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()
    
    # ==================== DATASTORE ====================
    
    async def create_document(self, collection: str, data: Dict[str, Any], metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """Create a document in a collection"""
        payload = {
            "data": {
                "app_id": self.app_id,
                **data
            }
        }
        if metadata:
            payload["metadata"] = metadata
        
        response = await self.client.post(f"/data/{collection}", json=payload)
        response.raise_for_status()
        return response.json()
    
    async def get_document(self, collection: str, document_id: str) -> Optional[Dict[str, Any]]:
        """Get a single document by ID"""
        try:
            response = await self.client.get(f"/data/{collection}/{document_id}")
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise
    
    async def list_documents(self, collection: str, skip: int = 0, limit: int = 100) -> Dict[str, Any]:
        """List documents in a collection"""
        response = await self.client.get(
            f"/data/{collection}",
            params={"skip": skip, "limit": limit}
        )
        response.raise_for_status()
        return response.json()
    
    async def query_documents(self, collection: str, filter: Dict[str, Any] = None, sort: Dict[str, int] = None, skip: int = 0, limit: int = 100) -> Dict[str, Any]:
        """Query documents with filter and sort"""
        payload = {}
        if filter:
            payload["filter"] = filter
        if sort:
            payload["sort"] = sort
        payload["skip"] = skip
        payload["limit"] = limit
        
        response = await self.client.post(f"/data/{collection}/query", json=payload)
        response.raise_for_status()
        return response.json()
    
    async def update_document(self, collection: str, document_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Update a document"""
        payload = {"data": data}
        response = await self.client.put(f"/data/{collection}/{document_id}", json=payload)
        response.raise_for_status()
        return response.json()
    
    async def delete_document(self, collection: str, document_id: str) -> bool:
        """Delete a document"""
        response = await self.client.delete(f"/data/{collection}/{document_id}")
        response.raise_for_status()
        return True
    
    async def search_documents(self, collection: str, query: str, fields: List[str] = None) -> Dict[str, Any]:
        """Search documents with free text"""
        params = {"q": query}
        if fields:
            params["fields"] = ",".join(fields)
        
        response = await self.client.get(f"/data/{collection}/search", params=params)
        response.raise_for_status()
        return response.json()
    
    # ==================== FILES ====================
    
    async def upload_file(self, file_content: bytes, filename: str, content_type: str = "image/jpeg") -> Dict[str, Any]:
        """Upload a file to CommHub storage"""
        files = {
            "file": (filename, file_content, content_type)
        }
        # Need to create a new client without JSON content-type for file upload
        async with httpx.AsyncClient(
            base_url=self.base_url,
            headers={"X-API-Key": self.api_key},
            timeout=60.0
        ) as client:
            response = await client.post(
                "/files/upload",
                files=files,
                data={"app_id": self.app_id}
            )
            response.raise_for_status()
            return response.json()
    
    async def delete_file(self, file_id: str) -> bool:
        """Delete a file from storage"""
        response = await self.client.delete(f"/files/{file_id}")
        response.raise_for_status()
        return True
    
    # ==================== EMAIL ====================
    
    async def send_email(
        self,
        to: str,
        subject: str,
        body: str = None,
        html: str = None,
        from_email: str = None,
        from_name: str = None,
        reply_to: str = None,
        attachments: List[Dict] = None
    ) -> Dict[str, Any]:
        """Send an email via CommHub"""
        payload = {
            "app_id": self.app_id,
            "to": to,
            "subject": subject,
        }
        
        if body:
            payload["body"] = body
        if html:
            payload["html"] = html
        if from_email:
            payload["from_email"] = from_email
        if from_name:
            payload["from_name"] = from_name
        if reply_to:
            payload["reply_to"] = reply_to
        if attachments:
            payload["attachments"] = attachments
        
        response = await self.client.post("/email/send", json=payload)
        response.raise_for_status()
        return response.json()
    
    # ==================== WEBSOCKET ====================
    
    def get_websocket_url(self, channel: str = None) -> str:
        """Get WebSocket URL for realtime updates"""
        ws_base = self.base_url.replace("https://", "wss://").replace("http://", "ws://")
        url = f"{ws_base}/ws?api_key={self.api_key}&app_id={self.app_id}"
        if channel:
            url += f"&channel={channel}"
        return url


# ==================== MONGODB-COMPATIBLE WRAPPER ====================

class CommHubDB:
    """
    MongoDB-compatible wrapper for CommHub Datastore.
    Makes migration from MongoDB easier by providing similar interface.
    """
    
    def __init__(self, client: CommHubClient = None):
        self.client = client or CommHubClient()
        self._collections = {}
    
    def __getattr__(self, name: str):
        """Access collections like db.users, db.products, etc."""
        if name.startswith('_'):
            raise AttributeError(name)
        if name not in self._collections:
            self._collections[name] = CommHubCollection(self.client, name)
        return self._collections[name]
    
    def __getitem__(self, name: str):
        """Access collections like db['users']"""
        return getattr(self, name)


class CommHubCollection:
    """MongoDB-compatible collection wrapper"""
    
    def __init__(self, client: CommHubClient, name: str):
        self.client = client
        self.name = name
    
    async def find_one(self, filter: Dict[str, Any] = None, projection: Dict[str, int] = None) -> Optional[Dict[str, Any]]:
        """Find a single document matching filter"""
        if filter is None:
            filter = {}
        
        # Handle special _id field
        if "_id" in filter:
            del filter["_id"]
        
        result = await self.client.query_documents(self.name, filter=filter, limit=1)
        documents = result.get("documents", [])
        
        if not documents:
            return None
        
        doc = documents[0]
        # Merge data into top level for compatibility
        if "data" in doc:
            merged = {**doc["data"], "_id": doc["id"], "id": doc["id"]}
            merged["created_at"] = doc.get("created_at")
            merged["updated_at"] = doc.get("updated_at")
            return merged
        return doc
    
    async def find(self, filter: Dict[str, Any] = None, projection: Dict[str, int] = None, sort: List[tuple] = None, skip: int = 0, limit: int = 100):
        """Find documents matching filter - returns async generator"""
        if filter is None:
            filter = {}
        
        # Handle special _id field
        if "_id" in filter:
            del filter["_id"]
        
        # Convert sort format from MongoDB [(field, 1/-1)] to CommHub {field: 1/-1}
        sort_dict = None
        if sort:
            sort_dict = {field: direction for field, direction in sort}
        
        result = await self.client.query_documents(
            self.name, 
            filter=filter, 
            sort=sort_dict, 
            skip=skip, 
            limit=limit
        )
        
        documents = result.get("documents", [])
        
        # Return documents with merged data
        merged_docs = []
        for doc in documents:
            if "data" in doc:
                merged = {**doc["data"], "_id": doc["id"], "id": doc["id"]}
                merged["created_at"] = doc.get("created_at")
                merged["updated_at"] = doc.get("updated_at")
                merged_docs.append(merged)
            else:
                merged_docs.append(doc)
        
        return AsyncDocumentCursor(merged_docs)
    
    async def insert_one(self, document: Dict[str, Any]) -> Any:
        """Insert a single document"""
        # Remove _id if present (CommHub generates its own)
        doc = {k: v for k, v in document.items() if k != "_id"}
        
        result = await self.client.create_document(self.name, doc)
        
        class InsertResult:
            def __init__(self, id):
                self.inserted_id = id
        
        return InsertResult(result.get("id"))
    
    async def update_one(self, filter: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> Any:
        """Update a single document"""
        # Find the document first
        doc = await self.find_one(filter)
        
        if not doc:
            if upsert:
                # Insert new document
                new_doc = filter.copy()
                if "$set" in update:
                    new_doc.update(update["$set"])
                if "$unset" in update:
                    for key in update["$unset"]:
                        new_doc.pop(key, None)
                result = await self.insert_one(new_doc)
                
                class UpsertResult:
                    def __init__(self):
                        self.matched_count = 0
                        self.modified_count = 0
                        self.upserted_id = result.inserted_id
                
                return UpsertResult()
            else:
                class NoMatchResult:
                    matched_count = 0
                    modified_count = 0
                return NoMatchResult()
        
        # Prepare update data
        update_data = doc.copy()
        if "$set" in update:
            update_data.update(update["$set"])
        if "$unset" in update:
            for key in update["$unset"]:
                update_data.pop(key, None)
        if "$inc" in update:
            for key, value in update["$inc"].items():
                update_data[key] = update_data.get(key, 0) + value
        
        # Remove internal fields
        for key in ["_id", "id", "created_at", "updated_at"]:
            update_data.pop(key, None)
        
        await self.client.update_document(self.name, doc["id"], update_data)
        
        class UpdateResult:
            matched_count = 1
            modified_count = 1
        
        return UpdateResult()
    
    async def delete_one(self, filter: Dict[str, Any]) -> Any:
        """Delete a single document"""
        doc = await self.find_one(filter)
        
        if not doc:
            class NoDeleteResult:
                deleted_count = 0
            return NoDeleteResult()
        
        await self.client.delete_document(self.name, doc["id"])
        
        class DeleteResult:
            deleted_count = 1
        
        return DeleteResult()
    
    async def delete_many(self, filter: Dict[str, Any]) -> Any:
        """Delete multiple documents"""
        cursor = await self.find(filter, limit=1000)
        docs = await cursor.to_list(length=1000)
        
        deleted = 0
        for doc in docs:
            try:
                await self.client.delete_document(self.name, doc["id"])
                deleted += 1
            except Exception:
                pass
        
        class DeleteManyResult:
            def __init__(self, count):
                self.deleted_count = count
        
        return DeleteManyResult(deleted)
    
    async def count_documents(self, filter: Dict[str, Any] = None) -> int:
        """Count documents matching filter"""
        if filter is None:
            filter = {}
        result = await self.client.query_documents(self.name, filter=filter, limit=0)
        return result.get("total", 0)


class AsyncDocumentCursor:
    """Async cursor for iterating documents"""
    
    def __init__(self, documents: List[Dict]):
        self._documents = documents
        self._index = 0
    
    def __aiter__(self):
        return self
    
    async def __anext__(self):
        if self._index >= len(self._documents):
            raise StopAsyncIteration
        doc = self._documents[self._index]
        self._index += 1
        return doc
    
    async def to_list(self, length: int = None) -> List[Dict]:
        if length:
            return self._documents[:length]
        return self._documents
    
    def sort(self, key_or_list, direction: int = None):
        """Sort documents (in-memory)"""
        if isinstance(key_or_list, str):
            key_or_list = [(key_or_list, direction or 1)]
        
        for key, direction in reversed(key_or_list):
            self._documents.sort(
                key=lambda x: x.get(key, ""),
                reverse=(direction == -1)
            )
        return self


# ==================== SINGLETON INSTANCE ====================

_commhub_client: Optional[CommHubClient] = None
_commhub_db: Optional[CommHubDB] = None


def get_commhub_client() -> CommHubClient:
    """Get singleton CommHub client"""
    global _commhub_client
    if _commhub_client is None:
        _commhub_client = CommHubClient()
    return _commhub_client


def get_commhub_db() -> CommHubDB:
    """Get singleton CommHub DB wrapper"""
    global _commhub_db
    if _commhub_db is None:
        _commhub_db = CommHubDB(get_commhub_client())
    return _commhub_db
