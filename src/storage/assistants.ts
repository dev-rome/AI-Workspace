import { randomUUID } from "node:crypto";
import { type Assistant, type AssistantUpdate } from "../types/assistant.js";

const assistants: Assistant[] = [];

export function getAssistants(): Assistant[] {
  return [...assistants];
}

export function getAssistantById(id: string): Assistant | null {
  const foundAssistant = assistants.find((a) => a.id === id);
  if (!foundAssistant) return null;
  return foundAssistant;
}

export function createAssistant(name: string, instructions: string) {
  const id = randomUUID();
  const assistant: Assistant = {
    id,
    name,
    instructions,
  };
  assistants.push(assistant);
  return assistant;
}

export function updateAssistant(
  id: string,
  updates: AssistantUpdate,
): Assistant | null {
  const assistant = assistants.find((a) => a.id === id);
  if (!assistant) return null;
  if (updates.name !== undefined) {
    assistant.name = updates.name;
  }
  if (updates.instructions !== undefined) {
    assistant.instructions = updates.instructions;
  }

  return assistant;
}

export function deleteAssistant(id: string): boolean {
  const index = assistants.findIndex((a) => a.id === id);
  if (index === -1) return false;
  assistants.splice(index, 1);
  return true;
}
