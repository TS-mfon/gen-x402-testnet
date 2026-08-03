import {describe,expect,it} from "vitest";
import {requestSchema,resolvePlan} from "@/lib/domain";
import {createJob,getJob} from "@/lib/store";
import {runJobToCompletion} from "@/lib/processor";
describe("database-free jobs",()=>{it("is idempotent and reaches a verdict",async()=>{const input=requestSchema.parse({product:"decision",task:"Should this agent approve the known vendor payment?",clientRequestId:"request-idempotent-123"});const plan=resolvePlan(input);const first=await createJob(input,plan,"same-key");const second=await createJob(input,plan,"same-key");expect(second.id).toBe(first.id);await runJobToCompletion(first.id);expect((await getJob(first.id))?.status).toBe("response_ready")})});
