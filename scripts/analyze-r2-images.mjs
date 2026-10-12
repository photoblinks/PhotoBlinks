import { ListObjectsV2Command, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "dotenv";
import { writeFileSync } from "node:fs";

config({ path: "C:/Users/shubi/OneDrive/Desktop/PhotoBlinks/.env.local" });

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error("Missing R2 environment variables");
  process.exit(1);
}

const r2Client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function fetchAllObjects() {
  const allObjects = [];
  let continuationToken = undefined;
  
  do {
    const command = new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      MaxKeys: 1000,
      ContinuationToken: continuationToken,
    });
    
    const response = await r2Client.send(command);
    if (response.Contents) {
      allObjects.push(...response.Contents.map(obj => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
        etag: obj.ETag,
      })));
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    console.log(`Fetched ${allObjects.length} objects so far...`);
  } while (continuationToken);
  
  return allObjects;
}

async function fetchImageDimensions(key) {
  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Range: "bytes=0-2047", // First 2KB should be enough for headers
    });
    const response = await r2Client.send(command);
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return parseImageDimensions(buffer);
  } catch (error) {
    console.error(`Failed to fetch dimensions for ${key}:`, error.message);
    return null;
  }
}

function parseImageDimensions(buffer) {
  if (buffer.length < 24) return null;
  
  // PNG signature
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }
  
  // JPEG SOI
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let i = 2;
    const len = buffer.length;
    while (i + 4 <= len) {
      if (buffer[i] !== 0xff) {
        i++;
        continue;
      }
      if (buffer[i + 1] === 0xff) {
        i++;
        continue;
      }
      const marker = buffer[i + 1];
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      if (i + 4 > len) return null;
      const segLen = buffer.readUInt16BE(i + 2);
      if (segLen < 2) return null;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        if (i + 9 > len) return null;
        const height = buffer.readUInt16BE(i + 5);
        const width = buffer.readUInt16BE(i + 7);
        return { width, height };
      }
      i += 2 + segLen;
    }
    return null;
  }
  
  // WebP RIFF....WEBP
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    const fourcc = buffer.toString('ascii', 12, 16);
    if (fourcc === "VP8X" && buffer.length >= 30) {
      const width = buffer.readUIntLE(24, 3) + 1;
      const height = buffer.readUIntLE(27, 3) + 1;
      return { width, height };
    }
    if (fourcc === "VP8 " && buffer.length >= 30) {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      return { width, height };
    }
    if (fourcc === "VP8L" && buffer.length >= 26) {
      const width = (buffer[21] | (buffer[22] << 8) | ((buffer[23] & 0x3f) << 16)) + 1;
      const height = (((buffer[23] >> 6) & 0x3) | (buffer[24] << 2) | ((buffer[25] & 0x0f) << 10)) + 1;
      return { width, height };
    }
    return null;
  }
  
  return null;
}

async function main() {
  console.log("Fetching all objects from R2 bucket...");
  const objects = await fetchAllObjects();
  
  const images = objects.filter(obj => 
    obj.key && (obj.key.endsWith('.jpg') || obj.key.endsWith('.jpeg') || obj.key.endsWith('.png') || obj.key.endsWith('.webp'))
  );
  
  console.log(`\nTotal objects: ${objects.length}`);
  console.log(`Image objects: ${images.length}`);
  
  // Group by prefix
  const byPrefix = {};
  for (const img of images) {
    const prefix = img.key.split('/')[0];
    if (!byPrefix[prefix]) byPrefix[prefix] = [];
    byPrefix[prefix].push(img);
  }
  
  console.log("\nImages by prefix:");
  for (const [prefix, imgs] of Object.entries(byPrefix)) {
    console.log(`  ${prefix}: ${imgs.length} images`);
  }
  
  // Sample some images for dimension analysis
  console.log("\nSampling dimensions for up to 50 images...");
  const sampleSize = Math.min(50, images.length);
  const sampled = images.sort(() => Math.random() - 0.5).slice(0, sampleSize);
  
  const dimensions = [];
  for (const img of sampled) {
    const dims = await fetchImageDimensions(img.key);
    if (dims) {
      dimensions.push({
        key: img.key,
        size: img.size,
        width: dims.width,
        height: dims.height,
        megapixels: (dims.width * dims.height) / 1_000_000,
      });
    }
  }
  
  console.log(`\nSuccessfully got dimensions for ${dimensions.length} images`);
  
  // Analyze dimensions
  const mpValues = dimensions.map(d => d.megapixels).sort((a, b) => a - b);
  const total = mpValues.length;
  
  if (total > 0) {
    console.log("\n=== Dimension Analysis ===");
    console.log(`Total sampled: ${total}`);
    console.log(`Min MP: ${mpValues[0].toFixed(2)}`);
    console.log(`Max MP: ${mpValues[total - 1].toFixed(2)}`);
    console.log(`Median MP: ${mpValues[Math.floor(total / 2)].toFixed(2)}`);
    
    const thresholds = [16, 24, 48, 50];
    for (const t of thresholds) {
      const count = mpValues.filter(v => v >= t).length;
      const pct = ((count / total) * 100).toFixed(1);
      console.log(`>= ${t} MP: ${count} (${pct}%)`);
    }
    
    const under16 = mpValues.filter(v => v < 16).length;
    console.log(`< 16 MP: ${under16} (${((under16 / total) * 100).toFixed(1)}%)`);
    
    console.log("\nTop 10 largest by MP:");
    dimensions
      .sort((a, b) => b.megapixels - a.megapixels)
      .slice(0, 10)
      .forEach(d => console.log(`  ${d.key}: ${d.width}x${d.height} (${d.megapixels.toFixed(2)} MP, ${d.size} bytes)`));
  }
  
  // Save full object list for reference
  writeFileSync("r2-objects.json", JSON.stringify(objects, null, 2));
  console.log("\nFull object list saved to r2-objects.json");
}

main().catch(console.error);