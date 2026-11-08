import os
import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from data_generator import STOCKS_METADATA

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BACKEND_DIR, "data")
ROOT_DATA_DIR = os.path.join(os.path.dirname(BACKEND_DIR), "data")

def save_csv(df: pd.DataFrame, filename: str):
    """Saves dataframe to both backend/data and root data directories."""
    p1 = os.path.join(DATA_DIR, filename)
    df.to_csv(p1, index=False)
    if os.path.exists(ROOT_DATA_DIR) and os.path.abspath(ROOT_DATA_DIR) != os.path.abspath(DATA_DIR):
        try:
            p2 = os.path.join(ROOT_DATA_DIR, filename)
            df.to_csv(p2, index=False)
        except Exception:
            pass

# Ensure output directory exists
os.makedirs(DATA_DIR, exist_ok=True)

# Sector and index tickers on Yahoo Finance
SECTOR_TICKERS = {
    "Nifty50": "^NSEI",
    "Energy": "^CNXENERGY",
    "IT": "^CNXIT",
    "Banking": "^NSEBANK",
    "FMCG": "^CNXFMCG",
    "Auto": "^CNXAUTO",
    "Pharma": "^CNXPHARMA",
    "Metals": "^CNXMETAL",
    "Realty": "^CNXREALTY"
}

MACRO_TICKERS = {
    "SP500": "^GSPC",
    "NASDAQ": "^IXIC",
    "DJI": "^DJI",
    "DXY": "DX-Y.NYB",
    "US10Y": "^TNX",
    "India10Y": "IN10YT=RR",  # proxy or direct
    "USDINR": "INR=X",
    "CrudeOil": "CL=F",
    "WTICrude": "CL=F",
    "Gold": "GC=F",
    "Silver": "SI=F",
    "Copper": "HG=F",
    "VIX": "^VIX",
    "IndiaVIX": "^INDIAVIX"
}

def clean_and_align_dataframes(ticker_map: dict, period: str, csv_path: str = None) -> pd.DataFrame:
    # 1. Load existing data if available
    existing_df = None
    if csv_path and os.path.exists(csv_path):
        try:
            existing_df = pd.read_csv(csv_path)
            if "Date" in existing_df.columns:
                existing_df["Date"] = pd.to_datetime(existing_df["Date"])
                existing_df.set_index("Date", inplace=True)
                existing_df.index = existing_df.index.tz_localize(None)
            else:
                existing_df = None
        except Exception as e:
            print(f"Error loading existing CSV {csv_path}: {e}")
            existing_df = None

    # 2. Try to download each ticker
    downloaded_cols = {}
    new_dates = None
    for key, ticker in ticker_map.items():
        print(f"Downloading index: {key} ({ticker})...")
        try:
            hist = yf.Ticker(ticker).history(period=period)
            if hist.empty:
                print(f"Warning: No data returned for {ticker}")
                continue
                
            df_col = hist[["Close"]].copy()
            df_col.columns = [key]
            df_col.index = df_col.index.tz_localize(None)
            downloaded_cols[key] = df_col
            
            if new_dates is None:
                new_dates = df_col.index
            else:
                new_dates = new_dates.union(df_col.index)
        except Exception as e:
            print(f"Error downloading {ticker}: {str(e)}")

    # 3. Align and merge
    if new_dates is None:
        if existing_df is not None:
            merged_df = existing_df.reset_index()
            merged_df["Date"] = merged_df["Date"].dt.strftime("%Y-%m-%d")
            return merged_df
        else:
            return None

    all_dates = new_dates
    if existing_df is not None:
        all_dates = all_dates.union(existing_df.index)

    merged_df = pd.DataFrame(index=all_dates)

    for key, ticker in ticker_map.items():
        if key in downloaded_cols:
            merged_df[key] = downloaded_cols[key]
            if existing_df is not None and key in existing_df.columns:
                merged_df[key] = merged_df[key].combine_first(existing_df[key])
        else:
            if existing_df is not None and key in existing_df.columns:
                print(f"Using existing data for failed ticker {key}")
                merged_df[key] = existing_df[key]
            else:
                print(f"No existing data for {key}. Generating mock data...")
                np.random.seed(42)
                base = 1000.0 if "VIX" not in key else 15.0
                step = 0.01 if "VIX" not in key else 0.05
                returns = np.random.normal(0, step, len(all_dates))
                mock_prices = base * np.exp(np.cumsum(returns))
                merged_df[key] = mock_prices

    merged_df = merged_df.sort_index()
    merged_df = merged_df.ffill().bfill()
    merged_df = merged_df.reset_index()
    merged_df.rename(columns={"index": "Date"}, inplace=True)
    merged_df["Date"] = merged_df["Date"].dt.strftime("%Y-%m-%d")
    return merged_df

def sync_macro_indices(period: str = "1y"):
    print("\n--- Synchronizing Global Macro Indices ---")
    file_path = os.path.join(DATA_DIR, "macro_indices.csv")
    df = clean_and_align_dataframes(MACRO_TICKERS, period, csv_path=file_path)
    if df is not None:
        n_days = len(df)
        # Fallback for India10Y if missing
        if "India10Y" not in df.columns or df["India10Y"].isna().all():
            df["India10Y"] = 7.0 + np.random.normal(0, 0.05, n_days).cumsum() * 0.02
        if "WTICrude" not in df.columns or df["WTICrude"].isna().all():
            df["WTICrude"] = df["CrudeOil"] - 2.0 + np.random.normal(0, 0.2, n_days)
            
        # Add Economic Indicators (which aren't simple yfinance stock series)
        # We fill them using realistic base values and noise
        np.random.seed(42)
        df["IndiaCPI"] = 5.0 + np.sin(np.arange(n_days) / 20.0) * 0.5 + np.random.normal(0, 0.05, n_days)
        df["IndiaWPI"] = 3.0 + np.sin(np.arange(n_days) / 30.0) * 0.8 + np.random.normal(0, 0.08, n_days)
        df["IndiaGDP"] = 6.8 + np.random.normal(0, 0.1, n_days)
        df["IndiaIIP"] = 4.0 + np.random.normal(0, 0.3, n_days)
        df["IndiaPMI"] = np.clip(54.5 + np.random.normal(0, 0.4, n_days).cumsum() * 0.1, 48.0, 60.0)
        df["IndiaRepoRate"] = 6.25 * np.ones(n_days)
        
        df["USCPI"] = 2.5 + np.sin(np.arange(n_days) / 25.0) * 0.3 + np.random.normal(0, 0.03, n_days)
        df["USJobs"] = 200.0 + np.random.normal(0, 15.0, n_days).cumsum() * 0.5
        df["USFedRate"] = 5.25 * np.ones(n_days)
        df["USGDP"] = 2.1 + np.random.normal(0, 0.05, n_days)
        
        save_csv(df, "macro_indices.csv")
        print(f"Macro indices synchronized successfully: {len(df)} rows. Saved to {file_path}")
    else:
        print("Failed to synchronize macro indices.")

def sync_nifty_sectors(period: str = "1y"):
    print("\n--- Synchronizing Nifty Sector Indices ---")
    file_path = os.path.join(DATA_DIR, "nifty_sectors.csv")
    df = clean_and_align_dataframes(SECTOR_TICKERS, period, csv_path=file_path)
    if df is not None:
        save_csv(df, "nifty_sectors.csv")
        print(f"Nifty sectors synchronized successfully: {len(df)} rows. Saved to {file_path}")
    else:
        print("Failed to synchronize Nifty sectors.")

def _sync_single_stock(ticker: str, meta: dict, period: str):
    yf_symbol = f"{ticker}.NS"
    if ticker == "INFYS":
        yf_symbol = "INFY.NS"
    elif ticker == "TATAMOTORS":
        yf_symbol = "TMPV.NS"
    elif ticker == "MM":
        yf_symbol = "M&M.NS"
    elif ticker == "BAJAJ_AUTO":
        yf_symbol = "BAJAJ-AUTO.NS"

    try:
        hist = yf.Ticker(yf_symbol).history(period=period)
        if hist.empty:
            print(f"Warning: No data returned for {yf_symbol}")
            return
            
        df = hist.reset_index()
        df["Date"] = df["Date"].dt.tz_localize(None).dt.strftime("%Y-%m-%d")
        df = df[["Date", "Open", "High", "Low", "Close", "Volume"]].copy()
        
        n_rows = len(df)
        returns = df["Close"] / df["Open"] - 1.0
        
        # Augment with all the new indicators
        df["DeliveryPct"] = np.clip(50.0 - 80.0 * returns.abs() + np.random.normal(0, 5.0, n_rows), 15.0, 80.0)
        
        cum_ret = (df["Close"] / df["Close"].iloc[0]).fillna(1.0)
        df["FuturesOI"] = (1_000_000 * cum_ret * (1.0 + np.random.normal(0, 0.02, n_rows))).astype(int)
        
        df["FII_Flow"] = 500.0 * returns + np.random.normal(0, 50.0, n_rows)
        df["DII_Flow"] = -200.0 * returns + np.random.normal(0, 45.0, n_rows)
        df["MF_Flow"] = 400.0 * returns + np.random.normal(20.0, 15.0, n_rows)
        
        # SIP Flow steady upward trend
        df["SIP_Flow"] = 100.0 * (1.0 + 0.0002 * np.arange(n_rows)) + np.random.normal(0, 0.1, n_rows)
        
        # Shareholding (piecewise constant)
        prom_vals = np.ones(n_rows) * meta.get("promoter_pct", 50.0)
        fii_vals = np.ones(n_rows) * meta.get("fii_pct", 20.0) + np.random.normal(0, 0.1, n_rows).cumsum() * 0.02
        dii_vals = np.ones(n_rows) * meta.get("dii_pct", 15.0) + np.random.normal(0, 0.08, n_rows).cumsum() * 0.02
        
        # Constrain FII/DII percentages
        fii_vals = np.clip(fii_vals, 0.0, 90.0)
        dii_vals = np.clip(dii_vals, 0.0, 90.0)
        df["PromoterPct"] = prom_vals
        df["FiiPct"] = fii_vals
        df["DiiPct"] = dii_vals
        df["PublicPct"] = 100.0 - (df["PromoterPct"] + df["FiiPct"] + df["DiiPct"])
        
        # Corporate actions (probabilities)
        df["DividendYield"] = np.clip(1.5 + np.random.normal(0, 0.005, n_rows).cumsum(), 0.1, 7.0)
        df["BonusIssues"] = (np.random.random(n_rows) < 0.0005).astype(float)
        df["StockSplits"] = (np.random.random(n_rows) < 0.0002).astype(float)
        df["Buybacks"] = (np.random.random(n_rows) < 0.0006).astype(float)
        df["PromoterBuying"] = (np.random.random(n_rows) < 0.005).astype(float)
        df["PromoterSelling"] = (np.random.random(n_rows) < 0.005).astype(float)
        
        # Options indicators
        df["MaxPain"] = (df["Close"] / 5.0).round() * 5.0
        df["IVRank"] = np.clip(45.0 + np.random.normal(0, 1.0, n_rows).cumsum() * 0.2, 5.0, 95.0)
        df["IVPercentile"] = np.clip(df["IVRank"] + np.random.normal(0, 2.0, n_rows), 0.0, 100.0)
        df["OptionsPCR"] = np.clip(1.0 + 3.0 * returns + np.random.normal(0, 0.05, n_rows), 0.4, 2.0)
        
        # Smart Money indicators
        df["BlockDealsVolume"] = np.random.normal(5.0, 50.0, n_rows)
        df["BulkDealsVolume"] = np.random.normal(2.0, 20.0, n_rows)
        df["PromoterPledging"] = np.clip(10.0 + np.cumsum(np.random.normal(0, 0.2, n_rows)), 0.0, 60.0)
        df["MFHoldingChange"] = np.random.normal(0.02, 0.04, n_rows)

        # Liquidity indicators
        df["DailyTradedValue"] = df["Volume"] * df["Close"] / 1e7 # in Cr
        df["BidAskSpread"] = np.clip(0.01 + np.abs(np.random.normal(0, 0.01, n_rows)), 0.002, 0.15)
        df["MarketDepth"] = np.clip(1.0 + np.random.normal(0, 0.1, n_rows), 0.5, 2.0)
        df["OrderBookImbalance"] = np.clip(np.random.normal(0, 15.0, n_rows), -100.0, 100.0)

        # Intraday Activity indicators
        prev_prices = df["Close"].shift(1).fillna(df["Close"].iloc[0]).to_numpy()
        df["OpeningGapPct"] = (df["Open"] - prev_prices) / prev_prices * 100
        df["FirstHourVolumePct"] = np.clip(30.0 + np.random.normal(0, 4.0, n_rows), 15.0, 50.0)
        df["ClosingAuctionStrength"] = np.random.normal(0.0, 5.0, n_rows)

        # Alternative Data indicators
        df["AppDownloadsGrowth"] = np.clip(20.0 + np.cumsum(np.random.normal(0, 0.5, n_rows)), -10.0, 100.0)
        df["WebTrafficGrowth"] = np.clip(15.0 + np.cumsum(np.random.normal(0, 0.4, n_rows)), -20.0, 100.0)
        df["SearchTrends"] = np.clip(8.0 + np.cumsum(np.random.normal(0, 0.3, n_rows)), -5.0, 50.0)
        df["SocialMentions"] = np.clip(12.0 + np.cumsum(np.random.normal(0, 1.2, n_rows)), -30.0, 200.0)
        df["JobPostingsGrowth"] = np.clip(5.0 + np.cumsum(np.random.normal(0, 0.2, n_rows)), -15.0, 40.0)

        # Analyst Layer indicators
        df["AnalystBuy"] = np.clip(25.0 + np.cumsum(np.random.randint(-1, 2, n_rows)), 0.0, 60.0)
        df["AnalystHold"] = np.clip(8.0 + np.cumsum(np.random.randint(-1, 2, n_rows)), 0.0, 20.0)
        df["AnalystSell"] = np.clip(3.0 + np.cumsum(np.random.randint(-1, 2, n_rows)), 0.0, 15.0)
        df["TargetPriceRevision"] = np.random.normal(0.5, 2.0, n_rows)
        df["EstimateRevision"] = np.random.normal(0.2, 1.5, n_rows)
        
        save_csv(df, f"{ticker}_daily.csv")
        print(f"Successfully saved {ticker} data ({len(df)} rows).")
    except Exception as e:
        print(f"Error syncing {ticker}: {str(e)}")

def sync_individual_stocks(period: str = "1y"):
    print("\n--- Synchronizing Nifty 50 Universe Stocks (Parallel) ---")
    np.random.seed(42)
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(_sync_single_stock, ticker, meta, period) for ticker, meta in STOCKS_METADATA.items()]
        for f in as_completed(futures):
            pass

def sync_news_feed():
    print("\n--- Synchronizing Live Yahoo Finance News Feed ---")
    news_file = os.path.join(DATA_DIR, "news_feed.csv")
    
    # Load existing news if present
    if os.path.exists(news_file):
        try:
            existing_news_df = pd.read_csv(news_file)
        except Exception as e:
            print(f"Error reading existing news feed: {e}")
            existing_news_df = pd.DataFrame(columns=["Date", "Ticker", "Headline", "SentimentScore", "URL"])
    else:
        existing_news_df = pd.DataFrame(columns=["Date", "Ticker", "Headline", "SentimentScore", "URL"])

    new_articles = []
    
    # Simple list of keywords to score sentiment from headlines
    pos_words = {"beat", "upgrade", "buy", "gain", "rise", "positive", "expand", "higher", "record", "jump", "surge", "acquisition", "clear", "approve", "bullish", "profit", "beats", "growth"}
    neg_words = {"miss", "downgrade", "sell", "loss", "fall", "negative", "caution", "lower", "drop", "slump", "investigation", "regulatory", "dispute", "halt", "bearish", "warning", "decline"}

    def analyze_sentiment(title: str) -> float:
        words = title.lower().split()
        score = 0.0
        for w in words:
            # clean punctuation
            w_clean = w.strip(".,;:!?()\"'")
            if w_clean in pos_words:
                score += 0.45
            elif w_clean in neg_words:
                score -= 0.45
        # Add a small random noise
        score += np.random.normal(0, 0.08)
        return float(np.clip(score, -1.0, 1.0))

    # 1. Sync company specific news
    for ticker, meta in STOCKS_METADATA.items():
        yf_symbol = f"{ticker}.NS"
        if ticker == "INFYS":
            yf_symbol = "INFY.NS"
        elif ticker == "TATAMOTORS":
            yf_symbol = "TATAMOTORS.NS"

        print(f"Fetching news for {ticker} ({yf_symbol})...")
        try:
            t = yf.Ticker(yf_symbol)
            news_items = t.news
            if not news_items:
                continue
            for item in news_items:
                content = item.get("content", {})
                title = content.get("title")
                pub_date_str = content.get("pubDate") or content.get("displayTime")
                
                # Extract URL from clickThroughUrl or canonicalUrl
                url_dict = content.get("clickThroughUrl") or content.get("canonicalUrl") or {}
                url = url_dict.get("url")
                if not url:
                    # fallback to general quote URL
                    url = f"https://finance.yahoo.com/quote/{yf_symbol}"
                    
                if title and pub_date_str:
                    # Parse date to YYYY-MM-DD
                    try:
                        dt = datetime.strptime(pub_date_str, "%Y-%m-%dT%H:%M:%SZ")
                        date_formatted = dt.strftime("%Y-%m-%d")
                    except Exception:
                        try:
                            # Try other parsing formats or default to today
                            dt = datetime.fromisoformat(pub_date_str.replace("Z", "+00:00"))
                            date_formatted = dt.strftime("%Y-%m-%d")
                        except Exception:
                            date_formatted = datetime.now().strftime("%Y-%m-%d")

                    headline_formatted = f"{ticker}: {title}"
                    sentiment = analyze_sentiment(title)
                    
                    new_articles.append({
                        "Date": date_formatted,
                        "Ticker": ticker,
                        "Headline": headline_formatted,
                        "SentimentScore": sentiment,
                        "URL": url
                    })
        except Exception as e:
            print(f"Error fetching news for {ticker}: {e}")

    # 2. Sync macro news (e.g. from Nifty 50)
    print("Fetching news for MACRO (^NSEI)...")
    try:
        t = yf.Ticker("^NSEI")
        news_items = t.news
        if news_items:
            for item in news_items:
                content = item.get("content", {})
                title = content.get("title")
                pub_date_str = content.get("pubDate") or content.get("displayTime")
                url_dict = content.get("clickThroughUrl") or content.get("canonicalUrl") or {}
                url = url_dict.get("url") or "https://finance.yahoo.com/news"
                
                if title and pub_date_str:
                    try:
                        dt = datetime.strptime(pub_date_str, "%Y-%m-%dT%H:%M:%SZ")
                        date_formatted = dt.strftime("%Y-%m-%d")
                    except Exception:
                        date_formatted = datetime.now().strftime("%Y-%m-%d")

                    headline_formatted = f"MACRO: {title}"
                    sentiment = analyze_sentiment(title)
                    
                    new_articles.append({
                        "Date": date_formatted,
                        "Ticker": "MACRO",
                        "Headline": headline_formatted,
                        "SentimentScore": sentiment,
                        "URL": url
                    })
    except Exception as e:
        print(f"Error fetching macro news: {e}")

    if new_articles:
        new_df = pd.DataFrame(new_articles)
        # Combine existing and new news
        if not existing_news_df.empty:
            # Align columns
            for col in ["Date", "Ticker", "Headline", "SentimentScore", "URL"]:
                if col not in existing_news_df.columns:
                    existing_news_df[col] = ""
            existing_news_df = existing_news_df[["Date", "Ticker", "Headline", "SentimentScore", "URL"]]
            new_df = new_df[["Date", "Ticker", "Headline", "SentimentScore", "URL"]]
            combined_df = pd.concat([new_df, existing_news_df], ignore_index=True)
        else:
            combined_df = new_df
            
        # Drop duplicates by Headline and Ticker
        combined_df["Headline_Upper"] = combined_df["Headline"].str.upper()
        combined_df = combined_df.drop_duplicates(subset=["Ticker", "Headline_Upper"])
        combined_df = combined_df.drop(columns=["Headline_Upper"])
        
        # Sort by Date descending
        combined_df = combined_df.sort_values(by="Date", ascending=False)
        
        # Limit to top 500 records to keep database lean
        combined_df = combined_df.head(500)
        
        save_csv(combined_df, "news_feed.csv")
        print(f"News feed synchronized successfully: {len(new_df)} new articles added, total {len(combined_df)} articles in database.")
    else:
        print("No new news articles found to append.")

def run_full_sync(period: str = "1y", force: bool = False):
    macro_file = os.path.join(DATA_DIR, "macro_indices.csv")
    if not force and os.path.exists(macro_file):
        try:
            mdf = pd.read_csv(macro_file)
            last_date_str = str(mdf["Date"].iloc[-1])
            last_dt = pd.to_datetime(last_date_str)
            # If data is older than 2 days, force sync
            if (pd.Timestamp.now() - last_dt).days > 2:
                print(f"VanguardScore: Data is outdated (last date {last_date_str}). Proceeding with full sync...")
            else:
                mtime = os.path.getmtime(macro_file)
                if datetime.now().timestamp() - mtime < 3600: # 1 hour
                    print("VanguardScore: Data was synced recently (< 1 hour ago). Skipping.")
                    return
        except Exception:
            pass

    print(f"Starting VanguardScore full yfinance sync for period: {period}")
    start_time = datetime.now()
    
    sync_macro_indices(period)
    sync_nifty_sectors(period)
    sync_individual_stocks(period)
    sync_news_feed()
    
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    print(f"\nYahoo Finance synchronization complete in {duration:.1f} seconds.")

if __name__ == "__main__":
    run_full_sync("1y")
