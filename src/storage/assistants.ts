import { randomUUID } from "node:crypto";
import { type Assistant } from "../types/assistant.js";

const assistants: Assistant[] = [];

export function getAssistants(): Assistant[] {
  return [...assistants];
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
