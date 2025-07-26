# How to Use Conversation Memory - Step-by-Step Guide

This guide shows you exactly how to use the Neo4j-MCP conversation memory to continue your work after hitting token limits. **Now with automatic code and conversation storage!**

## Prerequisites

1. Neo4j-MCP server running and connected to Claude Desktop
2. Neo4j database accessible
3. Tools enabled in Claude Desktop

## 🆕 Automatic Code & Conversation Storage

The enhanced MCP server now **automatically stores**:
- All conversation messages (user questions & assistant responses)
- Code snippets with language detection
- Context and relationships between code and topics
- Complete conversation history for each user

## Step-by-Step Process

### Step 1: First Conversation (Before Token Limit)

When starting any significant work, tell Claude to save important context:

```
"I'm working on a FastAPI e-commerce project. Please remember:
- Project name: FastAPI E-commerce API
- Using Python 3.11, PostgreSQL, Redis
- Currently implementing user authentication with JWT
- Need to add product catalog next"
```

Claude will automatically:
1. Create entities for your project and technologies
2. Store your current progress
3. Link everything to your user profile
4. **NEW**: Save the entire conversation automatically

### Step 2: Automatic Code Storage Example

When you ask for code:

```
You: "Write a FastAPI endpoint for user registration with email validation"

Claude: "Here's a FastAPI endpoint for user registration with email validation:

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
import jwt

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str

@router.post("/register")
async def register(user: UserCreate):
    # Check if user exists
    if await user_exists(user.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Hash password
    hashed_password = pwd_context.hash(user.password)
    
    # Create user in database
    new_user = await create_user(
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name
    )
    
    return {"message": "User created successfully", "user_id": new_user.id}
```"
```

**What happens automatically:**

1. **Conversation Stored**:
   ```javascript
   // Automatically saved
   Message {
     role: "user",
     content: "Write a FastAPI endpoint for user registration...",
     timestamp: "2024-01-26T10:30:00Z",
     hasCode: false
   }
   
   Message {
     role: "assistant", 
     content: "Here's a FastAPI endpoint for user registration...",
     timestamp: "2024-01-26T10:30:15Z",
     hasCode: true  // Auto-detected!
   }
   ```

2. **Code Snippet Extracted**:
   ```javascript
   CodeSnippet {
     content: "from fastapi import APIRouter...",
     language: "python",  // Auto-detected
     description: "FastAPI user registration endpoint",
     context: "User asked for registration endpoint with email validation",
     relatedEntities: ["FastAPI", "authentication", "user_registration"]
   }
   ```

### Step 3: Store Code Explicitly (Optional)

For important code, you can explicitly store it with more details:

```
You: "Save this authentication code as our main auth module"

// Claude uses the store_code tool
store_code({
  user: "vedant",
  code: {
    content: "[the FastAPI code above]",
    language: "python",
    filename: "auth/endpoints.py",
    description: "Main authentication endpoints for user registration",
    context: "Core authentication module for e-commerce API"
  },
  relatedTo: ["FastAPI E-commerce API", "authentication", "JWT"]
})
```

### Step 4: Starting a New Conversation

In your new Claude Desktop conversation:

```
You: "Continue my FastAPI e-commerce project work"

Claude: [Uses conversation_memory tool automatically]

"Remembering... I found your conversation history:

Recent messages:
- You asked for a user registration endpoint with email validation
- I provided a FastAPI endpoint using Pydantic for validation

Code snippets saved:
- FastAPI user registration endpoint (auth/endpoints.py)
- JWT token generation function
- User model with SQLAlchemy

Your project details:
- FastAPI E-commerce API using Python 3.11
- Technologies: PostgreSQL, Redis, JWT authentication
- Completed: User registration endpoint
- Next: Product catalog implementation

Shall we continue with the product catalog?"
```

### Step 5: Retrieve Full History

To see everything stored:

```
You: "Show me all the code we've written for this project"

Claude: [Uses conversation_memory with get_history action]

"Here's your complete history:

📝 Conversations (last 10):
1. "Write a FastAPI endpoint for user registration..." → Provided registration endpoint
2. "How do I add JWT token generation?" → Added JWT implementation
3. "Create a User SQLAlchemy model" → Created database model

💻 Code Snippets:
1. User Registration Endpoint (Python)
   - File: auth/endpoints.py
   - Description: Main authentication endpoints
   
2. JWT Token Generation (Python)
   - File: auth/jwt_handler.py
   - Description: JWT token creation and validation
   
3. User Model (Python)
   - File: models/user.py
   - Description: SQLAlchemy user model with relationships"
```

## Practical Example: Complete Workflow

### First Conversation:

```
You: "I'm building a task management API with FastAPI. Start with user authentication"

Claude: "I'll help you build a task management API. Let me save this project context and create the authentication system...

[Creates auth code]

I've automatically saved:
- Your project: Task Management API
- The conversation about authentication
- The authentication code I provided"

You: "Now add a task model with CRUD operations"

Claude: "Here's the task model with CRUD operations:

```python
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime

class Task(Base):
    __tablename__ = "tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(String)
    completed = Column(Boolean, default=False)
    due_date = Column(DateTime, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    
    owner = relationship("User", back_populates="tasks")

# CRUD operations
class TaskCRUD:
    @staticmethod
    async def create_task(db, task_data, user_id):
        task = Task(**task_data.dict(), user_id=user_id)
        db.add(task)
        await db.commit()
        return task
```

This has been automatically saved to your conversation history!"
```

### Second Conversation (After Token Limit):

```
You: "What was I working on? Show me the code we wrote"

Claude: "Let me retrieve your history...

You were working on a Task Management API with FastAPI. Here's what we've built:

📁 Project Structure:
- Authentication system (complete)
- Task model with CRUD operations (complete)
- Next: API endpoints for tasks

💻 Code Written:

1. **Authentication Endpoints** (auth/endpoints.py):
   - User registration with email validation
   - JWT token generation
   - Login endpoint

2. **Task Model** (models/task.py):
   - SQLAlchemy model with relationships
   - CRUD operations class
   - Support for due dates and completion status

3. **User Model** (models/user.py):
   - User authentication fields
   - Relationship to tasks

Would you like to continue with the task API endpoints?"
```

## Key Commands to Use

### 1. Store Entire Conversations
```javascript
store_conversation({
  user: "your_name",
  messages: [
    { role: "user", content: "Your question" },
    { role: "assistant", content: "Claude's response with code", hasCode: true }
  ]
})
```

### 2. Store Code Snippets
```javascript
store_code({
  user: "your_name",
  code: {
    content: "your code here",
    language: "python",
    filename: "main.py",
    description: "What this code does"
  }
})
```

### 3. Retrieve Everything
```javascript
conversation_memory({
  user: "your_name",
  action: "get_history"
})
```

## What Gets Stored Automatically

### Conversation Messages
- ✅ Every user question
- ✅ Every assistant response
- ✅ Timestamp for each message
- ✅ Automatic code detection

### Code Snippets
- ✅ Full code content
- ✅ Programming language (auto-detected)
- ✅ Context from conversation
- ✅ Relationships to topics/entities

### Example Database Structure
```
User: vedant
├── Messages
│   ├── "How do I create a REST API?" (user, 2024-01-26 10:00)
│   ├── "Here's how to create a REST API..." (assistant, 2024-01-26 10:01, hasCode: true)
│   └── "Add authentication to the API" (user, 2024-01-26 10:15)
└── Code Snippets
    ├── FastAPI Basic Setup (python, 2024-01-26 10:01)
    ├── JWT Authentication (python, 2024-01-26 10:16)
    └── Task CRUD Operations (python, 2024-01-26 10:30)
```

## Advanced Features

### Search Your History
```
You: "Find all code related to authentication"

Claude: [Searches through stored code and conversations]
"Found 3 code snippets related to authentication:
1. JWT token generation function
2. User registration endpoint  
3. Login endpoint with password hashing"
```

### Link Code to Projects
```
You: "This code belongs to my e-commerce project"

Claude: [Creates relationships in the graph]
"Linked the code to your FastAPI E-commerce API project"
```

### Export Your Knowledge
```
You: "Show me all Python code I've written this week"

Claude: [Queries by language and time]
"Here are your Python snippets from this week:
1. FastAPI endpoints (5 files)
2. SQLAlchemy models (3 files)
3. Utility functions (2 files)"
```

## Best Practices

### 1. Use Descriptive Project Names
```
Good: "FastAPI E-commerce API v2"
Bad: "my project"
```

### 2. Let Auto-Save Work
- Don't worry about manually saving every conversation
- The system automatically captures everything
- Focus on your work, not on remembering to save

### 3. Add Context When Needed
```
"This code is for the payment processing module"
"This relates to the bug we discussed yesterday"
```

### 4. Review Your History Periodically
```
"Show me what we worked on this week"
"What code did we write for authentication?"
```

## Troubleshooting

### Can't Find Old Conversations
```
"Search for conversations about [topic]"
"Show me all messages containing 'authentication'"
```

### Missing Code
```
"Find code snippets in Python"
"Show me code related to FastAPI"
```

### Too Much History
```
"Show me only the last 10 messages"
"Get code snippets from today"
```

## Quick Reference Card

```
🚀 Start: Just start talking - everything is saved automatically!
💾 Explicit Save: "Save this code as [name]"
🔄 Continue: "Continue my [project name]"
📜 History: "Show my conversation history"
💻 Code: "Show all code snippets"
🔍 Search: "Find code/conversations about [topic]"
```

This enhanced system ensures you never lose important work, code, or context - everything is automatically captured and easily retrievable!