"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@/components/wallet-context";
import { jsonStringify } from "@/lib/hash";

type Product = "gateway" | "investigation" | "procurement" | "decision" | "quality";
type Props = { title: string; description: string; endpoint: string; product: Product; productLabel: string; examples: string[] };

function JsonView({ value }: { value: unknown }) {
  return <pre className="output-json">{jsonStringify(value, 2)}</pre>;
}

function RenderedResult({ result }: { result: any }) {
  const verdict = result?.verdict;
  const evidence = result?.evidence?.records ?? [];
  if (!verdict) return <div className="empty-output"><b>{String(result?.job?.status ?? result?.status ?? "WAITING").replaceAll("_", " ")}</b><p>The protocol is collecting two paid provider responses and waiting for GenLayer consensus.</p></div>;
  return <div className="rendered-output">
    <div className="decision-line"><span>FINAL DECISION</span><b>{String(verdict.decision).replaceAll("_", " ")}</b><em>{verdict.confidence}% confidence</em></div>
    <p className="decision-summary">{verdict.combinedAnalysis ?? verdict.summary}</p>
    <div className="result-grid"><div><span>SCORE</span><b>{verdict.score}</b></div><div><span>SOURCES</span><b>{evidence.length}</b></div><div><span>GENLAYER</span><b>{verdict.genlayerTransaction ? "FINALIZED" : "PENDING"}</b></div></div>
    {verdict.agreements?.length > 0 && <section><h3>Agreements</h3><ul>{verdict.agreements.map((item: string) => <li key={item}>{item}</li>)}</ul></section>}
    {verdict.conflicts?.length > 0 && <section><h3>Conflicts</h3><ul>{verdict.conflicts.map((item: string) => <li key={item}>{item}</li>)}</ul></section>}
    <section><h3>Provider comparison</h3>{evidence.map((record: any) => <article className="provider-result" key={record.providerId}><div><b>{record.providerName}</b><span>{record.providerCategory}</span></div><p>{record.recommendation ?? record.claims?.[0]?.statement ?? "No concise recommendation supplied."}</p><small>{record.confidence}% provider confidence</small></article>)}</section>
  </div>;
}

export function RequestWorkbench({ title, description, endpoint, product, productLabel, examples }: Props) {
  const { address, connect, paidFetch } = useWallet();
  const [task, setTask] = useState(examples[0]);
  const [subject, setSubject] = useState("");
  const [criteria, setCriteria] = useState("");
  const [requestId, setRequestId] = useState("");
  const [quote, setQuote] = useState<any>(null);
  const [jobId, setJobId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [view, setView] = useState<"rendered" | "json">("rendered");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"quote" | "pay" | "">("");

  const payload = useMemo(() => ({ product, task, subject: { address: subject || undefined }, context: { source: "gen-x402-dashboard" }, acceptanceCriteria: criteria.split("\n").map(item => item.trim()).filter(Boolean), riskLevel: "medium", clientRequestId: requestId }), [criteria, product, requestId, subject, task]);

  function resetQuote() { setQuote(null); setJobId(""); setResult(null); setRequestId(""); }

  async function simulate() {
    setLoading("quote"); setError(""); setResult(null); setJobId("");
    const clientRequestId = crypto.randomUUID();
    setRequestId(clientRequestId);
    try {
      const response = await fetch("/api/v1/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, clientRequestId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? body.error ?? "Simulation failed");
      setQuote({ ...body.quote, executionAvailable: body.executionAvailable, executionStatus: body.executionStatus, warning: body.warning });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Simulation failed"); }
    finally { setLoading(""); }
  }

  async function payAndExecute() {
    if (!quote) return;
    setLoading("pay"); setError("");
    try {
      if (!address) { const connected = await connect(); if (!connected) throw new Error("Connect a wallet to authorize the quoted USDC payment."); }
      const response = await paidFetch(`${endpoint}?quoteId=${encodeURIComponent(quote.id)}`, { method: "POST", headers: { "content-type": "application/json", "x-quote-id": quote.id }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? body.error ?? "Paid request failed");
      setJobId(body.jobId); setResult(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Payment request failed"); }
    finally { setLoading(""); }
  }

  useEffect(() => { if (!jobId) return; const timer = setInterval(async () => { const response = await fetch(`/api/v1/jobs/${jobId}`); if (!response.ok) return; const body = await response.json(); setResult(body); if (["response_ready", "failed", "refunded"].includes(body.job?.status)) clearInterval(timer); }, 1800); return () => clearInterval(timer); }, [jobId]);

  return <main className="section workbench"><div className="phase-line"><span>DECISION CHANNEL</span><i />{productLabel.toUpperCase()} / QUOTE-FIRST</div><div className="workbench-head"><div><span className="eyebrow">PAY FOR DECISIONS · MINIMUM 1 USDC</span><h1>{title}</h1><p>{description}</p></div><div className="module-readout"><span>NETWORK</span><b>BASE SEPOLIA</b><span>ROUTING</span><b>2 LIVE PROVIDERS</b><span>CONSENSUS</span><b>GENLAYER STUDIONET</b><span>PRICING</span><b>60 / 30 / 10</b></div></div>
    <div className="formLayout"><section className="terminal-card"><div className="terminal-top"><span>REQUEST CONSOLE</span><span>{quote ? "QUOTE READY" : "SIMULATION REQUIRED"}</span></div><div className="field"><label>01 / TASK OR QUESTION</label><textarea value={task} onChange={event => { setTask(event.target.value); resetQuote(); }} /></div><div className="field"><label>02 / SUBJECT ADDRESS (OPTIONAL)</label><input value={subject} onChange={event => { setSubject(event.target.value); resetQuote(); }} placeholder="0x..." /></div>{product === "quality" && <div className="field"><label>03 / ACCEPTANCE CRITERIA</label><textarea value={criteria} onChange={event => { setCriteria(event.target.value); resetQuote(); }} placeholder="One criterion per line" /></div>}
      {!quote ? <div className="execute-row"><button className="tech-button primary-action" onClick={simulate} disabled={loading !== "" || task.length < 10}>{loading === "quote" ? "CHECKING LIVE PROVIDERS" : "SIMULATE REQUEST"}</button><span>NO PAYMENT · LIVE PRICE CHECK</span></div> : <div className="quote-panel"><div className="quote-total"><span>EXACT CUSTOMER PAYMENT</span><b>{quote.customerPriceUsdc} USDC</b><em>Expires {new Date(quote.expiresAt).toLocaleTimeString()}</em></div><div className="allocation-grid"><div><span>PROVIDERS</span><b>{(Number(quote.providerCostAtomic) / 1e6).toFixed(4)}</b></div><div><span>MAX OPS</span><b>{(Number(quote.operationalBudgetAtomic) / 1e6).toFixed(4)}</b></div><div><span>GENLAYER</span><b>{(Number(quote.genlayerReserveAtomic) / 1e6).toFixed(4)}</b></div><div><span>RESERVE</span><b>{(Number(quote.revenueReserveAtomic) / 1e6).toFixed(4)}</b></div></div><div className="quoted-providers">{quote.providers.map((provider: any, index: number) => <div key={provider.id}><span>0{index + 1}</span><b>{provider.name}</b><em>{provider.category} · {(Number(provider.priceAtomic) / 1e6).toFixed(4)} USDC</em></div>)}</div>{quote.warning&&<div className="notice error">{quote.warning}</div>}<div className="execute-row"><button className="tech-button primary-action" onClick={payAndExecute} disabled={loading !== ""||quote.executionAvailable===false}>{quote.executionAvailable===false?"EXECUTION TEMPORARILY DISABLED":loading === "pay" ? "AUTHORIZING PAYMENT" : address ? `PAY ${quote.customerPriceUsdc} USDC & EXECUTE` : "CONNECT WALLET & PAY"}</button><button className="tech-button" onClick={simulate} disabled={loading !== ""}>REFRESH QUOTE</button></div></div>}{error && <div className="notice error">{error}</div>}</section>
      <aside className="telemetry-card"><div className="terminal-top"><span>DECISION OUTPUT</span><span className="live-dot">● LIVE</span></div><div className="telemetry-steps"><div className={`telemetry-step ${quote ? "active" : ""}`}><b>01</b><span>Provider simulation</span><em>{quote ? "VERIFIED" : "WAITING"}</em></div><div className={`telemetry-step ${jobId ? "active" : ""}`}><b>02</b><span>Treasury settlement</span><em>{jobId ? "PAID" : "LOCKED"}</em></div><div className={`telemetry-step ${result?.evidence ? "active" : ""}`}><b>03</b><span>Two-source evidence</span><em>{result?.evidence?.count ? `${result.evidence.count} SOURCES` : "PENDING"}</em></div><div className={`telemetry-step ${result?.verdict ? "active" : ""}`}><b>04</b><span>GenLayer synthesis</span><em>{result?.verdict ? "FINAL" : "PENDING"}</em></div></div>{result && <div className="result-window"><div className="output-tabs"><span>JOB OUTPUT</span><div><button className={view === "rendered" ? "active" : ""} onClick={() => setView("rendered")}>RENDERED</button><button className={view === "json" ? "active" : ""} onClick={() => setView("json")}>JSON</button></div></div>{view === "rendered" ? <RenderedResult result={result} /> : <JsonView value={result} />}</div>}</aside></div>
    <div className="example-strip"><span>QUICK LOAD</span>{examples.map(example => <button key={example} onClick={() => { setTask(example); resetQuote(); }}>{example}</button>)}</div></main>;
}
