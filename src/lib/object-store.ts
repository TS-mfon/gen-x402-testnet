import "server-only";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

export function objectStoreConfigured() {
  return Boolean(env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET_NAME);
}

function client() {
  if (!objectStoreConfigured()) throw new Error("object_store_not_configured");
  return new S3Client({ region: "auto", endpoint: env.R2_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! } });
}

export async function getObjectJson<T>(key: string): Promise<{ value: T; etag?: string } | null> {
  try {
    const result = await client().send(new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME!, Key: key }));
    if (!result.Body) return null;
    return { value: JSON.parse(await result.Body.transformToString()) as T, etag: result.ETag };
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
    if (name === "NoSuchKey" || name === "NotFound") return null;
    throw error;
  }
}

export async function putObjectJson(key: string, value: unknown, options: { etag?: string; createOnly?: boolean } = {}) {
  return client().send(new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME!, Key: key, Body: JSON.stringify(value), ContentType: "application/json", CacheControl: "no-store",
    ...(options.etag ? { IfMatch: options.etag } : {}), ...(options.createOnly ? { IfNoneMatch: "*" } : {}),
  }));
}

export async function listObjectKeys(prefix: string, limit = 1000) {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const result = await client().send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET_NAME!, Prefix: prefix, MaxKeys: Math.min(1000, limit - keys.length), ContinuationToken: continuationToken }));
    keys.push(...(result.Contents ?? []).flatMap(item => item.Key ? [item.Key] : []));
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken && keys.length < limit);
  return keys.slice(0, limit);
}
