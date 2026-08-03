import { env } from "@/lib/env";
export function authorized(request:Request){if(!env.CRON_SECRET)return process.env.NODE_ENV!=="production";return request.headers.get("authorization")===`Bearer ${env.CRON_SECRET}`;}
