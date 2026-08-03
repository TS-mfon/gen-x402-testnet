import { productHandler } from "@/lib/api";
import { paidRoute } from "@/lib/x402";
import { pricePlans } from "@/lib/domain";
export const maxDuration=60;
export const POST=paidRoute(productHandler("decision"),pricePlans.quick,"Purchase a machine-readable crypto decision");
