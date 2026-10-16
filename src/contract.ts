// File: /src/contract.ts | Version: 0.3.1
import semver from 'semver';
import { z } from 'zod';

export const slug = z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const version = z.string().max(96).refine(
  (value) => semver.valid(value) === value && !value.includes('+'),
  'Use canonical SemVer without build metadata',
);
export const targetSchema = z.strictObject({
  device_type: slug,
  os: slug,
  architecture: slug,
  hardware_revision: slug,
  updater_protocol: z.literal(1),
});
export const productSchema = z.strictObject({
  id: slug,
  name: z.string().trim().min(1).max(100),
});
export const draftSchema = z.strictObject({
  product: slug,
  version,
  channel: slug,
  release_notes: z.string().max(16000).default(''),
  targets: z.array(targetSchema).min(1).max(32),
});
export const checkSchema = z.strictObject({
  product: slug,
  current_version: version,
  channel: slug,
  target: targetSchema,
});
export const fileNameSchema = z.string().min(1).max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
  .refine((value) => !value.includes('..') && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(value), 'Unsafe filename');
export const artifactSchema = z.strictObject({
  id: z.uuid(),
  filename: fileNameSchema,
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const manifestInputSchema = z.strictObject({
  schema_version: z.literal('1'),
  artifact_order: z.array(z.uuid()).min(1).max(32)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate artifact ID'),
});
export const publishedManifestSchema = z.strictObject({
  schema_version: z.literal('1'),
  release_id: z.uuid(),
  product: slug,
  version,
  channel: slug,
  targets: z.array(targetSchema).min(1).max(32),
  published_at: z.iso.datetime(),
  artifacts: z.array(artifactSchema.extend({
    required: z.literal(true),
    download_url: z.string(),
  }).refine((artifact) => artifact.download_url === `/api/v1/artifacts/${artifact.id}/download`, 'Invalid artifact URL'))
    .min(1).max(32)
    .refine((artifacts) => new Set(artifacts.map((artifact) => artifact.id)).size === artifacts.length, 'Duplicate artifact ID')
    .refine((artifacts) => new Set(artifacts.map((artifact) => artifact.filename.toLowerCase())).size === artifacts.length, 'Ambiguous artifact filenames'),
});
export const checkResultSchema = z.discriminatedUnion('update_available', [
  z.strictObject({ update_available: z.literal(false), reason: z.literal('no_eligible_update') }),
  z.strictObject({ update_available: z.literal(true), release: z.strictObject({
    id: z.uuid(), product: slug, version, channel: slug, release_notes: z.string().max(16000), manifest_url: z.string(),
  }).refine((release) => release.manifest_url === `/api/v1/releases/${release.id}/manifest`, 'Invalid manifest URL') }),
]);
export type PublishedManifest = z.infer<typeof publishedManifestSchema>;
export const adminSettingsSchema = z.strictObject({
  upload_max_bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  upload_timeout_seconds: z.number().int().min(1).max(86400),
});
export type AdminSettings = z.infer<typeof adminSettingsSchema>;
export type CheckResult = z.infer<typeof checkResultSchema>;
export type Target = z.infer<typeof targetSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type ManifestInput = z.infer<typeof manifestInputSchema>;
export type Check = z.infer<typeof checkSchema>;
export type Release = Draft & {
  id: string;
  status: 'draft' | 'published' | 'withdrawn';
  created_at: string;
  published_at: string | null;
  artifacts: Artifact[];
  manifest: ManifestInput | null;
};
export type Principal = { id: string; role: 'admin' | 'publisher' | 'reader'; products: string[] };

export function permits(principal: Principal, product: string): boolean {
  return principal.role === 'admin' || principal.products.includes(product);
}

export function sameTarget(left: Target, right: Target): boolean {
  return left.device_type === right.device_type && left.os === right.os
    && left.architecture === right.architecture && left.hardware_revision === right.hardware_revision
    && left.updater_protocol === right.updater_protocol;
}

export function selectRelease(releases: Release[], check: Check, principal: Principal): Release | undefined {
  if (!permits(principal, check.product)) return undefined;
  return releases.filter((release) => release.status === 'published'
    && release.product === check.product && release.channel === check.channel
    && (check.channel !== 'stable' || semver.prerelease(release.version) === null)
    && release.targets.some((target) => sameTarget(target, check.target))
    && semver.gt(release.version, check.current_version))
    .sort((left, right) => semver.rcompare(left.version, right.version))[0];
}