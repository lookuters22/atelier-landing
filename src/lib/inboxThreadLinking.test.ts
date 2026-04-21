/**
 * Provenance: SQL RPCs must not wipe ai_routing_metadata; audit fields are append-only.
 * convert_unfiled_thread_to_inquiry uses FOR UPDATE before reading metadata (20260512).
 */
import { describe, expect, it } from "vitest";

const AUDIT_MIGRATION = "supabase/migrations/20260511000000_thread_routing_metadata_audit_history.sql";
const CONVERT_ROW_LOCK_MIGRATION =
  "supabase/migrations/20260512000000_convert_unfiled_thread_to_inquiry_row_lock.sql";

async function readMigration(relPath: string): Promise<string> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  return fs.readFile(path.resolve(process.cwd(), relPath), "utf-8");
}

describe("20260511000000_thread_routing_metadata_audit_history.sql", () => {
  it("link_thread_to_wedding: no metadata NULL; append-only manual_link_history + snapshot", async () => {
    const sql = await readMigration(AUDIT_MIGRATION);

    const linkFn = sql.match(
      /CREATE OR REPLACE FUNCTION public\.link_thread_to_wedding[\s\S]*?\$\$;/i,
    );
    expect(linkFn).toBeTruthy();
    const linkBody = linkFn![0];

    expect(linkBody).not.toMatch(/ai_routing_metadata\s*=\s*NULL/i);
    expect(linkBody).toMatch(/manual_link_history/);
    expect(linkBody).toMatch(/v_hist\s*:=\s*v_hist\s*\|\|\s*jsonb_build_array\s*\(\s*v_event\s*\)/);
    expect(linkBody).toMatch(/link_thread_to_wedding/);
    expect(linkBody).toMatch(/v_new_meta\s*:=\s*v_old_meta\s*\|\|/);
    expect(linkBody).toMatch(/FOR UPDATE/i);
  });

  it("link_thread_to_wedding: repeated links append via jsonb array concat (durable trail)", async () => {
    const sql = await readMigration(AUDIT_MIGRATION);
    expect(sql).toMatch(/jsonb_build_array\s*\(\s*v_event\s*\)/);
    expect(sql).toMatch(/manual_link_history/);
  });
});

describe("20260512000000_convert_unfiled_thread_to_inquiry_row_lock.sql", () => {
  it("preserves metadata, appends history, and does not NULL ai_routing_metadata", async () => {
    const sql = await readMigration(CONVERT_ROW_LOCK_MIGRATION);

    const convertFn = sql.match(
      /CREATE OR REPLACE FUNCTION public\.convert_unfiled_thread_to_inquiry[\s\S]*?\$\$;/i,
    );
    expect(convertFn).toBeTruthy();
    const convertBody = convertFn![0];

    expect(convertBody).not.toMatch(/ai_routing_metadata\s*=\s*NULL/i);
    expect(convertBody).toMatch(/converted_to_inquiry_history/);
    expect(convertBody).toMatch(/converted_to_inquiry/);
    expect(convertBody).toMatch(/v_conv_hist\s*:=\s*v_conv_hist\s*\|\|\s*jsonb_build_array/);
    expect(convertBody).toMatch(/v_new_meta\s*:=\s*v_old_meta\s*\|\|/);
    expect(convertBody).toMatch(/converted_at/);
    expect(convertBody).toMatch(/converted_by/);
  });

  it("locks the thread row before INSERT wedding and reads metadata under that lock", async () => {
    const sql = await readMigration(CONVERT_ROW_LOCK_MIGRATION);
    const convertFn = sql.match(
      /CREATE OR REPLACE FUNCTION public\.convert_unfiled_thread_to_inquiry[\s\S]*?\$\$;/i,
    );
    expect(convertFn).toBeTruthy();
    const body = convertFn![0];
    const idxForUpdate = body.search(/\bFOR UPDATE\b/i);
    const idxInsertWedding = body.search(/INSERT INTO public\.weddings/i);
    expect(idxForUpdate).toBeGreaterThan(-1);
    expect(idxInsertWedding).toBeGreaterThan(-1);
    expect(idxForUpdate).toBeLessThan(idxInsertWedding);
    expect(body).toMatch(
      /SELECT\s+t\.wedding_id\s*,\s*COALESCE\s*\(\s*t\.ai_routing_metadata[\s\S]*?\bFOR UPDATE\b/is,
    );
  });

  it("does not re-read ai_routing_metadata after wedding/client inserts (no last-write race)", async () => {
    const sql = await readMigration(CONVERT_ROW_LOCK_MIGRATION);
    const convertFn = sql.match(
      /CREATE OR REPLACE FUNCTION public\.convert_unfiled_thread_to_inquiry[\s\S]*?\$\$;/i,
    );
    expect(convertFn).toBeTruthy();
    const body = convertFn![0];
    const parts = body.split(/INSERT INTO public\.clients/i);
    expect(parts.length).toBeGreaterThan(1);
    const afterClients = parts[1] ?? "";
    expect(afterClients).not.toMatch(/SELECT\s+COALESCE\s*\(\s*t\.ai_routing_metadata/is);
  });
});

describe("historical migrations (superseded destructive behavior)", () => {
  it("legacy link RPC once cleared ai_routing_metadata", async () => {
    const sql = await readMigration("supabase/migrations/20260430140000_rpc_link_thread_to_wedding.sql");
    expect(sql).toMatch(/ai_routing_metadata\s*=\s*NULL/);
  });

  it("convert_unfiled_thread_to_inquiry in classifier guard migration still showed NULL wipe before 20260511", async () => {
    const sql = await readMigration(
      "supabase/migrations/20260507000000_inbound_suppression_classifier_and_convert_guard.sql",
    );
    expect(sql).toMatch(/ai_routing_metadata\s*=\s*NULL/);
  });
});
