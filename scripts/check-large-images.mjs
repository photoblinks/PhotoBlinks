import { config } from 'dotenv';
config({ path: 'C:/Users/shubi/OneDrive/Desktop/PhotoBlinks/.env.local' });
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

async function getDims(key) {
  const cmd = new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Range: 'bytes=0-2047' });
  const res = await r2Client.send(cmd);
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function parse(buf) {
  if (buf.length < 24) return null;
  if (buf[0]===0x89&&buf[1]===0x50&&buf[2]===0x4e&&buf[3]===0x47&&buf[4]===0x0d&&buf[5]===0x0a&&buf[6]===0x1a&&buf[7]===0x0a) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf[0]===0xff&&buf[1]===0xd8) {
    let i=2, len=buf.length;
    while (i+4<=len) {
      if (buf[i]!==0xff) { i++; continue; }
      if (buf[i+1]===0xff) { i++; continue; }
      const m=buf[i+1];
      if (m===0xd8||m===0xd9||m===0x01||(m>=0xd0&&m<=0xd7)) { i+=2; continue; }
      if (i+4>len) return null;
      const sl=buf.readUInt16BE(i+2);
      if (sl<2) return null;
      if (m>=0xc0&&m<=0xcf&&m!==0xc4&&m!==0xc8&&m!==0xcc) {
        if (i+9>len) return null;
        return { w: buf.readUInt16BE(i+7), h: buf.readUInt16BE(i+5) };
      }
      i+=2+sl;
    }
    return null;
  }
  if (buf[0]===0x52&&buf[1]===0x49&&buf[2]===0x46&&buf[3]===0x46&&buf[8]===0x57&&buf[9]===0x45&&buf[10]===0x42&&buf[11]===0x50) {
    const f=buf.toString('ascii',12,16);
    if (f==='VP8X'&&buf.length>=30) return { w: buf.readUIntLE(24,3)+1, h: buf.readUIntLE(27,3)+1 };
    if (f==='VP8 '&&buf.length>=30) return { w: (buf.readUInt16LE(26)&0x3fff), h: (buf.readUInt16LE(28)&0x3fff) };
    if (f==='VP8L'&&buf.length>=26) {
      const w=(buf[21]|(buf[22]<<8)|((buf[23]&0x3f)<<16))+1;
      const h=(((buf[23]>>6)&0x3)|(buf[24]<<2)|((buf[25]&0x0f)<<10))+1;
      return { w, h };
    }
    return null;
  }
  return null;
}

const keys = [
  'locations/abbey-falls-coorg/1787665560536-Abbey_Falls_New.jpg',
  'locations/bangalore-palace/1787753405628-Screenshot 2026-08-26 193933.png',
  'locations/badami-agastya-lake-bhutanatha-outer/1788197923178-7th_to_8th_century_Bhutanatha_temple,_Badami_Karnataka_2.jpg',
  'locations/albert-hall-museum-exterior-grounds/1791269482804-Albert_Hall_(_Jaipur_).jpg',
  'locations/melukote-raya-gopura-kalyani/1790332686992-0c6f2413-5aa6-4d94-a50b-e8d3d77b7a60.jpg',
  'locations/athirappilly-waterfalls/1790697897154-The_View_of_the_Athirapally_Falls_during_the_onset_of_Monsoon.jpg',
  'locations/abbey-falls-coorg/1787662275412-5933dedf-2452-4ce6-ab3a-3d2bb5a8e979 (1).png',
  'locations/chikmagalur-private-tea-estates/1788198694516-1718906706199_samse tea estate.jpg',
];

for (const k of keys) {
  try {
    const buf = await getDims(k);
    const d = parse(buf);
    if (d) console.log(k + ': ' + d.w + 'x' + d.h + ' = ' + (d.w*d.h/1e6).toFixed(2) + ' MP');
    else console.log(k + ': failed to parse');
  } catch(e) { console.log(k + ': ' + e.message); }
}