// Curated large-cap universe for the default screen. Screening every name issues
// one provider call per ticker; a focused ~100-name list keeps a Worker request
// within CPU/time limits while staying representative across sectors.
export const SP500_SAMPLE: string[] = [
  // Mega-cap tech
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ORCL", "ADBE",
  "CRM", "AMD", "INTC", "CSCO", "QCOM", "TXN", "IBM", "NOW", "INTU", "AMAT",
  // Communication / media
  "NFLX", "DIS", "CMCSA", "T", "VZ", "TMUS",
  // Consumer
  "WMT", "COST", "HD", "NKE", "MCD", "SBUX", "TGT", "LOW", "PG", "KO",
  "PEP", "PM", "MDLZ", "CL", "EL",
  // Financials
  "JPM", "BAC", "WFC", "GS", "MS", "C", "AXP", "BLK", "SCHW", "SPGI",
  "V", "MA", "PYPL",
  // Healthcare
  "UNH", "JNJ", "LLY", "PFE", "MRK", "ABBV", "TMO", "ABT", "DHR", "BMY",
  "AMGN", "GILD", "CVS", "MDT",
  // Industrials
  "BA", "CAT", "GE", "HON", "UPS", "RTX", "LMT", "DE", "MMM", "UNP",
  // Energy
  "XOM", "CVX", "COP", "SLB", "EOG",
  // Consumer discretionary / other
  "BKNG", "ABNB", "UBER", "F", "GM",
  // Staples / utilities / materials / real estate
  "NEE", "DUK", "SO", "LIN", "APD", "SHW", "PLD", "AMT", "EQIX",
  // Misc large caps
  "BRK-B", "ACN", "QCOM",
];

// Deduped, in case of accidental repeats above.
export const SP500: string[] = Array.from(new Set(SP500_SAMPLE));
