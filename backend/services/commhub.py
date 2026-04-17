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
    
    # Prefix for all collection names to avoid conflicts
    COLLECTION_PREFIX = "qr_"
    
    def __init__(self, client: CommHubClient = None):
        self.client = client or CommHubClient()
        self._collections = {}
    
    def __getattr__(self, name: str):
        """Access collections like db.users, db.products, etc."""
        if name.startswith('_'):
            raise AttributeError(name)
        # Add prefix to collection name
        collection_name = f"{self.COLLECTION_PREFIX}{name}"
        if name not in self._collections:
            self._collections[name] = CommHubCollection(self.client, collection_name)
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
        
        # Handle special _id/id field - try to get directly by ID
        doc_id = filter.get("_id") or filter.get("id")
        if doc_id and len(filter) == 1:
            doc = await self.client.get_document(self.name, doc_id)
            if doc and "data" in doc:
                merged = {**doc["data"], "_id": doc["id"], "id": doc["id"]}
                merged["created_at"] = doc.get("created_at")
                merged["updated_at"] = doc.get("updated_at")
                return merged
            return doc
        
        # Remove _id from filter for CommHub
        filter_clean = {k: v for k, v in filter.items() if k not in ("_id", "id")}
        
        # For other queries, list and filter in-memory (CommHub doesn't support complex queries well)
        result = await self.client.list_documents(self.name, skip=0, limit=500)
        documents = result.get("documents", [])
        
        for doc in documents:
            data = doc.get("data", doc)
            # Check if all filter conditions match
            match = True
            for key, value in filter_clean.items():
                doc_value = data.get(key)
                # Handle nested keys like "customer.email"
                if "." in key:
                    parts = key.split(".")
                    doc_value = data
                    for part in parts:
                        if isinstance(doc_value, dict):
                            doc_value = doc_value.get(part)
                        else:
                            doc_value = None
                            break
                
                # Handle special MongoDB operators
                if isinstance(value, dict):
                    if "$gt" in value and not (doc_value is not None and doc_value > value["$gt"]):
                        match = False
                    if "$gte" in value and not (doc_value is not None and doc_value >= value["$gte"]):
                        match = False
                    if "$lt" in value and not (doc_value is not None and doc_value < value["$lt"]):
                        match = False
                    if "$lte" in value and not (doc_value is not None and doc_value <= value["$lte"]):
                        match = False
                    if "$ne" in value and doc_value == value["$ne"]:
                        match = False
                    if "$in" in value and doc_value not in value["$in"]:
                        match = False
                elif doc_value != value:
                    match = False
                
                if not match:
                    break
            
            if match:
                if "data" in doc:
                    merged = {**doc["data"], "_id": doc["id"], "id": doc["id"]}
                    merged["created_at"] = doc.get("created_at")
                    merged["updated_at"] = doc.get("updated_at")
                    return merged
                return doc
        
        return None
    
    def find(self, filter: Dict[str, Any] = None, projection: Dict[str, int] = None, sort: List[tuple] = None, skip: int = 0, limit: int = 100) -> 'LazyAsyncCursor':
        """Find documents matching filter - returns a lazy cursor that fetches on to_list()"""
        return LazyAsyncCursor(
            self.client, 
            self.name, 
            filter or {}, 
            projection, 
            sort, 
            skip, 
            limit
        )
    
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
    
    async def create_index(self, keys, **kwargs):
        """Create index - no-op for CommHub (indexes are automatic)"""
        pass
    
    async def create_indexes(self, indexes, **kwargs):
        """Create multiple indexes - no-op for CommHub"""
        pass


class LazyAsyncCursor:
    """
    Lazy cursor that fetches data when to_list() is called.
    This allows chaining like: await db.collection.find({}).to_list(100)
    """
    
    def __init__(self, client: CommHubClient, collection_name: str, filter: Dict, projection: Dict, sort_spec: List, skip_count: int, limit_count: int):
        self.client = client
        self.collection_name = collection_name
        self.filter = filter
        self.projection = projection
        self._sort_spec = sort_spec
        self._skip_count = skip_count
        self._limit_count = limit_count
        self._fetched = False
        self._documents = []
    
    async def _fetch(self):
        """Fetch and filter documents"""
        if self._fetched:
            return
        
        # Remove _id from filter for CommHub
        filter_clean = {k: v for k, v in self.filter.items() if k not in ("_id", "id")}
        
        # List and filter in-memory
        result = await self.client.list_documents(self.collection_name, skip=0, limit=500)
        documents = result.get("documents", [])
        
        # Filter documents
        filtered_docs = []
        for doc in documents:
            data = doc.get("data", doc)
            match = True
            
            for key, value in filter_clean.items():
                doc_value = data.get(key)
                # Handle nested keys
                if "." in key:
                    parts = key.split(".")
                    doc_value = data
                    for part in parts:
                        if isinstance(doc_value, dict):
                            doc_value = doc_value.get(part)
                        else:
                            doc_value = None
                            break
                
                # Handle MongoDB operators
                if isinstance(value, dict):
                    if "$gt" in value and not (doc_value is not None and doc_value > value["$gt"]):
                        match = False
                    if "$gte" in value and not (doc_value is not None and doc_value >= value["$gte"]):
                        match = False
                    if "$lt" in value and not (doc_value is not None and doc_value < value["$lt"]):
                        match = False
                    if "$lte" in value and not (doc_value is not None and doc_value <= value["$lte"]):
                        match = False
                    if "$ne" in value and doc_value == value["$ne"]:
                        match = False
                    if "$in" in value and doc_value not in value["$in"]:
                        match = False
                elif doc_value != value:
                    match = False
                
                if not match:
                    break
            
            if match:
                if "data" in doc:
                    merged = {**doc["data"], "_id": doc["id"], "id": doc["id"]}
                    merged["created_at"] = doc.get("created_at")
                    merged["updated_at"] = doc.get("updated_at")
                    filtered_docs.append(merged)
                else:
                    filtered_docs.append(doc)
        
        # Apply sort
        if self._sort_spec:
            for key, direction in reversed(self._sort_spec):
                filtered_docs.sort(
                    key=lambda x: x.get(key, "") or "",
                    reverse=(direction == -1)
                )
        
        # Apply skip and limit
        self._documents = filtered_docs[self._skip_count:self._skip_count + self._limit_count]
        self._fetched = True
    
    async def to_list(self, length: int = None) -> List[Dict]:
        """Fetch and return documents as list"""
        await self._fetch()
        if length:
            return self._documents[:length]
        return self._documents
    
    def sort(self, key_or_list, direction: int = None) -> 'LazyAsyncCursor':
        """Add sort to cursor (chainable)"""
        if isinstance(key_or_list, str):
            self._sort_spec = [(key_or_list, direction or 1)]
        else:
            self._sort_spec = key_or_list
        return self
    
    def skip(self, n: int) -> 'LazyAsyncCursor':
        """Add skip to cursor (chainable)"""
        self._skip_count = n
        return self
    
    def limit(self, n: int) -> 'LazyAsyncCursor':
        """Add limit to cursor (chainable)"""
        self._limit_count = n
        return self
    
    def __aiter__(self):
        return self
    
    async def __anext__(self):
        await self._fetch()
        if not self._documents:
            raise StopAsyncIteration
        return self._documents.pop(0)


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
