// One-off: sets CORS rules on the R2 bucket so the admin's browser can PUT
// image uploads directly to it via presigned URLs. Re-run if the site's
// production domain changes.
//
// Usage: node --env-file=.env.local scripts/configure-r2-cors.mjs
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

await r2Client.send(
  new PutBucketCorsCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: ["http://localhost:3000", process.env.NEXT_PUBLIC_SITE_URL],
          AllowedMethods: ["PUT", "GET"],
          AllowedHeaders: ["*"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);

console.log("R2 CORS configured for: http://localhost:3000,", process.env.NEXT_PUBLIC_SITE_URL);
