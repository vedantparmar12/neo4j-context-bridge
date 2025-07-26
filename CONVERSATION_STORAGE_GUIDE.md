# Conversation & Code Storage Guide

The enhanced Neo4j MCP server now includes powerful conversation and code storage capabilities.

## New Features

### 1. **Store Conversation Messages**
Automatically store both user and assistant messages for future reference.

```javascript
// Using the dedicated tool
store_conversation({
  user: "vedant",
  messages: [
    {
      role: "user",
      content: "How do I implement a REST API in Python?",
      hasCode: false
    },
    {
      role: "assistant", 
      content: "Here's how to implement a REST API using Flask...",
      hasCode: true
    }
  ]
})

// Or using conversation_memory tool
conversation_memory({
  user: "vedant",
  action: "store_message",
  data: {
    role: "user",
    message: "Can you help me with React hooks?"
  }
})
```

### 2. **Store Code Snippets**
Save code with metadata and link it to related entities.

```javascript
store_code({
  user: "vedant",
  code: {
    content: "def hello_world():\n    print('Hello, World!')",
    language: "python",
    filename: "hello.py",
    description: "Simple hello world function",
    context: "Tutorial example for beginners"
  },
  relatedTo: ["python", "tutorial", "functions"]
})
```

### 3. **Retrieve Conversation History**
Get all stored messages and code snippets for a user.

```javascript
conversation_memory({
  user: "vedant",
  action: "get_history"
})

// Returns:
{
  messages: [
    {
      id: "msg_vedant_1234567890",
      role: "user",
      content: "How do I implement a REST API?",
      timestamp: "2024-01-26T10:30:00Z",
      hasCode: false
    },
    // ... more messages
  ],
  codeSnippets: [
    {
      id: "code_vedant_1234567890",
      content: "def hello_world()...",
      language: "python",
      filename: "hello.py",
      description: "Simple hello world function",
      relatedEntities: ["python", "tutorial"]
    },
    // ... more snippets
  ],
  messageCount: 10,
  codeCount: 5
}
```

## How It Works

### Database Structure

The system creates the following Neo4j structure:

```
(User:Entity {name, entityType: "person"})
  |
  +--[:HAS_MESSAGE]-->(Message {id, role, content, timestamp, hasCode})
  |
  +--[:WROTE_CODE]-->(CodeSnippet {id, content, language, filename, description, context, timestamp})
                          |
                          +--[:RELATES_TO]-->(RelatedEntity:Entity)
```

### Automatic Detection

- **Code Detection**: Messages are automatically marked as containing code if they include:
  - Triple backticks (```)
  - Keywords like `function`, `class`, `def`, `const`, etc.

### Use Cases

1. **Personal Knowledge Base**: Store all your coding questions and solutions
2. **Learning Tracker**: Keep track of what you've learned over time
3. **Code Library**: Build a personal library of code snippets
4. **Context Preservation**: Never lose important conversations or code examples

## Example Workflow

```javascript
// 1. User asks a question
store_conversation({
  user: "vedant",
  messages: [{
    role: "user",
    content: "How do I connect to MongoDB in Node.js?"
  }]
})

// 2. Assistant provides code
store_conversation({
  user: "vedant",
  messages: [{
    role: "assistant",
    content: "Here's how to connect to MongoDB:\n\n```javascript\nconst MongoClient = require('mongodb').MongoClient;...",
    hasCode: true
  }]
})

// 3. Store the code separately for easy retrieval
store_code({
  user: "vedant",
  code: {
    content: "const MongoClient = require('mongodb').MongoClient;\n// ... rest of code",
    language: "javascript",
    description: "MongoDB connection example",
    context: "User asked how to connect to MongoDB"
  },
  relatedTo: ["mongodb", "nodejs", "database"]
})

// 4. Later, retrieve everything
conversation_memory({
  user: "vedant",
  action: "get_history"
})
```

## Benefits

✅ **Never Forget**: All conversations and code are permanently stored
✅ **Searchable**: Use the search_nodes tool to find specific conversations or code
✅ **Contextual**: Code is linked to the conversation context
✅ **Organized**: Automatic categorization and relationships
✅ **Personal**: Each user has their own conversation history

## Privacy Note

All data is stored in your local Neo4j database. Nothing is sent to external services.