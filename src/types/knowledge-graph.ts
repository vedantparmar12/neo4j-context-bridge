import { z } from "zod";

// Core Knowledge Graph Types
export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

export interface Relation {
  from: string;
  to: string;
  relationType: string;
}

export interface KnowledgeGraph {
  entities: Map<string, Entity>;
  relations: Relation[];
}

// Zod Schemas for Knowledge Graph Tools
export const CreateEntitiesSchema = {
  entities: z.array(z.object({
    name: z.string().min(1, "Entity name cannot be empty"),
    entityType: z.string().min(1, "Entity type cannot be empty"),
    observations: z.array(z.string()).default([])
  })).min(1, "At least one entity must be provided")
};

export const CreateRelationsSchema = {
  relations: z.array(z.object({
    from: z.string().min(1, "Source entity cannot be empty"),
    to: z.string().min(1, "Target entity cannot be empty"),
    relationType: z.string().min(1, "Relation type cannot be empty")
  })).min(1, "At least one relation must be provided")
};

export const AddObservationsSchema = {
  observations: z.array(z.object({
    entityName: z.string().min(1, "Entity name cannot be empty"),
    contents: z.array(z.string()).min(1, "At least one observation must be provided")
  })).min(1, "At least one observation set must be provided")
};

export const DeleteEntitiesSchema = {
  entityNames: z.array(z.string()).min(1, "At least one entity name must be provided")
};

export const DeleteObservationsSchema = {
  deletions: z.array(z.object({
    entityName: z.string().min(1, "Entity name cannot be empty"),
    observations: z.array(z.string()).min(1, "At least one observation must be provided")
  })).min(1, "At least one deletion must be provided")
};

export const DeleteRelationsSchema = {
  relations: z.array(z.object({
    from: z.string().min(1, "Source entity cannot be empty"),
    to: z.string().min(1, "Target entity cannot be empty"),
    relationType: z.string().min(1, "Relation type cannot be empty")
  })).min(1, "At least one relation must be provided")
};

export const ReadGraphSchema = {};

export const SearchNodesSchema = {
  query: z.string().min(1, "Search query cannot be empty")
};

export const OpenNodesSchema = {
  names: z.array(z.string()).min(1, "At least one node name must be provided")
};