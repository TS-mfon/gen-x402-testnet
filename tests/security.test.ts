import {describe,expect,it} from "vitest";
import {assertSafeRemoteUrl} from "@/lib/security";
describe("remote URL policy",()=>{it.each(["http://127.0.0.1/a","http://10.1.2.3","http://192.168.1.4","http://169.254.169.254/latest"])("blocks %s",url=>expect(()=>assertSafeRemoteUrl(url)).toThrow());it("allows public https",()=>expect(assertSafeRemoteUrl("https://example.com/api").hostname).toBe("example.com"))});
