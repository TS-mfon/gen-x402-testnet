import { NextResponse } from "next/server";
import { listProviders } from "@/lib/store";
export async function GET(){return NextResponse.json({providers:await listProviders(),policy:"Curated providers plus validated Bazaar discovery"});}
