import { Effect, Schema } from "effect";
import {
  NonEmptyString,
  SourceId,
  type LifecycleRecord,
  type Platform,
  type Provider,
} from "@duskline/lifecycle";

export interface SourceDefinition {
  readonly id: SourceId;
  readonly provider: Provider;
  readonly platform: Platform;
  readonly label: string;
  readonly scope: string;
  readonly url: string;
}

export interface SourceSuccess {
  readonly _tag: "SourceSuccess";
  readonly source: SourceDefinition;
  readonly records: ReadonlyArray<LifecycleRecord>;
  readonly contentHash: string;
  readonly observedAt: string;
}

export class SourceFailure extends Schema.TaggedErrorClass<SourceFailure>()(
  "SourceFailure",
  {
    source_id: SourceId,
    code: NonEmptyString,
    message: NonEmptyString,
    retryable: Schema.Boolean,
  },
) {}

export interface CollectContext {
  readonly observedAt: string;
  readonly signal?: AbortSignal;
}

export type SourceCollector = (
  context: CollectContext,
) => Effect.Effect<SourceSuccess, SourceFailure>;

export interface SourceRegistryEntry {
  readonly source: SourceDefinition;
  readonly collect: SourceCollector;
}
