import test from "node:test";
import assert from "node:assert/strict";
import { adaptDiscoverySourcesToInput, validateDiscoveryAdapterSources } from "../lib/intelligence/discovery-source-adapter.ts";

test("adaptDiscoverySourcesToInput converts external and data moat sources to DiscoveryInput evidence inputs", () => {
  const input = adaptDiscoverySourcesToInput({
    externalSources: [
      {
        title: "Manual client reporting is slow",
        url: "https://example.com/reporting",
        snippet: "Agencies still copy client updates into spreadsheets every Friday.",
        raw_text: "Agencies still copy client updates into spreadsheets every Friday.",
        source_type: "google_search",
        source_rank: 1,
        signal_score: 12.5,
        category: "Operations",
      },
    ],
    moatSources: [
      {
        title: "Data Moat Problem: Client reporting",
        url: null,
        snippet: "Known problem. Intelligence score: 82.",
        source_type: "data_moat",
        source_rank: 1,
        signal_score: 82,
        category: "Data Moat",
      },
    ],
    market: "agency operations",
    audience: "small agencies",
    region: "US",
    id: "discovery-test",
  });

  assert.equal(input.id, "discovery-test");
  assert.equal(input.sources?.length, 2);
  assert.equal(input.sources?.[0].sourceType, "external_source");
  assert.equal(input.sources?.[1].sourceType, "data_moat");
  assert.equal(input.sources?.[0].market, "agency operations");
  assert.equal(input.sources?.[0].audience, "small agencies");
  assert.equal(input.sources?.[0].sourceUrl, "https://example.com/reporting");
  assert.equal(input.sources?.[0].nicheCategory, "Operations");
  assert.equal(input.sources?.[0].provenance?.capturedBy, "discovery_source_adapter");
  assert.equal(input.sources?.[0].provenance?.raw?.source_type, "google_search");
  assert.equal(input.sources?.[0].provenance?.raw?.signal_score, 12.5);
  assert.equal(input.sources?.[0].provenance?.raw?.region, "US");
  assert.equal(input.context?.externalSourceCount, 1);
  assert.equal(input.context?.dataMoatSourceCount, 1);
});

test("validateDiscoveryAdapterSources removes sources without title, snippet, or raw text", () => {
  const sources = validateDiscoveryAdapterSources([
    {
      title: "",
      url: null,
      snippet: null,
      source_type: "x",
      source_rank: 1,
    },
    {
      title: "Useful signal",
      url: null,
      snippet: null,
      source_type: "x",
      source_rank: 2,
    },
  ]);

  assert.equal(sources.length, 1);
  assert.equal(sources[0].title, "Useful signal");
});
