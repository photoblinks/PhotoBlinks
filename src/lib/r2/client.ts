import { S3Client } from "@aws-sdk/client-s3";

// Cloudflare R2 is S3-compatible; this client just points at the account's
// R2 endpoint instead of AWS. Server-only (uses the R2 secret key).
export const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;
