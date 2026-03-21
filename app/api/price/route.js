import { NextResponse } from 'next/server'

const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'

/**
 * GET /api/price?ticker=AAPL
 * Restituisce { ticker, price } dal chart Yahoo Finance.
 */
export async function GET(request) {
  let ticker
  try {
    const { searchParams } = new URL(request.url)
    ticker = searchParams.get('ticker')?.trim()

    if (!ticker) {
      return NextResponse.json(
        { error: 'Parametro "ticker" obbligatorio (es. ?ticker=AAPL)' },
        { status: 400 }
      )
    }

    // Yahoo spesso risponde 403 senza User-Agent da browser
    const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(ticker)}`
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      return NextResponse.json(
        {
          error: 'Risposta non valida da Yahoo Finance',
          status: res.status,
          ticker,
        },
        { status: res.status >= 500 ? 502 : res.status }
      )
    }

    let data
    try {
      data = await res.json()
    } catch {
      return NextResponse.json(
        { error: 'Impossibile analizzare la risposta JSON', ticker },
        { status: 502 }
      )
    }

    const chartError = data?.chart?.error
    if (chartError) {
      return NextResponse.json(
        {
          error: chartError.description || chartError.code || 'Errore chart Yahoo',
          ticker,
        },
        { status: 404 }
      )
    }

    const result = data?.chart?.result?.[0]
    if (!result?.meta) {
      return NextResponse.json(
        { error: 'Nessun dato disponibile per questo ticker', ticker },
        { status: 404 }
      )
    }

    const meta = result.meta
    const price =
      meta.regularMarketPrice ??
      meta.postMarketPrice ??
      meta.preMarketPrice ??
      meta.previousClose ??
      null

    if (price == null || Number.isNaN(Number(price))) {
      return NextResponse.json(
        { error: 'Prezzo non disponibile nella risposta', ticker },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ticker: meta.symbol || ticker.toUpperCase(),
      price: Number(price),
    })
  } catch (err) {
    console.error('[api/price]', err)
    return NextResponse.json(
      {
        error: err?.message || 'Errore interno durante il recupero del prezzo',
        ...(ticker ? { ticker } : {}),
      },
      { status: 500 }
    )
  }
}
