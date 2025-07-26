# Conversation Memory Guide for Neo4j-MCP

This guide explains how to use the conversation memory features to maintain context across Claude Desktop sessions.

## Overview

The Neo4j-MCP server now supports persistent conversation memory that allows Claude to:
- Remember user information across sessions
- Track project context even after token limits
- Maintain relationships between entities (people, projects, technologies)
- Retrieve past conversation context

## Key Features

### 1. User Identification & Memory Retrieval

At the start of each conversation, Claude can:
```
// Identify and remember user
conversation_memory({
  user: "default_user",
  action: "remember"
})
```

This retrieves:
- User profile and observations
- Related entities (projects, technologies, goals)
- Recent conversation contexts
- Categorized information (identity, behaviors, preferences)

### 2. Storing New Information

When new information is discovered during conversation:
```
conversation_memory({
  user: "default_user", 
  action: "store",
  data: {
    entities: [
      {
        name: "FastAPI Project",
        type: "project",
        observations: [
          "Building REST API",
          "Using Python 3.11",
          "Implementing authentication"
        ]
      }
    ]
  }
})
```

### 3. Project Context Storage

For detailed project information:
```
store_project_context({
  user: "default_user",
  project: "FastAPI E-commerce API",
  context: {
    summary: "Building e-commerce REST API with FastAPI",
    technologies: ["FastAPI", "PostgreSQL", "Redis", "Docker"],
    keyPoints: [
      "Implemented JWT authentication",
      "Created product catalog endpoints",
      "Added shopping cart functionality"
    ],
    codeSnippets: [
      {
        description: "User authentication endpoint",
        code: "@app.post('/auth/login')..."
      }
    ]
  }
})
```

## Usage Example

### Scenario: Continuing work after token limit

**Previous conversation (hit token limit):**
- User was working on FastAPI project
- Implemented authentication endpoints
- Started working on product catalog

**New conversation:**
1. Claude starts with "Remembering..." and retrieves context
2. Finds "FastAPI E-commerce API" project in memory
3. Sees previous work on authentication
4. Can continue from where user left off

### Implementation in Claude's System Prompt

Add this to Claude's system instructions:

```
Follow these steps for each interaction:

1. User Identification:
   - Assume interaction with default_user
   - Use conversation_memory tool with action="remember" at start

2. Memory Retrieval:
   - Begin chat with "Remembering..." 
   - Retrieve all relevant information from knowledge graph

3. Information Tracking:
   During conversation, track:
   a) Identity info (name, role, location)
   b) Behaviors (work patterns, preferences)
   c) Projects and technologies
   d) Goals and aspirations
   e) Relationships

4. Memory Updates:
   - Use conversation_memory with action="store" for new entities
   - Use store_project_context for detailed project information
```

## Benefits

1. **Continuity**: Work seamlessly continues across sessions
2. **Context Preservation**: Important details aren't lost to token limits
3. **Relationship Tracking**: Understands connections between entities
4. **Personalization**: Remembers user preferences and patterns
5. **Project Management**: Maintains detailed project history

## Entity Types Supported

- **person**: Users, colleagues, contacts
- **project**: Software projects, initiatives
- **technology**: Programming languages, frameworks, tools
- **organization**: Companies, teams
- **event**: Meetings, milestones, deadlines
- **goal**: Objectives, targets
- **preference**: User preferences, settings

## Graph Structure

The memory creates a knowledge graph where:
- Entities are nodes (users, projects, technologies)
- Relationships connect nodes (user "works_on" project)
- Observations store facts about entities
- Contexts preserve conversation snippets

This allows complex queries like:
- "What technologies does the user work with?"
- "What projects use FastAPI?"
- "What was discussed about authentication?"

## Best Practices

1. **Regular Updates**: Store important information as soon as it's mentioned
2. **Descriptive Observations**: Add clear, specific observations to entities
3. **Relationship Mapping**: Create meaningful relationships between entities
4. **Context Preservation**: Store code snippets and key decisions
5. **Categorization**: Use appropriate entity types for better organization