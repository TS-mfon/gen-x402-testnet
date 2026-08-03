import {describe,expect,it} from "vitest";
import {requestSchema,resolvePlan} from "@/lib/domain";
describe("pricing",()=>{it("uses fixed testnet product plans",()=>{const input=requestSchema.parse({product:"decision",task:"Should this agent approve the vendor payment?",clientRequestId:"request-12345678"});expect(resolvePlan(input).amountAtomic).toBe("10000");expect(resolvePlan(input).upstreamBudgetAtomic).toBe("500000")});it("rejects short tasks",()=>{expect(requestSchema.safeParse({product:"gateway",task:"short",clientRequestId:"request-12345678"}).success).toBe(false)})});
