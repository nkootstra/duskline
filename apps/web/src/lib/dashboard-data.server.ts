import { Schema } from "effect";
import {
  CurrentDataset,
  SourceStatusDataset,
  buildLifecycleNotices,
} from "@duskline/lifecycle";
import current from "../../../../data/current.json";
import sourceStatus from "../../../../data/source-status.json";

const decodedCurrent = Schema.decodeUnknownSync(CurrentDataset)(current);
const decodedSourceStatus =
  Schema.decodeUnknownSync(SourceStatusDataset)(sourceStatus);

export const loadDashboardData = () => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    lastPublishedAt: decodedCurrent.last_published_at,
    notices: buildLifecycleNotices(decodedCurrent.records, today),
    sourceStatus: decodedSourceStatus,
  };
};
