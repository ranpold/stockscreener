import type { RawFundamentals } from "../quant/fundamental";

export interface OHLCVBar {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap?: number;
  name?: string;
  instrumentType?: string; // "EQUITY" | "ETF" | ...
}

export interface Profile {
  ticker: string;
  name: string;
  sector?: string;
  industry?: string;
  exchange?: string;
}

export type Range = "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y";

export interface DataProvider {
  name: string;
  getQuote(ticker: string): Promise<Quote | null>;
  getOHLCV(ticker: string, range: Range): Promise<OHLCVBar[]>;
  getFundamentals(ticker: string): Promise<RawFundamentals | null>;
  getProfile(ticker: string): Promise<Profile | null>;
}
