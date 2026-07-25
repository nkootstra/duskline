import { sha256 } from "./canonical";

export const lifecycleIdentityKey = (identity: string): Promise<string> =>
  sha256(identity);
