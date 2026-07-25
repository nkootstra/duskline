import { Schema } from "effect";
import {
  ChangeHistory,
  CheckStatusDataset,
  CurrentDataset,
  buildLifecycleEntries,
  buildLifecycleNotices,
} from "@duskline/lifecycle";
import changes from "../../../../data/changes.json";
import checks from "../../../../data/check-status.json";
import current from "../../../../data/current.json";
import {
  buildLifecycleEntryIndex,
  buildModelPassportByKey,
  buildSourceCoverage,
  verificationSummary,
} from "./trust-data";

const decodedCurrent = Schema.decodeUnknownSync(CurrentDataset)(current);
const decodedChanges = Schema.decodeUnknownSync(ChangeHistory)(changes);
const decodedChecks = Schema.decodeUnknownSync(CheckStatusDataset)(checks);
const latestLifecycleChangeAt =
  decodedChanges.events
    .map((event) => event.published_at)
    .sort()
    .at(-1) ?? null;

let indexedDate: string | null = null;
let indexedEntries: ReturnType<typeof buildLifecycleEntryIndex> | null = null;

const loadLifecycleEntryIndex = (today: string) => {
  if (indexedDate !== today || !indexedEntries) {
    indexedDate = today;
    indexedEntries = buildLifecycleEntryIndex(
      buildLifecycleEntries(decodedCurrent.records, today),
    );
  }
  return indexedEntries;
};

export const loadDashboardData = async () => {
  const today = new Date().toISOString().slice(0, 10);
  const entries = await loadLifecycleEntryIndex(today);
  const notices = buildLifecycleNotices(decodedCurrent.records, today).map(
    (notice) => {
      const passportId = entries.keyByIdentity.get(notice.identity);
      if (!passportId) {
        throw new Error(`Missing passport identity: ${notice.identity}`);
      }
      return { ...notice, passport_id: passportId };
    },
  );
  return {
    notices,
    verification: verificationSummary(
      decodedChecks,
      latestLifecycleChangeAt,
      today,
    ),
  };
};

export const loadSourceCoverageData = () => ({
  checks: decodedChecks,
  sources: buildSourceCoverage(decodedChecks, decodedCurrent),
});

export const loadModelPassportData = async (identityKey: string) => {
  const today = new Date().toISOString().slice(0, 10);
  return buildModelPassportByKey(
    identityKey,
    decodedCurrent,
    decodedChanges,
    decodedChecks,
    today,
    await loadLifecycleEntryIndex(today),
  );
};
