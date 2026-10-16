'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_RATES, type Rates } from '@/lib/billing';

// Current rates from /api/rates for display; DEFAULT_RATES only while loading or on failure
export function useRates(): Rates {
  const [rates, setRates] = useState<Rates>(DEFAULT_RATES);
  useEffect(() => {
    fetch('/api/rates')
      .then((res) => res.json())
      .then((data) => { if (data.success) setRates(data.data); })
      .catch(() => {});
  }, []);
  return rates;
}
