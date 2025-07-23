// Neo4j Schema for Context Management MCP Server
// Run these commands in Neo4j Browser or via driver initialization

// Node Labels
// :Context - Represents extracted context from chats
// :Chat - Represents a chat session
// :Project - Represents a project grouping multiple chats

// Constraints (ensure uniqueness)
CREATE CONSTRAINT context_id_unique IF NOT EXISTS 
FOR (c:Context) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT chat_id_unique IF NOT EXISTS 
FOR (c:Chat) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT project_id_unique IF NOT EXISTS 
FOR (p:Project) REQUIRE p.id IS UNIQUE;

// Indexes for performance
// Context indexes
CREATE INDEX context_chatId IF NOT EXISTS 
FOR (c:Context) ON (c.chatId);

CREATE INDEX context_projectId IF NOT EXISTS 
FOR (c:Context) ON (c.projectId);

CREATE INDEX context_timestamp IF NOT EXISTS 
FOR (c:Context) ON (c.timestamp);

CREATE INDEX context_type IF NOT EXISTS 
FOR (c:Context) ON (c.contextType);

CREATE INDEX context_importance IF NOT EXISTS 
FOR (c:Context) ON (c.importanceScore);

// Chat indexes
CREATE INDEX chat_projectId IF NOT EXISTS 
FOR (c:Chat) ON (c.projectId);

CREATE INDEX chat_userId IF NOT EXISTS 
FOR (c:Chat) ON (c.userId);

CREATE INDEX chat_createdAt IF NOT EXISTS 
FOR (c:Chat) ON (c.createdAt);

CREATE INDEX chat_updatedAt IF NOT EXISTS 
FOR (c:Chat) ON (c.updatedAt);

// Vector index for semantic search
// Note: This requires Neo4j version that supports vector indexes
CREATE VECTOR INDEX context_embeddings IF NOT EXISTS
FOR (c:Context)
ON (c.embedding)
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 768,
    `vector.similarity_function`: 'cosine'
  }
};

// Full-text search index for keyword search
CREATE TEXT INDEX context_content IF NOT EXISTS
FOR (c:Context)
ON (c.content);

// Relationship types
// (Context)-[:BELONGS_TO]->(Chat) - Context belongs to a chat
// (Context)-[:REFERENCES]->(Context) - One context references another
// (Context)-[:EVOLVES_TO]->(Context) - Context evolves into another
// (Context)-[:DEPENDS_ON]->(Context) - Context depends on another
// (Context)-[:RELATED_TO {similarity: float}]->(Context) - Contexts are related
// (Context)-[:IMPLEMENTS]->(Context) - Code implements a requirement
// (Chat)-[:PART_OF]->(Project) - Chat is part of a project

// Example queries

// Find all contexts in a chat
// MATCH (ctx:Context)-[:BELONGS_TO]->(chat:Chat {id: $chatId})
// RETURN ctx ORDER BY ctx.timestamp;

// Semantic search using vector index
// CALL db.index.vector.queryNodes(
//   'context_embeddings',
//   10,
//   $queryEmbedding
// ) YIELD node, score
// WHERE score >= 0.7
// RETURN node, score;

// Find evolution chain
// MATCH path = (start:Context {id: $contextId})-[:EVOLVES_TO*]-(end:Context)
// RETURN path;

// Find related contexts across chats
// MATCH (source:Context {id: $contextId})
// MATCH (source)-[:RELATED_TO|REFERENCES|EVOLVES_TO]-(related:Context)
// MATCH (related)-[:BELONGS_TO]->(chat:Chat)
// RETURN related, chat.title, type(relationship(source, related));

// Graph statistics
// MATCH (c:Context) RETURN count(c) as totalContexts;
// MATCH (c:Chat) RETURN count(c) as totalChats;
// MATCH ()-[r]->() RETURN type(r) as relType, count(r) as count;