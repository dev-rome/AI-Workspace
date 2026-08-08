export type Assistant = {
  id: string;
  name: string;
  instructions: string;
};

export type AssistantUpdate = {
  name?: string;
  instructions?: string;
};
