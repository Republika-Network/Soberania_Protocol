import type { StoragePointer } from '../storage/types';
import type { SubjectConsentProofV1 } from '../consent/proof';

export type FieldReference = {
  field_id: string;
  content_id: string;
  storage: StoragePointer;
  bytes: number;
};

export type PackManifestV1 = {
  version: string;
  subject: string;
  created_at: number;
  fields: FieldReference[];
  pack_hash: string;
  /**
   * The subject's detached proof over the manifest (pack/signing.ts). Not part of
   * the canonical payload. A pack without it names an owner nobody vouched for
   * and is refused by the vault.
   */
  subject_proof?: SubjectConsentProofV1;
};

export type BuildPackOptions = {
  now?: Date;
};
