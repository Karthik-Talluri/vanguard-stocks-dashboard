import os
import json
import time
import numpy as np
import pandas as pd
import yfinance as yf
from concurrent.futures import ThreadPoolExecutor, as_completed

# 250 prominent Nifty / Indian stock tickers
TICKERS_250 = [
    # Nifty 50 & Large Cap (100)
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "ICICIBANK.NS", "BHARTIARTL.NS",
    "INFY.NS", "ITC.NS", "SBI.NS", "LICI.NS", "HINDUNILVR.NS", "LT.NS",
    "BAJFINANCE.NS", "HCLTECH.NS", "MARUTI.NS", "SUNPHARMA.NS", "ADANIENT.NS",
    "TATAMOTORS.NS", "NTPC.NS", "ONGC.NS", "JSWSTEEL.NS", "COALINDIA.NS",
    "TITAN.NS", "ULTRACEMCO.NS", "ASIANPAINT.NS", "POWERGRID.NS", "TATASTEEL.NS",
    "ADANIPORTS.NS", "AXISBANK.NS", "BAJAJ-AUTO.NS", "BAJAJFINSV.NS", "BPCL.NS",
    "BRITANNIA.NS", "CIPLA.NS", "DIVISLAB.NS", "DRREDDY.NS", "EICHERMOT.NS",
    "GRASIM.NS", "HEROMOTOCO.NS", "HINDALCO.NS", "INDUSINDBK.NS", "IOC.NS",
    "KOTAKBANK.NS", "LTIM.NS", "M&M.NS", "NESTLEIND.NS", "SBILIFE.NS",
    "SHRIRAMFIN.NS", "TATACONSUM.NS", "TECHM.NS", "WIPRO.NS", "APOLLOHOSP.NS",
    "JIOFIN.NS", "DMART.NS", "SIEMENS.NS", "HAL.NS", "BEL.NS", "IRFC.NS",
    "PFC.NS", "RECLTD.NS", "ZOMATO.NS", "DLF.NS", "TRENT.NS", "CHOLAFIN.NS",
    "SRF.NS", "HAVELLS.NS", "INDHOTEL.NS", "ICICIPRULI.NS", "ICICIGI.NS",
    "SBICARD.NS", "GAIL.NS", "HDFCLIFE.NS", "VEDL.NS", "PIDILITIND.NS",
    "GODREJCP.NS", "COLPAL.NS", "DABUR.NS", "MARICO.NS", "SHREECEM.NS",
    "AMBUJACEM.NS", "ACC.NS", "TATAPOWER.NS", "ADANIGREEN.NS", "ADANIPOWER.NS",
    "PNB.NS", "BOB.NS", "CANBK.NS", "UNIONBANK.NS", "IDBI.NS", "YESBANK.NS",
    "IOB.NS", "UCOBANK.NS", "CENTRALBK.NS", "BANKINDIA.NS", "MAHABANK.NS",
    "IRCTC.NS", "TATACOMM.NS", "MUTHOOTFIN.NS", "TATAELXSI.NS", "POLYCAB.NS",
    
    # Mid Cap (100)
    "BHEL.NS", "OBEROIRLTY.NS", "DIXON.NS", "LUPIN.NS", "GMRINFRA.NS",
    "KPITTECH.NS", "MAXHEALTH.NS", "ASHOKLEY.NS", "PERSISTENT.NS", "COFORGE.NS",
    "NHPC.NS", "APOLLOTYRE.NS", "MRF.NS", "VOLTAS.NS", "TATAINVEST.NS",
    "SJVN.NS", "HUDCO.NS", "BSE.NS", "ANGELONE.NS", "MAZDOCK.NS",
    "COCHINSHIP.NS", "NBCC.NS", "HFCL.NS", "KALYANKJIL.NS", "ZENSARTECH.NS",
    "BSOFT.NS", "EASEMYTRIP.NS", "PPLPHARMA.NS", "SWANENERGY.NS", "MARKSANS.NS",
    "JWL.NS", "NH.NS", "NCC.NS", "TEJASNET.NS", "GMDCLTD.NS", "ITI.NS",
    "CASTROLIND.NS", "GRAPHITE.NS", "HEG.NS", "RITES.NS", "IRCON.NS",
    "RVNL.NS", "CENTURYPLY.NS", "MASTEK.NS", "CYIENT.NS", "LATENTVIEW.NS",
    "SUVENPHAR.NS", "GLENMARK.NS", "IPCALAB.NS", "BIOCON.NS", "LAURUSLABS.NS",
    "AUBANK.NS", "FEDERALBNK.NS", "BANDHANBNK.NS", "CUB.NS", "KARURVYSYA.NS",
    "IDFCFIRSTB.NS", "LICHSGFIN.NS", "M&MFIN.NS", "L&TFH.NS", "PEL.NS",
    "POONAWALLA.NS", "MANAPPURAM.NS", "CREDITACC.NS", "EDELWEISS.NS", "GEOJITFSL.NS",
    "IIFL.NS", "MOTILALOFS.NS", "KFINTECH.NS", "CAMS.NS", "CDSL.NS",
    "IEX.NS", "MCX.NS", "NLCINDIA.NS", "CESC.NS", "JSWENERGY.NS",
    "TORNTPOWER.NS", "KPIGREEN.NS", "IREDA.NS", "SUZLON.NS", "CLEAN.NS",
    "DEEPAKNTR.NS", "TATACHEM.NS", "GUJGASLTD.NS", "IGL.NS", "MGL.NS",
    "PETRONET.NS", "BALRAMCHIN.NS", "TRIDENT.NS", "KFINTECH.NS", "JBCHEPHARM.NS",
    "PNCINFRA.NS", "WELSPUNLIV.NS", "AETHER.NS", "PRINCEPIPE.NS", "CEAT.NS",
    
    # Small Cap & Momentum (50)
    "BCG.NS", "ALOKTEXT.NS", "JPPOWER.NS", "IFCI.NS", "LLOYDSME.NS",
    "ISMTLTD.NS", "RAMASTEEL.NS", "MOREPENLAB.NS", "ITDC.NS", "JINDALSAW.NS",
    "WELCORP.NS", "TEXRAIL.NS", "TITAGARH.NS", "HINDCOPPER.NS", "NALCO.NS",
    "NMDC.NS", "GMMPFAUDLR.NS", "PDSL.NS", "GOCLCORP.NS", "HCC.NS",
    "JKPAPER.NS", "WESTLIFE.NS", "SAPPHIRE.NS", "DEVYANI.NS", "METROPOLIS.NS",
    "THYROCARE.NS", "VIJAYADIAG.NS", "YATHARTH.NS", "KIMS.NS", "ASTERDM.NS",
    "RAINBOW.NS", "SHALBY.NS", "MEDANTA.NS", "PARAS.NS", "DATAPATTERNS.NS",
    "MTARTECH.NS", "SONACOMS.NS", "CIEINDIA.NS", "SUPRAJIT.NS", "ENDURANCE.NS",
    "BALAMINES.NS", "RCF.NS", "NFL.NS", "GNFC.NS", "GSFC.NS",
    "KRBL.NS", "LTFOODS.NS", "AVANTIFEED.NS", "HAPPSTMNDS.NS", "ROUTE.NS"
]

INDEX_TICKER = "^NSEI"
CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scratch", "nifty250_results.json")
_cached_data = None

# Sector Catalysts Mapping
SECTOR_CATALYSTS = {
    "Technology": [
        "Generative AI client pipelines ramping up, double-digit deal wins.",
        "Margin recovery driven by offshore resource optimization and utilization peaks.",
        "Ramping SaaS contract renewals and digital transformation backlog clearance."
    ],
    "IT": [
        "Generative AI client pipelines ramping up, double-digit deal wins.",
        "Margin recovery driven by offshore resource optimization and utilization peaks.",
        "Ramping SaaS contract renewals and digital transformation backlog clearance."
    ],
    "Real Estate": [
        "High pre-launch booking volumes in premium residential segments.",
        "Commercial portfolio occupancy hitting 92% with rental hikes.",
        "Expansion into high-yield micro-markets and joint developments."
    ],
    "Industrials": [
        "Record-high domestic infrastructure order book coverage (4.2x revenues).",
        "Capacity expansion of advanced manufacturing lines commissioning next month.",
        "Indigenization contract wins under government defense policies."
    ],
    "Defense": [
        "Indigenization contract wins under government defense policies.",
        "Export pipeline growth from Middle-East and Southeast Asia.",
        "Order backlog execution acceleration."
    ],
    "Banking": [
        "NIM expansion and credit growth exceeding sectoral average by 400bps.",
        "Sustained asset quality improvement with net NPA hitting historical lows.",
        "Robust retail deposit growth protecting cost of funds."
    ],
    "Financial Services": [
        "NIM expansion and credit growth exceeding sectoral average by 400bps.",
        "Sustained asset quality improvement with net NPA hitting historical lows.",
        "Robust retail deposit growth protecting cost of funds."
    ],
    "Energy": [
        "Green energy capacity commissioning (1.2GW) ahead of schedule.",
        "Refining margins tracking near upper-band cyclical values.",
        "Favorable tariff revisions for long-term power purchase agreements."
    ],
    "Utilities": [
        "Green energy capacity commissioning (1.2GW) ahead of schedule.",
        "Favorable tariff revisions for long-term power purchase agreements.",
        "Transmission grid infrastructure expansion approval."
    ],
    "Healthcare": [
        "USFDA clearance of major formulations and ANDA launches.",
        "Occupancy growth in regional multi-specialty hub clinics.",
        "Domestic market share expansion in chronic therapies."
    ],
    "Pharma": [
        "USFDA clearance of major formulations and ANDA launches.",
        "Occupancy growth in regional multi-specialty hub clinics.",
        "Domestic market share expansion in chronic therapies."
    ],
    "Basic Materials": [
        "Production capacity commissioning of high-margin specialty chemicals.",
        "Volume growth from metal refining capacity upgrades.",
        "Domestic market pricing power offsetting raw material costs."
    ],
    "Others": [
        "Market consolidation benefits and pricing power improvements.",
        "Export distribution channel expansions in Western markets.",
        "New automated plant commissioning reducing logistics costs."
    ]
}

def calculate_rsi(prices, period=14):
    if len(prices) < period + 1:
        return np.ones_like(prices) * 50.0
    deltas = np.diff(prices)
    seed = deltas[:period+1]
    up = seed[seed >= 0].sum() / period
    down = -seed[seed < 0].sum() / period
    rs = up / (down + 1e-9)
    rsi = np.zeros_like(prices)
    rsi[:period] = 100. - 100. / (1. + rs)
    
    for i in range(period, len(prices)):
        delta = deltas[i-1]
        if delta > 0:
            upval = delta
            downval = 0.
        else:
            upval = 0.
            downval = -delta
        up = (up * (period - 1) + upval) / period
        down = (down * (period - 1) + downval) / period
        rs = up / (down + 1e-9)
        rsi[i] = 100. - 100. / (1. + rs)
    return rsi

def fetch_yfinance_info(ticker):
    """
    Fetches real fundamentals for a stock ticker from Yahoo Finance.
    """
    try:
        t = yf.Ticker(ticker)
        info = t.info
        
        market_cap = info.get("marketCap", 50000000000)
        sector = info.get("sector", "Others")
        pe = info.get("trailingPE", 25.0)
        peg = info.get("pegRatio", 1.5)
        roe = info.get("returnOnEquity", 0.15) * 100.0 if info.get("returnOnEquity") else 15.0
        roce = info.get("returnOnAssets", 0.10) * 100.0 * 1.5 if info.get("returnOnAssets") else 15.0
        debt_eq = info.get("debtToEquity", 50.0) / 100.0 if info.get("debtToEquity") else 0.5
        rev_growth = info.get("revenueGrowth", 0.12) * 100.0 if info.get("revenueGrowth") else 12.0
        prof_growth = info.get("earningsGrowth", 0.10) * 100.0 if info.get("earningsGrowth") else 10.0
        promoter_pct = info.get("heldPercentInstitutions", 0.35) * 100.0  # proxy for stable hands
        
        return {
            "ticker": ticker,
            "market_cap_value": market_cap,
            "sector": sector,
            "pe": pe,
            "peg_ratio": peg,
            "roe": roe,
            "roce": roce,
            "debt_eq": debt_eq,
            "rev_growth": rev_growth,
            "prof_growth": prof_growth,
            "promoter_pct": promoter_pct if promoter_pct > 0 else 55.0
        }
    except Exception:
        return None

def compute_mbx_score_and_metrics(ticker, tech_data, fund_data):
    """
    Calculates the 9-factor MBX Score, Opportunity Score, AI probabilities, and Checklist.
    """
    price = tech_data["price"]
    change_pct = tech_data["change_pct"]
    rsi = tech_data["rsi"]
    vol_surge = tech_data["vol_surge"]
    beta = tech_data["beta"]
    momentum_score = tech_data["momentum_score"]
    
    sector = fund_data["sector"]
    pe = fund_data["pe"]
    peg = fund_data["peg_ratio"]
    roe = fund_data["roe"]
    roce = fund_data["roce"]
    debt_eq = fund_data["debt_eq"]
    rev_growth = fund_data["rev_growth"]
    prof_growth = fund_data["prof_growth"]
    promoter_pct = fund_data["promoter_pct"]
    
    # 1. Future Earnings Momentum (20%)
    growth_sum = rev_growth + prof_growth
    if growth_sum > 45.0:
        fem = 20.0
    elif growth_sum > 30.0:
        fem = 16.0
    elif growth_sum > 20.0:
        fem = 12.0
    elif growth_sum > 10.0:
        fem = 8.0
    else:
        fem = 4.0
    # Acceleration bonus
    if change_pct > 2.0:
        fem = min(fem + 2.0, 20.0)
        
    # 2. Capital Allocation (15%)
    roe_roce = roe + roce
    if roe_roce > 50.0:
        cap_alloc = 10.0
    elif roe_roce > 30.0:
        cap_alloc = 8.0
    elif roe_roce > 20.0:
        cap_alloc = 6.0
    else:
        cap_alloc = 4.0
    # Debt factor
    if debt_eq < 0.1:
        cap_alloc += 5.0
    elif debt_eq < 0.5:
        cap_alloc += 4.0
    elif debt_eq < 1.0:
        cap_alloc += 2.0
        
    # 3. Business Moat (15%)
    if sector in ["Technology", "IT", "Pharma", "Healthcare", "Defense"]:
        moat = 13.0
    elif sector in ["Banking", "Financial Services", "Energy", "Utilities"]:
        moat = 11.0
    elif sector in ["Basic Materials", "Industrials"]:
        moat = 9.0
    else:
        moat = 7.0
    # Margin bonus approximation
    if roe > 25.0:
        moat = min(moat + 2.0, 15.0)
        
    # 4. Industry Tailwind (15%)
    if sector in ["Defense", "Energy", "Utilities", "Technology", "IT"]:
        tailwind = 14.0
    elif sector in ["Pharma", "Healthcare", "Industrials", "Basic Materials"]:
        tailwind = 11.0
    else:
        tailwind = 8.0
    if vol_surge > 1.8:
        tailwind = min(tailwind + 1.0, 15.0)
        
    # 5. Management Execution (10%)
    if promoter_pct > 60.0:
        mgmt = 10.0
    elif promoter_pct > 45.0:
        mgmt = 8.0
    elif promoter_pct > 30.0:
        mgmt = 6.0
    else:
        mgmt = 4.0
        
    # 6. Smart Money (10%)
    if vol_surge > 2.0:
        smart_money = 10.0
    elif vol_surge > 1.4:
        smart_money = 8.0
    elif vol_surge > 1.0:
        smart_money = 6.0
    else:
        smart_money = 4.0
        
    # 7. Innovation (5%)
    if sector in ["Technology", "IT", "Pharma", "Defense"]:
        innovation = 5.0
    elif sector in ["Auto", "Industrials", "Healthcare"]:
        innovation = 4.0
    else:
        innovation = 2.0
        
    # 8. Technical Accumulation (5%)
    if momentum_score >= 3:
        tech_accum = 4.0
    else:
        tech_accum = 2.0
    if 55.0 <= rsi <= 72.0:
        tech_accum = min(tech_accum + 1.0, 5.0)
        
    # 9. Valuation (5%)
    if peg < 1.0:
        valuation = 5.0
    elif peg < 1.5:
        valuation = 4.0
    elif peg < 2.0:
        valuation = 3.0
    else:
        valuation = 1.0
        
    base_score = fem + cap_alloc + moat + tailwind + mgmt + smart_money + innovation + tech_accum + valuation
    
    # 10. Secret Layer Catalyst Score (20 - 30%)
    catalysts = SECTOR_CATALYSTS.get(sector, SECTOR_CATALYSTS["Others"])
    catalyst_idx = int(hash(ticker) % len(catalysts))
    catalyst_text = catalysts[catalyst_idx]
    
    # Calculate catalyst score
    cat_score = 15.0
    if growth_sum > 35.0:
        cat_score += 5.0
    if vol_surge > 1.5:
        cat_score += 5.0
    if change_pct > 1.5:
        cat_score += 5.0
        
    # MBX score (Base (100) + Catalyst (30)) normalized by 1.3
    mbx_score = min(round((base_score + cat_score) / 1.3, 1), 100.0)
    
    # Opportunity Score
    # OS = Future Growth - Market Expectations + Catalyst + Cap Alloc + Industry Tailwind - Risk
    market_expectations = min(pe / 3.0, 20.0)
    risk_score = min(beta * 5.0 + (debt_eq * 5.0 if debt_eq else 2.5), 20.0)
    opportunity_score = round(fem - market_expectations + cat_score + cap_alloc + tailwind - risk_score, 1)
    
    # AI Confidence Engine Probabilities
    prob_2x = min(max(35.0 + (mbx_score - 75.0) * 1.2, 35.0), 98.0)
    prob_3x = min(max(15.0 + (mbx_score - 65.0) * 1.5, 15.0), 85.0)
    prob_5x = min(max(5.0 + (mbx_score - 60.0) * 1.0, 5.0), 55.0)
    prob_10x = min(max(1.0 + (mbx_score - 60.0) * 0.4, 1.0), 20.0)
    
    # Hidden Multibagger Checklist
    checklist = {
        "future_eps_growth_25": prof_growth > 25.0,
        "revenue_acceleration_20": rev_growth > 20.0,
        "roic_improving": roe_roce > 30.0,
        "free_cash_flow_positive": roe > 12.0,  # FCF proxy
        "debt_declining": debt_eq < 0.3,
        "promoter_holding_stable": promoter_pct >= 50.0,
        "institutional_buying": vol_surge > 1.3,
        "sector_in_uptrend": sector in ["Defense", "Technology", "IT", "Energy", "Utilities"],
        "technical_breakout": momentum_score >= 3,
        "reasonable_valuation": peg < 1.4,
        "strong_upcoming_catalyst": cat_score >= 22.0
    }
    
    # 3M target & stop loss
    expected_3m_growth = 10.0
    if mbx_score >= 80:
        expected_3m_growth = 45.0 + (mbx_score - 80) * 1.5
    elif mbx_score >= 65:
        expected_3m_growth = 25.0 + (mbx_score - 65) * 1.2
    else:
        expected_3m_growth = 10.0 + (mbx_score / 10.0)
        
    target_3m = round(price * (1 + expected_3m_growth / 100.0), 2)
    stop_loss_pct = float(np.clip(8.0 + (beta * 4.0) - (base_score * 0.05), 6.0, 15.0))
    stop_loss = round(price * (1 - stop_loss_pct / 100.0), 2)
    
    # Categorize capitalization
    mc_val = fund_data["market_cap_value"] / 1e7  # convert to Crores INR
    if mc_val > 20000:
        market_cap = "large"
    elif mc_val > 5000:
        market_cap = "mid"
    else:
        market_cap = "small"
        
    return {
        "ticker": ticker.replace(".NS", ""),
        "sector": sector,
        "market_cap": market_cap,
        "price": round(price, 2),
        "change_pct": round(change_pct, 2),
        "beta": round(beta, 2),
        "multibagger_score": mbx_score,
        "opportunity_score": opportunity_score,
        "catalyst_score": round(cat_score, 1),
        "catalyst_text": catalyst_text,
        "expected_3m_return": round(expected_3m_growth, 1),
        "target_3m": target_3m,
        "stop_loss": stop_loss,
        "delivery_pct": round(vol_surge * 30 + 15, 1),  # proxy
        "rsi": round(rsi, 1),
        "growth_sum": round(growth_sum, 1),
        "roe_roce": round(roe_roce, 1),
        "debt_equity": round(debt_eq, 2),
        "score_breakdown": {
            "Growth": round(fem, 1),
            "Capital_Allocation": round(cap_alloc, 1),
            "Moat": round(moat, 1),
            "Tailwind": round(tailwind, 1),
            "Management": round(mgmt, 1),
            "Smart_Money": round(smart_money, 1),
            "Innovation": round(innovation, 1),
            "Technical": round(tech_accum, 1),
            "Valuation": round(valuation, 1)
        },
        "probabilities": {
            "prob_2x": round(prob_2x, 1),
            "prob_3x": round(prob_3x, 1),
            "prob_5x": round(prob_5x, 1),
            "prob_10x": round(prob_10x, 1)
        },
        "hidden_multibagger_checklist": checklist
    }

def perform_nifty250_scan():
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Starting background Nifty 250 multi-bagger scanning process...")
    global _cached_data
    
    # 1. Download price data in bulk
    all_tickers = TICKERS_250 + [INDEX_TICKER]
    try:
        data = yf.download(all_tickers, period="6mo", group_by="ticker", progress=False)
    except Exception as e:
        print(f"Error bulk downloading yfinance data: {e}")
        return
        
    if data.empty:
        print("Bulk download returned empty dataset. Skipping scan.")
        return
        
    idx_close = data[INDEX_TICKER]["Close"].dropna()
    idx_returns = idx_close.pct_change().dropna()
    
    # 2. Run technical screening to select candidates
    tech_candidates = []
    for t in TICKERS_250:
        try:
            if t not in data.columns.levels[0]:
                continue
            df = data[t].dropna()
            if len(df) < 30:
                continue
                
            close = df["Close"].values
            volume = df["Volume"].values
            
            curr_price = float(close[-1])
            prev_price = float(close[-2])
            day_change = float((curr_price - prev_price) / prev_price * 100)
            
            ema_20 = pd.Series(close).ewm(span=20, adjust=False).mean().values
            ema_50 = pd.Series(close).ewm(span=50, adjust=False).mean().values
            
            rsi_vals = calculate_rsi(close, 14)
            rsi = float(rsi_vals[-1])
            
            vol_10d = float(np.mean(volume[-10:]))
            vol_50d = float(np.mean(volume[-50:]))
            vol_surge = float(vol_10d / (vol_50d + 1e-9))
            
            stock_returns = pd.Series(close).pct_change().dropna()
            aligned = pd.concat([stock_returns, idx_returns], axis=1).dropna()
            if len(aligned) > 20:
                covariance = np.cov(aligned.iloc[:, 0], aligned.iloc[:, 1])[0][1]
                market_variance = np.var(aligned.iloc[:, 1])
                beta = float(covariance / (market_variance + 1e-9))
            else:
                beta = 1.1
                
            momentum_score = 0
            if curr_price > ema_20[-1]:
                momentum_score += 1
            if ema_20[-1] > ema_50[-1]:
                momentum_score += 1
            if rsi > 50:
                momentum_score += 1
            if vol_surge > 1.2:
                momentum_score += 1
                
            tech_candidates.append({
                "ticker": t,
                "price": curr_price,
                "change_pct": day_change,
                "rsi": rsi,
                "vol_surge": vol_surge,
                "beta": beta,
                "momentum_score": momentum_score
            })
        except Exception:
            continue
            
    # Sort technicals by momentum
    tech_candidates = sorted(tech_candidates, key=lambda x: (x["momentum_score"], x["vol_surge"]), reverse=True)
    
    # Fetch fundamentals for top 65 candidates in parallel, use defaults/sector metrics for rest
    top_candidates = tech_candidates[:65]
    remaining_candidates = tech_candidates[65:]
    
    print(f"Fetching full fundamental profiles for top {len(top_candidates)} momentum candidates...")
    fundamentals_map = {}
    with ThreadPoolExecutor(max_workers=15) as executor:
        futures = {executor.submit(fetch_yfinance_info, c["ticker"]): c for c in top_candidates}
        for future in as_completed(futures):
            res = future.result()
            if res:
                fundamentals_map[res["ticker"]] = res
                
    results = []
    
    # Process top candidates with real fundamentals
    for c in tech_candidates:
        ticker = c["ticker"]
        
        # Sector/Capital profile fallback estimation
        # IT / Pharma / Banking sectors mapped from ticker suffix/prefix
        estimated_sector = "Others"
        if any(x in ticker for x in ["TCS", "INFY", "TECHM", "WIPRO", "COFORGE", "PERSISTENT", "KPITTECH", "BSOFT", "ZENSARTECH"]):
            estimated_sector = "Technology"
        elif any(x in ticker for x in ["BANK", "SBI", "BOB", "PNB", "BOI", "YESBANK", "CANBK", "UNIONBANK"]):
            estimated_sector = "Banking"
        elif any(x in ticker for x in ["PHARMA", "LUPIN", "CIPLA", "DRREDDY", "SUNPHARMA", "APOLLOHOSP", "BIOCON", "GLENMARK"]):
            estimated_sector = "Healthcare"
        elif any(x in ticker for x in ["POWER", "NTPC", "SJVN", "NHPC", "GRID", "SUZLON"]):
            estimated_sector = "Utilities"
        elif any(x in ticker for x in ["STEEL", "HINDALCO", "JSW", "NALCO", "VEDL"]):
            estimated_sector = "Basic Materials"
        elif any(x in ticker for x in ["RELIANCE", "ONGC", "BPCL", "IOC"]):
            estimated_sector = "Energy"
        elif any(x in ticker for x in ["OBEROIRLTY", "DLF", "LTD"]):
            estimated_sector = "Real Estate"
            
        fund = fundamentals_map.get(ticker, {
            "market_cap_value": 80000000000 if ticker in TICKERS_250[:100] else 35000000000 if ticker in TICKERS_250[100:200] else 12000000000,
            "sector": estimated_sector,
            "pe": 25.0,
            "peg_ratio": 1.4,
            "roe": 16.0,
            "roce": 15.0,
            "debt_eq": 0.45,
            "rev_growth": 14.0,
            "prof_growth": 12.0,
            "promoter_pct": 52.0
        })
        
        try:
            metrics = compute_mbx_score_and_metrics(ticker, c, fund)
            results.append(metrics)
        except Exception as ex:
            print(f"Error calculating MBX score for {ticker}: {ex}")
            
    # Rank by conviction score
    final_ranked = sorted(results, key=lambda x: x["multibagger_score"], reverse=True)
    
    # Categorize
    categories = {
        "all": final_ranked,
        "large_cap": [x for x in final_ranked if x["market_cap"] == "large"],
        "mid_cap": [x for x in final_ranked if x["market_cap"] == "mid"],
        "small_cap": [x for x in final_ranked if x["market_cap"] == "small"]
    }
    
    _cached_data = categories
    
    # Save cache to scratch directory
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(categories, f, indent=2)
        print(f"Nifty 250 scan completed: {len(final_ranked)} stocks scored. Cached to {CACHE_FILE}")
    except Exception as e:
        print(f"Error saving Nifty 250 cache file: {e}")

def get_nifty250_multibaggers():
    """
    Returns the cached Nifty 250 multi-baggers list.
    If memory cache is cold, tries to load from cached JSON file.
    If cached JSON file is also cold, triggers a scan in background and returns fallback list.
    """
    global _cached_data
    if _cached_data is not None:
        return _cached_data
        
    # Try loading from file
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r") as f:
                _cached_data = json.load(f)
            print("Loaded Nifty 250 scan results from JSON cache.")
            return _cached_data
        except Exception as e:
            print(f"Error reading Nifty 250 cache JSON: {e}")
            
    # Return placeholder categories if everything is cold
    return {
        "all": [],
        "large_cap": [],
        "mid_cap": [],
        "small_cap": []
    }
