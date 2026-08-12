export type Assistant = {
  id: string;
  name: string;
  instructions: string;
  current_version_id: string | null;
  created_at: Date;
};

export type AssistantVersion = {
  id: string;
  assistant_id: string;
  version_number: number;
  name: string;
  instructions: string;
  created_at: Date;
};

export type AssistantUpdate = {
  name?: string;
  instructions?: string;
};

export type RestoreResult =
  | { ok: true; assistant: Assistant }
  | { ok: false; reason: "assistant_not_found" | "version_not_found" };
